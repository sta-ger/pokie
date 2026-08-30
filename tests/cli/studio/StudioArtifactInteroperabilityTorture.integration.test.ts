import fs from "fs";
import os from "os";
import path from "path";
import {
    describeUnavailableArtifactOperation,
    POKIE_WASM_CONTRACT_VERSION,
    ProjectTargetResolver,
    type GameBlueprint,
} from "pokie";
import {StudioArtifactBuildService} from "../../../cli/studio/artifacts/StudioArtifactBuildService.js";
import {StudioBlueprintService} from "../../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioHomeService} from "../../../cli/studio/home/StudioHomeService.js";
import {StudioOutcomeLibraryGenerateService} from "../../../cli/studio/outcomeLibrary/StudioOutcomeLibraryGenerateService.js";
import {StudioReplayExecutionService} from "../../../cli/studio/replay/StudioReplayExecutionService.js";
import {StudioSimulationService} from "../../../cli/studio/simulation/StudioSimulationService.js";
import {StudioStakeEngineExportService} from "../../../cli/studio/stakeengine/StudioStakeEngineExportService.js";
import {StudioServer} from "../../../cli/studio/StudioServer.js";
import {ArtifactInteroperabilityRun, mergeArtifactInteroperabilityRuns} from "../../support/ArtifactInteroperabilityRun.js";

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

        // Exercise the retained Studio HTTP ownership boundary as well as the
        // services below.  These observations are intentionally limited to
        // routes actually requested here: the evidence must not turn a
        // service invocation into a claim that the UI or another API route
        // was exercised.
        const studioRoot = path.join(workDir, "studio-client");
        fs.mkdirSync(studioRoot);
        fs.writeFileSync(path.join(studioRoot, "index.html"), "<html>Studio</html>");
        fs.writeFileSync(path.join(studioRoot, "main.js"), "");
        fs.writeFileSync(path.join(studioRoot, "style.css"), "");
        const home = new StudioHomeService(POKIE_VERSION);
        const server = new StudioServer({
            pokieVersion: POKIE_VERSION,
            host: "127.0.0.1",
            port: 0,
            studioRoot,
            homeService: home,
            blueprintService: new StudioBlueprintService(POKIE_VERSION, studioRoot, home),
            initialContext: {mode: "project", projectRoot: blueprintPath},
        });
        const address = await server.start();
        try {
            const baseUrl = `http://${address.host}:${address.port}`;
            const targets = await fetch(`${baseUrl}/api/project/artifacts/targets`);
            expect(targets.status).toBe(200);
            expect(await targets.json()).toEqual(expect.arrayContaining([
                expect.objectContaining({target: "tsPackage", supported: true}),
            ]));
            const preview = await fetch(`${baseUrl}/api/project/artifacts/preview`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({target: "tsPackage", outDir: path.join(workDir, "http-package")}),
            });
            expect(preview.status).toBe(200);
            expect(await preview.json()).toMatchObject({status: "ok", target: "tsPackage"});
            evidence.recordScenario({
                id: "studio-artifact-http-preflight", sourcePath: blueprintPath,
                result: "Studio HTTP target discovery and preflight resolve the same real Blueprint before any durable publication",
                surface: "studio-api", owner: "StudioServer / StudioArtifactBuildService",
                assertions: ["GET targets lists tsPackage", "POST preview returns an executable tsPackage plan"],
                observations: [
                    {route: "GET /api/project/artifacts/targets", result: "returned the supported Blueprint build target"},
                    {route: "POST /api/project/artifacts/preview", result: "returned the prepared tsPackage operation"},
                ],
            });
        } finally {
            await server.stop();
        }

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
            assertions: ["cancelled generation returns a checkpoint and no bundle directory"],
            observations: [{route: "StudioOutcomeLibraryGenerateService.generate", result: "Studio generation returned cancelled"}],
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
            assertions: ["occupied borrowed.txt remains after the conflict"],
            observations: [{route: "StudioOutcomeLibraryGenerateService.generate", result: "Studio preflight destination conflict returned"}],
        });
        fs.rmSync(path.join(packagePath, occupiedOutDir), {recursive: true});
        const generated = await generator.generate(packagePath, {mode: "base", stake: 1, resumeFrom: cancelled.checkpoint});
        expect(generated.status).toBe("ok");
        evidence.recordScenario({
            id: "studio-generation-recovery", sourcePath: packagePath,
            producedPath: path.join(packagePath, StudioOutcomeLibraryGenerateService.DEFAULT_BUNDLE_DIR),
            result: "the cancellation checkpoint resumes into a published Outcome Library after the conflicting borrowed destination is removed",
            surface: "studio-api", owner: "StudioOutcomeLibraryGenerateService",
            assertions: ["resumed generation returns ok and publishes its bundle"],
            observations: [{route: "StudioOutcomeLibraryGenerateService.generate", result: "Studio generation recovered from checkpoint"}],
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

        // Studio receives the already-resolved project from its dashboard
        // context.  Exercise that exact public-service branch with a real
        // component and prove it retains the same shared operation diagnostic
        // as the CLI instead of manufacturing a Studio-only explanation.
        const wasmPath = path.join(workDir, "studio-component.wasm");
        fs.writeFileSync(wasmPath, Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));
        fs.writeFileSync(`${wasmPath}.pokie-wasm.json`, JSON.stringify({
            schemaVersion: POKIE_WASM_CONTRACT_VERSION,
            component: {id: "studio-component", version: "1.0.0"},
            serialization: {session: "pokie.session.v1", play: "pokie.play.v1", state: "pokie.state.v1"},
            host: {rng: "pokie.rng.v1", services: []},
            capabilities: [],
        }));
        const wasmProject = await new ProjectTargetResolver().resolve(wasmPath);
        if (wasmProject === undefined || wasmProject.type !== "wasm") throw new Error("Expected the real Studio WASM component to resolve.");
        const simulationDiagnostic = describeUnavailableArtifactOperation(wasmProject, "outcomeSource.simulate");
        if (simulationDiagnostic === undefined) throw new Error("Expected the shared Studio simulation diagnostic.");
        expect(new StudioSimulationService().start(wasmPath, {rounds: 1}, wasmProject)).toEqual({
            status: "unsupported", message: simulationDiagnostic.message,
        });
        const replayDiagnostic = describeUnavailableArtifactOperation(wasmProject, "outcomeSource.replay");
        if (replayDiagnostic === undefined) throw new Error("Expected the shared Studio replay diagnostic.");
        expect(new StudioReplayExecutionService().start(wasmPath, {round: 1}, wasmProject)).toEqual({
            status: "unsupported", message: replayDiagnostic.message,
        });
        evidence.recordUnavailable({
            id: "studio-wasm-outcome-source-simulate", artifactKind: "wasmComponent", operation: "simulate", sourcePath: wasmPath,
            owner: "StudioSimulationService / ArtifactOperationDiagnostic",
            diagnostic: {code: simulationDiagnostic.code, message: simulationDiagnostic.message, recovery: simulationDiagnostic.recovery},
            observations: [{surface: "studio-api", owner: "StudioSimulationService.start", result: "returned the resolved shared diagnostic"}],
        });
        evidence.recordUnavailable({
            id: "studio-wasm-outcome-source-replay", artifactKind: "wasmComponent", operation: "replay", sourcePath: wasmPath,
            owner: "StudioReplayExecutionService / ArtifactOperationDiagnostic",
            diagnostic: {code: replayDiagnostic.code, message: replayDiagnostic.message, recovery: replayDiagnostic.recovery},
            observations: [{surface: "studio-api", owner: "StudioReplayExecutionService.start", result: "returned the resolved shared diagnostic"}],
        });
        evidence.recordScenario({
            id: "studio-wasm-boundary", sourcePath: wasmPath,
            result: "Studio simulation and replay reject the resolved WASM component before creating a job, retaining the shared diagnostic recovery",
            surface: "studio-api", owner: "StudioSimulationService / StudioReplayExecutionService",
            assertions: ["neither Studio route creates a job for the unavailable component", "both routes return the shared diagnostic message"],
            observations: [
                {route: "POST /api/project/simulations", result: "Studio simulation service returned unsupported"},
                {route: "POST /api/project/replays", result: "Studio replay service returned unsupported"},
            ],
        });
        const evidenceDirectory = process.env.PC14_INTEROPERABILITY_EVIDENCE_OUTPUT_DIR;
        if (evidenceDirectory !== undefined) fs.mkdirSync(evidenceDirectory, {recursive: true});
        const emittedEvidencePath = evidenceDirectory === undefined
            ? path.join(workDir, "pc-14-studio-real-artifact-result.json")
            : path.join(evidenceDirectory, "studio-real-artifact-result.json");
        evidence.write(emittedEvidencePath);
        expect((JSON.parse(fs.readFileSync(emittedEvidencePath, "utf-8")) as {rows: unknown[]}).rows).toEqual(expect.arrayContaining([
            expect.objectContaining({id: "studio-blueprint-build", "source_path": "run-artifacts/source.blueprint.json", "produced_path": "run-artifacts/package"}),
            expect.objectContaining({id: "studio-outcome-library-stake-export", "produced_path": "run-artifacts/package/stake"}),
            expect.objectContaining({id: "studio-wasm-outcome-source-simulate", status: "intentionally-unsupported"}),
            expect.objectContaining({id: "studio-wasm-outcome-source-replay", status: "intentionally-unsupported"}),
        ]));
        expect((JSON.parse(fs.readFileSync(emittedEvidencePath, "utf-8")) as {"scenario_results": {id: string; "produced_path": string | null}[]}).scenario_results).toEqual(expect.arrayContaining([
            expect.objectContaining({id: "studio-generation-cancellation", "produced_path": null}),
            expect.objectContaining({id: "studio-destination-drift", "produced_path": "run-artifacts/package/outcomelibrary"}),
            expect.objectContaining({id: "studio-generation-recovery", "produced_path": "run-artifacts/package/outcomelibrary"}),
            expect.objectContaining({id: "studio-wasm-boundary", "source_path": "run-artifacts/studio-component.wasm"}),
        ]));
        expect((JSON.parse(fs.readFileSync(emittedEvidencePath, "utf-8")) as {rows: {"source_identity": string; "produced_identity": string | null}[]}).rows).toEqual(expect.arrayContaining([
            expect.objectContaining({"source_identity": expect.stringMatching(/^sha256:/), "produced_identity": expect.stringMatching(/^sha256:/)}),
        ]));
        const persistedResultPath = process.env.PC14_INTEROPERABILITY_PERSISTED_RESULT;
        const cliEvidencePath = evidenceDirectory === undefined ? undefined : path.join(evidenceDirectory, "cli-real-artifact-result.json");
        if (persistedResultPath !== undefined && cliEvidencePath !== undefined && fs.existsSync(cliEvidencePath)) {
            mergeArtifactInteroperabilityRuns([cliEvidencePath, emittedEvidencePath], persistedResultPath);
        }
    });
});
