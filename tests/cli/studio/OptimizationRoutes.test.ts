import {StudioServer} from "../../../cli/studio/StudioServer.js";
import {StudioHomeService} from "../../../cli/studio/home/StudioHomeService.js";
import {StudioBlueprintService} from "../../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioProjectRegistrationService} from "../../../cli/studio/StudioProjectRegistrationService.js";
import {passthroughRuntimePackageResolver} from "../../../cli/materialize/materializeRuntimePackage.js";
import {createTunableBlueprintGame} from "../../../src/optimization/createTunableBlueprintGame.js";
import * as recipes from "../../../src/optimization/internal/createOptimizationSimulationGame.js";
import {declarePackageTuning} from "../../../src/optimization/DeclaredTuningContract.js";
import fs from "fs";
import path from "path";
import {StudioOptimizationService} from "../../../cli/studio/optimization/StudioOptimizationService.js";
import {StudioJobService} from "../../../cli/studio/jobs/StudioJobService.js";
import {FileStudioJobRepository} from "../../../cli/studio/jobs/FileStudioJobRepository.js";
import {ProjectOptimizationService} from "../../../src/optimization/ProjectOptimizationService.js";
import {optimizationBlueprint, optimizationRequest, stochasticOptimizationRequest} from "../../v2/fixtures/OptimizationFixture.js";
import type {StudioJobView} from "../../../cli/studio/jobs/StudioJobView.js";
let directory: string;
let source: string;
let jobs: StudioJobService;
let routes: StudioOptimizationService;
let current: boolean;
const context = () => ({projectRoot: source, projectId: source, isCurrent: () => current});
beforeEach(() => {
    directory = fs.mkdtempSync(path.resolve("node_modules/.cache/optimization-routes-"));
    source = path.join(directory, "source.blueprint.json");
    fs.writeFileSync(source, JSON.stringify(optimizationBlueprint()));
    jobs = new StudioJobService(new FileStudioJobRepository(path.join(directory, "jobs")));
    routes = new StudioOptimizationService(jobs, new ProjectOptimizationService(path.join(directory, "scratch")));
    current = true;
});
afterEach(async () => {
    await routes.drain();
    fs.rmSync(directory, {recursive: true, force: true});
});
async function preview(request = optimizationRequest()) {
    const response = await routes.handle("POST", "support", {request, expectedProjectRoot: source}, context());
    expect(response.status).toBe(200);
    return response.body as {sourceRevision: string; supported: boolean};
}

it("persists and reloads the full sampled verdict without granting lost process-local save receipts", async () => {
    const request = stochasticOptimizationRequest();
    request.targets[0].tolerance = {kind: "absolute", value: 0};
    const support = await preview(request);
    const started = await routes.handle("POST", "start", {request, expectedProjectRoot: source, sourceRevision: support.sourceRevision}, context());
    const {job} = started.body as {job: StudioJobView};
    await routes.drain();
    const completed = jobs.get(source, job.id)!;
    expect(completed).toMatchObject({status: "completed", result: {detail: {status: "inconclusive", evidence: {stochastic: {assessmentSamples: 6000}}}}});
    const reloaded = new FileStudioJobRepository(path.join(directory, "jobs"));
    expect(reloaded.get(job.id)!.result).toEqual(completed.result);
    const fresh = new StudioOptimizationService(new StudioJobService(reloaded), new ProjectOptimizationService(path.join(directory, "fresh")));
    const save = {request, expectedProjectRoot: source, jobId: job.id, destination: path.join(directory, "lost.json")};
    expect((await fresh.handle("POST", "save", save, context())).status).toBe(409);
    const output = path.join(directory, "candidate.json");
    expect((await routes.handle("POST", "save", {...save, destination: output}, context())).status).toBe(200);
    expect(JSON.parse(fs.readFileSync(`${output}.optimization.json`, "utf8")).status).toBe("inconclusive");
    await fresh.shutdown();
});
it("runs through durable jobs, preserves terminal evidence on reload and saves only explicit reviewed output", async () => {
    const request = optimizationRequest();
    const support = await preview(request);
    expect(support.supported).toBe(true);
    const start = await routes.handle("POST", "start", {request, expectedProjectRoot: source, sourceRevision: support.sourceRevision}, context());
    expect(start.status).toBe(202);
    const {job} = start.body as {job: StudioJobView};
    await routes.drain();
    expect(jobs.get(source, job.id)).toMatchObject({
        status: "completed",
        result: {detail: {status: "success", evidence: {measured: [0.75]}}},
    });
    const reloaded = new FileStudioJobRepository(path.join(directory, "jobs"));
    expect(reloaded.get(job.id)?.result).toEqual(jobs.get(source, job.id)?.result);
    const output = path.join(directory, "saved.blueprint.json");
    expect((await routes.handle("POST", "save", {request, expectedProjectRoot: source, jobId: job.id, destination: output}, context())).status).toBe(200);
    expect((await routes.handle("POST", "save", {request, expectedProjectRoot: source, jobId: job.id, destination: output}, context())).status).toBe(409);
});
it("rejects stale source and conflicting requests while cancellation drains a real executor", async () => {
    const request = optimizationRequest();
    const support = await preview();
    const first = await routes.handle("POST", "start", {request, expectedProjectRoot: source, sourceRevision: support.sourceRevision}, context());
    const {job} = first.body as {job: StudioJobView};
    const repeat = await routes.handle("POST", "start", {request, expectedProjectRoot: source, sourceRevision: support.sourceRevision}, context());
    expect((repeat.body as {job: StudioJobView}).job.id).toBe(job.id);
    const changed = optimizationRequest();
    changed.targets[0].value = 0.9;
    expect(
        (await routes.handle("POST", "start", {request: changed, expectedProjectRoot: source, sourceRevision: support.sourceRevision}, context()))
            .status,
    ).toBe(409);
    jobs.cancel(source, job.id);
    await routes.drain();
    expect(jobs.get(source, job.id)?.status).toBe("cancelled");
    fs.appendFileSync(source, " ");
    expect(
        (await routes.handle("POST", "start", {request, expectedProjectRoot: source, sourceRevision: support.sourceRevision}, context())).status,
    ).toBe(409);
});
it.each([0, -1, 0.5, "2", null, undefined, 1e20, "NaN", "Infinity", true])(
    "validates budget %p before starting jobs, retains submitted input, then accepts correction",
    async (budget) => {
        const request = optimizationRequest();
        (request.policy as unknown as {budget: unknown}).budget = budget;
        const before = fs.readFileSync(source);
        const result = await routes.handle("POST", "start", {request, expectedProjectRoot: source, sourceRevision: "invalid"}, context());
        expect(result.status).toBe(400);
        expect(result.body).toHaveProperty("submitted.request", request);
        expect(jobs.list()).toEqual([]);
        expect(fs.readFileSync(source)).toEqual(before);
        expect((await preview()).supported).toBe(true);
    },
);
it("discards stale Project results and retains the operational verdict", async () => {
    const request = optimizationRequest();
    const support = await preview();
    const start = await routes.handle("POST", "start", {request, expectedProjectRoot: source, sourceRevision: support.sourceRevision}, context());
    current = false;
    await routes.drain();
    const {job} = start.body as {job: StudioJobView};
    expect(jobs.get(source, job.id)?.result?.detail?.status).toBe("failure");
    expect(
        (
            await routes.handle(
                "POST",
                "save",
                {request, expectedProjectRoot: source, jobId: job.id, destination: path.join(directory, "stale.json")},
                context(),
            )
        ).status,
    ).toBe(409);
});

it("drains support/execution ownership on shutdown and rejects further work", async () => {
    const request = optimizationRequest();
    const support = await preview(request);
    const started = await routes.handle("POST", "start", {request, expectedProjectRoot: source, sourceRevision: support.sourceRevision}, context());
    expect(started.status).toBe(202);
    await routes.shutdown();
    expect(fs.readdirSync(path.join(directory, "scratch"))).toEqual([]);
    expect((await routes.handle("POST", "support", {request, expectedProjectRoot: source}, context())).status).toBe(409);
});

it("rejects old-tab support, start and save requests for two Projects with identical source revisions", async () => {
    const request = optimizationRequest();
    const support = await preview();
    const start = await routes.handle("POST", "start", {request, expectedProjectRoot: source, sourceRevision: support.sourceRevision}, context());
    await routes.drain();
    const {job} = start.body as {job: StudioJobView};
    const secondDirectory = path.join(directory, "second");
    fs.mkdirSync(secondDirectory);
    const second = path.join(secondDirectory, path.basename(source));
    fs.copyFileSync(source, second);
    const secondContext = {projectRoot: second, projectId: second, isCurrent: () => true};
    for (const action of ["support", "start", "save"] as const) {
        const response = await routes.handle("POST", action, {request, expectedProjectRoot: source, sourceRevision: support.sourceRevision, jobId: job.id, destination: path.join(directory, "stale-output.json")}, secondContext);
        expect(response).toMatchObject({status: 409, body: {error: expect.stringContaining("intended Project")}});
    }
    expect(jobs.list()).toHaveLength(1);
    expect(fs.existsSync(path.join(directory, "stale-output.json"))).toBe(false);
    const secondSupport = await routes.handle("POST", "support", {request, expectedProjectRoot: second}, secondContext);
    expect(secondSupport).toMatchObject({status: 200, body: {sourceRevision: support.sourceRevision}});
});

it.each(["opaque", "tampered"])("rejects %s package authority without executing modules through support or start", async (kind) => {
    const root = path.join(directory, kind);
    const marker = path.join(directory, "executed");
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({name: kind, pokie: {entry: "index.cjs"}}));
    fs.writeFileSync(path.join(root, "parameters.json"), JSON.stringify(optimizationBlueprint()));
    const code = `require('fs').writeFileSync(${JSON.stringify(marker)}, 'executed'); module.exports = {};`;
    fs.writeFileSync(path.join(root, "index.cjs"), code);
    if (kind === "tampered") {
        declarePackageTuning(root, "parameters.json", ["/paytable/A/2"]);
        fs.appendFileSync(path.join(root, "index.cjs"), "\n// changed after declaration");
    }
    const packageContext = {projectRoot: root, projectId: root, isCurrent: () => true};
    const request = optimizationRequest();
    const preview = await routes.handle("POST", "support", {request, expectedProjectRoot: root}, packageContext);
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({supported: false});
    const start = await routes.handle("POST", "start", {request, expectedProjectRoot: root, sourceRevision: (preview.body as {sourceRevision: string}).sourceRevision}, packageContext);
    expect(start.status).toBe(202);
    await routes.drain();
    const {job} = start.body as {job: StudioJobView};
    expect(jobs.get(root, job.id)?.result?.detail?.status).toBe("unsupported");
    expect(fs.existsSync(marker)).toBe(false);
});


it("keeps cancelling until game release settles, then persists cleanup recovery and accepted partial counts", async () => {
    let entered!: () => void;
    let rejectRelease!: (error: Error) => void;
    const releasing = new Promise<void>(resolve => {
        entered = resolve;
    });
    const gate = new Promise<void>((_resolve, reject) => {
        rejectRelease = reject;
    });
    const create = recipes.createOptimizationSimulationGame;
    const hook = jest.fn(async () => {
        entered();
        await gate;
    });
    const factory = jest.spyOn(recipes, "createOptimizationSimulationGame").mockImplementation(recipe => {
        const game = create(recipe);
        const release = game.release!;
        game.release = async () => {
            await release();
            await hook();
        };
        return game;
    });
    const before = fs.readFileSync(source);
    try {
        const request = stochasticOptimizationRequest();
        const support = await preview(request);
        const started = await routes.handle("POST", "start", {request, expectedProjectRoot: source, sourceRevision: support.sourceRevision}, context());
        const {job} = started.body as {job: StudioJobView};
        await releasing;
        jobs.cancel(source, job.id);
        expect(jobs.get(source, job.id)?.status).toBe("cancelling");
        rejectRelease(new Error("release refused during cancellation"));
        await routes.drain();
        const terminal = jobs.get(source, job.id)!;
        expect(terminal).toMatchObject({status: "recovery-required", result: {detail: {status: "failure", diagnostics: [{path: "cleanup"}], evidence: {stochastic: {searchSamples: 400}}}}});
        expect(new FileStudioJobRepository(path.join(directory, "jobs")).get(job.id)!.result).toEqual(terminal.result);
        expect(hook).toHaveBeenCalledTimes(1);
        expect(fs.readFileSync(source)).toEqual(before);
        expect(fs.readdirSync(path.join(directory, "scratch"))).toEqual([]);
    } finally {
        rejectRelease(new Error("test teardown"));
        await routes.drain();
        factory.mockRestore();
    }
});

it("binds direct HTTP-style save and authored apply to the current reviewed policy, then consumes apply", async () => {
    const request = optimizationRequest();
    const support = await preview(request);
    const started = await routes.handle("POST", "start", {request, expectedProjectRoot: source, sourceRevision: support.sourceRevision}, context());
    await routes.drain();
    const {job} = started.body as {job: StudioJobView};
    const changed = structuredClone(request);
    changed.policy.locks.push("/manifest");
    const before = fs.readFileSync(source);
    for (const action of ["save", "apply"] as const) {
        const response = await routes.handle("POST", action, {request: changed, expectedProjectRoot: source, jobId: job.id, destination: path.join(directory, "rejected.json")}, context());
        expect(response.status).toBe(409);
        expect(fs.readFileSync(source)).toEqual(before);
        expect(fs.existsSync(path.join(directory, "rejected.json"))).toBe(false);
    }
    const body = {request, expectedProjectRoot: source, jobId: job.id};
    expect((await routes.handle("POST", "apply", body, context())).status).toBe(200);
    expect(JSON.parse(fs.readFileSync(source, "utf8")).paytable.A[2]).toBe(3);
    expect(jobs.get(source, job.id)?.result?.provenance).toMatchObject({authoredApply: {path: source}});
    expect((await routes.handle("POST", "apply", body, context())).status).toBe(409);
    await routes.shutdown();
});

it("routes actual HTTP apply through retained authority, refreshes the runtime, and rejects repeated apply", async () => {
    const repository = new FileStudioJobRepository(path.join(directory, "http-jobs"));
    const httpJobs = new StudioJobService(repository);
    let terminal!: () => void;
    const completed = new Promise<void>(resolve => {
        terminal = resolve;
    });
    const save = repository.save.bind(repository);
    const persisted = jest.spyOn(repository, "save").mockImplementation(job => {
        save(job);
        if (job.operation === "optimization" && job.status === "completed") terminal();
    });
    const loadedValues: number[] = [];
    const loadGame = (file: string) => {
        const model = JSON.parse(fs.readFileSync(file, "utf8"));
        loadedValues.push(model.paytable.A[2]);
        return Promise.resolve(createTunableBlueprintGame(model));
    };
    const home = new StudioHomeService("1.3.0", undefined, loadGame);
    const server = new StudioServer({pokieVersion: "1.3.0", port: 0, studioRoot: directory, initialContext: {mode: "project", projectRoot: source},
        jobService: httpJobs, homeService: home, blueprintService: new StudioBlueprintService("1.3.0", directory, home),
        projectRegistrationService: new StudioProjectRegistrationService(), loadGame, resolveRuntimePackageRoot: passthroughRuntimePackageResolver});
    try {
        const address = await server.start();
        const base = `http://${address.host}:${address.port}`;
        const post = (action: string, body: unknown) => fetch(`${base}/api/project/optimization/${action}`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
        const request = optimizationRequest();
        const supportResponse = await post("support", {expectedProjectRoot: source, request});
        expect(supportResponse.status).toBe(200);
        const support = await supportResponse.json() as {sourceRevision: string};
        const started = await post("start", {expectedProjectRoot: source, request, sourceRevision: support.sourceRevision});
        expect(started.status).toBe(202);
        const {job} = await started.json() as {job: StudioJobView};
        await completed;
        const changed = structuredClone(request);
        changed.policy.locks.push("/manifest");
        const before = fs.readFileSync(source);
        expect((await post("apply", {expectedProjectRoot: source, request: changed, jobId: job.id})).status).toBe(409);
        expect(fs.readFileSync(source)).toEqual(before);
        const body = {expectedProjectRoot: source, request, jobId: job.id};
        expect((await post("apply", body)).status).toBe(200);
        const contextResponse = await fetch(`${base}/api/project/context`);
        expect(await contextResponse.json()).toMatchObject({status: "loaded", projectRoot: source, type: "blueprint"});
        expect(loadedValues).toEqual(expect.arrayContaining([2, 3]));
        expect(loadedValues[loadedValues.length - 1]).toBe(3);
        expect(JSON.parse(fs.readFileSync(source, "utf8")).paytable.A[2]).toBe(3);
        expect((await post("apply", body)).status).toBe(409);
    } finally {
        await server.stop();
        persisted.mockRestore();
    }
});
