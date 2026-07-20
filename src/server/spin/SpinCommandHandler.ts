import crypto from "crypto";
import type {PokieGame} from "../../gamepackage/PokieGame.js";
import type {GameSessionSerializing} from "../../net/GameSessionSerializing.js";
import type {GameSessionHandling} from "../../session/GameSessionHandling.js";
import {InMemoryIdempotencyRepository} from "../idempotency/InMemoryIdempotencyRepository.js";
import type {IdempotencyRepository} from "../idempotency/IdempotencyRepository.js";
import {captureRoundPokieSessionState} from "../session/captureRoundPokieSessionState.js";
import {determineStakeAmount} from "../session/determineStakeAmount.js";
import {isVersionedSessionRepository} from "../session/isVersionedSessionRepository.js";
import type {PokieSessionState} from "../session/PokieSessionState.js";
import {resolveGameSessionSerializer} from "../session/resolveGameSessionSerializer.js";
import {restoreFeatureState} from "../session/restoreFeatureState.js";
import {SessionVersionConflictError} from "../session/SessionVersionConflictError.js";
import type {SessionRepository} from "../session/SessionRepository.js";
import type {TransactionalWalletPort} from "../wallet/TransactionalWalletPort.js";
import {InMemorySpinOperationLog} from "./InMemorySpinOperationLog.js";
import {SpinReconciliationService} from "./SpinReconciliationService.js";
import type {SpinCommandHandling} from "./SpinCommandHandling.js";
import type {SpinCommandResult} from "./SpinCommandResult.js";
import type {SpinOperationLog} from "./SpinOperationLog.js";
import type {SpinOperationRecord} from "./SpinOperationRecord.js";
import type {SpinReconciliationOutcome} from "./SpinReconciliationOutcome.js";
import type {SpinReconciliationServicing} from "./SpinReconciliationServicing.js";

// Orchestrates a single spin end-to-end: replay an idempotent retry, load the persisted session
// state (reconstructing a live session on a cache miss, e.g. after a restart), gate on
// canPlayNextGame(), run play(), settle the wallet as two separate transactions (a stake debit and
// a win credit), and persist the new state together with the idempotency result as one committed
// outcome.
//
// Every command for a given sessionId — whether the same requestId retried concurrently or two
// genuinely different spins racing — is serialized through a per-session queue (see enqueue()), so
// there's never more than one play()/wallet-settlement/persist in flight for a session at a time.
// That single property is what makes a repeated concurrent requestId safe without a separate
// "in-flight" cache: the second call is simply queued behind the first, and by the time its own
// turn runs, the first's result is already in idempotencyRepository for it to find.
//
// Wallet settlement: the stake is debited *before* play(), using determineStakeAmount() (0 for a
// session that reports it's mid free-round via the optional StakeAmountDetermining contract, else
// getBet() — see that function's own doc comment for why the wallet balance itself is never used to
// infer "this must be free"). The win is credited *after* play(), for whatever amount reconciles
// the wallet to the session's own final credits — i.e. balanceBeforePlay - stakeDebited +
// winCredited === session.getCreditsAmount() after play(). That reconciliation is what keeps this
// correct even for a session with its own internal accounting quirks (e.g. a free-games round that
// banks a win across several spins instead of paying it out immediately): whatever delta the
// session actually produced beyond the stake we charged is exactly what gets credited.
//
// Every wallet transaction for an attempt gets its own id, `{roundId}:{attemptId}:debit`/`:credit`
// — `roundId` is the requestId (or a fresh id when none was given), stable across every retry of
// that same logical request, for traceability back to the logical command; `attemptId` is freshly
// minted every time this method actually runs, so it's what makes each attempt's wallet transaction
// ids unique — a retried command (same requestId, hence same roundId) that follows a
// compensated/reversed prior attempt always gets brand-new transaction ids rather than reusing the
// reversed ones. (TransactionalWalletAdapter/InMemoryWallet also tolerate reusing a reversed id —
// see their own comments — but attemptId keeps that a
// backstop rather than something this handler leans on.)
//
// If anything fails after entering the mutating phase — a wallet call, persisting the new session
// state, or persisting the idempotency result — this handler *attempts* to undo whatever it already
// did for this attempt: every wallet transaction already applied is individually reversed by its own
// transactionId, any already-persisted session state is restored to what it was before this attempt,
// and the live session is evicted from the cache (see reverseApplied()/restoreSessionState()). This
// is a **best-effort, process-local compensation**, not a strict cross-store transaction guarantee —
// it only helps the retry that follows a failure this same process caught and ran a catch block for:
//   - **Process crash risk**: if the process dies (or is killed) between two of these awaited calls
//     — e.g. right after the wallet debit/credit but before persisting the new session state, or
//     right after persisting the session state but before persisting the idempotency result — no
//     catch block ever runs, so nothing gets compensated. Wallet, SessionRepository, and
//     idempotencyRepository can be left durably diverged (e.g. a debited wallet whose session state
//     was never updated) until something else reconciles them. The default InMemoryWallet and
//     InMemoryIdempotencyRepository lose everything on a crash anyway, so nothing survives on their
//     side to diverge — but FileSessionRepository writes to disk and *does* survive a crash, so its
//     persisted session state can easily end up ahead of an in-memory wallet/idempotency store that
//     reset to nothing on restart; pairing FileSessionRepository with the in-memory wallet/idempotency
//     defaults is exactly this scenario, not a hypothetical one. A durable/persistent WalletPort or
//     IdempotencyRepository does not get this protection for free either.
//   - **Compensation-failure risk**: reverseApplied()/restoreSessionState() themselves can fail
//     (e.g. the same outage that made the original call fail is still ongoing) — that failure is
//     swallowed so it doesn't replace or hide the original error the caller of handle() sees, but it
//     also means the compensation silently did not happen: the wallet and/or SessionRepository can be
//     left reflecting a partially-applied attempt.
// A production deployment that needs real durable atomicity across the wallet, SessionRepository,
// and idempotencyRepository — surviving a process crash or a failed compensating write — is
// responsible for providing it itself, typically by implementing WalletPort/SessionRepository/
// IdempotencyRepository (or a subset sharing state) over one transactional store and committing the
// relevant writes together at that layer; this handler's own compensation is a correctness
// improvement over doing nothing, not a substitute for that.
//
// Optimistic locking: when sessionRepository additionally implements VersionedSessionRepository (see
// isVersionedSessionRepository.ts — InMemorySessionRepository/FileSessionRepository both do), the
// state loaded at the start of an attempt is saved back via saveVersioned() with the version it was
// read at, instead of the plain unconditional save(). This mainly protects a repository *shared
// across multiple SpinCommandHandler instances* (e.g. two PokieDevServer processes pointed at the
// same FileSessionRepository directory) — within one instance, every command for a given sessionId
// is already serialized through enqueue()/sessionQueues above, so its own load-then-save can never
// race against itself. A version mismatch (someone else's save landed in between) surfaces as a
// SessionVersionConflictError, caught in playAndSettle()'s catch block and turned into a "conflict"
// SpinCommandResult after the same wallet-reversal/session-eviction compensation any other mid-flight
// failure gets — never a silent overwrite of whatever the other attempt committed.
//
// A caller can additionally declare its own expected version via handle()'s third parameter — a
// precondition checked up front in handleSerialized(), before canPlayNextGame()/play()/any wallet
// transaction, distinct from (and checked before) the storage-level conflict above.
//
// Reconciliation/retry recovery: every requestId-bearing attempt's own progress through the mutating
// phase below is additionally checkpointed to `operationLog` (see SpinOperationCheckpoint) — started,
// debited, settled, session-saved, committed, or (when this handler's own in-process compensation fully
// succeeds) compensated. This is still not true cross-store atomicity — see the class doc comment above
// on process-crash/compensation-failure risk, and this package's own v1.3 gap-audit note on why full
// atomicity is a v2 concern — but it closes the one genuinely dangerous consequence of that gap: on a
// retried requestId whose idempotency result is missing, handleSerialized() now consults this attempt's
// own operationLog record *before* ever running a fresh spin. If that record isn't terminal,
// `reconciliationService` resolves it first — resuming an already-fully-settled attempt from its own
// captured result (never calling session.play() again), safely reversing a debit whose matching
// settlement is confirmed to have never applied, or returning a "recovery-required" SpinCommandResult
// when neither can be established safely — so a repeated requestId can never re-debit the wallet or
// re-play the round, whichever of those interruption windows it landed in.
export class SpinCommandHandler implements SpinCommandHandling {
    private readonly game: PokieGame;
    private readonly sessionRepository: SessionRepository;
    private readonly wallet: TransactionalWalletPort;
    private readonly idempotencyRepository: IdempotencyRepository<SpinCommandResult>;
    private readonly operationLog: SpinOperationLog;
    private readonly reconciliationService: SpinReconciliationServicing;
    private readonly sessionSerializer: GameSessionSerializing | undefined;
    private readonly liveSessions = new Map<string, GameSessionHandling>();
    private readonly sessionQueues = new Map<string, Promise<unknown>>();

    constructor(
        game: PokieGame,
        sessionRepository: SessionRepository,
        wallet: TransactionalWalletPort,
        idempotencyRepository: IdempotencyRepository<SpinCommandResult> = new InMemoryIdempotencyRepository(),
        operationLog: SpinOperationLog = new InMemorySpinOperationLog(),
        // Additive: defaults to a SpinReconciliationService built from the four collaborators above,
        // constructed with structurallyOwned = true — every call into this handler's own reconciliation
        // (both the inline check in handleSerialized and the reconcileOne()/reconcileAll() wrapper methods
        // below) is already serialized through enqueue(), the real, structural same-instance guarantee
        // SpinReconciliationService's own doc comment describes, so it never needs to fall back to
        // SpinOperationLeasing itself. Accepting an already-constructed instance directly, rather than
        // individual config knobs for it, is what lets a caller (e.g. a test simulating a crash without a
        // real wait) configure things like a shorter quiescence window or an injected clock without this
        // class needing to know those knobs exist.
        reconciliationService: SpinReconciliationServicing = new SpinReconciliationService(wallet, sessionRepository, idempotencyRepository, operationLog, true),
    ) {
        this.game = game;
        this.sessionRepository = sessionRepository;
        this.wallet = wallet;
        this.idempotencyRepository = idempotencyRepository;
        this.operationLog = operationLog;
        this.reconciliationService = reconciliationService;
        this.sessionSerializer = resolveGameSessionSerializer(game);
    }

    public primeSession(sessionId: string, session: GameSessionHandling): void {
        this.liveSessions.set(sessionId, session);
    }

    // Reconciles one (sessionId, requestId)'s own SpinOperationRecord, the same way an interrupted
    // requestId retried through handle() would trigger internally (see reconcilePendingAttempt()) — but
    // callable directly, e.g. from an ops tool. Routed through the same per-session enqueue() queue
    // handle() itself uses, so this can never run concurrently with a handle() call for the same
    // sessionId on this instance: either it runs before that call's own turn in the queue starts, or
    // after it has already fully finished — never mid-flight. That's a real, same-instance guarantee, not
    // just documentation — see reconciliationService's own doc comment for why racing a live attempt
    // matters and what this does and doesn't protect against (a durable operationLog shared across
    // multiple process/instances is not covered by this queue at all; that's what
    // SpinReconciliationService's own quiescence window is for).
    public reconcileOne(sessionId: string, requestId: string): Promise<SpinReconciliationOutcome> {
        return this.enqueue(sessionId, () => this.reconciliationService.reconcileOne(sessionId, requestId));
    }

    // Sweeps every currently-incomplete SpinOperationRecord (e.g. once at startup, over whatever a
    // durable operationLog carried across a restart) via reconcileOne() above — so each individual
    // record's own reconciliation is still serialized against handle() calls for its own sessionId,
    // exactly as if it had been reconciled one at a time by hand. Different sessions' records are still
    // reconciled sequentially here (one at a time, in operationLog.listIncomplete()'s own order) — this
    // is a startup/ops sweep, not a hot path, so that's a deliberate simplicity choice, not a limitation
    // worth optimizing away.
    public async reconcileAll(): Promise<readonly SpinReconciliationOutcome[]> {
        const pending = await this.operationLog.listIncomplete();
        const outcomes: SpinReconciliationOutcome[] = [];
        for (const record of pending) {
            outcomes.push(await this.reconcileOne(record.sessionId, record.requestId));
        }
        return outcomes;
    }

    // Raw access to the underlying service, for a caller that needs SpinReconciliationServicing itself
    // (e.g. to construct its own equivalent over the same stores from another process). Calling
    // reconcileOne()/reconcileAll() directly on the object this returns is NOT protected by this
    // handler's own per-session queue — a caller doing that while handle() might concurrently run for the
    // same session is responsible for its own external synchronization. Prefer this handler's own
    // reconcileOne()/reconcileAll() above unless that's genuinely not possible.
    public getReconciliationService(): SpinReconciliationServicing {
        return this.reconciliationService;
    }

    public handle(sessionId: string, requestId?: string, expectedVersion?: number): Promise<SpinCommandResult> {
        return this.enqueue(sessionId, () => this.handleSerialized(sessionId, requestId, expectedVersion));
    }

    // Chains `work` onto whatever is already queued for `sessionId`, so it only starts once every
    // earlier command for that same session has settled (successfully or not) — the mechanism
    // behind both "serialize concurrent commands for one session" and, as a consequence, "a
    // concurrently repeated requestId only spins once" (see class doc comment).
    private enqueue<T>(sessionId: string, work: () => Promise<T>): Promise<T> {
        const previous = this.sessionQueues.get(sessionId) ?? Promise.resolve();
        const result = previous.then(work, work);
        this.sessionQueues.set(
            sessionId,
            result.then(
                () => undefined,
                () => undefined,
            ),
        );
        return result;
    }

    private async handleSerialized(sessionId: string, requestId?: string, expectedVersion?: number): Promise<SpinCommandResult> {
        if (requestId !== undefined) {
            const cached = await this.idempotencyRepository.load(sessionId, requestId);
            if (cached !== undefined) {
                return cached;
            }

            const recovered = await this.reconcilePendingAttempt(sessionId, requestId);
            if (recovered !== undefined) {
                return recovered;
            }
        }

        const {state, version} = await this.loadState(sessionId);
        if (!state) {
            return {status: "not-found", sessionId};
        }

        // A caller-declared precondition, checked before anything else mutates: if the repository is
        // versioned and the caller expected a different version than what's actually stored, this is
        // already stale — reject immediately rather than spinning against state the caller didn't
        // expect. Nothing has been applied yet (no wallet transaction, no play()), so there's nothing
        // to compensate, unlike a conflict discovered at save time in playAndSettle().
        if (expectedVersion !== undefined && version !== undefined && version !== expectedVersion) {
            return {
                status: "conflict",
                sessionId,
                reason: `Session "${sessionId}" version mismatch: expected version ${expectedVersion}, but the current version is ${version}.`,
            };
        }

        const session = this.resolveSession(sessionId, state);

        const balanceBeforePlay = await this.wallet.getBalance(sessionId);
        session.setCreditsAmount(balanceBeforePlay);

        if (!session.canPlayNextGame()) {
            return {
                status: "blocked",
                sessionId,
                reason: `Session "${sessionId}" cannot play the next round (canPlayNextGame() returned false).`,
            };
        }

        return this.playAndSettle(sessionId, session, state, version, balanceBeforePlay, requestId);
    }

    // Reads both the state and, when sessionRepository supports it, the version it was read at — a
    // single call either way, never a redundant second read on the plain-repository path.
    private async loadState(sessionId: string): Promise<{state: PokieSessionState | undefined; version: number | undefined}> {
        if (isVersionedSessionRepository(this.sessionRepository)) {
            const versioned = await this.sessionRepository.loadVersioned(sessionId);
            return {state: versioned?.state, version: versioned?.version};
        }
        return {state: await this.sessionRepository.load(sessionId), version: undefined};
    }

    // Consulted only on an idempotency cache miss for a requestId-bearing call — an interrupted prior
    // attempt for this exact (sessionId, requestId) is the one thing that can make a plain "no cached
    // result, so run a fresh spin" unsafe: it could mean this requestId is genuinely new, or it could
    // mean an earlier attempt got partway through the mutating phase and never reached a point
    // SpinReconciliationService itself is willing to trust without re-verifying (see its own doc comment
    // — a "committed" record is never enough on its own either, since idempotencyRepository might not
    // actually still hold what it implies). Every checkpoint — including "committed" — is routed through
    // reconciliationService.reconcileOne(); there is deliberately no shortcut here that skips it based on
    // the checkpoint value alone, since that's exactly the class of mistake this whole mechanism exists
    // to close.
    //
    // Returns a result to short-circuit the normal fresh-spin path below whenever reconciliation
    // determined the attempt is already done ("resumed"/"already-committed") or can't be safely
    // proceeded with right now ("manual-recovery-required"/"deferred" — both surfaced as the same
    // "recovery-required" SpinCommandResult, distinguished only by "reason": one needs a human, the other
    // just needs a short wait for a still-live attempt to finish). Returns undefined — "safe to
    // proceed" — only when there was no pending record at all, or it was cleanly resolved as never having
    // applied anything ("no-action-needed") or safely reversed ("reversed"), in which case the caller
    // runs a genuinely fresh spin.
    private async reconcilePendingAttempt(sessionId: string, requestId: string): Promise<SpinCommandResult | undefined> {
        const pending = await this.operationLog.load(sessionId, requestId);
        if (pending === undefined) {
            return undefined;
        }

        const outcome = await this.reconciliationService.reconcileOne(sessionId, requestId);
        if (outcome.status === "resumed") {
            return outcome.result;
        }
        if (outcome.status === "manual-recovery-required" || outcome.status === "deferred") {
            return {status: "recovery-required", sessionId, requestId, reason: outcome.reason};
        }
        if (outcome.status === "already-committed") {
            // Reconciliation re-verified idempotencyRepository directly and found the result already
            // there (possibly written concurrently by another call racing this same requestId — the
            // idempotency cache-miss above raced it). Fetch it rather than falling through to a fresh
            // spin.
            const cached = await this.idempotencyRepository.load(sessionId, requestId);
            if (cached !== undefined) {
                return cached;
            }
        }
        // "reversed"/"no-action-needed" (or the defensive fallback above): wallet and session are clean
        // (or were never touched) — discard any stale cached live session and let the caller run a
        // genuinely fresh spin below.
        this.liveSessions.delete(sessionId);
        return undefined;
    }

    private async playAndSettle(
        sessionId: string,
        session: GameSessionHandling,
        state: PokieSessionState,
        expectedVersion: number | undefined,
        balanceBeforePlay: number,
        requestId: string | undefined,
    ): Promise<SpinCommandResult> {
        const roundId = requestId ?? crypto.randomUUID();
        const attemptId = crypto.randomUUID();
        const debitTransactionId = `${roundId}:${attemptId}:debit`;
        const creditTransactionId = `${roundId}:${attemptId}:credit`;

        const stakeAmount = determineStakeAmount(session, session.getBet());
        const startedAt = new Date().toISOString();

        // Every checkpoint() call below is a no-op unless requestId is defined — SpinOperationLog is
        // scoped to requestId-bearing attempts only, the same scope idempotency itself already has (see
        // the class doc comment). Declared once here so every call site below stays a one-liner.
        const checkpoint = (record: Omit<SpinOperationRecord, "sessionId" | "requestId" | "attemptId" | "debitTransactionId" | "creditTransactionId" | "stakeAmount" | "expectedVersion" | "startedAt">): Promise<void> => {
            if (requestId === undefined) {
                return Promise.resolve();
            }
            return this.operationLog.record({
                sessionId,
                requestId,
                attemptId,
                debitTransactionId,
                creditTransactionId,
                stakeAmount,
                expectedVersion,
                startedAt,
                ...record,
            });
        };

        await checkpoint({checkpoint: "started", updatedAt: startedAt});

        const appliedTransactionIds: string[] = [];
        let sessionStateSaved = false;
        try {
            await this.wallet.debit(sessionId, debitTransactionId, stakeAmount);
            appliedTransactionIds.push(debitTransactionId);
            await checkpoint({checkpoint: "debited", updatedAt: new Date().toISOString()});

            session.play();
            const win = session.getWinAmount();
            const delta = session.getCreditsAmount() - balanceBeforePlay;
            const creditAmount = delta + stakeAmount;

            const newBalance =
                creditAmount >= 0
                    ? await this.wallet.credit(sessionId, creditTransactionId, creditAmount)
                    : await this.wallet.debit(sessionId, creditTransactionId, -creditAmount);
            appliedTransactionIds.push(creditTransactionId);

            const newState = captureRoundPokieSessionState(state.context, session, state, this.sessionSerializer);
            await checkpoint({
                checkpoint: "settled",
                updatedAt: new Date().toISOString(),
                capturedResult: {previousState: state, newState, win, credits: newBalance},
            });

            let newVersion: number | undefined;
            if (isVersionedSessionRepository(this.sessionRepository) && expectedVersion !== undefined) {
                newVersion = await this.sessionRepository.saveVersioned(sessionId, newState, expectedVersion);
            } else {
                await this.sessionRepository.save(sessionId, newState);
            }
            sessionStateSaved = true;
            await checkpoint({
                checkpoint: "session-saved",
                updatedAt: new Date().toISOString(),
                capturedResult: {previousState: state, newState, win, credits: newBalance, newVersion},
            });

            const result: SpinCommandResult = {
                status: "played",
                sessionId,
                state: newState,
                previousState: state,
                credits: newBalance,
                win,
            };
            if (newVersion !== undefined) {
                result.version = newVersion;
            }
            if (requestId !== undefined) {
                result.requestId = requestId;
                await this.idempotencyRepository.save(sessionId, requestId, result);
            }
            // capturedResult is carried forward onto the terminal "committed" checkpoint too (not just
            // "settled"/"session-saved") — see SpinReconciliationService's own handling of a "committed"
            // record whose idempotency result has since gone missing (a durability mismatch between
            // operationLog and idempotencyRepository, or a crash between the idempotency save above
            // succeeding and this checkpoint write landing): without it there would be nothing left to
            // safely rebuild that result from, forcing a needless manual-recovery-required instead of a
            // clean backfill.
            await checkpoint({
                checkpoint: "committed",
                updatedAt: new Date().toISOString(),
                capturedResult: {previousState: state, newState, win, credits: newBalance, newVersion},
            });

            return result;
        } catch (error) {
            let compensationFullySucceeded = true;
            if (sessionStateSaved) {
                compensationFullySucceeded = (await this.restoreSessionState(sessionId, state)) && compensationFullySucceeded;
            }
            compensationFullySucceeded = (await this.reverseApplied(sessionId, appliedTransactionIds)) && compensationFullySucceeded;
            this.liveSessions.delete(sessionId);

            // Only ever mark this attempt "compensated" when every compensating write actually
            // succeeded — see the class doc comment. If any of them failed, the record is left at
            // whatever checkpoint() call above it last reached: an honest, undisguised "this is exactly
            // how far we got," for SpinReconciliationService to resolve on the next retry (or an
            // explicit reconcileAll() sweep) rather than a checkpoint lying about a compensation that
            // didn't fully happen.
            if (compensationFullySucceeded) {
                if (appliedTransactionIds.length === 0 && !sessionStateSaved) {
                    // Nothing was ever applied in the first place (e.g. the debit itself threw) — there
                    // was nothing to compensate, so "compensated" would overstate what happened here;
                    // just clear the record, the same as the "started"-only case in
                    // SpinReconciliationService.
                    if (requestId !== undefined) {
                        await this.operationLog.delete(sessionId, requestId);
                    }
                } else {
                    await checkpoint({checkpoint: "compensated", updatedAt: new Date().toISOString()});
                }
            }

            if (error instanceof SessionVersionConflictError) {
                return {status: "conflict", sessionId, reason: error.message};
            }
            throw error;
        }
    }

    // Best-effort, process-local compensating write, undoing this attempt's own
    // sessionRepository.save() when a later step (persisting the idempotency result) fails — see the
    // class doc comment for the full risk discussion (process crash, compensation failure). Returns
    // whether it actually succeeded, so the caller can tell a fully-compensated attempt apart from one
    // that isn't — see playAndSettle's own use of this.
    private async restoreSessionState(sessionId: string, state: PokieSessionState): Promise<boolean> {
        try {
            await this.sessionRepository.save(sessionId, state);
            return true;
        } catch {
            // The error that triggered this restore is what the caller of handle() sees; a failure
            // to restore shouldn't replace or hide it. SessionRepository is left holding the new
            // (post-spin) state instead of being rolled back — a real, observable divergence this
            // best-effort compensation could not prevent in that case.
            return false;
        }
    }

    // Returns whether every reversal actually succeeded — see restoreSessionState's own comment on why
    // that matters to the caller.
    private async reverseApplied(sessionId: string, transactionIds: string[]): Promise<boolean> {
        let allSucceeded = true;
        for (const transactionId of transactionIds.reverse()) {
            try {
                await this.wallet.reverse(sessionId, transactionId);
            } catch {
                // Best-effort compensation: the error that triggered this reversal is what the
                // caller of handle() sees (rethrown by playAndSettle's caller); a failure to
                // compensate shouldn't replace or hide it. The wallet is left reflecting this
                // attempt's partial application instead of being fully reversed — see the class doc
                // comment.
                allSucceeded = false;
            }
        }
        return allSucceeded;
    }

    private resolveSession(sessionId: string, state: PokieSessionState): GameSessionHandling {
        let session = this.liveSessions.get(sessionId);
        if (!session) {
            session = this.game.createSession(state.context);
            session.setBet(state.bet);
            restoreFeatureState(session, state.featureState);
            this.liveSessions.set(sessionId, session);
        }
        return session;
    }
}
