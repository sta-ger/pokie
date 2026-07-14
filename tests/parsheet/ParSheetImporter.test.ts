import ExcelJS from "exceljs";
import fs from "fs";
import os from "os";
import path from "path";
import type {GameBlueprint} from "../../src/generated/GameBlueprint.js";
import {computeBlueprintHash} from "../../src/parsheet/computeBlueprintHash.js";
import {ParSheetExporter} from "../../src/parsheet/ParSheetExporter.js";
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

    describe("provenance", () => {
        // The exact blueprint validSheets (with no Paylines/AvailableBets sheet) assembles to —
        // computeBlueprintHash canonicalizes internally, so this can be built in any key order.
        const assembledBlueprint: GameBlueprint = {
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
        };

        it("returns undefined provenance when there is no Meta sheet", async () => {
            await writeWorkbook(validSheets);
            const importer = new ParSheetImporter();

            const {provenance} = await importer.importFromFile(filePath);

            expect(provenance).toBeUndefined();
        });

        it("returns structured, valid provenance and an informational issue when the recorded hash matches the imported data", async () => {
            await writeWorkbook({
                ...validSheets,
                Meta: [
                    ["Key", "Value"],
                    ["Schema Version", 1],
                    ["Pokie Version", "1.3.0"],
                    ["Exported At", "2026-01-01T00:00:00.000Z"],
                    ["Source", "config.json"],
                    ["Blueprint Hash", computeBlueprintHash(assembledBlueprint)],
                ],
            });
            const importer = new ParSheetImporter();

            const {provenance, issues} = await importer.importFromFile(filePath);

            expect(provenance).toEqual({
                schemaVersion: 1,
                pokieVersion: "1.3.0",
                exportedAt: "2026-01-01T00:00:00.000Z",
                source: "config.json",
                blueprintHash: computeBlueprintHash(assembledBlueprint),
            });
            expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({code: "parsheet-provenance-present", severity: "info"})]));
            expect(issues.some((issue) => issue.code === "parsheet-provenance-hash-mismatch")).toBe(false);
            expect(issues.some((issue) => issue.code === "parsheet-provenance-malformed")).toBe(false);
        });

        it("reports malformed provenance when the Meta sheet is missing Schema Version/Blueprint Hash", async () => {
            await writeWorkbook({
                ...validSheets,
                Meta: [
                    ["Key", "Value"],
                    ["Pokie Version", "1.3.0"],
                ],
            });
            const importer = new ParSheetImporter();

            const {provenance, issues} = await importer.importFromFile(filePath);

            expect(provenance).toEqual({pokieVersion: "1.3.0"});
            expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({code: "parsheet-provenance-malformed", severity: "warning"})]));
        });

        it("reports malformed provenance when Blueprint Hash isn't a well-formed sha256 hash", async () => {
            await writeWorkbook({
                ...validSheets,
                Meta: [
                    ["Key", "Value"],
                    ["Schema Version", 1],
                    ["Blueprint Hash", "not-a-real-hash"],
                ],
            });
            const importer = new ParSheetImporter();

            const {issues} = await importer.importFromFile(filePath);

            expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({code: "parsheet-provenance-malformed", severity: "warning"})]));
        });

        it("reports a schema version mismatch as a warning", async () => {
            await writeWorkbook({
                ...validSheets,
                Meta: [
                    ["Key", "Value"],
                    ["Schema Version", 99],
                    ["Blueprint Hash", computeBlueprintHash(assembledBlueprint)],
                ],
            });
            const importer = new ParSheetImporter();

            const {issues} = await importer.importFromFile(filePath);

            expect(issues).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({code: "parsheet-provenance-schema-mismatch", severity: "warning", details: {recorded: 99, expected: 1}}),
                ]),
            );
            // Requirement: "present" is withheld unless schema is supported *and* the hash matches —
            // even though the recorded hash here is otherwise correct.
            expect(issues.some((issue) => issue.code === "parsheet-provenance-present")).toBe(false);
        });

        it("reports a hash mismatch as a warning (well-formed but wrong hash), without an informational 'present' issue", async () => {
            await writeWorkbook({
                ...validSheets,
                Meta: [
                    ["Key", "Value"],
                    ["Schema Version", 1],
                    ["Blueprint Hash", `sha256:${"0".repeat(64)}`],
                ],
            });
            const importer = new ParSheetImporter();

            const {issues} = await importer.importFromFile(filePath);

            expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({code: "parsheet-provenance-hash-mismatch", severity: "warning"})]));
            expect(issues.some((issue) => issue.code === "parsheet-provenance-present")).toBe(false);
        });

        it("reports a hash mismatch when a previously-exported workbook is hand-edited after export", async () => {
            const exporter = new ParSheetExporter("1.3.0");
            await exporter.exportToFile(assembledBlueprint, filePath);

            // Simulate a human hand-editing the exported workbook in Excel: bump the Paytable
            // multiplier without touching the Meta sheet's recorded hash.
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(filePath);
            workbook.getWorksheet("Paytable")!.getRow(2).getCell(3).value = 999;
            await workbook.xlsx.writeFile(filePath);

            const importer = new ParSheetImporter();
            const {blueprint, issues} = await importer.importFromFile(filePath);

            expect(blueprint.paytable).toEqual({A: {"2": 999}});
            expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({code: "parsheet-provenance-hash-mismatch", severity: "warning"})]));
        });

        it("does not report a hash mismatch after an untouched round trip, even when the source blueprint used empty optional arrays/strings instead of omitting them", async () => {
            // GameBlueprintValidator itself rejects an explicitly-empty (but present) "paylines"/
            // "availableBets" array as invalid — so the only fields where "present but empty" vs.
            // "omitted" ambiguity can arise from a *valid* blueprint are wilds/scatters (which
            // GameBlueprintValidator tolerates empty) and manifest's optional strings.
            const withEmptyOptionalFields: GameBlueprint = {
                ...assembledBlueprint,
                wilds: [],
                scatters: [],
                manifest: {...assembledBlueprint.manifest, description: "", author: ""},
            };
            const exporter = new ParSheetExporter("1.3.0");
            const exportIssues = await exporter.exportToFile(withEmptyOptionalFields, filePath);
            expect(exportIssues.filter((issue) => issue.severity === "error")).toEqual([]);

            const importer = new ParSheetImporter();
            const {issues} = await importer.importFromFile(filePath);

            expect(issues.some((issue) => issue.code === "parsheet-provenance-hash-mismatch")).toBe(false);
            expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({code: "parsheet-provenance-present", severity: "info"})]));
        });
    });

    describe("reel columns anchored to Manifest.Reels", () => {
        it("reports every trailing missing Reel column when ReelStrips has fewer columns than Manifest.Reels", async () => {
            await writeWorkbook({
                ...validSheets,
                Manifest: [
                    ["Key", "Value"],
                    ["Id", "crazy-fruits"],
                    ["Name", "Crazy Fruits"],
                    ["Version", "0.1.0"],
                    ["Reels", 3],
                    ["Rows", 2],
                ],
                // Only 2 of the declared 3 reel columns are present.
                ReelStrips: [
                    ["Reel 1", "Reel 2"],
                    ["A", "W"],
                    ["W", "A"],
                ],
            });
            const importer = new ParSheetImporter();

            const {issues} = await importer.importFromFile(filePath);

            expect(issues).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({code: "parsheet-reel-column-missing", severity: "error", details: {sheet: "ReelStrips", reelIndex: 3}}),
                ]),
            );
        });

        it("reports an out-of-range Reel column when ReelStrips has more columns than Manifest.Reels", async () => {
            await writeWorkbook({
                ...validSheets,
                // Manifest.Reels is 2, but a third "Reel 3" column is present.
                ReelStrips: [
                    ["Reel 1", "Reel 2", "Reel 3"],
                    ["A", "W", "A"],
                    ["W", "A", "W"],
                ],
            });
            const importer = new ParSheetImporter();

            const {blueprint, issues} = await importer.importFromFile(filePath);

            expect(issues).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        code: "parsheet-reel-column-out-of-range",
                        severity: "error",
                        details: {sheet: "ReelStrips", reelIndex: 3, reels: 2},
                    }),
                ]),
            );
            expect(blueprint.reelStrips).toEqual([
                ["A", "W"],
                ["W", "A"],
            ]);
        });
    });
});
