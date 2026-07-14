import fs from "fs";
import os from "os";
import path from "path";
import {ParCommand} from "../../cli/commands/ParCommand.js";

// End-to-end round trip for "pokie par export"/"pokie par import": the actual example blueprint
// shipped in examples/parsheets/ (see also examples/parsheets/README.md), exported to a real .xlsx
// with the real ParSheetExporter/ExcelJS, then imported back with the real ParSheetImporter, asserting
// the result is deep-equal to the original for every field this command supports. Exercising the
// shipped example here (rather than an inline duplicate) keeps it from silently drifting out of sync
// with what "pokie par" actually does — the same reasoning as BuildWorkflow.integration.test.ts's use
// of crazy-fruits.blueprint.json.
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
    });

    it("imports the already-shipped starter.par.xlsx back to the same blueprint, with no error-level issues", async () => {
        const command = new ParCommand("1.3.0");

        const exitCode = await command.run(["import", shippedParSheetPath, "--out", roundTrippedBlueprintPath]);

        expect(exitCode).toBe(0);
        const roundTripped = JSON.parse(fs.readFileSync(roundTrippedBlueprintPath, "utf-8"));
        expect(roundTripped).toEqual(originalBlueprint);
    });

    it("prints the Meta sheet's provenance as an informational issue on import", async () => {
        const command = new ParCommand("1.3.0");

        await command.run(["import", shippedParSheetPath, "--out", roundTrippedBlueprintPath]);

        const printed = (console.log as jest.Mock).mock.calls.map((call) => call[0]).join("\n");
        expect(printed).toContain("parsheet-provenance-present");
        expect(printed).toContain("exported by pokie v1.3.0");
    });
});
