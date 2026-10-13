import type {DatabaseSync} from "node:sqlite";
import {randomUUID} from "node:crypto";
import type {PokieGame} from "../../gamepackage/PokieGame.js";
import {validateRepositoryCommand, type RepositoryCommand} from "../../runtime/RepositoryCommand.js";
import {validateSessionCommand} from "../../runtime/SessionCommand.js";
import {validatePersistedSession} from "../../runtime/validatePersistedSession.js";
import {validateRetryResult} from "../../runtime/internal/validateRecoveryData.js";
import {RuntimeCommandError} from "../../runtime/RuntimeCommandError.js";
import type {PokieSessionState} from "../session/PokieSessionState.js";
import type {VersionedSessionState} from "../session/VersionedSessionRepository.js";
import type {SpinCommandResult} from "../spin/SpinCommandResult.js";
import {isDurableWalletPort, type DurableWalletPort, type DurableWalletTransaction} from "../wallet/DurableWalletPort.js";
import {WalletInsufficientFundsError} from "../wallet/WalletInsufficientFundsError.js";
import type {ExternalRoundCandidate, ExternalRoundPreparation, ExternalRoundStore} from "./ExternalRoundStore.js";

type Played = Extract<SpinCommandResult, {status: "played"}>;
type Intent = {
    command: RepositoryCommand; snapshot: VersionedSessionState; balance?: number; candidate?: Played;
    debitId: string; payoutId: string; debit?: number; payout?: number;
    phase: "prepare" | "debit" | "payout" | "commit";
};
const SCHEMA = [
    "CREATE TABLE external_sessions (id TEXT PRIMARY KEY, state TEXT NOT NULL, version INTEGER NOT NULL, pending TEXT)",
    "CREATE TABLE external_requests (session_id TEXT NOT NULL, request_id TEXT NOT NULL, envelope TEXT NOT NULL, intent TEXT NOT NULL, result TEXT, owner TEXT, expires REAL NOT NULL, PRIMARY KEY(session_id, request_id))",
];

/** SQLite WAL/FULL outbox. Remote actions occur AFTER durable intent commits. A renewable execution
 * is fenced by an owner token; expired owners can never publish. Stable provider IDs make overlapping
 * late calls safe. A pending session cannot admit a different round. Requires optional node:sqlite.
 */
export class SqliteExternalRoundStore implements ExternalRoundStore {
    public readonly externalSettlement = true as const;
    public readonly capabilities = {durableIntent: true, durableResults: true, sessionFencing: true} as const;
    private tail: Promise<unknown> = Promise.resolve();
    private closing = false;
    private closePromise?: Promise<void>;
    private readonly database: DatabaseSync;
    private readonly wallet: DurableWalletPort;
    private readonly timeoutMs: number;
    private readonly recoveryWaitMs: number;
    private constructor(database: DatabaseSync, wallet: DurableWalletPort, timeoutMs: number, recoveryWaitMs: number) {
        this.database = database;
        this.wallet = wallet;
        this.timeoutMs = timeoutMs;
        this.recoveryWaitMs = recoveryWaitMs;
    }

    public static async open(filename: string, wallet: DurableWalletPort, options: {callTimeoutMs?: number; recoveryWaitMs?: number} = {}): Promise<SqliteExternalRoundStore> {
        if (!isDurableWalletPort(wallet)) throw new Error("External reconciliation requires explicit durable wallet capabilities and authoritative inspection; select the weaker independent-port compensation path otherwise.");
        const timeout = options.callTimeoutMs ?? 2000,
            wait = options.recoveryWaitMs ?? 5000;
        if (![timeout, wait].every(value => Number.isSafeInteger(value) && value > 0 && value <= 60000)) throw new Error("External recovery budgets must be integers in 1..60000 ms.");
        let sqlite: typeof import("node:sqlite");
        try {
            sqlite = await import("node:sqlite");
        } catch {
            throw new Error("External durable storage requires Node with node:sqlite support; no memory fallback is provided.");
        }
        const database = new sqlite.DatabaseSync(filename);
        try {
            if (typeof database.isTransaction !== "boolean") throw new Error("External intent storage requires transaction-state inspection (Node >=22.16).");
            database.exec("PRAGMA busy_timeout=0; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
            if (database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().length === 0) {
                database.exec("BEGIN IMMEDIATE");
                for (const sql of SCHEMA) database.exec(sql);
                database.exec("PRAGMA user_version=1; PRAGMA application_id=1347373893; COMMIT");
            }
            const tables = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' ORDER BY name").all().map(row => row.sql).sort();
            if (JSON.stringify(tables) !== JSON.stringify([...SCHEMA].sort()) ||
                database.prepare("PRAGMA user_version").get()?.user_version !== 1 || database.prepare("PRAGMA application_id").get()?.application_id !== 1347373893 ||
                database.prepare("PRAGMA journal_mode").get()?.journal_mode !== "wal" || database.prepare("PRAGMA synchronous").get()?.synchronous !== 2) throw new Error("Incompatible external intent database or durability settings.");
            return new SqliteExternalRoundStore(database, wallet, timeout, wait);
        } catch (error) {
            database.close();
            throw error;
        }
    }

    public initialize(sessionId: string, state: PokieSessionState, game: PokieGame): Promise<void> {
        return this.enqueue(async () => {
            const invalid = validateRepositoryCommand({sessionId}) ?? validatePersistedSession(state, game)?.reason;
            if (invalid || state.executionState !== "durably-restorable") throw new Error(invalid ?? "External rounds require durable executable state.");
            const data = encode(state);
            await this.write(() => {
                this.database.prepare("INSERT INTO external_sessions VALUES (?, ?, 1, NULL)").run(sessionId, data);
            });
        });
    }
    public readSession(sessionId: string): Promise<VersionedSessionState | undefined> {
        return this.enqueue(() => Promise.resolve(this.read(sessionId)));
    }
    public getBalance(sessionId: string): Promise<number> {
        return this.enqueue(() => this.bounded(signal => this.wallet.getBalance(sessionId, signal), undefined));
    }
    public lookupResult(sessionId: string, requestId: string): Promise<SpinCommandResult | undefined> {
        return this.enqueue(() => Promise.resolve(this.saved(sessionId, requestId)));
    }
    public pendingCommands(): Promise<readonly RepositoryCommand[]> {
        return this.enqueue(() => Promise.resolve(this.database.prepare("SELECT intent FROM external_requests WHERE result IS NULL").all().map(row => decode<Intent>(row.intent).command)));
    }
    public execute(command: RepositoryCommand, game: PokieGame, prepare: (snapshot: ExternalRoundPreparation) => Promise<ExternalRoundCandidate>, signal?: AbortSignal): Promise<SpinCommandResult> {
        const invalid = validateRepositoryCommand(command) ?? validateSessionCommand(command);
        if (invalid || command.requestId === undefined) return Promise.resolve({status: "invalid-command", sessionId: command?.sessionId ?? "", reason: invalid ?? "Durable external rounds require a stable requestId."});
        const frozen = {...command};
        return this.enqueue(() => this.run(frozen, game, prepare, signal));
    }
    public close(): Promise<void> {
        if (!this.closePromise) {
            this.closing = true;
            this.closePromise = this.tail.then(() => {
                this.database.close();
            });
        }
        return this.closePromise;
    }

    private async run(command: RepositoryCommand, game: PokieGame, prepare: (snapshot: ExternalRoundPreparation) => Promise<ExternalRoundCandidate>, signal?: AbortSignal): Promise<SpinCommandResult> {
        const sessionId = command.sessionId,
            requestId = command.requestId!,
            owner = randomUUID();
        const envelope = encode([sessionId, requestId, command.kind, command.bet ?? null, command.mode ?? null, command.expectedVersion ?? null]);
        const unresolved = (reason: string): SpinCommandResult => ({status: "recovery-required", sessionId, requestId, reason});
        const deadline = Date.now() + this.recoveryWaitMs;
        let intent: Intent | undefined;
        for (;;) {
            let outcome: SpinCommandResult | undefined;
            let busy = false;
            await this.write(() => {
                const existing = this.row(sessionId, requestId);
                if (existing && existing.envelope !== envelope) {
                    outcome = {status: "identity-conflict", sessionId, reason: "Restore the original command identity and payload; do not mint a new charge key."};
                    return;
                }
                if (existing?.result !== null && existing?.result !== undefined) {
                    outcome = this.saved(sessionId, requestId)!;
                    const rejected = outcome.status === "played" ? validateRetryResult(outcome, game, sessionId, requestId) : undefined;
                    if (rejected) outcome = {...rejected, sessionId};
                    return;
                }
                const session = this.read(sessionId);
                if (!session) {
                    outcome = {status: "not-found", sessionId};
                    return;
                }
                const invalid = validatePersistedSession(session.state, game);
                if (invalid) {
                    outcome = {...invalid, sessionId};
                    return;
                }
                if (session.state.executionState !== "durably-restorable") {
                    outcome = {status: "restoration-unsupported", sessionId, reason: "External rounds require complete executable state."};
                    return;
                }
                const pending = this.database.prepare("SELECT pending FROM external_sessions WHERE id=?").get(sessionId)!.pending;
                if (pending !== null && pending !== requestId) {
                    const pendingOwner = this.row(sessionId, String(pending));
                    if (pendingOwner?.owner !== null && pendingOwner?.owner !== undefined && Number(pendingOwner.expires) > Date.now()) busy = true;
                    else outcome = unresolved("Another round owns this session; recover its original identity before advancing.");
                    return;
                }
                if (existing && existing.owner !== null && Number(existing.expires) > Date.now()) {
                    busy = true;
                    return;
                }
                if (!existing && command.expectedVersion !== undefined && command.expectedVersion !== session.version) {
                    outcome = {status: "conflict", sessionId, reason: "Session revision does not match expectedVersion."};
                    return;
                }
                intent = existing ? decode<Intent>(existing.intent) : {command, snapshot: session, debitId: `${sessionId}:${randomUUID()}:debit`, payoutId: `${sessionId}:${randomUUID()}:credit`, phase: "prepare"};
                this.database.prepare("INSERT INTO external_requests VALUES (?, ?, ?, ?, NULL, ?, ?) ON CONFLICT(session_id, request_id) DO UPDATE SET owner=excluded.owner, expires=excluded.expires")
                    .run(sessionId, requestId, envelope, encode(intent), owner, Date.now() + this.timeoutMs * 8 + this.recoveryWaitMs);
                this.database.prepare("UPDATE external_sessions SET pending=? WHERE id=?").run(requestId, sessionId);
            });
            if (outcome) return outcome;
            if (!busy) break;
            if (signal?.aborted || Date.now() >= deadline) return unresolved("Live owner still holds the original round; bounded waiting exhausted.");
            await delay(10);
        }
        let current = intent!;
        const retainedSession = this.read(sessionId);
        if (!current || !current.command || !current.snapshot || !["prepare", "debit", "payout", "commit"].includes(current.phase) ||
            typeof current.debitId !== "string" || !current.debitId || typeof current.payoutId !== "string" || !current.payoutId || current.debitId === current.payoutId ||
            !Number.isSafeInteger(current.snapshot.version) || current.snapshot.version < 1 || validatePersistedSession(current.snapshot.state, game) ||
            retainedSession?.version !== current.snapshot.version || encode(retainedSession.state) !== encode(current.snapshot.state) ||
            encode([current.command.sessionId, current.command.requestId, current.command.kind, current.command.bet ?? null, current.command.mode ?? null, current.command.expectedVersion ?? null]) !== envelope) {
            await this.write(() => {
                this.database.prepare("UPDATE external_requests SET owner=NULL, expires=0 WHERE session_id=? AND request_id=? AND owner=?").run(sessionId, requestId, owner);
            });
            return unresolved("Corrupt retained intent; settlement blocked.");
        }
        const persist = async (): Promise<void> => {
            await this.write(() => {
                this.assertOwner(sessionId, requestId, owner);
                this.database.prepare("UPDATE external_requests SET intent=?, expires=? WHERE session_id=? AND request_id=?").run(encode(current), Date.now() + this.timeoutMs * 8 + this.recoveryWaitMs, sessionId, requestId);
            });
        };
        const finish = async (result: SpinCommandResult): Promise<SpinCommandResult> => {
            const data = encode(result);
            await this.write(() => {
                this.assertOwner(sessionId, requestId, owner);
                if (result.status === "played") {
                    const latest = this.read(sessionId)!;
                    if (latest.version !== current.snapshot.version || encode(latest.state) !== encode(current.snapshot.state)) throw new Error("Pending session changed during external settlement.");
                    this.database.prepare("UPDATE external_sessions SET state=?, version=?, pending=NULL WHERE id=?").run(encode(result.state), result.version!, sessionId);
                } else this.database.prepare("UPDATE external_sessions SET pending=NULL WHERE id=?").run(sessionId);
                this.database.prepare("UPDATE external_requests SET result=?, owner=NULL, expires=0 WHERE session_id=? AND request_id=?").run(data, sessionId, requestId);
            });
            return decode<SpinCommandResult>(data);
        };
        try {
            if (current.phase === "prepare") {
                if (signal?.aborted) return unresolved("Cancelled before remote dispatch; original identity retained.");
                const balance = current.balance ?? await this.bounded(abort => this.wallet.getBalance(sessionId, abort), signal);
                current = {...current, balance};
                if (!Number.isFinite(balance) || balance < 0) throw new Error("Invalid external balance.");
                const prepared = await prepare({...current.snapshot, balance});
                const candidate = prepared.result;
                if (candidate.status !== "played") return await finish(candidate);
                const invalid = validateRetryResult(candidate, game, sessionId, requestId);
                if (invalid) return await finish({...invalid, sessionId});
                const debit = candidate.stake!,
                    payout = candidate.credits - (balance - debit);
                current = {...current, candidate, debit, payout};
                if (![debit, payout].every(value => Number.isFinite(value) && value >= 0) || candidate.version !== current.snapshot.version + 1) throw new Error("Invalid calculated external accounting envelope.");
                current.phase = "debit";
                await persist(); // Candidate, RNG continuation, both identities and debit intent BEFORE any effect.
            }
            const candidate = current.candidate!;
            const rejected = validateRetryResult(candidate, game, sessionId, requestId);
            if (rejected || candidate.state.executionState !== "durably-restorable" || !Number.isFinite(current.debit) || current.debit! < 0 || !Number.isFinite(current.payout) || current.payout! < 0 ||
                current.debit !== candidate.stake || candidate.credits !== current.balance! - current.debit! + current.payout! || candidate.version !== current.snapshot.version + 1 ||
                encode(candidate.previousState) !== encode(current.snapshot.state)) return unresolved("Corrupt captured accounting/continuation; settlement blocked.");
            for (const phase of ["debit", "payout"] as const) {
                const dispatchAllowed = current.phase === phase;
                const alreadyAcknowledged = current.phase === "commit" || (current.phase === "payout" && phase === "debit");
                if (!dispatchAllowed && !alreadyAcknowledged) continue;
                const id = phase === "debit" ? current.debitId : current.payoutId;
                const kind = phase === "debit" ? "debit" : "credit";
                const amount = phase === "debit" ? current.debit! : current.payout!;
                let inspected: DurableWalletTransaction;
                try {
                    inspected = await this.bounded(abort => this.wallet.inspectTransaction(sessionId, id, abort), signal);
                } catch {
                    return unresolved("Inspection unavailable or timed out; intent retained.");
                }
                if (!inspected || !["unknown", "pending", "not-applied", "compensated", "committed"].includes(inspected.status)) return unresolved("Malformed inspection; intent retained.");
                if (inspected.status === "unknown" || inspected.status === "pending" || inspected.status === "compensated") return unresolved(`${inspected.status}: original transaction remains unresolved.`);
                const expectedBalance = phase === "debit" ? current.balance! - amount : candidate.credits;
                if (inspected.status === "committed") {
                    if (inspected.kind !== kind || inspected.amount !== amount || inspected.balance !== expectedBalance) return unresolved("Provider committed accounting differs from captured intent.");
                } else {
                    if (alreadyAcknowledged) return unresolved("Provider lost an acknowledged transaction; settlement blocked.");
                    // The phase itself is durable dispatch intent. A reject/timeout NEVER clears it.
                    const balance = await this.bounded(abort => this.wallet[kind](sessionId, id, amount, abort), signal);
                    if (balance !== expectedBalance) return unresolved("Provider returned inconsistent historical balance.");
                }
                if (dispatchAllowed) {
                    current = {...current, phase: phase === "debit" ? "payout" : "commit"};
                    await persist();
                }
            }
            return await finish(candidate);
        } catch (error) {
            if (error instanceof RuntimeCommandError && error.code === "storage-error") throw error;
            if (current.phase === "prepare") {
                const failure = error instanceof RuntimeCommandError ? error : new RuntimeCommandError(current.balance === undefined ? "settlement-error" : "execution-error", error);
                await finish({status: failure.code, sessionId, reason: failure.message});
                throw failure;
            }
            if (current.phase === "debit" && error instanceof WalletInsufficientFundsError) {
                try {
                    const status = await this.bounded(abort => this.wallet.inspectTransaction(sessionId, current.debitId, abort), signal);
                    if (status?.status === "not-applied") {
                        await finish({status: "settlement-error", sessionId, reason: error.message});
                        throw new RuntimeCommandError("settlement-error", error);
                    }
                } catch (failure) {
                    if (failure instanceof RuntimeCommandError) throw failure;
                    // Ambiguity retains the original intent.
                }
            }
            return unresolved(`External action/calculation interrupted: ${error instanceof Error ? error.message : String(error)}. Inspect and retry the same identity.`);
        } finally {
            await this.write(() => {
                this.database.prepare("UPDATE external_requests SET owner=NULL, expires=0 WHERE session_id=? AND request_id=? AND owner=?").run(sessionId, requestId, owner);
            });
        }
    }

    private row(sessionId: string, requestId: string): Record<string, unknown> | undefined {
        return this.database.prepare("SELECT * FROM external_requests WHERE session_id=? AND request_id=?").get(sessionId, requestId);
    }
    private saved(sessionId: string, requestId: string): SpinCommandResult | undefined {
        const row = this.row(sessionId, requestId);
        if (!row || row.result === null) return undefined;
        const result = decode<SpinCommandResult>(row.result);
        if (!result || result.sessionId !== sessionId) throw new Error("Corrupt retained external response identity.");
        if (result.status === "played" && (result.requestId !== requestId || !Number.isSafeInteger(result.version) || result.version! < 2 ||
            !result.state || !result.previousState || result.state.credits !== result.credits || result.state.win !== result.win ||
            ![result.credits, result.win, result.stake].every(value => typeof value === "number" && Number.isFinite(value) && value >= 0))) throw new Error("Corrupt retained external accounting result.");
        return result;
    }
    private read(sessionId: string): VersionedSessionState | undefined {
        const row = this.database.prepare("SELECT state, version FROM external_sessions WHERE id=?").get(sessionId);
        if (!row) return undefined;
        const version = Number(row.version);
        if (!Number.isSafeInteger(version) || version < 1) throw new Error("Corrupt external session revision.");
        return {state: decode<PokieSessionState>(row.state), version};
    }
    private assertOwner(sessionId: string, requestId: string, owner: string): void {
        const row = this.row(sessionId, requestId);
        if (row?.owner !== owner || Number(row.expires) <= Date.now()) throw new Error("External round ownership expired; late owner is fenced.");
    }
    private enqueue<T>(work: () => Promise<T>): Promise<T> {
        if (this.closing) return Promise.reject(new Error("External round store is closing/closed."));
        const result = this.tail.then(work);
        this.tail = result.catch(() => undefined);
        return result;
    }
    private async write(work: () => void): Promise<void> {
        const deadline = Date.now() + this.recoveryWaitMs;
        for (;;) {
            try {
                this.database.exec("BEGIN IMMEDIATE");
                break;
            } catch (error) {
                if (!(typeof error === "object" && error !== null && "errcode" in error && (error.errcode === 5 || error.errcode === 6)) || Date.now() >= deadline) throw new RuntimeCommandError("storage-error", error);
                await delay(10);
            }
        }
        try {
            work();
            this.database.exec("COMMIT");
        } catch (error) {
            if (this.database.isTransaction) this.database.exec("ROLLBACK");
            throw new RuntimeCommandError("storage-error", error);
        }
    }
    private async bounded<T>(work: (signal: AbortSignal) => Promise<T>, signal: AbortSignal | undefined): Promise<T> {
        if (signal?.aborted) throw new Error("Cancelled before dispatch.");
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        let cancel!: () => void;
        const interrupted = new Promise<never>((_resolve, reject) => {
            cancel = () => {
                controller.abort();
                reject(new Error("External call cancelled/timed out; remote effect remains possible."));
            };
            timer = setTimeout(cancel, this.timeoutMs);
            signal?.addEventListener("abort", cancel, {once: true});
        });
        try {
            return await Promise.race([work(controller.signal), interrupted]);
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener("abort", cancel);
        }
    }
}
function delay(ms: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}
function decode<T>(value: unknown): T {
    return JSON.parse(String(value)) as T;
}
function encode(value: unknown): string {
    return JSON.stringify(value, function(key, item: unknown) {
        if (item === undefined && !Array.isArray(this)) return undefined;
        if (item === undefined || typeof item === "function" || typeof item === "symbol" || typeof item === "bigint" || (typeof item === "number" && !Number.isFinite(item))) throw new Error(`Nonserializable external intent at ${key}.`);
        return item;
    });
}
