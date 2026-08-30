import fs from "fs";
import os from "os";
import path from "path";
import {
    describeUnavailableArtifactOperation,
    FileSessionRepository,
    ManagedOutcomeProjectService,
    POKIE_WASM_CONTRACT_VERSION,
    ProjectTargetResolver,
    type GameBlueprint,
} from "pokie";
import {StudioArtifactBuildService} from "../../../cli/studio/artifacts/StudioArtifactBuildService.js";
import {StudioBlueprintService} from "../../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioDeploymentService} from "../../../cli/studio/deployment/StudioDeploymentService.js";
import {StudioProjectRegistrationService} from "../../../cli/studio/StudioProjectRegistrationService.js";
import {FileStudioProjectRegistry} from "../../../cli/studio/FileStudioProjectRegistry.js";
import {StudioHomeService} from "../../../cli/studio/home/StudioHomeService.js";
import {StudioOutcomeLibraryGenerateService} from "../../../cli/studio/outcomeLibrary/StudioOutcomeLibraryGenerateService.js";
import {StudioReplayExecutionService} from "../../../cli/studio/replay/StudioReplayExecutionService.js";
import {StudioSimulationService} from "../../../cli/studio/simulation/StudioSimulationService.js";
import {StudioStakeEngineExportService} from "../../../cli/studio/stakeengine/StudioStakeEngineExportService.js";
import {StudioServer} from "../../../cli/studio/StudioServer.js";
import {GamePackagePreparer} from "../../../cli/prepare/GamePackagePreparer.js";
import {PREPARATION_STATE_FILE} from "../../../cli/prepare/PreparationStateStore.js";
import {BuildCommand} from "../../../cli/commands/BuildCommand.js";
import {ArtifactInteroperabilityRun, installPc14FixedRunnerClock, mergeArtifactInteroperabilityRuns} from "../../support/ArtifactInteroperabilityRun.js";

const POKIE_VERSION = "1.3.0";

describe("PC-14 Studio real-artifact interoperability torture", () => {
    let workDir: string;
    let restoreRunnerClock: () => void;

    beforeEach(() => {
        restoreRunnerClock = installPc14FixedRunnerClock();
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-artifact-torture-"));
    });

    afterEach(() => {
        fs.rmSync(workDir, {recursive: true, force: true});
        restoreRunnerClock();
    });

    it("uses the same prepared artifact chain for Studio build, generation, registry reuse and Stake export", async () => {
        const evidence = new ArtifactInteroperabilityRun(workDir);
        const blueprint: GameBlueprint = {
            manifest: {id: "studio-artifact-torture", name: "Studio Artifact Torture", version: "1.0.0"},
            // Keep the source small enough for the other real-artifact paths,
            // but large enough that the Outcome publication job reaches its
            // writer progress boundary before cancellation.
            reels: 3,
            rows: 1,
            symbols: ["A", "B", "C", "D", "E", "F", "G"],
            paytable: {A: {3: 3}},
            reelStrips: Array.from({length: 3}, () => ["A", "B", "C", "D", "E", "F", "G"]),
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
            const context = await fetch(`${baseUrl}/api/project/context`);
            expect(context.status).toBe(200);
            // Dashboard resolution is intentionally asynchronous: immediately
            // after start it may still report loading, but it must be the real
            // project context that the following inspect/validate calls own.
            expect(await context.json()).toMatchObject({status: expect.any(String)});
            const inspected = await fetch(`${baseUrl}/api/project/inspect`);
            expect(inspected.status).toBe(200);
            expect(await inspected.json()).toMatchObject({packageRoot: blueprintPath, valid: true});
            const validated = await fetch(`${baseUrl}/api/project/validate`);
            expect(validated.status).toBe(200);
            expect(await validated.json()).toMatchObject({valid: true});
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
            const previewBody = await preview.json() as {status: string; target: string; preparedOperationId?: string};
            expect(previewBody).toMatchObject({status: "ok", target: "tsPackage"});
            // Start the exact public build route from the previewed target.
            // The route deliberately returns a pollable job immediately, so
            // this records only the observable job creation rather than
            // claiming that this HTTP request synchronously published output.
            const buildStart = await fetch(`${baseUrl}/api/project/artifacts/build`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    target: "tsPackage",
                    outDir: path.join(workDir, "http-package"),
                    ...(previewBody.preparedOperationId === undefined ? {} : {preparedOperationId: previewBody.preparedOperationId}),
                }),
            });
            expect(buildStart.status).toBe(202);
            const buildBody = await buildStart.json() as {status: string; job: {id: string; status: string}};
            expect(buildBody).toMatchObject({status: "created", job: {id: expect.any(String)}});
            const terminalBuild = await waitForStudioJob(
                () => fetch(`${baseUrl}/api/project/artifacts/build/${buildBody.job.id}`).then(async (response) => ({status: response.status, body: await response.json()})),
            );
            expect(terminalBuild).toMatchObject({status: 200, body: {status: "completed", result: {status: "ok", outputPath: path.join(workDir, "http-package")}}});
            expect(fs.existsSync(path.join(workDir, "http-package"))).toBe(true);

            // Artifact publication is separately durable from the job state.
            // Cancel while the real canonical writer is active, verify that
            // neither its destination nor a managed registration survives,
            // then start a fresh job to prove the same Studio server can
            // recover without retaining a stale queued/running record.
            const cancelledOutcomePath = path.join(workDir, "http-cancelled-outcome-library");
            const cancelledStart = await fetch(`${baseUrl}/api/project/artifacts/build`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({target: "outcomeLibrary", outDir: cancelledOutcomePath}),
            });
            expect(cancelledStart.status).toBe(202);
            const cancelledJob = await cancelledStart.json() as {job: {id: string}};
            let activeBuild: {status: number; body: {status: string; progress?: {message?: string}}} | undefined;
            for (let attempt = 0; attempt < 1200; attempt += 1) {
                const current = await fetch(`${baseUrl}/api/project/artifacts/build/${cancelledJob.job.id}`)
                    .then(async (response) => ({status: response.status, body: await response.json() as {status: string; progress?: {message?: string}}}));
                if (current.body.status === "running" && current.body.progress?.message?.startsWith("Writing Outcome mode")) {
                    activeBuild = current;
                    break;
                }
                if (current.body.status !== "queued" && current.body.status !== "running") break;
                await new Promise<void>((resolve) => {
                    setTimeout(resolve, 10);
                });
            }
            expect(activeBuild).toMatchObject({status: 200, body: {status: "running"}});
            const cancellation = await fetch(`${baseUrl}/api/project/artifacts/build/${cancelledJob.job.id}/cancel`, {method: "POST"});
            expect(cancellation.status).toBe(200);
            const cancelledTerminal = await waitForStudioJob(
                () => fetch(`${baseUrl}/api/project/artifacts/build/${cancelledJob.job.id}`).then(async (response) => ({status: response.status, body: await response.json()})),
            );
            expect(cancelledTerminal).toMatchObject({status: 200, body: {status: "cancelled", cancellationRequested: true, result: {status: "cancelled"}}});
            expect(fs.existsSync(cancelledOutcomePath)).toBe(false);
            expect(fs.existsSync(path.join(workDir, ".pokie", "managed-outcome-projects.json"))).toBe(false);

            const restartedOutcomePath = path.join(workDir, "http-restarted-outcome-library");
            const restart = await fetch(`${baseUrl}/api/project/artifacts/build`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({target: "outcomeLibrary", outDir: restartedOutcomePath}),
            });
            expect(restart.status).toBe(202);
            const restartedJob = await restart.json() as {job: {id: string}};
            const restartedTerminal = await waitForStudioJob(
                () => fetch(`${baseUrl}/api/project/artifacts/build/${restartedJob.job.id}`).then(async (response) => ({status: response.status, body: await response.json()})),
            );
            expect(restartedTerminal).toMatchObject({status: 200, body: {status: "completed", result: {status: "ok", outputPath: restartedOutcomePath}}});
            expect(fs.existsSync(restartedOutcomePath)).toBe(true);
            evidence.recordScenario({
                id: "studio-artifact-http-preflight", sourcePath: blueprintPath,
                result: "Studio HTTP context, inspection, validation, target discovery, preflight, polling, cancellation cleanup, and restart resolve the same real Blueprint before publication",
                surface: "studio-api", owner: "StudioServer / StudioArtifactBuildService",
                systemicClasses: ["shared-conversion-diagnostic-parity", "durable-publication-ownership"],
                assertions: ["GET context retains the real Blueprint", "GET inspect and validate accept the real Blueprint", "GET targets lists tsPackage", "POST preview returns an executable tsPackage plan", "POST build creates and GET job reaches the terminal published result", "POST cancel removes the interrupted Outcome publication and leaves no managed registration", "a later POST build completes to a fresh destination"],
                observations: [
                    {route: "GET /api/project/context", result: "returned the opened Blueprint context"},
                    {route: "GET /api/project/inspect", result: "inspected the opened Blueprint"},
                    {route: "GET /api/project/validate", result: "validated the opened Blueprint"},
                    {route: "GET /api/project/artifacts/targets", result: "returned the supported Blueprint build target"},
                    {route: "POST /api/project/artifacts/preview", result: "returned the prepared tsPackage operation"},
                    {route: "POST /api/project/artifacts/build", result: "created the pollable tsPackage build job"},
                    {route: "GET /api/project/artifacts/build/:id", result: "polled the completed job and observed its published output"},
                    {route: "POST /api/project/artifacts/build/:id/cancel", result: "cancelled an active Outcome publication job and retained no partial destination"},
                    {route: "POST /api/project/artifacts/build", result: "restarted a clean Outcome publication job after cancellation"},
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
            systemicClasses: ["shared-conversion-diagnostic-parity"],
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
            systemicClasses: ["durable-publication-ownership"],
            assertions: ["cancelled generation returns a checkpoint and no bundle directory"],
            observations: [{route: "StudioOutcomeLibraryGenerateService.generate", result: "Studio generation returned cancelled"}],
        });

        // These companions are not build-matrix targets, but each is a PC-05
        // public artifact.  Exercise their owning services against the real
        // package/bundle produced above so registry coverage cannot confuse a
        // hand-authored companion file with a published owner result.
        const artworkSource = path.join(workDir, "symbol.png");
        fs.writeFileSync(artworkSource, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        const artworkService = new StudioBlueprintService(POKIE_VERSION, studioRoot, home);
        // The product intentionally gives independently imported artwork a
        // collision-resistant filename.  Pin the runner identity only while
        // it creates this disposable fixture so the emitted real path can be
        // byte-compared by a later clean process.
        const random = jest.spyOn(Math, "random").mockReturnValue(0.5);
        const artworkImport = artworkService.importSymbolArtwork(artworkSource);
        random.mockRestore();
        expect(artworkImport.status).toBe("ok");
        if (artworkImport.status !== "ok") throw new Error(artworkImport.error);
        expect(artworkService.save(blueprintPath, {...blueprint, symbolArtwork: {A: artworkImport.reference}}, true)).toMatchObject({status: "ok"});
        const artworkPath = artworkService.resolveSymbolArtwork(blueprintPath, artworkImport.reference);
        expect(artworkPath).toBeDefined();
        if (artworkPath === undefined) throw new Error("Expected Studio to materialize symbol artwork.");
        evidence.record({
            id: "studio-symbol-artwork-materialize", artifactKind: "studioSymbolArtworkPng", operation: "import",
            sourcePath: artworkSource, producedPath: artworkPath, owner: "StudioBlueprintService.importSymbolArtwork/save",
            result: "Studio staged a selected PNG and materialized the declared project-relative artwork companion",
            observations: [{surface: "studio-api", owner: "StudioBlueprintService.resolveSymbolArtwork", result: "resolved the persisted declared PNG"}],
            systemicClasses: ["durable-publication-ownership"],
        });

        const sessionDirectory = path.join(workDir, "session-state");
        const sessionRepository = new FileSessionRepository(sessionDirectory);
        await sessionRepository.save("pc14-session", {bet: 1, win: 0, screen: [["A", "B"]], context: {seed: "pc14-fixed-runner"}});
        const [sessionRecord] = fs.readdirSync(sessionDirectory);
        const sessionRecordPath = path.join(sessionDirectory, sessionRecord);
        expect(await new FileSessionRepository(sessionDirectory).load("pc14-session")).toMatchObject({bet: 1, win: 0});
        evidence.record({
            id: "runtime-session-file-export", artifactKind: "runtimeSession", operation: "export",
            sourcePath: packagePath, producedPath: sessionRecordPath, owner: "FileSessionRepository.save",
            result: "a real runtime-session state was captured through the durable server-session repository",
            observations: [{surface: "library", owner: "FileSessionRepository.save", result: "saved the live-session snapshot"}],
            systemicClasses: ["durable-publication-ownership"],
        });
        evidence.record({
            id: "file-session-record-recovery", artifactKind: "fileSessionRepositoryRecord", operation: "import",
            sourcePath: sessionRecordPath, owner: "FileSessionRepository.load",
            result: "a reconstructed repository recovered the persisted versioned runtime-session record",
            observations: [{surface: "library", owner: "FileSessionRepository.load", result: "reloaded the exact persisted session state"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });

        const studioProjectsPath = path.join(workDir, "studio-app-data", "projects.json");
        const projectRegistration = new StudioProjectRegistrationService(new FileStudioProjectRegistry(studioProjectsPath));
        await expect(projectRegistration.registerExternal(packagePath, "PC-14 package")).resolves.toMatchObject({status: "ok"});
        expect(await new StudioProjectRegistrationService(new FileStudioProjectRegistry(studioProjectsPath)).list()).toEqual(expect.arrayContaining([expect.objectContaining({location: packagePath, status: "ok"})]));
        evidence.record({
            id: "studio-project-registry-reopen", artifactKind: "studioProjectRegistryEntry", operation: "import",
            sourcePath: packagePath, producedPath: studioProjectsPath, owner: "StudioProjectRegistrationService.registerExternal",
            result: "Studio registered the produced package and a new registry service reopened its persisted project entry",
            observations: [{surface: "studio-api", owner: "StudioProjectRegistrationService.list", result: "listed the persisted package registration after reconstruction"}],
            systemicClasses: ["durable-publication-ownership"],
        });

        const preparationParent = path.join(workDir, "preparation");
        const preparer = new GamePackagePreparer(POKIE_VERSION, undefined, () => Promise.reject(new Error("deliberate PC-14 dependency interruption")));
        await expect(preparer.prepare(preparationParent, "interrupted-package")).rejects.toThrow(/dependency interruption/);
        const preparationMarkerPath = path.join(preparationParent, "interrupted-package", PREPARATION_STATE_FILE);
        expect(fs.existsSync(preparationMarkerPath)).toBe(true);
        evidence.record({
            id: "package-preparation-marker-recovery", artifactKind: "preparationStateMarker", operation: "recover",
            sourcePath: path.join(preparationParent, "interrupted-package"), producedPath: preparationMarkerPath, owner: "GamePackagePreparer.prepare",
            result: "an interrupted public package preparation retained its durable retry marker rather than reporting a partial success",
            observations: [{surface: "cli", owner: "GamePackagePreparer.prepare", result: "returned the actionable dependency retry failure with marker retained"}],
            systemicClasses: ["durable-publication-ownership"],
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
            systemicClasses: ["durable-publication-ownership"],
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
            systemicClasses: ["durable-publication-ownership"],
            assertions: ["resumed generation returns ok and publishes its bundle"],
            observations: [{route: "StudioOutcomeLibraryGenerateService.generate", result: "Studio generation recovered from checkpoint"}],
        });

        const registry = await generator.registry(packagePath);
        expect(registry).toMatchObject({status: "ok"});
        if (registry.status !== "ok" || registry.buildStatus === "missing") throw new Error("Expected Studio Outcome Library registry to be available.");
        const mode = registry.modes.find((entry) => entry.modeName === "base");
        expect(mode).toMatchObject({buildStatus: "compatible"});
        if (mode === undefined || mode.bundleDir === undefined) throw new Error("Expected a compatible generated Outcome Library mode.");
        const studioRegistryIndexPath = path.join(packagePath, ".pokie", "outcome-library-registry.json");
        expect(fs.existsSync(studioRegistryIndexPath)).toBe(true);
        evidence.record({
            id: "studio-outcome-library-registry-index", artifactKind: "studioOutcomeLibraryRegistryIndex", operation: "inspect",
            sourcePath: studioRegistryIndexPath, owner: "StudioOutcomeLibraryGenerateService.registry",
            result: "Studio generated and then discovered the persisted bundle registry index",
            observations: [{surface: "studio-api", owner: "StudioOutcomeLibraryGenerateService.registry", result: "registry returned the indexed compatible real bundle"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });

        // Compatibility is a property of the generated artifact *and* its
        // current runnable owner. Rebuild independent packages and copy the
        // real managed bundle/index into them, rather than editing provenance
        // fields in place. This exercises the same registry classification a
        // reopened Studio project uses for config/hash, game, and runtime
        // version boundaries.
        const buildPackage = async (name: string, manifest: GameBlueprint["manifest"], pay: number): Promise<string> => {
            const sourcePath = path.join(workDir, `${name}.blueprint.json`);
            const targetPath = path.join(workDir, name);
            fs.writeFileSync(sourcePath, JSON.stringify({...blueprint, manifest, paytable: {A: {2: pay}}}));
            expect(await new BuildCommand(POKIE_VERSION).run([sourcePath, "--target", "tsPackage", "--out", targetPath])).toBe(0);
            fs.cpSync(path.join(packagePath, mode.bundleDir!), path.join(targetPath, mode.bundleDir!), {recursive: true});
            fs.cpSync(path.join(packagePath, ".pokie"), path.join(targetPath, ".pokie"), {recursive: true});
            return targetPath;
        };
        const stalePackage = await buildPackage("stale-package", blueprint.manifest, 4);
        const wrongGamePackage = await buildPackage("wrong-game-package", {...blueprint.manifest, id: "other-studio-artifact-torture"}, 3);
        expect(await generator.registry(stalePackage)).toMatchObject({status: "ok", buildStatus: "stale", modes: [expect.objectContaining({buildStatus: "stale"})]});
        expect(await generator.registry(wrongGamePackage)).toMatchObject({status: "ok", buildStatus: "wrong", modes: [expect.objectContaining({buildStatus: "wrong"})]});
        const upgradedGenerator = new StudioOutcomeLibraryGenerateService("1.3.1");
        expect(await upgradedGenerator.registry(packagePath)).toMatchObject({status: "ok", buildStatus: "stale", modes: [expect.objectContaining({buildStatus: "stale"})]});
        evidence.recordScenario({
            id: "studio-managed-reuse-compatibility", sourcePath: path.join(packagePath, mode.bundleDir),
            result: "Studio registry reuses only the matching managed library and classifies copied real libraries as stale for configuration/hash or POKIE-version drift and wrong for cross-game drift",
            surface: "studio-api", owner: "StudioOutcomeLibraryGenerateService.registry",
            systemicClasses: ["provenance-and-freshness-binding"],
            assertions: ["same package registry is compatible", "changed configuration is stale", "changed game id is wrong", "new POKIE version is stale"],
            observations: [{route: "StudioOutcomeLibraryGenerateService.registry", result: "real copied managed bundles were classified compatible, stale, wrong, and stale"}],
        });

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

        const managedManifest = JSON.parse(fs.readFileSync(path.join(packagePath, mode.bundleDir, "manifest.json"), "utf-8")) as {
            game: {id: string; version: string}; configHash?: string; artifactPokieVersion: string; modes: Array<{generator?: {strategy?: string; maxExactOutcomeSpaceSize?: number; compatibilityPolicyVersion?: string}}>;
        };
        const managedGenerator = managedManifest.modes[0]?.generator;
        const managedCompatibility = {
            gameId: managedManifest.game.id, gameVersion: managedManifest.game.version, configHash: managedManifest.configHash ?? "",
            pokieVersion: managedManifest.artifactPokieVersion,
            generation: managedGenerator?.strategy === "exact" ? "exact" : undefined,
            ...(managedGenerator?.maxExactOutcomeSpaceSize === undefined ? {} : {maxExactOutcomeSpaceSize: String(managedGenerator.maxExactOutcomeSpaceSize)}),
            ...(managedGenerator?.compatibilityPolicyVersion === undefined ? {} : {compatibilityPolicyVersion: managedGenerator.compatibilityPolicyVersion}),
        };
        const managedService = new ManagedOutcomeProjectService();
        await expect(managedService.registerAndOpen(blueprintPath, path.join(packagePath, mode.bundleDir), managedCompatibility)).resolves.toMatchObject({type: "outcomeLibrary"});
        const managedRegistryPath = path.join(workDir, ".pokie", "managed-outcome-projects.json");
        expect(await managedService.findCompatible(blueprintPath, managedCompatibility)).toMatchObject({rootPath: path.join(packagePath, mode.bundleDir)});
        // Compatibility includes the selected sampling/generation policy, not
        // only game/config/version.  A caller requesting a different bounded
        // policy must not borrow this managed registration.
        const incompatibleSamplingPolicy = {
            ...managedCompatibility,
            generation: "bounded",
            maxExactOutcomeSpaceSize: managedCompatibility.maxExactOutcomeSpaceSize === "1" ? "2" : "1",
            compatibilityPolicyVersion: "pc14-incompatible-sampling-policy",
        };
        expect(await managedService.findCompatible(blueprintPath, incompatibleSamplingPolicy)).toBeUndefined();
        evidence.recordScenario({
            id: "managed-reuse-sampling-policy-incompatibility", sourcePath: path.join(packagePath, mode.bundleDir), producedPath: managedRegistryPath,
            result: "the durable managed Outcome Library registry rejects reuse when the requested sampling policy differs, while retaining the compatible borrowed registration",
            surface: "library", owner: "ManagedOutcomeProjectService.findCompatible",
            systemicClasses: ["provenance-and-freshness-binding", "durable-publication-ownership"],
            assertions: ["incompatible sampling policy returns no reusable project", "existing compatible managed registration remains available"],
            observations: [{route: "ManagedOutcomeProjectService.findCompatible", result: "policy-incompatible request did not borrow the managed Outcome Library"}],
        });
        evidence.record({
            id: "managed-outcome-project-registry-reuse", artifactKind: "managedOutcomeProjectsRegistry", operation: "reuse",
            sourcePath: path.join(packagePath, mode.bundleDir), producedPath: managedRegistryPath, owner: "ManagedOutcomeProjectService.registerAndOpen/findCompatible",
            result: "the compatible produced Outcome Library was durably registered and reopened through the shared managed registry",
            observations: [{surface: "library", owner: "ManagedOutcomeProjectService.findCompatible", result: "returned the exact compatible bundle"}],
            systemicClasses: ["provenance-and-freshness-binding", "durable-publication-ownership"],
        });

        const selector = {kind: "bundle" as const, bundleDir: mode.bundleDir, modeName: "base"};
        const deployment = new StudioDeploymentService(
            undefined, undefined, undefined, undefined, undefined, undefined,
            () => Promise.resolve(["base"]), undefined, POKIE_VERSION,
            () => Promise.resolve([{modeName: "base", librarySelector: selector}]),
        );
        const deploymentResult = await deployment.run(packagePath, {targetId: "local-json-example", modes: [], publish: true});
        if (deploymentResult.status !== "ok") throw new Error(`Expected Studio deployment to complete: ${JSON.stringify(deploymentResult)}`);
        expect(deploymentResult).toMatchObject({status: "ok", view: {targetId: "local-json-example"}});
        const deploymentPath = path.join(packagePath, "deployment", "local-json-example");
        expect(fs.existsSync(deploymentPath)).toBe(true);
        evidence.record({
            id: "studio-outcome-library-selector-deployment", artifactKind: "studioOutcomeLibrarySelector", operation: "export",
            sourcePath: path.join(packagePath, mode.bundleDir), producedPath: deploymentPath, owner: "StudioDeploymentService.run",
            result: "Studio resolved the current compatible bundle selector before deployment publication",
            observations: [{surface: "studio-api", owner: "StudioDeploymentService.run", result: "resolved the verified bundle selector for base mode"}],
            systemicClasses: ["provenance-and-freshness-binding"],
        });
        evidence.record({
            id: "studio-external-deployment-publication", artifactKind: "externalDeploymentArtifact", operation: "deploy",
            sourcePath: path.join(packagePath, mode.bundleDir), producedPath: deploymentPath, owner: "StudioDeploymentService.run",
            result: "Studio's local deployment target published and validated an external deployment artifact from the selected compatible library",
            observations: [{surface: "studio-api", owner: "StudioDeploymentService.run", result: "completed target-defined deployment publication"}],
            systemicClasses: ["durable-publication-ownership"],
        });

        // Cancellation belongs to the public job routes, not just to their
        // process-local services.  Start real runnable-package jobs and
        // cancel them through HTTP before their first durable result can be
        // observed; the subsequent GET proves a cancelled job exposes neither
        // a report nor a replay descriptor for download/recovery.
        const lifecycleHome = new StudioHomeService(POKIE_VERSION);
        const lifecycleServer = new StudioServer({
            pokieVersion: POKIE_VERSION,
            host: "127.0.0.1",
            port: 0,
            studioRoot,
            homeService: lifecycleHome,
            blueprintService: new StudioBlueprintService(POKIE_VERSION, studioRoot, lifecycleHome),
            initialContext: {mode: "project", projectRoot: packagePath},
        });
        const lifecycleAddress = await lifecycleServer.start();
        try {
            const lifecycleBaseUrl = `http://${lifecycleAddress.host}:${lifecycleAddress.port}`;
            const simulationStart = await fetch(`${lifecycleBaseUrl}/api/project/simulations`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({rounds: 100000, seed: "pc14-cancel-simulation"}),
            });
            expect(simulationStart.status).toBe(202);
            const simulationJob = await simulationStart.json() as {id: string};
            expect(simulationJob.id).toEqual(expect.any(String));
            const simulationCancel = await fetch(`${lifecycleBaseUrl}/api/project/simulations/${simulationJob.id}`, {method: "DELETE"});
            expect(simulationCancel.status).toBe(200);
            const cancelledSimulation = await waitForStudioJob(
                () => fetch(`${lifecycleBaseUrl}/api/project/simulations/${simulationJob.id}`).then(async (response) => ({status: response.status, body: await response.json()})),
            );
            expect(cancelledSimulation).toMatchObject({status: 200, body: {status: "cancelled"}});
            const simulationDownload = await fetch(`${lifecycleBaseUrl}/api/project/reports/${simulationJob.id}`);
            expect(simulationDownload.status).toBe(409);

            const replayStart = await fetch(`${lifecycleBaseUrl}/api/project/replays`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({round: 100000, seed: "pc14-cancel-replay"}),
            });
            expect(replayStart.status).toBe(202);
            const replayJob = await replayStart.json() as {id: string};
            expect(replayJob.id).toEqual(expect.any(String));
            const replayCancel = await fetch(`${lifecycleBaseUrl}/api/project/replays/${replayJob.id}`, {method: "DELETE"});
            expect(replayCancel.status).toBe(200);
            const cancelledReplay = await waitForStudioJob(
                () => fetch(`${lifecycleBaseUrl}/api/project/replays/${replayJob.id}`).then(async (response) => ({status: response.status, body: await response.json()})),
            );
            expect(cancelledReplay).toMatchObject({status: 200, body: {status: "cancelled"}});
            const replayDownload = await fetch(`${lifecycleBaseUrl}/api/project/replays/${replayJob.id}/download`);
            expect(replayDownload.status).toBe(409);
        } finally {
            await lifecycleServer.stop();
        }
        evidence.recordScenario({
            id: "studio-simulation-replay-cancellation", sourcePath: packagePath,
            result: "Studio HTTP cancellation transitions real simulation and replay jobs to terminal cancelled states without retaining a report or replay descriptor",
            surface: "studio-api", owner: "StudioServer / StudioSimulationService / StudioReplayExecutionService",
            systemicClasses: ["durable-publication-ownership"],
            assertions: ["DELETE simulation reaches cancelled and report retrieval remains not-ready", "DELETE replay reaches cancelled and replay download remains not-ready"],
            observations: [
                {route: "POST /api/project/simulations", result: "created a real package simulation job"},
                {route: "DELETE /api/project/simulations/:id", result: "cancelled that job"},
                {route: "GET /api/project/simulations/:id", result: "polled terminal cancelled simulation"},
                {route: "POST /api/project/replays", result: "created a real package replay job"},
                {route: "DELETE /api/project/replays/:id", result: "cancelled that job"},
                {route: "GET /api/project/replays/:id", result: "polled terminal cancelled replay"},
            ],
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
        // The HTTP routes own generic game simulation/replay while the direct
        // outcome-source services own their narrower operations. Record each
        // concrete diagnostic separately; treating either as the other would
        // incorrectly claim API/service parity for different public actions.
        const httpSimulationDiagnostic = describeUnavailableArtifactOperation(wasmProject, "sim");
        const httpReplayDiagnostic = describeUnavailableArtifactOperation(wasmProject, "replay");
        if (httpSimulationDiagnostic === undefined || httpReplayDiagnostic === undefined) {
            throw new Error("Expected the shared Studio HTTP diagnostics.");
        }
        // Services are direct Studio-library callers, but the persisted API
        // observations must come from the HTTP owners themselves.  Open the
        // same generated component in a real Studio server and retain only
        // the two routes actually requested below.
        const wasmHome = new StudioHomeService(POKIE_VERSION);
        const wasmServer = new StudioServer({
            pokieVersion: POKIE_VERSION,
            host: "127.0.0.1",
            port: 0,
            studioRoot,
            homeService: wasmHome,
            blueprintService: new StudioBlueprintService(POKIE_VERSION, studioRoot, wasmHome),
            initialContext: {mode: "project", projectRoot: wasmPath},
        });
        const wasmAddress = await wasmServer.start();
        try {
            const wasmBaseUrl = `http://${wasmAddress.host}:${wasmAddress.port}`;
            const simulationResponse = await fetch(`${wasmBaseUrl}/api/project/simulations`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({rounds: 1}),
            });
            expect(simulationResponse.status).toBe(409);
            expect(await simulationResponse.json()).toEqual({error: httpSimulationDiagnostic.message});
            const replayResponse = await fetch(`${wasmBaseUrl}/api/project/replays`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({round: 1}),
            });
            expect(replayResponse.status).toBe(409);
            expect(await replayResponse.json()).toEqual({error: httpReplayDiagnostic.message});
        } finally {
            await wasmServer.stop();
        }
        evidence.recordUnavailable({
            id: "studio-wasm-outcome-source-simulate", artifactKind: "wasmComponent", operation: "simulate", sourcePath: wasmPath,
            owner: "StudioSimulationService / ArtifactOperationDiagnostic",
            diagnostic: {code: simulationDiagnostic.code, message: simulationDiagnostic.message, recovery: simulationDiagnostic.recovery},
            observations: [{surface: "library", owner: "StudioSimulationService.start", result: "returned the resolved outcome-source diagnostic"}],
            systemicClasses: ["shared-conversion-diagnostic-parity"],
        });
        evidence.recordUnavailable({
            id: "studio-wasm-outcome-source-replay", artifactKind: "wasmComponent", operation: "replay", sourcePath: wasmPath,
            owner: "StudioReplayExecutionService / ArtifactOperationDiagnostic",
            diagnostic: {code: replayDiagnostic.code, message: replayDiagnostic.message, recovery: replayDiagnostic.recovery},
            observations: [{surface: "library", owner: "StudioReplayExecutionService.start", result: "returned the resolved outcome-source diagnostic"}],
            systemicClasses: ["shared-conversion-diagnostic-parity"],
        });
        evidence.recordUnavailable({
            id: "studio-wasm-simulate", artifactKind: "wasmComponent", operation: "simulate", sourcePath: wasmPath,
            owner: "StudioServer / ArtifactOperationDiagnostic",
            diagnostic: {code: httpSimulationDiagnostic.code, message: httpSimulationDiagnostic.message, recovery: httpSimulationDiagnostic.recovery},
            observations: [{surface: "studio-api", owner: "StudioServer POST /api/project/simulations", result: "returned HTTP 409 with the resolved simulation diagnostic"}],
            systemicClasses: ["shared-conversion-diagnostic-parity"],
        });
        evidence.recordUnavailable({
            id: "studio-wasm-replay", artifactKind: "wasmComponent", operation: "replay", sourcePath: wasmPath,
            owner: "StudioServer / ArtifactOperationDiagnostic",
            diagnostic: {code: httpReplayDiagnostic.code, message: httpReplayDiagnostic.message, recovery: httpReplayDiagnostic.recovery},
            observations: [{surface: "studio-api", owner: "StudioServer POST /api/project/replays", result: "returned HTTP 409 with the resolved replay diagnostic"}],
            systemicClasses: ["shared-conversion-diagnostic-parity"],
        });
        evidence.recordScenario({
            id: "studio-wasm-boundary", sourcePath: wasmPath,
            result: "Studio HTTP simulation/replay and direct outcome-source services reject the resolved WASM component before creating a job, each retaining its concrete shared diagnostic recovery",
            surface: "studio-api", owner: "StudioSimulationService / StudioReplayExecutionService",
            systemicClasses: ["shared-conversion-diagnostic-parity"],
            assertions: ["neither Studio HTTP route creates a job for the unavailable component", "HTTP and direct outcome-source owners retain their operation-specific shared diagnostic message"],
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

async function waitForStudioJob(
    get: () => Promise<{readonly status: number; readonly body: {readonly status?: string}}>,
): Promise<{readonly status: number; readonly body: {readonly status?: string}}> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        const result = await get();
        if (result.body.status === "completed" || result.body.status === "failed" || result.body.status === "cancelled") return result;
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
    }
    throw new Error("Studio artifact job did not reach a terminal state while exercising its public polling route.");
}
