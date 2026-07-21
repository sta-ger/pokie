import {loadPokieGame} from "pokie";
import path from "path";
import {InMemoryStudioSimulationRepository} from "../../../../cli/studio/simulation/InMemoryStudioSimulationRepository.js";
import {StudioSimulationJobView} from "../../../../cli/studio/simulation/StudioSimulationJobView.js";
import {StudioSimulationService} from "../../../../cli/studio/simulation/StudioSimulationService.js";
import {TEST_WORKER_ENTRY_URL} from "../../../simulation/parallel/testWorkerEntryUrl.js";

// Extracted from StudioSimulationService.test.ts: this describe spins up real worker_threads,
// which is why it lives in the "pokie-integration" lane instead of the default fast "pokie" lane
// (the controlled-yield-driven, in-process describe above it in the original file stays fast) --
// see jest.config.mjs.
describe("StudioSimulationService (integration, real worker threads via --workers)", () => {
    jest.setTimeout(30000);
    const fixtureRoot = path.join(__dirname, "..", "..", "fixtures", "playable-game");

    // waitForTerminal (in StudioSimulationService.test.ts) polls via a bare setImmediate — fine for
    // the fake-driven tests there, where progress advances in lockstep with queued microtasks, but
    // real worker threads take real wall-clock time to spin up/load/compute, which thousands of
    // back-to-back setImmediate ticks don't reliably span. This polls with a real delay instead.
    async function waitForTerminalRealTime(service: StudioSimulationService, id: string): Promise<StudioSimulationJobView> {
        for (let i = 0; i < 1000; i++) {
            const job = service.getStatus(id);
            if (job && job.status !== "queued" && job.status !== "running") {
                return job;
            }
            await new Promise((resolve) => {
                setTimeout(resolve, 20);
            });
        }
        throw new Error("Timed out waiting for the simulation to reach a terminal state.");
    }

    it("runs a workers=2 simulation across real worker threads and reports workers on the job/report", async () => {
        const service = new StudioSimulationService(
            new InMemoryStudioSimulationRepository(),
            loadPokieGame,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            TEST_WORKER_ENTRY_URL,
        );

        const result = service.start(fixtureRoot, {rounds: 1000, seed: "demo", workers: 2});
        if (result.status !== "created") {
            throw new Error("expected job to be created");
        }
        expect(result.job.workers).toBe(2);

        const job = await waitForTerminalRealTime(service, result.job.id);

        expect(job.status).toBe("completed");
        expect(job.workers).toBe(2);
        expect(job.roundsCompleted).toBe(1000);
        expect(job.report?.workers).toBe(2);
    });

    it("runs a workers=4 simulation with an uneven round split and still completes every round", async () => {
        const service = new StudioSimulationService(
            new InMemoryStudioSimulationRepository(),
            loadPokieGame,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            TEST_WORKER_ENTRY_URL,
        );

        const result = service.start(fixtureRoot, {rounds: 1001, workers: 4});
        if (result.status !== "created") {
            throw new Error("expected job to be created");
        }
        const job = await waitForTerminalRealTime(service, result.job.id);

        expect(job.status).toBe("completed");
        expect(job.report?.rounds).toBe(1001);
    });

    it("reports aggregate progress across workers while the job is running", async () => {
        // A small chunkSize so the first progress message arrives quickly regardless of real thread
        // spin-up overhead, and a round count large enough that the run is still going when polled.
        const service = new StudioSimulationService(
            new InMemoryStudioSimulationRepository(),
            loadPokieGame,
            undefined,
            200, // chunkSize
            undefined,
            undefined,
            undefined,
            TEST_WORKER_ENTRY_URL,
        );

        const result = service.start(fixtureRoot, {rounds: 200_000, workers: 2});
        if (result.status !== "created") {
            throw new Error("expected job to be created");
        }

        // Poll for some non-zero progress before the run finishes — generous enough to not be flaky
        // on a slow/contended CI machine, but bounded so a genuine regression still fails promptly.
        let sawProgress = false;
        for (let i = 0; i < 500; i++) {
            const status = service.getStatus(result.job.id);
            if (status && (status.roundsCompleted > 0 || status.status === "completed")) {
                sawProgress = status.roundsCompleted > 0;
                break;
            }
            await new Promise((resolve) => {
                setTimeout(resolve, 20);
            });
        }
        expect(sawProgress).toBe(true);

        await waitForTerminalRealTime(service, result.job.id);
    });

    it("cancelling a workers>1 job stops it (and its worker threads) without returning a partial report as successful", async () => {
        // A small chunkSize so the first progress tick (proof the job has actually started on the
        // workers) arrives quickly, letting cancellation be triggered off a real signal instead of an
        // arbitrary blind delay. That in turn lets the round count come down from the 5,000,000 this
        // test used before — which existed only to make "still running after a guessed delay" a safe
        // bet — to a size that's cheap but still comfortably larger than what one chunk can finish
        // before cancel() takes effect, so this still genuinely exercises real-worker-thread
        // cancellation rather than a job that raced to completion first.
        const service = new StudioSimulationService(
            new InMemoryStudioSimulationRepository(),
            loadPokieGame,
            undefined,
            200, // chunkSize
            undefined,
            undefined,
            undefined,
            TEST_WORKER_ENTRY_URL,
        );

        const result = service.start(fixtureRoot, {rounds: 200_000, workers: 2});
        if (result.status !== "created") {
            throw new Error("expected job to be created");
        }

        let sawProgress = false;
        for (let i = 0; i < 500; i++) {
            const status = service.getStatus(result.job.id);
            if (status && (status.roundsCompleted > 0 || status.status === "completed")) {
                sawProgress = status.roundsCompleted > 0;
                break;
            }
            await new Promise((resolve) => {
                setTimeout(resolve, 20);
            });
        }
        expect(sawProgress).toBe(true);
        service.cancel(result.job.id);

        const job = await waitForTerminalRealTime(service, result.job.id);
        expect(job.status).toBe("cancelled");
        expect(job.report).toBeUndefined();
    });

    it("fails the job with a safe error message when the packageRoot is invalid, across real worker threads", async () => {
        const service = new StudioSimulationService(
            new InMemoryStudioSimulationRepository(),
            loadPokieGame,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            TEST_WORKER_ENTRY_URL,
        );

        const result = service.start(path.join(__dirname, "does-not-exist"), {rounds: 100, workers: 2});
        if (result.status !== "created") {
            throw new Error("expected job to be created");
        }
        const job = await waitForTerminalRealTime(service, result.job.id);

        expect(job.status).toBe("failed");
        expect(job.error).toBeDefined();
        expect(job.error).not.toContain("\n    at ");
    });
});
