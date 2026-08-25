import fs from "fs";
import os from "os";
import path from "path";
import {StudioArtifactBuildService} from "../../../cli/studio/artifacts/StudioArtifactBuildService.js";
import {localPokieDependencyRunner, REPO_ROOT} from "../../testUtils/offlinePokieDependencyOverride.js";
import {prepareExactCodeFirstPackage} from "../../testUtils/prepareExactCodeFirstPackage.js";
import {ensureCompiledTestOutput} from "../../testUtils/ensureCompiledTestOutput.js";

// This path runs `pokie init`, npm install, and the generated package's own TypeScript build. It belongs to
// the integration lane, where the compiled local POKIE runtime is prepared once for real subprocess consumers.
describe("StudioArtifactBuildService (integration)", () => {
    let workDir: string;
    let service: StudioArtifactBuildService;

    beforeAll(() => {
        ensureCompiledTestOutput({
            repositoryRoot: REPO_ROOT,
            outputPaths: [
                path.join(REPO_ROOT, "dist", "cjs", "index.js"),
                path.join(REPO_ROOT, "dist", "cjs", "index.d.ts"),
                path.join(REPO_ROOT, "dist", "cjs", "package.json"),
            ],
            lockName: "compiled-runtime",
            command: ["npm", "run", "build-test-runtime"],
        });
    });

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-artifact-build-integration-test-"));
        service = new StudioArtifactBuildService("1.3.0");
    });

    afterEach(() => {
        fs.rmSync(workDir, {recursive: true, force: true});
    });

    it("uses the same registry Outcome reuse and Stake flow for a real pokie init code-first package", async () => {
        const packageRoot = path.join(workDir, "code-first-package");
        const outcomeDir = path.join(workDir, "outcomes");
        const secondOutcomeDir = path.join(workDir, "second-outcomes");
        const stakeDir = path.join(workDir, "stake");
        await prepareExactCodeFirstPackage(packageRoot, localPokieDependencyRunner());

        expect(await service.listTargets(packageRoot)).toEqual(expect.arrayContaining([
            expect.objectContaining({target: "outcomeLibrary", supported: true}),
            expect.objectContaining({target: "stakeAdapter", supported: true}),
            expect.objectContaining({target: "parWorkbook", supported: false}),
        ]));
        await expect(service.build(packageRoot, "outcomeLibrary", outcomeDir)).resolves.toMatchObject({
            status: "ok",
            sourceType: "tsPackage",
            outputPath: outcomeDir,
        });
        await expect(service.build(packageRoot, "outcomeLibrary", secondOutcomeDir)).resolves.toEqual({
            status: "ok",
            target: "outcomeLibrary",
            outputPath: secondOutcomeDir,
            outputKind: "directory",
            sourceType: "tsPackage",
        });
        await expect(service.build(packageRoot, "stakeAdapter", stakeDir)).resolves.toMatchObject({
            status: "ok",
            sourceType: "tsPackage",
            outputPath: stakeDir,
        });
        expect(JSON.parse(fs.readFileSync(path.join(outcomeDir, "manifest.json"), "utf-8")).modes).toEqual([
            expect.objectContaining({modeName: "base", betMode: "base", stake: 1}),
            expect.objectContaining({modeName: "ante", betMode: "ante", stake: 2}),
        ]);
        expect(JSON.parse(fs.readFileSync(path.join(stakeDir, "pokie-manifest.json"), "utf-8")).modes).toEqual([
            expect.objectContaining({name: "base", betMode: "base", stake: 1, cost: 1}),
            expect.objectContaining({name: "ante", betMode: "ante", stake: 2, cost: 2}),
        ]);
        const unsupportedBuild = await service.build(packageRoot, "parWorkbook", path.join(workDir, "unsupported.xlsx"));
        if (unsupportedBuild.status !== "unsupported") {
            throw new Error("expected unsupported");
        }
        expect(unsupportedBuild).toEqual({
            status: "unsupported",
            target: "parWorkbook",
            message:
                `"${packageRoot}" is a POKIE game package. It cannot build a PAR workbook. ` +
                "Missing prerequisite: a Game Blueprint or PAR workbook. Next: Open a Game Blueprint or PAR workbook, then run `pokie build <path> --target parWorkbook`.",
        });
    });
});
