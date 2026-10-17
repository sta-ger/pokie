import {SimulationAccumulator} from "../../../src/simulation/SimulationAccumulator.js";
import {analyticsEnvelope} from "../../../src/simulation/FeatureAnalytics.js";
import {SimulationCancelledError, SimulationWorkerCoordinator, SimulationWorkerFailureError, SimulationWorkerRequest, SimulationWorkerResult} from "@fromstan/pokie";
import {EventEmitter} from "events";
import type {Worker} from "worker_threads";

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

it("never claims worker termination completed when termination rejects", async () => {
    const worker = new FakeWorker(() => Promise.reject(new Error("termination refused")));
    const coordinator = new SimulationWorkerCoordinator(undefined, () => worker as unknown as Worker);
    const promise = coordinator.run([makeRequest(0)]);
    worker.emit("message", {type: "result", ...makeResult(0)});
    await expect(promise).rejects.toThrow("Worker cleanup unconfirmed");
    expect(worker.terminateCallCount).toBe(1);
});

it("keeps cancellation pending until cooperative runtime release and termination settle", async () => {
    let completeTermination: (code: number) => void = () => undefined;
    const worker = new FakeWorker(() => new Promise(resolve => {
        completeTermination = resolve;
    }));
    const controller = new AbortController();
    const request = {...makeRequest(0), requireCleanup: true, cancellation: new SharedArrayBuffer(4)};
    const coordinator = new SimulationWorkerCoordinator(undefined, () => worker as unknown as Worker);
    const promise = coordinator.run([request], {signal: controller.signal});
    let settled = false;
    const completion = promise.catch(() => {
        settled = true;
    });
    controller.abort();
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(Atomics.load(new Int32Array(request.cancellation), 0)).toBe(1);
    worker.emit("message", {type: "result", ...makeResult(0)});
    await new Promise<void>(resolve => {
        setImmediate(resolve);
    });
    expect(worker.terminateCallCount).toBe(1);
    expect(settled).toBe(false);
    completeTermination(0);
    await expect(promise).rejects.toBeInstanceOf(SimulationCancelledError);
    await completion;
});

describe("SimulationWorkerCoordinator", () => {
    test("resolves with every worker's result once all have posted one", async () => {
        const workers = [new FakeWorker(), new FakeWorker()];
        let created = 0;
        const coordinator = new SimulationWorkerCoordinator(undefined, () => workers[created++] as unknown as Worker);

        const promise = coordinator.run([makeRequest(0), makeRequest(1)]);
        workers[0].emit("message", {type: "result", ...makeResult(0)});
        workers[1].emit("message", {type: "result", ...makeResult(1)});

        const results = await promise;
        expect(results).toHaveLength(2);
        expect(results.map((r) => r.workerIndex).sort()).toEqual([0, 1]);
    });

    test("preserves all terminal result fields across the worker transport boundary", async () => {
        const worker = new FakeWorker();
        const coordinator = new SimulationWorkerCoordinator(undefined, () => worker as unknown as Worker);
        const promise = coordinator.run([makeRequest(0)]);
        worker.emit("message", {
            type: "result",
            ...makeResult(0),
            jackpot: {awardCount: 1, totalAwarded: 10, totalContributed: 1, pools: {}},
            stopReason: "converged",
            convergence: {minRounds: 10, rtpTolerance: 0.01, checkIntervalRounds: 5, stableChecks: 2, checksPerformed: 3, consecutiveStableChecks: 2, achievedRtpHalfWidth: 0.005},
        });

        await expect(promise).resolves.toMatchObject([{jackpot: {totalAwarded: 10}, stopReason: "converged", convergence: {checksPerformed: 3}}]);
    });

    test("resolves with an empty array without spawning anything when given no requests", async () => {
        const coordinator = new SimulationWorkerCoordinator(undefined, () => {
            throw new Error("should never be called");
        });

        await expect(coordinator.run([])).resolves.toEqual([]);
    });

    test("forwards progress messages via onProgress", async () => {
        const worker = new FakeWorker();
        const coordinator = new SimulationWorkerCoordinator(undefined, () => worker as unknown as Worker);
        const progressEvents: Array<{workerIndex: number;
 roundsCompleted: number}> = [];

        const promise = coordinator.run([makeRequest(0)], {onProgress: (p) => progressEvents.push(p)});
        worker.emit("message", {type: "progress", workerIndex: 0, roundsCompleted: 50});
        worker.emit("message", {type: "result", ...makeResult(0)});

        await promise;
        expect(progressEvents).toEqual([{workerIndex: 0, roundsCompleted: 50}]);
    });

    test("one worker's explicit error message ends the whole run and terminates every worker", async () => {
        const workers = [new FakeWorker(), new FakeWorker()];
        let created = 0;
        const coordinator = new SimulationWorkerCoordinator(undefined, () => workers[created++] as unknown as Worker);

        const promise = coordinator.run([makeRequest(0), makeRequest(1)]);
        workers[1].emit("message", {type: "error", workerIndex: 1, message: "boom"});

        await expect(promise).rejects.toThrow(SimulationWorkerFailureError);
        await expect(promise).rejects.toThrow(/Worker 1 failed: boom/);
        expect(workers[0].terminateCallCount).toBe(1);
        expect(workers[1].terminateCallCount).toBe(1);
    });

    test("carries the failing worker's index on the thrown error", async () => {
        const worker = new FakeWorker();
        const coordinator = new SimulationWorkerCoordinator(undefined, () => worker as unknown as Worker);

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
        const coordinator = new SimulationWorkerCoordinator(undefined, () => worker as unknown as Worker);

        const promise = coordinator.run([makeRequest(0)]);
        worker.emit("error", new Error("segfault-ish crash"));

        await expect(promise).rejects.toThrow(/Worker 0 failed: segfault-ish crash/);
    });

    test("a malformed message (no recognizable type) fails the run instead of hanging or throwing raw", async () => {
        const worker = new FakeWorker();
        const coordinator = new SimulationWorkerCoordinator(undefined, () => worker as unknown as Worker);

        const promise = coordinator.run([makeRequest(0)]);
        worker.emit("message", {unexpected: "shape"});

        await expect(promise).rejects.toThrow(SimulationWorkerFailureError);
        await expect(promise).rejects.toThrow(/malformed message/);
    });

    test("a null message is treated as malformed rather than crashing the coordinator", async () => {
        const worker = new FakeWorker();
        const coordinator = new SimulationWorkerCoordinator(undefined, () => worker as unknown as Worker);

        const promise = coordinator.run([makeRequest(0)]);
        worker.emit("message", null);

        await expect(promise).rejects.toThrow(/malformed message/);
    });

    test("an unrecognized message type fails the run", async () => {
        const worker = new FakeWorker();
        const coordinator = new SimulationWorkerCoordinator(undefined, () => worker as unknown as Worker);

        const promise = coordinator.run([makeRequest(0)]);
        worker.emit("message", {type: "something-else"});

        await expect(promise).rejects.toThrow(SimulationWorkerFailureError);
    });

    test("premature exit (before posting a result) fails the run", async () => {
        const worker = new FakeWorker();
        const coordinator = new SimulationWorkerCoordinator(undefined, () => worker as unknown as Worker);

        const promise = coordinator.run([makeRequest(0)]);
        worker.emit("exit", 1);

        await expect(promise).rejects.toThrow(/worker exited prematurely with code 1/);
    });

    test("exit with code 0 but no prior result is still treated as premature", async () => {
        const worker = new FakeWorker();
        const coordinator = new SimulationWorkerCoordinator(undefined, () => worker as unknown as Worker);

        const promise = coordinator.run([makeRequest(0)]);
        worker.emit("exit", 0);

        await expect(promise).rejects.toThrow(/worker exited prematurely/);
    });

    test("a clean exit after already posting a result is not an error", async () => {
        const worker = new FakeWorker();
        const coordinator = new SimulationWorkerCoordinator(undefined, () => worker as unknown as Worker);

        const promise = coordinator.run([makeRequest(0)]);
        worker.emit("message", {type: "result", ...makeResult(0)});
        worker.emit("exit", 0);

        await expect(promise).resolves.toHaveLength(1);
    });

    test("a messageerror (unparseable message) fails the run with a safe message", async () => {
        const worker = new FakeWorker();
        const coordinator = new SimulationWorkerCoordinator(undefined, () => worker as unknown as Worker);

        const promise = coordinator.run([makeRequest(0)]);
        worker.emit("messageerror", new Error("clone failed"));

        await expect(promise).rejects.toThrow(/unparseable message: clone failed/);
    });

    test("an already-aborted signal rejects immediately without spawning any worker", async () => {
        const controller = new AbortController();
        controller.abort();
        const coordinator = new SimulationWorkerCoordinator(undefined, () => {
            throw new Error("should never be called");
        });

        await expect(coordinator.run([makeRequest(0)], {signal: controller.signal})).rejects.toBeInstanceOf(SimulationCancelledError);
    });

    test("aborting mid-run terminates every worker and rejects with SimulationCancelledError", async () => {
        const workers = [new FakeWorker(), new FakeWorker()];
        let created = 0;
        const controller = new AbortController();
        const coordinator = new SimulationWorkerCoordinator(undefined, () => workers[created++] as unknown as Worker);

        const promise = coordinator.run([makeRequest(0), makeRequest(1)], {signal: controller.signal});
        controller.abort();

        await expect(promise).rejects.toBeInstanceOf(SimulationCancelledError);
        expect(workers[0].terminateCallCount).toBe(1);
        expect(workers[1].terminateCallCount).toBe(1);
    });

    test("no worker is left running (every worker gets terminate()) after a failure", async () => {
        const workers = [new FakeWorker(), new FakeWorker(), new FakeWorker()];
        let created = 0;
        const coordinator = new SimulationWorkerCoordinator(undefined, () => workers[created++] as unknown as Worker);

        const promise = coordinator.run([makeRequest(0), makeRequest(1), makeRequest(2)]);
        workers[2].emit("message", {type: "error", workerIndex: 2, message: "boom"});

        await expect(promise).rejects.toThrow();
        workers.forEach((worker) => expect(worker.terminateCallCount).toBe(1));
    });

    test("a partial startup failure rejects and terminates workers already created", async () => {
        const first = new FakeWorker();
        let creates = 0;
        const coordinator = new SimulationWorkerCoordinator(undefined, () => {
            creates++;
            if (creates === 1) return first as unknown as Worker;
            throw new Error("thread quota exhausted");
        });

        await expect(coordinator.run([makeRequest(0), makeRequest(1)])).rejects.toThrow(/could not create worker: thread quota exhausted/);
        expect(first.terminateCallCount).toBe(1);
    });

    test("a worker rejecting terminate() never masks the original failure reason", async () => {
        const worker = new FakeWorker(() => Promise.reject(new Error("already dead")));
        const coordinator = new SimulationWorkerCoordinator(undefined, () => worker as unknown as Worker);

        const promise = coordinator.run([makeRequest(0)]);
        worker.emit("message", {type: "error", workerIndex: 0, message: "original reason"});

        await expect(promise).rejects.toThrow(/original reason/);
    });
});

it("rejects incompatible cancellation prefixes after worker cleanup instead of escaping finish", async () => {
    const workers = [new FakeWorker(), new FakeWorker()];
    let index = 0;
    const signal = new AbortController();
    const coordinator = new SimulationWorkerCoordinator(undefined, () => workers[index++] as unknown as Worker);
    const promise = coordinator.run([makeRequest(0), makeRequest(1)], {signal: signal.signal});
    for (let i = 0;
        i < 2;
        i++) {
        const accumulator = new SimulationAccumulator();
        accumulator.configureAnalytics(analyticsEnvelope(`model-${i}`));
        workers[i].emit("message", {type: "progress", workerIndex: i, roundsCompleted: 0, accumulator: accumulator.toSnapshot()});
    }
    signal.abort();
    await expect(promise).rejects.toThrow(/analytics.*provenance/);
    expect(workers.map(worker => worker.terminateCallCount)).toEqual([1, 1]);
    expect(workers.map(worker => worker.listenerCount("message"))).toEqual([0, 0]);
});

it.each(["progress", "result", "error"] as const)("rejects malformed %s analytics only after awaited worker cleanup", async (type) => {
    for (const field of ["durationSum", "winSum", "mode", "maximum"] as const) {
        let release!: (code: number) => void;
        const worker = new FakeWorker(() => new Promise<number>(resolve => {
            release = resolve;
        }));
        const coordinator = new SimulationWorkerCoordinator(undefined, () => worker as unknown as Worker);
        const a = new SimulationAccumulator();
        a.addRound(1, 2);
        const accumulator = a.toSnapshot();
        if (field === "mode") accumulator.analytics!.betModes["m".repeat(1000000)] = 0;
        else if (field === "maximum") accumulator.maxWinCount = 0;
        else accumulator.analytics!.features.freeGames[field] = 100;
        const before = JSON.stringify(accumulator);
        let settled = false;
        const promise = coordinator.run([makeRequest(0)]);
        const rejected = expect(promise).rejects.toThrow(/analytics/i);
        const settlement = promise.then(() => {
            settled = true;
        }, () => {
            settled = true;
        });
        worker.emit("message", {type, ...makeResult(0, 1), accumulator, message: "failed"});
        await Promise.resolve();
        await Promise.resolve();
        expect(worker.terminateCallCount).toBe(1);
        expect(settled).toBe(false);
        release(0);
        await rejected;
        await settlement;
        expect(worker.listenerCount("message")).toBe(0);
        expect(JSON.stringify(accumulator)).toBe(before);
    }
});

it("propagates cleanup only when every worker has entered it and still drains after observer failure", async () => {
    const workers = [new FakeWorker(), new FakeWorker()];
    let created = 0;
    const phases: string[] = [];
    const coordinator = new SimulationWorkerCoordinator(undefined, () => workers[created++] as unknown as Worker);
    const pending = coordinator.run([makeRequest(0, 2), makeRequest(1, 2)], {onPhase: phase => phases.push(phase)});
    workers[0].emit("message", {type: "phase", workerIndex: 0, phase: "simulation"});
    workers[0].emit("message", {type: "phase", workerIndex: 0, phase: "finalizing / cleanup"});
    expect(phases).toEqual(["simulation"]);
    workers[1].emit("message", {type: "phase", workerIndex: 1, phase: "finalizing / cleanup"});
    expect(phases).toEqual(["simulation", "finalizing / cleanup"]);
    workers[0].emit("message", {type: "result", ...makeResult(0)});
    workers[1].emit("message", {type: "result", ...makeResult(1)});
    await pending;
    expect(workers.every(worker => worker.terminateCallCount === 1)).toBe(true);
    const failing = new FakeWorker();
    const rejected = new SimulationWorkerCoordinator(undefined, () => failing as unknown as Worker).run([makeRequest(0)], {onPhase: () => {
        throw new Error("observation failed");
    }});
    failing.emit("message", {type: "result", ...makeResult(0)});
    await expect(rejected).rejects.toThrow("observation failed");
    expect(failing.terminateCallCount).toBe(1);
});


it.each([false, true])("accepts terminal drainage counts and lets release failure=%s override cancellation", async cleanupFailed => {
    const workers = [new FakeWorker(), new FakeWorker()];
    let created = 0;
    const controller = new AbortController();
    const coordinator = new SimulationWorkerCoordinator(undefined, () => workers[created++] as unknown as Worker);
    const requests = [0, 1].map(index => ({...makeRequest(index, 2), requireCleanup: true}));
    const promise = coordinator.run(requests, {signal: controller.signal});
    workers[0].emit("message", {type: "progress", ...makeResult(0, 2)});
    controller.abort();
    workers[0].emit("message", {type: "result", ...makeResult(0, 7)});
    workers[1].emit("message", {type: "error", workerIndex: 1, message: cleanupFailed ? "release refused" : "cancelled", cancelled: !cleanupFailed, cleanupFailed, accumulator: makeResult(1, 9).accumulator});
    await expect(promise).rejects.toMatchObject({message: expect.stringContaining(cleanupFailed ? "cleanup failed" : "cancelled"), observedPrefix: {rounds: 16}});
    expect(workers.map(worker => worker.terminateCallCount)).toEqual([1, 1]);
    expect(workers.map(worker => worker.listenerCount("message"))).toEqual([0, 0]);
});

it("validates error snapshots during drainage and retains the last valid prefix", async () => {
    const worker = new FakeWorker();
    const controller = new AbortController();
    const coordinator = new SimulationWorkerCoordinator(undefined, () => worker as unknown as Worker);
    const promise = coordinator.run([{...makeRequest(0), requireCleanup: true}], {signal: controller.signal});
    worker.emit("message", {type: "progress", ...makeResult(0, 2)});
    controller.abort();
    worker.emit("message", {type: "error", workerIndex: 0, message: "cancelled", cancelled: true, accumulator: {...makeResult(0, 7).accumulator, rounds: -1}});
    await expect(promise).rejects.toMatchObject({message: expect.stringContaining("cleanup unconfirmed"), observedPrefix: {rounds: 2}});
    expect(worker.terminateCallCount).toBe(1);
});
