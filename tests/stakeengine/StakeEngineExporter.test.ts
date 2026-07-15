import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import {
    StakeEngineBookLine,
    StakeEngineExportModeInput,
    StakeEngineExporter,
    StakeEngineIndex,
    StakeEngineManifest,
    StakeEngineRoundEventsProjector,
    WeightedOutcomeLibrary,
    computeWeightedOutcomeLibraryHash,
} from "pokie";
import {buildStakeEngineTestLibrary} from "./StakeEngineTestFixtures.js";

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

describe("StakeEngineExporter round trip", () => {
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
    });

    it("writes index.json, per-mode lookup CSVs, per-mode zstd books, and pokie-manifest.json that all round-trip exactly", async () => {
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

        for (const [modeName, library] of [
            ["base", baseLibrary],
            ["bonus", bonusLibrary],
        ] as const) {
            const csvRows = readCsvRows(path.join(outDir, `lookup_${modeName}.csv`));
            const bookLines = readBookLines(path.join(outDir, `books_${modeName}.jsonl.zst`));

            expect(csvRows.length).toBe(library.outcomes.length);
            expect(bookLines.length).toBe(library.outcomes.length);

            library.outcomes.forEach((outcome, position) => {
                const expectedId = Number(outcome.id);
                expect(csvRows[position]).toBe(`${expectedId},${outcome.weight},${outcome.artifact.payoutMultiplier}`);

                const bookLine = bookLines[position];
                expect(bookLine.id).toBe(expectedId);
                expect(bookLine.payoutMultiplier).toBe(outcome.artifact.payoutMultiplier);
                expect(bookLine.events).toEqual(eventsProjector.project(outcome.artifact));

                // CSV third column must exactly match the book line's payoutMultiplier for the same outcome.
                expect(csvRows[position].split(",")[2]).toBe(String(bookLine.payoutMultiplier));
            });
        }
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

    it("is safe to re-export into the same directory (recognizes its own pokie-manifest.json)", async () => {
        const exporter = new StakeEngineExporter<string>("1.3.0");

        await exporter.exportToDirectory(modes, outDir);
        const second = await exporter.exportToDirectory(modes, outDir);

        expect(second.issues).toEqual([]);
        expect(second.files.length).toBeGreaterThan(0);
    });

    it("refuses to export into a directory containing a file it's about to write that it did not itself generate", async () => {
        // A stray file that merely coexists (e.g. "notes.txt") isn't a conflict — only a name this export is
        // actually about to write, and isn't recognized as its own prior output, is.
        fs.writeFileSync(path.join(outDir, "index.json"), "not ours");
        const exporter = new StakeEngineExporter<string>("1.3.0");

        await expect(exporter.exportToDirectory(modes, outDir)).rejects.toThrow(/did not generate/);

        expect(fs.readFileSync(path.join(outDir, "index.json"), "utf-8")).toBe("not ours");
        expect(fs.readdirSync(outDir)).toEqual(["index.json"]);
    });
});
