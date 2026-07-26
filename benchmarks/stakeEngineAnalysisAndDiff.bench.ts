import {
    SeededRandomNumberGenerator,
    StakeEngineEvent,
    StakeEngineOutcomeSourceReadResult,
    StakeEngineStandaloneAnalysisDiffer,
    StakeEngineStandaloneAnalyzer,
} from "pokie";
import {formatBenchmarkLine, measureBenchmark} from "./support/measureBenchmark.js";

// Same deterministically-generated (SeededRandomNumberGenerator) uint64-scale outcome-set shape as
// tests/stakeengine/standalone/StakeEngineStandaloneAnalyzerPropertyInvariants.test.ts, just sized for
// throughput instead of correctness: a single mode with a representative outcome count for a real
// Stake Engine math book, entirely in-memory (no filesystem) -- see
// src/stakeengine/standalone/StakeEngineStandaloneAnalyzer.ts.
const OUTCOME_COUNT = 20_000;

function buildOutcomeSet(seed: number, outcomeCount: number): StakeEngineOutcomeSourceReadResult {
    const rng = new SeededRandomNumberGenerator(seed);
    const cost = 100;

    const outcomes = Array.from({length: outcomeCount}, (_, id) => {
        const weight = BigInt(rng.getRandomInt(1, 1_000_000));
        const payoutMultiplier = rng.getRandomInt(0, 10_000);

        return {
            id,
            weight,
            payoutMultiplier,
            ratio: payoutMultiplier / cost / 100,
            events: [
                {index: 0, type: "reveal"},
                {index: 1, type: "win", amount: payoutMultiplier},
                {index: 2, type: "finalWin", amount: payoutMultiplier, payoutMultiplier},
            ] as StakeEngineEvent[],
        };
    });

    return {stakeDir: "/benchmark/stake-dir", issues: [], modes: [{modeName: "benchmark-mode", cost, outcomes}]};
}

describe("benchmark: Stake Engine standalone analysis and diff", () => {
    test(`analyzes ${OUTCOME_COUNT} synthetic outcomes and records timing (no hard threshold)`, () => {
        const readResult = buildOutcomeSet(1, OUTCOME_COUNT);
        const analyzer = new StakeEngineStandaloneAnalyzer();

        const {result, durationMs} = measureBenchmark(() => analyzer.analyze(readResult));

        console.log(formatBenchmarkLine("stakeEngineAnalysis", {outcomes: OUTCOME_COUNT, durationMs}));
        expect(result.modes[0].outcomeCount).toBe(OUTCOME_COUNT);
    });

    test(`diffs two ${OUTCOME_COUNT}-outcome analyses and records timing (no hard threshold)`, () => {
        const analyzer = new StakeEngineStandaloneAnalyzer();
        const left = analyzer.analyze(buildOutcomeSet(1, OUTCOME_COUNT));
        const right = analyzer.analyze(buildOutcomeSet(2, OUTCOME_COUNT));
        const differ = new StakeEngineStandaloneAnalysisDiffer();

        const {result, durationMs} = measureBenchmark(() => differ.diff(left, right));

        console.log(formatBenchmarkLine("stakeEngineDiff", {outcomes: OUTCOME_COUNT, durationMs}));
        expect(result.perMode["benchmark-mode"]).toBeDefined();
    });
});
