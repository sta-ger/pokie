import fs from "fs";
import os from "os";
import path from "path";
import {digest} from "../../../src/optimization/internal/optimizationData.js";
import type {OptimizationCandidate, OptimizationResult} from "../../../src/optimization/OptimizationPolicy.js";
import type {ProjectOptimizationService} from "../../../src/optimization/ProjectOptimizationService.js";
import {optimizationBlueprint, optimizationRequest} from "../../contracts/fixtures/OptimizationFixture.js";
import {StudioJobService} from "../../../cli/studio/jobs/StudioJobService.js";
import {FileStudioJobRepository} from "../../../cli/studio/jobs/FileStudioJobRepository.js";
import {StudioOptimizationService} from "../../../cli/studio/optimization/StudioOptimizationService.js";

describe("StudioOptimizationService undo", () => {
    let directory: string;

    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-optimization-undo-"));
    });

    afterEach(() => {
        fs.rmSync(directory, {recursive: true, force: true});
    });

    it("restores the exact pre-apply bytes once, and refuses a second undo", async () => {
        const source = path.join(directory, "blueprint.json");
        const before = Buffer.from(`${JSON.stringify(optimizationBlueprint(), null, 2)}\n`);
        fs.writeFileSync(source, before);
        const after = Buffer.from(`${JSON.stringify({...optimizationBlueprint(), paytable: {A: {2: 3}, B: {2: 0}}}, null, 2)}\n`);
        let commits = 0;

        const candidate = {
            path: source,
            type: "blueprint",
            revision: "candidate-revision",
            sourcePath: source,
            sourceRevision: "source-revision",
            requestRevision: "request-revision",
            workspace: directory,
        } as OptimizationCandidate;
        const optimizer = {
            support: () => Promise.resolve({supported: true, reason: "test optimizer", adapter: "test:v1", writable: ["/paytable/A/2"]}),
            optimize: (): Promise<OptimizationResult> => Promise.resolve({status: "success", diagnostics: [], candidate}),
            applyWithUndo: (_candidate: OptimizationCandidate, _request: unknown, options?: {onAuthoredCommit?: () => void}) => {
                fs.writeFileSync(source, after);
                options?.onAuthoredCommit?.();
                return Promise.resolve({
                    outputPath: source,
                    undoFiles: [{file: source, before, afterHash: digest(after)}],
                });
            },
            publish: () => Promise.reject(new Error("not used")),
            discard: () => Promise.resolve(),
        } as unknown as ProjectOptimizationService;

        const jobs = new StudioJobService(new FileStudioJobRepository(path.join(directory, "jobs")));
        const service = new StudioOptimizationService(jobs, optimizer);
        const request = optimizationRequest();
        const context = {
            projectRoot: source,
            projectId: source,
            isCurrent: () => true,
            onAuthoredCommit: () => {
                commits++;
                return Promise.resolve();
            },
        };

        const support = await service.handle("POST", "support", {expectedProjectRoot: source, request}, context);
        expect(support.status).toBe(200);
        const sourceRevision = (support.body as {sourceRevision: string}).sourceRevision;

        const started = await service.handle("POST", "start", {expectedProjectRoot: source, request, sourceRevision}, context);
        expect(started.status).toBe(202);
        const jobId = (started.body as {job: {id: string}}).job.id;
        await service.drain();
        expect(jobs.get(source, jobId)?.status).toBe("completed");

        const applied = await service.handle("POST", "apply", {expectedProjectRoot: source, jobId, request}, context);
        expect(applied.status).toBe(200);
        const undoId = (applied.body as {undoId?: string}).undoId;
        expect(undoId).toBeDefined();
        expect(fs.readFileSync(source)).toEqual(after);
        expect(commits).toBe(1);

        const undone = await service.handle("POST", "undo", {expectedProjectRoot: source, undoId}, context);
        expect(undone.status).toBe(200);
        expect(undone.body).toMatchObject({restored: true});
        expect(fs.readFileSync(source)).toEqual(before);
        expect(commits).toBe(2);
        expect(jobs.get(source, jobId)?.result?.provenance?.authoredApply).toBeUndefined();
        expect(jobs.get(source, jobId)?.result?.provenance?.authoredUndo).toBeDefined();

        const second = await service.handle("POST", "undo", {expectedProjectRoot: source, undoId}, context);
        expect(second.status).toBe(409);
        expect(fs.readFileSync(source)).toEqual(before);
    });
});
