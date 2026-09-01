import fs from "fs";
import os from "os";
import path from "path";

import {BuildCommand} from "../../cli/commands/BuildCommand.js";
import {StudioArtifactBuildService} from "../../cli/studio/artifacts/StudioArtifactBuildService.js";

describe("Studio capability convergence at the public CLI boundary", () => {
    it("keeps the same Blueprint-to-PAR capability and caller-owned destination safety in CLI and Studio", async () => {
        const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-public-studio-capability-"));
        try {
            const source = path.join(workDir, "source.blueprint.json");
            fs.writeFileSync(source, JSON.stringify({
                manifest: {id: "public-studio-capability", name: "Public Studio Capability", version: "1.0.0"},
                reels: 2, rows: 1, symbols: ["A", "B"], paytable: {A: {2: 1}}, reelStrips: [["A", "B"], ["A", "B"]], availableBets: [1],
            }));
            const cliOut = path.join(workDir, "cli.xlsx");
            const studioOut = path.join(workDir, "studio.xlsx");

            expect(await new BuildCommand("1.3.0").run([source, "--target", "parWorkbook", "--out", cliOut])).toBe(0);
            expect(fs.existsSync(cliOut)).toBe(true);
            await expect(new StudioArtifactBuildService("1.3.0").build(source, "parWorkbook", studioOut)).resolves.toMatchObject({
                status: "ok", outputPath: studioOut, sourceType: "blueprint",
            });

            fs.writeFileSync(studioOut, "caller-owned replacement");
            await expect(new StudioArtifactBuildService("1.3.0").build(source, "parWorkbook", studioOut)).resolves.toMatchObject({status: "conflict"});
            expect(fs.readFileSync(studioOut, "utf-8")).toBe("caller-owned replacement");
        } finally {
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });
});
