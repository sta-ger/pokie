import type {SimulationWorkerRequest} from "pokie";
import path from "path";
import {Worker} from "worker_threads";
import type {SimulationWorkerMessage} from "../../../src/simulation/parallel/internal/SimulationWorkerMessage.js";
import {TEST_WORKER_ENTRY_URL} from "./testWorkerEntryUrl.js";

const fixtureRoot = path.join(__dirname, "..", "..", "cli", "fixtures", "playable-game");
const fixtureRootWithFreeGames = path.join(__dirname, "..", "..", "cli", "fixtures", "playable-game-with-free-games");

// Real worker_threads integration tests against the internal worker entry point directly: no fakes
// anywhere in this file — a real Worker loads simulationWorkerEntry.js, which itself calls the real
// loadPokieGame against a real fixture package on disk. This is what actually exercises "a worker
// independently loads the same game package," not just the coordinator's message-handling logic (see
// SimulationWorkerCoordinator.test.ts for that). SimulationWorkerMessage is internal transport, not
// part of the public API — imported by relative path on purpose, unlike SimulationWorkerRequest.
function runWorker(request: SimulationWorkerRequest): Promise<{messages: SimulationWorkerMessage[]; worker: Worker}> {
    return new Promise((resolve, reject) => {
        const worker = new Worker(TEST_WORKER_ENTRY_URL, {workerData: request});
        const messages: SimulationWorkerMessage[] = [];
        worker.on("message", (message: SimulationWorkerMessage) => {
            messages.push(message);
            if (message.type === "result" || message.type === "error") {
                resolve({messages, worker});
            }
        });
        worker.on("error", reject);
    });
}

describe("simulationWorkerEntry (real worker_threads + real fixture package)", () => {
    jest.setTimeout(30000);

    afterEach(async () => {
        // Belt-and-suspenders: make sure nothing from a previous test is still alive before the next
        // one starts spawning more real OS threads.
        await new Promise((resolve) => {
            setTimeout(resolve, 10);
        });
    });

    test("plays its requested rounds and posts a terminal result message with the game's manifest", async () => {
        const {messages, worker} = await runWorker({
            workerIndex: 0,
            totalWorkers: 1,
            packageRoot: fixtureRoot,
            rounds: 200,
            seed: "demo",
            progressChunkSize: 1000,
        });
        await worker.terminate();

        const result = messages.find((m) => m.type === "result");
        expect(result).toBeDefined();
        if (result?.type !== "result") {
            throw new Error("expected a result message");
        }
        expect(result.manifest).toEqual({id: "playable-game", name: "Playable Game", version: "1.0.0"});
        expect(result.roundsCompleted).toBe(200);
        expect(result.accumulator.rounds).toBe(200);
        expect(result.accumulator.totalBet).toBeGreaterThan(0);
    });

    test("posts interim progress messages between chunks", async () => {
        const {messages, worker} = await runWorker({
            workerIndex: 0,
            totalWorkers: 1,
            packageRoot: fixtureRoot,
            rounds: 250,
            seed: "demo",
            progressChunkSize: 100,
        });
        await worker.terminate();

        const progress = messages.filter((m) => m.type === "progress");
        expect(progress.map((m) => (m.type === "progress" ? m.roundsCompleted : undefined))).toEqual([100, 200, 250]);
    });

    test("reports a base/freeGames breakdown when the fixture game supports it", async () => {
        const {messages, worker} = await runWorker({
            workerIndex: 0,
            totalWorkers: 1,
            packageRoot: fixtureRootWithFreeGames,
            rounds: 2000,
            seed: "demo",
            progressChunkSize: 500,
        });
        await worker.terminate();

        const result = messages.find((m) => m.type === "result");
        if (result?.type !== "result") {
            throw new Error("expected a result message");
        }
        expect(result.breakdown).toBeDefined();
        expect(result.breakdown!.base.rounds).toBeGreaterThan(0);
        expect(result.breakdown!.freeGames.rounds).toBeGreaterThan(0);
    });

    test("posts a safe {type: 'error'} message (no stack trace) for an invalid packageRoot", async () => {
        const {messages, worker} = await runWorker({
            workerIndex: 0,
            totalWorkers: 1,
            packageRoot: path.join(__dirname, "does-not-exist"),
            rounds: 10,
            progressChunkSize: 1000,
        });
        await worker.terminate();

        const errorMessage = messages.find((m) => m.type === "error");
        expect(errorMessage).toBeDefined();
        if (errorMessage?.type !== "error") {
            throw new Error("expected an error message");
        }
        expect(errorMessage.workerIndex).toBe(0);
        expect(errorMessage.message).not.toContain("\n    at ");
        expect(typeof errorMessage.message).toBe("string");
    });

    test("without a convergence request, stopReason is 'maxRounds' and no convergence field is posted (legacy path unaffected)", async () => {
        const {messages, worker} = await runWorker({
            workerIndex: 0,
            totalWorkers: 1,
            packageRoot: fixtureRoot,
            rounds: 50,
            seed: "demo",
            progressChunkSize: 1000,
        });
        await worker.terminate();

        const result = messages.find((m) => m.type === "result");
        if (result?.type !== "result") {
            throw new Error("expected a result message");
        }
        expect(result.stopReason).toBe("maxRounds");
        expect(result.convergence).toBeUndefined();
        expect(result.roundsCompleted).toBe(50);
    });

    test("stops before playing every requested round once its own convergence check is satisfied", async () => {
        const {messages, worker} = await runWorker({
            workerIndex: 0,
            totalWorkers: 1,
            packageRoot: fixtureRoot,
            rounds: 1000,
            seed: "demo",
            // A convergence check can only happen at a chunk boundary — the real ParallelSimulationRunner
            // sets progressChunkSize to convergence.checkIntervalRounds automatically (see
            // ParallelSimulationRunner.buildRequests()); this test drives the worker entry point
            // directly, so it must do the same by hand.
            progressChunkSize: 50,
            // An effectively-infinite tolerance means the only real gate is minRounds/stableChecks —
            // deterministic regardless of the fixture game's actual RTP variance, so this can't flake.
            convergence: {minRounds: 100, rtpTolerance: 10, checkIntervalRounds: 50, stableChecks: 2},
        });
        await worker.terminate();

        const result = messages.find((m) => m.type === "result");
        if (result?.type !== "result") {
            throw new Error("expected a result message");
        }
        // Checks at 50 (below minRounds), 100 (1st satisfying), 150 (2nd satisfying) -> converges at 150.
        expect(result.stopReason).toBe("converged");
        expect(result.roundsCompleted).toBe(150);
        expect(result.accumulator.rounds).toBe(150);
        expect(result.convergence).toEqual({
            minRounds: 100,
            rtpTolerance: 10,
            checkIntervalRounds: 50,
            stableChecks: 2,
            checksPerformed: 3,
            consecutiveStableChecks: 2,
            achievedRtpHalfWidth: expect.any(Number),
        });
    });

    test("two workers with the same seed but different rounds/workerIndex play independent (different) streams", async () => {
        const [a, b] = await Promise.all([
            runWorker({workerIndex: 0, totalWorkers: 2, packageRoot: fixtureRoot, rounds: 300, seed: "demo::worker0/2", progressChunkSize: 1000}),
            runWorker({workerIndex: 1, totalWorkers: 2, packageRoot: fixtureRoot, rounds: 300, seed: "demo::worker1/2", progressChunkSize: 1000}),
        ]);
        await Promise.all([a.worker.terminate(), b.worker.terminate()]);

        const resultA = a.messages.find((m) => m.type === "result");
        const resultB = b.messages.find((m) => m.type === "result");
        if (resultA?.type !== "result" || resultB?.type !== "result") {
            throw new Error("expected both workers to produce a result");
        }
        // Different derived seeds should very likely produce different totals over 300 rounds —
        // if they were secretly sharing one RNG stream, replaying the "same" 300 rounds from two
        // different starting seeds would still differ, which is exactly what we're checking.
        expect(resultA.accumulator.totalPayout).not.toBe(resultB.accumulator.totalPayout);
    });
});
