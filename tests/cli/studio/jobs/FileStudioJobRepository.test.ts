import fs from "fs";
import os from "os";
import path from "path";
import {FileStudioJobRepository} from "../../../../cli/studio/jobs/FileStudioJobRepository.js";
import type {StudioJobView} from "../../../../cli/studio/jobs/StudioJobView.js";

describe("FileStudioJobRepository", () => {
    let directory: string;

    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-job-repository-"));
    });
    afterEach(() => {
        fs.rmSync(directory, {recursive: true, force: true});
    });

    it("durably isolates project records and replaces a record atomically", () => {
        const repository = new FileStudioJobRepository(directory);
        const first: StudioJobView = {
            id: "first", projectId: "/project-a", operation: "simulation", request: {rounds: 10},
            conflictKey: "simulation:/project-a", status: "queued", createdAt: 10,
        };
        repository.save(first);
        repository.save({...first, status: "completed", completedAt: 20, durationMs: 10, result: {summary: "complete"}});
        repository.save({...first, id: "second", projectId: "/project-b", conflictKey: "simulation:/project-b", createdAt: 30});

        expect(repository.get("first")).toEqual(expect.objectContaining({status: "completed", result: {summary: "complete"}}));
        expect(repository.list("/project-a")).toEqual([expect.objectContaining({id: "first"})]);
        expect(repository.list("/project-b")).toEqual([expect.objectContaining({id: "second"})]);
        expect(fs.readdirSync(directory).some((entry) => entry.endsWith(".tmp"))).toBe(false);
    });

    it("ignores a corrupt record without hiding valid durable records", () => {
        const repository = new FileStudioJobRepository(directory);
        repository.save({
            id: "valid", projectId: "/project-a", operation: "replay", request: {round: 3},
            conflictKey: "replay:/project-a", status: "queued", createdAt: 10,
        });
        fs.writeFileSync(path.join(directory, "corrupt.json"), "not json");

        expect(repository.list("/project-a")).toEqual([expect.objectContaining({id: "valid"})]);
    });

    it("orders one project's newest records first", () => {
        const repository = new FileStudioJobRepository(directory);
        for (const [id, createdAt] of [["old", 10], ["new", 30], ["middle", 20]] as const) {
            repository.save({id, projectId: "/project-a", operation: "simulation", request: {}, conflictKey: id, status: "completed", createdAt, completedAt: createdAt, result: {summary: id}});
        }

        expect(repository.list("/project-a").map((job) => job.id)).toEqual(["new", "middle", "old"]);
    });

    it("retains active records while bounding retained terminal history", () => {
        const repository = new FileStudioJobRepository(directory, 2);
        for (const [id, createdAt] of [["terminal-old", 10], ["terminal-middle", 20], ["terminal-new", 30]] as const) {
            repository.save({id, projectId: "/project-a", operation: "simulation", request: {}, conflictKey: id, status: "completed", createdAt, completedAt: createdAt, result: {summary: id}});
        }
        repository.save({id: "active", projectId: "/project-a", operation: "simulation", request: {}, conflictKey: "active", status: "running", createdAt: 40});

        expect(repository.list("/project-a").map((job) => job.id)).toEqual(["active", "terminal-new", "terminal-middle"]);
        expect(repository.get("terminal-old")).toBeUndefined();
    });
});
