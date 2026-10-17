import fs from "fs";
import path from "path";
import {pathToFileURL} from "url";
import {Worker} from "worker_threads";
import {ProjectOptimizationService} from "../../src/optimization/ProjectOptimizationService.js";
import {ProjectTargetResolver} from "../../src/project/ProjectTargetResolver.js";
import {acquireOptimizationAdapter} from "../../src/optimization/internal/ProjectOptimizationAdapter.js";
import {assessOptimizationSample, stochasticOrder} from "../../src/optimization/internal/runStochasticOptimization.js";
import {sourceInventory} from "../../src/optimization/internal/optimizationData.js";
import {validateOptimizationRequest} from "../../src/optimization/validateOptimizationRequest.js";
import {SimulationAccumulator} from "../../src/simulation/SimulationAccumulator.js";
import {SimulationWorkerCoordinator} from "../../src/simulation/parallel/SimulationWorkerCoordinator.js";
import {ParallelSimulationRunner} from "../../src/simulation/parallel/ParallelSimulationRunner.js";
import * as loader from "../../src/gamepackage/loadPokieGame.js";
import * as adapters from "../../src/optimization/internal/ProjectOptimizationAdapter.js";
import {OutcomeLibraryBundleWriter} from "../../src/weightedoutcome/bundle/OutcomeLibraryBundleWriter.js";
import {OutcomeLibraryBundleReader} from "../../src/weightedoutcome/bundle/OutcomeLibraryBundleReader.js";
import {generateExactWeightedOutcomeLibrary} from "../../src/weightedoutcome/generate/generateExactWeightedOutcomeLibrary.js";
import {createTunableBlueprintGame} from "../../src/optimization/createTunableBlueprintGame.js";
import {optimizationBlueprint, optimizationRequest, stochasticOptimizationRequest} from "./fixtures/OptimizationFixture.js";

let directory: string;
let source: string;
let service: ProjectOptimizationService;
const resolve = async (file: string) => (await new ProjectTargetResolver().resolve(file, {readConfigurationProvenance: false}))!;
beforeEach(() => {
    directory = fs.mkdtempSync(path.resolve("node_modules/.cache/optimization-search-"));
    source = path.join(directory, "source.blueprint.json");
    fs.writeFileSync(source, JSON.stringify(optimizationBlueprint()));
    service = new ProjectOptimizationService(path.join(directory, "scratch"));
});
afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(directory, {recursive: true, force: true});
});

it("freezes the seeded selection before held-out assessment, repeats full evidence and saves without resampling", async () => {
    const project = await resolve(source);
    const inventory = sourceInventory(project);
    const request = stochasticOptimizationRequest();
    const result = await service.optimize(project, request);
    expect(result.diagnostics).toEqual([]);
    expect(result.status).toBe("attained");
    expect(result.evidence).toMatchObject({selected: {"/paytable/A/2": 3}, evaluated: 3, consumedWork: 3,
        stochastic: {searchSamples: 1200, assessmentSamples: 6000, assessment: {actualSamples: 6000, requestedSamples: 6000}}});
    expect(result.evidence!.stochastic!.assessment!.targets[0].confidence.low).toBeGreaterThanOrEqual(0.6);
    expect(result.evidence!.stochastic!.assessment!.targets[0].confidence.high).toBeLessThanOrEqual(0.9);
    expect(result.evidence!.evaluations!.map(entry => entry.seed)).not.toContain(result.evidence!.stochastic!.assessment!.seed);
    const repeated = await service.optimize(project, result.evidence!.request);
    expect(repeated.evidence).toEqual(result.evidence);
    const output = path.join(directory, "saved.blueprint.json");
    const simulation = jest.spyOn(ParallelSimulationRunner.prototype, "run");
    await service.publish(result.candidate!, request, output);
    expect(simulation).not.toHaveBeenCalled();
    expect(JSON.parse(fs.readFileSync(output, "utf8")).paytable.A[2]).toBe(3);
    expect(JSON.parse(fs.readFileSync(`${output}.optimization.json`, "utf8"))).toMatchObject({status: "attained", evidence: result.evidence});
    expect((await resolve(output)).type).toBe(result.candidate!.type);
    expect(fs.readFileSync(output)).toEqual(fs.readFileSync(result.candidate!.path));
    await service.discard(result.candidate!);
    await service.discard(repeated.candidate!);
    expect(sourceInventory(project)).toEqual(inventory);
    expect(fs.readdirSync(path.join(directory, "scratch"))).toEqual([]);
});

it("solves simultaneous native RTP, hit, nonzero named feature and half-open distribution constraints with two weight dimensions", async () => {
    const nativeModel = {...optimizationBlueprint(), symbols: ["A", "B", "C"], reelStrips: [["A", "B", "C"], ["A", "B", "C"]], paytable: {A: {2: 2}, B: {2: 4}, C: {2: 0}}};
    const generated = await generateExactWeightedOutcomeLibrary({game: createTunableBlueprintGame(nativeModel), libraryId: "native", pokieVersion: "1.3.0", stake: 1, exact: true, now: () => new Date(0)});
    const loss = generated.library.outcomes.find(outcome => outcome.artifact.totalWin === 0)!;
    const win = generated.library.outcomes.find(outcome => outcome.artifact.totalWin === 2)!;
    const outcomes = [
        {id: "loss", weight: 3, artifact: loss.artifact},
        {id: "small", weight: 1, artifact: {...win.artifact, featureEvents: [{type: "bonus"}, {type: "bonus"}]}},
        {id: "large", weight: 1, artifact: generated.library.outcomes.find(outcome => outcome.artifact.totalWin === 4)!.artifact},
    ].sort((left, right) => left.id.localeCompare(right.id));
    const root = path.join(directory, "native");
    const written = await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([{modeName: "base", libraryId: "native", outcomes}], root);
    expect(written.issues.filter(issue => issue.severity === "error")).toEqual([]);
    const request = stochasticOptimizationRequest();
    request.policy.scope = "native-outcomes";
    request.policy.tunables = [{path: "/modes/base/outcomes/small/weight", values: [1, 2]}, {path: "/modes/base/outcomes/large/weight", values: [1, 3]}];
    request.policy.locks = ["/modes/base/outcomes/loss", "/modes/base/outcomes/small/artifact", "/modes/base/outcomes/large/artifact"];
    request.policy.budget = 4;
    request.policy.sampling = {...request.policy.sampling!, searchSamples: 2000, searchBudget: 8000, assessmentSamples: 15000};
    request.targets = [
        {metric: "rtp", unit: "ratio", value: 2, tolerance: {kind: "absolute", value: 0.15}},
        {metric: "hitFrequency", unit: "ratio", value: 5 / 8, tolerance: {kind: "absolute", value: 0.04}},
        {metric: "featureFrequency", event: "bonus", unit: "ratio", value: 2 / 8, tolerance: {kind: "absolute", value: 0.04}},
        {metric: "distribution", bucket: {min: 2, max: 4}, unit: "ratio", value: 2 / 8, tolerance: {kind: "absolute", value: 0.04}},
        {metric: "distribution", bucket: {min: 4, max: null}, unit: "ratio", value: 3 / 8, tolerance: {kind: "absolute", value: 0.04}},
    ];
    const project = await resolve(root);
    const before = sourceInventory(project);
    const result = await service.optimize(project, request);
    expect(result.diagnostics).toEqual([]);
    expect(result.status).toBe("attained");
    expect(result.evidence!.selected).toEqual({"/modes/base/outcomes/small/weight": 2, "/modes/base/outcomes/large/weight": 3});
    expect(result.evidence!.stochastic!.assessment!.targets.every(target => target.verdict === "attained")).toBe(true);
    const retained = await new OutcomeLibraryBundleReader().readLibrary(result.candidate!.path, "base");
    expect(retained.outcomes.map(outcome => outcome.artifact)).toEqual(outcomes.map(outcome => outcome.artifact));
    const again = await service.optimize(project, request);
    expect(again.evidence).toEqual(result.evidence);
    await service.discard(again.candidate!);
    await service.discard(result.candidate!);
    expect(sourceInventory(project)).toEqual(before);
});

it("separates exact impossibility, contradictions, sampled nonattainment, and exhausted best-so-far publication", async () => {
    const project = await resolve(source);
    const exact = optimizationRequest();
    exact.targets[0].value = 7;
    expect((await service.optimize(project, exact)).status).toBe("infeasible");
    const request = stochasticOptimizationRequest();
    request.targets.push({metric: "rtp", unit: "ratio", value: 3, tolerance: {kind: "absolute", value: 0.1}});
    expect((await service.optimize(project, request)).status).toBe("invalid");
    request.targets.pop();
    request.targets[0].value = 7;
    const inconclusive = await service.optimize(project, request);
    expect(inconclusive.status).toBe("inconclusive");
    expect(inconclusive.evidence!.stochastic!.assessment!.targets[0].verdict).toBe("missed");
    await service.discard(inconclusive.candidate!);
    request.policy.budget = 1;
    const result = await service.optimize(project, request);
    expect(result.status).toBe("exhausted");
    expect(result.evidence).toMatchObject({stopReason: "candidate-budget", consumedWork: 1, evaluated: 1});
    const output = path.join(directory, "candidate.json");
    await service.publish(result.candidate!, request, output);
    expect(JSON.parse(fs.readFileSync(`${output}.optimization.json`, "utf8")).status).toBe("exhausted");
    await service.discard(result.candidate!);
    request.policy.budget = 3;
    request.policy.sampling!.searchBudget = 20;
    const search = await service.optimize(project, request);
    expect(search).toMatchObject({status: "exhausted", evidence: {stopReason: "search-budget", stochastic: {searchSamples: 20}}});
    await service.discard(search.candidate!);
    request.policy.sampling!.searchBudget = 1200;
    request.policy.sampling!.assessmentSamples = 30;
    const assessment = await service.optimize(project, request);
    expect(assessment).toMatchObject({status: "exhausted", evidence: {stopReason: "assessment-budget", stochastic: {assessmentSamples: 30}}});
    await service.discard(assessment.candidate!);
    request.policy.constraints = {sums: [{paths: ["/paytable/A/2"], value: 2.5}]};
    const rejected = await service.optimize(project, request);
    expect(rejected).toMatchObject({status: "infeasible", evidence: {evaluated: 0, rejected: 3, stochastic: {searchSamples: 0, assessmentSamples: 0}}});
    expect(rejected.candidate).toBeUndefined();
});

it("does not certify lucky exact estimates, zero variance, uncovered rare payouts, or intervals crossing tolerance boundaries", () => {
    const request = stochasticOptimizationRequest();
    request.policy.sampling!.assessmentSamples = 1000;
    request.targets[0].value = 0.75;
    const accumulator = new SimulationAccumulator();
    accumulator.configureObservations({events: [], buckets: []});
    for (let index = 0; index < 1000; index++) {
        accumulator.addRound(1, 0.75);
        accumulator.observeRequestedMetrics(1, 0.75, []);
    }
    const statistics = accumulator.getStatistics();
    expect(assessOptimizationSample(request, statistics, 1000000, "held-out", "maxRounds").targets[0].verdict).toBe("inconclusive");
    request.policy.sampling!.minEventCount = 1;
    expect(assessOptimizationSample(request, statistics, 1, "held-out", "maxRounds").targets[0].reason).toContain("coverage");
    for (const tolerance of [undefined, {kind: "absolute" as const, value: 0}]) {
        request.targets[0].tolerance = tolerance;
        expect(assessOptimizationSample(request, statistics, 1, "held-out", "maxRounds").targets[0].verdict).toBe("inconclusive");
    }
    request.targets[0].tolerance = {kind: "absolute", value: 0.1};
    request.policy.sampling!.minEventCount = 0;
    const nonfinite = {...statistics, rtp: Infinity};
    expect(assessOptimizationSample(request, nonfinite, 1, "held-out", "maxRounds").targets[0].verdict).toBe("inconclusive");
});

it("keeps an actual short high-volatility lucky zero run inconclusive and excludes held-out observations from fitness", async () => {
    const model = optimizationBlueprint();
    model.reelStrips = [["A", ...Array<string>(999).fill("B")], ["A"]];
    model.paytable.A[2] = 1000;
    fs.writeFileSync(source, JSON.stringify(model));
    const request = stochasticOptimizationRequest();
    request.policy.tunables[0].values = [1000];
    request.policy.sampling = {...request.policy.sampling!, searchSamples: 1, searchBudget: 1, assessmentSamples: 30, minSamples: 30};
    request.targets[0] = {metric: "rtp", unit: "ratio", value: 0};
    const result = await service.optimize(await resolve(source), request);
    expect(result.status).toBe("inconclusive");
    expect(result.evidence!.evaluations![0]).toMatchObject({measured: [0], samples: 1, fitness: 0});
    expect(result.evidence!.stochastic!.assessment).toMatchObject({actualSamples: 30, returnBound: 1000, targets: [{verdict: "inconclusive"}]});
    expect(result.evidence!.evaluations![0].seed).not.toBe(result.evidence!.stochastic!.assessment!.seed);
    await service.discard(result.candidate!);
});

it("requires success/failure coverage and containment at frequency tolerance boundaries", () => {
    const request = stochasticOptimizationRequest();
    request.targets = [{metric: "featureFrequency", unit: "ratio", event: "bonus", value: 0.54, tolerance: {kind: "absolute", value: 0.05}}];
    request.policy.sampling!.assessmentSamples = 1000;
    const observed = (successes: number) => {
        const accumulator = new SimulationAccumulator();
        accumulator.configureObservations({events: ["bonus"], buckets: []});
        for (let index = 0; index < 1000; index++) {
            accumulator.addRound(1, index < successes ? 1 : 0);
            accumulator.observeRequestedMetrics(1, index < successes ? 1 : 0, index < successes ? ["bonus"] : []);
        }
        return accumulator.getStatistics();
    };
    expect(assessOptimizationSample(request, observed(500), 1, "held-out", "maxRounds").targets[0]).toMatchObject({verdict: "inconclusive", successes: 500, failures: 500});
    request.targets[0].value = 0.5;
    request.targets[0].tolerance!.value = 0.1;
    expect(assessOptimizationSample(request, observed(500), 1, "held-out", "maxRounds").targets[0].verdict).toBe("attained");
    for (const count of [0, 1000]) expect(assessOptimizationSample(request, observed(count), 1, "held-out", "maxRounds").targets[0].reason).toContain("coverage");
    expect(assessOptimizationSample(request, observed(500), 1, "held-out", "cancelled").targets[0].verdict).toBe("inconclusive");
});

it("samples real authored paid entries and nonzero trigger presence without counting free continuations", async () => {
    const model = {...optimizationBlueprint(), reelStrips: [["A", "B"], ["A", "B"]], scatters: ["B"], mechanics: {freeGames: {scatterSymbol: "B", awardsByCount: {2: 3}}}};
    fs.writeFileSync(source, JSON.stringify(model));
    const request = stochasticOptimizationRequest();
    request.policy.scope = "paid-entry";
    request.policy.locks.push("/mechanics");
    request.targets = [
        {metric: "rtp", unit: "ratio", value: 0.75, tolerance: {kind: "absolute", value: 0.2}},
        {metric: "featureFrequency", event: "freeGamesTriggered", unit: "ratio", value: 0.25, tolerance: {kind: "absolute", value: 0.05}},
    ];
    const result = await service.optimize(await resolve(source), request);
    expect(result.diagnostics).toEqual([]);
    expect(result.status).toBe("attained");
    expect(JSON.parse(fs.readFileSync(result.candidate!.path, "utf8")).mechanics).toEqual(model.mechanics);
    expect(result.evidence!.stochastic!.assessment!.targets[1].estimate).toBeCloseTo(0.25, 1);
    await service.discard(result.candidate!);
    request.policy.scope = "logical-round";
    expect((await service.optimize(await resolve(source), request)).status).toBe("unsupported");
});

it("rejects native readback drift and execution failure, and leaves independently edited source untouched", async () => {
    const request = stochasticOptimizationRequest();
    const project = await resolve(source);
    const before = fs.readFileSync(source, "utf8");
    const adapter = await acquireOptimizationAdapter(project, request.policy);
    const acquisition = jest.spyOn(adapters, "acquireOptimizationAdapter").mockResolvedValueOnce({...adapter, read: async file => {
        const model = await adapter.read(file) as ReturnType<typeof optimizationBlueprint>;
        model.paytable.B[2] = 1;
        return model;
    }});
    const drift = await service.optimize(project, request);
    expect(drift).toMatchObject({status: "failure", diagnostics: [{message: expect.stringContaining("undeclared or locked")}]});
    acquisition.mockRestore();
    const execution = jest.spyOn(ParallelSimulationRunner.prototype, "run").mockRejectedValueOnce(new Error("injected execution failure"));
    expect((await service.optimize(project, request)).status).toBe("failure");
    execution.mockRestore();
    const stale = await service.optimize(project, request, {onProgress: evidence => {
        if (evidence.stochastic!.searchSamples > 0) fs.writeFileSync(source, `${before}\n`);
    }});
    expect(stale.status).toBe("failure");
    expect(fs.readFileSync(source, "utf8")).toBe(`${before}\n`);
    fs.writeFileSync(source, before);
    expect(fs.readdirSync(path.join(directory, "scratch"))).toEqual([]);
    const next = await service.optimize(project, request);
    expect(next.status).toBe("attained");
    await service.discard(next.candidate!);
});

it.each(["before", "search", "assessment", "finalizing"])("drains cancellation at %s without changing source and can be reused", async phase => {
    const project = await resolve(source);
    const before = sourceInventory(project);
    const controller = new AbortController();
    if (phase === "before") controller.abort();
    const result = await service.optimize(project, stochasticOptimizationRequest(), {signal: controller.signal, onProgress: evidence => {
        if (evidence.phase === phase && (phase !== "search" || evidence.stochastic!.searchSamples >= 100)) controller.abort();
    }});
    expect(result.status).toBe("cancelled");
    expect(result.candidate).toBeUndefined();
    expect(sourceInventory(project)).toEqual(before);
    if (fs.existsSync(path.join(directory, "scratch"))) expect(fs.readdirSync(path.join(directory, "scratch"))).toEqual([]);
    const next = await service.optimize(project, stochasticOptimizationRequest());
    expect(next.status).toBe("attained");
    await service.discard(next.candidate!);
});

it("rejects stale, mutated, observer-failed and cleanup-failed runs, preserving partial work and original bytes", async () => {
    const project = await resolve(source);
    const before = sourceInventory(project);
    const failed = await service.optimize(project, stochasticOptimizationRequest(), {onProgress: evidence => {
        if (evidence.stochastic!.searchSamples >= 100) throw new Error("observer failed");
    }});
    expect(failed).toMatchObject({status: "failure", evidence: {stochastic: {searchSamples: 100}}});
    const release = jest.spyOn(loader, "releasePokieGame").mockRejectedValueOnce(new Error("runtime cleanup failed"));
    expect((await service.optimize(project, stochasticOptimizationRequest())).status).toBe("failure");
    release.mockRestore();
    let current = true;
    const stale = await service.optimize(project, stochasticOptimizationRequest(), {isCurrent: () => current, onProgress: evidence => {
        if (evidence.phase === "assessment") current = false;
    }});
    expect(stale.status).toBe("failure");
    const retained = await service.optimize(project, stochasticOptimizationRequest());
    const output = path.join(directory, "cancelled.json");
    const controller = new AbortController();
    controller.abort();
    await expect(service.publish(retained.candidate!, stochasticOptimizationRequest(), output, {signal: controller.signal})).rejects.toThrow();
    expect(fs.existsSync(output)).toBe(false);
    expect(fs.existsSync(`${output}.optimization.json`)).toBe(false);
    const changed = stochasticOptimizationRequest();
    changed.policy.seed = "changed";
    await expect(service.publish(retained.candidate!, changed, output)).rejects.toThrow("receipt");
    await service.discard(retained.candidate!);
    expect(sourceInventory(project)).toEqual(before);
    expect(fs.readdirSync(path.join(directory, "scratch"))).toEqual([]);
});

it("orders each Cartesian candidate once and breaks equal fitness ties by first seeded visit", async () => {
    const {start, stride} = stochasticOrder("repeat", BigInt(12));
    expect(new Set(Array.from({length: 12}, (_, index) => String((start + BigInt(index) * stride) % BigInt(12)))).size).toBe(12);
    const model = optimizationBlueprint();
    model.reelStrips = [["B"], ["B"]];
    fs.writeFileSync(source, JSON.stringify(model));
    const request = stochasticOptimizationRequest();
    const result = await service.optimize(await resolve(source), request);
    expect(result.status).toBe("inconclusive");
    expect(result.evidence!.selected).toEqual(result.evidence!.evaluations![0].parameters);
    await service.discard(result.candidate!);
});

it.each([NaN, Infinity, 0.79, 1])("rejects unsafe sampling confidence %p before candidate preparation", async confidence => {
    const request = stochasticOptimizationRequest();
    request.policy.sampling!.confidence = confidence;
    expect(() => validateOptimizationRequest(request)).toThrow("confidence");
    expect((await service.optimize(await resolve(source), request)).status).toBe("invalid");
});

it("does not relabel sampled maxima, volatility or full feature rounds as supported", async () => {
    const project = await resolve(source);
    const request = stochasticOptimizationRequest();
    request.targets = [{metric: "maxWin", value: 4, unit: "betMultiple"}];
    expect((await service.support(project, request)).supported).toBe(false);
    expect((await service.optimize(project, request)).status).toBe("unsupported");
    request.targets = [{metric: "volatility", value: 1, unit: "variance"}];
    expect((await service.optimize(project, request)).status).toBe("unsupported");
    expect((await acquireOptimizationAdapter(project, stochasticOptimizationRequest().policy)).writable).toContain("/paytable/A/2");
});

it("executes the actual source worker lifecycle, transports requested counters, repeats with fixed workers and drains aborts", async () => {
    const entry = path.join(directory, "worker.cjs");
    fs.writeFileSync(entry, `const fs = require('fs'); const Module = require('module'); const ts = require(${JSON.stringify(require.resolve("typescript"))});
const original = Module._resolveFilename;
Module._resolveFilename = function(request, ...rest) { try { return original.call(this, request, ...rest); } catch (error) { if (request.endsWith('.js')) return original.call(this, request.slice(0, -3) + '.ts', ...rest); throw error; } };
Module._extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true}}).outputText, file);
require(${JSON.stringify(path.resolve("src/simulation/parallel/internal/simulationWorkerEntry.ts"))});`);
    const nativeWorker = jest.spyOn(SimulationWorkerCoordinator.prototype as unknown as {buildDefaultCreateWorker(): Promise<(request: unknown) => Worker>}, "buildDefaultCreateWorker");
    const owned: Worker[] = [];
    nativeWorker.mockImplementation(() => Promise.resolve(request => {
        const worker = new Worker(pathToFileURL(entry), {workerData: request});
        owned.push(worker);
        return worker;
    }));
    const request = stochasticOptimizationRequest();
    request.policy.budget = 1;
    request.policy.tunables[0].values = [3];
    request.policy.sampling!.workers = 2;
    request.policy.sampling!.assessmentSamples = 1000;
    request.targets[0].tolerance = {kind: "absolute", value: 0.3};
    const project = await resolve(source);
    const first = await service.optimize(project, request);
    expect(first.diagnostics).toEqual([]);
    expect(first.status).toBe("attained");
    const repeated = await service.optimize(project, request);
    expect(repeated.evidence).toEqual(first.evidence);
    await service.discard(first.candidate!);
    await service.discard(repeated.candidate!);
    for (const phase of ["search", "assessment"]) {
        const controller = new AbortController();
        const cancelled = await service.optimize(project, request, {signal: controller.signal, onProgress: evidence => {
            if (evidence.phase === phase && evidence.stochastic![phase === "search" ? "searchSamples" : "assessmentSamples"] > 0) controller.abort();
        }});
        expect(cancelled.status).toBe("cancelled");
    }
    const broken = path.join(directory, "broken.cjs");
    fs.writeFileSync(broken, "throw new Error('injected worker failure');");
    nativeWorker.mockImplementationOnce(() => Promise.resolve(workerRequest => {
        const worker = new Worker(pathToFileURL(broken), {workerData: workerRequest});
        owned.push(worker);
        return worker;
    }));
    expect((await service.optimize(project, request)).status).toBe("failure");
    expect(owned.every(worker => worker.threadId === -1)).toBe(true);
    expect(fs.readdirSync(path.join(directory, "scratch"))).toEqual([]);
}, 60000);
