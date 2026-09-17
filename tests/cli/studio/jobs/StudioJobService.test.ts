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

    it("keeps cancellation truthful until an executor reports cleanup-safe cancellation", () => {
        const service = new StudioJobService(new FileStudioJobRepository(directory), () => 100, () => "job-2");
        service.start({projectId: "/project-a", operation: "artifact-build", request: {target: "tsPackage"}, conflictKey: "destination:/project-a/out"});
        service.markRunning("job-2");
        expect(service.cancel("/project-a", "job-2")).toEqual(expect.objectContaining({status: "cancelling"}));
        expect(service.cancel("/project-b", "job-2")).toBeUndefined();
        expect(service.cancelled("job-2", {summary: "staging output cleaned"})).toEqual(expect.objectContaining({status: "cancelled"}));
        expect(service.cancel("/project-a", "job-2")).toEqual(expect.objectContaining({status: "cancelled"}));
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
