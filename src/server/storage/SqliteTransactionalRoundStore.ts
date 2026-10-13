import {validateSavedStageDelivery} from "../../runtime/internal/validateSavedStageDelivery.js";
import {commandEnvelope} from "../../runtime/commandEnvelope.js";
import {SessionStateCorruptError} from "../session/FileSessionRepository.js";
import type {DatabaseSync} from "node:sqlite";
import {randomUUID} from "node:crypto";
import type {PokieGame} from "../../gamepackage/PokieGame.js";
import {validateRepositoryCommand, type RepositoryCommand} from "../../runtime/RepositoryCommand.js";
import {validateSessionCommand} from "../../runtime/SessionCommand.js";
import {RuntimeCommandError} from "../../runtime/RuntimeCommandError.js";
import {validatePersistedSession} from "../../runtime/validatePersistedSession.js";
import type {PokieSessionState} from "../session/PokieSessionState.js";
import type {VersionedSessionState} from "../session/VersionedSessionRepository.js";
import {SessionVersionConflictError} from "../session/SessionVersionConflictError.js";
import type {SpinCommandResult} from "../spin/SpinCommandResult.js";
import type {SpinOperationRecord} from "../spin/SpinOperationRecord.js";
import {ReferenceRoundLedger} from "./ReferenceRoundLedger.js";
import type {RoundTransaction, TransactionalRoundStore} from "./TransactionalRoundStore.js";
import {transactionBoundary} from "./internal/transactionBoundary.js";

const APPLICATION_ID = 0x504f4b49;
const SCHEMA = [
    "CREATE TABLE sessions (id TEXT PRIMARY KEY, state TEXT NOT NULL, version INTEGER NOT NULL CHECK(version > 0), balance REAL NOT NULL CHECK(balance >= 0))",
    "CREATE TABLE requests (session_id TEXT NOT NULL REFERENCES sessions(id), request_id TEXT NOT NULL, envelope TEXT NOT NULL, result TEXT, PRIMARY KEY(session_id, request_id))",
    "CREATE TABLE operations (session_id TEXT NOT NULL, request_id TEXT NOT NULL, record TEXT NOT NULL, PRIMARY KEY(session_id, request_id), FOREIGN KEY(session_id, request_id) REFERENCES requests(session_id, request_id))",
    "CREATE TABLE ledger (session_id TEXT NOT NULL REFERENCES sessions(id), transaction_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('debit','credit')), amount REAL NOT NULL CHECK(amount >= 0), balance REAL NOT NULL CHECK(balance >= 0), PRIMARY KEY(session_id, transaction_id))",
];

/** SQLite WAL/FULL local reference store. Open explicitly; importing POKIE never loads node:sqlite.
 * Requires Node >=22.16 with node:sqlite (tested on 24.18). No fallback to memory.
 * BEGIN IMMEDIATE precedes reads and domain work. Busy acquisition yields to the event loop;
 * no synchronous busy timeout can deadlock another asynchronous transaction in this process.
 */
export class SqliteTransactionalRoundStore implements TransactionalRoundStore {
    private tail: Promise<unknown> = Promise.resolve();
    private closing = false;
    private closed = false;
    private closePromise?: Promise<void>;
    private readonly database: DatabaseSync;
    private readonly lockWaitMs: number;
    private constructor(database: DatabaseSync, lockWaitMs: number) {
        this.database = database;
        this.lockWaitMs = lockWaitMs;
    }

    public static async open(filename: string, options: {lockWaitMs?: number} = {}): Promise<SqliteTransactionalRoundStore> {
        if (!filename || filename === ":memory:") throw new Error("A durable SQLite file path is required.");
        const lockWaitMs = options.lockWaitMs ?? 5000;
        if (!Number.isSafeInteger(lockWaitMs) || lockWaitMs < 0) throw new Error("lockWaitMs must be a non-negative safe integer.");
        let sqlite: typeof import("node:sqlite");
        try {
            sqlite = await import("node:sqlite");
        } catch {
            throw new Error("SqliteTransactionalRoundStore requires Node >=22.16 with node:sqlite enabled. Upgrade Node or explicitly select the weaker compensation configuration.");
        }
        const database = new sqlite.DatabaseSync(filename);
        const store = new SqliteTransactionalRoundStore(database, lockWaitMs);
        try {
            if (typeof database.isTransaction !== "boolean") throw new Error("SqliteTransactionalRoundStore requires Node >=22.16 with transaction-state inspection. Upgrade Node; no memory fallback is provided.");
            database.exec("PRAGMA busy_timeout=0; PRAGMA foreign_keys=ON;");
            const validateSchema = (): void => {
                const tables = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
                const version = database.prepare("PRAGMA user_version").get()?.user_version;
                const application = database.prepare("PRAGMA application_id").get()?.application_id;
                if (version !== 1 || application !== APPLICATION_ID ||
                    JSON.stringify(tables.map(table => table.sql).sort()) !== JSON.stringify([...SCHEMA].sort())) {
                    throw new Error("Incompatible POKIE SQLite schema/application version; use a valid reference database.");
                }
            };
            if (database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().length === 0) {
                await store.acquire();
                // Another opener may have initialized while this connection waited.
                if (database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().length === 0 &&
                    database.prepare("PRAGMA user_version").get()?.user_version === 0 && database.prepare("PRAGMA application_id").get()?.application_id === 0) {
                    for (const sql of SCHEMA) database.exec(sql);
                    database.exec(`PRAGMA user_version=1; PRAGMA application_id=${APPLICATION_ID};`);
                }
                validateSchema();
                database.exec("COMMIT");
            } else validateSchema();
            if (database.prepare("PRAGMA journal_mode").get()?.journal_mode !== "wal") {
                await store.retryBusy(() => database.exec("PRAGMA journal_mode=WAL"));
            }
            database.exec("PRAGMA synchronous=FULL");
            if (database.prepare("PRAGMA journal_mode").get()?.journal_mode !== "wal" || database.prepare("PRAGMA synchronous").get()?.synchronous !== 2) {
                throw new Error("SQLite WAL/FULL durability settings could not be established.");
            }
            return store;
        } catch (error) {
            try {
                if (database.isTransaction) database.exec("ROLLBACK");
            } finally {
                database.close();
            }
            throw error;
        }
    }

    public initialize(sessionId: string, state: PokieSessionState, game: PokieGame): Promise<void> {
        return this.enqueue(async () => {
            const invalid = validateRepositoryCommand({kind: "spin", sessionId}) ?? validatePersistedSession(state, game, undefined, sessionId)?.reason;
            if (invalid !== undefined) throw new Error(invalid);
            if (state.executionState !== "durably-restorable") throw new Error("Atomic round storage requires complete durably-restorable executable state.");
            const serialized = encode(state);
            await this.acquire();
            try {
                await this.write("initialize", () => this.database.prepare("INSERT INTO sessions VALUES (?, ?, 1, ?)").run(sessionId, serialized, state.credits!));
                await this.commit();
            } catch (error) {
                this.abort();
                throw error;
            }
        });
    }

    public readSession(sessionId: string): Promise<VersionedSessionState | undefined> {
        return this.enqueue(() => Promise.resolve(this.read(sessionId)));
    }
    public getBalance(sessionId: string): Promise<number> {
        return this.enqueue(() => Promise.resolve(this.balance(sessionId)));
    }
    public lookupResult(sessionId: string, requestId: string): Promise<SpinCommandResult | undefined> {
        return this.enqueue(() => Promise.resolve(this.result(sessionId, requestId)));
    }

    public transact(command: RepositoryCommand, work: (transaction: RoundTransaction, command: RepositoryCommand) => Promise<SpinCommandResult>): Promise<SpinCommandResult> {
        // Freeze caller intent before waiting; omitted fields are explicit nulls, never inferred
        // from a later session selection. The composite primary key permits cross-session reuse.
        const invalid = validateRepositoryCommand(command) ?? validateSessionCommand(command);
        if (invalid !== undefined) return Promise.resolve({status: "invalid-command", sessionId: command?.sessionId ?? "", reason: invalid});
        const intent = {...command, ...(command.continuation ? {continuation: Object.freeze({...command.continuation})} : {})};
        const envelope = commandEnvelope(intent);
        return this.enqueue(async () => {
            await this.acquire();
            let active = true;
            const assertActive = (): void => {
                if (!active || !this.database.isTransaction) throw new Error("Round participants are only valid inside their owning transaction.");
            };
            const requestId = intent.requestId ?? randomUUID();
            try {
                const saved = this.database.prepare("SELECT envelope, result FROM requests WHERE session_id=? AND request_id=?").get(intent.sessionId, requestId);
                if (saved !== undefined) {
                    const result: SpinCommandResult = saved.envelope === envelope
                        ? this.result(intent.sessionId, requestId)!
                        : {status: "identity-conflict", sessionId: intent.sessionId, reason: "requestId was already used with a different command payload. Restore the original intent; do not retry this round with a fresh key."};
                    this.rollback();
                    if (!result) throw new Error("Committed request is missing its saved result.");
                    return result;
                }
                const previous = this.read(intent.sessionId);
                const priorLedgerEntries = this.database.prepare("SELECT COUNT(*) AS count FROM ledger WHERE session_id=?").get(intent.sessionId)!.count;
                const previousVersion = this.database.prepare("SELECT version FROM sessions WHERE id=?").get(intent.sessionId)?.version;
                if (previousVersion === undefined) {
                    this.rollback();
                    return {status: "not-found", sessionId: intent.sessionId};
                }
                await this.write("request", () => this.database.prepare("INSERT INTO requests VALUES (?, ?, ?, NULL)").run(intent.sessionId, requestId, envelope));
                const participants = this.participants(assertActive, intent.sessionId, requestId);
                let result: SpinCommandResult | undefined;
                let ledgerFailure: {cause: unknown} | undefined;
                try {
                    result = await work(participants, {...intent, requestId});
                } finally {
                    // Promise.all may reject while another accepted ledger call is pending.
                    // Finish those calls inside this transaction before rollback or commit.
                    try {
                        await participants.ledger.drain();
                    } catch (cause) {
                        ledgerFailure = {cause};
                    }
                }
                // Preserve the callback's original error/non-played classification.
                if (result.status === "played" && ledgerFailure !== undefined) throw ledgerFailure.cause;
                if (result.status !== "played") {
                    this.rollback();
                    return result;
                }
                // A callback cannot commit an incomplete or inconsistent participant tuple.
                const state = this.read(intent.sessionId),
                    response = this.result(intent.sessionId, requestId),
                    operation = this.operation(intent.sessionId, requestId);
                const settlement = operation === undefined ? [] : this.database.prepare("SELECT transaction_id FROM ledger WHERE session_id=? AND transaction_id IN (?, ?)").all(intent.sessionId, operation.debitTransactionId, operation.creditTransactionId);
                const savedDelivery = result.deliveryOnly === true && operation === undefined && settlement.length === 0 && result.stake === 0 &&
                    previous !== undefined && validateSavedStageDelivery(previous.state, result.state, intent) &&
                    this.database.prepare("SELECT COUNT(*) AS count FROM ledger WHERE session_id=?").get(intent.sessionId)!.count === priorLedgerEntries;
                if (!state || !response || (result.deliveryOnly === true ? !savedDelivery : operation?.checkpoint !== "committed" || settlement.length !== 2) || state.version !== Number(previousVersion) + 1 || result.version !== state.version ||
                    state.state.credits !== this.balance(intent.sessionId) || encode(state.state) !== encode(result.state) || encode(response) !== encode(result)) {
                    throw new Error("Incomplete or inconsistent atomic round tuple.");
                }
                // Serialize/detach before commit, so serialization cannot fail after settlement.
                const detached = JSON.parse(encode(result)) as SpinCommandResult;
                await this.commit();
                return detached;
            } catch (error) {
                // A COMMIT error may be uncertain. After confirmed rollback (or a commit that
                // ended the transaction), resolve this identity on the connection before retrying.
                this.abort();
                if (!this.closed) {
                    try {
                        const saved = this.result(intent.sessionId, requestId);
                        if (saved !== undefined) return saved;
                    } catch {
                        // Preserve the original classification. A caller must reopen and look up
                        // this identity when storage cannot confirm the commit outcome.
                    }
                }
                if (error instanceof SessionStateCorruptError) return {status: "corrupt-state", sessionId: intent.sessionId, reason: error.message};
                throw error instanceof RuntimeCommandError ? error : new RuntimeCommandError("storage-error", error);
            } finally {
                active = false;
            }
        });
    }

    public close(): Promise<void> {
        if (this.closePromise !== undefined) return this.closePromise;
        this.closing = true;
        this.closePromise = this.tail.then(() => {
            if (!this.closed) this.database.close();
            this.closed = true;
        });
        return this.closePromise;
    }

    private participants(assertActive: () => void, ownerSessionId: string, ownerRequestId: string): RoundTransaction & {readonly ledger: ReferenceRoundLedger} {
        const assertOwner = (sessionId: string, requestId?: string): void => {
            assertActive();
            if (sessionId !== ownerSessionId || (requestId !== undefined && requestId !== ownerRequestId)) throw new Error("Round participant identity differs from its owning command.");
        };
        const query = <T>(read: () => T): Promise<T> => {
            assertActive();
            return Promise.resolve(read());
        };
        const saveState = async (sessionId: string, state: PokieSessionState, version: number): Promise<number> => {
            assertOwner(sessionId);
            const current = this.read(sessionId)?.version ?? 0;
            if (current !== version) throw new SessionVersionConflictError(sessionId, version, current);
            const serialized = encode(state);
            await this.write("state", () => this.database.prepare("UPDATE sessions SET state=?, version=version+1 WHERE id=? AND version=?").run(serialized, sessionId, version));
            return version + 1;
        };
        return {
            sessions: {
                load: sessionId => query(() => {
                    assertOwner(sessionId);
                    return this.read(sessionId)?.state;
                }),
                loadVersioned: sessionId => query(() => {
                    assertOwner(sessionId);
                    return this.read(sessionId);
                }),
                save: () => Promise.reject(new Error("Atomic rounds require versioned state writes.")),
                saveVersioned: saveState,
            },
            ledger: new ReferenceRoundLedger({
                balance: sessionId => {
                    assertOwner(sessionId);
                    return this.balance(sessionId);
                },
                find: (sessionId, transactionId) => {
                    assertOwner(sessionId);
                    return this.database.prepare("SELECT kind, amount, balance FROM ledger WHERE session_id=? AND transaction_id=?").get(sessionId, transactionId) as {kind: string; amount: number; balance: number} | undefined;
                },
                writeEntry: async (sessionId, transactionId, kind, amount, balance) => {
                    assertOwner(sessionId);
                    const boundary = transactionId.endsWith(":credit") ? "payout" : "debit";
                    await this.write(`${boundary}-ledger`, () => this.database.prepare("INSERT INTO ledger VALUES (?, ?, ?, ?, ?)").run(sessionId, transactionId, kind, amount, balance));
                    await this.write(`${boundary}-balance`, () => this.database.prepare("UPDATE sessions SET balance=? WHERE id=?").run(balance, sessionId));
                },
            }),
            results: {
                loadRound: (sessionId, roundId) => query(() => {
                    const row = this.database.prepare("SELECT result FROM requests WHERE session_id=? AND json_extract(result, '$.state.logicalRound.id')=? ORDER BY json_extract(result, '$.version') DESC LIMIT 1").get(sessionId, roundId);
                    return row?.result ? JSON.parse(String(row.result)) as SpinCommandResult : undefined;
                }),
                load: (sessionId, requestId) => query(() => {
                    assertOwner(sessionId, requestId);
                    return this.result(sessionId, requestId);
                }),
                save: async (sessionId, requestId, result) => {
                    assertOwner(sessionId, requestId);
                    const serialized = encode(result);
                    await this.write("result", () => this.database.prepare("UPDATE requests SET result=? WHERE session_id=? AND request_id=?").run(serialized, sessionId, requestId));
                },
            },
            operations: {
                load: (sessionId, requestId) => query(() => {
                    assertOwner(sessionId, requestId);
                    return this.operation(sessionId, requestId);
                }),
                record: async record => {
                    assertOwner(record.sessionId, record.requestId);
                    const serialized = encode(record);
                    await this.write(`operation-${record.checkpoint}`, () => this.database.prepare("INSERT INTO operations VALUES (?, ?, ?) ON CONFLICT(session_id, request_id) DO UPDATE SET record=excluded.record").run(record.sessionId, record.requestId, serialized));
                },
                delete: () => Promise.reject(new Error("Separate atomic operation compensation is forbidden.")),
                listIncomplete: () => query(() => []),
            },
        };
    }

    private read(sessionId: string): VersionedSessionState | undefined {
        const row = this.database.prepare("SELECT state, version FROM sessions WHERE id=?").get(sessionId);
        if (!row) return undefined;
        const version = Number(row.version);
        if (!Number.isSafeInteger(version) || version < 1) throw new Error("Corrupt SQLite session revision.");
        try {
            return {state: JSON.parse(String(row.state)) as PokieSessionState, version};
        } catch (error) {
            throw new SessionStateCorruptError(sessionId, error instanceof Error ? error.message : String(error));
        }
    }
    private balance(sessionId: string): number {
        const row = this.database.prepare("SELECT balance FROM sessions WHERE id=?").get(sessionId);
        if (!row) throw new Error(`Unknown reference ledger session "${sessionId}".`);
        const balance = Number(row.balance);
        if (!Number.isFinite(balance) || balance < 0) throw new Error("Corrupt reference balance.");
        return balance;
    }
    private result(sessionId: string, requestId: string): SpinCommandResult | undefined {
        const row = this.database.prepare("SELECT result FROM requests WHERE session_id=? AND request_id=?").get(sessionId, requestId);
        if (!row || row.result === null) return undefined;
        const result = JSON.parse(String(row.result)) as SpinCommandResult;
        if (result?.status !== "played" || result.sessionId !== sessionId || result.requestId !== requestId || !Number.isSafeInteger(result.version) || !result.state) throw new Error("Corrupt committed SQLite response.");
        return result;
    }
    private operation(sessionId: string, requestId: string): SpinOperationRecord | undefined {
        const row = this.database.prepare("SELECT record FROM operations WHERE session_id=? AND request_id=?").get(sessionId, requestId);
        return row === undefined ? undefined : JSON.parse(String(row.record)) as SpinOperationRecord;
    }
    private enqueue<T>(work: () => Promise<T>): Promise<T> {
        if (this.closing) return Promise.reject(new Error("Transactional round store is closing/closed."));
        const result = this.tail.then(work);
        this.tail = result.catch(() => undefined);
        return result;
    }
    private acquire(): Promise<void> {
        return this.retryBusy(() => this.database.exec("BEGIN IMMEDIATE"));
    }
    private async retryBusy(work: () => void): Promise<void> {
        const deadline = Date.now() + this.lockWaitMs;
        for (;;) {
            try {
                work();
                return;
            } catch (error) {
                if (!isBusy(error)) throw error;
                if (Date.now() >= deadline) throw new RuntimeCommandError("storage-error", new Error("SQLite round store contention timeout before calculation. Retry the same request identity after the owner finishes."));
                await new Promise<void>(resolve => {
                    setTimeout(resolve, Math.min(10, Math.max(1, deadline - Date.now())));
                });
            }
        }
    }
    private async write(boundary: string, work: () => unknown): Promise<void> {
        await transactionBoundary(this, `before:${boundary}`);
        work();
        await transactionBoundary(this, `after:${boundary}`);
    }
    private async commit(): Promise<void> {
        await this.write("commit", () => this.database.exec("COMMIT"));
    }
    private abort(): void {
        try {
            this.rollback();
        } catch {
            // Never reuse a connection with uncertain transaction ownership. Closing releases
            // SQLite's locks/rolls back; a cleanup failure must not replace the primary error.
            this.closing = true;
            try {
                this.database.close();
            } catch { /* The connection remains quarantined. */ }
            this.closed = true;
        }
    }
    private rollback(): void {
        if (this.database.isTransaction) this.database.exec("ROLLBACK");
    }
}

function isBusy(error: unknown): boolean {
    return typeof error === "object" && error !== null && "errcode" in error && (error.errcode === 5 || error.errcode === 6);
}

/** Reject data that JSON would silently alter; optional object fields alone may be omitted. */
function encode(value: unknown): string {
    return JSON.stringify(value, function(key, item: unknown) {
        if (item === undefined && !Array.isArray(this)) return undefined;
        if (item === undefined || typeof item === "function" || typeof item === "symbol" || typeof item === "bigint" ||
            (typeof item === "number" && !Number.isFinite(item))) throw new Error(`Nonserializable round data at ${key}.`);
        return item;
    });
}
