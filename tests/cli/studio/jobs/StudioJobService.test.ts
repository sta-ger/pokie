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

    it("retains a late browser Play result once while preserving lost-owner status and other terminal contracts", () => {
        let nextId = 0;
        const service = new StudioJobService(new FileStudioJobRepository(directory), () => 100, () => `late-${++nextId}`);
        const result = {summary: "Accepted Play", detail: {session: {credits: 999, sessionId: "session"}}};
        for (const operation of ["browser-play", "simulation", "replay"]) {
            const started = service.start({projectId: "/a", operation, request: {}, conflictKey: operation});
            if (started.status !== "created") throw new Error("Expected admission");
            expect(service.retainBrowserPlayPublication(started.job.id, result)?.result).toBeUndefined();
            service.requireRecovery(started.job.id, {action: "retry", reason: "Owner expired"});
            const prior = service.get("/a", started.job.id)!;
            const retained = service.retainBrowserPlayPublication(started.job.id, result)!;
            expect(retained).toEqual(operation === "browser-play" ? {...prior, result} : prior);
            expect(service.retainBrowserPlayPublication(started.job.id, {...result, detail: {session: {credits: 777}}})).toEqual(retained);
            expect(service.complete(started.job.id, {summary: "replacement"})).toEqual(retained);
            expect(service.cancelled(started.job.id)).toEqual(retained);
        }
        const next = service.start({projectId: "/a", operation: "browser-play", request: {}, conflictKey: "browser-play"});
        if (next.status !== "created") throw new Error("Expected later admission");
        service.complete(next.job.id, result);
        expect(service.retainBrowserPlayPublication(next.job.id, {summary: "replacement"})?.result).toEqual(result);
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

    it("keeps shutdown pending until an executor finishes its cancellation cleanup", async () => {
        const repository = new FileStudioJobRepository(directory);
        const service = new StudioJobService(repository, () => 100, () => "delayed-cleanup");
        let release!: () => void;
        const cleanup = new Promise<void>((resolve) => {
            release = resolve;
        });
        const execution = service.execute(
            {projectId: "/project", operation: "deployment", request: {}, conflictKey: "destination"},
            async () => {
                await cleanup;
                return "cleaned";
            },
            () => ({status: "cancelled", result: {summary: "Staging cleaned"}}),
        );
        service.cancelAll();
        let stopped = false;
        const shutdown = service.completeGracefulShutdown().then(() => {
            stopped = true;
        });
        await Promise.resolve();
        expect(stopped).toBe(false);
        expect(service.get("/project", "delayed-cleanup")).toMatchObject({status: "cancelling"});
        expect(repository.getProcessState()?.status).toBe("running");
        release();
        await execution;
        await shutdown;
        expect(service.get("/project", "delayed-cleanup")).toMatchObject({status: "cancelled"});
        expect(repository.getProcessState()?.status).toBe("gracefully-stopped");
    });

    it("retains interrupted recovery instead of inventing cancellation for an undrained executor", async () => {
        const repository = new FileStudioJobRepository(directory);
        const service = new StudioJobService(repository, () => 100, () => "undrained");
        service.start({projectId: "/project", operation: "artifact-build", request: {outDir: "output"}, conflictKey: "destination"});
        service.cancelAll();
        await expect(service.completeGracefulShutdown()).rejects.toThrow("could not confirm executor cleanup");
        expect(service.get("/project", "undrained")).toMatchObject({status: "recovery-required", request: {outDir: "output"}, recovery: {action: "retry"}});
        expect(service.get("/project", "undrained")?.recovery?.reason).toContain("Inspect the captured destination");
        expect(repository.getProcessState()?.status).toBe("running");
    });

    it("preserves recovery when a cancelled executor throws without confirming cleanup", async () => {
        const repository = new FileStudioJobRepository(directory);
        const service = new StudioJobService(repository, () => 100, () => "cleanup-error");
        let reject!: (error: Error) => void;
        const cleanup = new Promise<void>((_resolve, rejectCleanup) => {
            reject = rejectCleanup;
        });
        const execution = service.execute(
            {projectId: "/project", operation: "deployment", request: {destination: "output"}, conflictKey: "destination"},
            () => cleanup,
            () => ({status: "completed", result: {summary: "published"}}),
            () => ({status: "cancelled", result: {summary: "Compatibility mapper claimed cleanup"}}),
        );
        const failedExecution = expect(execution).rejects.toThrow("cleanup failed");
        service.cancelAll();
        reject(new Error("cleanup failed"));
        await failedExecution;
        await expect(service.completeGracefulShutdown()).rejects.toThrow("could not confirm executor cleanup");
        expect(service.get("/project", "cleanup-error")).toMatchObject({status: "recovery-required", recovery: {action: "retry"}, request: {destination: "output"}});
        expect(repository.getProcessState()?.status).toBe("running");
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

it("admits integrity-bound browser jobs, preserves cancellation prefixes and rejects stale publication", async () => {
    const {StudioWasmBrowserService} = await import("../../../../cli/studio/wasm/StudioWasmBrowserService.js");
    const {StudioRoundRecorder} = await import("../../../../cli/studio/runtime/StudioRoundRecorder.js");
    const {createCanonicalWasmFixture} = await import("../../../fixtures/wasm/createCanonicalWasmFixture.js");
    const {PokieWasmWorkerProtocol} = await import("../../../../src/wasm/worker.js");
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "wasm-browser-jobs-"));
    const artifactPath = path.join(directory, "game.wasm");
    const fixture = createCanonicalWasmFixture();
    fs.writeFileSync(artifactPath, fixture.bytes);
    fs.writeFileSync(`${artifactPath}.pokie-wasm.json`, JSON.stringify(fixture.manifest));
    const jobs = new StudioJobService(new FileStudioJobRepository(path.join(directory, "jobs")));
    const browser = new StudioWasmBrowserService(jobs, new StudioRoundRecorder(), 2000);
    const context = {mode: "project" as const, projectRoot: artifactPath};
    const artifact = await browser.artifact(context);
    const binding = {owner: "tab-1", generation: artifact.generation, artifactIdentity: artifact.manifest.artifact!.sha256};
    const start = (request = {rounds: 5, seed: "0", workers: 1}) => browser.handle("POST", "/api/project/wasm/jobs", {...binding, projectRoot: artifactPath, operation: "simulation", request}, context);
    const worker = new PokieWasmWorkerProtocol();
    try {
        const accepted = await start();
        const {job} = accepted.body as {job: {id: string; projectId: string}};
        expect(accepted.status).toBe(201);
        expect(await start()).toMatchObject({status: 409});
        expect((await browser.handle("POST", `/api/project/wasm/jobs/${job.id}/heartbeat`, {...binding, owner: "other"}, context)).status).toBe(409);
        await worker.handle({id: "init", type: "instantiate", ...fixture, seed: "0"});
        const output = await worker.handle({id: "sim", type: "simulate", rounds: 5, seed: "0"});
        if (!output.ok) throw new Error(output.error);
        expect(await browser.handle("POST", `/api/project/wasm/jobs/${job.id}/finish`, {...binding, cleanup: true, status: "completed", output: output.result}, context)).toMatchObject({status: 200, body: {status: "completed", result: {provenance: {execution: "browser-worker"}, detail: {report: {rounds: 5}}}}});
        const restarted = new StudioJobService(new FileStudioJobRepository(path.join(directory, "jobs")));
        expect(restarted.get(job.projectId, job.id)?.result?.detail?.report).toBeDefined();
        const cancelled = (await start({rounds: 1000, seed: "0", workers: 1})).body as {job: {id: string}};
        jobs.cancel(job.projectId, cancelled.job.id);
        await browser.handle("POST", `/api/project/wasm/jobs/${cancelled.job.id}/finish`, {...binding, cleanup: true, status: "completed", progress: {completed: 3, statistics: {rounds: 3}}}, context);
        expect(jobs.get(job.projectId, cancelled.job.id)).toMatchObject({status: "cancelled", result: {detail: {rounds: 3, observedPrefix: {rounds: 3}}}});
        const stale = (await start()).body as {job: {id: string}};
        const replacement = createCanonicalWasmFixture({id: "replacement"});
        fs.writeFileSync(artifactPath, replacement.bytes);
        fs.writeFileSync(`${artifactPath}.pokie-wasm.json`, JSON.stringify(replacement.manifest));
        await expect(browser.handle("POST", `/api/project/wasm/jobs/${stale.job.id}/finish`, {...binding, cleanup: true, status: "completed", output: output.result}, context)).rejects.toThrow(/changed/);
        expect(jobs.get(job.projectId, stale.job.id)).toMatchObject({status: "failed"});
        await expect(start()).rejects.toThrow(/changed/);
    } finally {
        await worker.handle({id: "dispose", type: "dispose"});
        await browser.shutdown();
        fs.rmSync(directory, {recursive: true, force: true});
    }
});

it("marks a lost browser owner recovery-required and blocks a false graceful shutdown", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "wasm-lost-owner-"));
    const {StudioWasmBrowserService} = await import("../../../../cli/studio/wasm/StudioWasmBrowserService.js");
    const {StudioRoundRecorder} = await import("../../../../cli/studio/runtime/StudioRoundRecorder.js");
    const {createCanonicalWasmFixture} = await import("../../../fixtures/wasm/createCanonicalWasmFixture.js");
    const fixture = createCanonicalWasmFixture();
    const file = path.join(directory, "game.wasm");
    fs.writeFileSync(file, fixture.bytes);
    fs.writeFileSync(`${file}.pokie-wasm.json`, JSON.stringify(fixture.manifest));
    const jobs = new StudioJobService(new FileStudioJobRepository(path.join(directory, "jobs")));
    const browser = new StudioWasmBrowserService(jobs, new StudioRoundRecorder(), 20);
    const context = {mode: "project" as const, projectRoot: file};
    try {
        const artifact = await browser.artifact(context);
        const result = await browser.handle("POST", "/api/project/wasm/jobs", {owner: "lost-tab", projectRoot: file, generation: artifact.generation, artifactIdentity: fixture.manifest.artifact!.sha256, operation: "simulation", request: {rounds: 1000, seed: "0", workers: 1}}, context);
        const {job} = result.body as {job: {id: string; projectId: string}};
        await browser.shutdown();
        expect(jobs.get(job.projectId, job.id)).toMatchObject({status: "recovery-required", recovery: {action: "retry"}});
        await expect(jobs.completeGracefulShutdown()).rejects.toThrow(/cleanup/);
    } finally {
        await browser.shutdown();
        fs.rmSync(directory, {recursive: true, force: true});
    }
});

it("retains idle Worker cleanup failure after admission closes and refuses graceful drainage", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-idle-cleanup-"));
    try {
        const repository = new FileStudioJobRepository(directory);
        const service = new StudioJobService(repository);
        service.beginShutdown();
        const input = {projectId: "/game.wasm", operation: "browser-worker-cleanup", request: {sessionId: "idle", artifactIdentity: "bound"}, conflictKey: "cleanup:idle"};
        expect(() => service.start(input)).toThrow(/shutting down/);
        const failure = service.recordCleanupFailure(input, {action: "new-session", reason: "Idle Worker stopped responding; cleanup could not be confirmed."});
        expect(failure).toMatchObject({status: "recovery-required", request: {sessionId: "idle", artifactIdentity: "bound"}});
        expect(service.signal(failure.id)).toBeUndefined();
        await expect(service.completeGracefulShutdown()).rejects.toThrow(/could not confirm executor cleanup/);
        expect(repository.getProcessState()?.status).toBe("running");
        const restarted = new StudioJobService(repository);
        expect(restarted.list()).toEqual([failure]);
    } finally {
        fs.rmSync(directory, {recursive: true, force: true}); 
    }
});
