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
    const response = await routes.handle("POST", "support", {request}, context());
    expect(response.status).toBe(200);
    return response.body as {sourceRevision: string; supported: boolean};
}
it("runs through durable jobs, preserves terminal evidence on reload and saves only explicit reviewed output", async () => {
    const request = optimizationRequest();
    const support = await preview(request);
    expect(support.supported).toBe(true);
    const start = await routes.handle("POST", "start", {request, sourceRevision: support.sourceRevision}, context());
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
    expect((await routes.handle("POST", "save", {jobId: job.id, destination: output}, context())).status).toBe(200);
    expect((await routes.handle("POST", "save", {jobId: job.id, destination: output}, context())).status).toBe(409);
});
it("rejects stale source and conflicting requests while cancellation drains a real executor", async () => {
    const request = optimizationRequest();
    const support = await preview();
    const first = await routes.handle("POST", "start", {request, sourceRevision: support.sourceRevision}, context());
    const {job} = first.body as {job: StudioJobView};
    const repeat = await routes.handle("POST", "start", {request, sourceRevision: support.sourceRevision}, context());
    expect((repeat.body as {job: StudioJobView}).job.id).toBe(job.id);
    const changed = optimizationRequest();
    changed.targets[0].value = 0.9;
    expect(
        (await routes.handle("POST", "start", {request: changed, sourceRevision: support.sourceRevision}, context()))
            .status,
    ).toBe(409);
    jobs.cancel(source, job.id);
    await routes.drain();
    expect(jobs.get(source, job.id)?.status).toBe("cancelled");
    fs.appendFileSync(source, " ");
    expect(
        (await routes.handle("POST", "start", {request, sourceRevision: support.sourceRevision}, context())).status,
    ).toBe(409);
});
it.each([0, -1, 0.5, "2", null, undefined, 1e20, "NaN", "Infinity", true])(
    "validates budget %p before starting jobs, retains submitted input, then accepts correction",
    async (budget) => {
        const request = optimizationRequest();
        (request.policy as unknown as {budget: unknown}).budget = budget;
        const before = fs.readFileSync(source);
        const result = await routes.handle("POST", "start", {request, sourceRevision: "invalid"}, context());
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
    const start = await routes.handle("POST", "start", {request, sourceRevision: support.sourceRevision}, context());
    current = false;
    await routes.drain();
    const {job} = start.body as {job: StudioJobView};
    expect(jobs.get(source, job.id)?.result?.detail?.status).toBe("failure");
    expect(
        (
            await routes.handle(
                "POST",
                "save",
                {jobId: job.id, destination: path.join(directory, "stale.json")},
                context(),
            )
        ).status,
    ).toBe(409);
});
