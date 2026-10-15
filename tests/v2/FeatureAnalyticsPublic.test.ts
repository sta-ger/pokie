import fs from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {Worker} from "node:worker_threads";
import * as api from "../../src/index.js";
import {describeSimulationDiagnostics} from "../../src/reporting/describeSimulationDiagnostics.js";
import {projectOutcomeSourceSimulationReport} from "../../src/reporting/projectOutcomeSourceSimulationReport.js";
import {SimCommand} from "../../cli/commands/SimCommand.js";
import {ReportCommand} from "../../cli/commands/ReportCommand.js";
import {StudioSimulationService} from "../../cli/studio/simulation/StudioSimulationService.js";
import {StudioJobService} from "../../cli/studio/jobs/StudioJobService.js";
import {FileStudioJobRepository} from "../../cli/studio/jobs/FileStudioJobRepository.js";
import {buildSimulationReportDownload} from "../../cli/studio/simulation/buildSimulationReportDownload.js";
import {describeSimulationReport, describeSimulationProgress} from "../../cli/studio-client/src/domain/interpret/Simulation.js";
import {featureAnalyticsReport, aggregate, observation, component} from "./fixtures/FeatureAnalyticsFixture.js";
import {weightedBlueprint} from "./fixtures/WeightedWholeSequenceGame.js";
import {runChunkedSimulation} from "../../src/simulation/parallel/internal/runChunkedSimulation.js";
import {weightedBonusBlueprint} from "./fixtures/WeightedBonusGame.js";
import {generatedMechanicsGame} from "./fixtures/ExistingMechanicsGame.js";
import {emitPublicRuntime} from "./helpers/publicRuntime.js";

const unresolved: api.ProjectResolving = {resolve: () => Promise.resolve(undefined)};
const manifest = {id: "precision", name: "Precision fixture", version: "1"};
const adaptive = {minRounds: 2, rtpTolerance: 0.001, checkIntervalRounds: 2, stableChecks: 1};

/** Known-answer data traverse the actual public projections; no alternative denominator calculator. */
describe("V2C-17 public analytics parity", () => {
    afterEach(() => jest.restoreAllMocks());

    it.each(["populated", "incomplete", "empty"] as const)("keeps a %s saved report authoritative across service, CLI, renderers, downloads and Studio", async kind => {
        const saved = JSON.parse(JSON.stringify(featureAnalyticsReport(kind))) as api.SimulationReport;
        const directory = fs.mkdtempSync(path.join(process.cwd(), "node_modules/.cache/pokie-tmp/v2c17-reports-"));
        try {
            const jobs = new StudioJobService(new FileStudioJobRepository(directory));
            const started = jobs.start({projectId: directory, operation: "simulation", request: {rounds: saved.requestedRounds}, conflictKey: `simulation:${directory}`});
            if (started.status !== "created") throw new Error("expected new job");
            jobs.markRunning(started.job.id);
            jobs.complete(started.job.id, {summary: "Saved known-answer report", detail: {report: saved}});
            const service = new StudioSimulationService();
            // Reconstruct from real disk persistence, as a new Studio process does.
            service.attachJobService(new StudioJobService(new FileStudioJobRepository(directory)));
            expect(service.getReport(directory, started.job.id)).toEqual({status: "ok", report: saved, statistics: undefined});
            expect(service.getStatusForProject(directory, started.job.id)?.report).toEqual(saved);
            expect(service.listReports(directory)[0].actualRounds).toBe(saved.rounds);
            const view = describeSimulationReport(saved, {
                volatility: 999, payoutStandardDeviation: 999, returnStandardDeviation: 999,
                rtpConfidenceInterval95: {low: -999, high: 999}, averagePayoutConfidenceInterval95: {low: -999, high: 999}, payoutHistogram: {stale: 999},
            });
            expect(view).toMatchObject({analytics: saved.analytics, sampling: saved.sampling, diagnostics: saved.diagnostics, volatility: saved.volatility,
                payoutHistogram: saved.payoutHistogram, rtpConfidenceInterval95: saved.rtpConfidenceInterval95, averagePayoutConfidenceInterval95: saved.averagePayoutConfidenceInterval95});
            const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
            const command = new SimCommand(() => Promise.resolve({getManifest: () => saved.game, createSession: () => {
                throw new Error("unused");
            }}), undefined,
            {build: () => saved}, undefined, () => ({run: () => Promise.resolve({manifest: saved.game, statistics: aggregate().getStatistics(), workers: 1, workerSeedStrategy: "fixture", stopReason: "maxRounds"})} as api.ParallelSimulationRunner), undefined, unresolved);
            await command.run([directory, "--rounds", "5", "--format", "json"]);
            expect(JSON.parse(String(log.mock.calls[0][0]))).toEqual(saved);
            log.mockClear();
            await command.run([directory, "--rounds", "5"]);
            const consoleText = log.mock.calls.map(call => String(call[0])).join("\n");
            const markdown = new api.MarkdownSimulationReportRenderer().render(saved);
            const html = new api.HtmlSimulationReportRenderer().render(saved);
            for (const line of [...api.describeFeatureAnalytics(saved.analytics), ...describeSimulationDiagnostics(saved)]) {
                expect(consoleText).toContain(line);
                expect(markdown).toContain(line.replace(/[<>|\n\r]/g, " "));
                expect(html).toContain(line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"));
            }
            for (const format of ["json", "markdown", "html"] as const) {
                log.mockClear();
                await new ReportCommand(() => JSON.stringify(saved), undefined, undefined, unresolved).run([path.join(directory, "report.json"), "--format", format]);
                const rendered = String(log.mock.calls[0][0]);
                const download = buildSimulationReportDownload(saved, started.job.id, format).body;
                expect(rendered.trim()).toBe(download.trim());
                if (format === "json") expect(JSON.parse(rendered)).toEqual(saved);
            }
        } finally {
            fs.rmSync(directory, {recursive: true, force: true});
        }
    });

    it("keeps all-mode denominators independent across save, render, interpretation and diff", async () => {
        const populated = featureAnalyticsReport(),
            empty = featureAnalyticsReport("empty");
        const set: api.SimulationReportSet = JSON.parse(JSON.stringify({game: populated.game, requestedRounds: 5, seed: null, modes: {base: populated, buy: empty}}));
        const view = describeSimulationReport(set);
        expect(view).not.toHaveProperty("rtp");
        expect(view).toMatchObject({modes: {base: {rounds: 3, analytics: {subrounds: 5}}, buy: {rounds: 0, analytics: {subrounds: 0}}}});
        expect(new api.SimulationReportSetDiffer().diff(set, set).changed).toBe(false);
        const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
        for (const format of ["json", "markdown", "html"] as const) {
            await new ReportCommand(() => JSON.stringify(set), undefined, undefined, unresolved).run(["reports.json", "--format", format]);
            expect(String(log.mock.calls[log.mock.calls.length - 1]?.[0]).trim()).toBe(buildSimulationReportDownload(set, "modes", format).body.trim());
        }
    });

    it("shows supported no-entry, amount-only and custom attribution limits without manufacturing lifecycle", () => {
        const noEntry = new api.SimulationAccumulator();
        for (let i = 0; i < 3; i++) noEntry.addRound(0.05, 0, observation());
        const supported = new api.SimulationReportBuilder().build({manifest, requestedRounds: 100000, statistics: noEntry.getStatistics(), durationMs: 1, stopReason: "sessionStopped"});
        expect(supported.diagnostics).toMatchObject({samples: 3, precision: "uninformative"});
        expect(api.describeFeatureAnalytics(supported.analytics).join("\n")).toContain("freeGames: configured and supported, no entries observed");
        expect(supported.warnings?.join("\n")).toContain("Usable samples (3) is low");
        const custom = new api.SimulationAccumulator();
        custom.addRound(7.5, 1e-7); // arbitrary custom sessions expose amounts, not canonical lifecycle
        const report = new api.SimulationReportBuilder().build({manifest, requestedRounds: 100000, statistics: custom.getStatistics(), durationMs: 1});
        expect(report.analytics?.partition).toEqual({base: 0, feature: 0, jackpot: 0, unavailable: 1e-7});
        expect(report.diagnostics).toMatchObject({samples: 1, precision: "insufficientSamples"});
        expect(describeSimulationDiagnostics(report).join("\n")).toContain("custom names, categories and flattened events do not prove entry");
        const wasm = new api.SimulationAccumulator();
        wasm.addRound(1e-7, 0.05, {...observation(), envelope: api.analyticsEnvelope("wasm"), logicalEntry: false, logicalCompletion: false, components: undefined});
        expect(wasm.getStatistics().analytics?.envelope).toMatchObject({lifecycle: false, components: false});
        expect(api.describeFeatureAnalytics(wasm.getStatistics().analytics).join("\n")).toContain("lifecycle unavailable");
        expect(api.describeFeatureAnalytics(undefined)).toEqual(["Feature analytics unavailable (older report or no canonical observations)."]);
    });

    it("classifies a rare high-variance sample and a zero-width losing prefix as insufficient evidence", () => {
        const rare = new api.SimulationAccumulator();
        for (let i = 0; i < 20; i++) rare.addRound(1, i === 19 ? 10000 : 0);
        const checker = new api.SimulationConvergenceChecker(adaptive);
        expect(checker.check(rare, 20).converged).toBe(false);
        const report = new api.SimulationReportBuilder().build({manifest, requestedRounds: 20, statistics: rare.getStatistics(), durationMs: 1, targetRtp: 0.96, convergence: checker.buildOutcome(), stopReason: "maxRounds"});
        expect(report.diagnostics?.precision).toBe("insufficientPrecision");
        expect(report.rtpConfidenceInterval95!.high - report.rtpConfidenceInterval95!.low).toBeGreaterThan(100);
        const prefix = new api.SimulationAccumulator();
        for (let i = 0; i < 20; i++) prefix.addRound(1, 0);
        expect(new api.SimulationConvergenceChecker(adaptive).check(prefix, 20)).toMatchObject({converged: false, achievedRtpHalfWidth: 0});
    });

    it("renders historical native sampled outputs through a compatible report projection, separate from static analysis", async () => {
        const a = new api.SimulationAccumulator();
        a.addRound(0.05, 0.1, {...observation(), envelope: api.analyticsEnvelope("library", false, true), logicalEntry: false, logicalCompletion: false, components: [component(0.1, "custom", "entry", null)]});
        const source = {libraryId: "native", libraryHash: "hash", modeName: "base", requestedRounds: 100000, durationMs: 1, statistics: a.getStatistics()};
        const projection = projectOutcomeSourceSimulationReport(source);
        expect(projection).toMatchObject({rounds: 1, totalBet: 0.05, totalWin: 0.1, diagnostics: {sampleUnit: "accepted-subround", precision: "insufficientSamples"}});
        const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
        await new ReportCommand(() => JSON.stringify(source), undefined, undefined, unresolved).run(["native.json", "--format", "json"]);
        expect(JSON.parse(String(log.mock.calls[0][0]))).toEqual(projection);
    });

    it("reopens an adaptive early stop with no check without converting unavailable precision to zero", async () => {
        const saved = featureAnalyticsReport("empty");
        saved.convergence = new api.SimulationConvergenceChecker(adaptive).buildOutcome();
        saved.stopReason = "sessionStopped";
        const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
        await new ReportCommand(() => JSON.stringify(saved), undefined, undefined, unresolved).run(["early.json", "--format", "html"]);
        expect(String(log.mock.calls[0][0])).toContain("unavailable (no check)");
        expect(String(log.mock.calls[0][0])).not.toContain("Infinity");
    });

    it.each([{analytics: {}}, {sampling: {}}, {diagnostics: {}}, {analytics: {envelope: {lifecycle: true}}}, {reelSequences: [{}]}])("rejects malformed optional saved structures: %j", async patch => {
        await expect(new ReportCommand(() => JSON.stringify({...featureAnalyticsReport(), ...patch}), undefined, undefined, unresolved).run(["invalid.json"])).rejects.toThrow(/Invalid simulation report/);
    });

    it.each(["ordinary", "all-mode", "historical-native"])("preserves tiny exact probabilities and legacy ratio omissions in %s inputs", async kind => {
        const variants = [
            {id: "tiny-positive", weight: Number.MIN_VALUE, probability: Number.MIN_VALUE, probabilityRatio: {numerator: "1", denominator: (BigInt(1) << BigInt(1074)).toString()}, count: 0, frequency: 0, uncovered: true},
            {id: "underflow", weight: Number.MIN_VALUE, probability: 0, probabilityRatio: {numerator: "1", denominator: (BigInt(1) << BigInt(1200)).toString()}, count: 0, frequency: 0, uncovered: true},
            {id: "disabled", weight: 0, probability: 0, probabilityRatio: {numerator: "0", denominator: "2"}, count: 0, frequency: 0, uncovered: false},
            {id: "legacy", weight: 1, probability: 1, count: 1, frequency: 1, uncovered: false},
        ];
        const reelSequences = [{reelIndex: 0, context: "logical-round" as const, model: "fixture", selections: 1, variants}];
        const saved = {...featureAnalyticsReport(), reelSequences};
        let payload: unknown = saved;
        if (kind === "all-mode") payload = {game: saved.game, requestedRounds: saved.requestedRounds, seed: saved.seed, modes: {base: saved}};
        if (kind === "historical-native") payload = {
            libraryId: "native", libraryHash: "hash", modeName: "base", requestedRounds: 10, durationMs: 1,
            statistics: {...aggregate().getStatistics(), reelSequences},
        };
        const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
        await new ReportCommand(() => JSON.stringify(payload), undefined, undefined, unresolved).run(["tiny.json", "--format", "json"]);
        const reopened = JSON.parse(String(log.mock.calls[0][0])) as api.SimulationReport | api.SimulationReportSet;
        expect((api.isSimulationReportSet(reopened) ? reopened.modes.base : reopened).reelSequences).toEqual(reelSequences);
    });

    it.each(["ordinary", "historical-native"])("retains legacy missing analytics/sampling/diagnostics in %s inputs", async kind => {
        const legacy = {...featureAnalyticsReport(), analytics: undefined, sampling: undefined, diagnostics: undefined, logicalRounds: undefined};
        const payload = kind === "ordinary" ? legacy : {
            libraryId: "native", libraryHash: "hash", modeName: "base", requestedRounds: 10, durationMs: 1,
            statistics: {...aggregate().getStatistics(), analytics: undefined, logicalRounds: undefined, logicalRoundMetrics: undefined, logicalSampling: undefined},
        };
        const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
        await new ReportCommand(() => JSON.stringify(payload), undefined, undefined, unresolved).run(["legacy.json", "--format", "markdown"]);
        expect(String(log.mock.calls[0][0])).toContain("Feature analytics unavailable");
    });

    it("projects the real durable phase independently of accepted-play percentage", () => {
        expect(describeSimulationProgress({id: "job", status: "running", rounds: 10, roundsCompleted: 10, workers: 2, durationMs: 1, startedAt: "now", progress: {stage: "finalizing / cleanup", current: 10, total: 10, unit: "accepted plays"}})).toMatchObject({phase: "finalizing / cleanup", percent: 100, status: "running"});
    });

    it("fresh emitted workers match exact per-worker seeds, modes, uneven/zero shares, chunks and independent tails", async () => {
        const runtime = emitPublicRuntime();
        const workers: Worker[] = [];
        try {
            const bonus = weightedBonusBlueprint();
            bonus.availableBets = [0.05];
            Reflect.deleteProperty(bonus, "reelStrips");
            bonus.reelSequences = [{type: "weighted", variants: [{id: "C", symbols: ["C"], weight: 1}, {id: "off", symbols: ["A"], weight: 0}]}, {type: "exact", symbols: ["C"]}, {type: "exact", symbols: ["C"]}];
            const modes: api.GameBlueprint = {...weightedBlueprint, betModes: [{id: "base", runtimeType: "base", isDefault: true}, {id: "ante", runtimeType: "ante", costMultiplier: 1.5}]};
            const rare: api.GameBlueprint = {...weightedBlueprint, reelSequences: [{type: "weighted", variants: [{id: "rare", symbols: ["A"], weight: 1}, {id: "common", symbols: ["B"], weight: 100000000}]}, {type: "exact", symbols: ["A"]}]};
            const cases = [
                {blueprint: bonus, rounds: 19, mode: undefined, convergence: undefined},
                {blueprint: bonus, rounds: 1, mode: undefined, convergence: undefined},
                {blueprint: modes, rounds: 23, mode: "ante", convergence: {...adaptive, rtpTolerance: 10}},
                {blueprint: rare, rounds: 20, mode: undefined, convergence: adaptive},
            ];
            const entry = pathToFileURL(path.join(runtime.directory, "node_modules/@fromstan/pokie/dist/esm/simulation/parallel/internal/simulationWorkerEntry.js"));
            for (const [caseIndex, {blueprint, rounds, mode, convergence}] of cases.entries()) {
                const root = path.join(runtime.directory, `game-${caseIndex}`);
                fs.mkdirSync(root);
                fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({name: "analytics-public", version: "1.0.0", pokie: {entry: "./index.cjs"}}));
                fs.writeFileSync(path.join(root, "index.cjs"), api.renderBuiltGameModule(blueprint, "1.3.0"));
                const game = generatedMechanicsGame(blueprint);
                const phases: string[] = [];
                const result = await new api.ParallelSimulationRunner(root, rounds, {workers: 3, seed: "public", betModeId: mode, convergence, chunkSize: 2, workerEntryUrl: entry, onPhase: phase => phases.push(phase), createWorkerCoordinator: url => new api.SimulationWorkerCoordinator(url, request => {
                    const worker = new Worker(entry, {workerData: request});
                    workers.push(worker);
                    return worker;
                })}).run();
                const shares = api.splitRoundsAcrossWorkers(rounds, 3);
                const oracles: Array<{accumulator: api.SimulationAccumulatorSnapshot}> = [];
                const outcomes: Array<{stopReason: api.SimulationStopReason; convergence?: api.SimulationConvergenceOutcome}> = [];
                for (const [index, share] of shares.entries()) {
                    if (!share) continue;
                    const session = game.createSession({seed: api.WorkerSeedStrategy.deriveSeed("public", index, 3)});
                    session.setCreditsAmount(Number.MAX_SAFE_INTEGER);
                    api.setSimulationModelIdentity(session, game.getConfigHash?.());
                    const checker = convergence ? new api.SimulationConvergenceChecker(convergence) : undefined;
                    const oracle = await runChunkedSimulation(session, share, 2, {checkConvergence: checker ? (a, count) => checker.check(a, count).converged : undefined}, mode ? new api.FixedBetModeForNextSimulationRoundSetting(mode) : undefined);
                    oracles.push({accumulator: oracle.accumulator.toSnapshot()});
                    outcomes.push({stopReason: oracle.stopReason, convergence: checker?.buildOutcome()});
                }
                expect(result.statistics).toEqual(new api.SimulationStatisticsMerger().merge(oracles).statistics);
                expect(result.statistics.analytics?.envelope.modelId).toBe(game.getConfigHash?.());
                expect(result.stopReason).toBe(outcomes.every(o => o.stopReason === "converged") ? "converged" : "maxRounds");
                if (convergence) {
                    expect(result.convergence?.achievedRtpHalfWidth).toBe(Math.max(...outcomes.map(o => (o.convergence!.achievedRtpHalfWidth ?? Infinity))));
                    expect(result.convergence?.checksPerformed).toBe(outcomes.reduce((sum, o) => sum + o.convergence!.checksPerformed, 0));
                } else {
                    expect(result.statistics.reelSequences?.[0].variants[1]).toMatchObject({weight: 0, count: 0, uncovered: false});
                    expect(result.statistics.weightedBonus?.outcomes[2]).toMatchObject({weight: 0, count: 0, uncovered: false});
                }
                if (caseIndex === 3) {
                    expect(result.stopReason).toBe("maxRounds");
                    const report = new api.SimulationReportBuilder().build({manifest, requestedRounds: rounds, statistics: result.statistics, durationMs: 1, convergence: result.convergence, stopReason: result.stopReason});
                    expect(report.diagnostics?.precision).toBe("uninformative");
                    expect(report.diagnostics?.coverageLimitations.join("\n")).toContain("remain uncovered");
                }
                expect(phases).toContain("simulation");
                expect(phases[phases.length - 1]).toBe("finalizing / cleanup");
                expect(workers.every(worker => worker.threadId === -1)).toBe(true);
            }
            expect(workers).toHaveLength(10); // zero shares never allocate workers
        } finally {
            await Promise.all(workers.filter(worker => worker.threadId !== -1).map(worker => worker.terminate()));
            runtime.dispose();
        }
    }, 120000);
});
