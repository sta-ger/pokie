import {InMemoryStudioSimulationRepository} from "../../../../cli/studio/simulation/InMemoryStudioSimulationRepository.js";
import type {StudioSimulationJobRecord} from "../../../../cli/studio/simulation/StudioSimulationJobRecord.js";
import type {StudioSimulationStatus} from "../../../../cli/studio/simulation/StudioSimulationStatus.js";

function createRecord(
    id: string,
    projectRoot: string,
    status: StudioSimulationStatus,
): StudioSimulationJobRecord {
    return {
        id,
        projectRoot,
        status,
        rounds: 1000,
        startedAt: Date.now(),
        roundsCompleted: 0,
        durationMs: 0,
        abortController: new AbortController(),
    };
}

describe("InMemoryStudioSimulationRepository", () => {
    it("returns undefined for an unknown id", () => {
        const repository = new InMemoryStudioSimulationRepository();

        expect(repository.get("does-not-exist")).toBeUndefined();
    });

    it("saves and retrieves a record by id", () => {
        const repository = new InMemoryStudioSimulationRepository();
        const record = createRecord("job-1", "/a", "queued");

        repository.save(record);

        expect(repository.get("job-1")).toBe(record);
    });

    it("reflects in-place mutations without a second save() call", () => {
        const repository = new InMemoryStudioSimulationRepository();
        const record = createRecord("job-1", "/a", "queued");
        repository.save(record);

        record.status = "running";
        record.roundsCompleted = 500;

        expect(repository.get("job-1")).toEqual(expect.objectContaining({status: "running", roundsCompleted: 500}));
    });

    describe("findActiveByProjectRoot", () => {
        it("finds a queued job for the given projectRoot", () => {
            const repository = new InMemoryStudioSimulationRepository();
            const record = createRecord("job-1", "/a", "queued");
            repository.save(record);

            expect(repository.findActiveByProjectRoot("/a")).toBe(record);
        });

        it("finds a running job for the given projectRoot", () => {
            const repository = new InMemoryStudioSimulationRepository();
            const record = createRecord("job-1", "/a", "running");
            repository.save(record);

            expect(repository.findActiveByProjectRoot("/a")).toBe(record);
        });

        it("ignores completed/failed/cancelled jobs", () => {
            const repository = new InMemoryStudioSimulationRepository();
            repository.save(createRecord("job-1", "/a", "completed"));
            repository.save(createRecord("job-2", "/a", "failed"));
            repository.save(createRecord("job-3", "/a", "cancelled"));

            expect(repository.findActiveByProjectRoot("/a")).toBeUndefined();
        });

        it("ignores jobs for a different projectRoot", () => {
            const repository = new InMemoryStudioSimulationRepository();
            repository.save(createRecord("job-1", "/b", "running"));

            expect(repository.findActiveByProjectRoot("/a")).toBeUndefined();
        });
    });

    describe("listActive", () => {
        it("lists every queued/running job regardless of projectRoot", () => {
            const repository = new InMemoryStudioSimulationRepository();
            const queued = createRecord("job-1", "/a", "queued");
            const running = createRecord("job-2", "/b", "running");
            repository.save(queued);
            repository.save(running);
            repository.save(createRecord("job-3", "/a", "completed"));

            expect(repository.listActive()).toEqual(expect.arrayContaining([queued, running]));
            expect(repository.listActive()).toHaveLength(2);
        });

        it("returns an empty list when nothing is active", () => {
            const repository = new InMemoryStudioSimulationRepository();
            repository.save(createRecord("job-1", "/a", "completed"));

            expect(repository.listActive()).toEqual([]);
        });
    });
});
