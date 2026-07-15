import fs from "fs";
import os from "os";
import path from "path";
import {OutcomeLibraryBundleManifest, OutcomeLibraryBundleModeIndex, OutcomeLibraryBundleModeInput, OutcomeLibraryBundleWriter, WeightedOutcomeInput} from "pokie";
import {buildOutcomeLibraryBundleModeInput} from "./OutcomeLibraryBundleTestFixtures.js";

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
        return [buildOutcomeLibraryBundleModeInput("base", "base-lib"), buildOutcomeLibraryBundleModeInput("bonus", "bonus-lib")];
    }

    // A genuinely async source — forces a real await boundary between outcomes, the same way a caller streaming
    // from a database cursor or a network response would, rather than a plain array that happens to also satisfy
    // Iterable.
    async function *asyncOutcomes<T>(items: Iterable<T>): AsyncGenerator<T> {
        for (const item of items) {
            await new Promise((resolve) => {
                setTimeout(resolve, 0);
            });
            yield item;
        }
    }

    it("writes manifest.json, one index_<mode>.json, and one streaming outcomes_<mode>.jsonl per mode, consuming a genuinely async source", async () => {
        const writer = new OutcomeLibraryBundleWriter("1.3.0");
        const base = buildOutcomeLibraryBundleModeInput("base", "base-lib");
        const bonus = buildOutcomeLibraryBundleModeInput("bonus", "bonus-lib");

        const result = await writer.writeToDirectory(
            [
                {...base, outcomes: asyncOutcomes(base.outcomes as WeightedOutcomeInput[])},
                {...bonus, outcomes: asyncOutcomes(bonus.outcomes as WeightedOutcomeInput[])},
            ],
            outDir,
        );

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

    it("reports outcome-library-bundle-write-outcomes-not-sorted / -duplicate-outcome-id for a source that doesn't arrive in canonical order", async () => {
        const writer = new OutcomeLibraryBundleWriter("1.3.0");
        const outOfOrder = buildOutcomeLibraryBundleModeInput("base", "lib");

        const result = await writer.writeToDirectory(
            [{...outOfOrder, outcomes: [outOfOrder.outcomes[1], outOfOrder.outcomes[0], outOfOrder.outcomes[0]]}],
            outDir,
        );

        expect(result.issues.map((issue) => issue.code)).toEqual(
            expect.arrayContaining(["outcome-library-bundle-write-outcomes-not-sorted", "outcome-library-bundle-write-duplicate-outcome-id"]),
        );
        expect(fs.existsSync(outDir)).toBe(false);
    });

    it("reports outcome-library-bundle-write-weight-invalid for a non-positive-safe-integer weight", async () => {
        const writer = new OutcomeLibraryBundleWriter("1.3.0");
        const mode = buildOutcomeLibraryBundleModeInput("base", "lib");
        const outcomes = mode.outcomes as WeightedOutcomeInput[];

        const result = await writer.writeToDirectory([{...mode, outcomes: [{...outcomes[0], weight: 1.5}, ...outcomes.slice(1)]}], outDir);

        expect(result.issues.some((issue) => issue.code === "outcome-library-bundle-write-weight-invalid")).toBe(true);
        expect(fs.existsSync(outDir)).toBe(false);
    });

    it("reports outcome-library-bundle-write-total-weight-overflow for individually-valid weights whose sum overflows a safe integer", async () => {
        const writer = new OutcomeLibraryBundleWriter("1.3.0");
        const mode = buildOutcomeLibraryBundleModeInput("base", "lib");
        const outcomes = mode.outcomes as WeightedOutcomeInput[];
        const hugeWeight = Number.MAX_SAFE_INTEGER;

        const result = await writer.writeToDirectory(
            [{...mode, outcomes: [{...outcomes[0], weight: hugeWeight}, {...outcomes[1], weight: hugeWeight}, ...outcomes.slice(2)]}],
            outDir,
        );

        expect(result.issues.some((issue) => issue.code === "outcome-library-bundle-write-total-weight-overflow")).toBe(true);
        expect(fs.existsSync(outDir)).toBe(false);
    });

    it("reports outcome-library-bundle-duplicate-mode-name / -mode-name-case-collision and writes nothing", async () => {
        const writer = new OutcomeLibraryBundleWriter("1.3.0");
        const duplicate = [buildOutcomeLibraryBundleModeInput("base", "a"), buildOutcomeLibraryBundleModeInput("base", "b")];
        const caseCollision = [buildOutcomeLibraryBundleModeInput("base", "a"), {...buildOutcomeLibraryBundleModeInput("bonus", "b"), modeName: "BASE"}];

        const duplicateResult = await writer.writeToDirectory(duplicate, outDir);
        expect(duplicateResult.issues.some((issue) => issue.code === "outcome-library-bundle-duplicate-mode-name")).toBe(true);
        expect(duplicateResult.manifest).toBeUndefined();
        expect(fs.existsSync(outDir)).toBe(false);

        const caseResult = await writer.writeToDirectory(caseCollision, outDir);
        expect(caseResult.issues.some((issue) => issue.code === "outcome-library-bundle-mode-name-case-collision")).toBe(true);
        expect(fs.existsSync(outDir)).toBe(false);
    });

    it("leaves no temp/stale/staging sibling directories behind after a successful write or re-write", async () => {
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

        // For a single-mode re-write, writeFilesIntoTempDir renames exactly 3 staged files (index_base.json,
        // outcomes_base.jsonl, manifest.json) into publishDirectoryAtomically's own temp dir *before* that
        // helper's own atomic swap even begins — so the swap's own two renames (outDir -> stale, temp -> outDir)
        // are calls #4 and #5, not #1 and #2. Failing call #5 (the actual publish) exercises the "restore the
        // old directory" path; the restore itself is call #6.
        let renameCallCount = 0;
        const failingRenameDirectory = (from: string, to: string): void => {
            renameCallCount++;
            if (renameCallCount === 5) {
                throw new Error("simulated publish failure");
            }
            fs.renameSync(from, to);
        };
        const failingWriter = new OutcomeLibraryBundleWriter("1.3.0", undefined, undefined, undefined, failingRenameDirectory);

        await expect(failingWriter.writeToDirectory([modes()[0]], outDir)).rejects.toThrow("simulated publish failure");

        expect(renameCallCount).toBe(6);
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
