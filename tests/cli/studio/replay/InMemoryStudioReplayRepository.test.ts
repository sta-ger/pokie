import type {ReplayDescriptor} from "pokie";
import {InMemoryStudioReplayRepository} from "../../../../cli/studio/replay/InMemoryStudioReplayRepository.js";
import type {StudioReplayRecord} from "../../../../cli/studio/replay/StudioReplayRecord.js";

function createRecord(id: string, projectRoot: string, timestamp: number): StudioReplayRecord {
    const descriptor: ReplayDescriptor = {
        game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
        seed: null,
        round: 1,
        totalBet: 1,
        totalWin: 0,
        screen: null,
        timestamp,
        durationMs: 1,
    };
    return {id, projectRoot, descriptor};
}

describe("InMemoryStudioReplayRepository", () => {
    it("returns undefined for an unknown id", () => {
        const repository = new InMemoryStudioReplayRepository();

        expect(repository.get("does-not-exist")).toBeUndefined();
    });

    it("saves and retrieves a record by id", () => {
        const repository = new InMemoryStudioReplayRepository();
        const record = createRecord("replay-1", "/a", 1000);

        repository.save(record);

        expect(repository.get("replay-1")).toBe(record);
    });

    describe("listByProjectRoot", () => {
        it("lists a project's replays, most-recently-recorded first", () => {
            const repository = new InMemoryStudioReplayRepository();
            const oldest = createRecord("replay-1", "/a", 1000);
            const middle = createRecord("replay-2", "/a", 2000);
            const newest = createRecord("replay-3", "/a", 3000);
            repository.save(oldest);
            repository.save(newest);
            repository.save(middle);

            expect(repository.listByProjectRoot("/a")).toEqual([newest, middle, oldest]);
        });

        it("never includes another project's replays", () => {
            const repository = new InMemoryStudioReplayRepository();
            repository.save(createRecord("replay-1", "/b", 1000));

            expect(repository.listByProjectRoot("/a")).toEqual([]);
        });

        it("returns an empty list for a project with no replays", () => {
            const repository = new InMemoryStudioReplayRepository();

            expect(repository.listByProjectRoot("/a")).toEqual([]);
        });
    });

    describe("retention", () => {
        it("keeps at most the configured number of replays per project", () => {
            const repository = new InMemoryStudioReplayRepository(3);

            for (let i = 0; i < 5; i++) {
                repository.save(createRecord(`replay-${i}`, "/a", i * 1000));
            }

            const remaining = repository.listByProjectRoot("/a");
            expect(remaining).toHaveLength(3);
            expect(remaining.map((record) => record.id)).toEqual(["replay-4", "replay-3", "replay-2"]);
        });

        it("evicts the oldest replay first", () => {
            const repository = new InMemoryStudioReplayRepository(2);
            repository.save(createRecord("oldest", "/a", 1000));
            repository.save(createRecord("middle", "/a", 2000));
            repository.save(createRecord("newest", "/a", 3000));

            expect(repository.get("oldest")).toBeUndefined();
            expect(repository.get("middle")).toBeDefined();
            expect(repository.get("newest")).toBeDefined();
        });

        it("enforces retention independently per project", () => {
            const repository = new InMemoryStudioReplayRepository(1);
            repository.save(createRecord("a-old", "/a", 1000));
            repository.save(createRecord("a-new", "/a", 2000));
            repository.save(createRecord("b-old", "/b", 1000));
            repository.save(createRecord("b-new", "/b", 2000));

            expect(repository.listByProjectRoot("/a").map((record) => record.id)).toEqual(["a-new"]);
            expect(repository.listByProjectRoot("/b").map((record) => record.id)).toEqual(["b-new"]);
        });

        it("does not evict anything for a project still under the limit", () => {
            const repository = new InMemoryStudioReplayRepository(20);
            repository.save(createRecord("replay-1", "/a", 1000));
            repository.save(createRecord("replay-2", "/a", 2000));

            expect(repository.listByProjectRoot("/a")).toHaveLength(2);
        });
    });
});
