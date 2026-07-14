import crypto from "crypto";
import {buildPreGeneratedRoundResult} from "../../pregenerated/buildPreGeneratedRoundResult.js";
import {deriveDeterministicSeed} from "../../pregenerated/internal/deriveDeterministicSeed.js";
import type {PreGeneratedRoundTransaction} from "../../pregenerated/PreGeneratedRoundTransaction.js";
import {SeededWeightedOutcomeRandomSource} from "../../pregenerated/SeededWeightedOutcomeRandomSource.js";
import {WeightedOutcomeSelector} from "../../pregenerated/WeightedOutcomeSelector.js";
import type {WeightedOutcomeLibrary} from "../../weightedoutcome/WeightedOutcomeLibrary.js";
import {InMemoryIdempotencyRepository} from "../idempotency/InMemoryIdempotencyRepository.js";
import type {IdempotencyRepository} from "../idempotency/IdempotencyRepository.js";
import type {TransactionalWalletPort} from "../wallet/TransactionalWalletPort.js";
import {InMemoryPreGeneratedSessionRepository} from "./InMemoryPreGeneratedSessionRepository.js";
import type {PreGeneratedSessionRepository} from "./PreGeneratedSessionRepository.js";
import type {PreGeneratedSessionState} from "./PreGeneratedSessionState.js";
import type {PreGeneratedSpinCommandHandling} from "./PreGeneratedSpinCommandHandling.js";
import type {PreGeneratedSpinCommandResult} from "./PreGeneratedSpinCommandResult.js";

// Orchestrates a single pre-generated round end-to-end: replay an idempotent retry, load the session's
// (tiny — see PreGeneratedSessionState) persisted state, deterministically select the next round's
// outcome from a fixed WeightedOutcomeLibrary (never running a game's own calculation path), settle the
// wallet from that outcome's already-known stake/totalWin, and persist the new state together with the
// idempotency result as one committed outcome. Mirrors SpinCommandHandler's own orchestration shape
// (idempotency replay, per-session serialization, wallet settlement, best-effort compensation) applied
// to a fixed, pre-enumerated library instead of a live GameSessionHandling.
//
// Every command for a given sessionId is serialized through a per-session queue (see enqueue()), same
// mechanism and same rationale as SpinCommandHandler: it's what makes a concurrently repeated requestId
// safe without a separate "in-flight" cache.
//
// Wallet settlement needs no live-session reconciliation the way SpinCommandHandler's does — the
// outcome's own artifact.stake/artifact.totalWin are already exact, canonical numbers, so this simply
// debits the stake and (when totalWin > 0) credits the win, in that order.
//
// Round-to-round determinism: round index `state.roundsPlayed + 1` combined with the session's own
// seed (see deriveDeterministicSeed) is what PreGeneratedRoundReplayer reproduces later — the session
// itself never stores anything about *which* outcome a past round drew, only how many rounds have been
// played, since the outcome is always exactly reproducible from (seed, round) against the same library.
//
// Best-effort compensation on failure mirrors SpinCommandHandler's own: every wallet transaction this
// attempt applied is individually reversed, and an already-saved session state is restored to what it
// was before this attempt — see SpinCommandHandler's class doc comment for the same process-crash and
// compensation-failure caveats, which apply here identically.
export class PreGeneratedSpinCommandHandler<T extends string | number = string> implements PreGeneratedSpinCommandHandling<T> {
    private readonly library: WeightedOutcomeLibrary<T>;
    private readonly libraryHash: string;
    private readonly wallet: TransactionalWalletPort;
    private readonly sessionRepository: PreGeneratedSessionRepository;
    private readonly idempotencyRepository: IdempotencyRepository<PreGeneratedSpinCommandResult<T>>;
    private readonly selector = new WeightedOutcomeSelector();
    private readonly sessionQueues = new Map<string, Promise<unknown>>();

    constructor(
        library: WeightedOutcomeLibrary<T>,
        libraryHash: string,
        wallet: TransactionalWalletPort,
        sessionRepository: PreGeneratedSessionRepository = new InMemoryPreGeneratedSessionRepository(),
        idempotencyRepository: IdempotencyRepository<PreGeneratedSpinCommandResult<T>> = new InMemoryIdempotencyRepository(),
    ) {
        this.library = library;
        this.libraryHash = libraryHash;
        this.wallet = wallet;
        this.sessionRepository = sessionRepository;
        this.idempotencyRepository = idempotencyRepository;
    }

    public handle(sessionId: string, requestId?: string): Promise<PreGeneratedSpinCommandResult<T>> {
        return this.enqueue(sessionId, () => this.handleSerialized(sessionId, requestId));
    }

    // Identical mechanism to SpinCommandHandler's own enqueue(): chains `work` onto whatever is already
    // queued for `sessionId`, so a concurrently repeated requestId only ever runs once.
    private enqueue<R>(sessionId: string, work: () => Promise<R>): Promise<R> {
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

    private async handleSerialized(sessionId: string, requestId: string | undefined): Promise<PreGeneratedSpinCommandResult<T>> {
        if (requestId !== undefined) {
            const cached = await this.idempotencyRepository.load(sessionId, requestId);
            if (cached !== undefined) {
                return cached;
            }
        }

        const state = await this.sessionRepository.load(sessionId);
        if (!state) {
            return {status: "not-found", sessionId};
        }

        return this.selectAndSettle(sessionId, state, requestId);
    }

    private async selectAndSettle(
        sessionId: string,
        state: PreGeneratedSessionState,
        requestId: string | undefined,
    ): Promise<PreGeneratedSpinCommandResult<T>> {
        const round = state.roundsPlayed + 1;
        const roundId = requestId ?? crypto.randomUUID();
        const randomSource = new SeededWeightedOutcomeRandomSource(deriveDeterministicSeed(state.seed, round));
        const outcome = this.selector.select(this.library, randomSource);

        const debitTransactionId = `${roundId}:debit`;
        const creditTransactionId = `${roundId}:credit`;
        const appliedTransactionIds: string[] = [];
        let sessionStateSaved = false;

        try {
            const balanceBefore = await this.wallet.getBalance(sessionId);
            let balanceAfter = await this.wallet.debit(sessionId, debitTransactionId, outcome.artifact.stake);
            appliedTransactionIds.push(debitTransactionId);

            const transactions: PreGeneratedRoundTransaction[] = [
                {id: debitTransactionId, type: "debit", amount: outcome.artifact.stake},
            ];
            if (outcome.artifact.totalWin > 0) {
                balanceAfter = await this.wallet.credit(sessionId, creditTransactionId, outcome.artifact.totalWin);
                appliedTransactionIds.push(creditTransactionId);
                transactions.push({id: creditTransactionId, type: "credit", amount: outcome.artifact.totalWin});
            }

            const result = buildPreGeneratedRoundResult({
                library: this.library,
                libraryHash: this.libraryHash,
                outcome,
                runtime: {
                    roundId,
                    sessionId,
                    ...(requestId !== undefined ? {requestId} : {}),
                    balanceBefore,
                    balanceAfter,
                    transactions,
                },
            });

            const newState: PreGeneratedSessionState = {libraryId: this.library.libraryId, seed: state.seed, roundsPlayed: round};
            await this.sessionRepository.save(sessionId, newState);
            sessionStateSaved = true;

            const commandResult: PreGeneratedSpinCommandResult<T> = {status: "played", sessionId, result};
            if (requestId !== undefined) {
                await this.idempotencyRepository.save(sessionId, requestId, commandResult);
            }
            return commandResult;
        } catch (error) {
            if (sessionStateSaved) {
                await this.restoreSessionState(sessionId, state);
            }
            await this.reverseApplied(sessionId, appliedTransactionIds);
            throw error;
        }
    }

    // Best-effort compensating write, undoing this attempt's own sessionRepository.save() when a later
    // step (persisting the idempotency result) fails — see the class doc comment for the risk
    // discussion this shares with SpinCommandHandler's own restoreSessionState().
    private async restoreSessionState(sessionId: string, state: PreGeneratedSessionState): Promise<void> {
        try {
            await this.sessionRepository.save(sessionId, state);
        } catch {
            // The error that triggered this restore is what the caller of handle() sees; a failure to
            // restore shouldn't replace or hide it.
        }
    }

    private async reverseApplied(sessionId: string, transactionIds: string[]): Promise<void> {
        for (const transactionId of transactionIds.slice().reverse()) {
            try {
                await this.wallet.reverse(sessionId, transactionId);
            } catch {
                // Best-effort compensation — see the class doc comment.
            }
        }
    }
}
