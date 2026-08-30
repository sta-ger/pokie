import fs from "fs";
import os from "os";
import path from "path";
import {ParSheetExporter, StakeEngineExporter} from "pokie";
import {ImportCommand} from "../../../cli/commands/ImportCommand.js";
import {InspectCommand} from "../../../cli/commands/InspectCommand.js";
import {StakeEngineCommand} from "../../../cli/commands/StakeEngineCommand.js";
import {ValidateCommand} from "../../../cli/commands/ValidateCommand.js";
import {buildStakeEngineTestLibrary} from "../../stakeengine/StakeEngineTestFixtures.js";

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

    it("delegates a Stake export to a reusable, publicly inspectable and deep-valid Outcome Library", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-import-command-stake-test-"));
        const stakeDir = path.join(workDir, "stake");
        const importedDir = path.join(workDir, "imported");
        const reExportedDir = path.join(workDir, "re-exported");
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
        const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);

        try {
            const library = buildStakeEngineTestLibrary({libraryId: "generic-import", betMode: "base", stake: 1});
            const source = await new StakeEngineExporter("1.3.0").exportToDirectory([{modeName: "base", cost: 1, library}], stakeDir);
            expect(source.issues).toEqual([]);

            expect(await new ImportCommand("1.3.0").run([stakeDir, "--out", importedDir, "--format", "json"])).toBe(0);
            expect(await new InspectCommand().run([importedDir])).toBe(0);
            expect(await new ValidateCommand().run([importedDir, "--deep"])).toBe(0);
            expect(await new StakeEngineCommand("1.3.0").run(["export", path.join(importedDir, "config.json"), "--out", reExportedDir])).toBe(0);
            expect(fs.existsSync(path.join(reExportedDir, "pokie-manifest.json"))).toBe(true);
            expect(JSON.parse(String(logSpy.mock.calls[0][0]))).toEqual(
                expect.objectContaining({stakeDir, outDir: importedDir, files: expect.arrayContaining(["manifest.json", "config.json"])}),
            );
        } finally {
            logSpy.mockRestore();
            errorSpy.mockRestore();
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it("previews a Stake import without publishing its destination", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-import-command-stake-dry-run-test-"));
        const stakeDir = path.join(workDir, "stake");
        const importedDir = path.join(workDir, "imported");
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
        try {
            const library = buildStakeEngineTestLibrary({libraryId: "generic-import-dry-run", betMode: "base", stake: 1});
            await new StakeEngineExporter("1.3.0").exportToDirectory([{modeName: "base", cost: 1, library}], stakeDir);

            await expect(new ImportCommand("1.3.0").run([stakeDir, "--out", importedDir, "--dry-run"])).resolves.toBe(0);

            expect(fs.existsSync(importedDir)).toBe(false);
            expect(logSpy.mock.calls.map(([line]) => String(line)).join("\n")).toContain("No files written");
        } finally {
            logSpy.mockRestore();
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it("rejects an unsupported public import format before creating a Stake destination", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-import-command-format-test-"));
        const stakeDir = path.join(workDir, "stake");
        const importedDir = path.join(workDir, "imported");
        const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);

        try {
            const library = buildStakeEngineTestLibrary({libraryId: "generic-import-format", betMode: "base", stake: 1});
            await new StakeEngineExporter("1.3.0").exportToDirectory([{modeName: "base", cost: 1, library}], stakeDir);

            expect(() => new ImportCommand("1.3.0").run([stakeDir, "--out", importedDir, "--format", "xml"])).toThrow(
                '--format only supports "json"',
            );
            expect(fs.existsSync(importedDir)).toBe(false);
        } finally {
            errorSpy.mockRestore();
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it("rejects a compatible WASM component with the inspection-only PAR import diagnostic before publishing", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-import-command-wasm-boundary-"));
        const wasmPath = path.join(workDir, "component.wasm");
        const outputPath = path.join(workDir, "imported.blueprint.json");
        fs.writeFileSync(wasmPath, Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));
        fs.writeFileSync(`${wasmPath}.pokie-wasm.json`, JSON.stringify({
            schemaVersion: "1.0.0",
            component: {id: "import-boundary", version: "1.0.0"},
            serialization: {session: "pokie.session.v1", play: "pokie.play.v1", state: "pokie.state.v1"},
            host: {rng: "pokie.rng.v1", services: []},
            capabilities: [],
        }));

        try {
            await expect(new ImportCommand("1.3.0").run([wasmPath, "--out", outputPath])).rejects.toThrow(
                /cannot import a PAR workbook.*never loads or executes.*inspect a compatible component/i,
            );
            expect(fs.existsSync(outputPath)).toBe(false);
        } finally {
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });
});
