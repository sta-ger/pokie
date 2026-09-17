import fs from "fs";
import os from "os";
import path from "path";
import {FileStudioJobRepository} from "../../../../cli/studio/jobs/FileStudioJobRepository.js";
import {StudioJobService} from "../../../../cli/studio/jobs/StudioJobService.js";

describe("StudioJobService", () => {
    let directory: string;

    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-jobs-"));
    });
    afterEach(() => {
        fs.rmSync(directory, {recursive: true, force: true});
    });

    it("persists project-isolated terminal state and rejects an incompatible active conflict", () => {
        let now = 100;
        const service = new StudioJobService(new FileStudioJobRepository(directory), () => now, () => "job-1");
        const created = service.start({projectId: "/project-a", operation: "simulation", request: {rounds: 10}, conflictKey: "simulation:/project-a"});
        expect(created.status).toBe("created");
        expect(service.start({projectId: "/project-a", operation: "simulation", request: {rounds: 20}, conflictKey: "simulation:/project-a"})).toEqual(expect.objectContaining({status: "conflict", activeJobId: "job-1"}));
        service.markRunning("job-1");
        service.progress("job-1", {stage: "simulation", unit: "rounds", current: 4, total: 10});
        now = 125;
        service.complete("job-1", {summary: "done", provenance: {configuration: "hash"}});

        const restarted = new StudioJobService(new FileStudioJobRepository(directory), () => 125, () => "unused");
        expect(restarted.list("/project-a")).toEqual([expect.objectContaining({id: "job-1", status: "completed", durationMs: 25, progress: {stage: "simulation", unit: "rounds", current: 4, total: 10}})]);
        expect(restarted.get("/project-b", "job-1")).toBeUndefined();
    });

    it("lists retained jobs across projects when Home must protect an opening operation", () => {
        let nextId = 0;
        const service = new StudioJobService(new FileStudioJobRepository(directory), () => 100, () => `job-${++nextId}`);
        service.start({projectId: "/project-a", operation: "project-open-materialization", request: {sourcePath: "/project-a"}, conflictKey: "open:/project-a"});
        service.start({projectId: "/project-b", operation: "simulation", request: {rounds: 10}, conflictKey: "simulation:/project-b"});

        expect(service.list()).toEqual(expect.arrayContaining([
            expect.objectContaining({projectId: "/project-a", operation: "project-open-materialization"}),
            expect.objectContaining({projectId: "/project-b", operation: "simulation"}),
        ]));
    });

    it("locks a canonical publication resource across owners while exact requests reattach", () => {
        let nextId = 0;
        const service = new StudioJobService(new FileStudioJobRepository(directory), () => 100, () => `resource-${++nextId}`);
        const input = {projectId: "design:/source-a", operation: "design-build", request: {sourcePath: "/source-a", destinationPath: "/shared/out"}, conflictKey: "design-destination:/shared/out"};
        const first = service.start(input);
        expect(first.status).toBe("created");
        expect(service.start(input)).toEqual(expect.objectContaining({status: "reattached", job: expect.objectContaining({id: "resource-1"})}));
        expect(service.start({...input, projectId: "design:/source-b", request: {sourcePath: "/source-b", destinationPath: "/shared/out"}})).toEqual(expect.objectContaining({status: "conflict", activeJobId: "resource-1"}));
    });

    it("uses resource locks rather than project ownership for certification output and deployment delivery", () => {
        let nextId = 0;
        const service = new StudioJobService(new FileStudioJobRepository(directory), () => 100, () => `resource-${++nextId}`);
        const certification = service.start({projectId: "/project-a", operation: "certification-build", request: {sourceProjectId: "/project-a", outDir: "evidence"}, conflictKey: "certification-output:/shared/evidence"});
        expect(certification.status).toBe("created");
        expect(service.start({projectId: "/project-b", operation: "certification-build", request: {sourceProjectId: "/project-b", outDir: "evidence"}, conflictKey: "certification-output:/shared/evidence"})).toEqual(expect.objectContaining({status: "conflict", activeJobId: "resource-1"}));
        const deployment = service.start({projectId: "/project-a", operation: "deployment", request: {sourceProjectId: "/project-a", targetId: "shared-target"}, conflictKey: "deployment-delivery:shared-target"});
        expect(deployment.status).toBe("created");
        expect(service.start({projectId: "/project-b", operation: "deployment", request: {sourceProjectId: "/project-b", targetId: "shared-target"}, conflictKey: "deployment-delivery:shared-target"})).toEqual(expect.objectContaining({status: "conflict", activeJobId: "resource-2"}));
    });

    it("keeps cancellation truthful until an executor reports cleanup-safe cancellation", () => {
        const service = new StudioJobService(new FileStudioJobRepository(directory), () => 100, () => "job-2");
        service.start({projectId: "/project-a", operation: "artifact-build", request: {target: "tsPackage"}, conflictKey: "destination:/project-a/out"});
        service.markRunning("job-2");
        expect(service.cancel("/project-a", "job-2")).toEqual(expect.objectContaining({status: "cancelling"}));
        expect(service.cancel("/project-b", "job-2")).toBeUndefined();
        expect(service.cancelled("job-2", {summary: "staging output cleaned"})).toEqual(expect.objectContaining({status: "cancelled"}));
        expect(service.cancel("/project-a", "job-2")).toEqual(expect.objectContaining({status: "cancelled"}));
    });

    it("requests shutdown cancellation only for this process's active executors", () => {
        let nextId = 0;
        const service = new StudioJobService(new FileStudioJobRepository(directory), () => 100, () => `job-stop-${++nextId}`);
        const first = service.start({projectId: "/project-a", operation: "deployment", request: {}, conflictKey: "deployment:a"});
        const second = service.start({projectId: "/project-b", operation: "certification-build", request: {}, conflictKey: "certification:b"});
        if (first.status !== "created" || second.status !== "created") throw new Error("expected active jobs");
        service.complete(first.job.id, {summary: "already terminal"});

        expect(service.cancelAll()).toEqual([expect.objectContaining({id: second.job.id, status: "cancelling"})]);
        expect(service.get("/project-a", first.job.id)).toMatchObject({status: "completed"});
        expect(service.get("/project-b", second.job.id)).toMatchObject({status: "cancelling"});
    });

    it("owns queued, running, cancelling, and every executor terminal record", async () => {
        let nextId = 0;
        const service = new StudioJobService(new FileStudioJobRepository(directory), () => 100, () => `job-lifecycle-${++nextId}`);
        const input = {projectId: "/project-a", operation: "certification-build", request: {bundleDir: "bundle"}, conflictKey: "certification:/project-a"};

        const queued = service.start(input);
        if (queued.status !== "created") throw new Error("expected a queued Studio job");
        expect(queued.job).toMatchObject({status: "queued"});
        expect(service.markRunning(queued.job.id)).toMatchObject({status: "running"});
        expect(service.cancel("/project-a", queued.job.id)).toMatchObject({status: "cancelling"});
        expect(service.cancelled(queued.job.id, {summary: "executor cleanup completed"})).toMatchObject({status: "cancelled"});
        expect(service.signal(queued.job.id)).toBeUndefined();

        await expect(service.execute(
            {...input, conflictKey: "certification:/project-a/completed"},
            () => Promise.resolve("completed DTO"),
            (value) => ({status: "completed", result: {summary: value}}),
        )).resolves.toMatchObject({status: "executed", value: "completed DTO"});
        expect(service.get("/project-a", "job-lifecycle-2")).toMatchObject({status: "completed", result: {summary: "completed DTO"}});
        expect(service.signal("job-lifecycle-2")).toBeUndefined();

        await expect(service.execute(
            {...input, conflictKey: "certification:/project-a/failed"},
            () => Promise.reject(new Error("executor exploded")),
            () => ({status: "completed", result: {summary: "unreachable"}}),
        )).rejects.toThrow("executor exploded");
        expect(service.get("/project-a", "job-lifecycle-3")).toMatchObject({status: "failed", error: "executor exploded"});
        expect(service.signal("job-lifecycle-3")).toBeUndefined();
    });

    it("bridges exact reattachment before execution and persists cancellation only after cleanup", async () => {
        const service = new StudioJobService(new FileStudioJobRepository(directory), () => 100, () => "job-bridge");
        let release: (() => void) | undefined;
        let executorStarted: (() => void) | undefined;
        const started = new Promise<void>((resolve) => {
            executorStarted = resolve;
        });
        const input = {projectId: "/project-a", operation: "certification-build", request: {bundleDir: "bundle"}, conflictKey: "certification:/project-a/bundle"};
        const first = service.execute(
            input,
            () => new Promise<string>((resolve) => {
                executorStarted?.();
                release = () => resolve("cleaned up");
            }),
            (_value, cancelled) => cancelled
                ? {status: "cancelled" as const, result: {summary: "cleanup complete"}}
                : {status: "completed" as const, result: {summary: "done"}},
        );
        await started;

        const duplicateExecutor = jest.fn();
        await expect(service.execute(input, duplicateExecutor, () => ({status: "completed", result: {summary: "unreachable"}}))).resolves.toMatchObject({status: "reattached", job: {id: "job-bridge", status: "running"}});
        expect(duplicateExecutor).not.toHaveBeenCalled();

        expect(service.cancel("/project-a", "job-bridge")).toMatchObject({status: "cancelling"});
        release?.();
        await expect(first).resolves.toMatchObject({status: "executed", value: "cleaned up"});
        expect(service.get("/project-a", "job-bridge")).toMatchObject({status: "cancelled", result: {summary: "cleanup complete"}});
    });

    it("persists a failed terminal record when a bridged executor throws", async () => {
        const service = new StudioJobService(new FileStudioJobRepository(directory), () => 100, () => "job-error");
        await expect(service.execute(
            {projectId: "/project-a", operation: "certification-validate", request: {bundleDir: "bundle"}, conflictKey: "validation:/project-a/bundle"},
            () => Promise.reject(new Error("executor exploded")),
            () => ({status: "completed", result: {summary: "unreachable"}}),
            (error) => ({status: "failed", error: error instanceof Error ? error.message : String(error)}),
        )).rejects.toThrow("executor exploded");
        expect(service.get("/project-a", "job-error")).toMatchObject({status: "failed", error: "executor exploded"});
    });

    it("marks interrupted records recovery-required on restart without claiming they resumed", () => {
        const repository = new FileStudioJobRepository(directory);
        const first = new StudioJobService(repository, () => 100, () => "job-3");
        first.start({projectId: "/project-a", operation: "replay", request: {round: 1}, conflictKey: "replay:/project-a"});
        first.markRunning("job-3");
        const restarted = new StudioJobService(repository, () => 180, () => "unused");
        expect(restarted.get("/project-a", "job-3")).toEqual(expect.objectContaining({status: "recovery-required", recovery: expect.objectContaining({action: "retry"}), durationMs: 80}));
    });
});
