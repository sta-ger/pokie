import {isRecognizedStakeEngineExportDirectory, StakeEngineExporter} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {buildStakeEngineTestLibrary} from "./StakeEngineTestFixtures.js";

describe("isRecognizedStakeEngineExportDirectory", () => {
    let outDir: string;

    beforeEach(() => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-stakeengine-recognize-test-"));
    });

    afterEach(() => {
        fs.rmSync(outDir, {recursive: true, force: true});
    });

    it("returns false for a directory that doesn't exist", () => {
        expect(isRecognizedStakeEngineExportDirectory(path.join(outDir, "does-not-exist"))).toBe(false);
    });

    it("returns false for an empty existing directory", () => {
        expect(isRecognizedStakeEngineExportDirectory(outDir)).toBe(false);
    });

    it("returns false for a non-empty directory that isn't one of the exporter's own", () => {
        fs.writeFileSync(path.join(outDir, "notes.txt"), "unrelated file");
        expect(isRecognizedStakeEngineExportDirectory(outDir)).toBe(false);
    });

    it("returns false for a path that isn't a directory at all", () => {
        const filePath = path.join(outDir, "a-file");
        fs.writeFileSync(filePath, "not a directory");
        expect(isRecognizedStakeEngineExportDirectory(filePath)).toBe(false);
    });

    it("returns true for a directory a real StakeEngineExporter run just produced", async () => {
        const library = buildStakeEngineTestLibrary({libraryId: "base-lib", betMode: "base", stake: 1});
        const exporter = new StakeEngineExporter<string>("1.3.0");

        await exporter.exportToDirectory([{modeName: "base", cost: 1, library}], outDir);

        expect(isRecognizedStakeEngineExportDirectory(outDir)).toBe(true);
    });
});
