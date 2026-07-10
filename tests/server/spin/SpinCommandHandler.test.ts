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
    TransactionalWalletPort,
} from "pokie";

const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};

type FakeGameStats = {createSessionCalls: number; playCalls: number};

function createFakeSession(
    stats: FakeGameStats = {createSessionCalls: 0, playCalls: 0},
): GameSessionHandling & {getSymbolsCombination(): {toMatrix(): string[][]}} {
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
            stats.playCalls++;
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

// Tracks how many live sessions were actually (re)constructed and how many rounds were actually
// played — used to prove eviction-on-error forces a fresh reconstruction instead of reusing a
// tainted, mutated-but-unpersisted live session (see the wallet/repository failure tests below).
function createInstrumentedFakeGame(): {game: PokieGame; stats: FakeGameStats} {
    const stats: FakeGameStats = {createSessionCalls: 0, playCalls: 0};
    const game: PokieGame = {
        getManifest: () => manifest,
        createSession: () => {
            stats.createSessionCalls++;
            return createFakeSession(stats);
        },
    };
    return {game, stats};
}

// A free-games-style session standing in for VideoSlotWithFreeGamesSession: canPlayNextGame() is
// unconditionally true, and a spin while free spins remain neither charges the bet nor folds its
// win into credits (banked elsewhere, only settled once the free round finishes) — the scenario
// "free spin must debit zero" exists for.
function createFakeFreeGamesSession(): GameSessionHandling {
    let credits = 0;
    const bet = 5;
    let winAmount = 0;
    let freeSpinsRemaining = 3;

    return {
        getCreditsAmount: () => credits,
        setCreditsAmount: (value: number) => {
            credits = value;
        },
        getBet: () => bet,
        setBet: () => undefined,
        getAvailableBets: () => [bet],
        canPlayNextGame: () => true,
        play: () => {
            if (freeSpinsRemaining > 0) {
                freeSpinsRemaining--;
                winAmount = 20;
            } else {
                winAmount = 0;
                credits -= bet;
            }
        },
        getWinAmount: () => winAmount,
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

type TransactionCall = {sessionId: string; transactionId: string; amount: number};

// A TransactionalWalletPort that records every debit/credit/reverse call (for asserting they
// happened as separate, correctly-tagged operations) and can be told to fail the next debit or
// credit exactly once (for the wallet-failure/eviction tests) — backed by a real InMemoryWallet so
// balances still behave correctly whenever a call isn't forced to fail.
class RecordingTransactionalWallet implements TransactionalWalletPort {
    public readonly debitCalls: TransactionCall[] = [];
    public readonly creditCalls: TransactionCall[] = [];
    public readonly reverseCalls: {sessionId: string; transactionId: string}[] = [];
    public failNextDebit = false;
    public failNextCredit = false;
    private readonly inner = new InMemoryWallet();

    public getBalance(sessionId: string): Promise<number> {
        return this.inner.getBalance(sessionId);
    }

    public setBalance(sessionId: string, balance: number): Promise<void> {
        return this.inner.setBalance(sessionId, balance);
    }

    public debit(sessionId: string, transactionId: string, amount: number): Promise<number> {
        this.debitCalls.push({sessionId, transactionId, amount});
        if (this.failNextDebit) {
            this.failNextDebit = false;
            return Promise.reject(new Error("wallet debit failed"));
        }
        return this.inner.debit(sessionId, transactionId, amount);
    }

    public credit(sessionId: string, transactionId: string, amount: number): Promise<number> {
        this.creditCalls.push({sessionId, transactionId, amount});
        if (this.failNextCredit) {
            this.failNextCredit = false;
            return Promise.reject(new Error("wallet credit failed"));
        }
        return this.inner.credit(sessionId, transactionId, amount);
    }

    public reverse(sessionId: string, transactionId: string): Promise<number> {
        this.reverseCalls.push({sessionId, transactionId});
        return this.inner.reverse(sessionId, transactionId);
    }
}

async function createSpinnableSessionOn(
    sessionRepository: SessionRepository,
    wallet: RecordingTransactionalWallet,
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

    it("only spins once for two concurrent calls sharing the same requestId", async () => {
        const {game, stats} = createInstrumentedFakeGame();
        const sessionRepository = new InMemorySessionRepository();
        const wallet = new InMemoryWallet();
        const handler = new SpinCommandHandler(game, sessionRepository, wallet, new InMemoryIdempotencyRepository());
        await createSpinnableSession(sessionRepository, wallet, "session-1", 1000);

        const [first, second] = await Promise.all([
            handler.handle("session-1", "request-1"),
            handler.handle("session-1", "request-1"),
        ]);

        expect(second).toEqual(first);
        expect(stats.playCalls).toBe(1);
        await expect(wallet.getBalance("session-1")).resolves.toBe(995);
    });

    it("serializes two concurrent spins on the same session instead of racing", async () => {
        const {game, stats} = createInstrumentedFakeGame();
        const sessionRepository = new InMemorySessionRepository();
        const wallet = new InMemoryWallet();
        const handler = new SpinCommandHandler(game, sessionRepository, wallet);
        await createSpinnableSession(sessionRepository, wallet, "session-1", 1000);

        const [first, second] = await Promise.all([handler.handle("session-1"), handler.handle("session-1")]);

        // Deterministic because handle() enqueues synchronously in call order: whichever call was
        // invoked first is round 1, the other is round 2 — never a raced/corrupted in-between state.
        expect(stats.playCalls).toBe(2);
        expect(first).toMatchObject({win: 0, credits: 995});
        expect(second).toMatchObject({win: 15, credits: 1005});
        await expect(wallet.getBalance("session-1")).resolves.toBe(1005);
    });

    it("charges the stake and credits the win as two separate, distinctly-tagged wallet transactions", async () => {
        const game = createFakeGame();
        const sessionRepository = new InMemorySessionRepository();
        const wallet = new RecordingTransactionalWallet();
        const handler = new SpinCommandHandler(game, sessionRepository, wallet);
        await createSpinnableSessionOn(sessionRepository, wallet, "session-1", 1000);

        await handler.handle("session-1"); // round 1: win 0, nothing interesting to assert on
        wallet.debitCalls.length = 0;
        wallet.creditCalls.length = 0;

        const result = await handler.handle("session-1"); // round 2: bet 5, win 15

        expect(result).toMatchObject({win: 15, credits: 1005});
        expect(wallet.debitCalls).toEqual([{sessionId: "session-1", transactionId: expect.any(String), amount: 5}]);
        expect(wallet.creditCalls).toEqual([{sessionId: "session-1", transactionId: expect.any(String), amount: 15}]);
        expect(wallet.debitCalls[0].transactionId).not.toBe(wallet.creditCalls[0].transactionId);
    });

    it("debits zero for a free spin (balance below the nominal bet, but canPlayNextGame() still true)", async () => {
        const game: PokieGame = {getManifest: () => manifest, createSession: () => createFakeFreeGamesSession()};
        const sessionRepository = new InMemorySessionRepository();
        const wallet = new RecordingTransactionalWallet();
        const handler = new SpinCommandHandler(game, sessionRepository, wallet);
        await createSpinnableSessionOn(sessionRepository, wallet, "session-1", 0);

        const result = await handler.handle("session-1");

        expect(result).toMatchObject({status: "played", win: 20, credits: 0});
        expect(wallet.debitCalls).toHaveLength(1);
        expect(wallet.debitCalls[0].amount).toBe(0);
    });

    it("touches nothing when the wallet's debit itself throws", async () => {
        const game = createFakeGame();
        const sessionRepository = new InMemorySessionRepository();
        const wallet = new RecordingTransactionalWallet();
        wallet.failNextDebit = true;
        const handler = new SpinCommandHandler(game, sessionRepository, wallet);
        await createSpinnableSessionOn(sessionRepository, wallet, "session-1", 1000);

        await expect(handler.handle("session-1")).rejects.toThrow("wallet debit failed");

        await expect(wallet.getBalance("session-1")).resolves.toBe(1000);
        await expect(sessionRepository.load("session-1")).resolves.toMatchObject({bet: 5, win: 0});
        expect(wallet.reverseCalls).toHaveLength(0);
    });

    it("reverses the debit and evicts the live session when the wallet's credit throws after play()", async () => {
        const {game, stats} = createInstrumentedFakeGame();
        const sessionRepository = new InMemorySessionRepository();
        const wallet = new RecordingTransactionalWallet();
        wallet.failNextCredit = true;
        const handler = new SpinCommandHandler(game, sessionRepository, wallet);
        await createSpinnableSessionOn(sessionRepository, wallet, "session-1", 1000);

        await expect(handler.handle("session-1")).rejects.toThrow("wallet credit failed");

        expect(stats.playCalls).toBe(1); // play() DID already run before the credit failed
        await expect(wallet.getBalance("session-1")).resolves.toBe(1000); // debit fully reversed
        expect(wallet.reverseCalls.map((call) => call.transactionId)).toEqual([wallet.debitCalls[0].transactionId]);

        // A retry must reconstruct a fresh session (round 1 again) rather than continue the tainted,
        // already-mutated one left behind by the failed attempt (which would otherwise look like round 2).
        const retry = await handler.handle("session-1");

        expect(retry).toMatchObject({status: "played", win: 0, credits: 995});
        expect(stats.createSessionCalls).toBe(2);
    });

    it("reverses the wallet and evicts the live session on a repository save failure, so a retry spins fresh", async () => {
        const {game, stats} = createInstrumentedFakeGame();
        const sessionRepository = new InMemorySessionRepository();
        const wallet = new InMemoryWallet();
        let failNextSave = true;
        const flakyRepository: SessionRepository = {
            load: (sessionId) => sessionRepository.load(sessionId),
            save: (sessionId, state) => {
                if (failNextSave) {
                    failNextSave = false;
                    return Promise.reject(new Error("disk full"));
                }
                return sessionRepository.save(sessionId, state);
            },
        };
        const handler = new SpinCommandHandler(game, flakyRepository, wallet);
        await createSpinnableSession(sessionRepository, wallet, "session-1", 1000);

        await expect(handler.handle("session-1")).rejects.toThrow("disk full");

        await expect(wallet.getBalance("session-1")).resolves.toBe(1000);
        expect(stats.createSessionCalls).toBe(1);
        expect(stats.playCalls).toBe(1);

        const retry = await handler.handle("session-1");

        expect(retry).toMatchObject({status: "played", win: 0, credits: 995});
        expect(stats.createSessionCalls).toBe(2);
        await expect(wallet.getBalance("session-1")).resolves.toBe(995);
    });
});
