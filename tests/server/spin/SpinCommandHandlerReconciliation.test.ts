import {
    GameSessionHandling,
    IdempotencyRepository,
    InMemoryIdempotencyRepository,
    InMemorySessionRepository,
    InMemorySpinOperationLog,
    InMemoryWallet,
    PokieGame,
    PokieGameManifest,
    PokieSessionState,
    SessionRepository,
    SpinCommandHandler,
    SpinCommandResult,
    TransactionalWalletPort,
    WalletTransactionInspecting,
    WalletTransactionStatus,
} from "pokie";

// End-to-end reconciliation/retry recovery coverage for SpinCommandHandler: what happens to a *retried*
// requestId whose prior attempt was interrupted at each of the meaningful points in the mutating phase
// (after debit, after session save, after the idempotency write itself), and what happens when neither
// automatic outcome (reverse/resume) can be established safely. Every scenario uses TWO separate
// SpinCommandHandler instances — sharing the same wallet/sessionRepository/idempotencyRepository/
// operationLog objects — for the "retry" call, so recovery is proven to live in the shared stores, not in
// any single handler instance's own in-process caches (liveSessions/sessionQueues), the closest this test
// suite gets to actually simulating a process restart.

const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};

type FakeGameStats = {createSessionCalls: number; playCalls: number};

// Deterministic loss every round (win always 0) — keeps every scenario's own balance/credits math a
// simple, easy-to-follow "bet 5, win 0" case; the flakiness under test is entirely in the surrounding
// stores, not the game itself.
function createFakeSession(stats: FakeGameStats): GameSessionHandling {
    let credits = 1000;
    const bet = 5;

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
            credits -= bet;
        },
        getWinAmount: () => 0,
    };
}

function createInstrumentedGame(): {game: PokieGame; stats: FakeGameStats} {
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

async function seedSession(sessionRepository: SessionRepository, wallet: TransactionalWalletPort, sessionId: string, credits: number): Promise<void> {
    await wallet.setBalance(sessionId, credits);
    const state: PokieSessionState = {bet: 5, win: 0};
    await sessionRepository.save(sessionId, state);
}

// A TransactionalWalletPort + WalletTransactionInspecting fake: can be told to fail the next credit call
// exactly once, and to fail (or stop failing) every reverse() call — enough control to force a checkpoint
// stuck mid-flight and then let reconciliation's own wallet.reverse() succeed on retry, backed by a real
// InMemoryWallet so balances/transaction status behave correctly whenever a call isn't forced to fail.
class ReconciliationTestWallet implements TransactionalWalletPort, WalletTransactionInspecting {
    public failNextCredit = false;
    public failReverse = false;
    private readonly inner = new InMemoryWallet();

    public getBalance(sessionId: string): Promise<number> {
        return this.inner.getBalance(sessionId);
    }
    public setBalance(sessionId: string, balance: number): Promise<void> {
        return this.inner.setBalance(sessionId, balance);
    }
    public debit(sessionId: string, transactionId: string, amount: number): Promise<number> {
        return this.inner.debit(sessionId, transactionId, amount);
    }
    public credit(sessionId: string, transactionId: string, amount: number): Promise<number> {
        if (this.failNextCredit) {
            this.failNextCredit = false;
            return Promise.reject(new Error("wallet credit failed"));
        }
        return this.inner.credit(sessionId, transactionId, amount);
    }
    public reverse(sessionId: string, transactionId: string): Promise<number> {
        if (this.failReverse) {
            return Promise.reject(new Error("wallet reverse failed"));
        }
        return this.inner.reverse(sessionId, transactionId);
    }
    public getTransactionStatus(sessionId: string, transactionId: string): Promise<WalletTransactionStatus> {
        return this.inner.getTransactionStatus(sessionId, transactionId);
    }
}

// Same failure-injection shape as ReconciliationTestWallet, but deliberately does NOT implement
// WalletTransactionInspecting — the "reconciliation can't ask the wallet directly" case.
class NonInspectingReconciliationTestWallet implements TransactionalWalletPort {
    public failNextCredit = false;
    public failReverse = false;
    private readonly inner = new InMemoryWallet();

    public getBalance(sessionId: string): Promise<number> {
        return this.inner.getBalance(sessionId);
    }
    public setBalance(sessionId: string, balance: number): Promise<void> {
        return this.inner.setBalance(sessionId, balance);
    }
    public debit(sessionId: string, transactionId: string, amount: number): Promise<number> {
        return this.inner.debit(sessionId, transactionId, amount);
    }
    public credit(sessionId: string, transactionId: string, amount: number): Promise<number> {
        if (this.failNextCredit) {
            this.failNextCredit = false;
            return Promise.reject(new Error("wallet credit failed"));
        }
        return this.inner.credit(sessionId, transactionId, amount);
    }
    public reverse(sessionId: string, transactionId: string): Promise<number> {
        if (this.failReverse) {
            return Promise.reject(new Error("wallet reverse failed"));
        }
        return this.inner.reverse(sessionId, transactionId);
    }
}

describe("SpinCommandHandler reconciliation/retry recovery", () => {
    it("failure after debit: retry with the same requestId reverses the stale debit and runs a genuinely fresh spin, never double-charging", async () => {
        const {game, stats} = createInstrumentedGame();
        const sessionRepository = new InMemorySessionRepository();
        const wallet = new ReconciliationTestWallet();
        const idempotencyRepository = new InMemoryIdempotencyRepository<SpinCommandResult>();
        const operationLog = new InMemorySpinOperationLog();
        await seedSession(sessionRepository, wallet, "session-1", 1000);

        wallet.failNextCredit = true;
        wallet.failReverse = true; // in-process compensation itself fails -> checkpoint stays "debited"
        const handler1 = new SpinCommandHandler(game, sessionRepository, wallet, idempotencyRepository, operationLog);
        await expect(handler1.handle("session-1", "request-1")).rejects.toThrow("wallet credit failed");

        const stuck = await operationLog.load("session-1", "request-1");
        expect(stuck?.checkpoint).toBe("debited");
        await expect(wallet.getBalance("session-1")).resolves.toBe(995); // debit applied, never reversed yet
        expect(stats.playCalls).toBe(1);

        wallet.failReverse = false; // the outage is "over" by the time of the retry
        const handler2 = new SpinCommandHandler(game, sessionRepository, wallet, idempotencyRepository, operationLog);
        const retry = await handler2.handle("session-1", "request-1");

        expect(retry).toMatchObject({status: "played", win: 0, credits: 995});
        expect(stats.playCalls).toBe(2); // exactly one NEW play — reconciling the old attempt never itself plays
        expect(stats.createSessionCalls).toBe(2); // a fresh session reconstructed for the retry
        await expect(wallet.getBalance("session-1")).resolves.toBe(995); // reversed to 1000, then genuinely re-debited 5
        await expect(operationLog.load("session-1", "request-1")).resolves.toMatchObject({checkpoint: "committed"});
    });

    it("failure after session save: retry with the same requestId resumes from the captured result without re-playing the round", async () => {
        const {game, stats} = createInstrumentedGame();
        const realSessionRepository = new InMemorySessionRepository();
        let saveCount = 0;
        const flakyRepository: SessionRepository = {
            load: (sessionId) => realSessionRepository.load(sessionId),
            save: (sessionId, state) => {
                saveCount++;
                // 1st save() is the real spin write (must succeed); 2nd is the compensating restore
                // triggered by the idempotency failure below (forced to fail).
                if (saveCount === 2) {
                    return Promise.reject(new Error("disk full during restore"));
                }
                return realSessionRepository.save(sessionId, state);
            },
        };
        const wallet = new ReconciliationTestWallet();
        wallet.failReverse = true; // keep the wallet genuinely settled, matching the stuck checkpoint
        const realIdempotencyRepository = new InMemoryIdempotencyRepository<SpinCommandResult>();
        let failNextIdempotencySave = true;
        const flakyIdempotencyRepository: IdempotencyRepository<SpinCommandResult> = {
            load: (sessionId, requestId) => realIdempotencyRepository.load(sessionId, requestId),
            save: (sessionId, requestId, result) => {
                if (failNextIdempotencySave) {
                    failNextIdempotencySave = false;
                    return Promise.reject(new Error("idempotency store unavailable"));
                }
                return realIdempotencyRepository.save(sessionId, requestId, result);
            },
        };
        const operationLog = new InMemorySpinOperationLog();
        await seedSession(realSessionRepository, wallet, "session-1", 1000);

        const handler1 = new SpinCommandHandler(game, flakyRepository, wallet, flakyIdempotencyRepository, operationLog);
        await expect(handler1.handle("session-1", "request-1")).rejects.toThrow("idempotency store unavailable");

        const stuck = await operationLog.load("session-1", "request-1");
        expect(stuck?.checkpoint).toBe("session-saved");
        expect(stats.playCalls).toBe(1);

        const handler2 = new SpinCommandHandler(game, flakyRepository, wallet, flakyIdempotencyRepository, operationLog);
        const retry = await handler2.handle("session-1", "request-1");

        expect(retry).toMatchObject({status: "played", win: 0, credits: 995});
        expect(stats.playCalls).toBe(1); // CRITICAL: no re-play, no re-debit, on resume
        await expect(realIdempotencyRepository.load("session-1", "request-1")).resolves.toMatchObject({status: "played", credits: 995});
        await expect(operationLog.load("session-1", "request-1")).resolves.toMatchObject({checkpoint: "committed"});
    });

    it("failure after the idempotency write (i.e. none — the happy path): retry just hits the ordinary idempotency cache, and reconciliation treats it as a no-op", async () => {
        const {game, stats} = createInstrumentedGame();
        const sessionRepository = new InMemorySessionRepository();
        const wallet = new InMemoryWallet();
        const idempotencyRepository = new InMemoryIdempotencyRepository<SpinCommandResult>();
        const operationLog = new InMemorySpinOperationLog();
        await seedSession(sessionRepository, wallet, "session-1", 1000);

        const handler1 = new SpinCommandHandler(game, sessionRepository, wallet, idempotencyRepository, operationLog);
        const first = await handler1.handle("session-1", "request-1");
        expect(first).toMatchObject({status: "played", win: 0, credits: 995});
        await expect(operationLog.load("session-1", "request-1")).resolves.toMatchObject({checkpoint: "committed"});

        const handler2 = new SpinCommandHandler(game, sessionRepository, wallet, idempotencyRepository, operationLog);
        const retry = await handler2.handle("session-1", "request-1");

        expect(retry).toEqual(first);
        expect(stats.playCalls).toBe(1); // never re-played
        expect(stats.createSessionCalls).toBe(1); // the idempotency cache hit short-circuits before resolveSession

        const outcome = await handler2.getReconciliationService().reconcileOne("session-1", "request-1");
        expect(outcome).toMatchObject({status: "already-committed"});
    });

    it("manual recovery: a checkpoint stuck at 'debited' with no wallet inspection available never guesses, and returns recovery-required", async () => {
        const {game, stats} = createInstrumentedGame();
        const sessionRepository = new InMemorySessionRepository();
        const wallet = new NonInspectingReconciliationTestWallet();
        const idempotencyRepository = new InMemoryIdempotencyRepository<SpinCommandResult>();
        const operationLog = new InMemorySpinOperationLog();
        await seedSession(sessionRepository, wallet, "session-1", 1000);

        wallet.failNextCredit = true;
        wallet.failReverse = true;
        const handler1 = new SpinCommandHandler(game, sessionRepository, wallet, idempotencyRepository, operationLog);
        await expect(handler1.handle("session-1", "request-1")).rejects.toThrow("wallet credit failed");
        expect(stats.playCalls).toBe(1);

        wallet.failReverse = false; // even once reverse would succeed again, this wallet still can't be asked
        const handler2 = new SpinCommandHandler(game, sessionRepository, wallet, idempotencyRepository, operationLog);
        const retry = await handler2.handle("session-1", "request-1");

        expect(retry).toMatchObject({status: "recovery-required", sessionId: "session-1", requestId: "request-1"});
        expect(stats.playCalls).toBe(1); // never re-played
        await expect(wallet.getBalance("session-1")).resolves.toBe(995); // never guessed at — left exactly as it was
        await expect(operationLog.load("session-1", "request-1")).resolves.toMatchObject({checkpoint: "debited"}); // untouched
    });

    it("does not silently resume when a same-process compensation reverses the wallet without also restoring the session — checkpoint and wallet reality disagree", async () => {
        const {game, stats} = createInstrumentedGame();
        const realSessionRepository = new InMemorySessionRepository();
        let saveCount = 0;
        const flakyRepository: SessionRepository = {
            load: (sessionId) => realSessionRepository.load(sessionId),
            save: (sessionId, state) => {
                saveCount++;
                if (saveCount === 2) {
                    return Promise.reject(new Error("disk full during restore"));
                }
                return realSessionRepository.save(sessionId, state);
            },
        };
        const wallet = new ReconciliationTestWallet(); // failReverse left false — the wallet reversal SUCCEEDS
        const realIdempotencyRepository = new InMemoryIdempotencyRepository<SpinCommandResult>();
        let failNextIdempotencySave = true;
        const idempotencyRepository: IdempotencyRepository<SpinCommandResult> = {
            load: (sessionId, requestId) => realIdempotencyRepository.load(sessionId, requestId),
            save: (sessionId, requestId, result) => {
                if (failNextIdempotencySave) {
                    failNextIdempotencySave = false;
                    return Promise.reject(new Error("idempotency store unavailable"));
                }
                return realIdempotencyRepository.save(sessionId, requestId, result);
            },
        };
        const operationLog = new InMemorySpinOperationLog();
        await seedSession(realSessionRepository, wallet, "session-1", 1000);

        const handler1 = new SpinCommandHandler(game, flakyRepository, wallet, idempotencyRepository, operationLog);
        await expect(handler1.handle("session-1", "request-1")).rejects.toThrow("idempotency store unavailable");

        // The wallet WAS actually reversed (its own compensation succeeded) even though the checkpoint
        // is still "session-saved" (that compensation's own session-restore half failed) — a genuinely
        // inconsistent state between the checkpoint and the wallet's own current reality.
        await expect(wallet.getBalance("session-1")).resolves.toBe(1000);
        expect(stats.playCalls).toBe(1);

        const handler2 = new SpinCommandHandler(game, flakyRepository, wallet, idempotencyRepository, operationLog);
        const retry = await handler2.handle("session-1", "request-1");

        expect(retry).toMatchObject({status: "recovery-required"});
        expect(stats.playCalls).toBe(1); // never re-played
        // No wrong idempotency result claiming a settlement (credits: 995) the wallet no longer reflects.
        await expect(realIdempotencyRepository.load("session-1", "request-1")).resolves.toBeUndefined();
    });
});
