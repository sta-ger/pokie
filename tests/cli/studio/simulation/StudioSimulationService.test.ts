import {GameSessionHandling, loadPokieGame, PokieGame, PokieGameManifest} from "pokie";
import path from "path";
import {InMemoryStudioSimulationRepository} from "../../../../cli/studio/simulation/InMemoryStudioSimulationRepository.js";
import {StudioSimulationJobView} from "../../../../cli/studio/simulation/StudioSimulationJobView.js";
import {StudioSimulationService} from "../../../../cli/studio/simulation/StudioSimulationService.js";

function createFakeSession(options: {failOnRound?: number; stopAfterRounds?: number} = {}): GameSessionHandling {
    let credits = 1000;
    let bet = 1;
    let round = 0;
    let winAmount = 0;

    return {
        getCreditsAmount: () => credits,
        setCreditsAmount: (value: number) => {
            credits = value;
        },
        getBet: () => bet,
        setBet: (value: number) => {
            bet = value;
        },
        getAvailableBets: () => [1, 2, 5],
        canPlayNextGame: () => options.stopAfterRounds === undefined || round < options.stopAfterRounds,
        play: () => {
            round++;
            if (options.failOnRound !== undefined && round === options.failOnRound) {
                throw new Error(`fake session failed on round ${round}`);
            }
            winAmount = round % 5 === 0 ? bet * 10 : 0;
            credits = credits - bet + winAmount;
        },
        getWinAmount: () => winAmount,
    };
}

function createFakeGame(manifest: PokieGameManifest, sessionOptions: Parameters<typeof createFakeSession>[0] = {}): PokieGame {
    return {
        getManifest: () => manifest,
        createSession: () => createFakeSession(sessionOptions),
    };
}

// A session implementing the same StakeAmountDetermining contract as SimCommand.test.ts's own
// createFreeGamesAwareFakeGame — round % 5 === 4 is an unstaked (free games) round.
function createFreeGamesAwareFakeGame(manifest: PokieGameManifest): PokieGame {
    return {
        getManifest: () => manifest,
        createSession: () => {
            let credits = 1000;
            const bet = 1;
            let round = 0;
            let pendingWin = 0;
            return {
                getCreditsAmount: () => credits,
                setCreditsAmount: (value: number) => {
                    credits = value;
                },
                getBet: () => bet,
                setBet: () => undefined,
                getAvailableBets: () => [1],
                canPlayNextGame: () => true,
                getStakeAmount: () => (round % 5 === 4 ? 0 : bet),
                play: () => {
                    pendingWin = round % 10 === 0 ? 10 : 0;
                    round++;
                    credits = credits - (round % 5 === 0 ? 0 : bet) + pendingWin;
                },
                getWinAmount: () => pendingWin,
            } as unknown as GameSessionHandling;
        },
    };
}

function flushMacrotask(): Promise<void> {
    return new Promise((resolve) => {
        setImmediate(resolve);
    });
}

async function waitForTerminal(service: StudioSimulationService, id: string): Promise<StudioSimulationJobView> {
    for (let i = 0; i < 2000; i++) {
        const job = service.getStatus(id);
        if (job && job.status !== "queued" && job.status !== "running") {
            return job;
        }
        await flushMacrotask();
    }
    throw new Error("Timed out waiting for the simulation to reach a terminal state.");
}

// A controllable substitute for the real setImmediate-based yieldToEventLoop: each call queues its
// own resolver rather than resolving immediately, so a test can precisely pause the chunk loop
// between chunks, inspect intermediate progress, then release it one step at a time.
function createControlledYield(): {yieldToEventLoop: () => Promise<void>; pendingCount: () => number; release: () => void} {
    const pending: Array<() => void> = [];
    return {
        yieldToEventLoop: () =>
            new Promise<void>((resolve) => {
                pending.push(resolve);
            }),
        pendingCount: () => pending.length,
        release: () => {
            const resolve = pending.shift();
            resolve?.();
        },
    };
}

describe("StudioSimulationService", () => {
    const manifest: PokieGameManifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};

    it("runs a small simulation to completion and builds a SimulationReport", async () => {
        const service = new StudioSimulationService(
            new InMemoryStudioSimulationRepository(),
            () => Promise.resolve(createFakeGame(manifest)),
        );

        const result = service.start("/a", {rounds: 50, seed: "demo"});
        expect(result.status).toBe("created");
        if (result.status !== "created") {
            return;
        }
        expect(result.job.status).toBe("queued");

        const job = await waitForTerminal(service, result.job.id);

        expect(job.status).toBe("completed");
        expect(job.report).toBeDefined();
        expect(job.report?.game).toEqual(manifest);
        expect(job.report?.rounds).toBe(50);
        expect(job.report?.requestedRounds).toBe(50);
        expect(job.report?.seed).toBe("demo");
        expect(job.roundsCompleted).toBe(50);
        expect(job.statistics).toBeDefined();
        expect(typeof job.statistics?.volatility).toBe("number");
        expect(typeof job.statistics?.rtpConfidenceInterval95.low).toBe("number");
    });

    it("has no breakdown when the session doesn't implement StakeAmountDetermining/getSimulationCategory", async () => {
        const service = new StudioSimulationService(
            new InMemoryStudioSimulationRepository(),
            () => Promise.resolve(createFakeGame(manifest)),
        );

        const result = service.start("/a", {rounds: 30});
        if (result.status !== "created") {
            throw new Error("expected job to be created");
        }
        const job = await waitForTerminal(service, result.job.id);

        expect(job.report?.breakdown).toBeUndefined();
    });

    it("merges a base/freeGames breakdown correctly across multiple chunks", async () => {
        const service = new StudioSimulationService(
            new InMemoryStudioSimulationRepository(),
            () => Promise.resolve(createFreeGamesAwareFakeGame(manifest)),
            undefined,
            10, // chunkSize — 50 rounds means 5 chunks, so this genuinely exercises cross-chunk merging
        );

        const result = service.start("/a", {rounds: 50});
        if (result.status !== "created") {
            throw new Error("expected job to be created");
        }
        const job = await waitForTerminal(service, result.job.id);

        expect(job.status).toBe("completed");
        const breakdown = job.report?.breakdown;
        expect(breakdown).toBeDefined();
        expect(breakdown!.components.base.rounds).toBe(40);
        expect(breakdown!.components.freeGames.rounds).toBe(10);
        expect(breakdown!.components.base.rounds + breakdown!.components.freeGames.rounds).toBe(job.report?.rounds);
        expect(breakdown!.components.base.totalWin).toBeGreaterThan(0);
    });

    it("reports partial progress and stops early when the session's canPlayNextGame() returns false", async () => {
        const service = new StudioSimulationService(
            new InMemoryStudioSimulationRepository(),
            () => Promise.resolve(createFakeGame(manifest, {stopAfterRounds: 12})),
            undefined,
            5, // chunkSize
        );

        const result = service.start("/a", {rounds: 100});
        if (result.status !== "created") {
            throw new Error("expected job to be created");
        }
        const job = await waitForTerminal(service, result.job.id);

        expect(job.status).toBe("completed");
        expect(job.roundsCompleted).toBe(12);
        expect(job.report?.rounds).toBe(12);
        expect(job.report?.requestedRounds).toBe(100);
    });

    it("fails the job with a safe error message (no stack trace) when loading the game throws", async () => {
        const service = new StudioSimulationService(
            new InMemoryStudioSimulationRepository(),
            () => Promise.reject(new Error("Cannot find module './dist/index.js'")),
        );

        const result = service.start("/a", {rounds: 10});
        if (result.status !== "created") {
            throw new Error("expected job to be created");
        }
        const job = await waitForTerminal(service, result.job.id);

        expect(job.status).toBe("failed");
        expect(job.error).toBe("Cannot find module './dist/index.js'");
        expect(job.roundsCompleted).toBe(0);
    });

    it("fails the job with a safe error message when the session throws mid-simulation", async () => {
        const service = new StudioSimulationService(
            new InMemoryStudioSimulationRepository(),
            () => Promise.resolve(createFakeGame(manifest, {failOnRound: 7})),
            undefined,
            5, // chunkSize — round 7 falls inside the second chunk
        );

        const result = service.start("/a", {rounds: 100});
        if (result.status !== "created") {
            throw new Error("expected job to be created");
        }
        const job = await waitForTerminal(service, result.job.id);

        expect(job.status).toBe("failed");
        expect(job.error).toBe("fake session failed on round 7");
        expect(JSON.stringify(job)).not.toContain("\\n    at ");
    });

    it("returns undefined for an unknown simulation id", () => {
        const service = new StudioSimulationService();

        expect(service.getStatus("does-not-exist")).toBeUndefined();
    });

    it("rejects starting a second simulation for the same projectRoot with a conflict", () => {
        const service = new StudioSimulationService(
            new InMemoryStudioSimulationRepository(),
            () =>
                new Promise(() => {
                    // never resolves — keeps the first job "queued" forever
                }),
        );

        const first = service.start("/a", {rounds: 1000});
        if (first.status !== "created") {
            throw new Error("expected the first job to be created");
        }
        const second = service.start("/a", {rounds: 500});

        expect(second).toEqual({status: "conflict", activeJobId: first.job.id});
    });

    it("allows a new simulation for a different projectRoot while one is active", () => {
        const service = new StudioSimulationService(
            new InMemoryStudioSimulationRepository(),
            () =>
                new Promise(() => {
                    // never resolves
                }),
        );

        const first = service.start("/a", {rounds: 1000});
        const second = service.start("/b", {rounds: 1000});

        expect(first.status).toBe("created");
        expect(second.status).toBe("created");
    });

    it("allows starting a new simulation for the same projectRoot once the previous one has completed", async () => {
        const service = new StudioSimulationService(
            new InMemoryStudioSimulationRepository(),
            () => Promise.resolve(createFakeGame(manifest)),
        );

        const first = service.start("/a", {rounds: 10});
        if (first.status !== "created") {
            throw new Error("expected job to be created");
        }
        await waitForTerminal(service, first.job.id);

        const second = service.start("/a", {rounds: 10});

        expect(second.status).toBe("created");
    });

    it("cancels a queued/running job, stopping further progress", async () => {
        const gate = createControlledYield();
        const repository = new InMemoryStudioSimulationRepository();
        const service = new StudioSimulationService(
            repository,
            () => Promise.resolve(createFakeGame(manifest)),
            undefined,
            10, // chunkSize
            undefined,
            gate.yieldToEventLoop,
        );

        const result = service.start("/a", {rounds: 25});
        if (result.status !== "created") {
            throw new Error("expected job to be created");
        }
        await flushMacrotask();
        expect(gate.pendingCount()).toBe(1); // paused right after the first chunk (10 rounds)
        expect(service.getStatus(result.job.id)?.roundsCompleted).toBe(10);

        // Cancellation can only take effect between chunks (see StudioSimulationService.run()'s own
        // doc comment on why) — cancel() requests it (aborting the controller) but the record only
        // actually transitions to "cancelled" once the paused chunk loop notices, after release().
        const cancelled = service.cancel(result.job.id);
        expect(cancelled?.status).toBe("running");

        gate.release();
        await flushMacrotask();

        const job = service.getStatus(result.job.id);
        expect(job?.status).toBe("cancelled");
        // No further chunk ran after the cancel was observed.
        expect(job?.roundsCompleted).toBe(10);
    });

    it("is idempotent when cancelling an already-terminal job", async () => {
        const service = new StudioSimulationService(
            new InMemoryStudioSimulationRepository(),
            () => Promise.resolve(createFakeGame(manifest)),
        );

        const result = service.start("/a", {rounds: 10});
        if (result.status !== "created") {
            throw new Error("expected job to be created");
        }
        await waitForTerminal(service, result.job.id);

        const cancelled = service.cancel(result.job.id);

        expect(cancelled?.status).toBe("completed");
    });

    it("returns undefined when cancelling an unknown simulation id", () => {
        const service = new StudioSimulationService();

        expect(service.cancel("does-not-exist")).toBeUndefined();
    });

    it("cancelAll() stops every active job across every project", async () => {
        const gate = createControlledYield();
        const service = new StudioSimulationService(
            new InMemoryStudioSimulationRepository(),
            () => Promise.resolve(createFakeGame(manifest)),
            undefined,
            10,
            undefined,
            gate.yieldToEventLoop,
        );

        const first = service.start("/a", {rounds: 25});
        const second = service.start("/b", {rounds: 25});
        if (first.status !== "created" || second.status !== "created") {
            throw new Error("expected both jobs to be created");
        }
        await flushMacrotask();

        service.cancelAll();
        gate.release();
        gate.release();
        await flushMacrotask();

        expect(service.getStatus(first.job.id)?.status).toBe("cancelled");
        expect(service.getStatus(second.job.id)?.status).toBe("cancelled");
    });
});

describe("StudioSimulationService (integration, real loadPokieGame + fixture game packages)", () => {
    it("produces a JSON-shaped SimulationReport for a real, plain fixture game (no breakdown)", async () => {
        const fixtureRoot = path.join(__dirname, "..", "..", "fixtures", "playable-game");
        const service = new StudioSimulationService(new InMemoryStudioSimulationRepository(), loadPokieGame, undefined, 200);

        const result = service.start(fixtureRoot, {rounds: 500, seed: "demo"});
        if (result.status !== "created") {
            throw new Error("expected job to be created");
        }
        const job = await waitForTerminal(service, result.job.id);

        expect(job.status).toBe("completed");
        expect(job.report?.game).toEqual({id: "playable-game", name: "Playable Game", version: "1.0.0"});
        expect(job.report?.rounds).toBe(500);
        expect(job.report?.breakdown).toBeUndefined();
        expect(JSON.parse(JSON.stringify(job)).report.game.id).toBe("playable-game");
    });

    it("produces a base/freeGames breakdown for a real fixture game with a free-games feature, across chunks", async () => {
        const fixtureRoot = path.join(__dirname, "..", "..", "fixtures", "playable-game-with-free-games");
        const service = new StudioSimulationService(new InMemoryStudioSimulationRepository(), loadPokieGame, undefined, 300);

        const result = service.start(fixtureRoot, {rounds: 3000, seed: "demo"});
        if (result.status !== "created") {
            throw new Error("expected job to be created");
        }
        const job = await waitForTerminal(service, result.job.id);

        expect(job.status).toBe("completed");
        const {base, freeGames} = job.report!.breakdown!.components;
        expect(base.rounds).toBeGreaterThan(0);
        expect(freeGames.rounds).toBeGreaterThan(0);
        expect(base.rounds + freeGames.rounds).toBe(job.report!.rounds);
    });
});
