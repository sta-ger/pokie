import {loadPokieGame, ParallelSimulationRunner} from "pokie";
import path from "path";
import {TEST_WORKER_ENTRY_URL} from "../tests/simulation/parallel/testWorkerEntryUrl.js";
import {formatBenchmarkLine, measureBenchmarkAsync} from "./support/measureBenchmark.js";

// Reuses the same real-worker_threads infrastructure as
// tests/cli/commands/SimCommand.realWorkers.test.ts (compiled worker entry + the "playable-game"
// fixture) rather than inventing a second one -- this is the one place in the repo real workers>1
// simulation already runs for real, not a fake coordinator. Deliberately mirrors that file's own
// "smoke comparison ... no asserted speedup" test: a real CI/dev machine can have as little as one
// usable core, where worker-thread spawn overhead can make workers>1 *slower* than in-process, so
// recording the numbers is the goal here, not gating on which one wins (see benchmarks/README.md).
const FIXTURE_ROOT = path.join(__dirname, "..", "tests", "cli", "fixtures", "playable-game");
const ROUNDS = 5_000;
const WORKER_COUNTS = [1, 4];

describe("benchmark: parallel worker comparison (ParallelSimulationRunner, real worker_threads)", () => {
    jest.setTimeout(30_000);

    test.each(WORKER_COUNTS)("workers=%i: records throughput for a fixed workload (no asserted speedup)", async (workers) => {
        const runner = new ParallelSimulationRunner(FIXTURE_ROOT, ROUNDS, {
            loadGame: workers === 1 ? loadPokieGame : undefined,
            workers,
            workerEntryUrl: workers === 1 ? undefined : TEST_WORKER_ENTRY_URL,
        });

        const {result, durationMs} = await measureBenchmarkAsync(() => runner.run());

        const roundsPerSecond = ROUNDS / (durationMs / 1000);
        console.log(
            formatBenchmarkLine("parallelWorkerComparison", {
                workers,
                rounds: ROUNDS,
                durationMs,
                roundsPerSecond,
            }),
        );

        expect(result.workers).toBe(workers);
        expect(result.statistics.rounds).toBe(ROUNDS);
        expect(Number.isFinite(roundsPerSecond)).toBe(true);
    });
});
