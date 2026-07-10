import crypto from "crypto";
import type {PokieGame} from "../../gamepackage/PokieGame.js";
import type {GameSessionHandling} from "../../session/GameSessionHandling.js";
import {InMemoryIdempotencyRepository} from "../idempotency/InMemoryIdempotencyRepository.js";
import type {IdempotencyRepository} from "../idempotency/IdempotencyRepository.js";
import {capturePokieSessionState} from "../session/capturePokieSessionState.js";
import type {PokieSessionState} from "../session/PokieSessionState.js";
import {restoreFeatureState} from "../session/restoreFeatureState.js";
import type {SessionRepository} from "../session/SessionRepository.js";
import type {TransactionalWalletPort} from "../wallet/TransactionalWalletPort.js";
import type {SpinCommandHandling} from "./SpinCommandHandling.js";
import type {SpinCommandResult} from "./SpinCommandResult.js";

// Orchestrates a single spin end-to-end: replay an idempotent retry, load the persisted session
// state (reconstructing a live session on a cache miss, e.g. after a restart), gate on
// canPlayNextGame(), run play(), settle the wallet as two separate transactions (a stake debit and
// a win credit), and persist the new state.
//
// Every command for a given sessionId — whether the same requestId retried concurrently or two
// genuinely different spins racing — is serialized through a per-session queue (see enqueue()), so
// there's never more than one play()/wallet-settlement/persist in flight for a session at a time.
// That single property is what makes a repeated concurrent requestId safe without a separate
// "in-flight" cache: the second call is simply queued behind the first, and by the time its own
// turn runs, the first's result is already in idempotencyRepository for it to find.
//
// Wallet settlement: the stake is debited *before* play(), using whatever session.getBet() reports
// — unless the current balance is already less than that, in which case canPlayNextGame() must
// have let the spin through for some other reason (e.g. an in-progress free-games round bypassing
// the balance check — see VideoSlotWithFreeGamesSession/FreeGamesRoundHandler), so the stake is
// debited as 0 instead of failing the spin. The win is credited *after* play(), for whatever amount
// reconciles the wallet to the session's own final credits — i.e. balanceBeforePlay - stakeDebited +
// winCredited === session.getCreditsAmount() after play(). That reconciliation is what keeps this
// correct even for a session with its own internal accounting quirks (e.g. a free-games round that
// banks a win across several spins instead of paying it out immediately): whatever delta the
// session actually produced beyond the stake we chose to charge is exactly what gets credited, so
// the two independently-chosen numbers (stake, then win) always add up to the truth, regardless of
// what stake amount was actually right for this specific game's rules.
//
// If anything after play() fails — the debit/credit itself, or persisting the new state — every
// wallet transaction already applied for this attempt is individually reversed by its own
// transactionId (see TransactionalWalletPort.reverse), and the live session is evicted from the
// cache rather than left mutated-but-unpersisted, so the next command for this sessionId
// reconstructs cleanly from the last state SessionRepository actually has.
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

        const result = await this.playAndSettle(sessionId, session, state, balanceBeforePlay, requestId);
        if (requestId !== undefined) {
            await this.idempotencyRepository.save(sessionId, requestId, result);
        }
        return result;
    }

    private async playAndSettle(
        sessionId: string,
        session: GameSessionHandling,
        state: PokieSessionState,
        balanceBeforePlay: number,
        requestId: string | undefined,
    ): Promise<SpinCommandResult> {
        // A stable, per-round pair of transaction ids: deterministic from requestId (so a wallet
        // that itself sees the same transactionId twice — e.g. a retried command that raced past
        // idempotencyRepository somehow — stays idempotent too), or a fresh id per attempt when the
        // caller didn't supply a requestId at all (no idempotency is expected across those calls).
        const roundId = requestId ?? crypto.randomUUID();
        const debitTransactionId = `${roundId}:debit`;
        const creditTransactionId = `${roundId}:credit`;

        // The stake this round would charge — 0 if the balance is already below it, since
        // canPlayNextGame() (already checked) must have allowed the spin anyway (e.g. an
        // in-progress free-games round). See the class doc comment for why the credit side below
        // still ends up correct regardless of whether this guess undercharges or overcharges.
        const nominalBet = session.getBet();
        const stakeAmount = nominalBet <= balanceBeforePlay ? nominalBet : 0;

        const appliedTransactionIds: string[] = [];
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

            return {status: "played", sessionId, state: newState, credits: newBalance, win};
        } catch (error) {
            await this.reverseApplied(sessionId, appliedTransactionIds);
            this.liveSessions.delete(sessionId);
            throw error;
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
