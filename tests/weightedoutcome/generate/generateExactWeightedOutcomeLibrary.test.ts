import {
    estimateExactOutcomeSpaceSize,
    generateExactWeightedOutcomeLibrary,
    OutcomeLibraryBundleReader,
    OutcomeLibraryBundleWriter,
    streamExactWeightedOutcomes,
    WeightedOutcomeLibraryGenerationCancelledError,
    WeightedOutcomeLibraryGenerationError,
} from "pokie";
import {buildFixtureGame, buildUnplayableFixtureGame, buildUnsupportedFixtureGame} from "./GenerateTestFixtures.js";
import fs from "fs";
import os from "os";
import path from "path";

function outcomeById(outcomes: readonly {id: string; weight: number; artifact: {screen?: unknown}}[], weight: number) {
    return outcomes.filter((outcome) => outcome.weight === weight);
}

describe("generateExactWeightedOutcomeLibrary", () => {
    it("estimates the exact reel-stop space upfront without enumerating", () => {
        const estimate = estimateExactOutcomeSpaceSize(buildFixtureGame());

        expect(estimate.reelsNumber).toBe(2);
        expect(estimate.reelsSymbolsNumber).toBe(1);
        expect(estimate.reelSizes).toEqual([3, 2]);
        expect(estimate.totalOutcomeSpaceSize).toBe(BigInt(6));
    });

    it("fails closed for a game that never implemented createExactEnumerationSession", () => {
        expect.assertions(2);
        try {
            estimateExactOutcomeSpaceSize(buildUnsupportedFixtureGame());
        } catch (error) {
            expect(error).toBeInstanceOf(WeightedOutcomeLibraryGenerationError);
            expect((error as WeightedOutcomeLibraryGenerationError).getCode()).toBe("weighted-outcome-library-generation-unsupported");
        }
    });

    it("exactly enumerates, dedupes, and sums weights straight off the real calculation path", async () => {
        const result = await generateExactWeightedOutcomeLibrary({
            libraryId: "fixture-lib",
            game: buildFixtureGame(),
            pokieVersion: "1.3.0",
            now: () => new Date("2026-01-01T00:00:00.000Z"),
        });

        expect(result.diagnostics.strategy).toBe("exact");
        expect(result.diagnostics.algorithm).toBe("pokie-exact-reel-enumeration-v1");
        expect(result.diagnostics.totalOutcomeSpaceSize).toBe(6);
        expect(result.diagnostics.sampledRawCount).toBe(6);
        expect(result.diagnostics.seed).toBeUndefined();
        expect(result.diagnostics.pokieVersion).toBe("1.3.0");
        expect(result.diagnostics.game.id).toBe("fixture-slot");
        expect(result.diagnostics.generatedAt).toBe("2026-01-01T00:00:00.000Z");

        const {library} = result;
        expect(library.libraryId).toBe("fixture-lib");
        // 4 distinct grids: (A,A) w=2, (A,B) w=2, (B,A) w=1, (B,B) w=1 -- see GenerateTestFixtures's own doc
        // comment for the hand-computed combinatorics.
        expect(library.outcomes).toHaveLength(4);
        expect(library.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0)).toBe(6);
        expect(outcomeById(library.outcomes, 2)).toHaveLength(2);
        expect(outcomeById(library.outcomes, 1)).toHaveLength(2);

        // Exactly one winning grid -- (A,A), weight 2, paying the configured 5x bet.
        const winners = library.outcomes.filter((outcome) => outcome.artifact.payoutMultiplier > 0);
        expect(winners).toHaveLength(1);
        expect(winners[0].weight).toBe(2);
        expect(winners[0].artifact.payoutMultiplier).toBe(5);
        expect(winners[0].artifact.screen).toEqual([["A"], ["A"]]);
        expect(winners[0].artifact.provenance.game.id).toBe("fixture-slot");
        expect(winners[0].artifact.provenance.pokieVersion).toBe("1.3.0");

        // Deterministic, content-derived ids -- rebuilding from the exact same math data reproduces them.
        const again = await generateExactWeightedOutcomeLibrary({libraryId: "fixture-lib", game: buildFixtureGame(), pokieVersion: "1.3.0"});
        expect(again.library.outcomes.map((outcome) => outcome.id)).toEqual(library.outcomes.map((outcome) => outcome.id));
    });

    it("threads betMode/stake/configHash through to every generated artifact", async () => {
        const {library} = await generateExactWeightedOutcomeLibrary({
            libraryId: "fixture-lib",
            game: buildFixtureGame(),
            pokieVersion: "1.3.0",
            betMode: "buy-bonus",
            stake: 2,
            configHash: "sha256:deadbeef",
        });

        for (const outcome of library.outcomes) {
            expect(outcome.artifact.betMode).toBe("buy-bonus");
            expect(outcome.artifact.stake).toBe(2);
            expect(outcome.artifact.provenance.configHash).toBe("sha256:deadbeef");
        }
    });

    it("fails closed when the space exceeds maxOutcomeSpaceSize and bounded was not requested", async () => {
        await expect(
            generateExactWeightedOutcomeLibrary({
                libraryId: "fixture-lib",
                game: buildFixtureGame(),
                pokieVersion: "1.3.0",
                maxOutcomeSpaceSize: BigInt(3),
            }),
        ).rejects.toMatchObject({name: "WeightedOutcomeLibraryGenerationError"});

        try {
            await generateExactWeightedOutcomeLibrary({
                libraryId: "fixture-lib",
                game: buildFixtureGame(),
                pokieVersion: "1.3.0",
                maxOutcomeSpaceSize: BigInt(3),
            });
            fail("expected generation to reject");
        } catch (error) {
            expect((error as WeightedOutcomeLibraryGenerationError).getCode()).toBe("weighted-outcome-library-generation-space-exceeded");
        }
    });

    it("never silently downgrades -- a space within maxOutcomeSpaceSize is always exact even when bounded is set", async () => {
        const result = await generateExactWeightedOutcomeLibrary({
            libraryId: "fixture-lib",
            game: buildFixtureGame(),
            pokieVersion: "1.3.0",
            bounded: {sampleSize: BigInt(2), seed: "unused"},
        });

        expect(result.diagnostics.strategy).toBe("exact");
        expect(result.diagnostics.sampledRawCount).toBe(6);
    });

    it("uses an explicitly-labelled, reproducible bounded-coverage sample once the caller opts in past the cap", async () => {
        const options = {
            libraryId: "fixture-lib",
            game: buildFixtureGame(),
            pokieVersion: "1.3.0",
            maxOutcomeSpaceSize: BigInt(3),
            bounded: {sampleSize: BigInt(10), seed: "coverage-seed"},
        };

        const result = await generateExactWeightedOutcomeLibrary(options);
        expect(result.diagnostics.strategy).toBe("bounded-coverage");
        expect(result.diagnostics.seed).toBe("coverage-seed");
        expect(result.diagnostics.totalOutcomeSpaceSize).toBe(6);
        expect(result.diagnostics.sampledRawCount).toBe(10);
        expect(result.library.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0)).toBe(10);

        // Reproducible: the same seed draws the exact same sample.
        const repeat = await generateExactWeightedOutcomeLibrary({...options, game: buildFixtureGame()});
        expect(repeat.library.outcomes.map((outcome) => ({id: outcome.id, weight: outcome.weight}))).toEqual(
            result.library.outcomes.map((outcome) => ({id: outcome.id, weight: outcome.weight})),
        );
    });

    it("supports resuming an exact sweep from a caller-supplied startIndex", async () => {
        const result = await generateExactWeightedOutcomeLibrary({
            libraryId: "fixture-lib",
            game: buildFixtureGame(),
            pokieVersion: "1.3.0",
            startIndex: BigInt(3),
        });

        expect(result.diagnostics.strategy).toBe("exact");
        expect(result.diagnostics.totalOutcomeSpaceSize).toBe(6);
        expect(result.diagnostics.sampledRawCount).toBe(3);
        expect(result.library.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0)).toBe(3);
    });

    it("cancels via AbortSignal and reports a resumable raw index", async () => {
        const controller = new AbortController();
        controller.abort();

        await expect(
            generateExactWeightedOutcomeLibrary({
                libraryId: "fixture-lib",
                game: buildFixtureGame(),
                pokieVersion: "1.3.0",
                signal: controller.signal,
            }),
        ).rejects.toBeInstanceOf(WeightedOutcomeLibraryGenerationCancelledError);

        try {
            await generateExactWeightedOutcomeLibrary({
                libraryId: "fixture-lib",
                game: buildFixtureGame(),
                pokieVersion: "1.3.0",
                signal: controller.signal,
            });
            fail("expected generation to reject");
        } catch (error) {
            const cancelled = error as WeightedOutcomeLibraryGenerationCancelledError;
            expect(cancelled.processedRawIndex).toBe(BigInt(0));
            expect(cancelled.progressTotal).toBe(BigInt(6));
        }
    });

    it("reports progress at least once for a small sweep", async () => {
        const onProgress = jest.fn();
        await generateExactWeightedOutcomeLibrary({
            libraryId: "fixture-lib",
            game: buildFixtureGame(),
            pokieVersion: "1.3.0",
            onProgress,
        });

        expect(onProgress).toHaveBeenCalledWith(BigInt(6), BigInt(6));
    });

    it("fails closed when createExactEnumerationSession returns a session that cannot afford one round", async () => {
        await expect(
            generateExactWeightedOutcomeLibrary({libraryId: "fixture-lib", game: buildUnplayableFixtureGame(), pokieVersion: "1.3.0"}),
        ).rejects.toMatchObject({name: "WeightedOutcomeLibraryGenerationError"});
    });

    it("streams straight into OutcomeLibraryBundleWriter as a mode's own outcome source, with no second calculation path", async () => {
        const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-generate-bundle-test-"));
        fs.rmdirSync(outDir);
        try {
            const writer = new OutcomeLibraryBundleWriter("1.3.0");
            const result = await writer.writeToDirectory(
                [{modeName: "base", libraryId: "fixture-lib", outcomes: streamExactWeightedOutcomes({libraryId: "fixture-lib", game: buildFixtureGame(), pokieVersion: "1.3.0"})}],
                outDir,
            );

            expect(result.issues.filter((issue) => issue.severity === "error")).toHaveLength(0);
            expect(result.manifest?.modes[0].outcomeCount).toBe(4);
            expect(result.manifest?.modes[0].totalWeight).toBe(6);

            const reader = new OutcomeLibraryBundleReader();
            const library = await reader.readLibrary(outDir, "base");
            expect(library.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0)).toBe(6);
        } finally {
            fs.rmSync(outDir, {recursive: true, force: true});
        }
    });
});
