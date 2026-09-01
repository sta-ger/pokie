import fs from "fs";
import os from "os";
import path from "path";
import {OutcomeLibraryBundleValidator, StakeEngineImportResult, StakeEngineImportWriter} from "pokie";
import {buildOutcomeLibraryBundleTestLibrary} from "../weightedoutcome/bundle/OutcomeLibraryBundleTestFixtures.js";

function resultWithModes(modeNames: readonly string[]): StakeEngineImportResult {
    return {
        stakeDir: "/stake",
        manifest: undefined,
        modes: modeNames.map((modeName) => ({modeName, cost: 1, library: buildOutcomeLibraryBundleTestLibrary(`${modeName}-lib`)})),
        sourceProvenance: {indexHash: "sha256:aa", manifestHash: "sha256:bb", modes: modeNames.map((modeName) => ({modeName, csvHash: "sha256:cc", booksHash: "sha256:dd"}))},
        issues: [],
    };
}

describe("StakeEngineImportWriter", () => {
    let outDir: string;

    beforeEach(() => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-stakeengine-import-writer-test-"));
        fs.rmdirSync(outDir);
    });

    afterEach(() => {
        fs.rmSync(outDir, {recursive: true, force: true});
    });

    it("writes a deep-valid Outcome Library plus a Stake re-export config and source provenance", async () => {
        const result = resultWithModes(["base", "bonus"]);
        const written = await new StakeEngineImportWriter("1.3.0").writeToDirectory(result, outDir);

        expect(written.issues).toEqual([]);
        expect(await new OutcomeLibraryBundleValidator().validate(outDir, {deep: true})).toEqual([]);
        expect(JSON.parse(fs.readFileSync(path.join(outDir, "manifest.json"), "utf-8"))).toMatchObject({generatedBy: "pokie stakeengine import"});
        expect(JSON.parse(fs.readFileSync(path.join(outDir, "config.json"), "utf-8"))).toEqual({
            sourceProvenance: result.sourceProvenance,
            modes: [
                {modeName: "base", cost: 1, bundleDir: ".", bundleModeName: "base"},
                {modeName: "bonus", cost: 1, bundleDir: ".", bundleModeName: "bonus"},
            ],
        });
        expect(JSON.parse(fs.readFileSync(path.join(outDir, "source-provenance.json"), "utf-8"))).toEqual(result.sourceProvenance);
    });

    it("publishes a replacement without stale modes from an earlier import", async () => {
        const writer = new StakeEngineImportWriter("1.3.0");
        await writer.writeToDirectory(resultWithModes(["base", "bonus"]), outDir);
        await writer.writeToDirectory(resultWithModes(["base"]), outDir);

        expect(fs.existsSync(path.join(outDir, "index_bonus.json"))).toBe(false);
        expect(fs.existsSync(path.join(outDir, "outcomes_bonus.jsonl"))).toBe(false);
        expect(await new OutcomeLibraryBundleValidator().validate(outDir, {deep: true})).toEqual([]);
    });
});
