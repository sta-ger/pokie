import fs from "fs";
import os from "os";
import path from "path";
import {OutcomeLibraryBundleManifest, OutcomeLibraryBundleModeIndex, OutcomeLibraryBundleModeInput, OutcomeLibraryBundleValidator, OutcomeLibraryBundleWriter} from "pokie";
import {buildOutcomeLibraryBundleTestLibrary} from "./OutcomeLibraryBundleTestFixtures.js";

function readManifest(outDir: string): OutcomeLibraryBundleManifest {
    return JSON.parse(fs.readFileSync(path.join(outDir, "manifest.json"), "utf-8")) as OutcomeLibraryBundleManifest;
}
function writeManifest(outDir: string, manifest: unknown): void {
    fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest));
}
function readIndex(outDir: string, modeName: string): OutcomeLibraryBundleModeIndex {
    return JSON.parse(fs.readFileSync(path.join(outDir, `index_${modeName}.json`), "utf-8")) as OutcomeLibraryBundleModeIndex;
}
function writeIndex(outDir: string, modeName: string, index: unknown): void {
    fs.writeFileSync(path.join(outDir, `index_${modeName}.json`), JSON.stringify(index));
}
function issueCodes(issues: readonly {code: string}[]): string[] {
    return issues.map((issue) => issue.code);
}

describe("OutcomeLibraryBundleValidator", () => {
    let outDir: string;

    beforeEach(async () => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-outcomelibrary-validator-test-"));
        fs.rmdirSync(outDir);
        const modes: OutcomeLibraryBundleModeInput[] = [{modeName: "base", library: buildOutcomeLibraryBundleTestLibrary("base-lib")}];
        await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory(modes, outDir);
    });

    afterEach(() => {
        fs.rmSync(outDir, {recursive: true, force: true});
    });

    it("reports no issues for a valid bundle, in both shallow and deep mode", async () => {
        const validator = new OutcomeLibraryBundleValidator();

        expect(await validator.validate(outDir)).toEqual([]);
        expect(await validator.validate(outDir, {deep: true})).toEqual([]);
    });

    describe("manifest", () => {
        it("reports outcome-library-bundle-manifest-missing when manifest.json is removed", async () => {
            fs.rmSync(path.join(outDir, "manifest.json"));
            expect(issueCodes(await new OutcomeLibraryBundleValidator().validate(outDir))).toEqual(["outcome-library-bundle-manifest-missing"]);
        });

        it("reports outcome-library-bundle-manifest-invalid-json for unparseable JSON", async () => {
            fs.writeFileSync(path.join(outDir, "manifest.json"), "{not json");
            expect(issueCodes(await new OutcomeLibraryBundleValidator().validate(outDir))).toEqual(["outcome-library-bundle-manifest-invalid-json"]);
        });

        it("reports outcome-library-bundle-manifest-malformed for a missing/empty modes array", async () => {
            writeManifest(outDir, {});
            expect(issueCodes(await new OutcomeLibraryBundleValidator().validate(outDir))).toEqual(["outcome-library-bundle-manifest-malformed"]);

            writeManifest(outDir, {modes: []});
            expect(issueCodes(await new OutcomeLibraryBundleValidator().validate(outDir))).toEqual(["outcome-library-bundle-manifest-malformed"]);
        });

        it("reports outcome-library-bundle-manifest-schema-version-unsupported", async () => {
            const manifest = readManifest(outDir);
            writeManifest(outDir, {...manifest, schemaVersion: 999});
            expect(issueCodes(await new OutcomeLibraryBundleValidator().validate(outDir))).toEqual(["outcome-library-bundle-manifest-schema-version-unsupported"]);
        });
    });

    describe("path safety", () => {
        it("reports outcome-library-bundle-path-unsafe for a path-traversal indexFile/outcomesFile", async () => {
            const manifest = readManifest(outDir);
            writeManifest(outDir, {...manifest, modes: [{...manifest.modes[0], indexFile: "../evil.json"}]});
            expect(await new OutcomeLibraryBundleValidator().validate(outDir)).toContainEqual(
                expect.objectContaining({code: "outcome-library-bundle-path-unsafe"}),
            );
        });
    });

    describe("mode index", () => {
        it("reports outcome-library-bundle-mode-index-missing when the index file is removed", async () => {
            fs.rmSync(path.join(outDir, "index_base.json"));
            expect(await new OutcomeLibraryBundleValidator().validate(outDir)).toContainEqual(
                expect.objectContaining({code: "outcome-library-bundle-mode-index-missing"}),
            );
        });

        it("reports outcome-library-bundle-mode-index-invalid-json for unparseable JSON", async () => {
            fs.writeFileSync(path.join(outDir, "index_base.json"), "{not json");
            expect(await new OutcomeLibraryBundleValidator().validate(outDir)).toContainEqual(
                expect.objectContaining({code: "outcome-library-bundle-mode-index-invalid-json"}),
            );
        });

        it("reports outcome-library-bundle-mode-index-malformed when required fields are missing", async () => {
            writeIndex(outDir, "base", {});
            expect(await new OutcomeLibraryBundleValidator().validate(outDir)).toContainEqual(
                expect.objectContaining({code: "outcome-library-bundle-mode-index-malformed"}),
            );
        });

        it("reports outcome-library-bundle-mode-index-schema-version-unsupported", async () => {
            const index = readIndex(outDir, "base");
            writeIndex(outDir, "base", {...index, schemaVersion: 999});
            expect(await new OutcomeLibraryBundleValidator().validate(outDir)).toContainEqual(
                expect.objectContaining({code: "outcome-library-bundle-mode-index-schema-version-unsupported"}),
            );
        });

        it("reports outcome-library-bundle-mode-index-library-id-mismatch / -hash-mismatch-with-manifest", async () => {
            const index = readIndex(outDir, "base");
            writeIndex(outDir, "base", {...index, libraryId: "someone-elses-lib"});
            expect(await new OutcomeLibraryBundleValidator().validate(outDir)).toContainEqual(
                expect.objectContaining({code: "outcome-library-bundle-mode-index-library-id-mismatch"}),
            );

            writeIndex(outDir, "base", {...index, libraryHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000"});
            expect(await new OutcomeLibraryBundleValidator().validate(outDir)).toContainEqual(
                expect.objectContaining({code: "outcome-library-bundle-mode-index-hash-mismatch-with-manifest"}),
            );
        });

        it("reports outcome-library-bundle-mode-index-entry-invalid for a malformed entry", async () => {
            const index = readIndex(outDir, "base");
            writeIndex(outDir, "base", {...index, entries: [{...index.entries[0], weight: -1}]});
            expect(await new OutcomeLibraryBundleValidator().validate(outDir)).toContainEqual(
                expect.objectContaining({code: "outcome-library-bundle-mode-index-entry-invalid"}),
            );
        });

        it("reports outcome-library-bundle-mode-index-duplicate-id", async () => {
            const index = readIndex(outDir, "base");
            writeIndex(outDir, "base", {...index, entries: [index.entries[0], index.entries[0]]});
            expect(await new OutcomeLibraryBundleValidator().validate(outDir)).toContainEqual(
                expect.objectContaining({code: "outcome-library-bundle-mode-index-duplicate-id"}),
            );
        });

        it("reports outcome-library-bundle-mode-index-entries-not-sorted", async () => {
            const index = readIndex(outDir, "base");
            writeIndex(outDir, "base", {...index, entries: [...index.entries].reverse()});
            expect(await new OutcomeLibraryBundleValidator().validate(outDir)).toContainEqual(
                expect.objectContaining({code: "outcome-library-bundle-mode-index-entries-not-sorted"}),
            );
        });

        it("reports outcome-library-bundle-mode-index-count-mismatch / -total-weight-mismatch", async () => {
            const index = readIndex(outDir, "base");
            writeIndex(outDir, "base", {...index, outcomeCount: 999});
            expect(await new OutcomeLibraryBundleValidator().validate(outDir)).toContainEqual(
                expect.objectContaining({code: "outcome-library-bundle-mode-index-count-mismatch"}),
            );

            writeIndex(outDir, "base", {...index, totalWeight: 999});
            expect(await new OutcomeLibraryBundleValidator().validate(outDir)).toContainEqual(
                expect.objectContaining({code: "outcome-library-bundle-mode-index-total-weight-mismatch"}),
            );
        });
    });

    describe("outcomes file (shallow)", () => {
        it("reports outcome-library-bundle-outcomes-file-missing", async () => {
            fs.rmSync(path.join(outDir, "outcomes_base.jsonl"));
            expect(await new OutcomeLibraryBundleValidator().validate(outDir)).toContainEqual(
                expect.objectContaining({code: "outcome-library-bundle-outcomes-file-missing"}),
            );
        });

        it("reports outcome-library-bundle-outcomes-file-too-small", async () => {
            fs.writeFileSync(path.join(outDir, "outcomes_base.jsonl"), "x");
            expect(await new OutcomeLibraryBundleValidator().validate(outDir)).toContainEqual(
                expect.objectContaining({code: "outcome-library-bundle-outcomes-file-too-small"}),
            );
        });

        it("never opens the outcomes file's content in shallow mode, even when it's corrupted", async () => {
            const outcomesPath = path.join(outDir, "outcomes_base.jsonl");
            const validSize = fs.statSync(outcomesPath).size;
            // Corrupt the content without shrinking the file (so the cheap size check alone can't catch it) —
            // shallow mode must still report no issues, since it never reads this file's content at all.
            const corrupted = Buffer.alloc(validSize, "x");
            fs.writeFileSync(outcomesPath, corrupted);

            expect(await new OutcomeLibraryBundleValidator().validate(outDir)).toEqual([]);
        });
    });

    describe("deep mode", () => {
        function readLines(): {id: string; weight: number; artifact: unknown}[] {
            const raw = fs.readFileSync(path.join(outDir, "outcomes_base.jsonl"), "utf-8");
            return raw
                .split("\n")
                .filter((line) => line.length > 0)
                .map((line) => JSON.parse(line));
        }
        function writeLines(lines: readonly unknown[]): void {
            const jsonl = `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`;
            fs.writeFileSync(path.join(outDir, "outcomes_base.jsonl"), jsonl);
        }
        // Overwrites exactly one entry's own byte range in place — unlike writeLines (which rewrites the whole
        // file and can shift every later byte offset), this never changes the file's overall size, so a
        // corruption test can isolate "this one record's content is broken" from "the file no longer matches
        // its own recorded byte layout" (already covered by the file-too-small test above).
        function overwriteLineBytes(entryPosition: number, replacement: string): void {
            const index = readIndex(outDir, "base");
            const entry = index.entries[entryPosition];
            const filePath = path.join(outDir, "outcomes_base.jsonl");
            const buffer = fs.readFileSync(filePath);
            const replacementBuffer = Buffer.alloc(entry.byteLength, " ");
            Buffer.from(replacement, "utf-8").copy(replacementBuffer, 0, 0, Math.min(Buffer.byteLength(replacement, "utf-8"), entry.byteLength));
            replacementBuffer.copy(buffer, entry.byteOffset);
            fs.writeFileSync(filePath, buffer);
        }

        it("catches content corruption shallow mode misses", async () => {
            const outcomesPath = path.join(outDir, "outcomes_base.jsonl");
            const validSize = fs.statSync(outcomesPath).size;
            fs.writeFileSync(outcomesPath, Buffer.alloc(validSize, "x"));

            expect(await new OutcomeLibraryBundleValidator().validate(outDir)).toEqual([]);
            expect(await new OutcomeLibraryBundleValidator().validate(outDir, {deep: true})).not.toEqual([]);
        });

        it("reports outcome-library-bundle-outcomes-line-malformed for a line that's valid JSON but the wrong shape", async () => {
            overwriteLineBytes(1, '"not an object at all"');
            expect(await new OutcomeLibraryBundleValidator().validate(outDir, {deep: true})).toContainEqual(
                expect.objectContaining({code: "outcome-library-bundle-outcomes-line-malformed"}),
            );
        });

        it("reports outcome-library-bundle-outcomes-line-invalid-json for a line that isn't valid JSON at all", async () => {
            overwriteLineBytes(1, "{not valid json at all");
            expect(await new OutcomeLibraryBundleValidator().validate(outDir, {deep: true})).toContainEqual(
                expect.objectContaining({code: "outcome-library-bundle-outcomes-line-invalid-json"}),
            );
        });

        it("reports outcome-library-bundle-outcomes-duplicate-id", async () => {
            const lines = await readLines();
            writeLines([lines[0], lines[0], ...lines.slice(1)]);
            expect(await new OutcomeLibraryBundleValidator().validate(outDir, {deep: true})).toContainEqual(
                expect.objectContaining({code: "outcome-library-bundle-outcomes-duplicate-id"}),
            );
        });

        it("reports outcome-library-bundle-outcomes-extra-id / -missing-id / -count-mismatch", async () => {
            const lines = await readLines();
            writeLines([{...lines[0], id: "not-in-index"}, ...lines.slice(1)]);
            const issues = await new OutcomeLibraryBundleValidator().validate(outDir, {deep: true});
            expect(issues).toContainEqual(expect.objectContaining({code: "outcome-library-bundle-outcomes-extra-id"}));
            expect(issues).toContainEqual(expect.objectContaining({code: "outcome-library-bundle-outcomes-missing-id"}));
        });

        it("reports outcome-library-bundle-outcomes-weight-mismatch", async () => {
            const lines = await readLines();
            writeLines([{...lines[0], weight: lines[0].weight + 1}, ...lines.slice(1)]);
            expect(await new OutcomeLibraryBundleValidator().validate(outDir, {deep: true})).toContainEqual(
                expect.objectContaining({code: "outcome-library-bundle-outcomes-weight-mismatch"}),
            );
        });

        it("reports outcome-library-bundle-hash-mismatch when a record's own content is tampered without touching the index", async () => {
            const lines = await readLines();
            const tamperedArtifact = {...(lines[0].artifact as Record<string, unknown>), roundId: "tampered-round-id"};
            writeLines([{...lines[0], artifact: tamperedArtifact}, ...lines.slice(1)]);

            expect(await new OutcomeLibraryBundleValidator().validate(outDir)).toEqual([]);
            expect(await new OutcomeLibraryBundleValidator().validate(outDir, {deep: true})).toContainEqual(
                expect.objectContaining({code: "outcome-library-bundle-hash-mismatch"}),
            );
        });

        it("reports outcome-library-bundle-analysis-mismatch when the manifest's recorded analysis is tampered, independent of hash-mismatch", async () => {
            const manifest = readManifest(outDir);
            writeManifest(outDir, {...manifest, modes: [{...manifest.modes[0], analysis: {...manifest.modes[0].analysis, rtp: manifest.modes[0].analysis.rtp + 1}}]});

            const issues = await new OutcomeLibraryBundleValidator().validate(outDir, {deep: true});
            expect(issues).toContainEqual(expect.objectContaining({code: "outcome-library-bundle-analysis-mismatch"}));
            expect(issues.some((issue) => issue.code === "outcome-library-bundle-hash-mismatch")).toBe(false);
        });
    });
});
