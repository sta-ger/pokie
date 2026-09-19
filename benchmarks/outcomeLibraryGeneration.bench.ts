import fs from "fs";
import os from "os";
import path from "path";
import {
    OutcomeLibraryBundleValidator,
    OutcomeLibraryBundleWriter,
    type OutcomeLibraryBundleModeInput,
    type WeightedOutcomeInput,
} from "pokie";
import {buildOutcomeLibraryBundleModeInput} from "../tests/weightedoutcome/bundle/OutcomeLibraryBundleTestFixtures.js";

// This deliberately exercises the canonical streaming publisher rather than
// constructing a two-million element fixture array. The stable fixture
// artifact has the same real RoundArtifact shape the writer validates; only
// the outcome id and deterministic payout vary by record.
const RECORD_COUNT = 2_000_000;
const FIXTURE_ID = "outcome-library-streaming-v1";
const EXPECTED_WRITER_STAGES = ["writing", "analyzing", "building-index", "validation", "publication"] as const;
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
        // Every reported duration is measured against this one monotonic
        // clock. Independent helper timers would make stage sums and the
        // final publication/validation telemetry incomparable.
        const startedAt = process.hrtime.bigint();
        const elapsedMs = (): number => Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        const modes: OutcomeLibraryBundleModeInput<string>[] = [{
            modeName: "base",
            libraryId: "benchmark-library",
            outcomes: realisticOutcomes(),
        }];

        try {
            const publicationStartedAtMs = elapsedMs();
            const publicationResult = await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory(modes, outDir, {
                onLifecycleStage: (stage) => stages.push({stage, atMs: elapsedMs()}),
            });
            const publicationFinishedAtMs = elapsedMs();
            const validationStartedAtMs = elapsedMs();
            const validationResult = await new OutcomeLibraryBundleValidator().validate(outDir, {deep: true});
            const finishedAtMs = elapsedMs();
            const bytes = directoryBytes(outDir);
            const outcomeCount = publicationResult.manifest?.modes[0]?.outcomeCount;
            const publicationDurationMs = publicationFinishedAtMs - publicationStartedAtMs;
            const deepValidationDurationMs = finishedAtMs - validationStartedAtMs;
            const totalDurationMs = finishedAtMs;
            const recordThroughput = totalDurationMs === 0 ? 0 : RECORD_COUNT / (totalDurationMs / 1_000);
            const stageDurationsMs = stages.map((entry, index) => ({
                stage: entry.stage,
                // Publication ends before the independent deep validation
                // begins. Keep both telemetry intervals on the shared clock
                // without assigning validation time to the final publish stage.
                durationMs: (stages[index + 1]?.atMs ?? publicationFinishedAtMs) - entry.atMs,
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
                stageDurationsMs: [...stageDurationsMs, {stage: "deep-validation", durationMs: deepValidationDurationMs}],
                publicationDurationMs,
                deepValidationDurationMs,
                totalDurationMs,
                recordsPerSecond: recordThroughput,
                cancellationLatencyMs: "not exercised",
                runtime: {node: process.version, platform: process.platform, arch: process.arch},
                correctness: publicationResult.issues.length === 0 && validationResult.length === 0 && outcomeCount === RECORD_COUNT,
                validation: {deep: true, issueCount: validationResult.length, passed: validationResult.length === 0},
            }));

            expect(publicationResult.issues).toEqual([]);
            expect(validationResult).toEqual([]);
            expect(outcomeCount).toBe(RECORD_COUNT);
            expect(bytes).toBeGreaterThan(0);
            expect(stages.map(({stage}) => stage)).toEqual(EXPECTED_WRITER_STAGES);
            expect(stageDurationsMs.every(({durationMs}) => durationMs >= 0)).toBe(true);
            expect(publicationDurationMs).toBeGreaterThanOrEqual(0);
            expect(deepValidationDurationMs).toBeGreaterThanOrEqual(0);
            expect(stages.every((stage, index) => index === 0 || stage.atMs >= stages[index - 1].atMs)).toBe(true);
        } finally {
            fs.rmSync(root, {recursive: true, force: true});
        }
    }, BENCHMARK_TIMEOUT_MS);
});
