import fs from "fs";
import os from "os";
import path from "path";
import {
    computeGameBlueprintHash,
    GamePackageGenerator,
    loadPokieGameRuntime,
    OutcomeLibraryBundleReader,
    ReplayRecorder,
    StakeEngineOutcomeSourceReader,
    StakeEngineStandaloneAnalyzer,
    type GameBlueprint,
    type OutcomeSourceProjectReport,
    type PreGeneratedRoundReplayDescriptor,
    type SimulationReport,
} from "pokie";
import {PokiePathResolver} from "../../cli/paths/PokiePathResolver.js";
import type {RuntimePackageResolving} from "../../cli/materialize/materializeRuntimePackage.js";
import {StudioBlueprintService} from "../../cli/studio/blueprint/StudioBlueprintService.js";
import type {StudioBlueprintSaveManagedView} from "../../cli/studio/blueprint/StudioBlueprintSaveManagedView.js";
import type {StudioParSheetImportView} from "../../cli/studio/blueprint/StudioParSheetImportView.js";
import {StudioHomeService} from "../../cli/studio/home/StudioHomeService.js";
import {InMemoryRecentProjectsRepository} from "../../cli/studio/InMemoryRecentProjectsRepository.js";
import {FileStudioProjectRegistry} from "../../cli/studio/FileStudioProjectRegistry.js";
import {FileStudioJobRepository} from "../../cli/studio/jobs/FileStudioJobRepository.js";
import {StudioJobService} from "../../cli/studio/jobs/StudioJobService.js";
import {StudioProjectRegistrationService} from "../../cli/studio/StudioProjectRegistrationService.js";
import {StudioServer} from "../../cli/studio/StudioServer.js";
import type {StudioRuntimeSessionView} from "../../cli/studio/runtime/StudioRuntimeSessionView.js";
import type {StudioOutcomeLibraryGenerateEstimateView} from "../../cli/studio/outcomeLibrary/StudioOutcomeLibraryGenerateEstimateView.js";
import {ReportCommand} from "../../cli/commands/ReportCommand.js";
import {SimCommand} from "../../cli/commands/SimCommand.js";
import {expectRareMetrics, writeRareStakeDirectory, markRecognizedStakeProject} from "../stakeengine/standalone/StakeProbabilityTestFixtures.js";

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/p907/model.blueprint.json"), "utf8")) as GameBlueprint;
const seed = "math-session";
const rounds = 8;

// Real Studio HTTP/services, workbook bytes, generated Node game, native bundle,
// durable reports and replay. This is regression coverage, never cold-user evidence.
describe("P9-07 bounded mathematician workflow", () => {
    let workspace: string;
    let server: StudioServer;
    let base: string;
    const runtimes = new Map<string, Awaited<ReturnType<typeof loadPokieGameRuntime>>>();

    async function json<T>(route: string, body?: unknown, expectedStatus?: number): Promise<T> {
        const response = await fetch(`${base}${route}`, body === undefined ? undefined : {
            method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body),
        });
        const result = await response.json();
        if (expectedStatus === undefined ? !response.ok : response.status !== expectedStatus) throw new Error(`${route}: HTTP ${response.status}: ${JSON.stringify(result)}`);
        return result as T;
    }

    async function terminal(route: string): Promise<Record<string, unknown>> {
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
            const job = await json<Record<string, unknown>>(route);
            if (["completed", "failed", "cancelled"].includes(String(job.status))) return job;
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 10);
            });
        }
        throw new Error(`Job did not finish: ${route}`);
    }

    const loadGame = async (runtimeRoot: string) => {
        let loaded = runtimes.get(runtimeRoot);
        if (loaded === undefined) {
            // Resolve the generated module's require("pokie") to candidate source
            // under Jest, as the existing production Node/WASM parity fixture does.
            loaded = await loadPokieGameRuntime(runtimeRoot, (entry) => require(entry));
            runtimes.set(runtimeRoot, loaded);
        }
        return loaded.game;
    };

    async function startServer(): Promise<void> {
        const profile = path.join(workspace, "profile");
        fs.mkdirSync(profile, {recursive: true});
        const paths = new PokiePathResolver({}, {platform: "linux", env: {HOME: profile}, homeDir: profile},
            () => ({status: "valid", directory: profile, source: "home"}));
        // Only package preparation is adapted: production generation emits a
        // real loadable game without spawning npm/compiler/packaging gates.
        const resolveRuntimePackageRoot: RuntimePackageResolving = (source) => {
            const model = JSON.parse(fs.readFileSync(source, "utf8")) as GameBlueprint;
            const runtimeRoot = path.join(workspace, "runtimes", computeGameBlueprintHash(model));
            if (!fs.existsSync(runtimeRoot)) new GamePackageGenerator("1.3.0").generate(model, workspace, runtimeRoot);
            return Promise.resolve({runtimePath: runtimeRoot, release: () => Promise.resolve()});
        };
        const home = new StudioHomeService("1.3.0", new InMemoryRecentProjectsRepository(), loadGame, undefined, resolveRuntimePackageRoot);
        const blueprints = new StudioBlueprintService("1.3.0", path.join(workspace, "assets"), home,
            undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, paths);
        server = new StudioServer({
            pokieVersion: "1.3.0", host: "127.0.0.1", port: 0, studioRoot: path.join(workspace, "assets"),
            homeService: home, blueprintService: blueprints, loadGame,
            projectRegistrationService: new StudioProjectRegistrationService(new FileStudioProjectRegistry(path.join(profile, "projects.json"))),
            jobService: new StudioJobService(new FileStudioJobRepository(path.join(profile, "jobs"))),
            resolveRuntimePackageRoot,
        });
        const address = await server.start();
        base = `http://${address.host}:${address.port}`;
    }

    beforeEach(async () => {
        workspace = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-p907-"));
        await startServer();
        jest.spyOn(console, "log").mockImplementation(() => undefined);
        jest.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(async () => {
        try {
            await server.stop();
            for (const runtime of runtimes.values()) await runtime.release();
        } finally {
            runtimes.clear();
            fs.rmSync(workspace, {recursive: true, force: true});
            jest.restoreAllMocks();
        }
    });

    it("saves edited literal math, round-trips PAR across restart, plays and reports the same seeded rounds, then publishes and replays exact outcomes", async () => {
        expect(await json("/api/home/blueprints/validate", {blueprint: fixture})).toMatchObject({status: "ok"});
        const saved = await json<StudioBlueprintSaveManagedView>("/api/home/blueprints/save-managed", {blueprint: fixture});
        if (saved.status !== "ok") throw new Error(JSON.stringify(saved));
        const beforeInvalid = fs.readFileSync(saved.path);
        // The public editor validates before Save; an invalid draft never
        // issues a save request. Raw /save also supports incomplete drafts.
        expect(await json("/api/home/blueprints/validate", {blueprint: {...fixture, reels: 0}})).toMatchObject({status: "invalid"});
        expect(fs.readFileSync(saved.path)).toEqual(beforeInvalid);

        const edited: GameBlueprint = {...fixture, symbols: ["A", "C"], reelStrips: [["C", "A"], ["A", "C"]], paytable: {A: {2: 2}, C: {2: 2}}};
        expect(await json("/api/home/blueprints/save", {path: saved.path, blueprint: edited, overwrite: true, expectedHash: saved.blueprintHash})).toMatchObject({status: "ok"});
        expect(await json("/api/home/blueprints/load", {path: saved.path})).toMatchObject({status: "ok", blueprint: edited});
        expect(await json("/api/home/blueprints/game-model-preview", {blueprint: edited})).toMatchObject({
            reels: {data: {generationMode: "reelStrips"}}, paytable: {data: expect.arrayContaining([{symbolId: "C", matchCount: 2, payout: 2}])},
        });
        const workbook = path.join(workspace, "model.xlsx");
        const exported = await json<{status: string}>("/api/home/blueprints/par-export", {blueprint: edited, path: workbook, overwrite: false, sourcePath: saved.path});
        if (exported.status !== "ok") throw new Error(JSON.stringify(exported));
        const workbookBytes = fs.readFileSync(workbook);
        const imported = await json<StudioParSheetImportView>("/api/home/blueprints/par-import", {path: workbook});
        if (imported.status !== "ok") throw new Error(JSON.stringify(imported));
        expect(imported.blueprint).toEqual(edited);
        expect(imported.errors).toEqual([]);
        expect(imported.conversionEvidence).toMatchObject({losslessEligible: true, provenanceHashMatches: true});

        await server.stop();
        await startServer();
        const roundTrip = await json<StudioBlueprintSaveManagedView>("/api/home/blueprints/save-managed", {blueprint: imported.blueprint, sourceWorkbookPath: workbook});
        if (roundTrip.status !== "ok") throw new Error(JSON.stringify(roundTrip));
        expect(JSON.parse(fs.readFileSync(roundTrip.conversionEvidencePath!, "utf8"))).toMatchObject({sourceWorkbook: workbook, losslessEligible: true, provenanceHashMatches: true});
        expect(await json("/api/home/blueprints/load", {path: roundTrip.path})).toMatchObject({blueprint: edited});
        const changedImport = await json<StudioBlueprintSaveManagedView>("/api/home/blueprints/save-managed", {
            blueprint: {...edited, paytable: {A: {2: 3}}}, sourceWorkbookPath: workbook, conversionEvidence: {losslessEligible: true},
        });
        if (changedImport.status !== "ok") throw new Error(JSON.stringify(changedImport));
        expect(JSON.parse(fs.readFileSync(changedImport.conversionEvidencePath!, "utf8"))).toMatchObject({losslessEligible: false});
        expect(fs.readFileSync(workbook)).toEqual(workbookBytes);
        expect(await json("/api/home/blueprints/par-export", {blueprint: edited, path: workbook, overwrite: true}, 409)).toMatchObject({status: "conflict"});
        expect(fs.readFileSync(workbook)).toEqual(workbookBytes);

        await json("/api/home/projects/open", {projectRoot: roundTrip.path});
        const opened = await json<{session: StudioRuntimeSessionView}>("/api/project/play/session", {seed});
        const runtimeRoot = path.join(workspace, "runtimes", computeGameBlueprintHash(edited));
        const game = await loadGame(runtimeRoot);
        const control = game.createSession({seed});
        for (let round = 1; round <= rounds; round++) {
            control.setBet(1);
            control.play();
            const spin = await json<{session: StudioRuntimeSessionView}>(`/api/project/play/sessions/${opened.session.sessionId}/spin`, {bet: 1});
            expect(spin.session.win).toBe(control.getWinAmount());
        }
        const expected = new ReplayRecorder().record({game, seed, round: rounds});
        const simulation = await json<{id: string}>("/api/project/simulations", {rounds, seed, workers: 1});
        expect(await terminal(`/api/project/simulations/${simulation.id}`)).toMatchObject({status: "completed"});
        const {report} = await json<{report: SimulationReport}>(`/api/project/reports/${simulation.id}`);
        expect(report).toMatchObject({rounds, requestedRounds: rounds, seed, workers: 1, totalBet: expected.totalBet, totalWin: expected.totalWin});
        expect(report.rtp).toBe(report.totalWin / report.totalBet);
        expect(report.warnings?.join(" ")).toMatch(/low|small|short/i);
        expect(report.rtpConfidenceInterval95).toBeDefined();
        expect(report.reproducibility).toBeDefined();
        const cliReportPath = path.join(workspace, "simulation.json");
        await new SimCommand(loadGame, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, "1.3.0")
            .run([runtimeRoot, "--rounds", String(rounds), "--workers", "1", "--seed", seed, "--out", cliReportPath, "--format", "json"]);
        expect(JSON.parse(fs.readFileSync(cliReportPath, "utf8"))).toMatchObject({totalBet: report.totalBet, totalWin: report.totalWin, rtp: report.rtp, volatility: report.volatility, seed, workers: 1});
        for (const format of ["json", "markdown", "html"]) {
            const response = await fetch(`${base}/api/project/reports/${simulation.id}/download?format=${format}`);
            expect(response.status).toBe(200);
            const output = await response.text();
            if (format === "json") expect(JSON.parse(output)).toEqual(report);
            else {
                expect(output).toContain(seed);
                expect(output).toMatch(/warning/i);
                expect(output).toMatch(/confidence/i);
            }
        }
        await json("/api/projects/close", {});
        await json("/api/home/projects/open", {projectRoot: roundTrip.path});
        expect(await json(`/api/project/reports/${simulation.id}`)).toMatchObject({report});

        const request = {generation: "exact", mode: "base", stake: 1, outDir: "library"};
        const preflight = await json<StudioOutcomeLibraryGenerateEstimateView>("/api/project/outcome-libraries/generate/estimate", request);
        expect(preflight).toMatchObject({status: "ok", totalOutcomeSpaceSize: 4, expectedRawWork: 4, strategy: "exact", requiresBounded: false});
        if (preflight.status !== "ok") throw new Error(JSON.stringify(preflight));
        const generation = await json<{job: {id: string}}>("/api/project/outcome-libraries/generate/jobs", {...request, preflightToken: preflight.preflightToken});
        expect(await terminal(`/api/project/outcome-libraries/generate/jobs/${generation.job.id}`)).toMatchObject({status: "completed", result: {status: "ok", coverage: 1, generator: {strategy: "exact"}, mode: {modeName: "base", totalWeight: 4}}});
        const bundleDir = path.join(path.dirname(roundTrip.path), "library");
        const library = await new OutcomeLibraryBundleReader().readLibrary(bundleDir, "base");
        expect(library.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0)).toBe(4);
        expect(library.outcomes.every((outcome) => outcome.artifact.stake === 1 && outcome.artifact.betMode === "base")).toBe(true);
        await json("/api/home/projects/open", {projectRoot: bundleDir});
        const context = await json<{report: OutcomeSourceProjectReport}>("/api/project/context");
        expect(context.report.modes[0].analysis).toMatchObject({totalWeight: 4, rtp: 1, hitFrequency: 0.5, variance: 1, standardDeviation: 1});
        const exactReport = path.join(workspace, "exact-report.json");
        await new ReportCommand().run([bundleDir, "--format", "json", "--out", exactReport]);
        expect(JSON.parse(fs.readFileSync(exactReport, "utf8"))).toEqual(context.report);
        const sample = await json<{replay: PreGeneratedRoundReplayDescriptor}>("/api/project/outcome-source/sample", {modeName: "base", seed});
        expect(sample.replay).toMatchObject({modeName: "base", seed, round: 1, selectionAlgorithm: "derived-round-seed-v1"});
        const history = await json<Array<{replay: PreGeneratedRoundReplayDescriptor}>>("/api/project/rounds");
        expect(history[0].replay).toEqual(sample.replay);
        const {timestamp: _timestamp, durationMs: _durationMs, ...recordedOutcome} = sample.replay;
        const replay = await json<{id: string}>("/api/project/replays", {round: sample.replay.round, seed: sample.replay.seed, modeName: sample.replay.modeName, outcomeSource: sample.replay});
        expect(await terminal(`/api/project/replays/${replay.id}`)).toMatchObject({status: "completed", descriptor: {totalWin: sample.replay.totalWin, outcomeSource: recordedOutcome}});
        const descriptor = await json(`/api/project/replays/${replay.id}/download`);
        expect(descriptor).toMatchObject({seed, round: 1, outcomeSource: recordedOutcome});
        expect(new FileStudioJobRepository(path.join(workspace, "profile/jobs")).get(simulation.id)).toMatchObject({status: "completed"});
        await server.stop();
        await startServer();
        await json("/api/home/projects/open", {projectRoot: roundTrip.path});
        expect(await json(`/api/project/reports/${simulation.id}`)).toMatchObject({report});
        expect(fs.readFileSync(workbook)).toEqual(workbookBytes);
    });

    it("keeps UInt64 Stake analysis positive through manifest-less reading and explicitly recognized Studio/report inspection, with sampling disabled", async () => {
        const source = path.join(workspace, "source-2");
        fs.cpSync(path.join(__dirname, "fixtures/p907/source-2"), source, {recursive: true});
        // Verify neutral collector data retains the existing mathematical fixture.
        const reference = path.join(workspace, "reference");
        writeRareStakeDirectory(reference);
        for (const name of ["index.json", "lookup.csv", "books.jsonl.zst"]) {
            expect(fs.readFileSync(path.join(source, name))).toEqual(fs.readFileSync(path.join(reference, name)));
        }
        fs.unlinkSync(path.join(source, "pokie-manifest.json"));
        const read = await new StakeEngineOutcomeSourceReader().readFromDirectory(source);
        const standalone = new StakeEngineStandaloneAnalyzer().analyze(read);
        expectRareMetrics(standalone.modes[0]);
        expect(standalone.modes[0].totalWeight).toBe("18446744073709551616");
        expect(fs.existsSync(path.join(source, "pokie-manifest.json"))).toBe(false);
        markRecognizedStakeProject(source);
        await json("/api/home/projects/open", {projectRoot: source});
        const context = await json<{report: OutcomeSourceProjectReport}>("/api/project/context");
        expectRareMetrics(context.report.modes[0].analysis!);
        const report = path.join(workspace, "source-report.json");
        await new ReportCommand().run([source, "--format", "json", "--out", report]);
        expect(JSON.parse(fs.readFileSync(report, "utf8"))).toEqual(context.report);
        const response = await fetch(`${base}/api/project/outcome-source/sample`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({modeName: "base", seed})});
        const result = await response.json();
        expect(result).toMatchObject({supported: false});
        expect(result).not.toHaveProperty("selection");
    });
});
