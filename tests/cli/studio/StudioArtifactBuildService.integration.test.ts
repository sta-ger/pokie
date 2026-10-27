import {createPackageExtractionTestEnvironment, PACKAGE_EXTRACTION_TEST_TIMEOUT, writeDescriptorPackage} from "../../v2/fixtures/PackageExtractionFixture.js";
import fs from "fs";
import ts from "typescript";
import {GamePackageGenerator, loadGameBlueprint} from "@fromstan/pokie";
import {StudioArtifactPreflightWorker} from "../../../cli/studio/artifacts/StudioArtifactPreflightWorker.js";
import {StudioServer} from "../../../cli/studio/StudioServer.js";
import {StudioHomeService} from "../../../cli/studio/home/StudioHomeService.js";
import {StudioBlueprintService} from "../../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioProjectRegistrationService} from "../../../cli/studio/StudioProjectRegistrationService.js";
import {passthroughRuntimePackageResolver} from "../../../cli/materialize/materializeRuntimePackage.js";
import {StudioOptimizationService} from "../../../cli/studio/optimization/StudioOptimizationService.js";
import {StudioJobService} from "../../../cli/studio/jobs/StudioJobService.js";
import {FileStudioJobRepository} from "../../../cli/studio/jobs/FileStudioJobRepository.js";
import {ProjectOptimizationService} from "../../../src/optimization/ProjectOptimizationService.js";
import {optimizationBlueprint, optimizationRequest} from "../../v2/fixtures/OptimizationFixture.js";
import os from "os";
import path from "path";
import {StudioArtifactBuildService} from "../../../cli/studio/artifacts/StudioArtifactBuildService.js";
import {ParSheetExporter} from "../../../src/parsheet/ParSheetExporter.js";
import {localPokieDependencyRunner, REPO_ROOT} from "../../testUtils/offlinePokieDependencyOverride.js";
import {prepareExactCodeFirstPackage} from "../../testUtils/prepareExactCodeFirstPackage.js";
import {ensureCompiledTestOutput} from "../../testUtils/ensureCompiledTestOutput.js";

// Compile only the worker's CLI module closure. It resolves the already prepared real runtime
// through ordinary package exports, without a Jest import hook or a full CLI/package build.
function emitPreflightWorker(parent: string): string {
    const root = path.join(parent, "preflight-host");
    const emitted = new Set<string>();
    const emit = (relative: string): void => {
        if (emitted.has(relative)) return;
        emitted.add(relative);
        const output = ts.transpileModule(fs.readFileSync(path.join(REPO_ROOT, relative), "utf8"), {
            compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true},
        }).outputText;
        const file = path.join(root, relative.replace(/\.ts$/, ".js"));
        fs.mkdirSync(path.dirname(file), {recursive: true});
        fs.writeFileSync(file, output);
        for (const match of output.matchAll(/require\("(\.[^"]+\.js)"\)/g)) emit(path.join(path.dirname(relative), match[1]).replace(/\.js$/, ".ts"));
    };
    emit("cli/studio/artifacts/artifactPreflightWorkerEntry.ts");
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({type: "commonjs"}));
    const link = path.join(root, "node_modules/@fromstan/pokie");
    fs.mkdirSync(path.dirname(link), {recursive: true});
    fs.symlinkSync(REPO_ROOT, link, "dir");
    return path.join(root, "cli/studio/artifacts/artifactPreflightWorkerEntry.js");
}

async function until<T>(read: () => T | undefined): Promise<T> {
    const deadline = Date.now() + 30_000;
    for (;;) {
        const value = read();
        if (value !== undefined) return value;
        if (Date.now() >= deadline) throw new Error("Owned artifact operation did not settle");
        await new Promise(resolve => {
            setTimeout(resolve, 25);
        });
    }
}

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

    let restoreTemporaryDirectory: () => void;
    beforeAll(() => {
        restoreTemporaryDirectory = createPackageExtractionTestEnvironment();
    });
    afterAll(() => {
        restoreTemporaryDirectory();
    });

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-artifact-build-integration-test-"));
        service = new StudioArtifactBuildService("1.3.0");
    });

    afterEach(() => {
        fs.rmSync(workDir, {recursive: true, force: true});
    });

    it("takes a real PAR workbook through each planner-owned target while retaining durable imported Blueprint evidence", async () => {
        const workbookPath = path.join(workDir, "source.par.xlsx");
        const blueprint = {
            manifest: {id: "studio-par-route", name: "Studio PAR Route", version: "1.0.0"},
            reels: 2,
            rows: 1,
            symbols: ["A", "B"],
            paytable: {A: {2: 1}},
            reelStrips: [["A", "B"], ["A", "B"]],
            availableBets: [1],
        };
        await new ParSheetExporter("1.3.0").exportToFile(blueprint, workbookPath, workbookPath);

        expect(await service.listTargets(workbookPath)).toEqual(expect.arrayContaining([
            expect.objectContaining({target: "blueprint", supported: true}),
            expect.objectContaining({target: "tsPackage", supported: true}),
            expect.objectContaining({target: "outcomeLibrary", supported: true}),
            expect.objectContaining({target: "stakeAdapter", supported: true}),
            expect.objectContaining({target: "wasm", supported: true}),
        ]));

        for (const target of ["blueprint", "tsPackage", "outcomeLibrary", "stakeAdapter"] as const) {
            const destination = target === "blueprint"
                ? path.join(workDir, target, "imported.blueprint.json")
                : path.join(workDir, target);
            const result = await service.build(workbookPath, target, destination);

            expect(result).toMatchObject({
                status: "ok",
                target,
                outputPath: destination,
                sourceType: "parWorkbook",
                conversionEvidencePath: expect.any(String),
                ...(target === "blueprint" ? {} : {importedBlueprintPath: expect.any(String)}),
            });
            if (result.status !== "ok" || result.conversionEvidencePath === undefined) {
                throw new Error("expected durable PAR conversion identities");
            }
            const importedBlueprintPath = result.importedBlueprintPath ?? result.outputPath;
            expect(fs.existsSync(importedBlueprintPath)).toBe(true);
            expect(fs.existsSync(result.conversionEvidencePath)).toBe(true);
            expect(JSON.parse(fs.readFileSync(importedBlueprintPath, "utf-8"))).toMatchObject({manifest: blueprint.manifest});
            expect(JSON.parse(fs.readFileSync(result.conversionEvidencePath, "utf-8"))).toMatchObject({
                sourceWorkbook: workbookPath,
                importedBlueprintHash: expect.stringMatching(/^sha256:/),
            });
            expect(fs.existsSync(destination)).toBe(true);
        }

        const wasmDestination = path.join(workDir, "game.wasm");
        const wasmImportedBlueprintPath = `${wasmDestination}.pokie/par-import/imported.blueprint.json`;
        const wasmConversionEvidencePath = `${wasmDestination}.pokie/par-import/conversion-evidence.json`;
        const wasmPreview = await service.preview(workbookPath, "wasm", wasmDestination);
        expect(wasmPreview).toMatchObject({
            status: "ok",
            target: "wasm",
            destination: wasmDestination,
            destinationKind: "file",
        });
        if (wasmPreview.status !== "ok") throw new Error("expected WASM preview");
        expect(wasmPreview.plan.steps[0]).toMatchObject({
            kind: "importParWorkbook",
            output: {canonicalLocation: wasmImportedBlueprintPath},
            conversionEvidencePath: wasmConversionEvidencePath,
        });
        expect(fs.existsSync(wasmImportedBlueprintPath)).toBe(false);
        expect(fs.existsSync(wasmConversionEvidencePath)).toBe(false);
        const wasmResult = await service.build(workbookPath, "wasm", wasmDestination);

        expect(wasmResult).toMatchObject({
            status: "ok",
            target: "wasm",
            outputPath: wasmDestination,
            outputKind: "file",
            sourceType: "parWorkbook",
            importedBlueprintPath: wasmImportedBlueprintPath,
            conversionEvidencePath: wasmConversionEvidencePath,
        });
        expect(fs.existsSync(wasmDestination)).toBe(true);
        expect(fs.existsSync(`${wasmDestination}.pokie-wasm.json`)).toBe(true);
        expect(fs.existsSync(wasmImportedBlueprintPath)).toBe(true);
        expect(fs.existsSync(wasmConversionEvidencePath)).toBe(true);
    });

    it("uses the same registry Outcome reuse and Stake flow for a real pokie init code-first package", async () => {
        const packageRoot = path.join(workDir, "code-first-package");
        const outcomeDir = path.join(workDir, "outcomes");
        const secondOutcomeDir = path.join(workDir, "second-outcomes");
        const stakeDir = path.join(workDir, "stake");
        await prepareExactCodeFirstPackage(packageRoot, localPokieDependencyRunner());
        const entry = fs.readFileSync(path.join(packageRoot, "dist", "index.js"));

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
        await expect(service.build(packageRoot, "outcomeLibrary", secondOutcomeDir)).resolves.toMatchObject({
            status: "ok",
            target: "outcomeLibrary",
            outputPath: secondOutcomeDir,
            outputKind: "directory",
            sourceType: "tsPackage",
            plan: {status: "planned", steps: [expect.objectContaining({kind: "reuseManagedOutcomeLibrary"}), expect.objectContaining({kind: "publish"})]},
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
        expect(unsupportedBuild).toMatchObject({
            status: "unsupported",
            target: "parWorkbook",
            message: expect.stringContaining("Package extraction partial:"),
            plan: {
                status: "unavailable", diagnostic: {failedEdge: {from: "tsPackage", to: "parWorkbook"}},
                packageExtraction: {status: "partial", diagnostics: expect.arrayContaining([expect.objectContaining({code: "legacy-model-unavailable"})])},
            },
        });
        expect(fs.existsSync(path.join(workDir, "unsupported.xlsx"))).toBe(false);
        expect(fs.readFileSync(path.join(packageRoot, "dist", "index.js"))).toEqual(entry);
    }, 3 * PACKAGE_EXTRACTION_TEST_TIMEOUT);

    it("keeps the registry's bounded managed-coverage default for large Blueprint Outcome builds", async () => {
        const blueprintPath = path.join(workDir, "large.blueprint.json");
        const outcomeDir = path.join(workDir, "outcomes");
        fs.writeFileSync(
            blueprintPath,
            JSON.stringify({
                manifest: {id: "large-studio-slot", name: "Large Studio Slot", version: "1.0.0"},
                reels: 5,
                rows: 1,
                symbols: ["A"],
                paytable: {A: {3: 1, 4: 2, 5: 3}},
                reelStrips: Array.from({length: 5}, () => Array.from({length: 10}, () => "A")),
                availableBets: [1],
            }),
        );

        await expect(service.build(blueprintPath, "outcomeLibrary", outcomeDir)).resolves.toMatchObject({
            status: "ok",
            target: "outcomeLibrary",
            outputPath: outcomeDir,
            outputKind: "directory",
            sourceType: "blueprint",
        });
        const manifest = JSON.parse(fs.readFileSync(path.join(outcomeDir, "manifest.json"), "utf-8")) as {
            modes: Array<{generator: {strategy: string; totalOutcomeSpaceSize: number; sampledRawCount: number; seed?: string}}>;
        };
        expect(manifest.modes[0].generator).toEqual(expect.objectContaining({
            strategy: "bounded-coverage",
            totalOutcomeSpaceSize: 100_000,
            sampledRawCount: 5_000,
            seed: expect.stringMatching(/^pokie-managed-coverage:sha256:/),
        }));
    });
    it("drains installed-runtime preflights before retaining reviewed extraction provenance for Build", async () => {
        const entry = emitPreflightWorker(workDir);
        const preflight = new StudioArtifactPreflightWorker("2.0.0", REPO_ROOT, entry);
        service = new StudioArtifactBuildService("2.0.0", undefined, undefined, undefined, undefined, REPO_ROOT, undefined, preflight);
        const blueprint = {...optimizationBlueprint(), manifest: {id: "preflight-slot", name: "Preflight slot", version: "1"}};
        const source = new GamePackageGenerator("2.0.0").generate(blueprint, workDir, undefined, undefined, {runtimePackageRoot: REPO_ROOT}).projectRoot;
        const sourceEntry = fs.readFileSync(path.join(source, "dist/index.js"));
        const listeners = process.listenerCount("exit");
        const snapshots = () => fs.readdirSync(os.tmpdir()).filter(name => name.startsWith("pokie-preflight-"));
        const initialSnapshots = snapshots();
        try {
            expect(await service.listTargets(source)).toEqual(expect.arrayContaining([
                expect.objectContaining({target: "blueprint", supported: true}),
                expect.objectContaining({target: "tsPackage", supported: true}),
                expect.objectContaining({target: "stakeAdapter", supported: true}),
            ]));
            expect(await service.preview(source, "blueprint", path.join(source, "package.json"))).toMatchObject({status: "conflict"});
            // Repeated destination checks must not accumulate runtime imports/listeners in Studio.
            let reviewed;
            let previous: {id: string; destination: string} | undefined;
            for (let edit = 0; edit < 3; edit++) {
                reviewed = await service.preview(source, "blueprint", path.join(workDir, `reviewed-${edit}.json`));
                expect(reviewed).toMatchObject({status: "ok", preparedOperationId: expect.any(String),
                    plan: {packageExtraction: {status: "complete", source: {kind: "generated"}}}});
                expect(process.listenerCount("exit")).toBe(listeners);
                expect(snapshots()).toEqual(initialSnapshots);
                if (previous !== undefined) expect(service.startPreparedExtraction(source, previous.id, previous.destination)).toEqual({status: "stale"});
                if (reviewed.status === "ok" && reviewed.preparedOperationId) previous = {id: reviewed.preparedOperationId, destination: reviewed.destination};
            }
            // Sibling callers use the same inspection boundary and preserve their own DTO/authority.
            const packagePreview = await service.preview(source, "tsPackage", path.join(workDir, "rebuilt"));
            expect(packagePreview).toMatchObject({status: "ok", destinationKind: "directory", sourceType: "tsPackage"});
            const stakePreview = await service.preview(source, "stakeAdapter", path.join(workDir, "stake-preview"));
            expect(stakePreview).toMatchObject({status: "ok", preparedOperationId: expect.any(String), stakePreflight: {route: "generate"}});
            if (stakePreview.status !== "ok" || !stakePreview.preparedOperationId) throw new Error("Expected prepared Stake authority");
            expect(service.preparedStakeProjectionDestination(source, stakePreview.preparedOperationId)).toBe(path.join(workDir, "stake-preview"));
            expect(process.listenerCount("exit")).toBe(listeners);
            expect(snapshots()).toEqual(initialSnapshots);
            if (reviewed?.status !== "ok" || !reviewed.preparedOperationId) throw new Error("Expected extraction authority");
            expect(service.startPreparedExtraction(source, reviewed.preparedOperationId, path.join(workDir, "unreviewed.json"))).toEqual({status: "stale"});
            const started = service.startPreparedExtraction(source, reviewed.preparedOperationId, reviewed.destination);
            if (started.status !== "created") throw new Error(`Build refused: ${started.status}`);
            const terminal = await until(() => {
                const job = service.getStatusForProject(source, started.job.id);
                return job && !["queued", "running"].includes(job.status) ? job : undefined;
            });
            expect(terminal).toMatchObject({status: "completed", result: {status: "ok", sourceType: "tsPackage", conversionEvidencePath: expect.any(String)}});
            if (terminal.result?.status !== "ok" || !terminal.result.conversionEvidencePath) throw new Error("Missing extraction provenance");
            expect(loadGameBlueprint(terminal.result.outputPath)).toMatchObject(blueprint);
            expect(JSON.parse(fs.readFileSync(terminal.result.conversionEvidencePath, "utf8"))).toMatchObject({kind: "package-extraction", sourceBindingHash: expect.stringMatching(/^sha256:/), extractedBlueprintHash: expect.stringMatching(/^sha256:/), extraction: {source: {location: source}}});
            expect(fs.readFileSync(path.join(source, "dist/index.js"))).toEqual(sourceEntry);
            expect(service.startPreparedExtraction(source, reviewed.preparedOperationId, reviewed.destination)).toEqual({status: "stale"});
            expect(await service.preview(source, "blueprint", reviewed.destination)).toMatchObject({status: "conflict"});
            // Consume the returned file at the real optimizer boundary, then explicitly Apply once.
            const extracted = terminal.result.outputPath;
            const jobs = new StudioJobService(new FileStudioJobRepository(path.join(workDir, "optimizer-jobs")));
            const optimizer = new StudioOptimizationService(jobs, new ProjectOptimizationService(path.join(workDir, "optimizer-scratch")));
            const request = optimizationRequest();
            const context = {projectRoot: extracted, projectId: extracted, isCurrent: () => true};
            try {
                const support = await optimizer.handle("POST", "support", {request, expectedProjectRoot: extracted}, context);
                expect(support).toMatchObject({status: 200, body: {supported: true}});
                const {sourceRevision} = support.body as {sourceRevision: string};
                const start = await optimizer.handle("POST", "start", {request, expectedProjectRoot: extracted, sourceRevision}, context);
                expect(start.status).toBe(202);
                const {job} = start.body as {job: {id: string}};
                await optimizer.drain();
                expect(jobs.get(extracted, job.id)).toMatchObject({status: "completed", result: {detail: {status: "success", evidence: {measured: [0.75]}}}});
                const apply = {request, expectedProjectRoot: extracted, jobId: job.id};
                expect(await optimizer.handle("POST", "apply", apply, context)).toMatchObject({status: 200, body: {outputPath: extracted}});
                expect(loadGameBlueprint(extracted).paytable.A[2]).toBe(3);
                expect(await optimizer.handle("POST", "apply", apply, context)).toMatchObject({status: 409});
            } finally {
                await optimizer.shutdown();
            }
        } finally {
            await service.cancelAll();
        }
    }, PACKAGE_EXTRACTION_TEST_TIMEOUT);

    it("cancels executing and queued preflights, drains snapshots and lets the current destination finish", async () => {
        const entry = emitPreflightWorker(workDir);
        const preflight = new StudioArtifactPreflightWorker("2.0.0", REPO_ROOT, entry);
        service = new StudioArtifactBuildService("2.0.0", undefined, undefined, undefined, undefined, REPO_ROOT, undefined, preflight);
        const startedPath = path.join(workDir, "descriptor-started");
        const source = writeDescriptorPackage(workDir, {descriptorBody: `require("fs").writeFileSync(${JSON.stringify(startedPath)}, "started"); return new Promise(() => {});`});
        const controller = new AbortController();
        const executing = service.preview(source, "blueprint", path.join(workDir, "obsolete.json"), controller.signal);
        const rejected = expect(executing).rejects.toThrow(/cancel/i);
        try {
            await until(() => fs.existsSync(startedPath) ? true : undefined);
            const queuedController = new AbortController();
            const queued = service.preview(source, "blueprint", path.join(workDir, "queued.json"), queuedController.signal);
            const queuedRejected = expect(queued).rejects.toThrow();
            queuedController.abort();
            controller.abort();
            await rejected;
            await queuedRejected;
            expect(fs.readdirSync(os.tmpdir()).filter(name => name.startsWith("pokie-preflight-"))).toEqual([]);
            expect(fs.existsSync(path.join(workDir, "obsolete.json"))).toBe(false);
            expect(fs.existsSync(path.join(workDir, "queued.json"))).toBe(false);
            const corrected = writeDescriptorPackage(workDir, {name: "corrected"});
            expect(await service.preview(corrected, "blueprint", path.join(workDir, "current.json"))).toMatchObject({status: "ok", preparedOperationId: expect.any(String)});
            // Project switching and shutdown own cancellation too, independent of an HTTP abort.
            fs.rmSync(startedPath);
            const abandoned = service.preview(source, "blueprint", path.join(workDir, "abandoned.json"));
            const abandonedRejected = expect(abandoned).rejects.toThrow(/cancel/i);
            await until(() => fs.existsSync(startedPath) ? true : undefined);
            service.cancelActiveForProject(source);
            await abandonedRejected;
        } finally {
            controller.abort();
            await service.cancelAll();
        }
        expect(fs.readdirSync(os.tmpdir()).filter(name => name.startsWith("pokie-preflight-"))).toEqual([]);
    }, PACKAGE_EXTRACTION_TEST_TIMEOUT);

    it("keeps HTTP recognition guards free of runtime imports and aborts the owning preview on disconnect", async () => {
        const entry = emitPreflightWorker(workDir);
        const preflight = new StudioArtifactPreflightWorker("2.0.0", REPO_ROOT, entry);
        service = new StudioArtifactBuildService("2.0.0", undefined, undefined, undefined, undefined, REPO_ROOT, undefined, preflight);
        const startedPath = path.join(workDir, "http-descriptor-started");
        const imports = path.join(workDir, "runtime-imports");
        const source = writeDescriptorPackage(workDir);
        const sourceEntry = path.join(source, "index.js");
        const recordImports = (): void => {
            fs.appendFileSync(sourceEntry, `\nrequire("fs").appendFileSync(${JSON.stringify(imports)}, require("worker_threads").isMainThread ? "main\\n" : "worker\\n");`);
        };
        recordImports();
        const home = new StudioHomeService("2.0.0");
        const server = new StudioServer({pokieVersion: "2.0.0", port: 0, studioRoot: workDir,
            initialContext: {mode: "project", projectRoot: source}, homeService: home,
            blueprintService: new StudioBlueprintService("2.0.0", workDir, home),
            projectRegistrationService: new StudioProjectRegistrationService(),
            jobService: new StudioJobService(new FileStudioJobRepository(path.join(workDir, "http-jobs"))),
            resolveRuntimePackageRoot: passthroughRuntimePackageResolver, artifactBuildService: service});
        const address = await server.start();
        const base = `http://${address.host}:${address.port}`;
        const controller = new AbortController();
        try {
            const deadline = Date.now() + 30_000;
            for (;;) {
                const context = await (await fetch(`${base}/api/project/context`)).json() as {status: string};
                if (context.status === "loaded") break;
                if (Date.now() >= deadline) throw new Error(`Project did not open: ${context.status}`);
                await new Promise(resolve => {
                    setTimeout(resolve, 25);
                });
            }
            const mainImports = () => fs.readFileSync(imports, "utf8").split("\n").filter(line => line === "main").length;
            const openedImports = mainImports();
            expect(openedImports).toBeGreaterThan(0);
            // Game Model and Inspect need type recognition only. A WASM guard must likewise
            // inspect current capabilities before queuing preflight, without executing a package.
            for (const route of ["gameModel", "inspect", "gameModel"]) expect((await fetch(`${base}/api/project/${route}`)).status).toBe(200);
            expect(mainImports()).toBe(openedImports);
            writeDescriptorPackage(workDir, {descriptorBody: `require("fs").writeFileSync(${JSON.stringify(startedPath)}, "started"); return new Promise(() => {});`});
            recordImports();
            const pending = fetch(`${base}/api/project/artifacts/preview`, {method: "POST", signal: controller.signal,
                headers: {"Content-Type": "application/json"}, body: JSON.stringify({target: "blueprint", outDir: path.join(workDir, "http-obsolete.json")})});
            const rejected = expect(pending).rejects.toThrow();
            await until(() => fs.existsSync(startedPath) ? true : undefined);
            expect(mainImports()).toBe(openedImports);
            controller.abort();
            await rejected;
            await until(() => fs.readdirSync(os.tmpdir()).some(name => name.startsWith("pokie-preflight-")) ? undefined : true);
            expect(fs.existsSync(path.join(workDir, "http-obsolete.json"))).toBe(false);
            writeDescriptorPackage(workDir);
            recordImports();
            const corrected = await fetch(`${base}/api/project/artifacts/preview`, {method: "POST", headers: {"Content-Type": "application/json"},
                body: JSON.stringify({target: "blueprint", outDir: path.join(workDir, "http-current.json")})});
            expect(corrected.status).toBe(200);
            expect(await corrected.json()).toMatchObject({status: "ok", preparedOperationId: expect.any(String)});
            expect(mainImports()).toBe(openedImports);
            // An unrecognized package still gets its established metadata-only diagnostic,
            // rather than entering executable extraction through the injected reader.
            fs.writeFileSync(path.join(source, "package.json"), JSON.stringify({name: "metadata-only", version: "1"}));
            const metadata = await fetch(`${base}/api/project/gameModel`);
            expect(metadata.status).toBe(200);
            expect(JSON.stringify(await metadata.json())).toContain("has metadata only");
            expect(mainImports()).toBe(openedImports);
        } finally {
            controller.abort();
            await server.stop();
        }
        expect(fs.readdirSync(os.tmpdir()).filter(name => name.startsWith("pokie-preflight-"))).toEqual([]);
    }, PACKAGE_EXTRACTION_TEST_TIMEOUT);

});
