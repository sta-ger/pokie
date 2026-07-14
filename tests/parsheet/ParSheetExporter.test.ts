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

    it("writes every sheet, with no issues, for a fully-populated blueprint", async () => {
        const exporter = new ParSheetExporter("1.3.0");

        const issues = await exporter.exportToFile(blueprint, filePath, "config.json");

        expect(issues).toEqual([]);
        expect(await readSheetNames()).toEqual(["Manifest", "Symbols", "Paytable", "ReelStrips", "Paylines", "AvailableBets", "Meta"]);
    });

    describe("preflight (no partial writes)", () => {
        it("creates no file at all and reports an error when the blueprint has no literal reelStrips", async () => {
            const exporter = new ParSheetExporter("1.3.0");
            const withoutReelStrips: GameBlueprint = {...blueprint};
            Reflect.deleteProperty(withoutReelStrips, "reelStrips");

            const issues = await exporter.exportToFile(withoutReelStrips, filePath);

            expect(issues).toEqual([expect.objectContaining({code: "parsheet-missing-reel-strips", severity: "error"})]);
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

        it("creates no file and reports an error when the blueprint uses reelStripGeneration, even though reelStrips is also present", async () => {
            const exporter = new ParSheetExporter("1.3.0");
            const withGeneration: GameBlueprint = {
                ...blueprint,
                reelStripGeneration: [
                    {type: "literal", strip: ["A", "W"]},
                    {type: "literal", strip: ["W", "A"]},
                ],
            };

            const issues = await exporter.exportToFile(withGeneration, filePath);

            expect(issues).toEqual([expect.objectContaining({code: "parsheet-unsupported-reel-source", severity: "error"})]);
            expect(fs.existsSync(filePath)).toBe(false);
        });

        it("creates no file and reports an error when the blueprint uses symbolWeights", async () => {
            const exporter = new ParSheetExporter("1.3.0");
            const withWeights: GameBlueprint = {...blueprint, symbolWeights: {A: 5, W: 1}};
            Reflect.deleteProperty(withWeights, "reelStrips");

            const issues = await exporter.exportToFile(withWeights, filePath);

            expect(issues).toEqual([expect.objectContaining({code: "parsheet-unsupported-reel-source", severity: "error"})]);
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
});
