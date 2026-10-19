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
    fs.rmSync(directory, {recursive: true, force: true});
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
