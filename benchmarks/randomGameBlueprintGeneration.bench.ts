import {RandomGameBlueprintGenerator} from "pokie";
import {formatBenchmarkLine, measureBenchmark} from "./support/measureBenchmark.js";

// A fixed, bounded seed count -- large enough to smooth out JIT warmup/per-call variance, small
// enough to stay well under a second -- mirroring the bounded-seed-list convention already used by
// tests/generated/RandomGameBlueprintGeneratorPropertyInvariants.test.ts.
const GENERATION_COUNT = 500;

describe("benchmark: random game blueprint generation", () => {
    test(`generates ${GENERATION_COUNT} random blueprints and records average time (no hard threshold)`, () => {
        const generator = new RandomGameBlueprintGenerator();
        const seeds = Array.from({length: GENERATION_COUNT}, (_, index) => index + 1);

        const {result, durationMs} = measureBenchmark(() => seeds.map((seed) => generator.generate({seed})));

        const averageMsPerGeneration = durationMs / GENERATION_COUNT;
        console.log(
            formatBenchmarkLine("randomGameBlueprintGeneration", {
                generations: GENERATION_COUNT,
                durationMs,
                averageMsPerGeneration,
            }),
        );

        expect(result).toHaveLength(GENERATION_COUNT);
        expect(Number.isFinite(averageMsPerGeneration)).toBe(true);
        expect(averageMsPerGeneration).toBeGreaterThanOrEqual(0);
    });
});
