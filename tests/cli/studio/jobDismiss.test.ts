import fs from "fs";
import os from "os";
import path from "path";
import {FileStudioJobRepository} from "../../../cli/studio/jobs/FileStudioJobRepository.js";
import {StudioJobService} from "../../../cli/studio/jobs/StudioJobService.js";

describe("StudioJobService dismiss", () => {
    let directory: string;
    let jobs: StudioJobService;
    const projectId = "design:/tmp/game.blueprint.json";

    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-job-dismiss-"));
        jobs = new StudioJobService(new FileStudioJobRepository(path.join(directory, "jobs")));
    });

    afterEach(() => {
        fs.rmSync(directory, {recursive: true, force: true});
    });

    it("removes a finished job from durable history without touching files", () => {
        const started = jobs.start({
            projectId,
            operation: "design-build",
            request: {sourcePath: "/tmp/game.blueprint.json"},
            conflictKey: "design-build:/tmp/game.blueprint.json",
        });
        expect(started.status).toBe("created");
        if (started.status !== "created") throw new Error("job was not created");
        const output = path.join(directory, "game.zip");
        fs.writeFileSync(output, "built output");
        jobs.complete(started.job.id, {summary: "Built.", outputs: [{label: "game.zip", path: output}]});

        expect(jobs.get(projectId, started.job.id)?.status).toBe("completed");
        expect(jobs.dismiss(projectId, started.job.id)).toBe(true);
        expect(jobs.get(projectId, started.job.id)).toBeUndefined();
        expect(fs.existsSync(output)).toBe(true);
    });

    it("keeps active work and refuses to dismiss a job it does not own", () => {
        const started = jobs.start({
            projectId,
            operation: "project-open-materialization",
            request: {sourcePath: "/tmp/game.blueprint.json"},
            conflictKey: "project-open:/tmp/game.blueprint.json",
        });
        expect(started.status).toBe("created");
        if (started.status !== "created") throw new Error("job was not created");

        expect(jobs.dismiss(projectId, started.job.id)).toBe(false);
        expect(jobs.get(projectId, started.job.id)?.status).toBe("queued");
        expect(jobs.dismiss("another-project", started.job.id)).toBe(false);
        expect(jobs.dismiss(projectId, "missing-job")).toBe(false);
    });

    it("allows a failed or recovery-required job to be dismissed", () => {
        const failed = jobs.start({
            projectId,
            operation: "design-par-export",
            request: {sourcePath: "/tmp/game.blueprint.json"},
            conflictKey: "design-par-export:/tmp/game.blueprint.json",
        });
        if (failed.status !== "created") throw new Error("job was not created");
        jobs.fail(failed.job.id, "Could not write the workbook.");
        expect(jobs.dismiss(projectId, failed.job.id)).toBe(true);

        const recovery = jobs.start({
            projectId,
            operation: "project-open-materialization",
            request: {sourcePath: "/tmp/game.blueprint.json"},
            conflictKey: "project-open-2:/tmp/game.blueprint.json",
        });
        if (recovery.status !== "created") throw new Error("job was not created");
        jobs.requireRecovery(recovery.job.id, {action: "retry", reason: "Studio restarted."});
        expect(jobs.dismiss(projectId, recovery.job.id)).toBe(true);
    });
});
