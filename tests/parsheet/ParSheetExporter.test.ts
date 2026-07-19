import ExcelJS from "exceljs";
import fs from "fs";
import os from "os";
import path from "path";
import {GameBlueprint} from "../../src/generated/GameBlueprint.js";
import {ParSheetExporter} from "../../src/parsheet/ParSheetExporter.js";

describe("ParSheetExporter", () => {
    let dir: string;
    let filePath: string;

    const blueprint: GameBlueprint = {
        manifest: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
        reels: 2,
        rows: 2,
        symbols: ["A", "W"],
        wilds: ["W"],
        paytable: {A: {"2": 5}},
        paylines: [
            [0, 0],
            [1, 1],
        ],
        reelStrips: [
            ["A", "W"],
            ["W", "A"],
        ],
        availableBets: [1, 2],
    };

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-parsheet-export-test-"));
        filePath = path.join(dir, "out.par.xlsx");
    });

    afterEach(() => {
        fs.rmSync(dir, {recursive: true, force: true});
    });

    async function readSheetNames(): Promise<string[]> {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        return workbook.worksheets.map((worksheet) => worksheet.name);
    }

    it("writes every sheet, with no error-level issues, for a fully-populated blueprint", async () => {
        const exporter = new ParSheetExporter("1.3.0");

        const issues = await exporter.exportToFile(blueprint, filePath, "config.json");

        // exportToFile runs the same GameBlueprintValidator "pokie build" uses (see requirement that
        // it validates fully on its own) — this fixture blueprint isn't tuned to be warning-free (see
        // examples/parsheets/starter.blueprint.json, which isn't either), just error-free.
        expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
        expect(await readSheetNames()).toEqual(["Manifest", "Symbols", "Paytable", "ReelStrips", "Paylines", "AvailableBets", "Meta"]);
    });

    it("also writes WinModel/Mechanics/BetModes when the blueprint has them", async () => {
        const exporter = new ParSheetExporter("1.3.0");
        const withNewFields: GameBlueprint = {
            ...blueprint,
            symbols: ["A", "W", "S"],
            scatters: ["S"],
            reelStrips: [
                ["A", "W", "S"],
                ["W", "A", "S"],
            ],
            winModel: {type: "clusters", minimumClusterSize: 5},
            mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {"3": 8, "4": 15}}},
            betModes: [
                {id: "base", label: "Base Game"},
                {id: "buy-bonus", label: "Buy Bonus", costMultiplier: 100},
            ],
        };

        const issues = await exporter.exportToFile(withNewFields, filePath, "config.json");

        expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
        expect(await readSheetNames()).toEqual([
            "Manifest",
            "Symbols",
            "Paytable",
            "ReelStrips",
            "Paylines",
            "AvailableBets",
            "WinModel",
            "Mechanics",
            "BetModes",
            "Meta",
        ]);
    });

    it("omits the WinModel/Mechanics/BetModes sheets when the blueprint omits those optional fields", async () => {
        const exporter = new ParSheetExporter("1.3.0");

        await exporter.exportToFile(blueprint, filePath);

        const names = await readSheetNames();
        expect(names).not.toContain("WinModel");
        expect(names).not.toContain("Mechanics");
        expect(names).not.toContain("BetModes");
    });

    it("runs GameBlueprintValidator itself and rejects an invalid blueprint without writing anything", async () => {
        const exporter = new ParSheetExporter("1.3.0");
        const invalid = {...blueprint, symbols: []}; // "symbols" must be a non-empty array

        const issues = await exporter.exportToFile(invalid, filePath);

        expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({code: "blueprint-symbols-invalid", severity: "error"})]));
        expect(fs.existsSync(filePath)).toBe(false);
    });

    describe("preflight (no partial writes)", () => {
        it("creates no file at all and reports an error when the blueprint has no literal reelStrips", async () => {
            const exporter = new ParSheetExporter("1.3.0");
            const withoutReelStrips: GameBlueprint = {...blueprint};
            Reflect.deleteProperty(withoutReelStrips, "reelStrips");

            const issues = await exporter.exportToFile(withoutReelStrips, filePath);

            expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({code: "parsheet-missing-reel-strips", severity: "error"})]));
            expect(fs.existsSync(filePath)).toBe(false);
        });

        it("leaves an existing file at filePath completely untouched when export fails", async () => {
            const exporter = new ParSheetExporter("1.3.0");
            const withoutReelStrips: GameBlueprint = {...blueprint};
            Reflect.deleteProperty(withoutReelStrips, "reelStrips");
            const sentinelContent = "not a real xlsx file — a stand-in for whatever was already there";
            fs.writeFileSync(filePath, sentinelContent);

            const issues = await exporter.exportToFile(withoutReelStrips, filePath);

            expect(issues.some((issue) => issue.severity === "error")).toBe(true);
            expect(fs.readFileSync(filePath, "utf-8")).toBe(sentinelContent);
        });

        it("creates no file and reports an error when the blueprint uses reelStripGeneration instead of a literal reelStrips", async () => {
            const exporter = new ParSheetExporter("1.3.0");
            const withGeneration: GameBlueprint = {...blueprint};
            Reflect.deleteProperty(withGeneration, "reelStrips");
            withGeneration.reelStripGeneration = [
                {type: "literal", strip: ["A", "W"]},
                {type: "literal", strip: ["W", "A"]},
            ];

            const issues = await exporter.exportToFile(withGeneration, filePath);

            expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({code: "parsheet-unsupported-reel-source", severity: "error"})]));
            expect(fs.existsSync(filePath)).toBe(false);
        });

        // GameBlueprintValidator itself already rejects reelStrips + reelStripGeneration together as
        // mutually exclusive (blueprint-reelstrips-and-generation, an error) — so that combination
        // never even reaches ParSheetExporter's own reel-source check. Still: no file is written.
        it("creates no file when the blueprint has both reelStrips and reelStripGeneration (GameBlueprintValidator rejects that combination first)", async () => {
            const exporter = new ParSheetExporter("1.3.0");
            const withBoth: GameBlueprint = {
                ...blueprint,
                reelStripGeneration: [
                    {type: "literal", strip: ["A", "W"]},
                    {type: "literal", strip: ["W", "A"]},
                ],
            };

            const issues = await exporter.exportToFile(withBoth, filePath);

            expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({code: "blueprint-reelstrips-and-generation", severity: "error"})]));
            expect(fs.existsSync(filePath)).toBe(false);
        });

        it("creates no file and reports an error when the blueprint uses symbolWeights instead of a literal reelStrips", async () => {
            const exporter = new ParSheetExporter("1.3.0");
            const withWeights: GameBlueprint = {...blueprint, symbolWeights: {A: 5, W: 1}};
            Reflect.deleteProperty(withWeights, "reelStrips");

            const issues = await exporter.exportToFile(withWeights, filePath);

            expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({code: "parsheet-unsupported-reel-source", severity: "error"})]));
            expect(fs.existsSync(filePath)).toBe(false);
        });

        // Unlike reelStripGeneration, GameBlueprintValidator only *warns* about reelStrips +
        // symbolWeights together (blueprint-reelstrips-and-weights) — so this combination does reach
        // ParSheetExporter's own check, which still forbids it (exporting only reelStrips would
        // silently drop the weighting data).
        it("creates no file and reports an error when the blueprint has both reelStrips and symbolWeights", async () => {
            const exporter = new ParSheetExporter("1.3.0");
            const withBoth: GameBlueprint = {...blueprint, symbolWeights: {A: 5, W: 1}};

            const issues = await exporter.exportToFile(withBoth, filePath);

            expect(issues).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        code: "parsheet-unsupported-reel-source",
                        severity: "error",
                        details: expect.objectContaining({symbolWeights: true, reelStrips: true}),
                    }),
                ]),
            );
            expect(fs.existsSync(filePath)).toBe(false);
        });
    });

    it("omits the Paylines/AvailableBets sheets when the blueprint omits those optional fields", async () => {
        const exporter = new ParSheetExporter("1.3.0");
        const minimal: GameBlueprint = {...blueprint};
        Reflect.deleteProperty(minimal, "paylines");
        Reflect.deleteProperty(minimal, "availableBets");

        await exporter.exportToFile(minimal, filePath);

        const names = await readSheetNames();
        expect(names).not.toContain("Paylines");
        expect(names).not.toContain("AvailableBets");
    });

    it("writes the blueprint's manifest fields into the Manifest sheet", async () => {
        const exporter = new ParSheetExporter("1.3.0");

        await exporter.exportToFile(blueprint, filePath);

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        const manifestSheet = workbook.getWorksheet("Manifest")!;
        expect(manifestSheet.getRow(2).getCell(2).value).toBe("crazy-fruits");
        expect(manifestSheet.getRow(3).getCell(2).value).toBe("Crazy Fruits");
    });

    describe("write failure (real atomic writer, past preflight)", () => {
        it("propagates the error and leaves an existing target untouched when the underlying write fails", async () => {
            // A file can never be renamed onto an existing directory (EISDIR/ENOTEMPTY on every
            // platform, regardless of user privileges) — a reliable way to force the real write path
            // to fail *after* a fully valid blueprint has already passed every preflight check.
            fs.mkdirSync(filePath);
            fs.writeFileSync(path.join(filePath, "sentinel.txt"), "still here");
            const exporter = new ParSheetExporter("1.3.0");

            await expect(exporter.exportToFile(blueprint, filePath)).rejects.toThrow();

            expect(fs.statSync(filePath).isDirectory()).toBe(true);
            expect(fs.readFileSync(path.join(filePath, "sentinel.txt"), "utf-8")).toBe("still here");
            expect(fs.readdirSync(dir).filter((name) => name.includes(".tmp-"))).toEqual([]);
        });
    });
});
