import {isVersionedSessionRepository} from "../session/isVersionedSessionRepository.js";
import {SessionVersionConflictError} from "../session/SessionVersionConflictError.js";
import type {SessionRepository} from "../session/SessionRepository.js";
import {isWalletTransactionInspecting} from "../wallet/isWalletTransactionInspecting.js";
import type {TransactionalWalletPort} from "../wallet/TransactionalWalletPort.js";
import type {IdempotencyRepository} from "../idempotency/IdempotencyRepository.js";
import {isSpinOperationLeasing} from "./isSpinOperationLeasing.js";
import type {SpinCommandResult} from "./SpinCommandResult.js";
import type {SpinOperationCapturedResult, SpinOperationRecord} from "./SpinOperationRecord.js";
import type {SpinOperationLog} from "./SpinOperationLog.js";
import type {SpinReconciliationOutcome} from "./SpinReconciliationOutcome.js";
import type {SpinReconciliationServicing} from "./SpinReconciliationServicing.js";

// How long a non-terminal SpinOperationRecord's own "updatedAt" must be in the past before this class is
// even willing to *consider* acting on it — see the class doc comment's "Racing a live attempt" section.
// Deliberately generous: every individual step a live playAndSettle() attempt awaits (a wallet call, a
// repository save) is expected to resolve in well under a second even under load; this is a safety
// margin, not a performance budget. Checked before, and independently of, the ownership gate below — a
// record can fail either check on its own. Never sufficient by itself — see "Ownership, not just age."
const DEFAULT_MINIMUM_QUIESCENCE_MS = 30_000;

// How long a won reconciliation claim (see SpinOperationLeasing) is held for by default before it must be
// renewed — comfortably longer than a single step of reconciliation's own mutating work is expected to
// take, short enough that a claim from a caller that crashed mid-reconciliation doesn't block real
// recovery for long.
const DEFAULT_LEASE_DURATION_MS = 10_000;

// Resolves one requestId-bearing SpinOperationRecord left in-flight by a process crash (or a
// same-process compensation failure — see SpinCommandHandler's own catch block) into exactly one of:
// "no-action-needed" (nothing was ever applied), "already-committed" (nothing to do, it finished), a
// safe automatic "reversed" or "resumed", "deferred" (a lease is contested right now, or a record is too
// recent to safely act on yet), or an honest "manual-recovery-required" when none of the above can be
// established safely. Never claims true atomicity — see this package's own v1.3 gap-audit note on why
// full cross-store atomicity is a v2 concern: every mutating branch below only ever acts when it can be
// certain, and defers to a human (or to time, or to whoever currently holds ownership) otherwise.
//
// Deliberately has no PokieGame/live-session access at all — constructed from only the wallet,
// sessionRepository, idempotencyRepository, and operationLog a SpinCommandHandler itself already holds.
// That is not an incidental narrowing: it makes it structurally impossible for this class to call
// session.play() a second time for an attempt it's recovering, no matter what a future change here might
// try to do — resuming an attempt can only ever replay already-computed data (SpinOperationRecord's own
// capturedResult), never recompute it.
//
// No checkpoint is ever trusted as proof of what did NOT happen — only of what DID. "started" being the
// last checkpoint written proves nothing was applied *as of the moment that checkpoint was durably
// recorded*; it says nothing about whatever ran afterward before a crash prevented the next checkpoint
// write from landing (the debit call itself could have already succeeded). Every checkpoint from
// "started" through "session-saved" is treated as "at least this much might have happened," and — when
// the wallet supports WalletTransactionInspecting — verified directly rather than assumed. Likewise, the
// terminal "committed" checkpoint proves this handler's own process *believed* the idempotency write
// succeeded, never that idempotencyRepository still has it (a non-durable IdempotencyRepository paired
// with a durable SpinOperationLog, or a crash between that save succeeding and this checkpoint landing,
// can both leave it missing) — SpinCommandHandler.handleSerialized() would otherwise fall through to a
// fresh, re-charging spin for a requestId that already genuinely completed, so a "committed" record is
// always re-verified against idempotencyRepository directly, with its own capturedResult (carried forward
// onto every "committed" write — see SpinCommandHandler's own checkpoint() calls) as the only safe source
// to rebuild a missing result from.
//
// No durable proof, no auto-resume: resuming a "settled"/"session-saved"/"committed" record means writing
// a result that *claims* the wallet is (or still is) fully settled for this attempt. That claim is only
// ever trusted when it can be directly verified — via WalletTransactionInspecting today; this seam is
// deliberately named around "durable settlement proof" rather than that one interface specifically, so
// another explicit proof mechanism could plug in later without changing this class's own contract. A
// wallet that can't be asked at all is never treated as "probably fine" — see verifyDurableSettlement()
// and every one of its call sites below, all of which return manual-recovery-required rather than ever
// guessing when no such proof is available. (This is stricter than checking only for a *known* mismatch:
// "can't verify" and "verified mismatch" are both refused, not just the latter.)
//
// Ownership, not just age — and not reconciler-vs-reconciler alone: reconcileOne()/reconcileAll() read/act
// on SpinOperationLog independently of SpinCommandHandler's own per-session enqueue() queue — calling them
// directly while a live handle() call for the same (sessionId, requestId) might still be running (in this
// process or another) risks reconciling a record that isn't abandoned at all, just mid-flight (e.g.
// reversing a debit the live attempt is about to credit against, or overwriting a live attempt's own
// newer session state with stale captured data). A checkpoint's own age is never, by itself, sufficient
// authority — clock skew, or simply two reconcilers racing each other, can each independently satisfy an
// age threshold without the record actually being abandoned. And a lease alone only ever serializes
// *reconcilers against each other* — nothing in this package makes a live playAndSettle() attempt
// acquire, renew, or respect any lease at all, so a lease can never by itself prove no live handler is
// concurrently running somewhere else. Closing that gap without either (a) making every live attempt hold
// and renew a distributed lock (a far larger change this package does not make, and would start to look
// like a real cross-process atomicity claim this package explicitly disclaims) or (b) mandating a single
// shared transactional store (breaking the "any of the three storages plugs in independently" model) is
// not possible in general — so this class instead narrows *when* a mutating outcome is permitted at all,
// to cases where the caller can genuinely guarantee the answer:
//   - **Structural** (structurallyOwned = true): this instance's own caller already guarantees every call
//     into it is serialized against any live attempt for the same session — exactly what
//     SpinCommandHandler's own internally-built instance is, via its own reconcileOne()/reconcileAll()
//     wrapper methods routing through enqueue(). The strong case: no further check needed, because the
//     guarantee is real, not inferred from timing, and only ever covers this one same-instance handler
//     (which is exactly the scope it needs to cover — a live handle() call for the same session on the
//     same instance).
//   - **Exclusive-startup authority** (exclusiveStartupAuthority = true): the caller explicitly certifies
//     that, for as long as this instance is used, no SpinCommandHandler anywhere (this process or any
//     other) is currently processing requests against these same stores — true, for example, during a
//     dedicated startup/maintenance reconciliation sweep run *before* a server starts accepting traffic,
//     never while it's live. This is an operational contract this class cannot verify on its own — get it
//     wrong (grant this while a handler really is live) and this class's own guarantees don't hold; that
//     residual is exactly the kind of thing "no true cross-store atomicity" already accepts. Without
//     either structural ownership or this explicit authority, every mutating outcome is
//     manual-recovery-required, unconditionally — a checkpoint's own age, or even a successfully won
//     lease, is deliberately *not* enough on its own to authorize mutation; see withOwnership().
//   - **Leasing, once authority is already established**: with exclusiveStartupAuthority granted and
//     operationLog implementing SpinOperationLeasing, an explicit, exclusive, time-boxed, *fenced* claim
//     (see that interface's own doc comment on owner tokens) is taken before acting, re-verified
//     immediately before the actual mutating write (see confirmOwnership()), and released afterward. This
//     protects against multiple reconciler processes/workers that were each independently granted
//     exclusive-startup authority (e.g. by an operator mistake) from racing each other; it does not, and
//     cannot, protect against a live handler that was never supposed to be running in the first place —
//     only the authority contract above does that. When operationLog doesn't support leasing at all,
//     exclusive-startup authority alone is still honored (the operator's own certification is the primary
//     guarantee here, not the lease).
// Quiescence and ownership are independent, both-required checks for the two genuinely mutating paths
// (reverse, resume) — quiescence is a cheap, local, always-applicable filter checked first; ownership is
// what actually authorizes acting. The "committed" backfill is deliberately exempt from both: it's
// terminal (nothing further ever touches a truly-committed attempt) and idempotent regardless of who or
// how many times performs it, so there is no live-attempt race to guard against there.
export class SpinReconciliationService implements SpinReconciliationServicing {
    private readonly wallet: TransactionalWalletPort;
    private readonly sessionRepository: SessionRepository;
    private readonly idempotencyRepository: IdempotencyRepository<SpinCommandResult>;
    private readonly operationLog: SpinOperationLog;
    private readonly structurallyOwned: boolean;
    private readonly exclusiveStartupAuthority: boolean;
    private readonly minimumQuiescenceMs: number;
    private readonly leaseDurationMs: number;
    private readonly now: () => Date;

    constructor(
        wallet: TransactionalWalletPort,
        sessionRepository: SessionRepository,
        idempotencyRepository: IdempotencyRepository<SpinCommandResult>,
        operationLog: SpinOperationLog,
        // Additive constructor parameters — every one of them optional, defaulting to the conservative,
        // safe-by-default behavior of a standalone instance with no special guarantees: no mutating
        // outcome is ever produced unless the caller opts into one of the two authority mechanisms above.
        structurallyOwned = false,
        exclusiveStartupAuthority = false,
        minimumQuiescenceMs: number = DEFAULT_MINIMUM_QUIESCENCE_MS,
        leaseDurationMs: number = DEFAULT_LEASE_DURATION_MS,
        now: () => Date = () => new Date(),
    ) {
        this.wallet = wallet;
        this.sessionRepository = sessionRepository;
        this.idempotencyRepository = idempotencyRepository;
        this.operationLog = operationLog;
        this.structurallyOwned = structurallyOwned;
        this.exclusiveStartupAuthority = exclusiveStartupAuthority;
        this.minimumQuiescenceMs = minimumQuiescenceMs;
        this.leaseDurationMs = leaseDurationMs;
        this.now = now;
    }

    public async reconcileOne(sessionId: string, requestId: string): Promise<SpinReconciliationOutcome> {
        try {
            return await this.reconcileOneInternal(sessionId, requestId);
        } catch (error) {
            let record: SpinOperationRecord | undefined;
            try {
                record = await this.operationLog.load(sessionId, requestId);
            } catch {
                // The operationLog itself is what's failing — nothing more to learn here.
            }
            return {
                status: "manual-recovery-required",
                sessionId,
                requestId,
                reason: `Reconciliation itself failed unexpectedly: ${error instanceof Error ? error.message : String(error)}.`,
                record: record ?? this.placeholderRecord(sessionId, requestId),
            };
        }
    }

    public async reconcileAll(): Promise<readonly SpinReconciliationOutcome[]> {
        const pending = await this.operationLog.listIncomplete();
        const outcomes: SpinReconciliationOutcome[] = [];
        for (const record of pending) {
            outcomes.push(await this.reconcileOne(record.sessionId, record.requestId));
        }
        return outcomes;
    }

    private async reconcileOneInternal(sessionId: string, requestId: string): Promise<SpinReconciliationOutcome> {
        const record = await this.operationLog.load(sessionId, requestId);
        if (record === undefined) {
            return {status: "no-action-needed", sessionId, requestId, reason: "No operation record found for this requestId — nothing to reconcile."};
        }

        switch (record.checkpoint) {
            case "committed":
                // Terminal in the sense that nothing further ever happens to *this attempt* once written
                // (playAndSettle() only returns after it) — so there's no live-attempt race to defer or
                // gate ownership for here, unlike every non-terminal checkpoint below. Still re-verified
                // against idempotencyRepository directly rather than trusted blindly — see the class doc
                // comment. Its own backfill writes only ever the same, already-fully-computed value
                // regardless of who does it or how many times, so it's deliberately not gated on
                // ownership either — unlike reversing a debit or resuming a settlement, there is no live
                // state here it could race or clobber.
                return this.reconcileCommitted(record);

            case "compensated":
                // Also terminal the same way: written only after this attempt's own compensating writes
                // already finished, synchronously, in the same call — no live-attempt race possible.
                await this.operationLog.delete(sessionId, requestId);
                return {
                    status: "no-action-needed",
                    sessionId,
                    requestId,
                    reason: "This attempt already fully compensated in-process — wallet and session were already restored.",
                };

            case "started":
            case "debited": {
                const deferred = this.deferIfNotYetQuiescent(record);
                if (deferred !== undefined) {
                    return deferred;
                }
                return this.withOwnership(record, (ownershipToken) => this.reconcileNotYetSettled(record, ownershipToken));
            }

            case "settled":
            case "session-saved": {
                const deferred = this.deferIfNotYetQuiescent(record);
                if (deferred !== undefined) {
                    return deferred;
                }
                return this.withOwnership(record, (ownershipToken) => this.reconcileSettled(record, ownershipToken));
            }

            default:
                // Exhaustive over every SpinOperationCheckpoint above — unreachable in practice, kept
                // only to satisfy the linter's own consistent-return rule.
                return {status: "no-action-needed", sessionId, requestId, reason: `Unrecognized checkpoint "${String(record.checkpoint)}"; nothing to do.`};
        }
    }

    // See the class doc comment's "Racing a live attempt" section. Returns a "deferred" outcome when
    // "record" was updated too recently to safely assume it's abandoned rather than still actively
    // progressing; undefined when it's old enough to act on.
    private deferIfNotYetQuiescent(record: SpinOperationRecord): SpinReconciliationOutcome | undefined {
        const updatedAtMs = Date.parse(record.updatedAt);
        const ageMs = this.now().getTime() - updatedAtMs;
        if (Number.isNaN(updatedAtMs) || ageMs < this.minimumQuiescenceMs) {
            return {
                status: "deferred",
                sessionId: record.sessionId,
                requestId: record.requestId,
                reason:
                    `This attempt's own checkpoint ("${record.checkpoint}") was last updated ` +
                    `${Number.isNaN(updatedAtMs) ? "at an unparseable timestamp" : `${ageMs}ms ago`} — too recently to safely assume it's ` +
                    "genuinely abandoned rather than still actively in flight; reconciling it now risks racing a live attempt. Retry once " +
                    `it has been quiescent for at least ${this.minimumQuiescenceMs}ms.`,
            };
        }
        return undefined;
    }

    // See the class doc comment's "Ownership, not just age" section. Runs "action" — passing it the won
    // lease's own owner token, or undefined when structurallyOwned made a lease unnecessary — only once
    // authority over "record" is confirmed; otherwise returns manual-recovery-required (no authority
    // possible at all) or "deferred" (a lease is held by someone else right now).
    private async withOwnership(
        record: SpinOperationRecord,
        action: (ownershipToken: string | undefined) => Promise<SpinReconciliationOutcome>,
    ): Promise<SpinReconciliationOutcome> {
        const {sessionId, requestId} = record;

        if (this.structurallyOwned) {
            return action(undefined);
        }

        if (!this.exclusiveStartupAuthority) {
            return {
                status: "manual-recovery-required",
                sessionId,
                requestId,
                reason:
                    "No confirmed authority to safely mutate this record: this SpinReconciliationService has no structural same-instance " +
                    "guarantee (only SpinCommandHandler's own reconcileOne()/reconcileAll() have that — see its own doc comment) and no " +
                    "exclusiveStartupAuthority was granted. Neither a checkpoint's own age nor a successfully won reconciliation lease is " +
                    "ever sufficient authority on its own — a lease only ever serializes reconcilers against *each other*, never against a " +
                    "live SpinCommandHandler attempt that was never told to acquire or respect one. Resolve by hand, construct this " +
                    "service with exclusiveStartupAuthority: true only when no handler is running anywhere against these same stores " +
                    "(e.g. a dedicated startup sweep before serving traffic), or reconcile through a trusted same-instance handler instead.",
                record,
            };
        }

        if (!isSpinOperationLeasing(this.operationLog)) {
            // exclusiveStartupAuthority alone (no leasing support) is still honored — the operator has
            // already certified sole access; leasing, when available, is additional protection against
            // multiple reconciler processes/workers racing *each other* under that same certified
            // authority, not a further requirement for the authority itself to be honored.
            return action(undefined);
        }

        const ownerToken = await this.operationLog.tryClaimForReconciliation(sessionId, requestId, this.leaseDurationMs);
        if (ownerToken === undefined) {
            return {
                status: "deferred",
                sessionId,
                requestId,
                reason: "Another reconciliation claim is currently held for this record — deferring rather than risking a concurrent mutation.",
            };
        }
        try {
            return await action(ownerToken);
        } finally {
            await this.operationLog.releaseReconciliationClaim(sessionId, requestId, ownerToken);
        }
    }

    // Re-verifies (and, on success, extends) a lease immediately before the actual mutating step it
    // guards — see SpinOperationLeasing's own doc comment on why this narrows, without eliminating, the
    // window in which a claim could lapse mid-reconciliation. Always true when ownershipToken is
    // undefined (structurallyOwned, or exclusiveStartupAuthority without leasing support — both already
    // trusted for this call's whole duration, nothing further to check).
    private confirmOwnership(record: SpinOperationRecord, ownershipToken: string | undefined): Promise<boolean> {
        if (ownershipToken === undefined) {
            return Promise.resolve(true);
        }
        if (!isSpinOperationLeasing(this.operationLog)) {
            // Structurally unreachable — a token is only ever minted when leasing is supported — kept as
            // a fail-safe rather than a cast.
            return Promise.resolve(false);
        }
        return this.operationLog.renewReconciliationClaim(record.sessionId, record.requestId, ownershipToken, this.leaseDurationMs);
    }

    private ownershipLapsedOutcome(record: SpinOperationRecord): SpinReconciliationOutcome {
        return {
            status: "manual-recovery-required",
            sessionId: record.sessionId,
            requestId: record.requestId,
            reason:
                "This reconciliation's own claim on the record lapsed (expired, or was superseded by another claimant) partway through " +
                "— stopped here rather than risk mutating it concurrently with whoever holds the claim now. Resolve by hand.",
            record,
        };
    }

    // Handles both "started" and "debited": neither checkpoint alone proves what actually happened next
    // (a crash can land after the underlying wallet call already succeeded but before the matching
    // checkpoint write does) — so both are resolved the same way, by asking the wallet directly rather
    // than trusting either checkpoint value as proof of what did NOT happen. Always manual-recovery-
    // required when the wallet can't be asked at all. Only ever reached once withOwnership() above has
    // confirmed this call is authorized to mutate this record; re-confirms that authority again
    // immediately before the one actual mutating step (wallet.reverse()) via confirmOwnership().
    private async reconcileNotYetSettled(record: SpinOperationRecord, ownershipToken: string | undefined): Promise<SpinReconciliationOutcome> {
        const {sessionId, requestId} = record;

        if (!isWalletTransactionInspecting(this.wallet)) {
            return {
                status: "manual-recovery-required",
                sessionId,
                requestId,
                reason:
                    `This attempt's own checkpoint ("${record.checkpoint}") only proves the wallet's state as of when it was last ` +
                    "durably recorded, not what happened afterward — a debit can complete before a crash prevents the matching checkpoint " +
                    `write from ever landing. Whether the stake debit ("${record.debitTransactionId}") and/or the win settlement ` +
                    `("${record.creditTransactionId}") actually applied is unknown, and this wallet doesn't support transaction ` +
                    "inspection to check. Resolve by inspecting the wallet's own records directly.",
                record,
            };
        }

        const debitStatus = await this.wallet.getTransactionStatus(sessionId, record.debitTransactionId);
        const creditStatus = await this.wallet.getTransactionStatus(sessionId, record.creditTransactionId);

        if (creditStatus === "applied") {
            return {
                status: "manual-recovery-required",
                sessionId,
                requestId,
                reason:
                    `The wallet reports the win settlement ("${record.creditTransactionId}") as applied, but this attempt's own ` +
                    `operation record never advanced past "${record.checkpoint}" — the checkpoint and wallet reality disagree in a way ` +
                    "that can't be safely resolved automatically (no captured session-state result to resume from). Resolve by hand.",
                record,
            };
        }

        if (!(await this.confirmOwnership(record, ownershipToken))) {
            return this.ownershipLapsedOutcome(record);
        }

        if (debitStatus !== "applied") {
            // Neither leg is currently applied — whether because neither ever ran, or an earlier
            // (possibly interrupted) reconciliation already cleaned this up — safe to treat as a clean
            // slate for a fresh retry.
            await this.operationLog.delete(sessionId, requestId);
            return {
                status: "no-action-needed",
                sessionId,
                requestId,
                reason: `Checkpoint "${record.checkpoint}", but the wallet confirms neither the debit nor the win settlement is currently applied — nothing to undo.`,
            };
        }

        // debitStatus === "applied", creditStatus is "absent" or "reversed" — the stake was charged but
        // the win settlement never landed; reversing the debit (idempotent — a no-op if it's already
        // reversed) restores a clean pre-attempt wallet state.
        await this.wallet.reverse(sessionId, record.debitTransactionId);
        await this.operationLog.delete(sessionId, requestId);
        return {
            status: "reversed",
            sessionId,
            requestId,
            reason: `The stake debit ("${record.debitTransactionId}") was applied but the win settlement never was — reversed the debit.`,
        };
    }

    // The win settlement (both wallet legs) was confirmed applied when the checkpoint was written — this
    // attempt's own capturedResult carries everything needed to finish it without ever recomputing
    // session.play(). Only the still-outstanding step(s) — persisting the session state (if checkpoint
    // is exactly "settled") and the idempotency result — are (re)applied here, each already-idempotent on
    // its own terms (a repeat save() with the same value is harmless; saveVersioned() either succeeds
    // identically or reports a genuine conflict). Only ever reached once withOwnership() above has
    // confirmed this call is authorized to mutate this record; re-confirms that authority again
    // immediately before starting the mutating writes via confirmOwnership().
    //
    // Never auto-resumes without durable proof the wallet is still actually settled — see
    // verifyDurableSettlement() and the class doc comment's own "No durable proof, no auto-resume"
    // section. That covers both a known mismatch (e.g. a same-process compensation partially reversed the
    // wallet without also restoring the session) and simply having no way to check at all.
    private async reconcileSettled(record: SpinOperationRecord, ownershipToken: string | undefined): Promise<SpinReconciliationOutcome> {
        const {sessionId, requestId} = record;
        const captured = record.capturedResult;
        if (captured === undefined) {
            // Invariant violation guard, not an expected path: playAndSettle() always writes
            // capturedResult in the same call that advances the checkpoint to "settled" or beyond.
            return {
                status: "manual-recovery-required",
                sessionId,
                requestId,
                reason: `Operation record's checkpoint is "${record.checkpoint}" but it's missing its own capturedResult — this should never happen; resolve by hand.`,
                record,
            };
        }

        const verification = await this.verifyDurableSettlement(record);
        if (!verification.verified) {
            return {
                status: "manual-recovery-required",
                sessionId,
                requestId,
                reason:
                    `Operation record's checkpoint is "${record.checkpoint}" (implying the wallet is still fully settled for this ` +
                    `attempt), but ${verification.reason} Resuming would risk silently writing an idempotency result claiming a ` +
                    "settlement that doesn't actually hold. Resolve by hand.",
                record,
            };
        }

        if (!(await this.confirmOwnership(record, ownershipToken))) {
            return this.ownershipLapsedOutcome(record);
        }

        let newVersion = captured.newVersion;
        if (record.checkpoint === "settled") {
            try {
                if (isVersionedSessionRepository(this.sessionRepository) && record.expectedVersion !== undefined) {
                    newVersion = await this.sessionRepository.saveVersioned(sessionId, captured.newState, record.expectedVersion);
                } else {
                    await this.sessionRepository.save(sessionId, captured.newState);
                }
            } catch (error) {
                if (error instanceof SessionVersionConflictError) {
                    return {
                        status: "manual-recovery-required",
                        sessionId,
                        requestId,
                        reason:
                            "The wallet was already fully settled for this attempt, but its session state moved on before this could be " +
                            `persisted (${error.message}) — resuming would silently overwrite whatever committed in between. Resolve by hand.`,
                        record,
                    };
                }
                throw error;
            }
        }

        const finalCaptured: SpinOperationCapturedResult = {...captured, newVersion};
        const result = this.buildPlayedResult(record, finalCaptured);
        await this.idempotencyRepository.save(sessionId, requestId, result);
        await this.operationLog.record({...record, checkpoint: "committed", updatedAt: new Date().toISOString(), capturedResult: finalCaptured});

        return {
            status: "resumed",
            sessionId,
            requestId,
            reason:
                record.checkpoint === "settled"
                    ? "The wallet was already fully settled — persisted the already-computed session state and idempotency result without re-playing the round."
                    : "The wallet and session state were already fully settled — persisted only the missing idempotency result without re-playing the round.",
            result,
        };
    }

    // A "committed" record proves this handler's own process believed the idempotency write succeeded —
    // never that idempotencyRepository still has it (see the class doc comment). Re-verified directly,
    // and backfilled from the record's own capturedResult (never re-playing) when it's missing; a record
    // with no capturedResult to rebuild from, or whose wallet no longer matches what "committed" implies,
    // is manual-recovery-required rather than ever falling through to a fresh spin. Not gated on
    // ownership — see reconcileOneInternal's own "committed" case for why.
    private async reconcileCommitted(record: SpinOperationRecord): Promise<SpinReconciliationOutcome> {
        const {sessionId, requestId} = record;
        const alreadyCached = await this.idempotencyRepository.load(sessionId, requestId);
        if (alreadyCached !== undefined) {
            return {
                status: "already-committed",
                sessionId,
                requestId,
                reason: 'This attempt already reached the terminal "committed" checkpoint, and idempotencyRepository already holds its result.',
            };
        }

        if (record.capturedResult === undefined) {
            return {
                status: "manual-recovery-required",
                sessionId,
                requestId,
                reason:
                    'This attempt\'s operation record reached the terminal "committed" checkpoint, but idempotencyRepository has no ' +
                    "result for it and there's no captured data left to safely rebuild one from. Never falling through to a fresh, " +
                    "re-charging spin for an already-committed requestId — resolve by hand.",
                record,
            };
        }

        const verification = await this.verifyDurableSettlement(record);
        if (!verification.verified) {
            return {
                status: "manual-recovery-required",
                sessionId,
                requestId,
                reason:
                    'This attempt\'s operation record reached the terminal "committed" checkpoint (implying the wallet is fully settled ' +
                    `for it), but ${verification.reason} idempotencyRepository is missing its result, and backfilling now would risk ` +
                    "silently disagreeing with the wallet's own current state. Resolve by hand.",
                record,
            };
        }

        const result = this.buildPlayedResult(record, record.capturedResult);
        await this.idempotencyRepository.save(sessionId, requestId, result);

        return {
            status: "resumed",
            sessionId,
            requestId,
            reason:
                'This attempt already reached the terminal "committed" checkpoint, but idempotencyRepository was missing its result — ' +
                "backfilled it from the attempt's own captured data, never re-playing the round.",
            result,
        };
    }

    // Whether the wallet's own current state can be *durably confirmed* to still match what a
    // "settled"/"session-saved"/"committed" checkpoint implies (both legs "applied"). Verified is true
    // only when asked directly and confirmed — never inferred, and never assumed true just because
    // nothing contradicts it. See the class doc comment's "No durable proof, no auto-resume" section:
    // this is what makes "can't verify" and "verified mismatch" both refuse to auto-resume, not just the
    // latter. The seam is deliberately named around "durable settlement proof" in general, even though
    // WalletTransactionInspecting is the only such proof this package currently knows how to check.
    private async verifyDurableSettlement(record: SpinOperationRecord): Promise<{verified: true} | {verified: false; reason: string}> {
        if (!isWalletTransactionInspecting(this.wallet)) {
            return {
                verified: false,
                reason:
                    "no durable settlement proof is available for this wallet — it doesn't implement WalletTransactionInspecting, and no " +
                    "other explicit durable settlement-proof mechanism is configured, so there's no way to confirm the wallet is still " +
                    "actually settled before trusting the checkpoint.",
            };
        }
        const debitStatus = await this.wallet.getTransactionStatus(record.sessionId, record.debitTransactionId);
        const creditStatus = await this.wallet.getTransactionStatus(record.sessionId, record.creditTransactionId);
        if (debitStatus !== "applied" || creditStatus !== "applied") {
            return {
                verified: false,
                reason:
                    `the wallet reports debit="${debitStatus}"/credit="${creditStatus}", not "applied"/"applied" as the checkpoint ` +
                    "implies — most likely a same-process compensation partially reversed the wallet without also restoring the session " +
                    "state.",
            };
        }
        return {verified: true};
    }

    private buildPlayedResult(record: SpinOperationRecord, captured: SpinOperationCapturedResult): SpinCommandResult {
        return {
            status: "played",
            sessionId: record.sessionId,
            state: captured.newState,
            previousState: captured.previousState,
            credits: captured.credits,
            win: captured.win,
            requestId: record.requestId,
            ...(captured.newVersion !== undefined ? {version: captured.newVersion} : {}),
        };
    }

    private placeholderRecord(sessionId: string, requestId: string): SpinOperationRecord {
        return {
            sessionId,
            requestId,
            attemptId: "unknown",
            debitTransactionId: "unknown",
            creditTransactionId: "unknown",
            stakeAmount: 0,
            expectedVersion: undefined,
            checkpoint: "started",
            startedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
    }
}
