import fs from "fs";
import os from "os";
import path from "path";
import {ExportCommand} from "../../cli/commands/ExportCommand.js";
import {ImportCommand} from "../../cli/commands/ImportCommand.js";
import {ParCommand} from "../../cli/commands/ParCommand.js";
import {BuildCommand} from "../../cli/commands/BuildCommand.js";
import {ArtifactBuilderRegistry, computeBlueprintHash, GameBlueprint, ParSheetImporter, ProjectTargetResolver} from "pokie";

// End-to-end round trip for "pokie par export"/"pokie par import": the actual example blueprint
// shipped in examples/parsheets/ (see also examples/parsheets/README.md), exported to a real .xlsx
// with the real ParSheetExporter/ExcelJS, then imported back with the real ParSheetImporter, asserting
// the result is deep-equal to the original for every field this command supports. Exercising the
// shipped example here (rather than an inline duplicate) keeps it from silently drifting out of sync
// with what "pokie par" actually does — the same reasoning as BuildWorkflow.integration.test.ts's use
// of sample-slot.blueprint.json.
describe("CLI workflow (integration): pokie par export -> pokie par import round trip", () => {
    const blueprintPath = path.join(__dirname, "..", "..", "examples", "parsheets", "starter.blueprint.json");
    const shippedParSheetPath = path.join(__dirname, "..", "..", "examples", "parsheets", "starter.par.xlsx");
    const originalBlueprint = JSON.parse(fs.readFileSync(blueprintPath, "utf-8"));

    let workDir: string;
    let parSheetPath: string;
    let roundTrippedBlueprintPath: string;

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-parsheet-roundtrip-test-"));
        parSheetPath = path.join(workDir, "starter.par.xlsx");
        roundTrippedBlueprintPath = path.join(workDir, "starter.blueprint.json");
        jest.spyOn(console, "log").mockImplementation(() => undefined);
        jest.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        fs.rmSync(workDir, {recursive: true, force: true});
        (console.log as jest.Mock).mockRestore();
        (console.error as jest.Mock).mockRestore();
    });

    it("exports the example blueprint to xlsx and imports it back byte-for-byte equal on every supported field", async () => {
        const command = new ParCommand("1.3.0");

        const exportExitCode = await command.run(["export", blueprintPath, "--out", parSheetPath]);
        expect(exportExitCode).toBe(0);
        expect(fs.existsSync(parSheetPath)).toBe(true);

        const importExitCode = await command.run(["import", parSheetPath, "--out", roundTrippedBlueprintPath]);
        expect(importExitCode).toBe(0);

        const roundTripped = JSON.parse(fs.readFileSync(roundTrippedBlueprintPath, "utf-8"));
        expect(roundTripped).toEqual(originalBlueprint);
        const evidence = JSON.parse(fs.readFileSync(`${roundTrippedBlueprintPath}.conversion-evidence.json`, "utf-8"));
        expect(evidence).toMatchObject({
            sourceWorkbook: parSheetPath,
            provenance: {blueprintHash: computeBlueprintHash(originalBlueprint)},
            importedBlueprintHash: computeBlueprintHash(originalBlueprint),
            provenanceHashMatches: true,
            losslessEligible: true,
        });
        expect(evidence.metaSheet).toEqual(expect.any(Array));
    });

    it("imports the already-shipped starter.par.xlsx back to the same blueprint, with no error-level issues", async () => {
        const command = new ParCommand("1.3.0");

        const exitCode = await command.run(["import", shippedParSheetPath, "--out", roundTrippedBlueprintPath]);

        expect(exitCode).toBe(0);
        const roundTripped = JSON.parse(fs.readFileSync(roundTrippedBlueprintPath, "utf-8"));
        expect(roundTripped).toEqual(originalBlueprint);
    });

    it("uses the shared PAR publication lifecycle for nested par and generic import destinations", async () => {
        const parDestination = path.join(workDir, "missing", "par", "imported.blueprint.json");
        const genericDestination = path.join(workDir, "missing", "generic", "imported.blueprint.json");

        expect(await new ParCommand("1.3.0").run(["import", shippedParSheetPath, "--out", parDestination])).toBe(0);
        expect(await new ImportCommand("1.3.0").run([shippedParSheetPath, "--out", genericDestination])).toBe(0);

        for (const destination of [parDestination, genericDestination]) {
            expect(JSON.parse(fs.readFileSync(destination, "utf-8"))).toEqual(originalBlueprint);
            expect(fs.existsSync(`${destination}.conversion-evidence.json`)).toBe(true);
        }
    });

    it("uses the same nested-path PAR Blueprint publication through pokie build", async () => {
        const destination = path.join(workDir, "missing", "build", "imported.blueprint.json");
        const command = new BuildCommand("1.3.0", undefined, undefined, new ProjectTargetResolver(), new ArtifactBuilderRegistry("1.3.0"));

        expect(await command.run([shippedParSheetPath, "--target", "blueprint", "--out", destination])).toBe(0);
        expect(JSON.parse(fs.readFileSync(destination, "utf-8"))).toEqual(originalBlueprint);
        expect(fs.existsSync(`${destination}.conversion-evidence.json`)).toBe(true);
    });

    it("round-trips the canonical Blueprint through the generic workbook aliases, including an uppercase XLSX suffix", async () => {
        const genericWorkbookPath = path.join(workDir, "starter.PAR.XLSX");
        const genericBlueprintPath = path.join(workDir, "starter.generic-import.blueprint.json");

        expect(await new ExportCommand("1.3.0").run([blueprintPath, "--to", "workbook", "--out", genericWorkbookPath])).toBe(0);
        expect(fs.existsSync(genericWorkbookPath)).toBe(true);

        expect(await new ImportCommand("1.3.0").run([genericWorkbookPath, "--out", genericBlueprintPath])).toBe(0);
        expect(JSON.parse(fs.readFileSync(genericBlueprintPath, "utf-8"))).toEqual(originalBlueprint);
    });

    it("prints the Meta sheet's provenance as an informational issue on import", async () => {
        const command = new ParCommand("1.3.0");

        await command.run(["import", shippedParSheetPath, "--out", roundTrippedBlueprintPath]);

        const printed = (console.log as jest.Mock).mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("parsheet-provenance-present");
        expect(printed).toContain("exported by pokie v1.3.0");
    });

    it("builds a generated canonical Blueprint to a physical workbook, reads it back, and preserves the authored source", async () => {
        const generatedBlueprint: GameBlueprint = {
            manifest: {id: "generated-par", name: "Generated PAR", version: "1.0.0"},
            reels: 2,
            rows: 1,
            symbols: ["A", "B"],
            paytable: {A: {2: 1}},
            reelStripGeneration: [
                {type: "generated", length: 4, symbolCounts: {A: 2, B: 2}, seed: 11},
                {type: "generated", length: 4, symbolCounts: {A: 2, B: 2}, seed: 12},
            ],
        };
        const generatedPath = path.join(workDir, "generated.blueprint.json");
        const defaultWorkbook = path.join(workDir, "parWorkbook.xlsx");
        const explicitWorkbook = path.join(workDir, "generated.par.xlsx");
        fs.writeFileSync(generatedPath, JSON.stringify(generatedBlueprint));
        const resolver = new ProjectTargetResolver();
        const command = new BuildCommand("1.3.0", undefined, undefined, resolver, new ArtifactBuilderRegistry("1.3.0"));

        expect(await command.run([generatedPath, "--target", "parWorkbook", "--dry-run"])).toBe(0);
        expect(await new ParCommand("1.3.0").run(["export", generatedPath, "--out", path.join(workDir, "generated.preview.xlsx"), "--dry-run"])).toBe(0);
        expect(fs.existsSync(defaultWorkbook)).toBe(false);
        expect(await command.run([generatedPath, "--target", "parWorkbook"])).toBe(0);
        expect(fs.existsSync(defaultWorkbook)).toBe(true);
        expect(await command.run([generatedPath, "--target", "parWorkbook", "--out", explicitWorkbook])).toBe(0);

        const imported = await new ParSheetImporter().importFromFile(explicitWorkbook);
        expect(imported.issues.filter((issue) => issue.severity === "error")).toEqual([]);
        expect(imported.blueprint).toMatchObject({
            manifest: generatedBlueprint.manifest,
            symbols: generatedBlueprint.symbols,
            paytable: generatedBlueprint.paytable,
        });
        expect(imported.blueprint.reelStrips).toHaveLength(2);
        // The literal workbook is valid, but it cannot recover generated
        // authoring semantics. The export preflight makes that boundary
        // explicit rather than presenting this as a lossless round trip.
        expect((console.log as jest.Mock).mock.calls.flat().join("\n")).toContain("parsheet-generated-reels-materialized");
        expect(JSON.parse(fs.readFileSync(generatedPath, "utf-8"))).toEqual(generatedBlueprint);

        const conflictWorkbook = path.join(workDir, "conflict.xlsx");
        const sentinel = Buffer.from("PAR destination sentinel");
        fs.writeFileSync(conflictWorkbook, sentinel);
        await expect(command.run([generatedPath, "--target", "parWorkbook", "--out", conflictWorkbook])).rejects.toThrow(/already exists/i);
        expect(fs.readFileSync(conflictWorkbook)).toEqual(sentinel);
    });
});
