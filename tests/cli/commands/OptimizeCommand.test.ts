import {declarePackageTuning} from "../../../src/optimization/DeclaredTuningContract.js";
import {projectRevision} from "../../../src/optimization/internal/optimizationData.js";
import fs from "fs";
import path from "path";
import {execFileSync} from "child_process";
import ts from "typescript";
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
