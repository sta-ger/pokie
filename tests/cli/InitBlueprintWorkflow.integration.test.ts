import fs from "fs";
import os from "os";
import path from "path";
import {BuildCommand} from "../../cli/commands/BuildCommand.js";
import {ValidateCommand} from "../../cli/commands/ValidateCommand.js";

// End-to-end happy path for "pokie build --init-blueprint <file>": a real BuildCommand (no stubbed
// fs/validator/generator) writes the starter template to disk, and the file it wrote is then fed
// straight into "pokie build <file> --out <dir>" unedited — proving the template isn't just valid
// in isolation (see createStarterGameBlueprint.test.ts) but actually round-trips through the same
// GameBlueprintValidator/GamePackageGenerator a hand-edited copy would.
describe("CLI workflow (integration): pokie build --init-blueprint", () => {
    let workDir: string;
    let blueprintFile: string;
    let outDir: string;

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-init-blueprint-test-"));
        blueprintFile = path.join(workDir, "starter.blueprint.json");
        outDir = path.join(workDir, "built-game");
        jest.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        fs.rmSync(workDir, {recursive: true, force: true});
        (console.log as jest.Mock).mockRestore();
    });

    it("writes a starter blueprint that builds successfully as-is via pokie build <file> --out <dir>", async () => {
        const initExitCode = await new BuildCommand("1.3.0").run(["--init-blueprint", blueprintFile]);
        expect(initExitCode).toBe(0);
        expect(fs.existsSync(blueprintFile)).toBe(true);

        const raw = fs.readFileSync(blueprintFile, "utf-8");
        expect(raw.endsWith("\n")).toBe(true);
        const parsed = JSON.parse(raw); // throws if the written file isn't valid, formatted JSON
        expect(parsed.manifest.id).toBe("starter-slot");

        const buildExitCode = await new BuildCommand("1.3.0").run([blueprintFile, "--out", outDir]);
        expect(buildExitCode).toBe(0);
        expect(fs.existsSync(path.join(outDir, "package.json"))).toBe(true);
        expect(fs.existsSync(path.join(outDir, "src", "generated", "index.js"))).toBe(true);

        const validateExitCode = await new ValidateCommand().run([outDir]);
        expect(validateExitCode).toBe(0);
    });

    it("does not launch the wizard or write a package next to the blueprint file", async () => {
        const exitCode = await new BuildCommand("1.3.0").run(["--init-blueprint", blueprintFile]);

        expect(exitCode).toBe(0);
        expect(fs.existsSync(path.join(workDir, "starter-slot"))).toBe(false);
        expect(fs.readdirSync(workDir)).toEqual(["starter.blueprint.json"]);
    });

    it("refuses to overwrite an existing file, leaving its contents untouched", async () => {
        fs.writeFileSync(blueprintFile, "hand-written content\n", "utf-8");

        await expect(new BuildCommand("1.3.0").run(["--init-blueprint", blueprintFile])).rejects.toThrow(/already exists/);

        expect(fs.readFileSync(blueprintFile, "utf-8")).toBe("hand-written content\n");
    });
});
