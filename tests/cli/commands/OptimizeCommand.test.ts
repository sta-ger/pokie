import {declarePackageTuning} from "../../../src/optimization/DeclaredTuningContract.js";
import {projectRevision} from "../../../src/optimization/internal/optimizationData.js";
import fs from "fs";
import path from "path";
import {execFileSync} from "child_process";
import ts from "typescript";
import {ProjectOptimizationService} from "../../../src/optimization/ProjectOptimizationService.js";
import type {OptimizationEvidence} from "../../../src/optimization/OptimizationPolicy.js";
import {OptimizeCommand} from "../../../cli/commands/OptimizeCommand.js";
import {optimizationBlueprint, optimizationRequest, stochasticOptimizationRequest, declaredOptimizationGameCode} from "../../v2/fixtures/OptimizationFixture.js";
let directory: string;
let source: string;
let policy: string;
let stdout: jest.SpyInstance;
beforeEach(() => {
    directory = fs.mkdtempSync(path.resolve("node_modules/.cache/optimize-cli-"));
    source = path.join(directory, "source.blueprint.json");
    policy = path.join(directory, "policy.json");
    fs.writeFileSync(source, JSON.stringify(optimizationBlueprint()));
    fs.writeFileSync(policy, JSON.stringify(optimizationRequest()));
    stdout = jest.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => {
    stdout.mockRestore();
    fs.rmSync(directory, {recursive: true, force: true});
});
const result = () =>
    JSON.parse(stdout.mock.calls[stdout.mock.calls.length - 1][0] as string) as {
        status: string;
        evidence?: {measured: number[]};
    };

it.each([
    ["ESM", "dist/esm", "build-esm:compile", ts.ModuleKind.ES2022],
    ["CommonJS", "dist/cjs", "build-cjs:compile", ts.ModuleKind.CommonJS],
    ["CLI", "dist/src", "build-cli:compile", ts.ModuleKind.ES2022],
] as const)("resolves the packaged %s default through the real coordinator and drains optimization workers", (_label, tree, script, moduleKind) => {
    const configFile = tree === "dist/src" ? "tsconfig.cli.json" : "tsconfig.prod.json";
    const config = ts.readConfigFile(path.resolve(configFile), ts.sys.readFile);
    expect(config.error).toBeUndefined();
    const inputs = ts.parseJsonConfigFileContent(config.config, ts.sys, path.resolve("."));
    expect(inputs.errors).toEqual([]);
    // A dynamic URL is not a TypeScript import. The consuming compiler must own the entry.
    expect(inputs.fileNames).toContain(path.resolve("src/simulation/parallel/internal/simulationWorkerEntry.ts"));
    const installation = path.join(directory, "native-runtime");
    const emitted = new Set<string>();
    // Emit only the coordinator and worker runtime closure, without running a package build.
    // Native Node must call from parallel/ into internal/; direct helper calls hid the defect.
    const emit = (relative: string): void => {
        if (emitted.has(relative)) return;
        emitted.add(relative);
        const sourceText = fs.readFileSync(path.resolve("src", relative), "utf8");
        const esm = ts.transpileModule(sourceText, {compilerOptions: {module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2015, esModuleInterop: true}}).outputText;
        const output = moduleKind === ts.ModuleKind.ES2022 ? esm : ts.transpileModule(sourceText, {compilerOptions: {module: moduleKind, target: ts.ScriptTarget.ES2015, esModuleInterop: true}}).outputText;
        const file = path.join(installation, tree, relative.replace(/\.ts$/, ".js"));
        fs.mkdirSync(path.dirname(file), {recursive: true});
        fs.writeFileSync(file, output);
        for (const dependency of ts.preProcessFile(esm).importedFiles) {
            if (dependency.fileName.startsWith(".")) emit(path.join(path.dirname(relative), dependency.fileName.replace(/\.js$/, ".ts")));
        }
    };
    emit("simulation/parallel/SimulationWorkerCoordinator.ts");
    emit("simulation/parallel/internal/simulationWorkerEntry.ts");
    fs.writeFileSync(path.join(installation, "package.json"), JSON.stringify({type: "module"}));
    if (moduleKind === ts.ModuleKind.CommonJS) fs.writeFileSync(path.join(installation, tree, "package.json"), JSON.stringify({type: "commonjs"}));
    const asset = "simulation/parallel/internal/resolveDefaultWorkerEntryUrl.mjs";
    fs.mkdirSync(path.dirname(path.join(installation, "src", asset)), {recursive: true});
    fs.copyFileSync(path.resolve("src", asset), path.join(installation, "src", asset));
    const scripts = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8")).scripts as Record<string, string>;
    const copy = scripts[script].split(" && ").find(command => command.startsWith(`shx cp src/${asset} `));
    expect(copy).toBeDefined();
    execFileSync(process.execPath, [path.resolve("node_modules/shx/lib/cli.js"), ...copy!.split(" ").slice(1)], {cwd: installation, timeout: 5000});
    // Native evaluation of the actual emitted entry is essential: a CommonJS source loader
    // hides ESM initialization-order failures before the worker can send its first message.
    const emittedWorker = path.join(installation, tree, "simulation/parallel/internal/simulationWorkerEntry.js");
    const probe = path.join(installation, "probe.mjs");
    fs.writeFileSync(probe, `import assert from 'node:assert/strict';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {pathToFileURL} from 'node:url';
import threads from 'node:worker_threads';
import {SimulationWorkerCoordinator} from './${tree}/simulation/parallel/SimulationWorkerCoordinator.js';
const workers = [], NativeWorker = threads.Worker;
threads.Worker = class extends NativeWorker { constructor(...args) { super(...args); workers.push(this); } };
syncBuiltinESMExports();
const coordinator = new SimulationWorkerCoordinator();
const blueprint = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const before = fs.readFileSync(process.argv[2]);
const requests = [0, 1].map(workerIndex => ({workerIndex, totalWorkers: 2, packageRoot: process.argv[2], rounds: 64,
    seed: 'native-default-' + workerIndex, stake: 1, progressChunkSize: 16, requireCleanup: true,
    optimizationRecipe: {kind: 'authored-entry', modelId: 'native-default', stake: 1, blueprint}}));
const drained = () => assert.ok(workers.every(worker => worker.threadId === -1));
const success = async (owner = coordinator) => {
    const seen = new Set();
    const results = await owner.run(requests, {onProgress: progress => { if (progress.roundsCompleted > 0) seen.add(progress.workerIndex); }});
    assert.deepEqual([...seen].sort(), [0, 1]);
    assert.deepEqual(results.map(result => result.roundsCompleted), [64, 64]);
    assert.ok(results.every(result => result.accumulator.rounds === 64 && result.accumulator.totalBet === 64));
    drained();
};
assert.deepEqual(await coordinator.run([]), []);
const preflight = new AbortController(); preflight.abort();
await assert.rejects(coordinator.run(requests, {signal: preflight.signal}), /cancel/i);
assert.equal(workers.length, 0);
await success();
// Execute rejection after successful use, then recover twice in this same coordinator.
const invalid = requests.map(({optimizationRecipe, ...request}) => ({...request, packageRoot: process.argv[2] + '.absent'}));
await assert.rejects(coordinator.run(invalid), /worker|package/i);
drained();
await success(); await success();
// A native startup failure cannot acknowledge runtime release. Retain its cause while
// rejecting cleanup, then restore the exact entry and reuse this same coordinator twice.
const entry = ${JSON.stringify(emittedWorker)};
fs.renameSync(entry, entry + '.held');
try {
    await assert.rejects(coordinator.run(requests), error => /cleanup unconfirmed/i.test(error.message) && /Cannot find module/.test(error.message));
    drained();
} finally {
    fs.renameSync(entry + '.held', entry);
}
await success(); await success();
const active = new AbortController();
let samples = 0;
await assert.rejects(coordinator.run(requests.map(request => ({...request, rounds: 10000000})), {
    signal: active.signal, onProgress: progress => { samples += progress.roundsCompleted; active.abort(); }
}), /cancel/i);
assert.ok(samples > 0); drained();
await success();
await success(new SimulationWorkerCoordinator(pathToFileURL(${JSON.stringify(emittedWorker)})));
assert.deepEqual(fs.readFileSync(process.argv[2]), before);
console.log('Native default: two-worker samples, rejection/reuse, active cancel, retry, override and termination passed.');
`);
    const env = {...process.env};
    Reflect.deleteProperty(env, "JEST_WORKER_ID");
    expect(execFileSync(process.execPath, [probe, source], {env, encoding: "utf8", timeout: 120000})).toContain("Native default: two-worker samples, rejection/reuse, active cancel, retry, override and termination passed.");
}, 150000);

it("ships the CLI-relative native runtime helpers through the production asset-copy steps", () => {
    const installation = path.join(directory, "node_modules", "@fromstan", "pokie");
    const game = path.join(directory, "external-game");
    // Emit only the affected consumers. No package build, source loader mapping or
    // test-only helper staging may supply a missing production asset here.
    for (const relative of ["gamepackage/resolvePokieGameEntryModule.ts", "gamepackage/isPokieGame.ts", "gamepackage/readPokiePackageConfig.ts", "simulation/parallel/internal/defaultWorkerEntryUrl.ts"]) {
        const output = ts.transpileModule(fs.readFileSync(path.resolve("src", relative), "utf8"), {
            compilerOptions: {module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, esModuleInterop: true},
        }).outputText;
        const file = path.join(installation, "dist/src", relative.replace(/\.ts$/, ".js"));
        fs.mkdirSync(path.dirname(file), {recursive: true});
        fs.writeFileSync(file, output);
    }
    const assets = ["gamepackage/internal/runtimeLocation.mjs", "simulation/parallel/internal/resolveDefaultWorkerEntryUrl.mjs"];
    for (const relative of assets) {
        const file = path.join(installation, "src", relative);
        fs.mkdirSync(path.dirname(file), {recursive: true});
        fs.copyFileSync(path.resolve("src", relative), file);
    }
    fs.writeFileSync(path.join(installation, "package.json"), JSON.stringify({name: "@fromstan/pokie", type: "module"}));
    const scripts = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8")).scripts as Record<string, string>;
    for (const command of scripts["build-cli:compile"].split(" && ").filter(step => (/^shx (mkdir|cp) /).test(step))) {
        execFileSync(process.execPath, [path.resolve("node_modules/shx/lib/cli.js"), ...command.split(" ").slice(1)], {cwd: installation, timeout: 5000});
    }
    for (const relative of assets) {
        expect(fs.readFileSync(path.join(installation, "dist/src", relative))).toEqual(fs.readFileSync(path.resolve("src", relative)));
    }
    fs.mkdirSync(game);
    fs.writeFileSync(path.join(game, "package.json"), JSON.stringify({name: "external-game", pokie: {entry: "index.cjs"}}));
    const entry = path.join(game, "index.cjs");
    const code = "module.exports = {getManifest: () => ({id: 'original'}), createSession: () => ({root: __dirname})};";
    fs.writeFileSync(entry, code);
    const probe = path.join(installation, "probe.mjs");
    fs.writeFileSync(probe, `import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {resolvePokieGameDependencyRoots, resolvePokieGameEntryModule} from './dist/src/gamepackage/resolvePokieGameEntryModule.js';
import {getDefaultWorkerEntryUrl} from './dist/src/simulation/parallel/internal/defaultWorkerEntryUrl.js';
const [installation, game] = process.argv.slice(2);
const entry = path.join(game, 'index.cjs'), original = fs.readFileSync(entry);
assert.equal((await resolvePokieGameDependencyRoots(game))['@fromstan/pokie'], installation);
assert.equal((await getDefaultWorkerEntryUrl()).href, pathToFileURL(path.join(installation, 'dist/src/simulation/parallel/internal/simulationWorkerEntry.js')).href);
const first = await resolvePokieGameEntryModule(game);
const root = first.candidate.createSession().root;
assert.equal(first.candidate.getManifest().id, 'original');
assert.ok(fs.existsSync(root));
try {
    fs.writeFileSync(entry, "throw new Error('executed rejection');");
    await assert.rejects(resolvePokieGameEntryModule(game), /executed rejection/);
    assert.equal(first.candidate.getManifest().id, 'original');
    fs.writeFileSync(entry, original);
    for (let retry = 0; retry < 2; retry++) {
        const next = await resolvePokieGameEntryModule(game);
        const nextRoot = next.candidate.createSession().root;
        assert.equal(next.candidate.getManifest().id, 'original');
        assert.notEqual(nextRoot, root);
        await next.release();
        assert.equal(fs.existsSync(nextRoot), false);
    }
} finally { await first.release(); await first.release(); }
assert.equal(fs.existsSync(root), false);
assert.deepEqual(fs.readFileSync(entry), original);
assert.equal(fs.existsSync(path.join(game, 'node_modules')), false);
console.log('CLI native assets: resolution, rejection, two recoveries and lease cleanup passed.');
`);
    expect(execFileSync(process.execPath, [probe, installation, game], {encoding: "utf8", timeout: 15000})).toContain("CLI native assets: resolution, rejection, two recoveries and lease cleanup passed.");
});

it("publishes a same-type candidate only with explicit output intent and returns structured evidence", async () => {
    const output = path.join(directory, "candidate.blueprint.json");
    const before = fs.readFileSync(source);
    expect(await new OptimizeCommand().run([source, "--policy", policy, "--out", output, "--format", "json"])).toBe(0);
    expect(result()).toMatchObject({status: "success", evidence: {measured: [0.75]}});
    expect(JSON.parse(fs.readFileSync(output, "utf8")).paytable.A[2]).toBe(3);
    expect(result()).toMatchObject({output: {path: output, type: "blueprint", revision: projectRevision({type: "blueprint", rootPath: output})}});
    expect(fs.readFileSync(source)).toEqual(before);
    expect(await new OptimizeCommand().run([source, "--policy", policy, "--out", output])).toBe(1);
    expect(fs.readFileSync(source)).toEqual(before);
});
it("returns distinct infeasible and exhausted exit codes and never saves either", async () => {
    const request = optimizationRequest();
    request.targets[0].value = 0.9;
    fs.writeFileSync(policy, JSON.stringify(request));
    const command = new OptimizeCommand();
    expect(await command.run([source, "--policy", policy])).toBe(2);
    expect(result().status).toBe("infeasible");
    request.policy.budget = 1;
    fs.writeFileSync(policy, JSON.stringify(request));
    expect(await command.run([source, "--policy", policy])).toBe(5);
    expect(result().status).toBe("exhausted");
});
it.each([0, -1, 0.25, "3", null, undefined, 1e20, "NaN", "Infinity", true])(
    "rejects invalid budget %p with field diagnostics and preserves input",
    async (budget) => {
        const request = optimizationRequest();
        (request.policy as unknown as {budget: unknown}).budget = budget;
        fs.writeFileSync(policy, JSON.stringify(request));
        const before = fs.readFileSync(source);
        expect(await new OptimizeCommand().run([source, "--policy", policy])).toBe(3);
        expect(result().status).toBe("invalid");
        expect(fs.readFileSync(source)).toEqual(before);
    },
);
it("returns unsupported for a valid policy with opaque package and supports help/parse errors", async () => {
    const root = path.join(directory, "opaque");
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({name: "opaque", pokie: {entry: "index.cjs"}}));
    fs.writeFileSync(path.join(root, "index.cjs"), `require("fs").writeFileSync(${JSON.stringify(path.join(directory, "executed"))}, "executed"); module.exports = {};`);
    const command = new OptimizeCommand();
    expect(await command.run([root, "--policy", policy])).toBe(4);
    expect(result().status).toBe("unsupported");
    expect(fs.existsSync(path.join(directory, "executed"))).toBe(false);
    const opaqueWasm = path.join(directory, "opaque.wasm");
    fs.writeFileSync(opaqueWasm, Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]));
    expect(await command.run([opaqueWasm, "--policy", policy])).toBe(4);
    expect(await command.run(["--help"])).toBe(0);
    expect(await command.run([source, "--policy", policy, "--invalid"])).toBe(3);
});

it("handles Ctrl-C with a distinct cancelled exit, drains candidate work and removes its signal handler", async () => {
    const before = fs.readFileSync(source);
    const listeners = process.listenerCount("SIGINT");
    const progress = jest.spyOn(console, "error").mockImplementationOnce(() => {
        process.emit("SIGINT");
    });
    expect(await new OptimizeCommand().run([source, "--policy", policy, "--progress"])).toBe(6);
    progress.mockRestore();
    expect(result().status).toBe("cancelled");
    expect(process.listenerCount("SIGINT")).toBe(listeners);
    expect(fs.readFileSync(source)).toEqual(before);
});

it("exposes sampled attainment, inconclusive and exhausted candidates with unchanged publication verdicts", async () => {
    const request = stochasticOptimizationRequest();
    fs.writeFileSync(policy, JSON.stringify(request));
    expect(await new OptimizeCommand().run([source, "--policy", policy])).toBe(0);
    expect(result().status).toBe("attained");
    request.targets[0].tolerance = {kind: "absolute", value: 0};
    fs.writeFileSync(policy, JSON.stringify(request));
    const output = path.join(directory, "inconclusive.json");
    expect(await new OptimizeCommand().run([source, "--policy", policy, "--out", output])).toBe(7);
    expect(result().status).toBe("inconclusive");
    expect(JSON.parse(fs.readFileSync(`${output}.optimization.json`, "utf8")).status).toBe("inconclusive");
    request.policy.budget = 1;
    fs.writeFileSync(policy, JSON.stringify(request));
    expect(await new OptimizeCommand().run([source, "--policy", policy])).toBe(5);
    expect(result().status).toBe("exhausted");
});

it.each(["search", "assessment"])("cancels from phase-aware stochastic %s progress inside evaluation", async phase => {
    fs.writeFileSync(policy, JSON.stringify(stochasticOptimizationRequest()));
    const listeners = process.listenerCount("SIGINT");
    const progress = jest.spyOn(console, "error").mockImplementation((line: string) => {
        const message = JSON.parse(line);
        if (message.evidence.phase === phase && message.evidence.stochastic[phase === "search" ? "searchSamples" : "assessmentSamples"] > 0) process.emit("SIGINT");
    });
    expect(await new OptimizeCommand().run([source, "--policy", policy, "--progress"])).toBe(6);
    expect(result().status).toBe("cancelled");
    expect(process.listenerCount("SIGINT")).toBe(listeners);
    progress.mockRestore();
});

it("requires an unchanged reviewed source, candidate and policy for explicit authored apply", async () => {
    const command = new OptimizeCommand();
    expect(await command.run([source, "--policy", policy])).toBe(0);
    const review = path.join(directory, "review.json");
    fs.writeFileSync(review, JSON.stringify(JSON.parse(stdout.mock.calls[stdout.mock.calls.length - 1][0])));
    const before = fs.readFileSync(source);
    const changed = optimizationRequest();
    changed.policy.locks.push("/manifest");
    fs.writeFileSync(policy, JSON.stringify(changed));
    expect(await command.run([source, "--policy", policy, "--apply", review])).toBe(1);
    expect(fs.readFileSync(source)).toEqual(before);
    fs.writeFileSync(policy, JSON.stringify(optimizationRequest()));
    expect(await command.run([source, "--policy", policy, "--apply", review])).toBe(0);
    expect(JSON.parse(fs.readFileSync(source, "utf8")).paytable.A[2]).toBe(3);
    expect(await command.run([source, "--policy", policy, "--apply", review])).toBe(1);
    expect(await command.run([source, "--policy", policy, "--apply", review, "--out", path.join(directory, "out")])).toBe(3);
});


it("rejects a reviewed CLI apply after executable dependency drift with identical source/candidate parameters", async () => {
    const root = path.join(directory, "custom");
    const dependency = path.join(root, "node_modules", "binding");
    fs.mkdirSync(dependency, {recursive: true});
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({name: "custom", version: "1", pokie: {entry: "index.cjs"}, dependencies: {binding: "1"}}));
    fs.writeFileSync(path.join(root, "index.cjs"), declaredOptimizationGameCode);
    fs.writeFileSync(path.join(root, "parameters.json"), JSON.stringify(optimizationBlueprint()));
    fs.writeFileSync(path.join(dependency, "package.json"), JSON.stringify({name: "binding", main: "index.cjs"}));
    const executable = path.join(dependency, "index.cjs");
    fs.writeFileSync(executable, "module.exports = 1;");
    declarePackageTuning(root, "parameters.json", ["/paytable/A/2"]);
    const command = new OptimizeCommand();
    expect(await command.run([root, "--policy", policy])).toBe(0);
    const reviewed = JSON.parse(stdout.mock.calls[stdout.mock.calls.length - 1][0]);
    const reviewFile = path.join(directory, "custom-review.json");
    fs.writeFileSync(reviewFile, JSON.stringify(reviewed));
    const sourceRevision = projectRevision({type: "tsPackage", rootPath: root});
    fs.appendFileSync(executable, "\n// changed installed executable bytes");
    expect(await command.run([root, "--policy", policy, "--apply", reviewFile])).toBe(1);
    expect(projectRevision({type: "tsPackage", rootPath: root})).toBe(sourceRevision);
    expect(result().status).toBe("failure");
    expect(reviewed.review.executableRevision).toMatch(/^sha256:/);
}, 60000);


it("V35 optimizer progress preserves CLI stdout, executed cancellation, cleanup and subsequent reuse", async () => {
    const service = new ProjectOptimizationService(path.join(directory, "scratch"));
    const command = new OptimizeCommand(service);
    const before = fs.readFileSync(source);
    const listeners = process.listenerCount("SIGINT");
    const observations: OptimizationEvidence[] = [];
    let cancel = true;
    const stderr = jest.spyOn(console, "error").mockImplementation(value => {
        const event = JSON.parse(String(value)) as {type: string; evidence: OptimizationEvidence};
        expect(event.type).toBe("progress");
        observations.push(event.evidence);
        if (cancel && event.evidence.work?.stage === "Materializing outcomes" && event.evidence.work.current === "1") {
            cancel = false;
            process.emit("SIGINT");
        }
    });
    try {
        expect(await command.run([source, "--policy", policy, "--progress"])).toBe(6);
        expect(result().status).toBe("cancelled");
        expect(observations.some(evidence => evidence.evaluated === 0 && evidence.work?.current === "1")).toBe(true);
        expect(fs.readdirSync(path.join(directory, "scratch"))).toEqual([]);
        expect(process.listenerCount("SIGINT")).toBe(listeners);
        for (let i = 0; i < 2; i++) {
            expect(await command.run([source, "--policy", policy, "--progress"])).toBe(0);
            expect(result()).toMatchObject({status: "success", evidence: {evaluated: 2, measured: [0.75]}});
            expect(fs.readdirSync(path.join(directory, "scratch"))).toEqual([]);
        }
        expect(stdout).toHaveBeenCalledTimes(3);
        expect(stdout.mock.calls.every(call => JSON.parse(String(call[0])).type !== "progress")).toBe(true);
        const count = observations.length;
        expect(await command.run([source, "--policy", policy])).toBe(0);
        expect(observations).toHaveLength(count);
        expect(fs.readFileSync(source)).toEqual(before);
        expect(process.listenerCount("SIGINT")).toBe(listeners);
    } finally {
        stderr.mockRestore();
    }
});
