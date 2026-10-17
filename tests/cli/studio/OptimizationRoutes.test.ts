import {declarePackageTuning} from "../../../src/optimization/DeclaredTuningContract.js";
import fs from "fs";
import path from "path";
import {StudioOptimizationService} from "../../../cli/studio/optimization/StudioOptimizationService.js";
import {StudioJobService} from "../../../cli/studio/jobs/StudioJobService.js";
import {FileStudioJobRepository} from "../../../cli/studio/jobs/FileStudioJobRepository.js";
import {ProjectOptimizationService} from "../../../src/optimization/ProjectOptimizationService.js";
import {optimizationBlueprint, optimizationRequest} from "../../v2/fixtures/OptimizationFixture.js";
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
    expect((await routes.handle("POST", "save", {expectedProjectRoot: source, jobId: job.id, destination: output}, context())).status).toBe(200);
    expect((await routes.handle("POST", "save", {expectedProjectRoot: source, jobId: job.id, destination: output}, context())).status).toBe(409);
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
                {expectedProjectRoot: source, jobId: job.id, destination: path.join(directory, "stale.json")},
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
