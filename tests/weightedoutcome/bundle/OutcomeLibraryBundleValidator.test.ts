import fs from "fs";
import os from "os";
import path from "path";
import {OutcomeLibraryBundleManifest, OutcomeLibraryBundleModeIndex, OutcomeLibraryBundleValidator, OutcomeLibraryBundleWriter} from "pokie";
import {buildOutcomeLibraryBundleModeInput} from "./OutcomeLibraryBundleTestFixtures.js";

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
// Corrupts every record's own bytes in place, leaving each index entry's byteOffset/byteLength — and, crucially,
// the newline byte immediately after it — completely untouched. This is what isolates "the outcomes file's JSON
// content is wrong" from "the outcomes file's byte layout is wrong": shallow mode only ever checks the latter.
function corruptContentPreservingByteLayout(outDir: string, modeName: string): void {
    const index = readIndex(outDir, modeName);
    const filePath = path.join(outDir, `outcomes_${modeName}.jsonl`);
    const buffer = fs.readFileSync(filePath);
    for (const entry of index.entries) {
        buffer.fill("x".charCodeAt(0), entry.byteOffset, entry.byteOffset + entry.byteLength);
    }
    fs.writeFileSync(filePath, buffer);
}

describe("OutcomeLibraryBundleValidator", () => {
    let outDir: string;

    beforeEach(async () => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-outcomelibrary-validator-test-"));
        fs.rmdirSync(outDir);
        const modes = [buildOutcomeLibraryBundleModeInput("base", "base-lib")];
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

        it("never opens the outcomes file's JSON content in shallow mode, even when every record's content (not its byte layout) is corrupted", async () => {
            corruptContentPreservingByteLayout(outDir, "base");

            expect(await new OutcomeLibraryBundleValidator().validate(outDir)).toEqual([]);
        });

        it("reports outcome-library-bundle-mode-index-byte-range-not-contiguous when an entry's byteOffset no longer follows the previous entry's own range", async () => {
            const index = readIndex(outDir, "base");
            const entries = index.entries.map((entry, position) => (position === 2 ? {...entry, byteOffset: entry.byteOffset + 5} : entry));
            writeIndex(outDir, "base", {...index, entries});

            expect(await new OutcomeLibraryBundleValidator().validate(outDir)).toContainEqual(
                expect.objectContaining({code: "outcome-library-bundle-mode-index-byte-range-not-contiguous"}),
            );
        });

        it("reports outcome-library-bundle-mode-index-entry-not-newline-terminated when the byte right after a recorded range isn't a newline", async () => {
            const index = readIndex(outDir, "base");
            const outcomesPath = path.join(outDir, "outcomes_base.jsonl");
            const buffer = fs.readFileSync(outcomesPath);
            const entry = index.entries[0];
            buffer[entry.byteOffset + entry.byteLength] = "X".charCodeAt(0);
            fs.writeFileSync(outcomesPath, buffer);

            expect(await new OutcomeLibraryBundleValidator().validate(outDir)).toContainEqual(
                expect.objectContaining({code: "outcome-library-bundle-mode-index-entry-not-newline-terminated"}),
            );
        });

        it("reports outcome-library-bundle-outcomes-file-has-trailing-bytes for extra bytes past the index's own last recorded range", async () => {
            const outcomesPath = path.join(outDir, "outcomes_base.jsonl");
            fs.appendFileSync(outcomesPath, "extra\n");

            expect(await new OutcomeLibraryBundleValidator().validate(outDir)).toContainEqual(
                expect.objectContaining({code: "outcome-library-bundle-outcomes-file-has-trailing-bytes"}),
            );
        });

        it("reports outcome-library-bundle-mode-index-total-weight-overflow for individually-valid weights whose sum overflows a safe integer", async () => {
            const index = readIndex(outDir, "base");
            const entries = index.entries.map((entry, position) => (position < 2 ? {...entry, weight: Number.MAX_SAFE_INTEGER} : entry));
            writeIndex(outDir, "base", {...index, entries});

            expect(await new OutcomeLibraryBundleValidator().validate(outDir)).toContainEqual(
                expect.objectContaining({code: "outcome-library-bundle-mode-index-total-weight-overflow"}),
            );
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
        // Rewrites the whole outcomes file AND recomputes the index's own byteOffset/byteLength to match the new
        // layout exactly (byte-for-byte contiguous/newline-terminated/exact-sized) — keeping every entry's own
        // id/weight exactly as originally recorded, regardless of what a deliberately-tampered line now actually
        // contains at that position. This is what isolates "the outcomes file's *content* disagrees with the
        // index" (what these tests exist to catch) from "the outcomes file's *byte layout* disagrees with the
        // index" (a different, already-covered corruption) — a line whose serialized length changed (e.g. a
        // shorter/longer id or an extra artifact field) would otherwise also trip the byte-layout checks and mask
        // the very mismatch each test is asserting on. A rewrite with more lines than the index has entries (see
        // the duplicate-id test below) leaves the extra line's bytes uncovered by any entry on purpose — that
        // test only asserts on deep-mode results, which run independently of byte-layout correctness.
        function writeLines(lines: readonly unknown[]): void {
            const filePath = path.join(outDir, "outcomes_base.jsonl");
            const originalIndex = readIndex(outDir, "base");
            let offset = 0;
            const chunks: string[] = [];
            const entries: unknown[] = [];
            lines.forEach((line, position) => {
                const json = JSON.stringify(line);
                const byteLength = Buffer.byteLength(json, "utf-8");
                const byteOffset = offset;
                offset += byteLength + 1;
                chunks.push(json);
                const original = originalIndex.entries[position];
                if (original !== undefined) {
                    entries.push({...original, byteOffset, byteLength});
                }
            });
            fs.writeFileSync(filePath, `${chunks.join("\n")}\n`);
            writeIndex(outDir, "base", {...originalIndex, entries});
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
            corruptContentPreservingByteLayout(outDir, "base");

            expect(await new OutcomeLibraryBundleValidator().validate(outDir)).toEqual([]);
            expect(await new OutcomeLibraryBundleValidator().validate(outDir, {deep: true})).not.toEqual([]);
        });

        it("reports outcome-library-bundle-outcomes-byte-range-mismatch when an entry's own recorded byte range decodes to a different id (a reordered/shifted outcomes file)", async () => {
            const index = readIndex(outDir, "base");
            const entry = index.entries[0];
            const outcomesPath = path.join(outDir, "outcomes_base.jsonl");
            const buffer = fs.readFileSync(outcomesPath);
            const original = buffer.subarray(entry.byteOffset, entry.byteOffset + entry.byteLength).toString("utf-8");
            // Every id in this fixture is a single digit, so swapping it for another single digit tampers the
            // record's identity without touching its byte length — isolating "this range's content now belongs
            // to a different outcome" from any byte-layout corruption (already covered by the shallow tests
            // above), the same way a physically reordered/shifted outcomes file would silently return the wrong
            // record for a byte-range read that itself looks perfectly well-formed.
            const tampered = original.replace(`"id":"${entry.id}"`, '"id":"9"');
            expect(tampered.length).toBe(original.length);
            buffer.write(tampered, entry.byteOffset, entry.byteLength, "utf-8");
            fs.writeFileSync(outcomesPath, buffer);

            const issues = await new OutcomeLibraryBundleValidator().validate(outDir, {deep: true});
            expect(issues).toContainEqual(expect.objectContaining({code: "outcome-library-bundle-outcomes-byte-range-mismatch"}));
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
