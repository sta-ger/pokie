import crypto from "crypto";
import type {PokieGame} from "../../gamepackage/PokieGame.js";
import type {GameSessionHandling} from "../../session/GameSessionHandling.js";
import {InMemoryIdempotencyRepository} from "../idempotency/InMemoryIdempotencyRepository.js";
import type {IdempotencyRepository} from "../idempotency/IdempotencyRepository.js";
import {capturePokieSessionState} from "../session/capturePokieSessionState.js";
import {determineStakeAmount} from "../session/determineStakeAmount.js";
import type {PokieSessionState} from "../session/PokieSessionState.js";
import {restoreFeatureState} from "../session/restoreFeatureState.js";
import type {SessionRepository} from "../session/SessionRepository.js";
import type {TransactionalWalletPort} from "../wallet/TransactionalWalletPort.js";
import type {SpinCommandHandling} from "./SpinCommandHandling.js";
import type {SpinCommandResult} from "./SpinCommandResult.js";

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
// — `roundId` is the requestId (or a fresh id when none was given), for traceability back to the
// logical command; `attemptId` is freshly minted every time this method actually runs, so a retried
// command (same requestId) that follows a compensated/reversed prior attempt always gets brand-new
// transaction ids rather than reusing the reversed ones. (TransactionalWalletAdapter/InMemoryWallet
// also tolerate reusing a reversed id — see their own comments — but attemptId keeps that a
// backstop rather than something this handler leans on.)
//
// If anything fails after entering the mutating phase — a wallet call, persisting the new session
// state, or persisting the idempotency result — every wallet transaction already applied for this
// attempt is individually reversed by its own transactionId, any already-persisted session state is
// restored to what it was before this attempt, and the live session is evicted from the cache. That
// makes the whole attempt's durable side effects (wallet + SessionRepository + idempotencyRepository)
// all-or-nothing from the next command's point of view: a retry always sees either the complete
// result of a prior successful attempt, or a clean pre-attempt state to spin fresh against — never a
// state/result split where one was written and the other wasn't. A backend that can offer real
// cross-store transactions (e.g. one SessionRepository/IdempotencyRepository pair backed by the same
// database) can still do better than this compensating-write approach, but this is what the
// framework guarantees generically.
export class SpinCommandHandler implements SpinCommandHandling {
    private readonly game: PokieGame;
    private readonly sessionRepository: SessionRepository;
    private readonly wallet: TransactionalWalletPort;
    private readonly idempotencyRepository: IdempotencyRepository<SpinCommandResult>;
    private readonly liveSessions = new Map<string, GameSessionHandling>();
    private readonly sessionQueues = new Map<string, Promise<unknown>>();

    constructor(
        game: PokieGame,
        sessionRepository: SessionRepository,
        wallet: TransactionalWalletPort,
        idempotencyRepository: IdempotencyRepository<SpinCommandResult> = new InMemoryIdempotencyRepository(),
    ) {
        this.game = game;
        this.sessionRepository = sessionRepository;
        this.wallet = wallet;
        this.idempotencyRepository = idempotencyRepository;
    }

    public primeSession(sessionId: string, session: GameSessionHandling): void {
        this.liveSessions.set(sessionId, session);
    }

    public handle(sessionId: string, requestId?: string): Promise<SpinCommandResult> {
        return this.enqueue(sessionId, () => this.handleSerialized(sessionId, requestId));
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

    private async handleSerialized(sessionId: string, requestId?: string): Promise<SpinCommandResult> {
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

        return this.playAndSettle(sessionId, session, state, balanceBeforePlay, requestId);
    }

    private async playAndSettle(
        sessionId: string,
        session: GameSessionHandling,
        state: PokieSessionState,
        balanceBeforePlay: number,
        requestId: string | undefined,
    ): Promise<SpinCommandResult> {
        const roundId = requestId ?? crypto.randomUUID();
        const attemptId = crypto.randomUUID();
        const debitTransactionId = `${roundId}:${attemptId}:debit`;
        const creditTransactionId = `${roundId}:${attemptId}:credit`;

        const stakeAmount = determineStakeAmount(session, session.getBet());

        const appliedTransactionIds: string[] = [];
        let sessionStateSaved = false;
        try {
            await this.wallet.debit(sessionId, debitTransactionId, stakeAmount);
            appliedTransactionIds.push(debitTransactionId);

            session.play();
            const win = session.getWinAmount();
            const delta = session.getCreditsAmount() - balanceBeforePlay;
            const creditAmount = delta + stakeAmount;

            const newBalance =
                creditAmount >= 0
                    ? await this.wallet.credit(sessionId, creditTransactionId, creditAmount)
                    : await this.wallet.debit(sessionId, creditTransactionId, -creditAmount);
            appliedTransactionIds.push(creditTransactionId);

            const newState = capturePokieSessionState(state.context, session);
            await this.sessionRepository.save(sessionId, newState);
            sessionStateSaved = true;

            const result: SpinCommandResult = {status: "played", sessionId, state: newState, credits: newBalance, win};

            if (requestId !== undefined) {
                await this.idempotencyRepository.save(sessionId, requestId, result);
            }

            return result;
        } catch (error) {
            if (sessionStateSaved) {
                await this.restoreSessionState(sessionId, state);
            }
            await this.reverseApplied(sessionId, appliedTransactionIds);
            this.liveSessions.delete(sessionId);
            throw error;
        }
    }

    // Best-effort compensating write, undoing this attempt's own sessionRepository.save() when a
    // later step (persisting the idempotency result) fails — see the class doc comment.
    private async restoreSessionState(sessionId: string, state: PokieSessionState): Promise<void> {
        try {
            await this.sessionRepository.save(sessionId, state);
        } catch {
            // The error that triggered this restore is what the caller of handle() sees; a failure
            // to restore shouldn't replace or hide it.
        }
    }

    private async reverseApplied(sessionId: string, transactionIds: string[]): Promise<void> {
        for (const transactionId of transactionIds.reverse()) {
            try {
                await this.wallet.reverse(sessionId, transactionId);
            } catch {
                // Best-effort compensation: the error that triggered this reversal is what the
                // caller of handle() sees (rethrown by playAndSettle's caller); a failure to
                // compensate shouldn't replace or hide it.
            }
        }
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
