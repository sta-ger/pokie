import fs from "fs";
import os from "os";
import path from "path";
import {type GameBlueprint} from "pokie";
import {StudioArtifactBuildService} from "../../../cli/studio/artifacts/StudioArtifactBuildService.js";
import {StudioOutcomeLibraryGenerateService} from "../../../cli/studio/outcomeLibrary/StudioOutcomeLibraryGenerateService.js";
import {StudioStakeEngineExportService} from "../../../cli/studio/stakeengine/StudioStakeEngineExportService.js";
import {ArtifactInteroperabilityRun} from "../../support/ArtifactInteroperabilityRun.js";

const POKIE_VERSION = "1.3.0";

describe("PC-14 Studio real-artifact interoperability torture", () => {
    let workDir: string;

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-artifact-torture-"));
    });

    afterEach(() => fs.rmSync(workDir, {recursive: true, force: true}));

    it("uses the same prepared artifact chain for Studio build, generation, registry reuse and Stake export", async () => {
        const evidence = new ArtifactInteroperabilityRun(workDir);
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
        evidence.record({
            id: "studio-blueprint-build", artifactKind: "blueprint", operation: "build", sourcePath: blueprintPath,
            producedPath: packagePath, owner: "StudioArtifactBuildService", result: "published", observations: [{surface: "studio-api", owner: "StudioArtifactBuildService", result: "status ok"}],
        });

        const generator = new StudioOutcomeLibraryGenerateService(POKIE_VERSION);
        // The service owns the durable bundle publication boundary. A cancelled
        // real generation leaves no bundle behind, and its checkpoint resumes
        // into the same public package rather than an in-memory substitute.
        const controller = new AbortController();
        controller.abort();
        const cancelled = await generator.generate(packagePath, {mode: "base", stake: 1, signal: controller.signal});
        if (cancelled.status !== "cancelled") throw new Error("Expected a resumable Studio generation cancellation.");
        expect(fs.existsSync(path.join(packagePath, StudioOutcomeLibraryGenerateService.DEFAULT_BUNDLE_DIR))).toBe(false);
        evidence.recordScenario({
            id: "studio-generation-cancellation", sourcePath: packagePath,
            result: "cancelled generation leaves no bundle publication and returns the resumable checkpoint",
            surface: "studio-api", owner: "StudioOutcomeLibraryGenerateService",
        });

        // A preview binds its destination. Occupying it after preflight must
        // reject before publication and preserve the caller-owned file.
        const occupiedOutDir = StudioOutcomeLibraryGenerateService.DEFAULT_BUNDLE_DIR;
        const preflight = await generator.estimate(packagePath, {mode: "base", stake: 1});
        expect(preflight.status).toBe("ok");
        if (preflight.status !== "ok") throw new Error("Expected an executable Studio generation preflight.");
        fs.mkdirSync(path.join(packagePath, occupiedOutDir));
        fs.writeFileSync(path.join(packagePath, occupiedOutDir, "borrowed.txt"), "keep");
        await expect(generator.generate(packagePath, {mode: "base", stake: 1, preflightToken: preflight.preflightToken})).resolves.toMatchObject({
            status: "conflict",
            error: expect.stringMatching(/destination|preflight|changed|already exists/i),
        });
        expect(fs.readFileSync(path.join(packagePath, occupiedOutDir, "borrowed.txt"), "utf-8")).toBe("keep");
        evidence.recordScenario({
            id: "studio-destination-drift", sourcePath: packagePath, producedPath: path.join(packagePath, occupiedOutDir),
            result: "prepared generation reports a conflict after destination occupancy and preserves borrowed.txt",
            surface: "studio-api", owner: "StudioOutcomeLibraryGenerateService",
        });
        fs.rmSync(path.join(packagePath, occupiedOutDir), {recursive: true});
        const generated = await generator.generate(packagePath, {mode: "base", stake: 1, resumeFrom: cancelled.checkpoint});
        expect(generated.status).toBe("ok");
        evidence.recordScenario({
            id: "studio-generation-recovery", sourcePath: packagePath,
            producedPath: path.join(packagePath, StudioOutcomeLibraryGenerateService.DEFAULT_BUNDLE_DIR),
            result: "the cancellation checkpoint resumes into a published Outcome Library after the conflicting borrowed destination is removed",
            surface: "studio-api", owner: "StudioOutcomeLibraryGenerateService",
        });

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
        const stakePath = path.join(packagePath, "stake");
        evidence.record({
            id: "studio-outcome-library-stake-export", artifactKind: "outcomeLibrary", operation: "export", sourcePath: path.join(packagePath, mode.bundleDir),
            producedPath: stakePath, owner: "StudioStakeEngineExportService", result: "published", observations: [{surface: "studio-api", owner: "StudioStakeEngineExportService", result: "status ok"}],
        });
        const emittedEvidencePath = path.join(workDir, "pc-14-studio-real-artifact-result.json");
        evidence.write(emittedEvidencePath);
        expect((JSON.parse(fs.readFileSync(emittedEvidencePath, "utf-8")) as {rows: unknown[]}).rows).toEqual(expect.arrayContaining([
            expect.objectContaining({id: "studio-blueprint-build", "source_path": "run-artifacts/source.blueprint.json", "produced_path": "run-artifacts/package"}),
            expect.objectContaining({id: "studio-outcome-library-stake-export", "produced_path": "run-artifacts/package/stake"}),
        ]));
        expect((JSON.parse(fs.readFileSync(emittedEvidencePath, "utf-8")) as {"scenario_results": {id: string; "produced_path": string | null}[]}).scenario_results).toEqual(expect.arrayContaining([
            expect.objectContaining({id: "studio-generation-cancellation", "produced_path": null}),
            expect.objectContaining({id: "studio-destination-drift", "produced_path": "run-artifacts/package/outcomelibrary"}),
            expect.objectContaining({id: "studio-generation-recovery", "produced_path": "run-artifacts/package/outcomelibrary"}),
        ]));
    });
});
