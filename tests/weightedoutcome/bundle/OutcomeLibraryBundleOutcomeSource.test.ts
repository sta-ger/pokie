import fs from "fs";
import os from "os";
import path from "path";
import {
    OutcomeLibraryBundleOutcomeSource,
    OutcomeLibraryBundleReader,
    OutcomeLibraryBundleReading,
    OutcomeLibraryBundleWriter,
    SeededWeightedOutcomeRandomSource,
} from "pokie";
import {buildOutcomeLibraryBundleModeInput} from "./OutcomeLibraryBundleTestFixtures.js";

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
});
