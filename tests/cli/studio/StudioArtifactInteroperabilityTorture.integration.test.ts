import fs from "fs";
import os from "os";
import path from "path";
import {type GameBlueprint} from "pokie";
import {StudioArtifactBuildService} from "../../../cli/studio/artifacts/StudioArtifactBuildService.js";
import {StudioOutcomeLibraryGenerateService} from "../../../cli/studio/outcomeLibrary/StudioOutcomeLibraryGenerateService.js";
import {StudioStakeEngineExportService} from "../../../cli/studio/stakeengine/StudioStakeEngineExportService.js";

const POKIE_VERSION = "1.3.0";

describe("PC-14 Studio real-artifact interoperability torture", () => {
    let workDir: string;

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-artifact-torture-"));
    });

    afterEach(() => fs.rmSync(workDir, {recursive: true, force: true}));

    it("uses the same prepared artifact chain for Studio build, generation, registry reuse and Stake export", async () => {
        const blueprint: GameBlueprint = {
            manifest: {id: "studio-artifact-torture", name: "Studio Artifact Torture", version: "1.0.0"},
            reels: 2,
            rows: 1,
            symbols: ["A", "B"],
            paytable: {A: {2: 3}},
            reelStrips: [["A", "B"], ["A", "B"]],
            availableBets: [1],
        };
        const blueprintPath = path.join(workDir, "source.blueprint.json");
        const packagePath = path.join(workDir, "package");
        fs.writeFileSync(blueprintPath, JSON.stringify(blueprint));

        const build = new StudioArtifactBuildService(POKIE_VERSION, undefined, undefined, undefined, undefined, process.cwd());
        await expect(build.build(blueprintPath, "tsPackage", packagePath)).resolves.toMatchObject({status: "ok", outputPath: packagePath});

        const generator = new StudioOutcomeLibraryGenerateService(POKIE_VERSION);
        const generated = await generator.generate(packagePath, {mode: "base", stake: 1});
        expect(generated.status).toBe("ok");
        const registry = await generator.registry(packagePath);
        expect(registry).toMatchObject({status: "ok"});
        if (registry.status !== "ok" || registry.buildStatus === "missing") throw new Error("Expected Studio Outcome Library registry to be available.");
        const mode = registry.modes.find((entry) => entry.modeName === "base");
        expect(mode).toMatchObject({buildStatus: "compatible"});
        if (mode === undefined || mode.bundleDir === undefined) throw new Error("Expected a compatible generated Outcome Library mode.");

        const stake = await new StudioStakeEngineExportService(POKIE_VERSION).export(
            packagePath,
            [{modeName: "base", librarySelector: {kind: "bundle", bundleDir: mode.bundleDir, modeName: "base"}, cost: 1}],
            "stake",
            false,
        );
        expect(stake).toMatchObject({status: "ok"});
        expect(fs.existsSync(path.join(packagePath, "stake", "pokie-manifest.json"))).toBe(true);
    });
});
