import fs from "fs";
import os from "os";
import path from "path";

import {BuildCommand} from "../../cli/commands/BuildCommand.js";
import {StudioArtifactBuildService} from "../../cli/studio/artifacts/StudioArtifactBuildService.js";

const BLUEPRINT = {
    manifest: {id: "pc17-parity", name: "PC-17 Parity", version: "1.0.0"},
    reels: 2,
    rows: 1,
    symbols: ["A", "B"],
    paytable: {A: {2: 1}},
    reelStrips: [["A", "B"], ["A", "B"]],
    availableBets: [1],
};

describe("PC-17 public CLI and Studio parity", () => {
    it("gives both surfaces the same Blueprint-to-workbook result and leaves a conflicting destination untouched", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-pc17-cli-studio-"));
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
        try {
            const source = path.join(workDir, "game.blueprint.json");
            fs.writeFileSync(source, JSON.stringify(BLUEPRINT));
            const cliOutput = path.join(workDir, "cli.xlsx");
            const studioOutput = path.join(workDir, "studio.xlsx");

            expect(await new BuildCommand("1.3.0").run([source, "--target", "parWorkbook", "--out", cliOutput])).toBe(0);
            await expect(new StudioArtifactBuildService("1.3.0").build(source, "parWorkbook", studioOutput)).resolves.toMatchObject({
                status: "ok", target: "parWorkbook", sourceType: "blueprint", outputPath: studioOutput,
            });
            expect(fs.existsSync(cliOutput)).toBe(true);
            expect(fs.existsSync(studioOutput)).toBe(true);

            fs.writeFileSync(studioOutput, "caller-owned workbook");
            await expect(new StudioArtifactBuildService("1.3.0").build(source, "parWorkbook", studioOutput)).resolves.toMatchObject({
                status: "conflict", target: "parWorkbook",
            });
            expect(fs.readFileSync(studioOutput, "utf-8")).toBe("caller-owned workbook");
        } finally {
            logSpy.mockRestore();
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });
});
