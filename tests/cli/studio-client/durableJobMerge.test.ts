import {mergeDurableJobDiscovery} from "../../../cli/studio-client/src/hooks/useDurableJobs.js";
import type {StudioJobView} from "../../../cli/studio-client/src/api/types.js";

const projectId = "design:/tmp/game.blueprint.json";

function job(id: string, status: StudioJobView["status"], createdAt: number, completedAt?: number): StudioJobView {
    return {
        id,
        projectId,
        operation: "outcome-library-generation",
        request: {generation: "exact"},
        conflictKey: `outcome-library:${id}`,
        status,
        createdAt,
        ...(completedAt === undefined ? {} : {completedAt}),
    };
}

describe("durable job discovery merge", () => {
    it("forgets an old terminal receipt that the server no longer lists", () => {
        const oldInterrupted = job("old-interrupted", "recovery-required", 1_000, 1_000);
        const current = job("current", "completed", 2_000, 2_000);

        const merged = mergeDurableJobDiscovery(
            [oldInterrupted, current],
            [current],
            {now: 20_000},
        );

        expect(merged.map((entry) => entry.id)).toEqual(["current"]);
    });

    it("keeps active work through a transiently incomplete list", () => {
        const running = job("running", "running", 1_000);

        const merged = mergeDurableJobDiscovery([running], [], {now: 20_000});

        expect(merged.map((entry) => entry.id)).toEqual(["running"]);
    });

    it("keeps a just-finished local receipt briefly so a success card does not flicker", () => {
        const finished = job("finished", "completed", 19_500, 19_500);

        expect(mergeDurableJobDiscovery([finished], [], {now: 20_000}).map((entry) => entry.id)).toEqual(["finished"]);
        expect(mergeDurableJobDiscovery([finished], [], {now: 30_000})).toEqual([]);
    });

    it("adds newly discovered jobs and does not let a stale response overwrite a local action", () => {
        const previous = job("local", "completed", 2_000, 3_000);
        const discovered = [job("new", "running", 4_000)];

        const merged = mergeDurableJobDiscovery([previous], discovered, {
            now: 4_500,
            canApply: (id) => id !== "local",
        });

        expect(merged.find((entry) => entry.id === "local")?.status).toBe("completed");
        expect(merged.find((entry) => entry.id === "new")?.status).toBe("running");
        expect(merged[0]?.id).toBe("new");
    });
});
