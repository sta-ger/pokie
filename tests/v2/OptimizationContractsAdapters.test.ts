import {ParallelSimulationRunner} from "../../src/simulation/parallel/ParallelSimulationRunner.js";
import {acquireOptimizationAdapter} from "../../src/optimization/internal/ProjectOptimizationAdapter.js";
import {describeUnsupportedProjectOperation} from "../../src/project/describeUnsupportedProjectOperation.js";
import {StakeAdapterArtifactBuilder} from "../../src/project/StakeAdapterArtifactBuilder.js";
import {loadPokieGameRuntime} from "../../src/gamepackage/loadPokieGame.js";
import fs from "fs";
import {createRequire} from "module";
import {execFileSync} from "child_process";
import path from "path";
import {ProjectOptimizationService} from "../../src/optimization/ProjectOptimizationService.js";
import {ArtifactPublicationOwnership, rollbackArtifactPublication} from "../../src/project/ArtifactPublicationOwnership.js";
import {validateOptimizationRequest} from "../../src/optimization/validateOptimizationRequest.js";
import type {OptimizationRequest} from "../../src/optimization/OptimizationPolicy.js";
import {ProjectTargetResolver} from "../../src/project/ProjectTargetResolver.js";
import {ParSheetExporter} from "../../src/parsheet/ParSheetExporter.js";
import {WasmArtifactBuilder} from "../../src/project/WasmArtifactBuilder.js";
import {bindCanonicalWasmTuningSource, declarePackageTuning} from "../../src/optimization/DeclaredTuningContract.js";
import {createTunableBlueprintGame} from "../../src/optimization/createTunableBlueprintGame.js";
import {generateExactWeightedOutcomeLibrary} from "../../src/weightedoutcome/generate/generateExactWeightedOutcomeLibrary.js";
import {OutcomeLibraryBundleWriter} from "../../src/weightedoutcome/bundle/OutcomeLibraryBundleWriter.js";
import {OutcomeLibraryBundleReader} from "../../src/weightedoutcome/bundle/OutcomeLibraryBundleReader.js";
import {StakeEngineExporter} from "../../src/stakeengine/StakeEngineExporter.js";
import {StakeEngineOutcomeSourceReader} from "../../src/stakeengine/standalone/StakeEngineOutcomeSourceReader.js";
import {buildWeightedOutcomeLibrary} from "../../src/weightedoutcome/buildWeightedOutcomeLibrary.js";
import {sourceInventory} from "../../src/optimization/internal/optimizationData.js";

import {optimizationBlueprint as model, optimizationRequest, stochasticOptimizationRequest} from "./fixtures/OptimizationFixture.js";
let directory: string;
let source: string;
let service: ProjectOptimizationService;
const resolve = async (file: string) => (await new ProjectTargetResolver().resolve(file, {readConfigurationProvenance: false}))!;
beforeEach(() => {
    fs.mkdirSync(path.resolve("node_modules/.cache"), {recursive: true});
    directory = fs.mkdtempSync(path.resolve("node_modules/.cache/optimization-test-"));
    source = path.join(directory, "source.blueprint.json");
    fs.writeFileSync(source, JSON.stringify(model()));
    service = new ProjectOptimizationService(path.join(directory, "scratch"));
});
afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(directory, {recursive: true, force: true});
});

it("reaches the independently calculated 3/4 target, repeats evidence, proves infeasibility only exhaustively", async () => {
    const project = await resolve(source);
    const before = sourceInventory(project);
    const first = await service.optimize(project, optimizationRequest());
    expect(first.diagnostics).toEqual([]);
    expect(first).toMatchObject({
        status: "success",
        evidence: {evaluated: 2, consumedWork: 2, domainSize: "3", measured: [0.75], selected: {"/paytable/A/2": 3}},
    });
    const repeated = await new ProjectOptimizationService(path.join(directory, "fresh")).optimize(
        project,
        optimizationRequest(),
    );
    expect(repeated.evidence).toEqual(first.evidence);
    const impossible = optimizationRequest();
    impossible.targets[0].value = 0.9;
    expect(await service.optimize(project, impossible)).toMatchObject({
        status: "infeasible",
        evidence: {evaluated: 3, exhaustive: true},
    });
    impossible.policy.budget = 2;
    expect(await service.optimize(project, impossible)).toMatchObject({
        status: "exhausted",
        evidence: {evaluated: 2, exhaustive: false},
    });
    const boundary = optimizationRequest();
    boundary.policy.budget = 2;
    expect((await service.optimize(project, boundary)).status).toBe("success");
    expect(sourceInventory(project)).toEqual(before);
});

it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "3", null, undefined])(
    "rejects budget %p before source acquisition and accepts corrected reuse",
    async (budget) => {
        const input = optimizationRequest();
        (input.policy as unknown as {budget: unknown}).budget = budget;
        const before = fs.readFileSync(source);
        expect(() => validateOptimizationRequest(input)).toThrow("policy/budget");
        expect((await service.optimize(await resolve(source), input)).status).toBe("invalid");
        expect(fs.existsSync(path.join(directory, "scratch"))).toBe(false);
        expect(fs.readFileSync(source)).toEqual(before);
        expect((await service.optimize(await resolve(source), optimizationRequest())).status).toBe("success");
    },
);

it("cancels before and during work, preserves source, and reuses the service", async () => {
    const project = await resolve(source);
    const before = sourceInventory(project);
    const early = new AbortController();
    early.abort();
    expect((await service.optimize(project, optimizationRequest(), {signal: early.signal})).status).toBe("cancelled");
    const during = new AbortController();
    expect(
        (
            await service.optimize(project, optimizationRequest(), {
                signal: during.signal,
                onProgress: () => during.abort(),
            })
        ).status,
    ).toBe("cancelled");
    expect(fs.readdirSync(path.join(directory, "scratch"))).toEqual([]);
    expect(sourceInventory(project)).toEqual(before);
    expect((await service.optimize(project, optimizationRequest())).status).toBe("success");
});

it("binds publication to source, reviewed bytes, policy and new destination", async () => {
    const request = optimizationRequest();
    const result = await service.optimize(await resolve(source), request);
    expect(result.status).toBe("success");
    const output = path.join(directory, "published.blueprint.json");
    await service.publish(result.candidate!, request, output);
    expect((await resolve(output)).type).toBe("blueprint");
    await expect(service.publish(result.candidate!, request, output)).rejects.toThrow("already exists");
    await expect(service.publish(result.candidate!, request, source)).rejects.toThrow();
    fs.appendFileSync(result.candidate!.path, " ");
    await expect(service.publish(result.candidate!, request, path.join(directory, "changed.json"))).rejects.toThrow(
        "changed",
    );
    await service.discard(result.candidate!);
});

it.each(["/paytable", "/paytable/A", "/paytable/A/2"])(
    "rejects ancestor/leaf tuning lock %s without preparation",
    async (lock) => {
        const request = optimizationRequest();
        request.policy.locks.push(lock);
        expect((await service.optimize(await resolve(source), request)).status).toBe("invalid");
        expect(fs.existsSync(path.join(directory, "scratch"))).toBe(false);
    },
);

it.each([0.05, 7.5, 1e-7])("preserves fractional stake %p", async (stake) => {
    const request = optimizationRequest();
    request.policy.stake = stake;
    request.targets[0].tolerance = {kind: "absolute", value: 1e-12};
    const result = await service.optimize(await resolve(source), request);
    expect(result.status).toBe("success");
    expect(result.evidence!.measured![0]).toBeCloseTo(0.75, 12);
});

it("tunes and reopens the canonical PAR workbook retaining locked declarations", async () => {
    const file = path.join(directory, "source.xlsx");
    await new ParSheetExporter("1.3.0").exportToFile(model(), file);
    const result = await service.optimize(await resolve(file), optimizationRequest());
    expect(result.diagnostics).toEqual([]);
    expect(result).toMatchObject({status: "success", candidate: {type: "parWorkbook"}, evidence: {measured: [0.75]}});
});

it.each(["blueprint", "parWorkbook", "wasm", "tsPackage"] as const)("samples validated same-type %s candidates and preserves exact adapter authority", async type => {
    let file = source;
    if (type === "parWorkbook") {
        file = path.join(directory, "sample.xlsx");
        await new ParSheetExporter("1.3.0").exportToFile(model(), file);
    } else if (type === "wasm") {
        file = path.join(directory, "sample.wasm");
        await new WasmArtifactBuilder("1.3.0").build(await resolve(source), file);
        await bindCanonicalWasmTuningSource(file, model(), ["/paytable/A/2"]);
    } else if (type === "tsPackage") {
        file = declaredPackage("sample").root;
        fs.rmSync(path.join(file, "pokie-tuning.json"));
        const entry = path.join(file, "index.cjs");
        fs.writeFileSync(entry, fs.readFileSync(entry, "utf8").replace("createSession()", "createSession(context)").replace("new p.SeededRandomNumberGenerator(1)", "new p.SeededRandomNumberGenerator(context?.seed ?? 1)"));
        declarePackageTuning(file, "parameters.json", ["/paytable/A/2"]);
    }
    const request = stochasticOptimizationRequest();
    request.targets[0].tolerance = {kind: "absolute", value: 0.3};
    request.policy.sampling!.assessmentSamples = 1000;
    const project = await resolve(file);
    const before = sourceInventory(project);
    const result = await service.optimize(project, request);
    expect(result.diagnostics).toEqual([]);
    expect(result).toMatchObject({status: "attained", candidate: {type}, evidence: {stochastic: {assessmentSamples: 1000}}});
    if (type === "wasm") expect(result.evidence!.stochastic!.validationWork).toBe(32);
    if (type === "tsPackage") expect(result.evidence!.stochastic!.validationWork).toBe(16);
    await service.discard(result.candidate!);
    expect(sourceInventory(project)).toEqual(before);
});

it("samples Stake uint64 weights without rounding and normalizes payout buckets by native mode cost and fractional stake", async () => {
    const original = await nativeSource();
    const library = buildWeightedOutcomeLibrary({libraryId: "stake", outcomes: original.outcomes.map((outcome, index) => ({...outcome, id: String(index + 1)}))});
    const root = path.join(directory, "sample-stake");
    await new StakeEngineExporter("1.3.0").exportToDirectory([{modeName: "base", cost: 2, library}], root);
    const native = await new StakeEngineOutcomeSourceReader().readFromDirectory(root);
    const win = native.modes[0].outcomes.find(outcome => outcome.payoutMultiplier > 0)!;
    const zero = native.modes[0].outcomes.find(outcome => outcome.payoutMultiplier === 0)!;
    const request = stochasticOptimizationRequest();
    request.policy.scope = "native-outcomes";
    request.policy.stake = 0.05;
    request.policy.locks = [];
    request.policy.tunables = [{path: `/modes/base/outcomes/${win.id}/weight`, values: ["1", "3"]}, {path: `/modes/base/outcomes/${zero.id}/weight`, values: ["1", "18446744073709551615"]}];
    request.policy.budget = 4;
    request.policy.sampling!.searchBudget = 1600;
    request.targets = [
        {metric: "rtp", unit: "ratio", value: 1.5, tolerance: {kind: "absolute", value: 0.06}},
        {metric: "distribution", unit: "ratio", value: 0.75, bucket: {min: 2, max: 3}, tolerance: {kind: "absolute", value: 0.05}},
    ];
    const project = await resolve(root);
    const before = sourceInventory(project);
    const result = await service.optimize(project, request);
    expect(result.diagnostics).toEqual([]);
    expect(result.status).toBe("attained");
    expect(result.evidence!.selected).toEqual({[`/modes/base/outcomes/${win.id}/weight`]: "3", [`/modes/base/outcomes/${zero.id}/weight`]: "1"});
    expect(result.evidence!.evaluations!.some(entry => Object.values(entry.parameters).includes("18446744073709551615"))).toBe(true);
    expect(result.evidence!.stochastic!.assessment!.estimates[0]).toBeCloseTo(1.5, 1);
    await service.discard(result.candidate!);
    expect(sourceInventory(project)).toEqual(before);
});

it("rebuilds a source-bound canonical WASM and checks its executable population", async () => {
    const file = path.join(directory, "source.wasm");
    await new WasmArtifactBuilder("1.3.0").build(await resolve(source), file);
    expect((await service.optimize(await resolve(file), optimizationRequest())).status).toBe("unsupported");
    await bindCanonicalWasmTuningSource(file, model(), ["/paytable/A/2"]);
    const result = await service.optimize(await resolve(file), optimizationRequest());
    expect(result.diagnostics).toEqual([]);
    expect(result).toMatchObject({status: "success", candidate: {type: "wasm"}, evidence: {measured: [0.75]}});
});

it("requires package source authority before mutation", async () => {
    const root = path.join(directory, "opaque");
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({name: "opaque", pokie: {entry: "index.cjs"}}));
    fs.writeFileSync(path.join(root, "index.cjs"), "module.exports = {};");
    expect((await service.optimize(await resolve(root), optimizationRequest())).status).toBe("unsupported");
});

const declaredGameCode = `const p = require('@fromstan/pokie');
const data = require('./parameters.json');
function config() {
 const c = new p.VideoSlotConfig(); c.setAvailableBets(data.availableBets); c.setReelsNumber(data.reels); c.setReelsSymbolsNumber(data.rows);
 c.setAvailableSymbols(data.symbols); c.setWildSymbols([]); c.setScatterSymbols([]);
 c.setSymbolsSequences(data.reelStrips.map(s => new p.SymbolsSequence().fromArray(s)));
 const lines = new p.CustomLinesDefinitions(); data.paylines.forEach((line,i) => lines.setLineDefinition(String(i), line)); c.setLinesDefinitions(lines);
 const table = new p.Paytable(data.availableBets); for (const [symbol, amounts] of Object.entries(data.paytable)) for (const [count, amount] of Object.entries(amounts)) table.setPayoutForSymbol(symbol, Number(count), amount); c.setPaytable(table); return c;
}
module.exports = {getManifest: () => data.manifest, getConfigHash: () => p.computeGameBlueprintHash(data),
 createSession() { const c = config(); return new p.VideoSlotSession(c, new p.SymbolsCombinationsGenerator(c, new p.SeededRandomNumberGenerator(1))); },
 createExactEnumerationSession(forced) { return new p.VideoSlotSession(config(), forced); }};
`;

function declaredPackage(name = "package", prefix = "", release = "", dependencies: Record<string, string> = {}) {
    const root = path.join(directory, name);
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({name: "tunable", version: "1.0.0", pokie: {entry: "index.cjs"}, dependencies}));
    fs.writeFileSync(path.join(root, "parameters.json"), JSON.stringify(model()));
    const code = prefix + declaredGameCode.replace("module.exports = {", `module.exports = {${release ? `release: async () => {${release}},` : ""}`);
    fs.writeFileSync(path.join(root, "index.cjs"), code);
    declarePackageTuning(root, "parameters.json", ["/paytable/A/2"]);
    return {root, code};
}

it("tunes a real declared data-backed code package, preserves custom bytes, rejects stale authority", async () => {
    const {root, code} = declaredPackage();
    const request = optimizationRequest();
    request.policy.protectedFiles = ["index.cjs", "package.json"];
    const project = await resolve(root);
    const before = sourceInventory(project);
    const result = await service.optimize(project, request);
    expect(result.diagnostics).toEqual([]);
    expect(result).toMatchObject({status: "success", candidate: {type: "tsPackage"}, evidence: {measured: [0.75]}});
    expect(fs.readFileSync(path.join(result.candidate!.path, "index.cjs"), "utf8")).toBe(code);
    expect(sourceInventory(project)).toEqual(before);
    fs.appendFileSync(path.join(root, "index.cjs"), "\n// tampered");
    expect((await service.optimize(project, request)).status).toBe("unsupported");
});

async function nativeSource() {
    return (
        await generateExactWeightedOutcomeLibrary({
            game: createTunableBlueprintGame(model()),
            libraryId: "native",
            pokieVersion: "1.3.0",
            stake: 1,
            exact: true,
            now: () => new Date(0),
        })
    ).library;
}
it("tunes native bundle weights, rebuilds indexes/analysis and retains identities/artifacts/untouched modes", async () => {
    const library = await nativeSource();
    const root = path.join(directory, "library");
    await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory(
        [
            {modeName: "base", libraryId: "native", outcomes: library.outcomes},
            {modeName: "other", libraryId: "other", outcomes: library.outcomes},
        ],
        root,
    );
    fs.writeFileSync(path.join(root, "notes.bin"), Buffer.from([0, 255, 7]));
    const win = library.outcomes.find((outcome) => outcome.artifact.totalWin > 0)!;
    const zero = library.outcomes.find((outcome) => outcome.artifact.totalWin === 0)!;
    const request = optimizationRequest();
    request.policy.scope = "native-outcomes";
    request.policy.protectedFiles = ["notes.bin"];
    request.policy.locks = [];
    request.policy.tunables = [{path: `/modes/base/outcomes/${win.id}/weight`, values: [1, 3]}];
    request.targets[0].value = 1;
    request.policy.constraints = {
        fixed: [{path: `/modes/base/outcomes/${zero.id}/weight`, value: 3}],
        sums: [{paths: [`/modes/base/outcomes/${zero.id}/weight`, `/modes/base/outcomes/${win.id}/weight`], value: 6}],
        counts: [{path: "/modes/base/outcomes", scope: "outcomes", value: 2}],
        maxWin: {unit: "betMultiple", value: 2},
    };
    const result = await service.optimize(await resolve(root), request);
    expect(result.diagnostics).toEqual([]);
    expect(result).toMatchObject({
        status: "success",
        candidate: {type: "outcomeLibrary"},
        evidence: {measured: [1], rejected: 1},
    });
    expect(fs.readFileSync(path.join(result.candidate!.path, "notes.bin"))).toEqual(Buffer.from([0, 255, 7]));
    const cappedRequest = {...request, policy: {...request.policy, maxOutcomes: 1}};
    expect((await service.optimize(await resolve(root), cappedRequest)).status).toBe("exhausted");
    const reader = new OutcomeLibraryBundleReader();
    expect((await reader.readLibrary(result.candidate!.path, "other")).outcomes).toEqual(library.outcomes);
    expect(
        (await reader.readLibrary(result.candidate!.path, "base")).outcomes.map((outcome) => outcome.artifact),
    ).toEqual(library.outcomes.map((outcome) => outcome.artifact));
});

it("tunes Stake native uint64 lookup weights and retains book/event bytes and mode costs", async () => {
    const original = await nativeSource();
    const library = buildWeightedOutcomeLibrary({
        libraryId: "stake",
        outcomes: original.outcomes.map((outcome, index) => ({...outcome, id: String(index + 1)})),
    });
    const root = path.join(directory, "stake");
    const exported = await new StakeEngineExporter("1.3.0").exportToDirectory(
        [{modeName: "base", cost: 1, library}],
        root,
    );
    expect(exported.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    const before = await new StakeEngineOutcomeSourceReader().readFromDirectory(root);
    const win = before.modes[0].outcomes.find((outcome) => outcome.payoutMultiplier > 0)!;
    const zero = before.modes[0].outcomes.find((outcome) => outcome.payoutMultiplier === 0)!;
    const index = JSON.parse(fs.readFileSync(path.join(root, "index.json"), "utf8")) as {
        modes: {events: string; weights: string}[];
    };
    const book = fs.readFileSync(path.join(root, index.modes[0].events));
    // Native bigint source values deliberately exceed binary64 integer precision.
    const weights = new Map([
        [win.id, "18446744073709551615"],
        [zero.id, "18446744073709551615"],
    ]);
    const csv = path.join(root, index.modes[0].weights);
    fs.writeFileSync(
        csv,
        fs
            .readFileSync(csv, "utf8")
            .split("\n")
            .filter(Boolean)
            .map((line) => {
                const fields = line.split(",");
                fields[1] = weights.get(Number(fields[0]))!;
                return fields.join(",");
            })
            .join("\n") + "\n",
    );
    const request = optimizationRequest();
    request.policy.scope = "native-outcomes";
    request.policy.locks = [];
    request.targets[0].value = 1;
    request.policy.tunables = [
        {path: `/modes/base/outcomes/${win.id}/weight`, values: ["18446744073709551614", "18446744073709551615"]},
    ];
    request.policy.constraints = {
        fixed: [{path: `/modes/base/outcomes/${zero.id}/weight`, value: "18446744073709551615"}],
        sums: [
            {
                paths: [`/modes/base/outcomes/${win.id}/weight`, `/modes/base/outcomes/${zero.id}/weight`],
                value: "36893488147419103230",
            },
        ],
    };
    const result = await service.optimize(await resolve(root), request);
    expect(result.diagnostics).toEqual([]);
    expect(result).toMatchObject({status: "success", candidate: {type: "stakeAdapter"}, evidence: {measured: [1]}});
    const candidateProject = await resolve(result.candidate!.path);
    expect(candidateProject.capabilities).toEqual(["outcomeSource.read"]);
    expect(describeUnsupportedProjectOperation(candidateProject, "stakeEngine.export")?.recovery).toContain("save the reviewed candidate");
    await expect(new StakeAdapterArtifactBuilder("1.3.0").validate(candidateProject)).rejects.toThrow("native uint64");
    const saved = path.join(directory, "saved-stake");
    await service.publish(result.candidate!, request, saved);
    await service.discard(result.candidate!);
    const reopened = await new StakeEngineOutcomeSourceReader().readFromDirectory(saved);
    expect(reopened.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(reopened.modes[0].outcomes.map((outcome) => outcome.weight)).toEqual([
        BigInt("18446744073709551615"),
        BigInt("18446744073709551615"),
    ]);
    expect(fs.readFileSync(path.join(saved, index.modes[0].events))).toEqual(book);
});

it.each([
    (r: OptimizationRequest) => {
        r.targets[0].unit = "currency";
    },
    (r: OptimizationRequest) => {
        r.targets[0].tolerance = {kind: "absolute", value: -1};
    },
    (r: OptimizationRequest) => {
        r.targets[0].value = Infinity;
    },
    (r: OptimizationRequest) => {
        r.policy.seed = "";
    },
    (r: OptimizationRequest) => {
        r.policy.tunables[0].values = [];
    },
    (r: OptimizationRequest) => {
        r.policy.locks.push("/missing");
    },
    (r: OptimizationRequest) => {
        r.policy.constraints = {fixed: [{path: "/paytable/A/2", value: 2}]};
    },
    (r: OptimizationRequest) => {
        r.policy.constraints = {counts: [{path: "/symbols", scope: "symbols", value: 99}]};
    },
    (r: OptimizationRequest) => {
        r.policy.constraints = {sums: [{paths: ["/paytable/A/2"], value: 99}]};
    },
])("rejects malformed units/tolerances/domains and conflicting locks/constraints before staging %#", async (mutate) => {
    const request = optimizationRequest();
    mutate(request);
    const before = fs.readFileSync(source);
    expect((await service.optimize(await resolve(source), request)).status).toBe("invalid");
    expect(fs.existsSync(path.join(directory, "scratch"))).toBe(false);
    expect(fs.readFileSync(source)).toEqual(before);
});

it("reports acquisition, materialization and cleanup failures honestly, then permits successful reuse", async () => {
    const project = await resolve(source);
    const bytes = fs.readFileSync(source);
    fs.rmSync(source);
    expect((await service.optimize(project, optimizationRequest())).status).toBe("failure");
    fs.writeFileSync(source, bytes);
    const write = jest.spyOn(fs, "writeFileSync").mockImplementationOnce(() => {
        throw new Error("disk write failed");
    });
    expect((await service.optimize(project, optimizationRequest())).status).toBe("failure");
    write.mockRestore();
    const request = optimizationRequest();
    request.targets[0].value = 0.9;
    const remove = jest.spyOn(fs.promises, "rm").mockRejectedValueOnce(new Error("cleanup failed"));
    const failed = await service.optimize(project, request);
    remove.mockRestore();
    expect(failed).toMatchObject({status: "failure", diagnostics: [{path: "cleanup", message: "cleanup failed"}]});
    expect((await service.optimize(project, optimizationRequest())).status).toBe("success");
    expect(fs.readFileSync(source)).toEqual(bytes);
});

it("rejects serialized locked-field drift, stale source and aliased destinations without changing source bytes", async () => {
    const project = await resolve(source);
    const bytes = fs.readFileSync(source);
    const realWrite = fs.writeFileSync.bind(fs);
    const write = jest.spyOn(fs, "writeFileSync").mockImplementation((...args) => {
        if (String(args[0]).endsWith("candidate.blueprint.json")) {
            const model = JSON.parse(args[1] as string);
            model.paylines = [[1, 1]];
            return realWrite(args[0], JSON.stringify(model));
        }
        return realWrite(...args);
    });
    const drift = await service.optimize(project, optimizationRequest());
    write.mockRestore();
    expect(drift.status).toBe("failure");
    expect(fs.readFileSync(source)).toEqual(bytes);
    const result = await service.optimize(project, optimizationRequest());
    const target = path.join(directory, "target");
    fs.mkdirSync(target);
    const alias = path.join(directory, "alias");
    fs.symlinkSync(target, alias);
    await expect(
        service.publish(result.candidate!, optimizationRequest(), path.join(alias, "result.json")),
    ).rejects.toThrow("alias");
    fs.appendFileSync(source, " ");
    await expect(
        service.publish(result.candidate!, optimizationRequest(), path.join(directory, "stale.json")),
    ).rejects.toThrow("changed");
    expect(fs.readdirSync(target)).toEqual([]);
});

it("rolls back owned partial WASM publications when the second companion fails", async () => {
    const wasm = path.join(directory, "source.wasm");
    await new WasmArtifactBuilder("1.3.0").build(await resolve(source), wasm);
    await bindCanonicalWasmTuningSource(wasm, model(), ["/paytable/A/2"]);
    const request = optimizationRequest();
    const result = await service.optimize(await resolve(wasm), request);
    expect(result.status).toBe("success");
    const destination = path.join(directory, "partial.wasm");
    const open = fs.promises.open.bind(fs.promises);
    const failure = jest
        .spyOn(fs.promises, "open")
        .mockImplementation((file, flags, mode) =>
            String(file) === `${destination}.tuning.json` && flags === "wx" ? Promise.reject(new Error("companion failure")) : open(file, flags, mode),
        );
    await expect(service.publish(result.candidate!, request, destination)).rejects.toThrow("companion failure");
    failure.mockRestore();
    expect(fs.existsSync(destination)).toBe(false);
    expect(fs.existsSync(`${destination}.pokie-wasm.json`)).toBe(false);
    await expect(service.publish(result.candidate!, request, destination)).resolves.toBe(destination);
});

it("enforces mechanics subtree, zero grants and max-win constraints without installing a payout cap", async () => {
    const blueprint = {
        ...model(),
        scatters: ["B"],
        mechanics: {freeGames: {scatterSymbol: "B", awardsByCount: {2: 0}}},
    };
    fs.writeFileSync(source, JSON.stringify(blueprint));
    const request = optimizationRequest();
    request.policy.scope = "paid-entry";
    request.policy.locks.push("/mechanics");
    const result = await service.optimize(await resolve(source), request);
    expect(result.status).toBe("success");
    expect(JSON.parse(fs.readFileSync(result.candidate!.path, "utf8")).mechanics).toEqual(blueprint.mechanics);
    request.policy.constraints = {maxWin: {unit: "betMultiple", value: 2.5}};
    expect((await service.optimize(await resolve(source), request)).status).toBe("infeasible");
    expect(JSON.parse(fs.readFileSync(source, "utf8")).paytable.A[2]).toBe(2);
});

it("validates exact-zero tolerances, distribution mass/buckets, unsupported scopes and exact population caps", async () => {
    const exact = optimizationRequest();
    exact.targets[0].tolerance = {kind: "absolute", value: 0};
    expect((await service.optimize(await resolve(source), exact)).status).toBe("success");
    const capped = optimizationRequest();
    capped.policy.maxOutcomes = 1;
    expect((await service.optimize(await resolve(source), capped)).status).toBe("exhausted");
    const unsupported = optimizationRequest();
    unsupported.policy.scope = "native-outcomes";
    expect((await service.optimize(await resolve(source), unsupported)).status).toBe("unsupported");
    const invalidMass = optimizationRequest();
    invalidMass.targets = [
        {metric: "distribution", unit: "ratio", value: 0.8, bucket: {min: 0, max: 1}},
        {metric: "distribution", unit: "ratio", value: 0.8, bucket: {min: 1, max: null}},
    ];
    expect(() => validateOptimizationRequest(invalidMass)).toThrow("mass");
    const overlap = optimizationRequest();
    overlap.targets = [
        {metric: "distribution", unit: "ratio", value: 0.8, bucket: {min: 0, max: 1}},
        {metric: "distribution", unit: "ratio", value: 0.2, bucket: {min: 0.5, max: null}},
    ];
    expect(() => validateOptimizationRequest(overlap)).toThrow("overlap");
});

it("measures all six target contracts over the selected exact population", async () => {
    const request = optimizationRequest();
    request.targets.push(
        {metric: "volatility", unit: "variance", value: 1.6875},
        {metric: "hitFrequency", unit: "ratio", value: 0.25},
        {metric: "featureFrequency", unit: "ratio", event: "freeGamesTriggered", value: 0},
        {metric: "distribution", unit: "ratio", bucket: {min: 0, max: 1}, value: 0.75},
        {metric: "maxWin", unit: "betMultiple", value: 3},
    );
    expect(await service.optimize(await resolve(source), request)).toMatchObject({
        status: "success",
        evidence: {measured: [0.75, 1.6875, 0.25, 0, 0.75, 3]},
    });
});

it("rejects source byte locks that conflict with the tuning contract before preparation", async () => {
    const request = optimizationRequest();
    request.policy.protectedFiles = [path.basename(source)];
    const before = fs.readFileSync(source);
    expect((await service.optimize(await resolve(source), request)).status).toBe("invalid");
    expect(fs.existsSync(path.join(directory, "scratch"))).toBe(false);
    expect(fs.readFileSync(source)).toEqual(before);
});

it("rejects target-matching serialization outside the attempted finite domain", async () => {
    const request = optimizationRequest();
    request.policy.tunables[0].values = [2, 4];
    const realWrite = fs.writeFileSync.bind(fs);
    const write = jest.spyOn(fs, "writeFileSync").mockImplementation((...args) => {
        if (String(args[0]).endsWith("candidate.blueprint.json")) {
            const data = JSON.parse(args[1] as string);
            data.paytable.A[2] = 3; // Meets 0.75, but was never attempted.
            return realWrite(args[0], JSON.stringify(data));
        }
        return realWrite(...args);
    });
    const result = await service.optimize(await resolve(source), request);
    write.mockRestore();
    expect(result).toMatchObject({status: "failure", diagnostics: [{message: expect.stringContaining("attempted selection")}]});
    expect(fs.readdirSync(path.join(directory, "scratch"))).toEqual([]);
});

it("rejects coordinated package code and contract drift against original authority without executing it", async () => {
    const marker = path.join(directory, "executed");
    const {root} = declaredPackage();
    const before = sourceInventory(await resolve(root));
    const realWrite = fs.writeFileSync.bind(fs);
    const write = jest.spyOn(fs, "writeFileSync").mockImplementation((...args) => {
        if (String(args[0]).endsWith("pokie-tuning.json") && String(args[0]).includes("scratch")) {
            const contract = JSON.parse(args[1] as string);
            const candidateRoot = path.dirname(String(args[0]));
            realWrite(path.join(candidateRoot, "index.cjs"), `require('fs').writeFileSync(${JSON.stringify(marker)}, 'executed');\n` + declaredGameCode);
            const files = sourceInventory({type: "tsPackage", rootPath: candidateRoot});
            Reflect.deleteProperty(files, "pokie-tuning.json");
            Reflect.deleteProperty(files, "parameters.json");
            contract.sourceHashes = files;
            return realWrite(args[0], JSON.stringify(contract));
        }
        return realWrite(...args);
    });
    const result = await service.optimize(await resolve(root), optimizationRequest());
    write.mockRestore();
    expect(result.status).toBe("failure");
    expect(result.diagnostics[0].message).toContain("authority changed");
    expect(fs.existsSync(marker)).toBe(false);
    expect(sourceInventory(await resolve(root))).toEqual(before);
});

it("retains project-local dependency identity through evaluation, independent saves and runtime loading", async () => {
    const loads = path.join(directory, "dependency-loads");
    const name = "optimization-local-dependency";
    const {root} = declaredPackage("local-dependency", `const d = require('${name}'); if (d.value !== 42) throw Error('wrong dependency'); require('fs').appendFileSync(${JSON.stringify(loads)}, require.resolve('${name}') + '\\n');\n`, "", {[name]: "1.0.0"});
    const dependency = path.join(root, "node_modules", name);
    fs.mkdirSync(dependency, {recursive: true});
    fs.writeFileSync(path.join(dependency, "package.json"), JSON.stringify({name, version: "1.0.0", main: "index.cjs"}));
    fs.writeFileSync(path.join(dependency, "index.cjs"), "module.exports = {value: 42};");
    fs.mkdirSync(path.join(root, "src"));
    fs.mkdirSync(path.join(root, "dist"));
    fs.writeFileSync(path.join(root, "src", "authored.ts"), "// Authored source, compiled into dist/index.cjs.\n");
    fs.writeFileSync(path.join(root, "dist", "index.cjs"), fs.readFileSync(path.join(root, "index.cjs"), "utf8").replace("'./parameters.json'", "'../parameters.json'"));
    fs.rmSync(path.join(root, "index.cjs"));
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({name: "tunable", version: "1.0.0", pokie: {entry: "dist/index.cjs"}, dependencies: {[name]: "1.0.0"}}));
    fs.utimesSync(path.join(root, "src", "authored.ts"), new Date("2000-01-01"), new Date("2000-01-01"));
    fs.utimesSync(path.join(root, "dist", "index.cjs"), new Date("2001-01-01"), new Date("2001-01-01"));
    fs.rmSync(path.join(root, "pokie-tuning.json"));
    declarePackageTuning(root, "parameters.json", ["/paytable/A/2"]);
    const request = optimizationRequest();
    const result = await service.optimize(await resolve(root), request);
    expect(result.diagnostics).toEqual([]);
    expect(result.status).toBe("success");
    const saved = path.join(directory, "saved-package");
    const second = path.join(directory, "second-package");
    await service.publish(result.candidate!, request, saved);
    await service.publish(result.candidate!, request, second);
    expect(fs.statSync(path.join(saved, "parameters.json")).ino).not.toBe(fs.statSync(path.join(second, "parameters.json")).ino);
    for (const relative of [path.join("src", "authored.ts"), path.join("dist", "index.cjs")]) {
        const original = fs.statSync(path.join(root, relative));
        const published = fs.statSync(path.join(saved, relative));
        expect(published.mtimeMs).toBe(original.mtimeMs);
        expect(published.mode).toBe(original.mode);
    }
    await service.discard(result.candidate!);
    const runtime = await loadPokieGameRuntime(saved);
    try {
        expect(runtime.game.getConfigHash?.()).toBeDefined();
        expect(JSON.parse(fs.readFileSync(path.join(saved, "parameters.json"), "utf8")).paytable.A[2]).toBe(3);
    } finally {
        await runtime.game.release?.();
        await runtime.release();
    }
    const loadedPaths = fs.readFileSync(loads, "utf8").trim().split("\n");
    expect(loadedPaths.length).toBeGreaterThan(1);
    expect(loadedPaths.every(file => file.includes("pokie-runtime-") && !file.startsWith(dependency))).toBe(true);
    expect(loadedPaths.every(file => !fs.existsSync(file))).toBe(true);
    fs.appendFileSync(path.join(saved, "dist", "index.cjs"), "\n// independently edited");
    expect(fs.readFileSync(path.join(second, "dist", "index.cjs"), "utf8")).not.toContain("independently edited");
});

it("rolls back publication when the saved executable cannot load", async () => {
    const {root} = declaredPackage();
    const request = optimizationRequest();
    const result = await service.optimize(await resolve(root), request);
    const destination = path.join(directory, "unloadable");
    const open = fs.promises.open.bind(fs.promises);
    const copy = jest.spyOn(fs.promises, "open").mockImplementation(async (output, flags, mode) => {
        const file = await open(output, flags, mode);
        if (String(output) === path.join(destination, "index.cjs") && flags === "wx") {
            const write = file.writeFile.bind(file);
            jest.spyOn(file, "writeFile").mockImplementation(async (data, options) => {
                await write(data, options);
                fs.writeFileSync(output, "throw Error('saved executable cannot load');");
            });
        }
        return file;
    });
    await expect(service.publish(result.candidate!, request, destination)).rejects.toThrow();
    copy.mockRestore();
    expect(fs.existsSync(destination)).toBe(false);
    await expect(service.publish(result.candidate!, request, destination)).resolves.toBe(destination);
});

it.each(["success", "hash-failure", "manifest-failure", "evaluation-failure", "cleanup-failure"])("releases every acquired package game and loader lease on %s", async (scenario) => {
    const marker = path.join(directory, "releases");
    const {root} = declaredPackage("owned-runtime", "", `require('fs').appendFileSync(${JSON.stringify(marker)}, 'released\\n');${scenario === "cleanup-failure" ? "throw Error('game cleanup failed');" : ""}`);
    if (["hash-failure", "manifest-failure", "evaluation-failure"].includes(scenario)) {
        const file = path.join(root, "index.cjs");
        const expressions: Record<string, [string, string]> = {
            "hash-failure": ["p.computeGameBlueprintHash(data)", "'bad-hash'"],
            "manifest-failure": ["getManifest: () => data.manifest", "getManifest: () => {throw Error('manifest failed')}"],
            "evaluation-failure": ["new p.VideoSlotSession(config(), forced)", "(() => {throw Error('evaluation failed')})()"],
        };
        const code = fs.readFileSync(file, "utf8").replace(...expressions[scenario]);
        fs.writeFileSync(file, code);
        fs.rmSync(path.join(root, "pokie-tuning.json"));
        declarePackageTuning(root, "parameters.json", ["/paytable/A/2"]);
    }
    const snapshotsBefore = fs.readdirSync(process.env.TMPDIR!).filter((name) => name.startsWith("pokie-runtime-"));
    const result = await service.optimize(await resolve(root), optimizationRequest());
    expect(result.status).toBe(({success: "success", "hash-failure": "unsupported", "manifest-failure": "failure", "evaluation-failure": "failure", "cleanup-failure": "failure"} as Record<string, string>)[scenario]);
    expect(fs.readFileSync(marker, "utf8").trim().split("\n")).toHaveLength(scenario === "success" ? 2 : 1);
    expect(fs.readdirSync(process.env.TMPDIR!).filter((name) => name.startsWith("pokie-runtime-"))).toEqual(snapshotsBefore);
    if (scenario === "cleanup-failure") expect(result.diagnostics).toEqual([{path: "cleanup", message: expect.stringContaining("game cleanup failed")}]);
});

it("preflights model-dependent package policies without executable acquisition", async () => {
    const marker = path.join(directory, "executed");
    const {root} = declaredPackage("preflight", `require('fs').writeFileSync(${JSON.stringify(marker)}, 'executed');\n`);
    const request = optimizationRequest();
    request.policy.locks.push("/unknown-model-field");
    expect((await service.optimize(await resolve(root), request)).status).toBe("invalid");
    expect(fs.existsSync(marker)).toBe(false);
    expect(fs.existsSync(path.join(directory, "scratch"))).toBe(false);
    expect((await service.optimize(await resolve(root), optimizationRequest())).status).toBe("success");
    expect(fs.existsSync(marker)).toBe(true);
});

it("rejects publication within owned workspaces and saves independent bytes that survive discard", async () => {
    const request = optimizationRequest();
    const result = await service.optimize(await resolve(source), request);
    await expect(service.publish(result.candidate!, request, path.join(result.candidate!.workspace, "sibling.json"))).rejects.toThrow("inside source");
    const otherCandidate = (await service.optimize(await resolve(source), request)).candidate!;
    await expect(service.publish(result.candidate!, request, path.join(otherCandidate.workspace, "sibling.json"))).rejects.toThrow("inside source");
    const first = path.join(directory, "first.json");
    const second = path.join(directory, "second.json");
    // EXDEV from hard-link publication must be irrelevant to ordinary saves.
    const link = jest.spyOn(fs.promises, "link").mockRejectedValue(Object.assign(new Error("cross-device link"), {code: "EXDEV"}));
    await service.publish(result.candidate!, request, first);
    await service.publish(result.candidate!, request, second);
    expect(link).not.toHaveBeenCalled();
    link.mockRestore();
    await service.discard(result.candidate!);
    const secondBytes = fs.readFileSync(second);
    fs.appendFileSync(first, " ");
    expect(fs.readFileSync(second)).toEqual(secondBytes);
    expect(JSON.parse(secondBytes.toString()).paytable.A[2]).toBe(3);
});

it.each(["allocation", "timestamps", "close"])("preserves a competing independent file and its metadata replaced at %s", async (phase) => {
    const request = optimizationRequest();
    const project = await resolve(source);
    const before = sourceInventory(project);
    const result = await service.optimize(project, request);
    expect(result.status).toBe("success");
    const destination = path.join(directory, "replacement.json");
    const bytes = Buffer.from("competing writer's independent output");
    const controller = new AbortController();
    let replacement: fs.Stats | undefined;
    const replace = (): void => {
        fs.unlinkSync(destination);
        fs.writeFileSync(destination, bytes, {mode: 0o600});
        fs.utimesSync(destination, new Date("1999-01-01"), new Date("2000-01-01"));
        replacement = fs.lstatSync(destination);
        controller.abort();
    };
    const open = fs.promises.open.bind(fs.promises);
    const allocation = jest.spyOn(fs.promises, "open").mockImplementation(async (output, flags, mode) => {
        const file = await open(output, flags, mode);
        if (String(output) === destination && flags === "wx") {
            if (phase === "allocation") replace();
            else if (phase === "timestamps") {
                const utimes = file.utimes.bind(file);
                jest.spyOn(file, "utimes").mockImplementation(async (atime, mtime) => {
                    replace();
                    await utimes(atime, mtime);
                });
            } else {
                const close = file.close.bind(file);
                jest.spyOn(file, "close").mockImplementation(async () => {
                    // Keep the old inode alive so the replacement cannot reuse it.
                    replace();
                    await close();
                });
            }
        }
        return file;
    });
    await expect(service.publish(result.candidate!, request, destination, {signal: controller.signal})).rejects.toThrow(/cancelled/i);
    allocation.mockRestore();
    expect(replacement).toBeDefined();
    expect(fs.lstatSync(destination)).toEqual(replacement);
    expect(fs.readFileSync(destination)).toEqual(bytes);
    expect(sourceInventory(project)).toEqual(before);
    await service.discard(result.candidate!);
    expect(fs.readFileSync(destination)).toEqual(bytes);
});

it("preserves independent publications under a replaced ancestor during cancellation", async () => {
    const request = optimizationRequest();
    const result = await service.optimize(await resolve(source), request);
    const parent = path.join(directory, "nested");
    const moved = path.join(directory, "moved-publication");
    const destination = path.join(parent, "saved.json");
    const controller = new AbortController();
    const open = fs.promises.open.bind(fs.promises);
    jest.spyOn(fs.promises, "open").mockImplementation(async (output, flags, mode) => {
        const file = await open(output, flags, mode);
        if (String(output) === destination && flags === "wx") {
            const close = file.close.bind(file);
            jest.spyOn(file, "close").mockImplementation(async () => {
                await close();
                fs.renameSync(parent, moved);
                fs.mkdirSync(parent);
                // Same owned file inode, but a different ancestor: neither may be removed.
                fs.linkSync(path.join(moved, "saved.json"), destination);
                fs.writeFileSync(path.join(parent, "unrelated.bin"), "replacement directory");
                controller.abort();
            });
        }
        return file;
    });
    await expect(service.publish(result.candidate!, request, destination, {signal: controller.signal})).rejects.toThrow(/cancelled/i);
    expect(fs.readdirSync(parent).sort()).toEqual(["saved.json", "unrelated.bin"]);
    expect(fs.statSync(destination).ino).toBe(fs.statSync(path.join(moved, "saved.json")).ino);
    expect(fs.readFileSync(destination)).toEqual(fs.readFileSync(result.candidate!.path));
    expect(fs.readFileSync(path.join(parent, "unrelated.bin"), "utf8")).toBe("replacement directory");
});

it("preserves a replaced copied dependency link during cancellation without adopting its inode", async () => {
    const name = "local-dependency";
    const {root} = declaredPackage("dependency-race", "", "", {[name]: "1.0.0"});
    const dependency = path.join(root, "node_modules", name);
    fs.mkdirSync(dependency, {recursive: true});
    fs.writeFileSync(path.join(dependency, "package.json"), JSON.stringify({name, version: "1.0.0", main: "index.cjs"}));
    fs.writeFileSync(path.join(dependency, "index.cjs"), "module.exports = {};");
    const request = optimizationRequest();
    const result = await service.optimize(await resolve(root), request);
    expect(result.status).toBe("success");
    const destination = path.join(directory, "saved-dependencies");
    const output = path.join(destination, "node_modules", name);
    const competitor = path.join(directory, "other-dependency");
    fs.mkdirSync(competitor);
    fs.writeFileSync(path.join(competitor, "marker"), "unrelated dependency");
    const controller = new AbortController();
    let replacement: fs.Stats | undefined;
    const link = fs.promises.link.bind(fs.promises);
    const publication = jest.spyOn(fs.promises, "link").mockImplementation(async (from, to) => {
        await link(from, to);
        if (String(to) === output) {
            expect(fs.lstatSync(from).isSymbolicLink()).toBe(true);
            expect(fs.lstatSync(from).dev).toBe(fs.statSync(path.dirname(output)).dev);
            fs.unlinkSync(output);
            fs.symlinkSync(competitor, output);
            replacement = fs.lstatSync(output);
            controller.abort();
        }
    });
    await expect(service.publish(result.candidate!, request, destination, {signal: controller.signal})).rejects.toThrow(/cancelled/i);
    publication.mockRestore();
    expect(replacement).toBeDefined();
    expect(fs.lstatSync(output)).toEqual(replacement);
    expect(fs.readlinkSync(output)).toBe(competitor);
    expect(fs.readFileSync(path.join(competitor, "marker"), "utf8")).toBe("unrelated dependency");
    expect(fs.readdirSync(path.dirname(output))).toEqual([name]);
    expect(fs.readdirSync(destination)).toEqual(["node_modules"]);
    await service.discard(result.candidate!);
    expect(fs.readlinkSync(output)).toBe(competitor);
});

it("cleans an interrupted exclusive copy, closes its handle and reuses publication after rejection", async () => {
    const request = optimizationRequest();
    const project = await resolve(source);
    const before = sourceInventory(project);
    const result = await service.optimize(project, request);
    const destination = path.join(directory, "partial", "output.json");
    const open = fs.promises.open.bind(fs.promises);
    let closed = false;
    const failure = jest.spyOn(fs.promises, "open").mockImplementation(async (output, flags, mode) => {
        const file = await open(output, flags, mode);
        if (String(output) === destination && flags === "wx") {
            const close = file.close.bind(file);
            jest.spyOn(file, "close").mockImplementation(async () => {
                await close();
                closed = true;
            });
            jest.spyOn(file, "writeFile").mockImplementation(async (data) => {
                for await (const chunk of data as fs.ReadStream) {
                    await file.write((chunk as Buffer).subarray(0, 1));
                    if ((chunk as Buffer).length > 0) throw new Error("interrupted copy");
                }
            });
        }
        return file;
    });
    await expect(service.publish(result.candidate!, request, destination)).rejects.toThrow("interrupted copy");
    failure.mockRestore();
    expect(closed).toBe(true);
    expect(fs.existsSync(path.dirname(destination))).toBe(false);
    const controller = new AbortController();
    controller.abort();
    await expect(service.publish(result.candidate!, request, destination, {signal: controller.signal})).rejects.toThrow(/cancelled/i);
    expect(fs.existsSync(path.dirname(destination))).toBe(false);
    await expect(service.publish(result.candidate!, request, destination)).resolves.toBe(destination);
    const saved = fs.readFileSync(destination);
    await expect(service.publish(result.candidate!, request, destination)).rejects.toThrow(/already exists/);
    expect(fs.readFileSync(destination)).toEqual(saved);
    for (const name of ["first-reuse.json", "second-reuse.json"]) await expect(service.publish(result.candidate!, request, path.join(directory, name))).resolves.toBe(path.join(directory, name));
    expect(sourceInventory(project)).toEqual(before);
});

it("preserves an occupied dependency link and removes only an uncontested owned link", async () => {
    const staged = path.join(directory, "staged-link");
    const output = path.join(directory, "dependency-link");
    fs.symlinkSync(source, staged);
    fs.symlinkSync("competitor-target", output);
    const competitor = fs.lstatSync(output);
    const publication = new ArtifactPublicationOwnership(true);
    const rollback = (): Promise<void> => rollbackArtifactPublication({publishedFileOwnership: publication.files, publishedDirectoryOwnership: publication.directories});
    await expect(publication.publish(staged, output)).rejects.toThrow(/already exists/);
    await rollback();
    expect(fs.lstatSync(output)).toEqual(competitor);
    expect(fs.readlinkSync(output)).toBe("competitor-target");
    fs.unlinkSync(output);
    await publication.publish(staged, output);
    expect(fs.readlinkSync(output)).toBe(source);
    expect(fs.lstatSync(output).ino).not.toBe(fs.lstatSync(staged).ino);
    await rollback();
    expect(fs.existsSync(output)).toBe(false);
    expect(fs.readdirSync(directory).sort()).toEqual([path.basename(source), path.basename(staged)].sort());
});

it("removes an uncontested independent output when cancellation follows its timestamp update", async () => {
    const request = optimizationRequest();
    const result = await service.optimize(await resolve(source), request);
    const destination = path.join(directory, "cancelled", "saved.json");
    const controller = new AbortController();
    const open = fs.promises.open.bind(fs.promises);
    const allocation = jest.spyOn(fs.promises, "open").mockImplementation(async (output, flags, mode) => {
        const file = await open(output, flags, mode);
        if (String(output) === destination && flags === "wx") {
            const utimes = file.utimes.bind(file);
            jest.spyOn(file, "utimes").mockImplementation(async (atime, mtime) => {
                await utimes(atime, mtime);
                controller.abort();
            });
        }
        return file;
    });
    await expect(service.publish(result.candidate!, request, destination, {signal: controller.signal})).rejects.toThrow(/cancelled/i);
    allocation.mockRestore();
    expect(fs.existsSync(path.dirname(destination))).toBe(false);
    await expect(service.publish(result.candidate!, request, destination)).resolves.toBe(destination);
});

it("guards copied dependency links and temporary cleanup against ancestor replacement", async () => {
    const staged = path.join(directory, "staged-link");
    fs.symlinkSync(source, staged);
    const parent = path.join(directory, "dependency-output");
    const moved = path.join(directory, "moved-dependencies");
    const output = path.join(parent, "dependency-link");
    const publication = new ArtifactPublicationOwnership(true);
    const controller = new AbortController();
    let competitor: string | undefined;
    const link = fs.promises.link.bind(fs.promises);
    jest.spyOn(fs.promises, "link").mockImplementation(async (from, to) => {
        await link(from, to);
        if (String(to) === output) {
            fs.renameSync(parent, moved);
            fs.mkdirSync(parent);
            fs.linkSync(path.join(moved, "dependency-link"), output);
            // A matching private-directory name under a new ancestor is still foreign.
            const replacedStaging = path.join(parent, path.basename(path.dirname(String(from))));
            fs.mkdirSync(replacedStaging);
            competitor = path.join(replacedStaging, "unrelated.bin");
            fs.writeFileSync(competitor, "competing directory contents");
            controller.abort();
        }
    });
    await expect(publication.publish(staged, output, {signal: controller.signal})).rejects.toThrow(/cancelled/i);
    await rollbackArtifactPublication({publishedFileOwnership: publication.files, publishedDirectoryOwnership: publication.directories});
    expect(competitor).toBeDefined();
    expect(fs.readFileSync(competitor!, "utf8")).toBe("competing directory contents");
    expect(fs.lstatSync(output).ino).toBe(fs.lstatSync(path.join(moved, "dependency-link")).ino);
    expect(fs.readlinkSync(output)).toBe(source);
});

it("honors library project context before acquisition and while selecting a result", async () => {
    expect((await service.optimize(await resolve(source), optimizationRequest(), {isCurrent: () => false})).status).toBe("failure");
    expect(fs.existsSync(path.join(directory, "scratch"))).toBe(false);
    let current = true;
    const result = await service.optimize(await resolve(source), optimizationRequest(), {isCurrent: () => current, onProgress: () => {
        current = false;
    }});
    expect(result.status).toBe("failure");
    expect(result.candidate).toBeUndefined();
    expect(fs.readdirSync(path.join(directory, "scratch"))).toEqual([]);
});

it.each(["outcomeLibrary", "stakeAdapter"] as const)("rejects zero and wrong-representation native domains before scratch preparation for %s", async (type) => {
    const root = path.join(directory, type);
    const original = await nativeSource();
    const library = buildWeightedOutcomeLibrary({libraryId: "native", outcomes: original.outcomes.map((outcome, index) => ({...outcome, id: String(index + 1)}))});
    if (type === "outcomeLibrary") await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([{modeName: "base", libraryId: "native", outcomes: library.outcomes}], root);
    else await new StakeEngineExporter("1.3.0").exportToDirectory([{modeName: "base", cost: 1, library}], root);
    const project = await resolve(root);
    const before = sourceInventory(project);
    const request = optimizationRequest();
    request.policy.scope = "native-outcomes";
    request.policy.locks = [];
    request.policy.tunables = [{path: "/modes/base/outcomes/1/weight", values: [type === "stakeAdapter" ? "0" : 0]}];
    expect((await service.support(project, request)).supported).toBe(false);
    expect((await service.optimize(project, request)).status).toBe("invalid");
    request.policy.tunables[0].values = [type === "stakeAdapter" ? 1 : "1"];
    expect((await service.optimize(project, request)).status).toBe("invalid");
    expect(fs.existsSync(path.join(directory, "scratch"))).toBe(false);
    expect(sourceInventory(project)).toEqual(before);
});

it("measures a supported population above the JavaScript argument limit without spreading it", async () => {
    const library = await nativeSource();
    const root = path.join(directory, "large-library");
    await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([{modeName: "base", libraryId: "native", outcomes: library.outcomes}], root);
    const request = optimizationRequest();
    request.policy.scope = "native-outcomes";
    request.policy.maxOutcomes = 150000;
    request.policy.locks = [];
    request.policy.tunables = [{path: `/modes/base/outcomes/${library.outcomes[0].id}/weight`, values: [1]}];
    const adapter = await acquireOptimizationAdapter(await resolve(root), request.policy);
    const artifact = library.outcomes.find((outcome) => outcome.artifact.totalWin > 0)!.artifact;
    const population = {modes: {base: {libraryId: "large", outcomes: Object.fromEntries(Array.from({length: 150000}, (_, index) => [String(index), {weight: 1, artifact}]))}}};
    expect(await adapter.measure(root, population, [{metric: "maxWin", unit: "betMultiple", value: 2}], request.policy)).toEqual([2]);
}, 30000);


it.each(["exact-finite-v1", "seeded-search-v1"] as const)("rejects native stake mismatch in support and %s before preparing candidates", async strategy => {
    const {outcomes} = await nativeSource();
    const root = path.join(directory, "stake-mismatch");
    await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([{modeName: "base", libraryId: "native", outcomes}], root);
    const project = await resolve(root);
    const before = sourceInventory(project);
    const request = stochasticOptimizationRequest();
    request.policy.strategy = strategy;
    if (strategy === "exact-finite-v1") Reflect.deleteProperty(request.policy, "sampling");
    request.policy.scope = "native-outcomes";
    request.policy.stake = 7.5;
    request.policy.tunables = [{path: `/modes/base/outcomes/${outcomes[0].id}/weight`, values: [1, 2]}];
    request.policy.locks = [];
    const write = jest.spyOn(OutcomeLibraryBundleWriter.prototype, "writeToDirectory");
    expect(await service.support(project, request)).toMatchObject({supported: false, reason: expect.stringContaining("stake must match")});
    expect(await service.optimize(project, request)).toMatchObject({status: "unsupported", diagnostics: [{message: expect.stringContaining("stake must match")}]});
    expect(write).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(directory, "scratch"))).toBe(false);
    expect(sourceInventory(project)).toEqual(before);
});

it.each(["changed", "missing", "transitive"])("rejects %s executable dependencies without resampling or touching source/output", async drift => {
    const name = "sample-dependency";
    const {root} = declaredPackage("sample-authority", `require('${name}');\n`, "", {[name]: "1.0.0"});
    const dependency = path.join(root, "node_modules", name);
    const nested = path.join(dependency, "node_modules", "transitive");
    fs.mkdirSync(nested, {recursive: true});
    fs.writeFileSync(path.join(dependency, "package.json"), JSON.stringify({name, main: "index.cjs", dependencies: {transitive: "1"}}));
    fs.writeFileSync(path.join(dependency, "index.cjs"), "module.exports = require('transitive');");
    fs.writeFileSync(path.join(nested, "package.json"), JSON.stringify({name: "transitive", main: "index.cjs"}));
    fs.writeFileSync(path.join(nested, "index.cjs"), "module.exports = 42;");
    const request = stochasticOptimizationRequest();
    request.policy.tunables[0].values = [3];
    const project = await resolve(root);
    const before = sourceInventory(project);
    const result = await service.optimize(project, request);
    expect(result.diagnostics).toEqual([]);
    expect(result.evidence!.stochastic!.executableRevision).toMatch(/^sha256:/);
    const simulation = jest.spyOn(ParallelSimulationRunner.prototype, "run");
    const output = path.join(directory, "rejected-output");
    if (drift === "missing") fs.rmSync(dependency, {recursive: true});
    else fs.appendFileSync(path.join(drift === "transitive" ? nested : dependency, "index.cjs"), "\n// changed executable bytes");
    await expect(service.publish(result.candidate!, request, output)).rejects.toThrow(/dependencies changed or are unavailable/);
    expect(simulation).not.toHaveBeenCalled();
    expect(fs.existsSync(output)).toBe(false);
    expect(fs.existsSync(`${output}.optimization.json`)).toBe(false);
    expect(sourceInventory(project)).toEqual(before);
    await service.discard(result.candidate!);
}, 60000);

it.each([false, true])("validates sampled destination loadability failure=%s without another assessment and preserves unowned files", async failLoad => {
    const marker = path.join(directory, "loaded-destinations");
    const {root} = declaredPackage("publish-runtime", `require('fs').appendFileSync(${JSON.stringify(marker)}, 'loaded\\n'); if (__dirname.includes('pokie-runtime-') && require('fs').existsSync(${JSON.stringify(path.join(directory, "reject-load"))})) { require('fs').writeFileSync(${JSON.stringify(path.join(directory, "published-runtime", "unowned.txt"))}, 'another writer'); throw Error('destination runtime unavailable'); }\n`);
    const request = stochasticOptimizationRequest();
    request.policy.tunables[0].values = [3];
    const result = await service.optimize(await resolve(root), request);
    expect(result.diagnostics).toEqual([]);
    const assessment = JSON.stringify(result.evidence);
    const loadsBefore = fs.readFileSync(marker, "utf8");
    const output = path.join(directory, "published-runtime");
    const companion = `${output}.optimization.json`;
    const publish = ArtifactPublicationOwnership.prototype.publish;
    jest.spyOn(ArtifactPublicationOwnership.prototype, "publish").mockImplementation(async function(this: ArtifactPublicationOwnership, from, to, options) {
        await Reflect.apply(publish, this, [from, to, options]);
        if (to === companion && failLoad) {
            fs.writeFileSync(path.join(directory, "reject-load"), "reject");
        }
    });
    const simulation = jest.spyOn(ParallelSimulationRunner.prototype, "run");
    if (failLoad) {
        await expect(service.publish(result.candidate!, request, output)).rejects.toThrow("destination runtime unavailable");
        expect(fs.readdirSync(output)).toEqual(["unowned.txt"]);
        expect(fs.readFileSync(path.join(output, "unowned.txt"), "utf8")).toBe("another writer");
        expect(fs.existsSync(companion)).toBe(false);
    } else {
        await service.publish(result.candidate!, request, output);
        expect(fs.readFileSync(marker, "utf8").length).toBeGreaterThan(loadsBefore.length);
        expect(JSON.parse(fs.readFileSync(companion, "utf8")).evidence).toEqual(result.evidence);
    }
    expect(simulation).not.toHaveBeenCalled();
    expect(JSON.stringify(result.evidence)).toBe(assessment);
    await service.discard(result.candidate!);
}, 60000);


it.each([["cjs", false], ["cjs", true], ["esm", false], ["esm", true]] as const)(
    "reruns sampled %s dependencies after executable drift (transitive=%s) using current code and matches a fresh process",
    async (format, transitive) => {
        const name = "behavior-dependency";
        const {root, code} = declaredPackage("behavior", "", "", {[name]: "1"});
        const suffix = format === "cjs" ? "cjs" : "mjs";
        const dependency = path.join(root, "node_modules", name);
        const leaf = transitive ? path.join(dependency, "node_modules", "leaf") : dependency;
        fs.mkdirSync(leaf, {recursive: true});
        fs.writeFileSync(path.join(dependency, "package.json"), JSON.stringify({name, main: `index.${suffix}`, dependencies: transitive ? {leaf: "1"} : {}}));
        if (transitive) {
            fs.writeFileSync(path.join(leaf, "package.json"), JSON.stringify({name: "leaf", main: `index.${suffix}`}));
            fs.writeFileSync(path.join(dependency, `index.${suffix}`), format === "cjs" ? "module.exports = require('leaf');" : "export {default} from 'leaf';");
        }
        const leafFile = path.join(leaf, `index.${suffix}`);
        const write = (multiplier: number) => fs.writeFileSync(leafFile, format === "cjs" ? `module.exports = ${multiplier};` : `export default ${multiplier};`);
        write(1);
        fs.writeFileSync(path.join(root, "index.cjs"), `const dependency = require('${name}'); const multiplier = dependency.default ?? dependency;\n` + code.replace("Number(count), amount)", "Number(count), amount * multiplier)"));
        fs.rmSync(path.join(root, "pokie-tuning.json"));
        declarePackageTuning(root, "parameters.json", ["/paytable/A/2"]);
        const project = await resolve(root);
        const before = sourceInventory(project);
        const request = stochasticOptimizationRequest();
        request.policy.tunables[0].values = [3];
        const hostRequire = createRequire(path.join(root, "index.cjs"));
        const original = hostRequire(leafFile);
        const cached = hostRequire.cache[leafFile];
        const first = await service.optimize(project, request);
        expect(first.diagnostics).toEqual([]);
        expect(first.status).toBe("attained");
        write(2);
        const changed = await service.optimize(project, request);
        expect(changed.diagnostics).toEqual([]);
        expect(changed.status).toBe("inconclusive");
        expect(changed.evidence!.stochastic!.executableRevision).not.toBe(first.evidence!.stochastic!.executableRevision);
        expect(changed.evidence!.stochastic!.assessment!.returnBound).toBe(6);
        const freshScript = path.join(directory, "fresh.cjs");
        // The focused test executes current TS source in an ordinary fresh Node process;
        // no package compilation/install or official build is involved.
        fs.writeFileSync(freshScript, `const fs = require('fs'); const Module = require('module'); const ts = require(${JSON.stringify(require.resolve("typescript"))});
const original = Module._resolveFilename;
Module._resolveFilename = function(request, ...rest) { if (request === '@fromstan/pokie') return ${JSON.stringify(path.resolve("src/index.ts"))}; try { return original.call(this, request, ...rest); } catch (error) { if (request.endsWith('.js')) return original.call(this, request.slice(0, -3) + '.ts', ...rest); throw error; } };
Module._extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true}}).outputText, file);
(async () => { const {ProjectOptimizationService} = require(${JSON.stringify(path.resolve("src/optimization/ProjectOptimizationService.ts"))});
const {ProjectTargetResolver} = require(${JSON.stringify(path.resolve("src/project/ProjectTargetResolver.ts"))});
const service = new ProjectOptimizationService(${JSON.stringify(path.join(directory, "fresh-scratch"))});
const result = await service.optimize(await new ProjectTargetResolver().resolve(${JSON.stringify(root)}, {readConfigurationProvenance: false}), ${JSON.stringify(request)});
if (result.candidate) await service.discard(result.candidate);
console.log(JSON.stringify({status: result.status, diagnostics: result.diagnostics, evidence: result.evidence})); })().catch(error => { console.error(error); process.exitCode = 1; });`);
        const fresh = JSON.parse(execFileSync(process.execPath, [freshScript], {encoding: "utf8", timeout: 60000}));
        expect({status: changed.status, diagnostics: changed.diagnostics, evidence: changed.evidence}).toEqual(fresh);
        const simulation = jest.spyOn(ParallelSimulationRunner.prototype, "run");
        await service.publish(changed.candidate!, request, path.join(directory, "current-output"));
        expect(simulation).not.toHaveBeenCalled();
        expect(hostRequire(leafFile)).toBe(original);
        expect(hostRequire.cache[leafFile]).toBe(cached);
        write(1);
        for (let attempt = 0; attempt < 2; attempt++) {
            const restored = await service.optimize(project, request);
            expect(restored.status).toBe("attained");
            expect(restored.evidence).toEqual(first.evidence);
            await service.discard(restored.candidate!);
        }
        await service.discard(first.candidate!);
        await service.discard(changed.candidate!);
        expect(fs.readdirSync(path.join(directory, "scratch"))).toEqual([]);
        expect(sourceInventory(project)).toEqual(before);
    }, 120000,
);
