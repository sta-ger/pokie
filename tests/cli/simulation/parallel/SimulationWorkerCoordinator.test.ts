import {EventEmitter} from "events";
import type {Worker} from "worker_threads";
import {SimulationCancelledError} from "../../../../cli/simulation/parallel/SimulationCancelledError.js";
import {SimulationWorkerCoordinator} from "../../../../cli/simulation/parallel/SimulationWorkerCoordinator.js";
import type {SimulationWorkerRequest} from "../../../../cli/simulation/parallel/SimulationWorkerRequest.js";
import {SimulationWorkerFailureError} from "../../../../cli/simulation/parallel/SimulationWorkerFailureError.js";
import type {SimulationWorkerResult} from "../../../../cli/simulation/parallel/SimulationWorkerResult.js";

// A fake worker_threads Worker: a plain EventEmitter with a `terminate()` a test can observe, so
// these tests exercise SimulationWorkerCoordinator's own message-protocol/lifecycle logic without
// spawning a single real OS thread (real-thread behavior is covered by the ParallelSimulationRunner/
// simulationWorkerEntry integration tests).
class FakeWorker extends EventEmitter {
    public terminateCallCount = 0;
    private readonly terminateImpl: () => Promise<number>;

    constructor(terminateImpl: () => Promise<number> = () => Promise.resolve(0)) {
        super();
        this.terminateImpl = terminateImpl;
    }

    public terminate(): Promise<number> {
        this.terminateCallCount++;
        return this.terminateImpl();
    }
}

function makeRequest(workerIndex: number, totalWorkers = 1): SimulationWorkerRequest {
    return {workerIndex, totalWorkers, packageRoot: "/fake/root", rounds: 100, progressChunkSize: 1000};
}

function makeResult(workerIndex: number, rounds = 100): SimulationWorkerResult {
    return {
        workerIndex,
        manifest: {id: "fake-game", name: "Fake Game", version: "1.0.0"},
        accumulator: {
            rounds,
            hitCount: 0,
            totalBet: rounds,
            totalPayout: 0,
            maxWin: 0,
            meanPayout: 0,
            meanSquareDelta: 0,
            meanReturnRatio: 0,
            meanReturnRatioSquareDelta: 0,
            payoutHistogram: {},
        },
        roundsCompleted: rounds,
    };
}

describe("SimulationWorkerCoordinator", () => {
    test("resolves with every worker's result once all have posted one", async () => {
        const workers = [new FakeWorker(), new FakeWorker()];
        let created = 0;
        const coordinator = new SimulationWorkerCoordinator(
            new URL("file:///unused"),
            () => workers[created++] as unknown as Worker,
        );

        const promise = coordinator.run([makeRequest(0), makeRequest(1)]);
        workers[0].emit("message", {type: "result", ...makeResult(0)});
        workers[1].emit("message", {type: "result", ...makeResult(1)});

        const results = await promise;
        expect(results).toHaveLength(2);
        expect(results.map((r) => r.workerIndex).sort()).toEqual([0, 1]);
    });

    test("resolves with an empty array without spawning anything when given no requests", async () => {
        const coordinator = new SimulationWorkerCoordinator(new URL("file:///unused"), () => {
            throw new Error("should never be called");
        });

        await expect(coordinator.run([])).resolves.toEqual([]);
    });

    test("forwards progress messages via onProgress", async () => {
        const worker = new FakeWorker();
        const coordinator = new SimulationWorkerCoordinator(new URL("file:///unused"), () => worker as unknown as Worker);
        const progressEvents: Array<{workerIndex: number; roundsCompleted: number}> = [];

        const promise = coordinator.run([makeRequest(0)], {onProgress: (p) => progressEvents.push(p)});
        worker.emit("message", {type: "progress", workerIndex: 0, roundsCompleted: 50});
        worker.emit("message", {type: "result", ...makeResult(0)});

        await promise;
        expect(progressEvents).toEqual([{workerIndex: 0, roundsCompleted: 50}]);
    });

    test("one worker's explicit error message ends the whole run and terminates every worker", async () => {
        const workers = [new FakeWorker(), new FakeWorker()];
        let created = 0;
        const coordinator = new SimulationWorkerCoordinator(
            new URL("file:///unused"),
            () => workers[created++] as unknown as Worker,
        );

        const promise = coordinator.run([makeRequest(0), makeRequest(1)]);
        workers[1].emit("message", {type: "error", workerIndex: 1, message: "boom"});

        await expect(promise).rejects.toThrow(SimulationWorkerFailureError);
        await expect(promise).rejects.toThrow(/Worker 1 failed: boom/);
        expect(workers[0].terminateCallCount).toBe(1);
        expect(workers[1].terminateCallCount).toBe(1);
    });

    test("carries the failing worker's index on the thrown error", async () => {
        const worker = new FakeWorker();
        const coordinator = new SimulationWorkerCoordinator(new URL("file:///unused"), () => worker as unknown as Worker);

        const promise = coordinator.run([makeRequest(3, 4)]);
        worker.emit("message", {type: "error", workerIndex: 3, message: "package load failed"});

        try {
            await promise;
            throw new Error("expected promise to reject");
        } catch (error) {
            expect(error).toBeInstanceOf(SimulationWorkerFailureError);
            expect((error as SimulationWorkerFailureError).workerIndex).toBe(3);
        }
    });

    test("an uncaught worker-thread exception ('error' event) fails the run with a safe message", async () => {
        const worker = new FakeWorker();
        const coordinator = new SimulationWorkerCoordinator(new URL("file:///unused"), () => worker as unknown as Worker);

        const promise = coordinator.run([makeRequest(0)]);
        worker.emit("error", new Error("segfault-ish crash"));

        await expect(promise).rejects.toThrow(/Worker 0 failed: segfault-ish crash/);
    });

    test("a malformed message (no recognizable type) fails the run instead of hanging or throwing raw", async () => {
        const worker = new FakeWorker();
        const coordinator = new SimulationWorkerCoordinator(new URL("file:///unused"), () => worker as unknown as Worker);

        const promise = coordinator.run([makeRequest(0)]);
        worker.emit("message", {unexpected: "shape"});

        await expect(promise).rejects.toThrow(SimulationWorkerFailureError);
        await expect(promise).rejects.toThrow(/malformed message/);
    });

    test("a null message is treated as malformed rather than crashing the coordinator", async () => {
        const worker = new FakeWorker();
        const coordinator = new SimulationWorkerCoordinator(new URL("file:///unused"), () => worker as unknown as Worker);

        const promise = coordinator.run([makeRequest(0)]);
        worker.emit("message", null);

        await expect(promise).rejects.toThrow(/malformed message/);
    });

    test("an unrecognized message type fails the run", async () => {
        const worker = new FakeWorker();
        const coordinator = new SimulationWorkerCoordinator(new URL("file:///unused"), () => worker as unknown as Worker);

        const promise = coordinator.run([makeRequest(0)]);
        worker.emit("message", {type: "something-else"});

        await expect(promise).rejects.toThrow(SimulationWorkerFailureError);
    });

    test("premature exit (before posting a result) fails the run", async () => {
        const worker = new FakeWorker();
        const coordinator = new SimulationWorkerCoordinator(new URL("file:///unused"), () => worker as unknown as Worker);

        const promise = coordinator.run([makeRequest(0)]);
        worker.emit("exit", 1);

        await expect(promise).rejects.toThrow(/worker exited prematurely with code 1/);
    });

    test("exit with code 0 but no prior result is still treated as premature", async () => {
        const worker = new FakeWorker();
        const coordinator = new SimulationWorkerCoordinator(new URL("file:///unused"), () => worker as unknown as Worker);

        const promise = coordinator.run([makeRequest(0)]);
        worker.emit("exit", 0);

        await expect(promise).rejects.toThrow(/worker exited prematurely/);
    });

    test("a clean exit after already posting a result is not an error", async () => {
        const worker = new FakeWorker();
        const coordinator = new SimulationWorkerCoordinator(new URL("file:///unused"), () => worker as unknown as Worker);

        const promise = coordinator.run([makeRequest(0)]);
        worker.emit("message", {type: "result", ...makeResult(0)});
        worker.emit("exit", 0);

        await expect(promise).resolves.toHaveLength(1);
    });

    test("a messageerror (unparseable message) fails the run with a safe message", async () => {
        const worker = new FakeWorker();
        const coordinator = new SimulationWorkerCoordinator(new URL("file:///unused"), () => worker as unknown as Worker);

        const promise = coordinator.run([makeRequest(0)]);
        worker.emit("messageerror", new Error("clone failed"));

        await expect(promise).rejects.toThrow(/unparseable message: clone failed/);
    });

    test("an already-aborted signal rejects immediately without spawning any worker", async () => {
        const controller = new AbortController();
        controller.abort();
        const coordinator = new SimulationWorkerCoordinator(new URL("file:///unused"), () => {
            throw new Error("should never be called");
        });

        await expect(coordinator.run([makeRequest(0)], {signal: controller.signal})).rejects.toBeInstanceOf(SimulationCancelledError);
    });

    test("aborting mid-run terminates every worker and rejects with SimulationCancelledError", async () => {
        const workers = [new FakeWorker(), new FakeWorker()];
        let created = 0;
        const controller = new AbortController();
        const coordinator = new SimulationWorkerCoordinator(
            new URL("file:///unused"),
            () => workers[created++] as unknown as Worker,
        );

        const promise = coordinator.run([makeRequest(0), makeRequest(1)], {signal: controller.signal});
        controller.abort();

        await expect(promise).rejects.toBeInstanceOf(SimulationCancelledError);
        expect(workers[0].terminateCallCount).toBe(1);
        expect(workers[1].terminateCallCount).toBe(1);
    });

    test("no worker is left running (every worker gets terminate()) after a failure", async () => {
        const workers = [new FakeWorker(), new FakeWorker(), new FakeWorker()];
        let created = 0;
        const coordinator = new SimulationWorkerCoordinator(
            new URL("file:///unused"),
            () => workers[created++] as unknown as Worker,
        );

        const promise = coordinator.run([makeRequest(0), makeRequest(1), makeRequest(2)]);
        workers[2].emit("message", {type: "error", workerIndex: 2, message: "boom"});

        await expect(promise).rejects.toThrow();
        workers.forEach((worker) => expect(worker.terminateCallCount).toBe(1));
    });

    test("a worker rejecting terminate() never masks the original failure reason", async () => {
        const worker = new FakeWorker(() => Promise.reject(new Error("already dead")));
        const coordinator = new SimulationWorkerCoordinator(new URL("file:///unused"), () => worker as unknown as Worker);

        const promise = coordinator.run([makeRequest(0)]);
        worker.emit("message", {type: "error", workerIndex: 0, message: "original reason"});

        await expect(promise).rejects.toThrow(/original reason/);
    });
});
