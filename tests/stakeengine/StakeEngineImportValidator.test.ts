import {
    StakeEngineImportBookLineResult,
    StakeEngineImportBundle,
    StakeEngineImportFileResult,
    StakeEngineImportModeFiles,
    StakeEngineImportValidator,
} from "pokie";

function ok<T>(value: T): StakeEngineImportFileResult<T> {
    return {status: "ok", value};
}
function missing<T>(): StakeEngineImportFileResult<T> {
    return {status: "missing"};
}
function unreadable<T>(error = "permission denied"): StakeEngineImportFileResult<T> {
    return {status: "unreadable", error};
}
function invalid<T>(error = "boom"): StakeEngineImportFileResult<T> {
    return {status: "invalid", error};
}
function okLine(value: unknown): StakeEngineImportBookLineResult {
    return {status: "ok", value};
}
function invalidLine(error = "boom"): StakeEngineImportBookLineResult {
    return {status: "invalid", error};
}

const VALID_HASH = `sha256:${"a".repeat(64)}`;

const VALID_INDEX = {
    modes: [{name: "base", cost: 1, events: "books_base.jsonl.zst", weights: "lookup_base.csv"}],
};

const VALID_MANIFEST = {
    schemaVersion: 1,
    generatedBy: "pokie stakeengine export",
    pokieVersion: "1.3.0",
    generatedAt: "2024-01-01T00:00:00.000Z",
    game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
    modes: [
        {
            name: "base",
            betMode: "base",
            stake: 1,
            cost: 1,
            outcomeCount: 1,
            libraryId: "base-lib",
            libraryHash: VALID_HASH,
            events: "books_base.jsonl.zst",
            weights: "lookup_base.csv",
        },
    ],
    files: ["index.json", "pokie-manifest.json", "lookup_base.csv", "books_base.jsonl.zst"],
};

const VALID_BOOK_LINE = {
    id: 0,
    events: [
        {index: 0, type: "reveal", board: [["A"]]},
        {index: 1, type: "finalWin", amount: 0, payoutMultiplier: 0},
    ],
    payoutMultiplier: 0,
};

const VALID_MODE_FILES: StakeEngineImportModeFiles = {
    modeName: "base",
    csv: ok(["0,1,0"]),
    books: ok([okLine(VALID_BOOK_LINE)]),
};

function baseBundle(): StakeEngineImportBundle {
    return {
        stakeDir: "/stake",
        index: ok(VALID_INDEX),
        manifest: ok(VALID_MANIFEST),
        modeFiles: [VALID_MODE_FILES],
    };
}

function issueCodes(bundle: StakeEngineImportBundle): string[] {
    return new StakeEngineImportValidator().validate(bundle).map((issue) => issue.code);
}

describe("StakeEngineImportValidator", () => {
    it("reports no issues for a valid bundle", () => {
        expect(new StakeEngineImportValidator().validate(baseBundle())).toEqual([]);
    });

    describe("index.json", () => {
        it("reports stakeengine-import-index-missing/unreadable/invalid-json for each file-read outcome", () => {
            expect(issueCodes({...baseBundle(), index: missing()})).toEqual(["stakeengine-import-index-missing"]);
            expect(issueCodes({...baseBundle(), index: unreadable()})).toEqual(["stakeengine-import-index-unreadable"]);
            expect(issueCodes({...baseBundle(), index: invalid()})).toEqual(["stakeengine-import-index-invalid-json"]);
        });

        it("reports stakeengine-import-index-malformed for a missing modes array, an empty one, or a non-object entry", () => {
            expect(issueCodes({...baseBundle(), index: ok({})})).toContain("stakeengine-import-index-malformed");
            expect(issueCodes({...baseBundle(), index: ok({modes: []})})).toContain("stakeengine-import-index-malformed");
            expect(issueCodes({...baseBundle(), index: ok({modes: [null]})})).toContain("stakeengine-import-index-malformed");
        });

        it("reports stakeengine-import-mode-name-invalid for a missing/malformed modeName", () => {
            expect(
                issueCodes({...baseBundle(), index: ok({modes: [{...VALID_INDEX.modes[0], name: "not valid!"}]})}),
            ).toContain("stakeengine-import-mode-name-invalid");
        });

        it("reports stakeengine-import-duplicate-mode-name / stakeengine-import-mode-name-case-collision", () => {
            expect(
                issueCodes({...baseBundle(), index: ok({modes: [VALID_INDEX.modes[0], VALID_INDEX.modes[0]]})}),
            ).toContain("stakeengine-import-duplicate-mode-name");
            expect(
                issueCodes({
                    ...baseBundle(),
                    index: ok({modes: [VALID_INDEX.modes[0], {...VALID_INDEX.modes[0], name: "BASE"}]}),
                }),
            ).toContain("stakeengine-import-mode-name-case-collision");
        });

        it("reports stakeengine-import-mode-cost-invalid for a non-finite/non-positive cost", () => {
            expect(issueCodes({...baseBundle(), index: ok({modes: [{...VALID_INDEX.modes[0], cost: 0}]})})).toContain(
                "stakeengine-import-mode-cost-invalid",
            );
            expect(issueCodes({...baseBundle(), index: ok({modes: [{...VALID_INDEX.modes[0], cost: "1"}]})})).toContain(
                "stakeengine-import-mode-cost-invalid",
            );
        });

        it("reports stakeengine-import-mode-filename-unsafe for absolute/traversal/nested filenames in index.json", () => {
            for (const badPath of ["/etc/passwd", "../../etc/passwd", "sub/dir.csv", "..", "."]) {
                expect(issueCodes({...baseBundle(), index: ok({modes: [{...VALID_INDEX.modes[0], weights: badPath}]})})).toContain(
                    "stakeengine-import-mode-filename-unsafe",
                );
            }
        });

        it("reports stakeengine-import-mode-filename-mismatch for a safe filename that doesn't follow lookup_<mode>.csv / books_<mode>.jsonl.zst", () => {
            expect(issueCodes({...baseBundle(), index: ok({modes: [{...VALID_INDEX.modes[0], weights: "custom.csv"}]})})).toContain(
                "stakeengine-import-mode-filename-mismatch",
            );
            expect(issueCodes({...baseBundle(), index: ok({modes: [{...VALID_INDEX.modes[0], events: "custom.jsonl.zst"}]})})).toContain(
                "stakeengine-import-mode-filename-mismatch",
            );
        });

        it("reports stakeengine-import-filename-reused / stakeengine-import-filename-case-collision when two modes' filenames collide", () => {
            const bonus = {name: "bonus", cost: 100, events: "books_bonus.jsonl.zst", weights: "lookup_bonus.csv"};
            expect(
                issueCodes({
                    ...baseBundle(),
                    index: ok({modes: [{...VALID_INDEX.modes[0], weights: "lookup_bonus.csv"}, bonus]}),
                }),
            ).toContain("stakeengine-import-filename-reused");
            expect(
                issueCodes({
                    ...baseBundle(),
                    index: ok({modes: [VALID_INDEX.modes[0], {...bonus, weights: "LOOKUP_BASE.CSV"}]}),
                }),
            ).toContain("stakeengine-import-filename-case-collision");
        });
    });

    describe("pokie-manifest.json", () => {
        it("reports stakeengine-import-manifest-missing/unreadable/invalid-json for each file-read outcome", () => {
            expect(issueCodes({...baseBundle(), manifest: missing()})).toContain("stakeengine-import-manifest-missing");
            expect(issueCodes({...baseBundle(), manifest: unreadable()})).toContain("stakeengine-import-manifest-unreadable");
            expect(issueCodes({...baseBundle(), manifest: invalid()})).toContain("stakeengine-import-manifest-invalid-json");
        });

        it("reports stakeengine-import-manifest-unrecognized when generatedBy doesn't match or modes isn't an array", () => {
            expect(issueCodes({...baseBundle(), manifest: ok({generatedBy: "someone else"})})).toContain("stakeengine-import-manifest-unrecognized");
            expect(issueCodes({...baseBundle(), manifest: ok({generatedBy: "pokie stakeengine export"})})).toContain(
                "stakeengine-import-manifest-unrecognized",
            );
        });

        it("reports stakeengine-import-manifest-schema-version-unsupported", () => {
            expect(issueCodes({...baseBundle(), manifest: ok({...VALID_MANIFEST, schemaVersion: 999})})).toEqual([
                "stakeengine-import-manifest-schema-version-unsupported",
            ]);
        });

        it("reports stakeengine-import-manifest-field-invalid for each malformed top-level field", () => {
            expect(issueCodes({...baseBundle(), manifest: ok({...VALID_MANIFEST, pokieVersion: ""})})).toContain(
                "stakeengine-import-manifest-field-invalid",
            );
            expect(issueCodes({...baseBundle(), manifest: ok({...VALID_MANIFEST, generatedAt: 123})})).toContain(
                "stakeengine-import-manifest-field-invalid",
            );
            expect(issueCodes({...baseBundle(), manifest: ok({...VALID_MANIFEST, game: {id: "x"}})})).toContain(
                "stakeengine-import-manifest-field-invalid",
            );
            expect(issueCodes({...baseBundle(), manifest: ok({...VALID_MANIFEST, configHash: 123})})).toContain(
                "stakeengine-import-manifest-field-invalid",
            );
            expect(issueCodes({...baseBundle(), manifest: ok({...VALID_MANIFEST, files: [123]})})).toContain(
                "stakeengine-import-manifest-field-invalid",
            );
        });

        it("reports stakeengine-import-manifest-mode-field-invalid for a malformed mode entry, and the specific dedicated codes for cost/stake/libraryId/libraryHash/outcomeCount", () => {
            expect(
                issueCodes({...baseBundle(), manifest: ok({...VALID_MANIFEST, modes: [{...VALID_MANIFEST.modes[0], betMode: ""}]})}),
            ).toContain("stakeengine-import-manifest-mode-field-invalid");
            expect(
                issueCodes({...baseBundle(), manifest: ok({...VALID_MANIFEST, modes: [{...VALID_MANIFEST.modes[0], stake: 0}]})}),
            ).toContain("stakeengine-import-mode-stake-invalid");
            expect(
                issueCodes({...baseBundle(), manifest: ok({...VALID_MANIFEST, modes: [{...VALID_MANIFEST.modes[0], cost: -1}]})}),
            ).toContain("stakeengine-import-mode-cost-invalid");
            expect(
                issueCodes({...baseBundle(), manifest: ok({...VALID_MANIFEST, modes: [{...VALID_MANIFEST.modes[0], libraryId: ""}]})}),
            ).toContain("stakeengine-import-manifest-library-id-invalid");
            expect(
                issueCodes({...baseBundle(), manifest: ok({...VALID_MANIFEST, modes: [{...VALID_MANIFEST.modes[0], libraryHash: "not-a-hash"}]})}),
            ).toContain("stakeengine-import-manifest-library-hash-invalid");
            expect(
                issueCodes({...baseBundle(), manifest: ok({...VALID_MANIFEST, modes: [{...VALID_MANIFEST.modes[0], outcomeCount: -1}]})}),
            ).toContain("stakeengine-import-manifest-outcome-count-invalid");
            expect(
                issueCodes({...baseBundle(), manifest: ok({...VALID_MANIFEST, modes: [{...VALID_MANIFEST.modes[0], outcomeCount: 0}]})}),
            ).toContain("stakeengine-import-manifest-outcome-count-invalid");
        });

        it("reports stakeengine-import-mode-filename-unsafe for absolute/traversal/nested filenames in the manifest", () => {
            expect(
                issueCodes({...baseBundle(), manifest: ok({...VALID_MANIFEST, modes: [{...VALID_MANIFEST.modes[0], events: "../evil.jsonl.zst"}]})}),
            ).toContain("stakeengine-import-mode-filename-unsafe");
        });
    });

    describe("manifest.files", () => {
        it("reports stakeengine-import-manifest-field-invalid when files is missing, empty, or has a non-string/empty-string entry", () => {
            const {files: _files, ...manifestWithoutFiles} = VALID_MANIFEST;
            expect(issueCodes({...baseBundle(), manifest: ok(manifestWithoutFiles)})).toContain("stakeengine-import-manifest-field-invalid");
            expect(issueCodes({...baseBundle(), manifest: ok({...VALID_MANIFEST, files: []})})).toContain("stakeengine-import-manifest-field-invalid");
            expect(issueCodes({...baseBundle(), manifest: ok({...VALID_MANIFEST, files: [""]})})).toContain("stakeengine-import-manifest-field-invalid");
        });

        it("reports stakeengine-import-manifest-files-duplicate for an exact or case-only duplicate entry", () => {
            expect(
                issueCodes({...baseBundle(), manifest: ok({...VALID_MANIFEST, files: [...VALID_MANIFEST.files, "lookup_base.csv"]})}),
            ).toContain("stakeengine-import-manifest-files-duplicate");
            expect(
                issueCodes({...baseBundle(), manifest: ok({...VALID_MANIFEST, files: [...VALID_MANIFEST.files, "LOOKUP_BASE.CSV"]})}),
            ).toContain("stakeengine-import-manifest-files-duplicate");
        });

        it("reports stakeengine-import-manifest-files-entry-unsafe for an absolute/traversal/nested entry", () => {
            expect(
                issueCodes({...baseBundle(), manifest: ok({...VALID_MANIFEST, files: [...VALID_MANIFEST.files, "../evil.csv"]})}),
            ).toContain("stakeengine-import-manifest-files-entry-unsafe");
        });

        it("reports stakeengine-import-manifest-files-missing-entry when an expected file is absent", () => {
            expect(
                issueCodes({
                    ...baseBundle(),
                    manifest: ok({...VALID_MANIFEST, files: VALID_MANIFEST.files.filter((file) => file !== "books_base.jsonl.zst")}),
                }),
            ).toContain("stakeengine-import-manifest-files-missing-entry");
        });

        it("reports stakeengine-import-manifest-files-unexpected-entry for a file outside index.json/pokie-manifest.json/current mode files", () => {
            expect(
                issueCodes({...baseBundle(), manifest: ok({...VALID_MANIFEST, files: [...VALID_MANIFEST.files, "leftover_bonus.csv"]})}),
            ).toContain("stakeengine-import-manifest-files-unexpected-entry");
        });
    });

    describe("cross-checks", () => {
        it("reports stakeengine-import-mode-missing-in-manifest / stakeengine-import-mode-missing-in-index", () => {
            expect(
                issueCodes({
                    ...baseBundle(),
                    index: ok({modes: [...VALID_INDEX.modes, {name: "bonus", cost: 100, events: "books_bonus.jsonl.zst", weights: "lookup_bonus.csv"}]}),
                }),
            ).toContain("stakeengine-import-mode-missing-in-manifest");
            expect(
                issueCodes({
                    ...baseBundle(),
                    manifest: ok({
                        ...VALID_MANIFEST,
                        modes: [...VALID_MANIFEST.modes, {...VALID_MANIFEST.modes[0], name: "bonus", events: "books_bonus.jsonl.zst", weights: "lookup_bonus.csv"}],
                        files: [...VALID_MANIFEST.files, "books_bonus.jsonl.zst", "lookup_bonus.csv"],
                    }),
                }),
            ).toContain("stakeengine-import-mode-missing-in-index");
        });

        it("reports stakeengine-import-mode-cost-mismatch when index.json and the manifest disagree on a mode's cost", () => {
            expect(issueCodes({...baseBundle(), index: ok({modes: [{...VALID_INDEX.modes[0], cost: 2}]})})).toContain(
                "stakeengine-import-mode-cost-mismatch",
            );
        });

        it("an events/weights filename disagreement between index.json and the manifest is unreachable: whichever file's filename doesn't match its own naming convention fails first", () => {
            expect(issueCodes({...baseBundle(), index: ok({modes: [{...VALID_INDEX.modes[0], events: "books_other.jsonl.zst"}]})})).toEqual([
                "stakeengine-import-mode-filename-mismatch",
            ]);
            expect(issueCodes({...baseBundle(), index: ok({modes: [{...VALID_INDEX.modes[0], weights: "lookup_other.csv"}]})})).toEqual([
                "stakeengine-import-mode-filename-mismatch",
            ]);
        });
    });

    describe("per-mode files", () => {
        it("reports stakeengine-import-csv-missing/unreadable and stakeengine-import-books-missing/unreadable/invalid-zstd", () => {
            expect(issueCodes({...baseBundle(), modeFiles: [{...VALID_MODE_FILES, csv: missing()}]})).toContain("stakeengine-import-csv-missing");
            expect(issueCodes({...baseBundle(), modeFiles: [{...VALID_MODE_FILES, csv: unreadable()}]})).toContain("stakeengine-import-csv-unreadable");
            expect(issueCodes({...baseBundle(), modeFiles: [{...VALID_MODE_FILES, books: missing()}]})).toContain("stakeengine-import-books-missing");
            expect(issueCodes({...baseBundle(), modeFiles: [{...VALID_MODE_FILES, books: unreadable()}]})).toContain("stakeengine-import-books-unreadable");
            expect(issueCodes({...baseBundle(), modeFiles: [{...VALID_MODE_FILES, books: invalid("bad zstd frame")}]})).toContain(
                "stakeengine-import-books-invalid-zstd",
            );
        });

        it("reports stakeengine-import-csv-malformed-row for a row that isn't exactly 3 comma-separated integer fields", () => {
            expect(issueCodes({...baseBundle(), modeFiles: [{...VALID_MODE_FILES, csv: ok(["0,1"])}]})).toContain("stakeengine-import-csv-malformed-row");
            expect(issueCodes({...baseBundle(), modeFiles: [{...VALID_MODE_FILES, csv: ok(["a,b,c"])}]})).toContain("stakeengine-import-csv-malformed-row");
        });

        it("reports stakeengine-import-books-invalid-json-line for an unparseable books line, distinct from a malformed-shape one", () => {
            expect(issueCodes({...baseBundle(), modeFiles: [{...VALID_MODE_FILES, books: ok([invalidLine("Unexpected token")])}]})).toContain(
                "stakeengine-import-books-invalid-json-line",
            );
            expect(issueCodes({...baseBundle(), modeFiles: [{...VALID_MODE_FILES, books: ok([okLine({foo: 1})])}]})).toContain(
                "stakeengine-import-books-malformed-line",
            );
        });

        it("reports stakeengine-import-outcome-id-not-integer for a non-canonical CSV id or a negative book line id", () => {
            expect(issueCodes({...baseBundle(), modeFiles: [{...VALID_MODE_FILES, csv: ok(["01,1,0"])}]})).toContain(
                "stakeengine-import-outcome-id-not-integer",
            );
            expect(
                issueCodes({...baseBundle(), modeFiles: [{...VALID_MODE_FILES, books: ok([okLine({...VALID_BOOK_LINE, id: -1})])}]}),
            ).toContain("stakeengine-import-outcome-id-not-integer");
        });

        it("reports stakeengine-import-duplicate-csv-id / stakeengine-import-duplicate-book-id", () => {
            expect(
                issueCodes({...baseBundle(), modeFiles: [{...VALID_MODE_FILES, csv: ok(["0,1,0", "0,1,0"])}]}),
            ).toContain("stakeengine-import-duplicate-csv-id");
            expect(
                issueCodes({...baseBundle(), modeFiles: [{...VALID_MODE_FILES, books: ok([okLine(VALID_BOOK_LINE), okLine(VALID_BOOK_LINE)])}]}),
            ).toContain("stakeengine-import-duplicate-book-id");
        });

        it("reports stakeengine-import-outcome-weight-not-positive-integer for a zero, negative, or unsafe weight", () => {
            expect(issueCodes({...baseBundle(), modeFiles: [{...VALID_MODE_FILES, csv: ok(["0,0,0"])}]})).toContain(
                "stakeengine-import-outcome-weight-not-positive-integer",
            );
            expect(issueCodes({...baseBundle(), modeFiles: [{...VALID_MODE_FILES, csv: ok([`0,${Number.MAX_SAFE_INTEGER}9,0`])}]})).toContain(
                "stakeengine-import-outcome-weight-not-positive-integer",
            );
        });

        it("reports stakeengine-import-outcome-payout-multiplier-not-safe-integer for an unsafe CSV/book payoutMultiplier", () => {
            expect(issueCodes({...baseBundle(), modeFiles: [{...VALID_MODE_FILES, csv: ok([`0,1,${Number.MAX_SAFE_INTEGER}9`])}]})).toContain(
                "stakeengine-import-outcome-payout-multiplier-not-safe-integer",
            );
        });

        it("reports stakeengine-import-total-weight-overflow when the sum of weights overflows a safe integer", () => {
            const csvLines = [
                `0,${Number.MAX_SAFE_INTEGER},0`,
                "1,1,0",
            ];
            expect(
                issueCodes({
                    ...baseBundle(),
                    modeFiles: [{...VALID_MODE_FILES, csv: ok(csvLines), books: ok([okLine(VALID_BOOK_LINE), okLine({...VALID_BOOK_LINE, id: 1})])}],
                }),
            ).toContain("stakeengine-import-total-weight-overflow");
        });

        it("reports stakeengine-import-csv-books-count-mismatch when the CSV and books have different row/line counts", () => {
            expect(
                issueCodes({...baseBundle(), modeFiles: [{...VALID_MODE_FILES, csv: ok(["0,1,0", "1,1,0"])}]}),
            ).toContain("stakeengine-import-csv-books-count-mismatch");
        });

        it("reports stakeengine-import-csv-books-id-set-mismatch when an id exists on only one side", () => {
            expect(issueCodes({...baseBundle(), modeFiles: [{...VALID_MODE_FILES, csv: ok(["1,1,0"])}]})).toContain(
                "stakeengine-import-csv-books-id-set-mismatch",
            );
        });

        it("reports stakeengine-import-csv-books-payout-multiplier-mismatch when the same id disagrees between CSV and books", () => {
            expect(issueCodes({...baseBundle(), modeFiles: [{...VALID_MODE_FILES, csv: ok(["0,1,5"])}]})).toContain(
                "stakeengine-import-csv-books-payout-multiplier-mismatch",
            );
        });

        it("reports stakeengine-import-outcome-count-mismatch when the manifest's outcomeCount disagrees with the actual row/line count", () => {
            expect(
                issueCodes({...baseBundle(), manifest: ok({...VALID_MANIFEST, modes: [{...VALID_MANIFEST.modes[0], outcomeCount: 5}]})}),
            ).toContain("stakeengine-import-outcome-count-mismatch");
        });
    });
});
