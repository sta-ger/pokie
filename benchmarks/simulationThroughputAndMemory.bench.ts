import {AggregateSimulationRunner, GameSessionHandling} from "pokie";
import {bytesToMebibytes, formatBenchmarkLine, measureBenchmark} from "./support/measureBenchmark.js";

// A representative baseline of AggregateSimulationRunner's own throughput/memory, independent of any
// particular game's session logic -- the loop below (canPlayNextGame/play/getWinAmount) is exactly the
// shape every real VideoSlotSession also drives, just with trivial win math so the numbers measure the
// runner/accumulator's overhead rather than one game's paytable cost. Round count is fixed and modest
// (large enough to smooth out JIT warmup, small enough to run in well under a second) -- see
// benchmarks/README.md for why these baselines never assert a hard wall-clock/memory threshold.
const ROUNDS = 200_000;

function createBenchmarkSession(rounds: number): GameSessionHandling {
    let round = 0;
    let winAmount = 0;
    const bet = 1;

    return {
        getCreditsAmount: () => Number.MAX_SAFE_INTEGER,
        setCreditsAmount: () => undefined,
        getBet: () => bet,
        setBet: () => undefined,
        getAvailableBets: () => [bet],
        canPlayNextGame: () => round < rounds,
        play: () => {
            round++;
            winAmount = round % 7 === 0 ? bet * 10 : 0;
        },
        getWinAmount: () => winAmount,
    } as unknown as GameSessionHandling;
}

describe("benchmark: simulation throughput and memory (AggregateSimulationRunner, in-process)", () => {
    test(`plays ${ROUNDS} rounds and records rounds/sec + heap delta as a baseline (no hard threshold)`, () => {
        const session = createBenchmarkSession(ROUNDS);
        const runner = new AggregateSimulationRunner(session, ROUNDS);

        const {result, durationMs, heapUsedDeltaBytes} = measureBenchmark(() => runner.run().getStatistics());

        const roundsPerSecond = ROUNDS / (durationMs / 1000);
        console.log(
            formatBenchmarkLine("simulationThroughputAndMemory", {
                rounds: ROUNDS,
                durationMs,
                roundsPerSecond,
                heapDeltaMiB: bytesToMebibytes(heapUsedDeltaBytes),
            }),
        );

        // Sanity, not performance: the run actually completed and produced finite, non-negative
        // numbers. Absolute timing/memory varies by machine -- see benchmarks/README.md.
        expect(result.rounds).toBe(ROUNDS);
        expect(Number.isFinite(roundsPerSecond)).toBe(true);
        expect(roundsPerSecond).toBeGreaterThan(0);
    });
});
