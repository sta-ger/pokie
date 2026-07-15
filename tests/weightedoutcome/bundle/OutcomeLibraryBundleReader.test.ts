import fs from "fs";
import os from "os";
import path from "path";
import {
    OutcomeLibraryBundleReader,
    OutcomeLibraryBundleWriter,
    SeededWeightedOutcomeRandomSource,
    WeightedOutcomeLibrary,
    WeightedOutcomeSelector,
    computeWeightedOutcomeLibraryHash,
} from "pokie";
import {buildOutcomeLibraryBundleModeInput, buildOutcomeLibraryBundleTestLibrary} from "./OutcomeLibraryBundleTestFixtures.js";

describe("OutcomeLibraryBundleReader", () => {
    let outDir: string;
    let library: WeightedOutcomeLibrary<string>;

    beforeEach(async () => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-outcomelibrary-reader-test-"));
        fs.rmdirSync(outDir);
        library = buildOutcomeLibraryBundleTestLibrary("base-lib");
        const modes = [buildOutcomeLibraryBundleModeInput("base", "base-lib")];
        await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory(modes, outDir);
    });

    afterEach(() => {
        fs.rmSync(outDir, {recursive: true, force: true});
    });

    it("readManifest/readModeIndex reproduce what the writer wrote", async () => {
        const reader = new OutcomeLibraryBundleReader();

        const manifest = await reader.readManifest(outDir);
        const index = await reader.readModeIndex(outDir, "base");

        expect(manifest.modes[0].modeName).toBe("base");
        expect(index.modeName).toBe("base");
        expect(index.libraryHash).toBe(manifest.modes[0].libraryHash);
    });

    it("iterateModeOutcomes streams every outcome, in canonical id order, without ever holding more than one at a time", async () => {
        const reader = new OutcomeLibraryBundleReader();
        const seen: string[] = [];

        for await (const outcome of reader.iterateModeOutcomes(outDir, "base")) {
            seen.push(outcome.id);
        }

        expect(seen).toEqual(library.outcomes.map((outcome) => outcome.id));
    });

    it("readOutcomeById returns the exact outcome for every real id, and undefined for an unknown one", async () => {
        const reader = new OutcomeLibraryBundleReader();

        for (const outcome of library.outcomes) {
            const found = await reader.readOutcomeById(outDir, "base", outcome.id);
            expect(found?.id).toBe(outcome.id);
            expect(found?.weight).toBe(outcome.weight);
            expect(found?.artifact.roundId).toBe(outcome.artifact.roundId);
        }

        expect(await reader.readOutcomeById(outDir, "base", "not-a-real-id")).toBeUndefined();
    });

    it("readLibrary reconstructs a WeightedOutcomeLibrary whose hash matches the original exactly", async () => {
        const reader = new OutcomeLibraryBundleReader();

        const rebuilt = await reader.readLibrary(outDir, "base");

        expect(computeWeightedOutcomeLibraryHash(rebuilt)).toBe(computeWeightedOutcomeLibraryHash(library));
        expect(rebuilt).toEqual(library);
    });

    it("drawOutcome never diverges from WeightedOutcomeSelector.select given the same seeded draws", async () => {
        const reader = new OutcomeLibraryBundleReader();
        const selector = new WeightedOutcomeSelector();

        for (let seed = 0; seed < 50; seed++) {
            const drawn = await reader.drawOutcome(outDir, "base", new SeededWeightedOutcomeRandomSource(`seed-${seed}`));
            const selected = selector.select(library, new SeededWeightedOutcomeRandomSource(`seed-${seed}`));
            expect(drawn.id).toBe(selected.id);
        }
    });
});
