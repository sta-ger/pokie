import {
    GameSessionHandling,
    InMemoryIdempotencyRepository,
    InMemorySessionRepository,
    InMemoryWallet,
    PokieGame,
    PokieGameManifest,
    PokieSessionState,
    SessionRepository,
    SpinCommandHandler,
} from "pokie";

const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};

function createFakeSession(): GameSessionHandling & {getSymbolsCombination(): {toMatrix(): string[][]}} {
    let credits = 1000;
    const bet = 5;
    let round = 0;
    let winAmount = 0;

    return {
        getCreditsAmount: () => credits,
        setCreditsAmount: (value: number) => {
            credits = value;
        },
        getBet: () => bet,
        setBet: () => undefined,
        getAvailableBets: () => [bet],
        canPlayNextGame: () => credits >= bet,
        play: () => {
            round++;
            winAmount = round % 2 === 0 ? bet * 3 : 0;
            credits = credits - bet + winAmount;
        },
        getWinAmount: () => winAmount,
        getSymbolsCombination: () => ({toMatrix: () => [[`round-${round}`]]}),
    };
}

function createFakeGame(): PokieGame {
    return {
        getManifest: () => manifest,
        createSession: () => createFakeSession(),
    };
}

async function createSpinnableSession(
    sessionRepository: SessionRepository,
    wallet: InMemoryWallet,
    sessionId: string,
    credits: number,
): Promise<void> {
    await wallet.setBalance(sessionId, credits);
    const state: PokieSessionState = {bet: 5, win: 0};
    await sessionRepository.save(sessionId, state);
}

describe("SpinCommandHandler", () => {
    it("plays a spin, settles the wallet, and persists the new state", async () => {
        const game = createFakeGame();
        const sessionRepository = new InMemorySessionRepository();
        const wallet = new InMemoryWallet();
        const handler = new SpinCommandHandler(game, sessionRepository, wallet);
        await createSpinnableSession(sessionRepository, wallet, "session-1", 1000);

        const result = await handler.handle("session-1");

        expect(result).toMatchObject({status: "played", sessionId: "session-1", win: 0, credits: 995});
        await expect(wallet.getBalance("session-1")).resolves.toBe(995);
        await expect(sessionRepository.load("session-1")).resolves.toMatchObject({bet: 5, win: 0});
    });

    it("returns not-found for an unknown sessionId without touching the wallet", async () => {
        const game = createFakeGame();
        const sessionRepository = new InMemorySessionRepository();
        const wallet = new InMemoryWallet();
        const handler = new SpinCommandHandler(game, sessionRepository, wallet);

        const result = await handler.handle("does-not-exist");

        expect(result).toEqual({status: "not-found", sessionId: "does-not-exist"});
    });

    it("blocks a spin when canPlayNextGame() returns false, leaving the wallet/repository unchanged", async () => {
        const game = createFakeGame();
        const sessionRepository = new InMemorySessionRepository();
        const wallet = new InMemoryWallet();
        const handler = new SpinCommandHandler(game, sessionRepository, wallet);
        await createSpinnableSession(sessionRepository, wallet, "session-1", 2);

        const result = await handler.handle("session-1");

        expect(result.status).toBe("blocked");
        await expect(wallet.getBalance("session-1")).resolves.toBe(2);
        await expect(sessionRepository.load("session-1")).resolves.toMatchObject({bet: 5, win: 0});
    });

    it("replays a stored result for a repeated requestId instead of spinning again", async () => {
        const game = createFakeGame();
        const sessionRepository = new InMemorySessionRepository();
        const wallet = new InMemoryWallet();
        const handler = new SpinCommandHandler(game, sessionRepository, wallet, new InMemoryIdempotencyRepository());
        await createSpinnableSession(sessionRepository, wallet, "session-1", 1000);

        const first = await handler.handle("session-1", "request-1");
        const second = await handler.handle("session-1", "request-1");

        expect(second).toEqual(first);
        // A second real spin would have moved round/win/credits on; replaying request-1 must not.
        await expect(wallet.getBalance("session-1")).resolves.toBe(995);
    });

    it("does not replay across different requestIds", async () => {
        const game = createFakeGame();
        const sessionRepository = new InMemorySessionRepository();
        const wallet = new InMemoryWallet();
        const handler = new SpinCommandHandler(game, sessionRepository, wallet, new InMemoryIdempotencyRepository());
        await createSpinnableSession(sessionRepository, wallet, "session-1", 1000);

        const first = await handler.handle("session-1", "request-1");
        const second = await handler.handle("session-1", "request-2");

        expect(second).not.toEqual(first);
        await expect(wallet.getBalance("session-1")).resolves.toBe(1005);
    });

    it("rolls back the wallet debit when persisting the new state fails", async () => {
        const game = createFakeGame();
        const wallet = new InMemoryWallet();
        const failingRepository: SessionRepository = {
            load: () => Promise.resolve<PokieSessionState>({bet: 5, win: 0}),
            save: () => Promise.reject(new Error("disk full")),
        };
        const handler = new SpinCommandHandler(game, failingRepository, wallet);
        await wallet.setBalance("session-1", 1000);

        await expect(handler.handle("session-1")).rejects.toThrow("disk full");

        await expect(wallet.getBalance("session-1")).resolves.toBe(1000);
    });
});
