import {
    describeReplayList,
    describeReplayProgress,
    describeReplayResult,
    isReplayActive,
    isReplayTerminal,
} from "../../../cli/studio-client/interpretReplay.js";
import type {ReplayDescriptor, StudioReplayJobView, StudioReplayListEntry} from "../../../cli/studio-client/types.js";

function createDescriptor(overrides: Partial<ReplayDescriptor> = {}): ReplayDescriptor {
    return {
        game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
        seed: "demo",
        round: 42,
        totalBet: 420,
        totalWin: 100,
        screen: [
            ["cherry", "lemon"],
            ["bell", "seven"],
        ],
        timestamp: 1735707845000,
        durationMs: 5,
        ...overrides,
    };
}

function createJob(overrides: Partial<StudioReplayJobView> = {}): StudioReplayJobView {
    return {
        id: "replay-1",
        status: "queued",
        round: 42,
        seed: "demo",
        startedAt: "2026-01-01T00:00:00.000Z",
        completedRounds: 0,
        durationMs: 0,
        ...overrides,
    };
}

function createListEntry(overrides: Partial<StudioReplayListEntry> = {}): StudioReplayListEntry {
    return {
        id: "replay-1",
        status: "completed",
        game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
        round: 42,
        seed: "demo",
        completedRounds: 42,
        totalBet: 420,
        totalWin: 100,
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:01.000Z",
        durationMs: 5,
        ...overrides,
    };
}

describe("describeReplayProgress", () => {
    it("computes a percent from completedRounds/round", () => {
        const job = createJob({status: "running", completedRounds: 21, round: 42, durationMs: 10});

        expect(describeReplayProgress(job)).toEqual({
            status: "running",
            completedRounds: 21,
            round: 42,
            percent: 50,
            durationMs: 10,
            error: undefined,
        });
    });

    it("caps percent at 100", () => {
        const job = createJob({status: "completed", completedRounds: 42, round: 42});

        expect(describeReplayProgress(job).percent).toBe(100);
    });

    it("reports 0 percent when round is 0", () => {
        const job = createJob({round: 0, completedRounds: 0});

        expect(describeReplayProgress(job).percent).toBe(0);
    });

    it("carries the job's own safe error message for a failed replay", () => {
        const job = createJob({status: "failed", error: "boom"});

        expect(describeReplayProgress(job).error).toBe("boom");
    });
});

describe("isReplayActive / isReplayTerminal", () => {
    it("treats queued/running as active, not terminal", () => {
        expect(isReplayActive(createJob({status: "queued"}))).toBe(true);
        expect(isReplayActive(createJob({status: "running"}))).toBe(true);
        expect(isReplayTerminal(createJob({status: "queued"}))).toBe(false);
        expect(isReplayTerminal(createJob({status: "running"}))).toBe(false);
    });

    it("treats completed/failed/cancelled as terminal, not active", () => {
        for (const status of ["completed", "failed", "cancelled"] as const) {
            expect(isReplayTerminal(createJob({status}))).toBe(true);
            expect(isReplayActive(createJob({status}))).toBe(false);
        }
    });
});

describe("describeReplayResult", () => {
    it("flattens the descriptor's fields alongside the replay id", () => {
        const job = createJob({status: "completed", descriptor: createDescriptor()});

        expect(describeReplayResult(job)).toEqual({
            id: "replay-1",
            game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
            round: 42,
            seed: "demo",
            totalBet: 420,
            totalWin: 100,
            screen: [
                ["cherry", "lemon"],
                ["bell", "seven"],
            ],
            timestamp: 1735707845000,
            durationMs: 5,
        });
    });

    it("returns undefined when the job has no descriptor yet (queued/running/failed/cancelled)", () => {
        expect(describeReplayResult(createJob({status: "running"}))).toBeUndefined();
        expect(describeReplayResult(createJob({status: "failed", error: "boom"}))).toBeUndefined();
    });

    it("leaves screen undefined when the descriptor's screen is null", () => {
        const job = createJob({status: "completed", descriptor: createDescriptor({screen: null})});

        expect(describeReplayResult(job)?.screen).toBeUndefined();
    });

    it("stringifies non-string screen cells", () => {
        const job = createJob({
            status: "completed",
            descriptor: createDescriptor({screen: [[{symbol: "wild"}, 7, true, null]]}),
        });

        expect(describeReplayResult(job)?.screen).toEqual([['{"symbol":"wild"}', "7", "true", ""]]);
    });

    it("preserves a null seed", () => {
        const job = createJob({status: "completed", descriptor: createDescriptor({seed: null})});

        expect(describeReplayResult(job)?.seed).toBeNull();
    });
});

describe("describeReplayList", () => {
    it("reports empty for no entries", () => {
        expect(describeReplayList([])).toEqual({status: "empty"});
    });

    it("wraps a non-empty list as loaded, unchanged", () => {
        const entries = [createListEntry({id: "replay-1"}), createListEntry({id: "replay-2", status: "running"})];

        expect(describeReplayList(entries)).toEqual({status: "loaded", entries});
    });
});
