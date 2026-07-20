import {isVersionedSessionRepository} from "../session/isVersionedSessionRepository.js";
import {SessionVersionConflictError} from "../session/SessionVersionConflictError.js";
import type {SessionRepository} from "../session/SessionRepository.js";
import {isWalletTransactionInspecting} from "../wallet/isWalletTransactionInspecting.js";
import type {TransactionalWalletPort} from "../wallet/TransactionalWalletPort.js";
import type {IdempotencyRepository} from "../idempotency/IdempotencyRepository.js";
import type {SpinCommandResult} from "./SpinCommandResult.js";
import type {SpinOperationLog} from "./SpinOperationLog.js";
import type {SpinOperationRecord} from "./SpinOperationRecord.js";
import type {SpinReconciliationOutcome} from "./SpinReconciliationOutcome.js";
import type {SpinReconciliationServicing} from "./SpinReconciliationServicing.js";

// Resolves one requestId-bearing SpinOperationRecord left in-flight by a process crash (or a
// same-process compensation failure — see SpinCommandHandler's own catch block) into exactly one of:
// "no-action-needed" (nothing was ever applied), "already-committed" (nothing to do, it finished), a
// safe automatic "reversed" or "resumed", or an honest "manual-recovery-required" when neither can be
// established safely. Never claims true atomicity — see this package's own v1.3 gap-audit note on why
// full cross-store atomicity is a v2 concern: every branch below only ever acts when it can be certain,
// and defers to a human otherwise.
//
// Deliberately has no PokieGame/live-session access at all — constructed from only the wallet,
// sessionRepository, idempotencyRepository, and operationLog a SpinCommandHandler itself already holds.
// That is not an incidental narrowing: it makes it structurally impossible for this class to call
// session.play() a second time for an attempt it's recovering, no matter what a future change here might
// try to do — resuming an attempt can only ever replay already-computed data (SpinOperationRecord's own
// capturedResult), never recompute it.
export class SpinReconciliationService implements SpinReconciliationServicing {
    private readonly wallet: TransactionalWalletPort;
    private readonly sessionRepository: SessionRepository;
    private readonly idempotencyRepository: IdempotencyRepository<SpinCommandResult>;
    private readonly operationLog: SpinOperationLog;

    constructor(
        wallet: TransactionalWalletPort,
        sessionRepository: SessionRepository,
        idempotencyRepository: IdempotencyRepository<SpinCommandResult>,
        operationLog: SpinOperationLog,
    ) {
        this.wallet = wallet;
        this.sessionRepository = sessionRepository;
        this.idempotencyRepository = idempotencyRepository;
        this.operationLog = operationLog;
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
                return {status: "already-committed", sessionId, requestId, reason: "This attempt already reached the terminal committed checkpoint."};

            case "compensated":
                await this.operationLog.delete(sessionId, requestId);
                return {
                    status: "no-action-needed",
                    sessionId,
                    requestId,
                    reason: "This attempt already fully compensated in-process — wallet and session were already restored.",
                };

            case "started":
                // By code order alone: nothing was applied yet when this checkpoint was written (it's
                // written before the debit is even attempted) — always safe, regardless of wallet
                // inspection support.
                await this.operationLog.delete(sessionId, requestId);
                return {
                    status: "no-action-needed",
                    sessionId,
                    requestId,
                    reason: "This attempt never got past the 'started' checkpoint — the stake debit was never attempted, nothing to undo.",
                };

            case "debited":
                return this.reconcileDebitedOnly(record);

            case "settled":
            case "session-saved":
                return this.reconcileSettled(record);

            default:
                // Exhaustive over every SpinOperationCheckpoint above — unreachable in practice, kept
                // only to satisfy the linter's own consistent-return rule.
                return {status: "no-action-needed", sessionId, requestId, reason: `Unrecognized checkpoint "${String(record.checkpoint)}"; nothing to do.`};
        }
    }

    // The wallet debit was confirmed applied; whether the matching win settlement also applied before a
    // crash is unknown from the checkpoint alone. Resolved for certain only when the wallet can be asked
    // directly (WalletTransactionInspecting) — otherwise this is always manual-recovery-required, since
    // reversing the debit blindly could leave an already-applied credit un-reversed.
    private async reconcileDebitedOnly(record: SpinOperationRecord): Promise<SpinReconciliationOutcome> {
        const {sessionId, requestId} = record;

        if (!isWalletTransactionInspecting(this.wallet)) {
            return {
                status: "manual-recovery-required",
                sessionId,
                requestId,
                reason:
                    `The stake debit ("${record.debitTransactionId}") was applied, but whether the matching win settlement ` +
                    `("${record.creditTransactionId}") also applied before the process stopped is unknown, and this wallet doesn't ` +
                    "support transaction inspection to check — reversing the debit without knowing could leave an already-applied " +
                    "credit un-reversed. Resolve by inspecting the wallet's own records directly.",
                record,
            };
        }

        const creditStatus = await this.wallet.getTransactionStatus(sessionId, record.creditTransactionId);
        if (creditStatus === "applied") {
            return {
                status: "manual-recovery-required",
                sessionId,
                requestId,
                reason:
                    `The wallet reports the win settlement ("${record.creditTransactionId}") as applied, but this attempt's own ` +
                    'operation record never advanced past "debited" — the checkpoint and wallet reality disagree in a way that ' +
                    "can't be safely resolved automatically (no captured session-state result to resume from). Resolve by hand.",
                record,
            };
        }

        // creditStatus is "absent" or "reversed" — the win settlement is not currently in effect, so
        // reversing the debit (idempotent — a no-op if it's already reversed) restores a clean
        // pre-attempt wallet state.
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
    // identically or reports a genuine conflict).
    //
    // Before trusting that, though: this checkpoint only proves the wallet *was* settled at the moment it
    // was written — not that it still is. A same-process compensation failure (see SpinCommandHandler's
    // own catch block) can leave the checkpoint at "settled"/"session-saved" (session restore failed)
    // while the wallet reversal it ran alongside *succeeded* — the one partial-compensation combination
    // that would make a blind resume silently disagree with the wallet's own current state. When the
    // wallet supports inspection, both legs are re-verified as still "applied" before resuming; a
    // mismatch is always manual-recovery-required, never guessed at. Without inspection this specific
    // partial-compensation race remains a real, narrow, documented residual risk (never a concern for a
    // genuine process crash, since no compensation ever runs in that case at all).
    private async reconcileSettled(record: SpinOperationRecord): Promise<SpinReconciliationOutcome> {
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

        if (isWalletTransactionInspecting(this.wallet)) {
            const debitStatus = await this.wallet.getTransactionStatus(sessionId, record.debitTransactionId);
            const creditStatus = await this.wallet.getTransactionStatus(sessionId, record.creditTransactionId);
            if (debitStatus !== "applied" || creditStatus !== "applied") {
                return {
                    status: "manual-recovery-required",
                    sessionId,
                    requestId,
                    reason:
                        `Operation record's checkpoint is "${record.checkpoint}" (implying the wallet is still fully settled for this ` +
                        `attempt), but the wallet reports debit="${debitStatus}"/credit="${creditStatus}" — most likely a same-process ` +
                        "compensation partially reversed the wallet without also restoring the session state. Resuming would silently " +
                        "write an idempotency result claiming a settlement the wallet no longer reflects. Resolve by hand.",
                    record,
                };
            }
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

        const result: SpinCommandResult = {
            status: "played",
            sessionId,
            state: captured.newState,
            previousState: captured.previousState,
            credits: captured.credits,
            win: captured.win,
            requestId,
            ...(newVersion !== undefined ? {version: newVersion} : {}),
        };
        await this.idempotencyRepository.save(sessionId, requestId, result);
        await this.operationLog.record({...record, checkpoint: "committed", updatedAt: new Date().toISOString()});

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
