import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import {
    StakeEngineBookLine,
    StakeEngineEvent,
    StakeEngineExportModeInput,
    StakeEngineExporter,
    StakeEngineIndex,
    StakeEngineManifest,
    StakeEngineRoundEventsProjecting,
    StakeEngineRoundEventsProjector,
    WeightedOutcomeLibrary,
    computeWeightedOutcomeLibraryHash,
} from "pokie";
import {buildSingleOutcomeStakeEngineLibrary, buildStakeEngineTestLibrary} from "./StakeEngineTestFixtures.js";

const eventsProjector = new StakeEngineRoundEventsProjector<string>();

function readCsvRows(filePath: string): string[] {
    return fs
        .readFileSync(filePath, "utf-8")
        .split("\n")
        .filter((line) => line.length > 0);
}

function readBookLines(filePath: string): StakeEngineBookLine[] {
    const decompressed = zlib.zstdDecompressSync(fs.readFileSync(filePath));
    return decompressed
        .toString("utf-8")
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as StakeEngineBookLine);
}

describe("StakeEngineExporter", () => {
    let outDir: string;
    let baseLibrary: WeightedOutcomeLibrary<string>;
    let bonusLibrary: WeightedOutcomeLibrary<string>;
    let modes: StakeEngineExportModeInput[];

    beforeEach(() => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-stakeengine-test-"));
        baseLibrary = buildStakeEngineTestLibrary({libraryId: "base-lib", betMode: "base", stake: 1});
        bonusLibrary = buildStakeEngineTestLibrary({libraryId: "bonus-lib", betMode: "freeGames", stake: 100});
        modes = [
            {modeName: "base", cost: 1, library: baseLibrary},
            {modeName: "bonus", cost: 100, library: bonusLibrary},
        ];
    });

    afterEach(() => {
        fs.rmSync(outDir, {recursive: true, force: true});
        // Clean up any sibling temp/stale directories a test might have deliberately triggered.
        const parentDir = path.dirname(outDir);
        const base = path.basename(outDir);
        for (const name of fs.readdirSync(parentDir)) {
            if (name.startsWith(`${base}.`)) {
                fs.rmSync(path.join(parentDir, name), {recursive: true, force: true});
            }
        }
    });

    it("writes index.json, per-mode lookup CSVs, per-mode zstd books, and pokie-manifest.json that all round-trip exactly, in Stake units", async () => {
        const exporter = new StakeEngineExporter<string>("1.3.0");

        const result = await exporter.exportToDirectory(modes, outDir);

        expect(result.issues).toEqual([]);
        expect(new Set(result.files)).toEqual(
            new Set(["lookup_base.csv", "books_base.jsonl.zst", "lookup_bonus.csv", "books_bonus.jsonl.zst", "index.json", "pokie-manifest.json"]),
        );
        expect(new Set(fs.readdirSync(outDir))).toEqual(new Set(result.files));

        const index = JSON.parse(fs.readFileSync(path.join(outDir, "index.json"), "utf-8")) as StakeEngineIndex;
        expect(Object.keys(index)).toEqual(["modes"]);
        expect(index).toEqual({
            modes: [
                {name: "base", cost: 1, events: "books_base.jsonl.zst", weights: "lookup_base.csv"},
                {name: "bonus", cost: 100, events: "books_bonus.jsonl.zst", weights: "lookup_bonus.csv"},
            ],
        });

        const manifest = JSON.parse(fs.readFileSync(path.join(outDir, "pokie-manifest.json"), "utf-8")) as StakeEngineManifest;
        expect(manifest.generatedBy).toBe("pokie stakeengine export");
        expect(manifest.pokieVersion).toBe("1.3.0");
        expect(manifest.files).toEqual(result.files);
        expect(manifest.modes.find((entry) => entry.name === "base")?.libraryHash).toBe(computeWeightedOutcomeLibraryHash(baseLibrary));
        expect(manifest.modes.find((entry) => entry.name === "bonus")?.libraryHash).toBe(computeWeightedOutcomeLibraryHash(bonusLibrary));

        for (const mode of modes) {
            const csvRows = readCsvRows(path.join(outDir, `lookup_${mode.modeName}.csv`));
            const bookLines = readBookLines(path.join(outDir, `books_${mode.modeName}.jsonl.zst`));

            expect(csvRows.length).toBe(mode.library.outcomes.length);
            expect(bookLines.length).toBe(mode.library.outcomes.length);

            mode.library.outcomes.forEach((outcome, position) => {
                const expectedId = Number(outcome.id);
                // The explicit Stake unit conversion: payoutMultiplier * cost * 100, never rounded.
                const expectedPayoutMultiplier = outcome.artifact.payoutMultiplier * mode.cost * 100;

                expect(csvRows[position]).toBe(`${expectedId},${outcome.weight},${expectedPayoutMultiplier}`);

                const bookLine = bookLines[position];
                expect(bookLine.id).toBe(expectedId);
                expect(bookLine.payoutMultiplier).toBe(expectedPayoutMultiplier);
                expect(bookLine.events).toEqual(eventsProjector.project(outcome.artifact, {cost: mode.cost}));

                // CSV third column must exactly match the book line's payoutMultiplier for the same outcome.
                expect(csvRows[position].split(",")[2]).toBe(String(bookLine.payoutMultiplier));
            });
        }
    });

    it("keeps CSV payoutMultiplier, book payoutMultiplier, and the finalWin event's amount/payoutMultiplier in exactly the same Stake units", async () => {
        const exporter = new StakeEngineExporter<string>("1.3.0");

        const result = await exporter.exportToDirectory(modes, outDir);
        expect(result.issues).toEqual([]);

        for (const mode of modes) {
            const csvRows = readCsvRows(path.join(outDir, `lookup_${mode.modeName}.csv`));
            const bookLines = readBookLines(path.join(outDir, `books_${mode.modeName}.jsonl.zst`));

            mode.library.outcomes.forEach((outcome, position) => {
                const csvPayoutMultiplier = Number(csvRows[position].split(",")[2]);
                const bookLine = bookLines[position];
                const finalWinEvent = bookLine.events[bookLine.events.length - 1] as unknown as {type: string; amount: number; payoutMultiplier: number};

                expect(finalWinEvent.type).toBe("finalWin");
                expect(csvPayoutMultiplier).toBe(bookLine.payoutMultiplier);
                expect(finalWinEvent.payoutMultiplier).toBe(bookLine.payoutMultiplier);
                expect(finalWinEvent.amount).toBe(bookLine.payoutMultiplier);
            });
        }
    });

    it("exports a POKIE 0.1x payoutMultiplier at cost 1 as 10 Stake units", async () => {
        const library = buildSingleOutcomeStakeEngineLibrary({libraryId: "tenth-lib", betMode: "base", stake: 1, totalWin: 0.1});
        const exporter = new StakeEngineExporter<string>("1.3.0");

        const result = await exporter.exportToDirectory([{modeName: "base", cost: 1, library}], outDir);

        expect(result.issues).toEqual([]);
        expect(readCsvRows(path.join(outDir, "lookup_base.csv"))[0]).toBe("0,1,10");
        expect(readBookLines(path.join(outDir, "books_base.jsonl.zst"))[0].payoutMultiplier).toBe(10);
    });

    it("exports a POKIE 1.2x payoutMultiplier at cost 100 as 12000 Stake units", async () => {
        const library = buildSingleOutcomeStakeEngineLibrary({libraryId: "twelve-lib", betMode: "bonus", stake: 1, totalWin: 1.2});
        const exporter = new StakeEngineExporter<string>("1.3.0");

        const result = await exporter.exportToDirectory([{modeName: "bonus", cost: 100, library}], outDir);

        expect(result.issues).toEqual([]);
        expect(readCsvRows(path.join(outDir, "lookup_bonus.csv"))[0]).toBe("0,1,12000");
        expect(readBookLines(path.join(outDir, "books_bonus.jsonl.zst"))[0].payoutMultiplier).toBe(12000);
    });

    it("rejects the export (writing nothing) when a payoutMultiplier isn't representable as a safe integer once converted to Stake units", async () => {
        // 0.001 * 1 (cost) * 100 = 0.1 — not representable without rounding.
        const library = buildSingleOutcomeStakeEngineLibrary({libraryId: "bad-lib", betMode: "base", stake: 1, totalWin: 0.001});
        const exporter = new StakeEngineExporter<string>("1.3.0");

        const result = await exporter.exportToDirectory([{modeName: "base", cost: 1, library}], outDir);

        expect(result.files).toEqual([]);
        expect(result.manifest).toBeUndefined();
        expect(result.issues.some((issue) => issue.code === "stakeengine-outcome-payout-multiplier-not-representable" && issue.severity === "error")).toBe(
            true,
        );
        expect(fs.readdirSync(outDir)).toEqual([]);
    });

    it("does not write anything when validation reports an error", async () => {
        const exporter = new StakeEngineExporter<string>("1.3.0");
        const invalidModes: StakeEngineExportModeInput[] = [{modeName: "base", cost: 0, library: baseLibrary}];

        const result = await exporter.exportToDirectory(invalidModes, outDir);

        expect(result.files).toEqual([]);
        expect(result.manifest).toBeUndefined();
        expect(result.issues.some((issue) => issue.severity === "error")).toBe(true);
        // outDir already exists (fs.mkdtempSync created it) — the point is that validation failing writes
        // nothing into it at all.
        expect(fs.readdirSync(outDir)).toEqual([]);
    });

    it("blocks export when two modeNames differ only in case (files would really conflict)", async () => {
        const exporter = new StakeEngineExporter<string>("1.3.0");
        const collidingModes: StakeEngineExportModeInput[] = [
            {modeName: "base", cost: 1, library: baseLibrary},
            {modeName: "BASE", cost: 2, library: buildStakeEngineTestLibrary({libraryId: "base-lib-2", betMode: "base", stake: 1})},
        ];

        const result = await exporter.exportToDirectory(collidingModes, outDir);

        expect(result.files).toEqual([]);
        expect(result.issues.some((issue) => issue.code === "stakeengine-mode-name-case-collision" && issue.severity === "error")).toBe(true);
        expect(fs.readdirSync(outDir)).toEqual([]);
    });

    it("blocks export when a custom events projector throws", async () => {
        const throwingProjector: StakeEngineRoundEventsProjecting<string> = {
            project: () => {
                throw new Error("custom projector exploded");
            },
        };
        const exporter = new StakeEngineExporter<string>("1.3.0", undefined, throwingProjector);

        const result = await exporter.exportToDirectory(modes, outDir);

        expect(result.files).toEqual([]);
        expect(result.manifest).toBeUndefined();
        expect(result.issues.some((issue) => issue.code === "stakeengine-outcome-events-invalid" && issue.severity === "error")).toBe(true);
        expect(fs.readdirSync(outDir)).toEqual([]);
    });

    it("blocks export when a custom events projector returns non-JSON-safe output (NaN)", async () => {
        const nanProjector: StakeEngineRoundEventsProjecting<string> = {
            project: () => [{index: 0, type: "bogus", value: Number.NaN} as unknown as StakeEngineEvent],
        };
        const exporter = new StakeEngineExporter<string>("1.3.0", undefined, nanProjector);

        const result = await exporter.exportToDirectory(modes, outDir);

        expect(result.files).toEqual([]);
        expect(result.manifest).toBeUndefined();
        expect(result.issues.some((issue) => issue.code === "stakeengine-outcome-events-not-json-safe" && issue.severity === "error")).toBe(true);
        expect(fs.readdirSync(outDir)).toEqual([]);
    });

    it("is safe to re-export into the same directory (recognizes its own pokie-manifest.json)", async () => {
        const exporter = new StakeEngineExporter<string>("1.3.0");

        await exporter.exportToDirectory(modes, outDir);
        const second = await exporter.exportToDirectory(modes, outDir);

        expect(second.issues).toEqual([]);
        expect(second.files.length).toBeGreaterThan(0);
    });

    it("removes a mode's CSV/books when a re-export no longer includes that mode", async () => {
        const exporter = new StakeEngineExporter<string>("1.3.0");
        await exporter.exportToDirectory(modes, outDir);
        expect(fs.existsSync(path.join(outDir, "lookup_bonus.csv"))).toBe(true);

        const result = await exporter.exportToDirectory([modes[0]], outDir);

        expect(result.issues).toEqual([]);
        expect(fs.existsSync(path.join(outDir, "lookup_bonus.csv"))).toBe(false);
        expect(fs.existsSync(path.join(outDir, "books_bonus.jsonl.zst"))).toBe(false);
        expect(new Set(fs.readdirSync(outDir))).toEqual(new Set(["lookup_base.csv", "books_base.jsonl.zst", "index.json", "pokie-manifest.json"]));

        const index = JSON.parse(fs.readFileSync(path.join(outDir, "index.json"), "utf-8")) as StakeEngineIndex;
        expect(index.modes.map((entry) => entry.name)).toEqual(["base"]);
    });

    it("preserves the whole existing directory, byte for byte, when a write fails partway through a re-export", async () => {
        const exporter = new StakeEngineExporter<string>("1.3.0");
        await exporter.exportToDirectory(modes, outDir);
        const filesBefore = fs.readdirSync(outDir).sort();
        const contentsBefore = new Map(filesBefore.map((name) => [name, fs.readFileSync(path.join(outDir, name))]));

        let callCount = 0;
        const failingWriteFile = (filePath: string, data: string | Buffer): void => {
            callCount++;
            if (callCount === 3) {
                throw new Error("simulated disk failure");
            }
            fs.writeFileSync(filePath, data);
        };
        const failingExporter = new StakeEngineExporter<string>("1.3.0", undefined, undefined, undefined, failingWriteFile);

        await expect(failingExporter.exportToDirectory(modes, outDir)).rejects.toThrow("simulated disk failure");

        expect(fs.readdirSync(outDir).sort()).toEqual(filesBefore);
        for (const name of filesBefore) {
            expect(fs.readFileSync(path.join(outDir, name))).toEqual(contentsBefore.get(name));
        }

        // No leftover ".tmp-*"/".stale-*" sibling directories either.
        const parentDir = path.dirname(outDir);
        const base = path.basename(outDir);
        const leftovers = fs.readdirSync(parentDir).filter((name) => name !== base && name.startsWith(`${base}.`));
        expect(leftovers).toEqual([]);
    });

    it("refuses to replace an existing non-empty directory that isn't recognized as its own prior output", async () => {
        fs.writeFileSync(path.join(outDir, "notes.txt"), "unrelated file");
        const exporter = new StakeEngineExporter<string>("1.3.0");

        await expect(exporter.exportToDirectory(modes, outDir)).rejects.toThrow(/was not generated by "pokie stakeengine export"/);

        expect(fs.readdirSync(outDir)).toEqual(["notes.txt"]);
    });
});
