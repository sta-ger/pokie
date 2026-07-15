import fs from "fs";
import os from "os";
import path from "path";
import {
    OutcomeLibraryBundleOutcomeSource,
    OutcomeLibraryBundleReader,
    OutcomeLibraryBundleReading,
    OutcomeLibraryBundleWriter,
    PreGeneratedOutcomeSourceConflictError,
    SeededWeightedOutcomeRandomSource,
    WeightedOutcomeInput,
    WeightedOutcomeRandomSource,
} from "pokie";
import {buildOutcomeLibraryBundleModeInput} from "./OutcomeLibraryBundleTestFixtures.js";

// Always resolves to the first (lowest-cumulative-weight, canonical-id-order) entry — entry "0" in this
// fixture's own outcomes — so a test can deterministically target one specific record instead of depending on
// a seed happening to land there.
const alwaysFirstEntry: WeightedOutcomeRandomSource = {nextInt: () => 0};

describe("OutcomeLibraryBundleOutcomeSource", () => {
    let outDir: string;

    beforeEach(async () => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-outcomelibrary-outcomesource-test-"));
        fs.rmdirSync(outDir);
        const modes = [buildOutcomeLibraryBundleModeInput("base", "base-lib")];
        await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory(modes, outDir);
    });

    afterEach(() => {
        fs.rmSync(outDir, {recursive: true, force: true});
    });

    it("draws outcomes that never diverge from the reader's own drawOutcome for the same seeded draws", async () => {
        const reader = new OutcomeLibraryBundleReader();
        const source = new OutcomeLibraryBundleOutcomeSource(outDir, "base");

        for (let seed = 0; seed < 30; seed++) {
            const selection = await source.drawOutcome(new SeededWeightedOutcomeRandomSource(`seed-${seed}`));
            const fromReader = await reader.drawOutcome(outDir, "base", new SeededWeightedOutcomeRandomSource(`seed-${seed}`));
            expect(selection.outcome.id).toBe(fromReader.id);
            expect(selection.outcome.weight).toBe(fromReader.weight);
        }
    });

    it("draws atomically returning exactly the mode index's own libraryId/libraryHash/totalWeight alongside the outcome", async () => {
        const reader = new OutcomeLibraryBundleReader();
        const index = await reader.readModeIndex(outDir, "base");
        const source = new OutcomeLibraryBundleOutcomeSource(outDir, "base");

        const selection = await source.drawOutcome(new SeededWeightedOutcomeRandomSource("seed-1"));

        expect(selection.libraryId).toBe(index.libraryId);
        expect(selection.libraryHash).toBe(index.libraryHash);
        expect(selection.totalWeight).toBe(index.totalWeight);
    });

    // The whole point of this class, for the pre-generated runtime: serve draws directly from a bundle without
    // ever materializing a full WeightedOutcomeLibrary. A reader stub that fails the test the moment readLibrary()
    // is called (rather than merely asserting a spy's call count afterward) makes that guarantee impossible to
    // accidentally weaken without a test noticing.
    it("never calls readLibrary() to draw", async () => {
        const realReader = new OutcomeLibraryBundleReader();
        const readLibrary = jest.fn(() => {
            throw new Error("readLibrary() should never be called by OutcomeLibraryBundleOutcomeSource");
        });
        const spyingReader: OutcomeLibraryBundleReading = {
            readManifest: (bundleDir) => realReader.readManifest(bundleDir),
            readModeIndex: (bundleDir, modeName) => realReader.readModeIndex(bundleDir, modeName),
            iterateModeOutcomes: (bundleDir, modeName) => realReader.iterateModeOutcomes(bundleDir, modeName),
            readOutcomeById: (bundleDir, modeName, id) => realReader.readOutcomeById(bundleDir, modeName, id),
            drawOutcome: (bundleDir, modeName, randomSource) => realReader.drawOutcome(bundleDir, modeName, randomSource),
            readLibrary,
        };
        const source = new OutcomeLibraryBundleOutcomeSource(outDir, "base", spyingReader);

        await source.drawOutcome(new SeededWeightedOutcomeRandomSource("seed-1"));

        expect(readLibrary).not.toHaveBeenCalled();
    });

    // A single readModeIndex() call per draw — never a separate read for identity and another for selection —
    // is what makes PreGeneratedSpinCommandHandler's own session-identity check relate to the exact index
    // version a draw was made against (see req 4 of the pre-generated outcome source stabilization pass).
    it("reads the mode index exactly once per draw", async () => {
        const realReader = new OutcomeLibraryBundleReader();
        let readModeIndexCalls = 0;
        const spyingReader: OutcomeLibraryBundleReading = {
            readManifest: (bundleDir) => realReader.readManifest(bundleDir),
            readModeIndex: (bundleDir, modeName) => {
                readModeIndexCalls++;
                return realReader.readModeIndex(bundleDir, modeName);
            },
            iterateModeOutcomes: (bundleDir, modeName) => realReader.iterateModeOutcomes(bundleDir, modeName),
            readOutcomeById: (bundleDir, modeName, id) => realReader.readOutcomeById(bundleDir, modeName, id),
            drawOutcome: (bundleDir, modeName, randomSource) => realReader.drawOutcome(bundleDir, modeName, randomSource),
            readLibrary: (bundleDir, modeName) => realReader.readLibrary(bundleDir, modeName),
        };
        const source = new OutcomeLibraryBundleOutcomeSource(outDir, "base", spyingReader);

        await source.drawOutcome(new SeededWeightedOutcomeRandomSource("seed-1"));

        expect(readModeIndexCalls).toBe(1);
    });

    // recordHash exists specifically to catch this: content tampered in place, with the id/weight the index
    // already knew about left completely untouched — something the pre-recordHash id/weight-only check would
    // have silently let through as long as the byte layout itself stayed intact.
    it("throws PreGeneratedOutcomeSourceConflictError when a record's content changed since the index was written, even with the same id/weight", async () => {
        const reader = new OutcomeLibraryBundleReader();
        const index = await reader.readModeIndex(outDir, "base");
        const entry = index.entries[0];
        const outcomesPath = path.join(outDir, "outcomes_base.jsonl");
        const buffer = fs.readFileSync(outcomesPath);
        const original = buffer.subarray(entry.byteOffset, entry.byteOffset + entry.byteLength).toString("utf-8");
        const parsed = JSON.parse(original) as {id: string; weight: number; artifact: {roundId: string}};
        const tamperedRoundId = "t".repeat(parsed.artifact.roundId.length);
        const tampered = original.replace(JSON.stringify(parsed.artifact.roundId), JSON.stringify(tamperedRoundId));
        expect(tampered.length).toBe(original.length);
        expect(tampered).not.toBe(original);
        buffer.write(tampered, entry.byteOffset, entry.byteLength, "utf-8");
        fs.writeFileSync(outcomesPath, buffer);

        const source = new OutcomeLibraryBundleOutcomeSource(outDir, "base");

        await expect(source.drawOutcome(alwaysFirstEntry)).rejects.toThrow(PreGeneratedOutcomeSourceConflictError);
    });

    // The bundle-swap-mid-draw race: a caller holding onto an index it already read (e.g. cached briefly, or —
    // as simulated here — served by a reader stub that always returns the same snapshot) must still be caught
    // when the bundle underneath has since been rewritten with different content, even though nothing about
    // *this* drawOutcome() call's own index read looks stale on its own.
    it("throws PreGeneratedOutcomeSourceConflictError when a stale index snapshot is used against a bundle rewritten since it was read", async () => {
        const realReader = new OutcomeLibraryBundleReader();
        const staleIndex = await realReader.readModeIndex(outDir, "base");

        // Rewrite the same bundleDir/mode with different outcomes (different weights, so the file's own byte
        // layout shifts) — simulating a redeploy that regenerated the bundle out from under a caller still
        // holding the old index.
        const rewrittenModes = [buildOutcomeLibraryBundleModeInput("base", "base-lib")].map((mode) => ({
            ...mode,
            outcomes: (mode.outcomes as WeightedOutcomeInput<string>[]).map((outcome) => ({...outcome, weight: outcome.weight + 1})),
        }));
        await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory(rewrittenModes, outDir);

        const staleReader: OutcomeLibraryBundleReading = {
            readManifest: (bundleDir) => realReader.readManifest(bundleDir),
            readModeIndex: () => Promise.resolve(staleIndex),
            iterateModeOutcomes: (bundleDir, modeName) => realReader.iterateModeOutcomes(bundleDir, modeName),
            readOutcomeById: (bundleDir, modeName, id) => realReader.readOutcomeById(bundleDir, modeName, id),
            drawOutcome: (bundleDir, modeName, randomSource) => realReader.drawOutcome(bundleDir, modeName, randomSource),
            readLibrary: (bundleDir, modeName) => realReader.readLibrary(bundleDir, modeName),
        };
        const source = new OutcomeLibraryBundleOutcomeSource(outDir, "base", staleReader);

        await expect(source.drawOutcome(alwaysFirstEntry)).rejects.toThrow(PreGeneratedOutcomeSourceConflictError);
    });
});
