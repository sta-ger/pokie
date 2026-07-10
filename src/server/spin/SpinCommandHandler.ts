import type {PokieGame} from "../../gamepackage/PokieGame.js";
import type {GameSessionHandling} from "../../session/GameSessionHandling.js";
import {InMemoryIdempotencyRepository} from "../idempotency/InMemoryIdempotencyRepository.js";
import type {IdempotencyRepository} from "../idempotency/IdempotencyRepository.js";
import {capturePokieSessionState} from "../session/capturePokieSessionState.js";
import type {PokieSessionState} from "../session/PokieSessionState.js";
import {restoreFeatureState} from "../session/restoreFeatureState.js";
import type {SessionRepository} from "../session/SessionRepository.js";
import type {WalletPort} from "../wallet/WalletPort.js";
import type {SpinCommandHandling} from "./SpinCommandHandling.js";
import type {SpinCommandResult} from "./SpinCommandResult.js";

// Orchestrates a single spin end-to-end: replay an idempotent retry, load the persisted session
// state (reconstructing a live session on a cache miss, e.g. after a restart), gate on
// canPlayNextGame(), run play(), settle the wallet, and persist the new state.
//
// The wallet settlement is delta-based rather than "always debit getBet(), always credit
// getWinAmount()": a session decides its own real charge for a spin — e.g.
// VideoSlotWithFreeGamesSession never charges a bet while a free-games round is unfinished (see
// FreeGamesRoundHandler), restoring credits to their pre-play value internally — so the only
// generically correct way to know what actually happened is to compare a session's credits before
// and after play(). A negative delta is charged via wallet.debit(), a positive one via
// wallet.credit(); if persisting the new session state then fails, that wallet mutation is rolled
// back so the wallet and SessionRepository never drift apart.
export class SpinCommandHandler implements SpinCommandHandling {
    private readonly game: PokieGame;
    private readonly sessionRepository: SessionRepository;
    private readonly wallet: WalletPort;
    private readonly idempotencyRepository: IdempotencyRepository<SpinCommandResult>;
    private readonly liveSessions = new Map<string, GameSessionHandling>();

    constructor(
        game: PokieGame,
        sessionRepository: SessionRepository,
        wallet: WalletPort,
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

    public async handle(sessionId: string, requestId?: string): Promise<SpinCommandResult> {
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

        const result = await this.playAndSettle(sessionId, session, state, balanceBeforePlay);
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
    ): Promise<SpinCommandResult> {
        session.play();
        const win = session.getWinAmount();
        const delta = session.getCreditsAmount() - balanceBeforePlay;

        const credits = await this.applyDelta(sessionId, delta, balanceBeforePlay);
        const newState = capturePokieSessionState(state.context, session);

        try {
            await this.sessionRepository.save(sessionId, newState);
        } catch (error) {
            await this.rollbackDelta(sessionId, delta);
            throw error;
        }

        return {status: "played", sessionId, state: newState, credits, win};
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

    private applyDelta(sessionId: string, delta: number, unchangedBalance: number): Promise<number> {
        if (delta < 0) {
            return this.wallet.debit(sessionId, -delta);
        }
        if (delta > 0) {
            return this.wallet.credit(sessionId, delta);
        }
        return Promise.resolve(unchangedBalance);
    }

    private async rollbackDelta(sessionId: string, delta: number): Promise<void> {
        if (delta < 0) {
            await this.wallet.rollback(sessionId, -delta);
        } else if (delta > 0) {
            await this.wallet.debit(sessionId, delta);
        }
    }
}
