import type {ReplayDescriptor} from "pokie";
import {buildReplayDownload} from "../../../../cli/studio/replay/buildReplayDownload.js";

function createDescriptor(overrides: Partial<ReplayDescriptor> = {}): ReplayDescriptor {
    return {
        game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
        seed: "demo",
        round: 42,
        totalBet: 42,
        totalWin: 10,
        screen: [["A", "B", "C"]],
        timestamp: 1735707845000,
        durationMs: 5,
        ...overrides,
    };
}

describe("buildReplayDownload", () => {
    it("produces a parseable, pretty-printed JSON body with the right content type/filename", () => {
        const descriptor = createDescriptor();

        const download = buildReplayDownload(descriptor, "replay-1");

        expect(download.contentType).toBe("application/json; charset=utf-8");
        expect(download.filename).toBe("crazy-fruits-0.1.0-replay-1.json");
        expect(JSON.parse(download.body)).toEqual(descriptor);
        expect(download.body).toContain("\n");
    });

    it("sanitizes unsafe characters out of the filename", () => {
        const descriptor = createDescriptor({game: {id: "crazy fruits/2", name: "Crazy Fruits", version: "0.1.0+build"}});

        const download = buildReplayDownload(descriptor, "replay/1 two");

        expect(download.filename).toBe("crazy-fruits-2-0.1.0-build-replay-1-two.json");
    });

    it("handles a null screen without error", () => {
        const descriptor = createDescriptor({screen: null});

        const download = buildReplayDownload(descriptor, "replay-1");

        expect(JSON.parse(download.body).screen).toBeNull();
    });
});
