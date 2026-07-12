import {InMemoryStudioSimulationRepository} from "../../../../cli/studio/simulation/InMemoryStudioSimulationRepository.js";
import type {StudioSimulationJobRecord} from "../../../../cli/studio/simulation/StudioSimulationJobRecord.js";
import type {StudioSimulationStatus} from "../../../../cli/studio/simulation/StudioSimulationStatus.js";

function createRecord(
    id: string,
    projectRoot: string,
    status: StudioSimulationStatus,
    completedAt?: number,
): StudioSimulationJobRecord {
    return {
        id,
        projectRoot,
        status,
        rounds: 1000,
        startedAt: Date.now(),
        completedAt,
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

    describe("listTerminalByProjectRoot", () => {
        it("lists completed/failed/cancelled jobs for the given project, most-recently-completed first", () => {
            const repository = new InMemoryStudioSimulationRepository();
            const oldest = createRecord("job-1", "/a", "completed", 1000);
            const middle = createRecord("job-2", "/a", "failed", 2000);
            const newest = createRecord("job-3", "/a", "cancelled", 3000);
            repository.save(oldest);
            repository.save(newest);
            repository.save(middle);

            expect(repository.listTerminalByProjectRoot("/a")).toEqual([newest, middle, oldest]);
        });

        it("excludes queued/running jobs", () => {
            const repository = new InMemoryStudioSimulationRepository();
            repository.save(createRecord("job-1", "/a", "queued"));
            repository.save(createRecord("job-2", "/a", "running"));

            expect(repository.listTerminalByProjectRoot("/a")).toEqual([]);
        });

        it("never includes another project's jobs", () => {
            const repository = new InMemoryStudioSimulationRepository();
            repository.save(createRecord("job-1", "/b", "completed", 1000));

            expect(repository.listTerminalByProjectRoot("/a")).toEqual([]);
        });
    });

    describe("retention", () => {
        it("keeps at most the configured number of terminal jobs per project", () => {
            const repository = new InMemoryStudioSimulationRepository(3);

            for (let i = 0; i < 5; i++) {
                repository.save(createRecord(`job-${i}`, "/a", "completed", i * 1000));
            }

            const remaining = repository.listTerminalByProjectRoot("/a");
            expect(remaining).toHaveLength(3);
            expect(remaining.map((record) => record.id)).toEqual(["job-4", "job-3", "job-2"]);
        });

        it("evicts the oldest terminal jobs first", () => {
            const repository = new InMemoryStudioSimulationRepository(2);
            repository.save(createRecord("oldest", "/a", "completed", 1000));
            repository.save(createRecord("middle", "/a", "failed", 2000));
            repository.save(createRecord("newest", "/a", "cancelled", 3000));

            expect(repository.get("oldest")).toBeUndefined();
            expect(repository.get("middle")).toBeDefined();
            expect(repository.get("newest")).toBeDefined();
        });

        it("never evicts a queued/running job even when the project is over the terminal limit", () => {
            const repository = new InMemoryStudioSimulationRepository(1);
            const active = createRecord("active-job", "/a", "running");
            repository.save(active);
            repository.save(createRecord("job-1", "/a", "completed", 1000));
            repository.save(createRecord("job-2", "/a", "completed", 2000));
            repository.save(createRecord("job-3", "/a", "completed", 3000));

            expect(repository.get("active-job")).toBe(active);
            expect(repository.listActive()).toEqual([active]);
        });

        it("enforces retention independently per project", () => {
            const repository = new InMemoryStudioSimulationRepository(1);
            repository.save(createRecord("a-old", "/a", "completed", 1000));
            repository.save(createRecord("a-new", "/a", "completed", 2000));
            repository.save(createRecord("b-old", "/b", "completed", 1000));
            repository.save(createRecord("b-new", "/b", "completed", 2000));

            expect(repository.listTerminalByProjectRoot("/a").map((record) => record.id)).toEqual(["a-new"]);
            expect(repository.listTerminalByProjectRoot("/b").map((record) => record.id)).toEqual(["b-new"]);
        });

        it("does not evict anything for a project still under the limit", () => {
            const repository = new InMemoryStudioSimulationRepository(20);
            repository.save(createRecord("job-1", "/a", "completed", 1000));
            repository.save(createRecord("job-2", "/a", "failed", 2000));

            expect(repository.listTerminalByProjectRoot("/a")).toHaveLength(2);
        });
    });
});
