import fs from "fs";
import os from "os";
import path from "path";
import {
    OutcomeLibraryBundleValidator,
    OutcomeLibraryBundleWriter,
    type OutcomeLibraryBundleModeInput,
    type WeightedOutcomeInput,
} from "pokie";
import {measureBenchmarkAsync} from "./support/measureBenchmark.js";
import {buildOutcomeLibraryBundleModeInput} from "../tests/weightedoutcome/bundle/OutcomeLibraryBundleTestFixtures.js";

// This deliberately exercises the canonical streaming publisher rather than
// constructing a two-million element fixture array. The stable fixture
// artifact has the same real RoundArtifact shape the writer validates; only
// the outcome id and deterministic payout vary by record.
const RECORD_COUNT = 2_000_000;
const FIXTURE_ID = "outcome-library-streaming-v1";
// The benchmark deliberately has no performance assertion: the same
// multi-million-record publication can take several minutes on constrained
// CI storage. This only prevents Jest's correctness-test default from
// interrupting the benchmark before it can emit its timing evidence.
const BENCHMARK_TIMEOUT_MS = 20 * 60 * 1_000;

function *realisticOutcomes(): Generator<WeightedOutcomeInput<string>> {
    const fixture = buildOutcomeLibraryBundleModeInput("base", "benchmark-library").outcomes as readonly WeightedOutcomeInput<string>[];
    for (let index = 0; index < RECORD_COUNT; index++) {
        const source = fixture[index % fixture.length];
        yield {
            id: `benchmark-${String(index).padStart(7, "0")}`,
            weight: 1,
            artifact: source.artifact,
        };
    }
}

function directoryBytes(directory: string): number {
    return fs.readdirSync(directory)
        .map((entry) => fs.statSync(path.join(directory, entry)).size)
        .reduce((total, bytes) => total + bytes, 0);
}

describe("benchmark: Outcome Library streaming generation", () => {
    test(`publishes and deeply validates ${RECORD_COUNT.toLocaleString()} canonical records without a wall-clock threshold`, async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-outcome-library-bench-"));
        const outDir = path.join(root, "bundle");
        const stages: {stage: string; atMs: number}[] = [];
        const startedAt = process.hrtime.bigint();
        const modes: OutcomeLibraryBundleModeInput<string>[] = [{
            modeName: "base",
            libraryId: "benchmark-library",
            outcomes: realisticOutcomes(),
        }];

        try {
            const publication = await measureBenchmarkAsync(() => new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory(modes, outDir, {
                onLifecycleStage: (stage) => stages.push({stage, atMs: Number(process.hrtime.bigint() - startedAt) / 1_000_000}),
            }));
            const validation = await measureBenchmarkAsync(() => new OutcomeLibraryBundleValidator().validate(outDir, {deep: true}));
            const bytes = directoryBytes(outDir);
            const outcomeCount = publication.result.manifest?.modes[0]?.outcomeCount;
            const totalDurationMs = publication.durationMs + validation.durationMs;
            const recordThroughput = totalDurationMs === 0 ? 0 : RECORD_COUNT / (totalDurationMs / 1_000);
            const stageDurationsMs = stages.map((entry, index) => ({
                stage: entry.stage,
                durationMs: (stages[index + 1]?.atMs ?? publication.durationMs) - entry.atMs,
            }));

            // One JSON document is intentional: benchmark collectors can
            // retain this as evidence without scraping presentation text.
            console.log(JSON.stringify({
                benchmark: "outcome-library-generation",
                fixtureId: FIXTURE_ID,
                strategy: "canonical-streaming-publication",
                rawWork: String(RECORD_COUNT),
                uniqueRecordCount: outcomeCount,
                bytes,
                stageTransitions: stages,
                stageDurationsMs: [...stageDurationsMs, {stage: "deep-validation", durationMs: validation.durationMs}],
                publicationDurationMs: publication.durationMs,
                deepValidationDurationMs: validation.durationMs,
                totalDurationMs,
                recordsPerSecond: recordThroughput,
                cancellationLatencyMs: "not exercised",
                runtime: {node: process.version, platform: process.platform, arch: process.arch},
                correctness: publication.result.issues.length === 0 && validation.result.length === 0 && outcomeCount === RECORD_COUNT,
            }));

            expect(publication.result.issues).toEqual([]);
            expect(validation.result).toEqual([]);
            expect(outcomeCount).toBe(RECORD_COUNT);
            expect(bytes).toBeGreaterThan(0);
        } finally {
            fs.rmSync(root, {recursive: true, force: true});
        }
    }, BENCHMARK_TIMEOUT_MS);
});
