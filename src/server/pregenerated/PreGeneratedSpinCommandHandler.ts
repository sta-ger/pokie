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
import {isVersionedPreGeneratedSessionRepository} from "./isVersionedPreGeneratedSessionRepository.js";
import {PreGeneratedSessionVersionConflictError} from "./PreGeneratedSessionVersionConflictError.js";
import type {PreGeneratedSessionRepository} from "./PreGeneratedSessionRepository.js";
import type {PreGeneratedSessionState} from "./PreGeneratedSessionState.js";
import type {PreGeneratedSpinCommandHandling} from "./PreGeneratedSpinCommandHandling.js";
import type {PreGeneratedSpinCommandResult} from "./PreGeneratedSpinCommandResult.js";

// Orchestrates a single pre-generated round end-to-end: replay an idempotent retry, load the session's
// (tiny — see PreGeneratedSessionState) persisted state, deterministically select the next round's
// outcome from a fixed WeightedOutcomeLibrary (never running a game's own calculation path), settle the
// wallet from that outcome's already-known stake/totalWin, and persist the new state together with the
// idempotency result as one committed outcome. Mirrors SpinCommandHandler's own orchestration shape
// (idempotency replay, per-session serialization, wallet settlement, best-effort compensation,
// optimistic-locking conflict detection) applied to a fixed, pre-enumerated library instead of a live
// GameSessionHandling.
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
// Library identity check: before doing anything else, a loaded session's own `libraryId`/`libraryHash`
// (stamped at creation) is compared against this handler's configured library. A mismatch — a session
// created against a different library, or a same-id library since regenerated with different content —
// returns a "conflict" result immediately, before any wallet transaction, rather than silently drawing
// a round from content the session was never meant to be played against.
//
// Optimistic locking: when sessionRepository additionally implements VersionedPreGeneratedSessionRepository
// (see isVersionedPreGeneratedSessionRepository.ts — InMemoryPreGeneratedSessionRepository does), the
// state loaded at the start of an attempt is saved back via saveVersioned() with the version it was read
// at, instead of the plain unconditional save(). This mainly protects a repository *shared across
// multiple PreGeneratedSpinCommandHandler instances* — within one instance, every command for a given
// sessionId is already serialized through enqueue()/sessionQueues above, so its own load-then-save can
// never race against itself. A version mismatch (someone else's save landed in between) surfaces as a
// PreGeneratedSessionVersionConflictError, caught below and turned into a "conflict"
// PreGeneratedSpinCommandResult after the same wallet-reversal/session-eviction compensation any other
// mid-flight failure gets — never a silent overwrite of whatever the other attempt committed.
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

        const {state, version} = await this.loadState(sessionId);
        if (!state) {
            return {status: "not-found", sessionId};
        }

        // Checked before anything else mutates: nothing has been applied yet (no wallet transaction, no
        // selection), so there's nothing to compensate — unlike the storage-level version conflict below,
        // which can only be discovered after settlement has already run.
        if (state.libraryId !== this.library.libraryId || state.libraryHash !== this.libraryHash) {
            return {
                status: "conflict",
                sessionId,
                reason:
                    `Session "${sessionId}" was created against a different library than this handler is configured ` +
                    `with (libraryId "${state.libraryId}"/hash "${state.libraryHash}" vs configured libraryId ` +
                    `"${this.library.libraryId}"/hash "${this.libraryHash}").`,
            };
        }

        return this.selectAndSettle(sessionId, state, version, requestId);
    }

    // Reads both the state and, when sessionRepository supports it, the version it was read at — a
    // single call either way, never a redundant second read on the plain-repository path. Mirrors
    // SpinCommandHandler's own loadState() exactly.
    private async loadState(sessionId: string): Promise<{state: PreGeneratedSessionState | undefined; version: number | undefined}> {
        if (isVersionedPreGeneratedSessionRepository(this.sessionRepository)) {
            const versioned = await this.sessionRepository.loadVersioned(sessionId);
            return {state: versioned?.state, version: versioned?.version};
        }
        return {state: await this.sessionRepository.load(sessionId), version: undefined};
    }

    private async selectAndSettle(
        sessionId: string,
        state: PreGeneratedSessionState,
        expectedVersion: number | undefined,
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

            const newState: PreGeneratedSessionState = {
                libraryId: this.library.libraryId,
                libraryHash: this.libraryHash,
                seed: state.seed,
                roundsPlayed: round,
            };

            let newVersion: number | undefined;
            if (isVersionedPreGeneratedSessionRepository(this.sessionRepository) && expectedVersion !== undefined) {
                newVersion = await this.sessionRepository.saveVersioned(sessionId, newState, expectedVersion);
            } else {
                await this.sessionRepository.save(sessionId, newState);
            }
            sessionStateSaved = true;

            const commandResult: PreGeneratedSpinCommandResult<T> = {status: "played", sessionId, result};
            if (newVersion !== undefined) {
                commandResult.version = newVersion;
            }
            if (requestId !== undefined) {
                await this.idempotencyRepository.save(sessionId, requestId, commandResult);
            }
            return commandResult;
        } catch (error) {
            if (sessionStateSaved) {
                await this.restoreSessionState(sessionId, state);
            }
            await this.reverseApplied(sessionId, appliedTransactionIds);
            if (error instanceof PreGeneratedSessionVersionConflictError) {
                return {status: "conflict", sessionId, reason: error.message};
            }
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
