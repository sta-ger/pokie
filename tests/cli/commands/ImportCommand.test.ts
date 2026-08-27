import fs from "fs";
import os from "os";
import path from "path";
import {ParSheetExporter, StakeEngineExporter} from "pokie";
import {ImportCommand} from "../../../cli/commands/ImportCommand.js";
import {InspectCommand} from "../../../cli/commands/InspectCommand.js";
import {ValidateCommand} from "../../../cli/commands/ValidateCommand.js";
import {buildSingleOutcomeStakeEngineLibrary} from "../../stakeengine/StakeEngineTestFixtures.js";

const blueprint = {
    manifest: {id: "import-conflict", name: "Import Conflict", version: "1.0.0"},
    reels: 2,
    rows: 1,
    symbols: ["A", "B"],
    paytable: {A: {2: 1}},
    reelStrips: [["A", "B"], ["B", "A"]],
};

describe("ImportCommand", () => {
    it("exposes one generic import command and handles help without dispatching an import", async () => {
        const command = new ImportCommand("1.3.0");
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await expect(command.run(["--help"])).resolves.toBe(0);
        expect(command.getName()).toBe("import");
        expect(command.getCommanderCommand().name()).toBe("import");
        const help = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
        expect(help).toContain("POKIE-produced Stake Engine export");
        expect(help).toContain("pokie-manifest.json");

        logSpy.mockRestore();
    });

    it("forwards XLSX output conflicts and resolved workbook aliases without changing their files", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-import-command-conflict-test-"));
        const workbookPath = path.join(workDir, "source.par.xlsx");
        const outputPath = path.join(workDir, "occupied.blueprint.json");
        const linkedDir = `${workDir}-link`;
        const outputBytes = Buffer.from("existing generic import output");
        const command = new ImportCommand("1.3.0");
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        try {
            await new ParSheetExporter("1.3.0").exportToFile(blueprint, workbookPath);
            fs.writeFileSync(outputPath, outputBytes);

            await expect(command.run([workbookPath, "--out", outputPath])).rejects.toThrow(/already exists/i);
            expect(fs.readFileSync(outputPath)).toEqual(outputBytes);

            fs.symlinkSync(workDir, linkedDir, "dir");
            const workbookBytes = fs.readFileSync(workbookPath);
            await expect(command.run([workbookPath, "--out", path.join(linkedDir, "source.par.xlsx")])).rejects.toThrow(/source itself/i);
            expect(fs.readFileSync(workbookPath)).toEqual(workbookBytes);
        } finally {
            logSpy.mockRestore();
            if (fs.existsSync(linkedDir)) fs.unlinkSync(linkedDir);
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it("imports a real Stake export through the public adapter into an inspectable, valid Outcome Library", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-import-command-stake-test-"));
        const stakeDir = path.join(workDir, "stake-export");
        const importedDir = path.join(workDir, "imported-library");
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        try {
            const library = buildSingleOutcomeStakeEngineLibrary({libraryId: "imported-lib", betMode: "base", stake: 1, totalWin: 5});
            await new StakeEngineExporter("1.3.0").exportToDirectory([{modeName: "base", cost: 1, library}], stakeDir);

            expect(await new ImportCommand("1.3.0").run([stakeDir, "--out", importedDir])).toBe(0);
            expect(await new InspectCommand().run([importedDir])).toBe(0);
            expect(await new ValidateCommand().run([importedDir, "--format", "json"])).toBe(0);

            const output = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
            expect(output).toContain("manifest.json");
            expect(output).toContain("index_base.json");
            expect(output).toContain("outcomes_base.jsonl");
            expect(output).toContain("config.json");
            expect(output).toContain("libraries/base.json");
        } finally {
            logSpy.mockRestore();
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });
});
