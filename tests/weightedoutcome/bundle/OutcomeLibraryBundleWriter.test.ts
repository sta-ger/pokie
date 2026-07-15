import fs from "fs";
import os from "os";
import path from "path";
import {OutcomeLibraryBundleManifest, OutcomeLibraryBundleModeIndex, OutcomeLibraryBundleModeInput, OutcomeLibraryBundleWriter} from "pokie";
import {buildOutcomeLibraryBundleTestLibrary} from "./OutcomeLibraryBundleTestFixtures.js";

function siblingLeftovers(outDir: string): string[] {
    const parentDir = path.dirname(outDir);
    const base = path.basename(outDir);
    return fs.readdirSync(parentDir).filter((name) => name !== base && name.startsWith(`${base}.`));
}

describe("OutcomeLibraryBundleWriter", () => {
    let outDir: string;

    beforeEach(() => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-outcomelibrary-writer-test-"));
        fs.rmdirSync(outDir);
    });

    afterEach(() => {
        fs.rmSync(outDir, {recursive: true, force: true});
        for (const name of siblingLeftovers(outDir)) {
            fs.rmSync(path.join(path.dirname(outDir), name), {recursive: true, force: true});
        }
    });

    function modes(): OutcomeLibraryBundleModeInput[] {
        return [
            {modeName: "base", library: buildOutcomeLibraryBundleTestLibrary("base-lib")},
            {modeName: "bonus", library: buildOutcomeLibraryBundleTestLibrary("bonus-lib")},
        ];
    }

    it("writes manifest.json, one index_<mode>.json, and one streaming outcomes_<mode>.jsonl per mode", async () => {
        const writer = new OutcomeLibraryBundleWriter("1.3.0");

        const result = await writer.writeToDirectory(modes(), outDir);

        expect(result.issues).toEqual([]);
        expect(new Set(result.files)).toEqual(
            new Set(["manifest.json", "index_base.json", "outcomes_base.jsonl", "index_bonus.json", "outcomes_bonus.jsonl"]),
        );
        expect(new Set(fs.readdirSync(outDir))).toEqual(new Set(result.files));

        const manifest = JSON.parse(fs.readFileSync(path.join(outDir, "manifest.json"), "utf-8")) as OutcomeLibraryBundleManifest;
        expect(manifest.generatedBy).toBe("pokie outcomelibrary build");
        expect(manifest.pokieVersion).toBe("1.3.0");
        expect(manifest.modes.map((mode) => mode.modeName)).toEqual(["base", "bonus"]);
        expect(manifest.modes[0].outcomeCount).toBe(5);
        expect(manifest.modes[0].totalWeight).toBe(1000);
        expect(manifest.modes[0].analysis.totalWeight).toBe(1000);
        expect(manifest.files).toEqual(result.files);

        const index = JSON.parse(fs.readFileSync(path.join(outDir, "index_base.json"), "utf-8")) as OutcomeLibraryBundleModeIndex;
        expect(index.entries.map((entry) => entry.id)).toEqual(["0", "1", "2", "3", "4"]);
        expect(index.entries.map((entry) => entry.weight)).toEqual([500, 300, 150, 40, 10]);
        expect(index.libraryHash).toBe(manifest.modes[0].libraryHash);

        const outcomesBuffer = fs.readFileSync(path.join(outDir, "outcomes_base.jsonl"));
        expect(index.entries.length).toBe(5);
        for (const entry of index.entries) {
            const lineBuffer = outcomesBuffer.subarray(entry.byteOffset, entry.byteOffset + entry.byteLength);
            expect(outcomesBuffer[entry.byteOffset + entry.byteLength]).toBe("\n".charCodeAt(0));
            const parsedLine = JSON.parse(lineBuffer.toString("utf-8")) as {id: string; weight: number};
            expect(parsedLine.id).toBe(entry.id);
            expect(parsedLine.weight).toBe(entry.weight);
        }
    });

    it("reports outcome-library-bundle-duplicate-mode-name / -mode-name-case-collision and writes nothing", async () => {
        const writer = new OutcomeLibraryBundleWriter("1.3.0");
        const duplicate = [{modeName: "base", library: buildOutcomeLibraryBundleTestLibrary("a")}, {modeName: "base", library: buildOutcomeLibraryBundleTestLibrary("b")}];
        const caseCollision = [
            {modeName: "base", library: buildOutcomeLibraryBundleTestLibrary("a")},
            {modeName: "BASE", library: buildOutcomeLibraryBundleTestLibrary("b")},
        ];

        const duplicateResult = await writer.writeToDirectory(duplicate, outDir);
        expect(duplicateResult.issues.some((issue) => issue.code === "outcome-library-bundle-duplicate-mode-name")).toBe(true);
        expect(duplicateResult.manifest).toBeUndefined();
        expect(fs.existsSync(outDir)).toBe(false);

        const caseResult = await writer.writeToDirectory(caseCollision, outDir);
        expect(caseResult.issues.some((issue) => issue.code === "outcome-library-bundle-mode-name-case-collision")).toBe(true);
        expect(fs.existsSync(outDir)).toBe(false);
    });

    it("leaves no temp/stale sibling directories behind after a successful write or re-write", async () => {
        const writer = new OutcomeLibraryBundleWriter("1.3.0");

        await writer.writeToDirectory([modes()[0]], outDir);
        expect(siblingLeftovers(outDir)).toEqual([]);

        await writer.writeToDirectory(modes(), outDir);
        expect(siblingLeftovers(outDir)).toEqual([]);
    });

    it("removes a mode's index/outcomes files when a re-write no longer includes that mode", async () => {
        const writer = new OutcomeLibraryBundleWriter("1.3.0");
        await writer.writeToDirectory(modes(), outDir);
        expect(fs.existsSync(path.join(outDir, "outcomes_bonus.jsonl"))).toBe(true);

        const result = await writer.writeToDirectory([modes()[0]], outDir);

        expect(result.issues).toEqual([]);
        expect(fs.existsSync(path.join(outDir, "outcomes_bonus.jsonl"))).toBe(false);
        expect(fs.existsSync(path.join(outDir, "index_bonus.json"))).toBe(false);
    });

    it("preserves the whole existing directory, byte for byte, when a write fails partway through a re-write", async () => {
        const writer = new OutcomeLibraryBundleWriter("1.3.0");
        await writer.writeToDirectory(modes(), outDir);
        const filesBefore = fs.readdirSync(outDir).sort();
        const manifestBefore = fs.readFileSync(path.join(outDir, "manifest.json"), "utf-8");

        let callCount = 0;
        const failingWriteFile = (filePath: string, contents: string): void => {
            callCount++;
            if (callCount === 2) {
                throw new Error("simulated disk failure");
            }
            fs.writeFileSync(filePath, contents, "utf-8");
        };
        const failingWriter = new OutcomeLibraryBundleWriter("1.3.0", undefined, undefined, failingWriteFile);

        await expect(failingWriter.writeToDirectory(modes(), outDir)).rejects.toThrow("simulated disk failure");

        expect(fs.readdirSync(outDir).sort()).toEqual(filesBefore);
        expect(fs.readFileSync(path.join(outDir, "manifest.json"), "utf-8")).toBe(manifestBefore);
        expect(siblingLeftovers(outDir)).toEqual([]);
    });

    it("restores the old outDir byte-for-byte when the publish rename fails after the old directory was moved aside", async () => {
        const writer = new OutcomeLibraryBundleWriter("1.3.0");
        await writer.writeToDirectory(modes(), outDir);
        const filesBefore = fs.readdirSync(outDir).sort();

        let renameCallCount = 0;
        const failingRenameDirectory = (from: string, to: string): void => {
            renameCallCount++;
            if (renameCallCount === 2) {
                throw new Error("simulated publish failure");
            }
            fs.renameSync(from, to);
        };
        const failingWriter = new OutcomeLibraryBundleWriter("1.3.0", undefined, undefined, undefined, failingRenameDirectory);

        await expect(failingWriter.writeToDirectory([modes()[0]], outDir)).rejects.toThrow("simulated publish failure");

        expect(renameCallCount).toBe(3);
        expect(fs.readdirSync(outDir).sort()).toEqual(filesBefore);
        expect(siblingLeftovers(outDir)).toEqual([]);
    });

    it("surfaces a warning (not a failure) when removing the stale backup fails after a successful publish", async () => {
        const writer = new OutcomeLibraryBundleWriter("1.3.0");
        await writer.writeToDirectory(modes(), outDir);

        const failingRemoveDirectory = (): void => {
            throw new Error("simulated cleanup failure");
        };
        const failingWriter = new OutcomeLibraryBundleWriter("1.3.0", undefined, undefined, undefined, undefined, failingRemoveDirectory);

        const result = await failingWriter.writeToDirectory([modes()[0]], outDir);

        expect(result.issues.some((issue) => issue.code === "outcome-library-bundle-write-stale-cleanup-failed" && issue.severity === "warning")).toBe(true);
        expect(fs.existsSync(path.join(outDir, "outcomes_bonus.jsonl"))).toBe(false);
    });
});
