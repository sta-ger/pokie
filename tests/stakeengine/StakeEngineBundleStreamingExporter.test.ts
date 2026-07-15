import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import {
    OutcomeLibraryBundleModeInput,
    OutcomeLibraryBundleReader,
    OutcomeLibraryBundleReading,
    OutcomeLibraryBundleWriter,
    StakeEngineBookLine,
    StakeEngineBundleModeInput,
    StakeEngineBundleStreamingExporter,
    StakeEngineExportModeInput,
    StakeEngineExporter,
    StakeEngineIndex,
    StakeEngineManifest,
    WeightedOutcomeLibrary,
    WinEvaluationResult,
    buildRoundArtifact,
    buildWeightedOutcomeLibrary,
    computeWeightedOutcomeLibraryHash,
} from "pokie";
import {buildStakeEngineTestLibrary, stakeEngineTestProvenance} from "./StakeEngineTestFixtures.js";

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

function siblingLeftovers(outDir: string): string[] {
    const parentDir = path.dirname(outDir);
    const base = path.basename(outDir);
    return fs.readdirSync(parentDir).filter((name) => name !== base && name.startsWith(`${base}.`));
}

function toBundleModeInput(modeName: string, library: WeightedOutcomeLibrary<string>): OutcomeLibraryBundleModeInput<string> {
    return {modeName, libraryId: library.libraryId, schemaVersion: library.schemaVersion, outcomes: library.outcomes};
}

describe("StakeEngineBundleStreamingExporter", () => {
    let outDir: string;
    let bundleDir: string;
    let baseLibrary: WeightedOutcomeLibrary<string>;
    let bonusLibrary: WeightedOutcomeLibrary<string>;
    let bundleModes: StakeEngineBundleModeInput[];

    beforeEach(async () => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-stakeengine-bundle-exporter-test-"));
        bundleDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-stakeengine-bundle-exporter-bundle-"));
        baseLibrary = buildStakeEngineTestLibrary({libraryId: "base-lib", betMode: "base", stake: 1});
        bonusLibrary = buildStakeEngineTestLibrary({libraryId: "bonus-lib", betMode: "freeGames", stake: 100});

        await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory(
            [toBundleModeInput("base", baseLibrary), toBundleModeInput("bonus", bonusLibrary)],
            bundleDir,
        );

        bundleModes = [
            {modeName: "base", cost: 1, bundleDir, bundleModeName: "base"},
            {modeName: "bonus", cost: 100, bundleDir, bundleModeName: "bonus"},
        ];
    });

    afterEach(() => {
        fs.rmSync(outDir, {recursive: true, force: true});
        fs.rmSync(bundleDir, {recursive: true, force: true});
        for (const name of siblingLeftovers(outDir)) {
            fs.rmSync(path.join(path.dirname(outDir), name), {recursive: true, force: true});
        }
    });

    it("produces index.json/CSV/books content identical to StakeEngineExporter exporting the same libraries directly", async () => {
        const bundleExporter = new StakeEngineBundleStreamingExporter<string>("1.3.0");
        const outDirFromBundle = path.join(outDir, "from-bundle");
        const outDirFromLibrary = path.join(outDir, "from-library");

        const bundleResult = await bundleExporter.exportToDirectory(bundleModes, outDirFromBundle);

        const libraryModes: StakeEngineExportModeInput[] = [
            {modeName: "base", cost: 1, library: baseLibrary},
            {modeName: "bonus", cost: 100, library: bonusLibrary},
        ];
        const libraryResult = await new StakeEngineExporter<string>("1.3.0").exportToDirectory(libraryModes, outDirFromLibrary);

        expect(bundleResult.issues).toEqual([]);
        expect(libraryResult.issues).toEqual([]);
        expect(new Set(bundleResult.files)).toEqual(new Set(libraryResult.files));

        const bundleIndex = JSON.parse(fs.readFileSync(path.join(outDirFromBundle, "index.json"), "utf-8")) as StakeEngineIndex;
        const libraryIndex = JSON.parse(fs.readFileSync(path.join(outDirFromLibrary, "index.json"), "utf-8")) as StakeEngineIndex;
        expect(bundleIndex).toEqual(libraryIndex);

        const bundleManifest = JSON.parse(fs.readFileSync(path.join(outDirFromBundle, "pokie-manifest.json"), "utf-8")) as StakeEngineManifest;
        const libraryManifest = JSON.parse(fs.readFileSync(path.join(outDirFromLibrary, "pokie-manifest.json"), "utf-8")) as StakeEngineManifest;
        // generatedAt legitimately differs (two separate runs) — everything else, including every mode's own
        // libraryHash/libraryId/outcomeCount, must agree exactly.
        expect(bundleManifest.modes).toEqual(libraryManifest.modes);
        expect(bundleManifest.modes.find((entry) => entry.name === "base")?.libraryHash).toBe(computeWeightedOutcomeLibraryHash(baseLibrary));

        for (const modeName of ["base", "bonus"]) {
            const bundleCsv = readCsvRows(path.join(outDirFromBundle, `lookup_${modeName}.csv`));
            const libraryCsv = readCsvRows(path.join(outDirFromLibrary, `lookup_${modeName}.csv`));
            expect(bundleCsv).toEqual(libraryCsv);

            const bundleBooks = readBookLines(path.join(outDirFromBundle, `books_${modeName}.jsonl.zst`));
            const libraryBooks = readBookLines(path.join(outDirFromLibrary, `books_${modeName}.jsonl.zst`));
            expect(bundleBooks).toEqual(libraryBooks);
        }
    });

    // The whole point of this class: stream a mode's outcomes directly from the bundle without ever
    // materializing a full WeightedOutcomeLibrary. A reader stub that fails the test the instant readLibrary()
    // is invoked makes this guarantee impossible to accidentally weaken without a test noticing.
    it("never calls readLibrary() while exporting", async () => {
        const realReader = new OutcomeLibraryBundleReader<string>();
        const readLibrary = jest.fn(() => {
            throw new Error("readLibrary() should never be called by StakeEngineBundleStreamingExporter");
        });
        const spyingReader: OutcomeLibraryBundleReading<string> = {
            readManifest: (dir) => realReader.readManifest(dir),
            readModeIndex: (dir, modeName) => realReader.readModeIndex(dir, modeName),
            iterateModeOutcomes: (dir, modeName) => realReader.iterateModeOutcomes(dir, modeName),
            readOutcomeById: (dir, modeName, id) => realReader.readOutcomeById(dir, modeName, id),
            drawOutcome: (dir, modeName, randomSource) => realReader.drawOutcome(dir, modeName, randomSource),
            readLibrary,
        };
        const exporter = new StakeEngineBundleStreamingExporter<string>("1.3.0", undefined, spyingReader);

        const result = await exporter.exportToDirectory(bundleModes, outDir);

        expect(result.issues).toEqual([]);
        expect(readLibrary).not.toHaveBeenCalled();
    });

    it("reports stakeengine-mode-name-case-collision and writes nothing for modeNames differing only in case", async () => {
        const exporter = new StakeEngineBundleStreamingExporter<string>("1.3.0");
        const colliding: StakeEngineBundleModeInput[] = [
            {modeName: "base", cost: 1, bundleDir, bundleModeName: "base"},
            {modeName: "BASE", cost: 2, bundleDir, bundleModeName: "bonus"},
        ];

        const result = await exporter.exportToDirectory(colliding, outDir);

        expect(result.files).toEqual([]);
        expect(result.issues.some((issue) => issue.code === "stakeengine-mode-name-case-collision" && issue.severity === "error")).toBe(true);
        expect(fs.readdirSync(outDir)).toEqual([]);
    });

    it("reports stakeengine-mode-cost-invalid and writes nothing for a non-positive cost", async () => {
        const exporter = new StakeEngineBundleStreamingExporter<string>("1.3.0");
        const invalid: StakeEngineBundleModeInput[] = [{modeName: "base", cost: 0, bundleDir, bundleModeName: "base"}];

        const result = await exporter.exportToDirectory(invalid, outDir);

        expect(result.files).toEqual([]);
        expect(result.issues.some((issue) => issue.code === "stakeengine-mode-cost-invalid" && issue.severity === "error")).toBe(true);
        expect(fs.readdirSync(outDir)).toEqual([]);
    });

    it("reports stakeengine-cross-mode-provenance-mismatch and writes nothing when two modes come from different games", async () => {
        const otherGameBundleDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-stakeengine-bundle-exporter-othergame-"));
        try {
            const otherGameLibrary = buildWeightedOutcomeLibrary({
                libraryId: "other-game-lib",
                outcomes: [
                    {
                        id: "0",
                        weight: 1,
                        artifact: buildRoundArtifact({
                            roundId: "other-game-lib-0",
                            provenance: {...stakeEngineTestProvenance, game: {...stakeEngineTestProvenance.game, id: "other-game"}},
                            betMode: "base",
                            stake: 1,
                            steps: [{screen: [["A"]], winEvaluationResult: new WinEvaluationResult<string>()}],
                        }),
                    },
                ],
            });
            await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([toBundleModeInput("base", otherGameLibrary)], otherGameBundleDir);

            const exporter = new StakeEngineBundleStreamingExporter<string>("1.3.0");
            const mismatched: StakeEngineBundleModeInput[] = [
                {modeName: "base", cost: 1, bundleDir, bundleModeName: "base"},
                {modeName: "other", cost: 1, bundleDir: otherGameBundleDir, bundleModeName: "base"},
            ];

            const result = await exporter.exportToDirectory(mismatched, outDir);

            expect(result.files).toEqual([]);
            expect(result.issues.some((issue) => issue.code === "stakeengine-cross-mode-provenance-mismatch" && issue.severity === "error")).toBe(true);
            expect(fs.readdirSync(outDir)).toEqual([]);
        } finally {
            fs.rmSync(otherGameBundleDir, {recursive: true, force: true});
        }
    });

    it("leaves no temp/stale/staging sibling directories behind after a successful export", async () => {
        const exporter = new StakeEngineBundleStreamingExporter<string>("1.3.0");

        await exporter.exportToDirectory(bundleModes, outDir);
        expect(siblingLeftovers(outDir)).toEqual([]);

        await exporter.exportToDirectory([bundleModes[0]], outDir);
        expect(siblingLeftovers(outDir)).toEqual([]);
        expect(fs.existsSync(path.join(outDir, "lookup_bonus.csv"))).toBe(false);
    });
});
