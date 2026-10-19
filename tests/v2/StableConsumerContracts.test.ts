import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import * as api from "@fromstan/pokie";
import {fractionalBetBlueprint, FRACTIONAL_MIXED_CONTINUATION, screenMultiplier} from "../fixtures/math/FractionalBetFixture.js";
import {authoritativePaytableBlueprint} from "../fixtures/math/AuthoritativePaytableFixture.js";
import {buildSingleOutcomeStakeEngineLibrary} from "../stakeengine/StakeEngineTestFixtures.js";
import {expectRareMetrics, rareStakeSource} from "../stakeengine/standalone/StakeProbabilityTestFixtures.js";
import {weightedBonusBlueprint} from "./fixtures/WeightedBonusGame.js";

import {selectPackedArchive} from "../packaging/helpers/selectPackedArchive.js";
import {CreateCommand} from "../../cli/commands/CreateCommand.js";
import {BuildCommand} from "../../cli/commands/BuildCommand.js";
import {ValidateCommand} from "../../cli/commands/ValidateCommand.js";
import {SimCommand} from "../../cli/commands/SimCommand.js";
import {ReportCommand} from "../../cli/commands/ReportCommand.js";
import {ReplayCommand} from "../../cli/commands/ReplayCommand.js";
import {createMaterializingRuntimePackageResolver} from "../../cli/materialize/materializeRuntimePackage.js";
import {FileStudioJobRepository} from "../../cli/studio/jobs/FileStudioJobRepository.js";
import {StudioJobService} from "../../cli/studio/jobs/StudioJobService.js";

// Source contracts only. Native installation, declarations and browser execution belong to npmPackSmoke.
function generated(model: api.GameBlueprint): api.PokieGame {
    const module = {exports: {}};
    vm.runInNewContext(`(function(require, module) {${api.renderBuiltGameModule(model, api.POKIE_VERSION)}\n})`)(
        (name: string) => {
            if (name !== "@fromstan/pokie") throw new Error(`Unexpected generated dependency: ${name}`);
            return api;
        }, module,
    );
    return module.exports as api.PokieGame;
}

let directory: string;
beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-stable-consumer-"));
});
afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(directory, {recursive: true, force: true});
});

it("creates an editable Blueprint through the public command and builds a usable PAR-to-WASM conversion", async () => {
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    const file = path.join(directory, "editable.blueprint.json");
    expect(await new CreateCommand(api.POKIE_VERSION).run(["Consumer", "--random", "--seed", "71", "--out", file])).toBe(0);
    expect((await new api.ProjectTargetResolver().resolve(file))?.type).toBe("blueprint");
    // An authored edit is the input to every later conversion, not an implicit save from a preview.
    const model = fractionalBetBlueprint([0.05], true);
    model.manifest.name = "Authored Consumer";
    fs.writeFileSync(file, JSON.stringify(model));
    expect(await new ValidateCommand().run([file, "--format", "json"])).toBe(0);
    const workbook = path.join(directory, "authored.xlsx");
    const wasm = path.join(directory, "converted.wasm");
    const build = new BuildCommand(api.POKIE_VERSION);
    await build.run([file, "--target", "parWorkbook", "--out", workbook]);
    await build.run([workbook, "--target", "wasm", "--out", wasm]);
    const evidence = JSON.parse(fs.readFileSync(`${wasm}.pokie/par-import/conversion-evidence.json`, "utf8"));
    expect(evidence).toMatchObject({schemaVersion: 1, sourceWorkbook: workbook, losslessEligible: true, provenanceHashMatches: true});
    const runtime = await api.loadPokieWasmFileRuntime(wasm, new api.SeededPokieWasmHost("0"));
    try {
        expect(runtime.manifest.component).toEqual({id: model.manifest.id, version: model.manifest.version});
        const round = await runtime.createSession("0").play({bet: 0.05});
        expect(round).toMatchObject({stake: 0.05, payout: 0.1, screen: FRACTIONAL_MIXED_CONTINUATION[0].screen});
    } finally {
        runtime.dispose();
    }
    expect(fs.readFileSync(file, "utf8")).toBe(JSON.stringify(model));
    const before = fs.readFileSync(wasm);
    await expect(build.run([workbook, "--target", "wasm", "--out", wasm])).rejects.toThrow();
    expect(fs.readFileSync(wasm)).toEqual(before);
});

it.each(["blueprint", "parWorkbook"] as const)("converges %s simulation, report and replay at the shared runtime boundary and releases failed loads", async type => {
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    const model = fractionalBetBlueprint([0.05], true);
    const source = path.join(directory, type === "blueprint" ? "game.json" : "game.xlsx");
    if (type === "blueprint") fs.writeFileSync(source, JSON.stringify(model));
    else await new api.ParSheetExporter(api.POKIE_VERSION).exportToFile(model, source);
    const original = fs.readFileSync(source);
    const games = new Map<string, api.PokieGame>();
    const stages: string[] = [];
    let releases = 0;
    // The executable is evaluated against source exports only. npm/native installation is
    // deliberately absent here; npmPackSmoke owns that separate acceptance boundary.
    const materializer: api.ProjectMaterializing = {materialize: project => {
        expect(project.type).toBe("blueprint");
        stages.push(project.rootPath);
        const runtimePath = path.join(directory, `runtime-${stages.length}`);
        games.set(runtimePath, generated(api.loadGameBlueprint(project.rootPath)));
        return Promise.resolve({runtimePath, ownsRuntimePath: true, release: () => {
            releases++;
            games.delete(runtimePath);
            return Promise.resolve();
        }});
    }};
    const resolver = (operation: api.PokieOperation) => createMaterializingRuntimePackageResolver(api.POKIE_VERSION, operation, undefined, {materializer});
    const load = jest.fn((runtimePath: string) => {
        const game = games.get(runtimePath);
        if (!game) throw new Error("Runtime lease was not held while loading");
        return Promise.resolve(game);
    });
    const sim = path.join(directory, "simulation.json");
    const replay = path.join(directory, "replay.json");
    const report = path.join(directory, "report.md");
    await new SimCommand(load, undefined, undefined, undefined, undefined, resolver(api.SIM_OPERATION))
        .run([source, "--rounds", "3", "--seed", "0", "--out", sim]);
    await new ReplayCommand(load, undefined, undefined, resolver(api.REPLAY_OPERATION))
        .run([source, "--round", "3", "--seed", "0", "--out", replay]);
    await new ReportCommand().run([sim, "--format", "markdown", "--out", report]);
    const statistics = JSON.parse(fs.readFileSync(sim, "utf8"));
    const recorded = JSON.parse(fs.readFileSync(replay, "utf8"));
    expect(statistics).toMatchObject({rounds: 3, seed: "0", totalWin: 0.1, rtp: expect.closeTo(2 / 3, 12)});
    expect(recorded).toMatchObject({seed: "0", round: 3, totalBet: statistics.totalBet, totalWin: statistics.totalWin, screen: FRACTIONAL_MIXED_CONTINUATION[2].screen});
    expect(fs.readFileSync(report, "utf8")).toContain("RTP");
    expect(releases).toBe(2);
    expect(games.size).toBe(0);
    // Sim resolves the manifest/mode and creates its execution session from the same leased runtime.
    expect(load.mock.calls.map(([runtimePath]) => runtimePath)).toEqual([path.join(directory, "runtime-1"), path.join(directory, "runtime-1"), path.join(directory, "runtime-2")]);
    const failedOutput = path.join(directory, "failed.json");
    const failure = new Error("entry module could not load");
    const failLoad = () => Promise.reject(failure);
    await expect(new SimCommand(failLoad, undefined, undefined, undefined, undefined, resolver(api.SIM_OPERATION))
        .run([source, "--rounds", "3", "--seed", "0", "--out", failedOutput])).rejects.toBe(failure);
    await expect(new ReplayCommand(failLoad, undefined, undefined, resolver(api.REPLAY_OPERATION))
        .run([source, "--round", "3", "--seed", "0", "--out", failedOutput])).rejects.toBe(failure);
    expect(releases).toBe(4);
    expect(games.size).toBe(0);
    expect(fs.existsSync(failedOutput)).toBe(false);
    if (type === "parWorkbook") for (const stage of stages) expect(fs.existsSync(path.dirname(stage))).toBe(false);
    expect(fs.readFileSync(source)).toEqual(original);
});

it("retains project and source revision through durable recovery and drains captured executors on shutdown", async () => {
    const jobsDirectory = path.join(directory, "jobs");
    const jobs = new StudioJobService(new FileStudioJobRepository(jobsDirectory));
    const request = {projectId: "project-a", operation: "simulation", conflictKey: "simulation:project-a", request: {sourceRevision: "revision-1", seed: "0", rounds: 3}};
    const started = jobs.start(request);
    if (started.status !== "created") throw new Error("Expected created job");
    expect(jobs.start(request)).toMatchObject({status: "reattached", job: {id: started.job.id}});
    expect(jobs.start({...request, request: {...request.request, sourceRevision: "revision-2"}})).toMatchObject({status: "conflict"});
    const recovered = new StudioJobService(new FileStudioJobRepository(jobsDirectory));
    expect(recovered.get("project-a", started.job.id)).toMatchObject({status: "recovery-required", request: {sourceRevision: "revision-1"}, recovery: {action: "retry"}});
    expect(recovered.get("project-b", started.job.id)).toBeUndefined();
    expect(recovered.list("project-b")).toEqual([]);
    let release!: () => void;
    const cleanup = new Promise<void>(resolve => {
        release = resolve;
    });
    const pending = recovered.execute({...request, request: {...request.request, sourceRevision: "revision-2"}}, async context => {
        await cleanup;
        expect(context.signal.aborted).toBe(true);
        return undefined;
    }, () => ({status: "cancelled"}));
    recovered.beginShutdown();
    expect(recovered.list("project-a").some(job => job.status === "cancelling")).toBe(true);
    expect(() => recovered.start({...request, projectId: "project-b", conflictKey: "simulation:project-b"})).toThrow(/shutting down/);
    release();
    await pending;
    await recovered.completeGracefulShutdown();
    expect(new FileStudioJobRepository(jobsDirectory).getProcessState()?.status).toBe("gracefully-stopped");
    const reopened = new StudioJobService(new FileStudioJobRepository(jobsDirectory));
    expect(reopened.list("project-a").map(job => job.status).sort()).toEqual(["cancelled", "recovery-required"]);
    expect(reopened.list().every(job => job.result?.outputs === undefined)).toBe(true);
    await reopened.completeGracefulShutdown();
});

it("keeps package identity independent from emitted format identities and generated dependency metadata", () => {
    expect(api.POKIE_VERSION).toBe("2.0.0");
    expect(api.GAME_BLUEPRINT_SCHEMA_VERSION).toBe(1);
    expect(api.PACKAGE_MODEL_DESCRIPTOR_VERSION).toBe(1);
    expect(api.ROUND_ARTIFACT_SCHEMA_VERSION).toBe(1);
    expect(api.OUTCOME_LIBRARY_BUNDLE_MANIFEST_SCHEMA_VERSION).toBe(1);
    expect(api.CERTIFICATION_EVIDENCE_BUNDLE_MANIFEST_SCHEMA_VERSION).toBe(2);
    expect(api.DEFAULT_CERTIFICATION_DOSSIER_TEMPLATE.schemaVersion).toBe(1);
    expect(api.POKIE_WASM_CONTRACT_VERSION).toBe("1.0.0");
    expect(api.POKIE_WASM_ABI_VERSION).toBe("3.0.0");
    expect(api.POKIE_WASM_RUNTIME_API_VERSION).toBe("2.1.0");
    const generated = new api.GamePackageGenerator(api.POKIE_VERSION).generate(fractionalBetBlueprint(), directory, "package");
    const metadata = JSON.parse(fs.readFileSync(path.join(generated.projectRoot, "package.json"), "utf8"));
    expect(metadata).toMatchObject({dependencies: {"@fromstan/pokie": "^2.0.0"}, exports: "./dist/index.js", main: "./dist/index.js", pokie: {entry: "./dist/index.js"}});
    const lock = fs.readFileSync(path.join(generated.projectRoot, "package-lock.json"), "utf8");
    expect(lock).not.toMatch(/file:|node_modules|\/home\//);
    for (const file of ["src/index.ts", "dist/index.js"]) {
        const code = fs.readFileSync(path.join(generated.projectRoot, file), "utf8");
        expect(code).toContain('require("@fromstan/pokie")');
        expect(code).not.toContain(directory);
    }
});

it("recognizes all six real artifact types and converges positive and negative public capabilities", async () => {
    const blueprint = fractionalBetBlueprint([0.05, 7.5, 1e-7]);
    const blueprintPath = path.join(directory, "source.json");
    fs.writeFileSync(blueprintPath, JSON.stringify(blueprint));
    const packageRoot = new api.GamePackageGenerator(api.POKIE_VERSION).generate(blueprint, directory, "package").projectRoot;
    const workbook = path.join(directory, "source.xlsx");
    expect((await new api.ParSheetExporter(api.POKIE_VERSION).exportToFile(blueprint, workbook)).filter(issue => issue.severity === "error")).toEqual([]);
    const wasm = path.join(directory, "source.wasm");
    const resolver = new api.ProjectTargetResolver();
    const source = (await resolver.resolve(blueprintPath))!;
    await new api.WasmArtifactBuilder(api.POKIE_VERSION).build(source, wasm);
    const library = buildSingleOutcomeStakeEngineLibrary({libraryId: "stable", betMode: "base", stake: 1, totalWin: 2});
    const bundle = path.join(directory, "library");
    expect((await new api.OutcomeLibraryBundleWriter(api.POKIE_VERSION).writeToDirectory([
        {modeName: "base", libraryId: library.libraryId, outcomes: library.outcomes},
    ], bundle)).manifest?.schemaVersion).toBe(1);
    const stake = path.join(directory, "stake");
    expect((await new api.StakeEngineExporter(api.POKIE_VERSION).exportToDirectory([{modeName: "base", cost: 1, library}], stake)).manifest).toBeDefined();

    const rows = [
        [blueprintPath, "blueprint", "edit", "outcomeSource.sample"],
        [packageRoot, "tsPackage", "sim", "edit"],
        [bundle, "outcomeLibrary", "outcomeSource.simulate", "edit"],
        [stake, "stakeAdapter", "outcomeSource.analyze", "outcomeSource.simulate"],
        [workbook, "parWorkbook", "par.import", "edit"],
        [wasm, "wasm", "play", "serve"],
    ] as const;
    const registry = new api.ArtifactBuilderRegistry(api.POKIE_VERSION);
    for (const [file, type, positive, negative] of rows) {
        const project = (await resolver.resolve(file))!;
        expect(project.type).toBe(type);
        expect(api.describeUnsupportedProjectOperation(project, positive)).toBeUndefined();
        expect(api.describeUnsupportedProjectOperation(project, negative)).toMatchObject({detectedType: type, operation: negative, message: expect.any(String), recovery: expect.any(String)});
        if (["wasm", "stakeAdapter", "outcomeLibrary"].includes(type)) {
            const plan = await registry.preparePlan(project, "blueprint", {destinationPath: path.join(directory, `${type}.json`)});
            expect(plan.status).toBe("unavailable");
            expect(plan.diagnostic?.recovery).not.toBe("");
            await expect(registry.executePlan(plan, project, path.join(directory, `${type}.json`))).rejects.toThrow();
            expect(fs.existsSync(path.join(directory, `${type}.json`))).toBe(false);
        }
    }
    const outcome = (await resolver.resolve(bundle))!;
    const simulation = await api.simulateOutcomeSourceProject(outcome, "base", 4, new api.SeededWeightedOutcomeRandomSource("stable"), "stable");
    expect(simulation.supported).toBe(true);
    if (!simulation.supported) throw new Error(simulation.diagnostic.message);
    expect(simulation.report.statistics).toMatchObject({rounds: 4, totalBet: 4, totalPayout: 8});
    const replay = await api.replayOutcomeSourceProject(outcome, "base", "stable", 4, simulation.report.lastReplay);
    expect(replay).toMatchObject({supported: true, replay: {stake: 1, totalWin: 2}});
    const stakeProject = (await resolver.resolve(stake))!;
    expect(await api.simulateOutcomeSourceProject(stakeProject, "base", 4, new api.SeededWeightedOutcomeRandomSource("stable"))).toMatchObject({supported: false});
    expect(await api.replayOutcomeSourceProject(stakeProject, "base", "stable", 1)).toMatchObject({supported: false});
    for (const project of [outcome, stakeProject]) {
        const report = await new api.OutcomeSourceProjectAnalyzer().analyze(project);
        expect(report.issues.filter(issue => issue.severity === "error")).toEqual([]);
        expect(report.modes[0].analysis).toMatchObject({rtp: 2, hitFrequency: 1, variance: 0});
    }
    for (const file of [blueprintPath, workbook]) {
        const project = (await resolver.resolve(file))!;
        expect(new api.ArtifactConversionPlanner().planRuntime(project).status).toBe("planned");
        expect(api.describeProjectPresentation(project).prerequisites.join(" ")).toContain("automatically");
    }
});

it("keeps custom package source, manifest, lock and executable bytes intact when extraction fails closed", async () => {
    const root = path.join(directory, "custom");
    fs.mkdirSync(path.join(root, "dist"), {recursive: true});
    const contents = {
        "package.json": JSON.stringify({name: "custom", version: "1.0.0", pokie: {entry: "dist/index.js"}}),
        "package-lock.json": '{"lockfileVersion":3,"packages":{}}\n',
        "source.ts": "// Independently authored custom logic: no Blueprint or descriptor.\n",
        "dist/index.js": 'module.exports = {getManifest() {return {id:"custom",name:"Custom",version:"1"}},createSession() {return {play() {},getWinAmount() {return 17}}}};\n',
    };
    for (const [file, contentsOfFile] of Object.entries(contents)) fs.writeFileSync(path.join(root, file), contentsOfFile);
    const runtime = await api.loadPokieGameRuntime(root);
    try {
        const session = runtime.game.createSession();
        session.play();
        expect(session.getWinAmount()).toBe(17);
    } finally {
        await runtime.release();
    }
    const extraction = await new api.PackageBlueprintExtraction().extract(root);
    expect(extraction).toMatchObject({status: "partial", source: {kind: "legacy"}});
    expect(extraction.blueprint).toBeUndefined();
    expect(extraction.diagnostics.length).toBeGreaterThan(0);
    const project = (await new api.ProjectTargetResolver().resolve(root))!;
    for (const target of ["blueprint", "tsPackage", "parWorkbook", "wasm"] as const) {
        const plan = await new api.ArtifactBuilderRegistry(api.POKIE_VERSION).preparePlan(project, target);
        expect(plan.status).toBe("unavailable");
        expect(plan.packageExtraction?.status).toBe("partial");
    }
    for (const [file, expected] of Object.entries(contents)) expect(fs.readFileSync(path.join(root, file), "utf8")).toBe(expected);
});

it("enforces destinations, late claimants and cancellation at direct publication boundaries with bounded retry", async () => {
    const sourcePath = path.join(directory, "authored.json");
    const original = JSON.stringify(fractionalBetBlueprint());
    fs.writeFileSync(sourcePath, original);
    const source = (await new api.ProjectTargetResolver().resolve(sourcePath))!;
    const registry = new api.ArtifactBuilderRegistry(api.POKIE_VERSION);
    const destination = path.join(directory, "output.wasm");
    const plan = await registry.preparePlan(source, "wasm", {destinationPath: destination});
    expect(plan.status).toBe("planned");
    fs.writeFileSync(destination, "late claimant");
    await expect(registry.executePlan(plan, source, destination)).rejects.toThrow();
    expect(fs.readFileSync(destination, "utf8")).toBe("late claimant");
    fs.rmSync(destination);
    const builder = new api.TsPackageArtifactBuilder(api.POKIE_VERSION);
    for (const beforeAllocation of [true, false]) {
        const controller = new AbortController();
        if (beforeAllocation) controller.abort();
        const output = path.join(directory, "package");
        await expect(builder.build(source, output, {signal: controller.signal, onProgress: progress => {
            if (progress.message?.includes("Publishing TypeScript package file")) controller.abort();
        }})).rejects.toThrow(/cancel/i);
        expect(fs.existsSync(output)).toBe(false);
        expect(fs.readdirSync(directory).sort()).toEqual(["authored.json"]);
    }
    await builder.build(source, path.join(directory, "package"));
    const alias = path.join(directory, "alias");
    fs.symlinkSync(sourcePath, alias);
    await expect(new api.WasmArtifactBuilder(api.POKIE_VERSION).build(source, alias)).rejects.toThrow();
    expect(fs.readFileSync(sourcePath, "utf8")).toBe(original);
});

it.each([0.05, 7.5, 1e-7])("preserves fractional stake %s, authored omissions and string-zero RNG continuation", async bet => {
    const model = fractionalBetBlueprint([bet], true);
    const game = generated(model);
    const session = game.createSession({seed: "0"}) as api.VideoSlotSession;
    session.setBet(bet);
    session.setCreditsAmount(1000);
    for (const expected of FRACTIONAL_MIXED_CONTINUATION) {
        const before = session.getCreditsAmount();
        session.play();
        expect(session.getSymbolsCombination().toMatrix()).toEqual(expected.screen);
        expect(session.toSessionState()).toMatchObject({rngState: expected.rngState});
        expect(session.getWinAmount()).toBe(screenMultiplier(expected.screen) * bet);
        expect(session.getCreditsAmount()).toBeCloseTo(before - bet + session.getWinAmount(), 12);
        const restored = game.createSession({seed: 999}) as api.VideoSlotSession;
        restored.setBet(bet);
        restored.setCreditsAmount(session.getCreditsAmount());
        restored.fromSessionState(JSON.parse(JSON.stringify(session.toSessionState())));
        expect(restored.toSessionState()).toEqual(session.toSessionState());
    }
    for (const kind of ["missing-symbol", "missing-count", "zero"] as const) {
        const authored = authoritativePaytableBlueprint(kind, bet);
        const noWin = generated(authored).createSession({seed: 0}) as api.VideoSlotSession;
        noWin.setBet(bet);
        noWin.play();
        expect(noWin.getWinAmount()).toBe(0);
        expect((await generated(authored).getModelDescriptor!()).model.paytable).toEqual(authored.paytable);
    }
    const sampled = game.createSession({seed: "0"}) as api.VideoSlotSession;
    sampled.setBet(bet);
    sampled.setCreditsAmount(1000);
    const statistics = new api.AggregateSimulationRunner(sampled, 3).run().getStatistics();
    const report = new api.SimulationReportBuilder().build({manifest: game.getManifest(), requestedRounds: 3, statistics, durationMs: 1, seed: "0"});
    expect(report.rounds).toBe(3);
    expect(Math.abs(report.totalBet / (bet * 3) - 1)).toBeLessThan(1e-12);
    expect(Math.abs(report.totalWin / (bet * 2) - 1)).toBeLessThan(1e-12);
    expect(report.rtp).toBeCloseTo(2 / 3, 12);
    const replay = new api.ReplayRecorder().record({game, seed: "0", round: 3, entryCommands: Array.from({length: 3}, () => ({kind: "spin", bet}))});
    expect(replay.screen).toEqual(FRACTIONAL_MIXED_CONTINUATION[2].screen);
    expect(replay.totalBet).toBe(report.totalBet);
    expect(replay.totalWin).toBe(report.totalWin);
    expectRareMetrics(new api.StakeEngineStandaloneAnalyzer().analyze(rareStakeSource()).modes[0]);
});

it.each([false, true])("keeps ordinary/feature portable snapshots bounded (feature=%s), restores and rejects malformed state atomically", async feature => {
    const artifact = await api.createBlueprintWasmArtifact(feature ? weightedBonusBlueprint() : fractionalBetBlueprint([0.05, 7.5, 1e-7], true));
    expect(artifact.manifest).toMatchObject({schemaVersion: "1.0.0", artifact: {abiVersion: "3.0.0"}, serialization: {session: "pokie.session.v2", play: "pokie.play.v2", state: feature ? "pokie.state.v4" : "pokie.state.v3"}});
    const runtime = await api.instantiatePokieWasm(artifact.bytes, artifact.manifest, new api.SeededPokieWasmHost("0"));
    const fresh = await api.instantiatePokieWasm(artifact.bytes, artifact.manifest, new api.SeededPokieWasmHost("fresh"));
    try {
        const session = runtime.createSession("0", {credits: 10000});
        for (let round = 0; round < 24; round++) {
            const state = JSON.parse(JSON.stringify(session.serialize()));
            expect(JSON.stringify(state).length).toBeLessThan(feature ? 16384 : 512);
            expect(state).not.toHaveProperty("commands");
            expect(state).not.toHaveProperty("draws");
            const restored = fresh.restoreSession(state);
            const command = feature ? api.nextPokieWasmCommand(state) : {bet: [0.05, 7.5, 1e-7][round % 3]};
            expect(await restored.play(command)).toEqual(await session.play(command));
            expect(restored.serialize()).toEqual(session.serialize());
            restored.dispose();
            const before = session.serialize();
            expect(() => runtime.restoreSession({...state, artifactIdentity: "wrong"})).toThrow();
            expect(() => runtime.restoreSession({...state, schemaVersion: "unknown"})).toThrow();
            expect(session.serialize()).toEqual(before);
        }
    } finally {
        runtime.dispose();
        fresh.dispose();
    }
});

it("selects only the owned archive and preserves pack diagnostics across rejection and reuse", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-pack-selection-"));
    const packRoot = path.join(directory, "pack output with spaces");
    fs.mkdirSync(packRoot);
    const filename = "fromstan-pokie-2.0.0.tgz";
    const archive = path.join(packRoot, filename);
    const stdout = fs.readFileSync(path.join(__dirname, "fixtures/normal-pack.stdout.txt"), "utf8");
    expect(stdout).toContain("vite v8.1.5");
    expect(stdout).toContain("\u001b[2K\rtransforming...");
    expect(stdout.trimEnd().split("\n").pop()).toBe(filename);
    try {
        expect(() => selectPackedArchive(packRoot, stdout)).toThrow("found 0");
        expect(() => selectPackedArchive(packRoot, stdout)).toThrow(stdout);
        fs.writeFileSync(archive, "archive fixture");
        expect(selectPackedArchive(packRoot, stdout)).toBe(archive);
        expect(selectPackedArchive(packRoot, `${directory}/outside.tgz\n`)).toBe(archive);
        const second = path.join(packRoot, "second.tgz");
        fs.writeFileSync(second, "ambiguous archive");
        expect(() => selectPackedArchive(packRoot, stdout)).toThrow("found 2");
        fs.rmSync(second);
        expect(selectPackedArchive(packRoot, stdout)).toBe(archive);
        fs.rmSync(archive);
        fs.writeFileSync(path.join(directory, "outside.tgz"), "unowned archive");
        fs.symlinkSync("../outside.tgz", archive);
        expect(() => selectPackedArchive(packRoot, stdout)).toThrow("regular file inside");
        fs.rmSync(archive);
        fs.symlinkSync("../missing.tgz", archive);
        expect(() => selectPackedArchive(packRoot, stdout)).toThrow("regular file inside");
        fs.rmSync(archive);
        fs.mkdirSync(archive);
        expect(() => selectPackedArchive(packRoot, stdout)).toThrow("regular file inside");
        fs.rmdirSync(archive);
        fs.writeFileSync(archive, "archive fixture");
        expect(selectPackedArchive(packRoot, filename)).toBe(archive);
        expect(selectPackedArchive(packRoot, stdout)).toBe(archive);
        expect(fs.readFileSync(path.join(directory, "outside.tgz"), "utf8")).toBe("unowned archive");
    } finally {
        fs.rmSync(directory, {recursive: true, force: true});
    }
});
