import fs from "fs";
import os from "os";
import path from "path";
import {StudioArtifactBuildService} from "../../../cli/studio/artifacts/StudioArtifactBuildService.js";
import {ParSheetExporter} from "../../../src/parsheet/ParSheetExporter.js";

describe("Studio capability convergence (integration)", () => {
    let workDir: string;

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-capability-convergence-"));
    });

    afterEach(() => {
        fs.rmSync(workDir, {recursive: true, force: true});
    });

    it("keeps PAR exchange and planner-owned artifact materialization isolated by project output", async () => {
        const service = new StudioArtifactBuildService("1.3.0");
        const sourceA = path.join(workDir, "a.par.xlsx");
        const sourceB = path.join(workDir, "b.par.xlsx");
        const blueprintA = {manifest: {id: "a", name: "A", version: "1.0.0"}, reels: 2, rows: 1, symbols: ["A", "B"], paytable: {A: {2: 1}}, reelStrips: [["A", "B"], ["A", "B"]], availableBets: [1]};
        const blueprintB = {manifest: {id: "b", name: "B", version: "1.0.0"}, reels: 2, rows: 1, symbols: ["C", "D"], paytable: {C: {2: 2}}, reelStrips: [["C", "D"], ["C", "D"]], availableBets: [1]};
        const exporter = new ParSheetExporter("1.3.0");
        await exporter.exportToFile(blueprintA, sourceA, sourceA);
        await exporter.exportToFile(blueprintB, sourceB, sourceB);

        const outputA = path.join(workDir, "a", "imported.blueprint.json");
        const outputB = path.join(workDir, "b", "imported.blueprint.json");
        fs.mkdirSync(path.dirname(outputA), {recursive: true});
        fs.mkdirSync(path.dirname(outputB), {recursive: true});
        await expect(service.build(sourceA, "blueprint", outputA)).resolves.toMatchObject({status: "ok", outputPath: outputA, sourceType: "parWorkbook"});
        await expect(service.build(sourceB, "blueprint", outputB)).resolves.toMatchObject({status: "ok", outputPath: outputB, sourceType: "parWorkbook"});

        expect(JSON.parse(fs.readFileSync(outputA, "utf-8"))).toMatchObject({manifest: blueprintA.manifest});
        expect(JSON.parse(fs.readFileSync(outputB, "utf-8"))).toMatchObject({manifest: blueprintB.manifest});
    });
});
