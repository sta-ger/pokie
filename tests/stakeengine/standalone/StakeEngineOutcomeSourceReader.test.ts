import {withRareStakeDirectory, expectRareMetrics, UINT64_MAX} from "./StakeProbabilityTestFixtures.js";
import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import {StakeEngineExportModeInput, StakeEngineExporter, StakeEngineOutcomeSourceReader, StakeEngineStandaloneAnalyzer} from "pokie";
import {buildSingleOutcomeStakeEngineLibrary, buildStakeEngineTestLibrary} from "../StakeEngineTestFixtures.js";

function writeIndexJson(dir: string, modes: readonly {name: string; cost: number; events: string; weights: string}[]): void {
    fs.writeFileSync(path.join(dir, "index.json"), JSON.stringify({modes}));
}

function writeCsv(dir: string, fileName: string, rows: readonly {id: number; weight: bigint | number; payoutMultiplier: number}[]): void {
    const content = rows.map((row) => `${row.id},${row.weight},${row.payoutMultiplier}`).join("\n") + "\n";
    fs.writeFileSync(path.join(dir, fileName), content);
}

function writeBooks(dir: string, fileName: string, lines: readonly unknown[]): void {
    const jsonl = lines.map((line) => JSON.stringify(line)).join("\n") + "\n";
    fs.writeFileSync(path.join(dir, fileName), zlib.zstdCompressSync(Buffer.from(jsonl, "utf-8")));
}

function readBooksLines(filePath: string): {id: number; events: unknown[]; payoutMultiplier: number}[] {
    return zlib
        .zstdDecompressSync(fs.readFileSync(filePath))
        .toString("utf-8")
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line));
}

describe("StakeEngineOutcomeSourceReader", () => {
    let dir: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-stakeengine-standalone-reader-test-"));
    });

    afterEach(() => {
        fs.rmSync(dir, {recursive: true, force: true});
    });

    it("normalizes a real 'pokie stakeengine export' output with pokie-manifest.json removed -- id/weight/payoutMultiplier/ratio/events all recovered exactly, without ever reading a manifest", async () => {
        const library = buildStakeEngineTestLibrary({libraryId: "base-lib", betMode: "base", stake: 1});
        const modes: StakeEngineExportModeInput[] = [{modeName: "base", cost: 1, library}];
        const exportDir = path.join(dir, "export");
        await new StakeEngineExporter("1.3.0").exportToDirectory(modes, exportDir);
        fs.rmSync(path.join(exportDir, "pokie-manifest.json"));

        const result = await new StakeEngineOutcomeSourceReader().readFromDirectory(exportDir);

        expect(result.issues.some((issue) => issue.severity === "error")).toBe(false);
        expect(result.issues.some((issue) => issue.code.includes("manifest"))).toBe(false);
        expect(result.modes.length).toBe(1);

        const [mode] = result.modes;
        expect(mode.modeName).toBe("base");
        expect(mode.cost).toBe(1);
        expect(mode.outcomes.length).toBe(3);

        const byId = new Map(mode.outcomes.map((outcome) => [outcome.id, outcome]));
        expect(byId.get(0)).toMatchObject({weight: BigInt(970), payoutMultiplier: 0, ratio: 0});
        expect(byId.get(1)).toMatchObject({weight: BigInt(25), payoutMultiplier: 200, ratio: 2});
        expect(byId.get(2)).toMatchObject({weight: BigInt(5), payoutMultiplier: 500, ratio: 5});

        // events are normalized verbatim -- no attempt to reconstruct a RoundArtifact-shaped step model.
        const multiStepOutcome = byId.get(2);
        expect(multiStepOutcome?.events.some((event) => event.type === "reveal")).toBe(true);
        expect(multiStepOutcome?.events.some((event) => event.type === "finalWin")).toBe(true);
        expect(multiStepOutcome?.events.some((event) => event.type === "cascadeStep")).toBe(true);
        expect(multiStepOutcome?.events.some((event) => event.type === "freeGamesTriggered")).toBe(true);
    });

    it("reads the exact same result whether or not pokie-manifest.json is present -- it's never looked at", async () => {
        const library = buildSingleOutcomeStakeEngineLibrary({libraryId: "single-lib", betMode: "base", stake: 1, totalWin: 5});
        const modes: StakeEngineExportModeInput[] = [{modeName: "base", cost: 1, library}];
        const exportDir = path.join(dir, "export");
        await new StakeEngineExporter("1.3.0").exportToDirectory(modes, exportDir);

        const withManifest = await new StakeEngineOutcomeSourceReader().readFromDirectory(exportDir);
        fs.rmSync(path.join(exportDir, "pokie-manifest.json"));
        const withoutManifest = await new StakeEngineOutcomeSourceReader().readFromDirectory(exportDir);

        expect(withManifest.modes).toEqual(withoutManifest.modes);
    });

    it("normalizes a genuinely foreign directory -- hand-written index.json/CSV/books with no POKIE event vocabulary at all", async () => {
        writeIndexJson(dir, [{name: "base", cost: 1, events: "custom-events.jsonl.zst", weights: "custom-weights.csv"}]);
        writeCsv(dir, "custom-weights.csv", [
            {id: 0, weight: 900, payoutMultiplier: 0},
            {id: 1, weight: 100, payoutMultiplier: 150},
        ]);
        writeBooks(dir, "custom-events.jsonl.zst", [
            {id: 0, payoutMultiplier: 0, events: [{index: 0, type: "anticipation", reelStops: [1, 2, 3]}]},
            {
                id: 1,
                payoutMultiplier: 150,
                events: [
                    {index: 0, type: "anticipation", reelStops: [4, 5, 6]},
                    {index: 1, type: "multiplierApplied", value: 1.5},
                ],
            },
        ]);

        const result = await new StakeEngineOutcomeSourceReader().readFromDirectory(dir);

        expect(result.issues.some((issue) => issue.severity === "error")).toBe(false);
        expect(result.modes.length).toBe(1);
        const [mode] = result.modes;
        expect(mode.outcomes.length).toBe(2);
        const byId = new Map(mode.outcomes.map((outcome) => [outcome.id, outcome]));
        expect(byId.get(0)).toMatchObject({weight: BigInt(900), payoutMultiplier: 0, ratio: 0});
        expect(byId.get(1)).toMatchObject({weight: BigInt(100), payoutMultiplier: 150, ratio: 1.5});
        expect(byId.get(1)?.events.map((event) => event.type)).toEqual(["anticipation", "multiplierApplied"]);
    });

    it("accepts uint64 CSV weights above Number.MAX_SAFE_INTEGER without truncating them", async () => {
        writeIndexJson(dir, [{name: "base", cost: 1, events: "books.jsonl.zst", weights: "lookup.csv"}]);
        writeCsv(dir, "lookup.csv", [
            {id: 0, weight: BigInt("9007199254740993"), payoutMultiplier: 0},
            {id: 1, weight: BigInt(1), payoutMultiplier: 100},
        ]);
        writeBooks(dir, "books.jsonl.zst", [
            {id: 0, payoutMultiplier: 0, events: []},
            {id: 1, payoutMultiplier: 100, events: []},
        ]);

        const result = await new StakeEngineOutcomeSourceReader().readFromDirectory(dir);

        expect(result.issues.some((issue) => issue.severity === "error")).toBe(false);
        expect(result.modes[0].outcomes.map((outcome) => outcome.weight)).toEqual([BigInt("9007199254740993"), BigInt(1)]);
    });

    it("reports stakeengine-standalone-outcome-ratio-not-representable (a warning, not blocking) when a payoutMultiplier can't be reversed without hidden rounding, and still returns the mode", async () => {
        const library = buildSingleOutcomeStakeEngineLibrary({libraryId: "tamper-lib", betMode: "base", stake: 1, totalWin: 0});
        const modes: StakeEngineExportModeInput[] = [{modeName: "base", cost: 3, library}];
        const exportDir = path.join(dir, "export");
        await new StakeEngineExporter("1.3.0").exportToDirectory(modes, exportDir);

        const csvPath = path.join(exportDir, "lookup_base.csv");
        fs.writeFileSync(csvPath, fs.readFileSync(csvPath, "utf-8").replace(/,\d+$/m, ",1"));
        const booksPath = path.join(exportDir, "books_base.jsonl.zst");
        const lines = readBooksLines(booksPath);
        lines[0].payoutMultiplier = 1;
        fs.writeFileSync(booksPath, zlib.zstdCompressSync(Buffer.from(lines.map((line) => JSON.stringify(line)).join("\n") + "\n", "utf-8")));

        const result = await new StakeEngineOutcomeSourceReader().readFromDirectory(exportDir);

        expect(result.issues.some((issue) => issue.code === "stakeengine-standalone-outcome-ratio-not-representable" && issue.severity === "warning")).toBe(true);
        expect(result.issues.some((issue) => issue.severity === "error")).toBe(false);
        expect(result.modes.length).toBe(1);
        expect(result.modes[0].outcomes[0].ratio).toBeUndefined();
        expect(result.modes[0].outcomes[0].payoutMultiplier).toBe(1);
    });

    describe("tampered/foreign directories", () => {
        it("reports stakeengine-standalone-index-missing and returns no modes when index.json is absent", async () => {
            const result = await new StakeEngineOutcomeSourceReader().readFromDirectory(dir);

            expect(result.issues.some((issue) => issue.code === "stakeengine-standalone-index-missing")).toBe(true);
            expect(result.modes).toEqual([]);
        });

        it("reports stakeengine-standalone-csv-books-payout-multiplier-mismatch when the CSV disagrees with books", async () => {
            writeIndexJson(dir, [{name: "base", cost: 1, events: "books.jsonl.zst", weights: "lookup.csv"}]);
            writeCsv(dir, "lookup.csv", [{id: 0, weight: 100, payoutMultiplier: 999}]);
            writeBooks(dir, "books.jsonl.zst", [{id: 0, payoutMultiplier: 5, events: [{index: 0, type: "reveal"}]}]);

            const result = await new StakeEngineOutcomeSourceReader().readFromDirectory(dir);

            expect(result.issues.some((issue) => issue.code === "stakeengine-standalone-csv-books-payout-multiplier-mismatch")).toBe(true);
            expect(result.modes).toEqual([]);
        });

        it("reports stakeengine-standalone-duplicate-csv-id when the same id appears twice in the lookup CSV", async () => {
            writeIndexJson(dir, [{name: "base", cost: 1, events: "books.jsonl.zst", weights: "lookup.csv"}]);
            fs.writeFileSync(path.join(dir, "lookup.csv"), "0,100,0\n0,100,0\n");
            writeBooks(dir, "books.jsonl.zst", [{id: 0, payoutMultiplier: 0, events: []}]);

            const result = await new StakeEngineOutcomeSourceReader().readFromDirectory(dir);

            expect(result.issues.some((issue) => issue.code === "stakeengine-standalone-duplicate-csv-id")).toBe(true);
            expect(result.modes).toEqual([]);
        });

        it("reports stakeengine-standalone-mode-filename-unsafe for a path-traversal weights filename, and never reads outside the directory", async () => {
            const outsideFile = path.join(path.dirname(dir), "outside-secret.csv");
            fs.writeFileSync(outsideFile, "should never be read");
            writeIndexJson(dir, [{name: "base", cost: 1, events: "books.jsonl.zst", weights: `../${path.basename(outsideFile)}`}]);
            writeBooks(dir, "books.jsonl.zst", [{id: 0, payoutMultiplier: 0, events: []}]);

            const result = await new StakeEngineOutcomeSourceReader().readFromDirectory(dir);

            expect(result.issues.some((issue) => issue.code === "stakeengine-standalone-mode-filename-unsafe")).toBe(true);
            expect(result.modes).toEqual([]);
            fs.rmSync(outsideFile, {force: true});
        });

        it("reports stakeengine-standalone-books-invalid-zstd when the books file is corrupted", async () => {
            writeIndexJson(dir, [{name: "base", cost: 1, events: "books.jsonl.zst", weights: "lookup.csv"}]);
            writeCsv(dir, "lookup.csv", [{id: 0, weight: 100, payoutMultiplier: 0}]);
            fs.writeFileSync(path.join(dir, "books.jsonl.zst"), Buffer.from("not a zstd frame"));

            const result = await new StakeEngineOutcomeSourceReader().readFromDirectory(dir);

            expect(result.issues.some((issue) => issue.code === "stakeengine-standalone-books-invalid-zstd")).toBe(true);
            expect(result.modes).toEqual([]);
        });

        it.each([
            ["null", null],
            ["a primitive number", 7],
            ["a primitive string", "reveal"],
            ["an array", [{index: 0, type: "reveal"}]],
            ["an object missing a string type", {index: 0}],
            ["an object missing a numeric index", {type: "reveal"}],
            ["an object whose type is not a string", {index: 0, type: 5}],
        ])("reports stakeengine-standalone-books-malformed-event when an events element is %s", async (_label, badEvent) => {
            writeIndexJson(dir, [{name: "base", cost: 1, events: "books.jsonl.zst", weights: "lookup.csv"}]);
            writeCsv(dir, "lookup.csv", [{id: 0, weight: 100, payoutMultiplier: 0}]);
            writeBooks(dir, "books.jsonl.zst", [{id: 0, payoutMultiplier: 0, events: [badEvent]}]);

            const result = await new StakeEngineOutcomeSourceReader().readFromDirectory(dir);

            const malformed = result.issues.find((issue) => issue.code === "stakeengine-standalone-books-malformed-event");
            expect(malformed).toBeDefined();
            expect(malformed?.details).toMatchObject({modeName: "base", position: 0, eventIndex: 0});
            expect(result.modes).toEqual([]);
        });

        it("pins the exact events[position] of a malformed event so the diagnostic identifies its location", async () => {
            writeIndexJson(dir, [{name: "base", cost: 1, events: "books.jsonl.zst", weights: "lookup.csv"}]);
            writeCsv(dir, "lookup.csv", [{id: 0, weight: 100, payoutMultiplier: 0}]);
            writeBooks(dir, "books.jsonl.zst", [{id: 0, payoutMultiplier: 0, events: [{index: 0, type: "reveal"}, null, {index: 2, type: "win"}]}]);

            const result = await new StakeEngineOutcomeSourceReader().readFromDirectory(dir);

            const malformed = result.issues.filter((issue) => issue.code === "stakeengine-standalone-books-malformed-event");
            expect(malformed.length).toBe(1);
            expect(malformed[0].details).toMatchObject({modeName: "base", position: 0, eventIndex: 1});
        });

        it("lets the analyzer classify every event without crashing once validation succeeds", async () => {
            writeIndexJson(dir, [{name: "base", cost: 1, events: "books.jsonl.zst", weights: "lookup.csv"}]);
            writeCsv(dir, "lookup.csv", [
                {id: 0, weight: 900, payoutMultiplier: 0},
                {id: 1, weight: 100, payoutMultiplier: 100},
            ]);
            writeBooks(dir, "books.jsonl.zst", [
                {id: 0, payoutMultiplier: 0, events: [{index: 0, type: "reveal"}]},
                {id: 1, payoutMultiplier: 100, events: [{index: 0, type: "reveal"}, {index: 1, type: "win", amount: 100}]},
            ]);

            const result = await new StakeEngineOutcomeSourceReader().readFromDirectory(dir);
            expect(result.issues.some((issue) => issue.severity === "error")).toBe(false);

            const analysis = new StakeEngineStandaloneAnalyzer().analyze(result);
            const categories = analysis.modes[0].eventClassificationBreakdown.map((entry) => entry.category);
            expect(categories).toContain("reveal");
            expect(categories).toContain("win");
        });

        it("reports stakeengine-standalone-mode-outcomes-empty when a mode's lookup CSV has no rows", async () => {
            writeIndexJson(dir, [{name: "base", cost: 1, events: "books.jsonl.zst", weights: "lookup.csv"}]);
            fs.writeFileSync(path.join(dir, "lookup.csv"), "");
            writeBooks(dir, "books.jsonl.zst", []);

            const result = await new StakeEngineOutcomeSourceReader().readFromDirectory(dir);

            expect(result.issues.some((issue) => issue.code === "stakeengine-standalone-mode-outcomes-empty")).toBe(true);
            expect(result.modes).toEqual([]);
        });
    });
});

it("reads the manifest-less 2^64 fixture through validation and preserves its corrected metrics", async () => {
    await withRareStakeDirectory(async (dir) => {
        const source = await new StakeEngineOutcomeSourceReader().readFromDirectory(dir);
        expect(source.issues).toEqual([]);
        expect(source.modes[0].outcomes.map((outcome) => outcome.weight)).toEqual([UINT64_MAX, BigInt(1)]);
        expectRareMetrics(new StakeEngineStandaloneAnalyzer().analyze(source).modes[0]);
    });
});

it.each(["id", "payoutMultiplier"])("accepts safe-integer maximum %s through CSV and books", async (field) => {
    await withRareStakeDirectory(async (dir) => {
        const id = field === "id" ? Number.MAX_SAFE_INTEGER : 0;
        const payout = field === "payoutMultiplier" ? Number.MAX_SAFE_INTEGER : 0;
        fs.writeFileSync(path.join(dir, "lookup.csv"), `${id},1,${payout}\n`);
        fs.writeFileSync(path.join(dir, "books.jsonl.zst"), zlib.zstdCompressSync(Buffer.from(JSON.stringify({id, payoutMultiplier: payout, events: []}) + "\n")));
        const source = await new StakeEngineOutcomeSourceReader().readFromDirectory(dir);
        expect(source.issues.filter((issue) => issue.severity === "error")).toEqual([]);
        expect(source.modes[0].outcomes[0]).toMatchObject({id, payoutMultiplier: payout, weight: BigInt(1)});
        const mode = new StakeEngineStandaloneAnalyzer().analyze(source).modes[0];
        expect(mode.nonInvertibleRatioCount).toBe(source.modes[0].outcomes[0].ratio === undefined ? 1 : 0);
        expect(source.issues.filter((issue) => issue.code === "stakeengine-standalone-outcome-ratio-not-representable")).toHaveLength(mode.nonInvertibleRatioCount);
    });
});

it.each(["csv", "books"].flatMap((surface) => ["id", "payoutMultiplier"].flatMap((field) => ["9007199254740992", "18446744073709551615"].map((value) => [surface, field, value]))))(
    "rejects exact textual unsafe %s %s %s independently", async (surface, field, value) => {
        await withRareStakeDirectory(async (dir) => {
            const id = field === "id" ? value : "1";
            const payout = field === "payoutMultiplier" ? value : "200";
            if (surface === "csv") {
                fs.writeFileSync(path.join(dir, "lookup.csv"), `0,18446744073709551615,0\n${id},1,${payout}\n`);
            } else {
                fs.writeFileSync(path.join(dir, "books.jsonl.zst"), zlib.zstdCompressSync(Buffer.from(`{"id":0,"payoutMultiplier":0,"events":[]}\n{"id":${id},"payoutMultiplier":${payout},"events":[]}\n`)));
            }
            const source = await new StakeEngineOutcomeSourceReader().readFromDirectory(dir);
            expect(source.modes).toEqual([]);
            expect(source.issues).toContainEqual(expect.objectContaining({severity: "error", code: field === "id" ? "stakeengine-standalone-outcome-id-not-integer" : "stakeengine-standalone-outcome-payout-multiplier-not-safe-integer"}));
        });
    },
);

it.each(["0", "-1", "0.5", "Infinity", "NaN", "18446744073709551616"])("rejects invalid CSV weight %s without exposing a mode", async (weight) => {
    await withRareStakeDirectory(async (dir) => {
        fs.writeFileSync(path.join(dir, "lookup.csv"), `0,${weight},0\n1,1,200\n`);
        const source = await new StakeEngineOutcomeSourceReader().readFromDirectory(dir);
        expect(source.modes).toEqual([]);
        expect(source.issues).toContainEqual(expect.objectContaining({code: ["0.5", "Infinity", "NaN"].includes(weight) ? "stakeengine-standalone-csv-malformed-row" : "stakeengine-standalone-outcome-weight-not-positive-integer", severity: "error"}));
    });
});
