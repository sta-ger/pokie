import fs from "fs";
import os from "os";
import path from "path";
import {StakeEngineExporter} from "pokie";
import {InspectCommand} from "../../cli/commands/InspectCommand.js";
import {StakeEngineCommand} from "../../cli/commands/StakeEngineCommand.js";
import {ValidateCommand} from "../../cli/commands/ValidateCommand.js";
import {buildSingleOutcomeStakeEngineLibrary} from "../stakeengine/StakeEngineTestFixtures.js";

describe("Stake Engine import workflow", () => {
    let workDir: string;
    let stakeDir: string;
    let importedDir: string;
    let reexportedDir: string;
    let logSpy: jest.SpyInstance;

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-stakeengine-import-workflow-"));
        stakeDir = path.join(workDir, "stake-export");
        importedDir = path.join(workDir, "imported-library");
        reexportedDir = path.join(workDir, "re-exported-stake");
        logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        logSpy.mockRestore();
        fs.rmSync(workDir, {recursive: true, force: true});
    });

    it("imports a Stake export as an inspectable and valid Outcome Library while retaining its re-export descriptor", async () => {
        const library = buildSingleOutcomeStakeEngineLibrary({libraryId: "imported-lib", betMode: "base", stake: 1, totalWin: 5});
        await new StakeEngineExporter("1.3.0").exportToDirectory([{modeName: "base", cost: 1, library}], stakeDir);

        expect(await new StakeEngineCommand("1.3.0").run(["import", stakeDir, "--out", importedDir])).toBe(0);
        expect(fs.existsSync(path.join(importedDir, "manifest.json"))).toBe(true);
        expect(fs.existsSync(path.join(importedDir, "index_base.json"))).toBe(true);
        expect(fs.existsSync(path.join(importedDir, "outcomes_base.jsonl"))).toBe(true);
        expect(fs.existsSync(path.join(importedDir, "config.json"))).toBe(true);
        expect(fs.existsSync(path.join(importedDir, "libraries", "base.json"))).toBe(true);

        expect(await new InspectCommand().run([importedDir])).toBe(0);
        expect(await new ValidateCommand().run([importedDir, "--format", "json"])).toBe(0);
        expect(await new StakeEngineCommand("1.3.0").run(["export", path.join(importedDir, "config.json"), "--out", reexportedDir])).toBe(0);
        expect(fs.existsSync(path.join(reexportedDir, "pokie-manifest.json"))).toBe(true);

        const output = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
        expect(output).toContain("Outcome Library");
        expect(output).toContain('"valid": true');
    });
});
