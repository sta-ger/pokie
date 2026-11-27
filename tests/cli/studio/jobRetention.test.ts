import fs from "fs";
import os from "os";
import path from "path";
import {FileStudioJobRepository} from "../../../cli/studio/jobs/FileStudioJobRepository.js";
import {StudioJobService} from "../../../cli/studio/jobs/StudioJobService.js";
import type {StudioJobView} from "../../../cli/studio/jobs/StudioJobView.js";

function job(id: string, status: StudioJobView["status"], createdAt: number): StudioJobView {
    return {
        id,
        projectId: "design:/tmp/game.blueprint.json",
        operation: "project-open-materialization",
        request: {sourcePath: "/tmp/game.blueprint.json"},
        conflictKey: `project-open:${id}`,
        status,
        createdAt,
    };
}

describe("Studio job retention", () => {
    let directory: string;

    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-job-retention-"));
    });

    afterEach(() => {
        fs.rmSync(directory, {recursive: true, force: true});
    });

    it("forgets recovery-required records after the interrupted-work retention window", () => {
        const now = 1_000_000;
        const repository = new FileStudioJobRepository(directory, 100, () => now, 1_000);
        repository.save(job("old-interrupted", "recovery-required", now - 5_000));
        repository.save(job("recent-interrupted", "recovery-required", now - 500));
        repository.save(job("old-completed", "completed", now - 50_000));
        repository.save(job("running", "running", now - 50_000));

        expect(repository.list().map((entry) => entry.id)).toEqual([
            "recent-interrupted",
            "old-completed",
            "running",
        ]);
        expect(fs.existsSync(path.join(directory, "old-interrupted.json"))).toBe(false);
        expect(fs.existsSync(path.join(directory, "recent-interrupted.json"))).toBe(true);
        // Age-based cleanup is specific to interrupted work; ordinary completed history stays until
        // the separate count-based retention policy removes it.
        expect(fs.existsSync(path.join(directory, "old-completed.json"))).toBe(true);
    });

    it("keeps the newest terminal records under the count-based retention policy", () => {
        const now = 2_000_000;
        const repository = new FileStudioJobRepository(directory, 2, () => now, 60_000);
        repository.save(job("oldest", "completed", now - 3_000));
        repository.save(job("middle", "completed", now - 2_000));
        repository.save(job("newest", "completed", now - 1_000));

        expect(repository.list().map((entry) => entry.id)).toEqual(["newest", "middle"]);
        expect(fs.existsSync(path.join(directory, "oldest.json"))).toBe(false);
    });

    it("does not resurrect an expired interrupted job when Studio starts", () => {
        const now = 3_000_000;
        const repository = new FileStudioJobRepository(directory, 100, () => now, 1_000);
        repository.save(job("expired", "recovery-required", now - 5_000));

        const service = new StudioJobService(repository, () => now);

        expect(service.list()).toEqual([]);
        expect(fs.existsSync(path.join(directory, "expired.json"))).toBe(false);
    });
});
