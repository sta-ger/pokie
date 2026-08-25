import fs from "fs";
import os from "os";
import path from "path";
import {ExportCommand} from "../../../cli/commands/ExportCommand.js";

const blueprint = {
    manifest: {id: "export-conflict", name: "Export Conflict", version: "1.0.0"},
    reels: 2,
    rows: 1,
    symbols: ["A", "B"],
    paytable: {A: {2: 1}},
    reelStrips: [["A", "B"], ["B", "A"]],
};

describe("ExportCommand", () => {
    it("exposes one target-oriented export command and handles help without exporting", async () => {
        const command = new ExportCommand("1.3.0");
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await expect(command.run(["--help"])).resolves.toBe(0);
        expect(command.getName()).toBe("export");
        expect(command.getCommanderCommand().name()).toBe("export");

        logSpy.mockRestore();
    });

    it("forwards workbook output conflicts and resolved Blueprint aliases without changing their files", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-export-command-conflict-test-"));
        const blueprintPath = path.join(workDir, "source.blueprint.json");
        const outputPath = path.join(workDir, "occupied.par.xlsx");
        const linkedDir = `${workDir}-link`;
        const sourceContents = JSON.stringify(blueprint, null, 4);
        const outputBytes = Buffer.from("existing generic export output");
        const command = new ExportCommand("1.3.0");
        const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);

        try {
            fs.writeFileSync(blueprintPath, sourceContents);
            fs.writeFileSync(outputPath, outputBytes);

            await expect(command.run([blueprintPath, "--to", "workbook", "--out", outputPath])).rejects.toThrow(/already exists/i);
            expect(fs.readFileSync(outputPath)).toEqual(outputBytes);

            fs.symlinkSync(workDir, linkedDir, "dir");
            await expect(command.run([blueprintPath, "--to", "workbook", "--out", path.join(linkedDir, "source.blueprint.json")])).rejects.toThrow(
                /source itself/i,
            );
            expect(fs.readFileSync(blueprintPath, "utf-8")).toBe(sourceContents);
        } finally {
            errorSpy.mockRestore();
            if (fs.existsSync(linkedDir)) fs.unlinkSync(linkedDir);
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });
});
