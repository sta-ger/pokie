import fs from "node:fs";
import path from "node:path";
import {
    createStreamingExactWeightedOutcomes, generateExactWeightedOutcomeLibrary,
    generateWeightedOutcomeLibrary, generateStreamingWeightedOutcomeLibrary, generateSampledWeightedOutcomeLibrary,
    type GenerateExactWeightedOutcomeLibraryOptions,
} from "../../../src/weightedoutcome/generate/generateExactWeightedOutcomeLibrary.js";
import {adaptLegacyOutcomeLibraryGenerationRequest, issueExactEnumerationRecoveryAuthority} from "../../../src/weightedoutcome/generate/OutcomeLibraryGenerationRequest.js";
import {WeightedOutcomeLibraryGenerationCancelledError} from "../../../src/weightedoutcome/generate/WeightedOutcomeLibraryGenerationCancelledError.js";
import {buildFixtureGame} from "./GenerateTestFixtures.js";
import type {WeightedOutcomeInput} from "../../../src/weightedoutcome/buildWeightedOutcomeLibrary.js";

const options = (): GenerateExactWeightedOutcomeLibraryOptions => ({
    game: buildFixtureGame(), libraryId: "responsive", pokieVersion: "2.0.0", now: () => new Date(0),
});
async function collect(outcomes: AsyncIterable<WeightedOutcomeInput>) {
    const result: WeightedOutcomeInput[] = [];
    for await (const outcome of outcomes) result.push(outcome);
    return result;
}
const ordered = (outcomes: readonly WeightedOutcomeInput[]) => [...outcomes].sort((a, b) => a.id.localeCompare(b.id));

describe("artifact-phase host observation and cancellation", () => {
    // Advance the monotonic scheduling clock, without delaying game execution or
    // mocking the host timer. A tiny executable fixture then crosses each chunk.
    beforeEach(() => {
        let time = 0;
        jest.spyOn(performance, "now").mockImplementation(() => time += 30);
    });
    afterEach(() => jest.restoreAllMocks());

    it.each(["legacy", "domain", "stream", "domain-stream", "sampled"] as const)("lets host observation run between real artifacts through %s", async entry => {
        let emitted = 0;
        let observedAt: number | undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const input = {...options(), onPostEnumeration: () => {
            timer = setTimeout(() => observedAt = emitted, 0);
        }, onPostEnumerationProgress: () => emitted++};
        try {
            let outcomes: readonly WeightedOutcomeInput[];
            if (entry === "legacy") outcomes = (await generateExactWeightedOutcomeLibrary(input)).library.outcomes;
            else if (entry === "sampled") outcomes = (await generateSampledWeightedOutcomeLibrary({...input, sampled: {sampleSize: BigInt(100), seed: "responsive"}})).library.outcomes;
            else if (entry === "domain") outcomes = (await generateWeightedOutcomeLibrary(adaptLegacyOutcomeLibraryGenerationRequest(input))).library.outcomes;
            else outcomes = await collect(entry === "stream"
                ? createStreamingExactWeightedOutcomes(input).outcomes
                : generateStreamingWeightedOutcomeLibrary(adaptLegacyOutcomeLibraryGenerationRequest(input)).outcomes);
            expect(observedAt).toBeGreaterThan(0);
            expect(observedAt).toBeLessThan(outcomes.length);
            expect(outcomes).toHaveLength(4);
            expect(outcomes.reduce((sum, outcome) => sum + outcome.weight, 0)).toBe(entry === "sampled" ? 100 : 6);
        } finally {
            clearTimeout(timer);
        }
    });

    it.each(["used", "fresh"] as const)("cancels materialising artifact execution and restores the complete population into a %s game", async restoration => {
        const input = options();
        const expected = await generateExactWeightedOutcomeLibrary(input);
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        let cancellation: WeightedOutcomeLibraryGenerationCancelledError | undefined;
        try {
            await generateExactWeightedOutcomeLibrary({...input, signal: controller.signal,
                onPostEnumeration: () => {
                    timer = setTimeout(() => controller.abort(), 0);
                }});
            throw new Error("Expected artifact-phase cancellation");
        } catch (error) {
            expect(error).toBeInstanceOf(WeightedOutcomeLibraryGenerationCancelledError);
            cancellation = error as WeightedOutcomeLibraryGenerationCancelledError;
        } finally {
            clearTimeout(timer);
        }
        expect(cancellation!.checkpoint).toMatchObject({processedRawIndex: BigInt(6), progressTotal: BigInt(6)});
        expect(cancellation!.checkpoint.grids.size).toBe(4);
        expect(cancellation!.checkpoint.restartRequired).toBeUndefined();
        const resumed = await generateExactWeightedOutcomeLibrary({...input,
            game: restoration === "used" ? input.game : buildFixtureGame(), resumeFrom: cancellation!.checkpoint});
        expect(resumed).toEqual(expected);
        // Rejection recovery and explicit restoration are distinct from later new runs.
        expect(await generateExactWeightedOutcomeLibrary(input)).toEqual(expected);
        expect(await generateExactWeightedOutcomeLibrary(input)).toEqual(expected);
    });

    it("retains adapter-owned partitions on artifact cancellation, resumes all weights and closes abandoned streams", async () => {
        const root = fs.mkdtempSync(path.resolve("node_modules/.cache/pokie-tmp/v35-generation-"));
        const authority = issueExactEnumerationRecoveryAuthority(root);
        const input = {...options(), recoveryAuthority: authority, durableCheckpointOnCancellation: true};
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            const stream = createStreamingExactWeightedOutcomes({...input, signal: controller.signal,
                onPostEnumeration: () => {
                    timer = setTimeout(() => controller.abort(), 0);
                }});
            let cancellation: WeightedOutcomeLibraryGenerationCancelledError | undefined;
            try {
                await collect(stream.outcomes);
                throw new Error("Expected artifact-phase cancellation");
            } catch (error) {
                expect(error).toBeInstanceOf(WeightedOutcomeLibraryGenerationCancelledError);
                cancellation = error as WeightedOutcomeLibraryGenerationCancelledError;
            }
            expect(stream.getDiagnostics()).toBeUndefined();
            expect(cancellation!.checkpoint).toMatchObject({processedRawIndex: BigInt(6), progressTotal: BigInt(6), recoveryAuthorityId: authority.id});
            expect(cancellation!.checkpoint.restartRequired).toBeUndefined();
            expect(fs.existsSync(path.join(root, authority.id))).toBe(true);
            const restored = await collect(createStreamingExactWeightedOutcomes({...input, resumeFrom: cancellation!.checkpoint}).outcomes);
            const expected = await generateExactWeightedOutcomeLibrary(options());
            expect(ordered(restored)).toEqual(ordered(expected.library.outcomes));
            expect(fs.existsSync(path.join(root, authority.id))).toBe(false);
            const abandoned = createStreamingExactWeightedOutcomes(input);
            await abandoned.outcomes.next();
            expect(fs.existsSync(path.join(root, authority.id))).toBe(true);
            await abandoned.outcomes.return(undefined);
            expect(fs.existsSync(path.join(root, authority.id))).toBe(false);
            expect(abandoned.getDiagnostics()).toBeUndefined();
        } finally {
            clearTimeout(timer);
            fs.rmSync(root, {recursive: true, force: true});
        }
    });
});
