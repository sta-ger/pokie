import fs from "fs";
import path from "path";
import {ProjectOptimizationService} from "../../src/optimization/ProjectOptimizationService.js";
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

import {optimizationBlueprint as model, optimizationRequest} from "./fixtures/OptimizationFixture.js";
let directory: string;
let source: string;
let service: ProjectOptimizationService;
const resolve = async (file: string) => (await new ProjectTargetResolver().resolve(file))!;
beforeEach(() => {
    fs.mkdirSync(path.resolve("node_modules/.cache"), {recursive: true});
    directory = fs.mkdtempSync(path.resolve("node_modules/.cache/optimization-test-"));
    source = path.join(directory, "source.blueprint.json");
    fs.writeFileSync(source, JSON.stringify(model()));
    service = new ProjectOptimizationService(path.join(directory, "scratch"));
});
afterEach(() => fs.rmSync(directory, {recursive: true, force: true}));

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

it("tunes a real declared data-backed code package, preserves custom bytes, rejects stale authority", async () => {
    const root = path.join(directory, "package");
    fs.mkdirSync(root);
    fs.writeFileSync(
        path.join(root, "package.json"),
        JSON.stringify({name: "tunable", version: "1.0.0", pokie: {entry: "index.cjs"}}),
    );
    fs.writeFileSync(path.join(root, "parameters.json"), JSON.stringify(model()));
    const code = `const p = require('@fromstan/pokie');
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
    fs.writeFileSync(path.join(root, "index.cjs"), code);
    declarePackageTuning(root, "parameters.json", ["/paytable/A/2"]);
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
    const win = library.outcomes.find((outcome) => outcome.artifact.totalWin > 0)!;
    const zero = library.outcomes.find((outcome) => outcome.artifact.totalWin === 0)!;
    const request = optimizationRequest();
    request.policy.scope = "native-outcomes";
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
        [win.id, "9007199254740993"],
        [zero.id, "9007199254740993"],
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
        {path: `/modes/base/outcomes/${win.id}/weight`, values: ["9007199254740992", "9007199254740993"]},
    ];
    request.policy.constraints = {
        fixed: [{path: `/modes/base/outcomes/${zero.id}/weight`, value: "9007199254740993"}],
        sums: [
            {
                paths: [`/modes/base/outcomes/${win.id}/weight`, `/modes/base/outcomes/${zero.id}/weight`],
                value: "18014398509481986",
            },
        ],
    };
    const result = await service.optimize(await resolve(root), request);
    expect(result.diagnostics).toEqual([]);
    expect(result).toMatchObject({status: "success", candidate: {type: "stakeAdapter"}, evidence: {measured: [1]}});
    const reopened = await new StakeEngineOutcomeSourceReader().readFromDirectory(result.candidate!.path);
    expect(reopened.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(reopened.modes[0].outcomes.map((outcome) => outcome.weight)).toEqual([
        BigInt("9007199254740993"),
        BigInt("9007199254740993"),
    ]);
    expect(fs.readFileSync(path.join(result.candidate!.path, index.modes[0].events))).toEqual(book);
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
    const link = fs.promises.link.bind(fs.promises);
    const failure = jest
        .spyOn(fs.promises, "link")
        .mockImplementation((from, to) =>
            String(to).endsWith(".tuning.json") ? Promise.reject(new Error("companion failure")) : link(from, to),
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
