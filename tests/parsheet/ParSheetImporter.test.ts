import ExcelJS from "exceljs";
import fs from "fs";
import os from "os";
import path from "path";
import {ParSheetImporter} from "../../src/parsheet/ParSheetImporter.js";

describe("ParSheetImporter", () => {
    let dir: string;
    let filePath: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-parsheet-import-test-"));
        filePath = path.join(dir, "in.par.xlsx");
    });

    afterEach(() => {
        fs.rmSync(dir, {recursive: true, force: true});
    });

    async function writeWorkbook(sheets: Record<string, unknown[][]>): Promise<void> {
        const workbook = new ExcelJS.Workbook();
        for (const [name, rows] of Object.entries(sheets)) {
            const worksheet = workbook.addWorksheet(name);
            rows.forEach((row) => worksheet.addRow(row));
        }
        await workbook.xlsx.writeFile(filePath);
    }

    const validSheets = {
        Manifest: [
            ["Key", "Value"],
            ["Id", "crazy-fruits"],
            ["Name", "Crazy Fruits"],
            ["Version", "0.1.0"],
            ["Reels", 2],
            ["Rows", 2],
        ],
        Symbols: [
            ["Symbol", "Wild", "Scatter"],
            ["A", false, false],
            ["W", true, false],
        ],
        Paytable: [
            ["Symbol", "Matches", "Multiplier"],
            ["A", 2, 5],
        ],
        ReelStrips: [
            ["Reel 1", "Reel 2"],
            ["A", "W"],
            ["W", "A"],
        ],
    };

    it("assembles a GameBlueprint from Manifest/Symbols/Paytable/ReelStrips, with no error-level issues", async () => {
        await writeWorkbook(validSheets);
        const importer = new ParSheetImporter();

        const {blueprint, issues} = await importer.importFromFile(filePath);

        expect(blueprint).toEqual({
            manifest: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
            reels: 2,
            rows: 2,
            symbols: ["A", "W"],
            wilds: ["W"],
            paytable: {A: {"2": 5}},
            reelStrips: [
                ["A", "W"],
                ["W", "A"],
            ],
        });
        expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
    });

    it("reports a missing required sheet as an error", async () => {
        const withoutPaytable = Object.fromEntries(Object.entries(validSheets).filter(([name]) => name !== "Paytable"));
        await writeWorkbook(withoutPaytable);
        const importer = new ParSheetImporter();

        const {issues} = await importer.importFromFile(filePath);

        expect(issues).toEqual(
            expect.arrayContaining([expect.objectContaining({code: "parsheet-missing-sheet", severity: "error", details: {sheet: "Paytable"}})]),
        );
    });

    it("warns about an unrecognized sheet", async () => {
        await writeWorkbook({...validSheets, Notes: [["Anything"]]});
        const importer = new ParSheetImporter();

        const {issues} = await importer.importFromFile(filePath);

        expect(issues).toEqual(
            expect.arrayContaining([expect.objectContaining({code: "parsheet-unknown-sheet", severity: "warning", details: {sheet: "Notes"}})]),
        );
    });

    it("warns when there is no Meta sheet", async () => {
        await writeWorkbook(validSheets);
        const importer = new ParSheetImporter();

        const {issues} = await importer.importFromFile(filePath);

        expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({code: "parsheet-provenance-missing", severity: "warning"})]));
    });

    it("runs the assembled blueprint through GameBlueprintValidator and surfaces its issues too", async () => {
        // A symbol referenced by Paytable but absent from ReelStrips is unreachable — a
        // GameBlueprintValidator check (blueprint-reelstrips-missing-symbol), not a parsheet-level one.
        await writeWorkbook({
            ...validSheets,
            Paytable: [
                ["Symbol", "Matches", "Multiplier"],
                ["A", 2, 5],
                ["Q", 2, 3],
            ],
        });
        const importer = new ParSheetImporter();

        const {issues} = await importer.importFromFile(filePath);

        expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({code: "blueprint-paytable-unknown-symbol"})]));
    });

    it("omits optional fields entirely when their sheets are absent", async () => {
        await writeWorkbook(validSheets);
        const importer = new ParSheetImporter();

        const {blueprint} = await importer.importFromFile(filePath);

        expect(blueprint.paylines).toBeUndefined();
        expect(blueprint.availableBets).toBeUndefined();
    });
});
