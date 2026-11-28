import fs from "fs";
import os from "os";
import path from "path";
import {FileStudioJobRepository} from "../../../cli/studio/jobs/FileStudioJobRepository.js";
import {StudioJobService} from "../../../cli/studio/jobs/StudioJobService.js";
import type {StudioJobView} from "../../../cli/studio/jobs/StudioJobView.js";

const projectId = "/tmp/shared-store-game.blueprint.json";

function runningJob(id: string, ownerPid?: number): StudioJobView {
    return {
        id,
        projectId,
        operation: "outcome-library-generation",
        request: {generation: "exact"},
        conflictKey: `outcome-library:${id}`,
        status: "running",
        createdAt: 1_000,
        ...(ownerPid === undefined ? {} : {ownerPid}),
    };
}

describe("Studio job ownership across concurrent Studio servers", () => {
    let directory: string;

    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-job-owners-"));
    });

    afterEach(() => {
        fs.rmSync(directory, {recursive: true, force: true});
    });

    it("does not interrupt a live job owned by another Studio process", () => {
        const repository = new FileStudioJobRepository(directory, 100, () => 3_000);
        // process.ppid is another live process by construction: the parent test runner.
        repository.save(runningJob("live", process.ppid));
        repository.saveProcessState({status: "running", updatedAt: 2_000, pid: process.ppid});

        const service = new StudioJobService(repository, () => 3_000);

        expect(service.get(projectId, "live")?.status).toBe("running");
        expect(service.get(projectId, "live")?.recovery).toBeUndefined();
    });

    it("recovers a running job whose owner process is gone", () => {
        const repository = new FileStudioJobRepository(directory, 100, () => 3_000);
        repository.save(runningJob("dead-owner", 2_147_483_647));

        const service = new StudioJobService(repository, () => 3_000);

        expect(service.get(projectId, "dead-owner")?.status).toBe("recovery-required");
        expect(service.get(projectId, "dead-owner")?.recovery?.action).toBe("retry");
    });

    it("does not interrupt a legacy record while a pre-ownerPid Studio marker says running", () => {
        const repository = new FileStudioJobRepository(directory, 100, () => 3_000);
        repository.save(runningJob("legacy-live"));
        repository.saveProcessState({status: "running", updatedAt: 2_000});

        const service = new StudioJobService(repository, () => 3_000);

        expect(service.get(projectId, "legacy-live")?.status).toBe("running");
    });

    it("recovers a legacy running record even after a graceful-shutdown marker", () => {
        const repository = new FileStudioJobRepository(directory, 100, () => 3_000);
        repository.save(runningJob("legacy"));
        repository.saveProcessState({status: "gracefully-stopped", updatedAt: 2_000});

        const service = new StudioJobService(repository, () => 3_000);

        expect(service.get(projectId, "legacy")?.status).toBe("recovery-required");
    });

    it("stamps newly accepted work with this Studio process id", () => {
        const repository = new FileStudioJobRepository(directory, 100, () => 3_000);
        const service = new StudioJobService(repository, () => 3_000);

        const started = service.start({
            projectId,
            operation: "outcome-library-generation",
            request: {generation: "exact"},
            conflictKey: "outcome-library:new",
        });

        expect(started.status).toBe("created");
        if (started.status !== "created") throw new Error("job was not created");
        expect(started.job.ownerPid).toBe(process.pid);
    });
});
