import {projectRevision} from "../../../src/optimization/internal/optimizationData.js";
import fs from "fs";
import path from "path";
import {OptimizeCommand} from "../../../cli/commands/OptimizeCommand.js";
import {optimizationBlueprint, optimizationRequest, stochasticOptimizationRequest} from "../../v2/fixtures/OptimizationFixture.js";
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
