import {InMemoryStudioReplayRepository} from "../../../../cli/studio/replay/InMemoryStudioReplayRepository.js";
import type {StudioReplayJobRecord} from "../../../../cli/studio/replay/StudioReplayJobRecord.js";
import type {StudioReplayStatus} from "../../../../cli/studio/replay/StudioReplayStatus.js";

function createRecord(id: string, projectRoot: string, status: StudioReplayStatus, completedAt?: number): StudioReplayJobRecord {
    return {
        id,
        projectRoot,
        status,
        round: 1,
        startedAt: Date.now(),
        completedAt,
        completedRounds: 0,
        durationMs: 0,
        abortController: new AbortController(),
    };
}

describe("InMemoryStudioReplayRepository", () => {
    it("returns undefined for an unknown id", () => {
        const repository = new InMemoryStudioReplayRepository();

        expect(repository.get("does-not-exist")).toBeUndefined();
    });

    it("saves and retrieves a record by id", () => {
        const repository = new InMemoryStudioReplayRepository();
        const record = createRecord("replay-1", "/a", "queued");

        repository.save(record);

        expect(repository.get("replay-1")).toBe(record);
    });

    it("reflects in-place mutations without a second save() call", () => {
        const repository = new InMemoryStudioReplayRepository();
        const record = createRecord("replay-1", "/a", "queued");
        repository.save(record);

        record.status = "running";
        record.completedRounds = 500;

        expect(repository.get("replay-1")).toEqual(expect.objectContaining({status: "running", completedRounds: 500}));
    });

    describe("findActiveByProjectRoot", () => {
        it("finds a queued replay for the given projectRoot", () => {
            const repository = new InMemoryStudioReplayRepository();
            const record = createRecord("replay-1", "/a", "queued");
            repository.save(record);

            expect(repository.findActiveByProjectRoot("/a")).toBe(record);
        });

        it("finds a running replay for the given projectRoot", () => {
            const repository = new InMemoryStudioReplayRepository();
            const record = createRecord("replay-1", "/a", "running");
            repository.save(record);

            expect(repository.findActiveByProjectRoot("/a")).toBe(record);
        });

        it("ignores completed/failed/cancelled replays", () => {
            const repository = new InMemoryStudioReplayRepository();
            repository.save(createRecord("replay-1", "/a", "completed"));
            repository.save(createRecord("replay-2", "/a", "failed"));
            repository.save(createRecord("replay-3", "/a", "cancelled"));

            expect(repository.findActiveByProjectRoot("/a")).toBeUndefined();
        });

        it("ignores replays for a different projectRoot", () => {
            const repository = new InMemoryStudioReplayRepository();
            repository.save(createRecord("replay-1", "/b", "running"));

            expect(repository.findActiveByProjectRoot("/a")).toBeUndefined();
        });
    });

    describe("listActive", () => {
        it("lists every queued/running replay regardless of projectRoot", () => {
            const repository = new InMemoryStudioReplayRepository();
            const queued = createRecord("replay-1", "/a", "queued");
            const running = createRecord("replay-2", "/b", "running");
            repository.save(queued);
            repository.save(running);
            repository.save(createRecord("replay-3", "/a", "completed"));

            expect(repository.listActive()).toEqual(expect.arrayContaining([queued, running]));
            expect(repository.listActive()).toHaveLength(2);
        });

        it("returns an empty list when nothing is active", () => {
            const repository = new InMemoryStudioReplayRepository();
            repository.save(createRecord("replay-1", "/a", "completed"));

            expect(repository.listActive()).toEqual([]);
        });
    });

    describe("listByProjectRoot", () => {
        it("lists every replay for a project regardless of status, most-recent first", () => {
            const repository = new InMemoryStudioReplayRepository();
            const oldest = createRecord("replay-1", "/a", "completed", 1000);
            const middle = createRecord("replay-2", "/a", "failed", 2000);
            const newest = createRecord("replay-3", "/a", "running");
            newest.startedAt = 3000;
            repository.save(oldest);
            repository.save(newest);
            repository.save(middle);

            expect(repository.listByProjectRoot("/a")).toEqual([newest, middle, oldest]);
        });

        it("includes a still-active (queued/running) replay alongside terminal ones", () => {
            const repository = new InMemoryStudioReplayRepository();
            const active = createRecord("replay-1", "/a", "running");
            repository.save(active);

            expect(repository.listByProjectRoot("/a")).toEqual([active]);
        });

        it("never includes another project's replays", () => {
            const repository = new InMemoryStudioReplayRepository();
            repository.save(createRecord("replay-1", "/b", "completed", 1000));

            expect(repository.listByProjectRoot("/a")).toEqual([]);
        });

        it("returns an empty list for a project with no replays", () => {
            const repository = new InMemoryStudioReplayRepository();

            expect(repository.listByProjectRoot("/a")).toEqual([]);
        });
    });

    describe("retention", () => {
        it("keeps at most the configured number of terminal replays per project", () => {
            const repository = new InMemoryStudioReplayRepository(3);

            for (let i = 0; i < 5; i++) {
                repository.save(createRecord(`replay-${i}`, "/a", "completed", i * 1000));
            }

            const remaining = repository.listByProjectRoot("/a");
            expect(remaining).toHaveLength(3);
            expect(remaining.map((record) => record.id)).toEqual(["replay-4", "replay-3", "replay-2"]);
        });

        it("evicts the oldest terminal replay first", () => {
            const repository = new InMemoryStudioReplayRepository(2);
            repository.save(createRecord("oldest", "/a", "completed", 1000));
            repository.save(createRecord("middle", "/a", "failed", 2000));
            repository.save(createRecord("newest", "/a", "cancelled", 3000));

            expect(repository.get("oldest")).toBeUndefined();
            expect(repository.get("middle")).toBeDefined();
            expect(repository.get("newest")).toBeDefined();
        });

        it("never evicts a queued/running replay even when the project is over the terminal limit", () => {
            const repository = new InMemoryStudioReplayRepository(1);
            const active = createRecord("active-replay", "/a", "running");
            repository.save(active);
            repository.save(createRecord("replay-1", "/a", "completed", 1000));
            repository.save(createRecord("replay-2", "/a", "completed", 2000));
            repository.save(createRecord("replay-3", "/a", "completed", 3000));

            expect(repository.get("active-replay")).toBe(active);
            expect(repository.listActive()).toEqual([active]);
        });

        it("enforces retention independently per project", () => {
            const repository = new InMemoryStudioReplayRepository(1);
            repository.save(createRecord("a-old", "/a", "completed", 1000));
            repository.save(createRecord("a-new", "/a", "completed", 2000));
            repository.save(createRecord("b-old", "/b", "completed", 1000));
            repository.save(createRecord("b-new", "/b", "completed", 2000));

            expect(repository.listByProjectRoot("/a").map((record) => record.id)).toEqual(["a-new"]);
            expect(repository.listByProjectRoot("/b").map((record) => record.id)).toEqual(["b-new"]);
        });

        it("does not evict anything for a project still under the limit", () => {
            const repository = new InMemoryStudioReplayRepository(20);
            repository.save(createRecord("replay-1", "/a", "completed", 1000));
            repository.save(createRecord("replay-2", "/a", "failed", 2000));

            expect(repository.listByProjectRoot("/a")).toHaveLength(2);
        });
    });
});
