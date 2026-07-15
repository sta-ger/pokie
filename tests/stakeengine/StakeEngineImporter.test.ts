import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import {
    RoundArtifactValidator,
    StakeEngineExportModeInput,
    StakeEngineExporter,
    StakeEngineImporter,
    StakeEngineManifest,
    WeightedOutcomeLibrary,
} from "pokie";
import {buildSingleOutcomeStakeEngineLibrary, buildStakeEngineTestLibrary} from "./StakeEngineTestFixtures.js";

function readBooksLines(filePath: string): {id: number; events: unknown[]; payoutMultiplier: number}[] {
    return zlib
        .zstdDecompressSync(fs.readFileSync(filePath))
        .toString("utf-8")
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line));
}

function writeBooksLines(filePath: string, lines: readonly unknown[]): void {
    const jsonl = lines.map((line) => JSON.stringify(line)).join("\n") + "\n";
    fs.writeFileSync(filePath, zlib.zstdCompressSync(Buffer.from(jsonl, "utf-8")));
}

describe("StakeEngineImporter", () => {
    let outDir: string;
    let importedOutDir: string;

    beforeEach(() => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-stakeengine-import-test-"));
        importedOutDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-stakeengine-import-test-reexport-"));
    });

    afterEach(() => {
        fs.rmSync(outDir, {recursive: true, force: true});
        fs.rmSync(importedOutDir, {recursive: true, force: true});
    });

    it("reconstructs everything that's lossless (ids/weights/payoutMultiplier/betMode/stake/provenance/libraryId), and re-exporting reproduces byte-identical Stake output", async () => {
        const baseLibrary = buildStakeEngineTestLibrary({libraryId: "base-lib", betMode: "base", stake: 1});
        const bonusLibrary = buildStakeEngineTestLibrary({libraryId: "bonus-lib", betMode: "freeGames", stake: 100});
        const modes: StakeEngineExportModeInput[] = [
            {modeName: "base", cost: 1, library: baseLibrary},
            {modeName: "bonus", cost: 100, library: bonusLibrary},
        ];

        const exporter = new StakeEngineExporter("1.3.0");
        await exporter.exportToDirectory(modes, outDir);

        const importer = new StakeEngineImporter();
        const importResult = await importer.importFromDirectory(outDir);

        expect(importResult.issues.some((issue) => issue.severity === "error")).toBe(false);
        expect(importResult.modes.length).toBe(2);

        const librariesByMode = new Map([
            ["base", baseLibrary],
            ["bonus", bonusLibrary],
        ]);

        for (const importedMode of importResult.modes) {
            const originalLibrary = librariesByMode.get(importedMode.modeName) as WeightedOutcomeLibrary<string>;
            const originalModeInput = modes.find((mode) => mode.modeName === importedMode.modeName) as StakeEngineExportModeInput;

            expect(importedMode.cost).toBe(originalModeInput.cost);
            expect(importedMode.library.libraryId).toBe(originalLibrary.libraryId);
            expect(importedMode.library.outcomes.length).toBe(originalLibrary.outcomes.length);

            importedMode.library.outcomes.forEach((importedOutcome, position) => {
                const originalOutcome = originalLibrary.outcomes[position];
                expect(importedOutcome.id).toBe(originalOutcome.id);
                expect(importedOutcome.weight).toBe(originalOutcome.weight);
                expect(importedOutcome.artifact.payoutMultiplier).toBe(originalOutcome.artifact.payoutMultiplier);
                expect(importedOutcome.artifact.totalWin).toBe(originalOutcome.artifact.totalWin);
                expect(importedOutcome.artifact.betMode).toBe(originalOutcome.artifact.betMode);
                expect(importedOutcome.artifact.stake).toBe(originalOutcome.artifact.stake);
                expect(importedOutcome.artifact.provenance.game).toEqual(originalOutcome.artifact.provenance.game);
                expect(importedOutcome.artifact.provenance.configHash).toEqual(originalOutcome.artifact.provenance.configHash);
                // provenance.pokieVersion is substituted with the manifest's own pokieVersion (the tool that ran
                // the export), not asserted equal to the original artifact's own recorded pokieVersion — see
                // docs/stake-engine-import.md's "lossy vs lossless" section.
                expect(importedOutcome.artifact.provenance.pokieVersion).toBe(importResult.manifest?.pokieVersion);

                // roundId and wins are NOT expected to match — genuinely unrecoverable, disclosed substitutes.
                expect(importedOutcome.id).not.toBe(originalOutcome.artifact.roundId);
                expect(importedOutcome.artifact.roundId).not.toBe(originalOutcome.artifact.roundId);

                // But the reconstructed artifact is still a fully valid RoundArtifact.
                expect(new RoundArtifactValidator().validate(importedOutcome.artifact)).toEqual([]);
            });
        }

        // The real round-trip property: import, then re-export, reproduces byte-identical Stake output.
        const reExporter = new StakeEngineExporter("1.3.0");
        await reExporter.exportToDirectory(importResult.modes, importedOutDir);

        expect(fs.readFileSync(path.join(outDir, "index.json"), "utf-8")).toBe(fs.readFileSync(path.join(importedOutDir, "index.json"), "utf-8"));
        for (const modeName of ["base", "bonus"]) {
            expect(fs.readFileSync(path.join(outDir, `lookup_${modeName}.csv`), "utf-8")).toBe(
                fs.readFileSync(path.join(importedOutDir, `lookup_${modeName}.csv`), "utf-8"),
            );
            const originalBooks = zlib.zstdDecompressSync(fs.readFileSync(path.join(outDir, `books_${modeName}.jsonl.zst`))).toString("utf-8");
            const reExportedBooks = zlib.zstdDecompressSync(fs.readFileSync(path.join(importedOutDir, `books_${modeName}.jsonl.zst`))).toString("utf-8");
            expect(reExportedBooks).toBe(originalBooks);
        }

        // Every field matches except "generatedAt" (a fresh timestamp) and each mode's "libraryHash" — the
        // reconstructed library legitimately hashes differently (roundId/wins/provenance.pokieVersion are
        // substituted, not reproduced) even though everything Stake actually cares about round-trips exactly.
        const originalManifest = JSON.parse(fs.readFileSync(path.join(outDir, "pokie-manifest.json"), "utf-8")) as StakeEngineManifest;
        const reExportedManifest = JSON.parse(fs.readFileSync(path.join(importedOutDir, "pokie-manifest.json"), "utf-8")) as StakeEngineManifest;
        const stripVolatileFields = (manifest: StakeEngineManifest) => ({
            ...manifest,
            generatedAt: undefined,
            modes: manifest.modes.map((mode) => ({...mode, libraryHash: undefined})),
        });
        expect(stripVolatileFields(reExportedManifest)).toEqual(stripVolatileFields(originalManifest));
    });

    it("computes sourceProvenance as the exact SHA-256 of every raw file it read, before any parsing/decompression", async () => {
        const library = buildSingleOutcomeStakeEngineLibrary({libraryId: "provenance-lib", betMode: "base", stake: 1, totalWin: 5});
        const modes: StakeEngineExportModeInput[] = [{modeName: "base", cost: 1, library}];
        await new StakeEngineExporter("1.3.0").exportToDirectory(modes, outDir);

        const result = await new StakeEngineImporter().importFromDirectory(outDir);

        expect(result.issues.some((issue) => issue.severity === "error")).toBe(false);
        const hashOf = (filePath: string) => `sha256:${crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")}`;

        expect(result.sourceProvenance?.indexHash).toBe(hashOf(path.join(outDir, "index.json")));
        expect(result.sourceProvenance?.manifestHash).toBe(hashOf(path.join(outDir, "pokie-manifest.json")));
        expect(result.sourceProvenance?.modes).toEqual([
            {
                modeName: "base",
                csvHash: hashOf(path.join(outDir, "lookup_base.csv")),
                booksHash: hashOf(path.join(outDir, "books_base.jsonl.zst")),
            },
        ]);
    });

    it("round-trips a POKIE 0.1x payoutMultiplier at cost 1 (0.1x -> 10 Stake units and back)", async () => {
        const library = buildSingleOutcomeStakeEngineLibrary({libraryId: "tenth-lib", betMode: "base", stake: 1, totalWin: 0.1});
        const modes: StakeEngineExportModeInput[] = [{modeName: "base", cost: 1, library}];

        await new StakeEngineExporter("1.3.0").exportToDirectory(modes, outDir);
        const importResult = await new StakeEngineImporter().importFromDirectory(outDir);

        expect(importResult.issues.some((issue) => issue.severity === "error")).toBe(false);
        expect(importResult.modes[0].library.outcomes[0].artifact.payoutMultiplier).toBe(0.1);
    });

    it("round-trips a POKIE 1.2x payoutMultiplier at cost 100 (1.2x -> 12000 Stake units and back)", async () => {
        const library = buildSingleOutcomeStakeEngineLibrary({libraryId: "twelve-lib", betMode: "bonus", stake: 1, totalWin: 1.2});
        const modes: StakeEngineExportModeInput[] = [{modeName: "bonus", cost: 100, library}];

        await new StakeEngineExporter("1.3.0").exportToDirectory(modes, outDir);
        const importResult = await new StakeEngineImporter().importFromDirectory(outDir);

        expect(importResult.issues.some((issue) => issue.severity === "error")).toBe(false);
        expect(importResult.modes[0].library.outcomes[0].artifact.payoutMultiplier).toBe(1.2);
    });

    describe("tampered directories", () => {
        async function exportSingleOutcome(cost: number, totalWin: number): Promise<void> {
            const library = buildSingleOutcomeStakeEngineLibrary({libraryId: "tamper-lib", betMode: "base", stake: 1, totalWin});
            const modes: StakeEngineExportModeInput[] = [{modeName: "base", cost, library}];
            await new StakeEngineExporter("1.3.0").exportToDirectory(modes, outDir);
        }

        it("reports stakeengine-import-manifest-missing when pokie-manifest.json is removed", async () => {
            await exportSingleOutcome(1, 5);
            fs.rmSync(path.join(outDir, "pokie-manifest.json"));

            const result = await new StakeEngineImporter().importFromDirectory(outDir);

            expect(result.issues.some((issue) => issue.code === "stakeengine-import-manifest-missing")).toBe(true);
            expect(result.modes).toEqual([]);
        });

        it("reports stakeengine-import-csv-books-payout-multiplier-mismatch when the CSV is hand-edited to disagree with books", async () => {
            await exportSingleOutcome(1, 5);
            const csvPath = path.join(outDir, "lookup_base.csv");
            fs.writeFileSync(csvPath, fs.readFileSync(csvPath, "utf-8").replace(/,\d+$/m, ",999"));

            const result = await new StakeEngineImporter().importFromDirectory(outDir);

            expect(result.issues.some((issue) => issue.code === "stakeengine-import-csv-books-payout-multiplier-mismatch")).toBe(true);
            expect(result.modes).toEqual([]);
        });

        it("reports stakeengine-import-events-missing-reveal when a books line's reveal event is retyped", async () => {
            await exportSingleOutcome(1, 5);
            const booksPath = path.join(outDir, "books_base.jsonl.zst");
            const lines = readBooksLines(booksPath);
            (lines[0].events[0] as {type: string}).type = "notReveal";
            writeBooksLines(booksPath, lines);

            const result = await new StakeEngineImporter().importFromDirectory(outDir);

            expect(result.issues.some((issue) => issue.code === "stakeengine-import-events-missing-reveal")).toBe(true);
            expect(result.modes).toEqual([]);
        });

        it("reports stakeengine-import-mode-missing-in-manifest when a mode in index.json is renamed", async () => {
            await exportSingleOutcome(1, 5);
            const indexPath = path.join(outDir, "index.json");
            fs.writeFileSync(indexPath, fs.readFileSync(indexPath, "utf-8").replace('"base"', '"renamed"'));

            const result = await new StakeEngineImporter().importFromDirectory(outDir);

            expect(result.issues.some((issue) => issue.code === "stakeengine-import-mode-missing-in-manifest")).toBe(true);
            expect(result.modes).toEqual([]);
        });

        it("reports stakeengine-import-payout-multiplier-not-invertible when a finalWin value can't be reversed without hidden rounding", async () => {
            await exportSingleOutcome(3, 0);
            const booksPath = path.join(outDir, "books_base.jsonl.zst");
            const lines = readBooksLines(booksPath);
            const finalWin = lines[0].events[lines[0].events.length - 1] as {amount: number; payoutMultiplier: number};
            finalWin.amount = 1;
            finalWin.payoutMultiplier = 1;
            lines[0].payoutMultiplier = 1;
            writeBooksLines(booksPath, lines);
            const csvPath = path.join(outDir, "lookup_base.csv");
            fs.writeFileSync(csvPath, fs.readFileSync(csvPath, "utf-8").replace(/,\d+$/m, ",1"));

            const result = await new StakeEngineImporter().importFromDirectory(outDir);

            expect(result.issues.some((issue) => issue.code === "stakeengine-import-payout-multiplier-not-invertible")).toBe(true);
            expect(result.modes).toEqual([]);
        });

        it("reports stakeengine-import-books-invalid-zstd when the books file is corrupted (not valid zstd)", async () => {
            await exportSingleOutcome(1, 5);
            const booksPath = path.join(outDir, "books_base.jsonl.zst");
            fs.writeFileSync(booksPath, Buffer.from("this is not a zstd frame at all"));

            const result = await new StakeEngineImporter().importFromDirectory(outDir);

            expect(result.issues.some((issue) => issue.code === "stakeengine-import-books-invalid-zstd")).toBe(true);
            expect(result.modes).toEqual([]);
        });

        it("reports stakeengine-import-books-invalid-json-line when a books line isn't valid JSON at all", async () => {
            await exportSingleOutcome(1, 5);
            const booksPath = path.join(outDir, "books_base.jsonl.zst");
            const jsonl = "{not valid json at all}\n";
            fs.writeFileSync(booksPath, zlib.zstdCompressSync(Buffer.from(jsonl, "utf-8")));

            const result = await new StakeEngineImporter().importFromDirectory(outDir);

            expect(result.issues.some((issue) => issue.code === "stakeengine-import-books-invalid-json-line")).toBe(true);
            expect(result.modes).toEqual([]);
        });

        it("reports stakeengine-import-mode-filename-unsafe when index.json's weights field is a path-traversal attempt, and never reads outside stakeDir", async () => {
            await exportSingleOutcome(1, 5);
            const outsideFile = path.join(path.dirname(outDir), "outside-secret.csv");
            fs.writeFileSync(outsideFile, "should never be read");
            const indexPath = path.join(outDir, "index.json");
            fs.writeFileSync(
                indexPath,
                fs.readFileSync(indexPath, "utf-8").replace('"lookup_base.csv"', JSON.stringify(`../${path.basename(outsideFile)}`)),
            );

            const result = await new StakeEngineImporter().importFromDirectory(outDir);

            expect(result.issues.some((issue) => issue.code === "stakeengine-import-mode-filename-unsafe")).toBe(true);
            expect(result.modes).toEqual([]);
            fs.rmSync(outsideFile, {force: true});
        });

        it("reports stakeengine-import-duplicate-csv-id when the lookup CSV has the same id twice", async () => {
            await exportSingleOutcome(1, 5);
            const csvPath = path.join(outDir, "lookup_base.csv");
            const originalRow = fs.readFileSync(csvPath, "utf-8").trim();
            fs.writeFileSync(csvPath, `${originalRow}\n${originalRow}\n`);

            const result = await new StakeEngineImporter().importFromDirectory(outDir);

            expect(result.issues.some((issue) => issue.code === "stakeengine-import-duplicate-csv-id")).toBe(true);
            expect(result.modes).toEqual([]);
        });
    });
});
