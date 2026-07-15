import fs from "fs";
import os from "os";
import path from "path";
import {StakeEngineImportResult, StakeEngineImportWriter} from "pokie";

const BASE_LIBRARY = {schemaVersion: 1, libraryId: "base-lib", outcomes: []};
const BONUS_LIBRARY = {schemaVersion: 1, libraryId: "bonus-lib", outcomes: []};

function resultWithModes(modeNames: readonly string[]): StakeEngineImportResult {
    const librariesByName: Record<string, unknown> = {base: BASE_LIBRARY, bonus: BONUS_LIBRARY};
    return {
        stakeDir: "/stake",
        manifest: undefined,
        modes: modeNames.map((modeName) => ({modeName, cost: 1, library: (librariesByName[modeName] ?? BASE_LIBRARY) as typeof BASE_LIBRARY})),
        sourceProvenance: {indexHash: "sha256:aa", manifestHash: "sha256:bb", modes: modeNames.map((modeName) => ({modeName, csvHash: "sha256:cc", booksHash: "sha256:dd"}))},
        issues: [],
    };
}

// Every ".tmp-*"/".stale-*" sibling directory a StakeEngineImportWriter might have left next to outDir.
function siblingLeftovers(outDir: string): string[] {
    const parentDir = path.dirname(outDir);
    const base = path.basename(outDir);
    return fs.readdirSync(parentDir).filter((name) => name !== base && name.startsWith(`${base}.`));
}

describe("StakeEngineImportWriter", () => {
    let outDir: string;

    beforeEach(() => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-stakeengine-import-writer-test-"));
    });

    afterEach(() => {
        fs.rmSync(outDir, {recursive: true, force: true});
        for (const name of siblingLeftovers(outDir)) {
            fs.rmSync(path.join(path.dirname(outDir), name), {recursive: true, force: true});
        }
    });

    it("writes libraries/<mode>.json, config.json, and source-provenance.json", async () => {
        const writer = new StakeEngineImportWriter();
        const result = resultWithModes(["base", "bonus"]);

        const written = await writer.writeToDirectory(result, outDir);

        expect(written.issues).toEqual([]);
        expect(new Set(fs.readdirSync(outDir))).toEqual(new Set(["libraries", "config.json", "source-provenance.json"]));
        expect(new Set(fs.readdirSync(path.join(outDir, "libraries")))).toEqual(new Set(["base.json", "bonus.json"]));
        expect(JSON.parse(fs.readFileSync(path.join(outDir, "libraries", "base.json"), "utf-8"))).toEqual(BASE_LIBRARY);
        expect(JSON.parse(fs.readFileSync(path.join(outDir, "config.json"), "utf-8"))).toEqual({
            modes: [
                {modeName: "base", cost: 1, libraryPath: "./libraries/base.json"},
                {modeName: "bonus", cost: 1, libraryPath: "./libraries/bonus.json"},
            ],
        });
        expect(JSON.parse(fs.readFileSync(path.join(outDir, "source-provenance.json"), "utf-8"))).toEqual(result.sourceProvenance);
    });

    it("removes a mode's library file when a re-write no longer includes that mode", async () => {
        const writer = new StakeEngineImportWriter();
        await writer.writeToDirectory(resultWithModes(["base", "bonus"]), outDir);
        expect(fs.existsSync(path.join(outDir, "libraries", "bonus.json"))).toBe(true);

        const written = await writer.writeToDirectory(resultWithModes(["base"]), outDir);

        expect(written.issues).toEqual([]);
        expect(fs.existsSync(path.join(outDir, "libraries", "bonus.json"))).toBe(false);
        expect(fs.readdirSync(path.join(outDir, "libraries"))).toEqual(["base.json"]);
    });

    it("leaves no temp/stale sibling directories behind after a successful write or re-write", async () => {
        const writer = new StakeEngineImportWriter();

        await writer.writeToDirectory(resultWithModes(["base"]), outDir);
        expect(siblingLeftovers(outDir)).toEqual([]);

        await writer.writeToDirectory(resultWithModes(["base", "bonus"]), outDir);
        expect(siblingLeftovers(outDir)).toEqual([]);
    });

    it("preserves the whole existing directory, byte for byte, when a write fails partway through a re-write", async () => {
        const writer = new StakeEngineImportWriter();
        await writer.writeToDirectory(resultWithModes(["base", "bonus"]), outDir);
        const filesBefore = fs.readdirSync(path.join(outDir, "libraries")).sort();
        const configBefore = fs.readFileSync(path.join(outDir, "config.json"), "utf-8");

        let callCount = 0;
        const failingWriteFile = (filePath: string, contents: string): void => {
            callCount++;
            if (callCount === 2) {
                throw new Error("simulated disk failure");
            }
            fs.writeFileSync(filePath, contents, "utf-8");
        };
        const failingWriter = new StakeEngineImportWriter(failingWriteFile);

        await expect(failingWriter.writeToDirectory(resultWithModes(["base", "bonus"]), outDir)).rejects.toThrow("simulated disk failure");

        expect(fs.readdirSync(path.join(outDir, "libraries")).sort()).toEqual(filesBefore);
        expect(fs.readFileSync(path.join(outDir, "config.json"), "utf-8")).toBe(configBefore);
        expect(siblingLeftovers(outDir)).toEqual([]);
    });

    it("restores the old outDir byte-for-byte when the publish rename fails after the old directory was moved aside", async () => {
        const writer = new StakeEngineImportWriter();
        await writer.writeToDirectory(resultWithModes(["base", "bonus"]), outDir);
        const filesBefore = fs.readdirSync(path.join(outDir, "libraries")).sort();

        let renameCallCount = 0;
        const failingRenameDirectory = (from: string, to: string): void => {
            renameCallCount++;
            if (renameCallCount === 2) {
                throw new Error("simulated publish failure");
            }
            fs.renameSync(from, to);
        };
        const failingWriter = new StakeEngineImportWriter(undefined, failingRenameDirectory);

        await expect(failingWriter.writeToDirectory(resultWithModes(["base"]), outDir)).rejects.toThrow("simulated publish failure");

        expect(renameCallCount).toBe(3);
        expect(fs.readdirSync(path.join(outDir, "libraries")).sort()).toEqual(filesBefore);
        expect(siblingLeftovers(outDir)).toEqual([]);
    });

    it("surfaces a warning (not a failure) when removing the stale backup fails after a successful publish", async () => {
        const writer = new StakeEngineImportWriter();
        await writer.writeToDirectory(resultWithModes(["base", "bonus"]), outDir);

        const failingRemoveDirectory = (): void => {
            throw new Error("simulated cleanup failure");
        };
        const failingWriter = new StakeEngineImportWriter(undefined, undefined, failingRemoveDirectory);

        const written = await failingWriter.writeToDirectory(resultWithModes(["base"]), outDir);

        expect(written.issues.some((issue) => issue.code === "stakeengine-import-write-stale-cleanup-failed" && issue.severity === "warning")).toBe(true);
        // The new (single-mode) directory is fully live despite the cleanup failure.
        expect(fs.readdirSync(path.join(outDir, "libraries"))).toEqual(["base.json"]);
    });

    it("refuses to write a library file outside libraries/ for a hand-crafted, unsafe modeName", async () => {
        const writer = new StakeEngineImportWriter();
        const maliciousResult: StakeEngineImportResult = {
            stakeDir: "/stake",
            manifest: undefined,
            modes: [{modeName: "../../evil", cost: 1, library: BASE_LIBRARY}],
            sourceProvenance: undefined,
            issues: [],
        };

        await expect(writer.writeToDirectory(maliciousResult, outDir)).rejects.toThrow(/not safe/);

        // Nothing was published — outDir was never touched (mkdtempSync created it empty, and it must stay so).
        expect(fs.readdirSync(outDir)).toEqual([]);
        expect(siblingLeftovers(outDir)).toEqual([]);
    });
});
