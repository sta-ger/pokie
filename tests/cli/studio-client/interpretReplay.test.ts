import {describeReplayList, describeReplayResult} from "../../../cli/studio-client/interpretReplay.js";
import type {ReplayDescriptor, StudioReplayListEntry, StudioReplayRecordView} from "../../../cli/studio-client/types.js";

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

function createRecord(overrides: Partial<StudioReplayRecordView> = {}): StudioReplayRecordView {
    return {
        id: "replay-1",
        projectRoot: "/projects/crazy-fruits",
        descriptor: createDescriptor(),
        ...overrides,
    };
}

function createListEntry(overrides: Partial<StudioReplayListEntry> = {}): StudioReplayListEntry {
    return {
        id: "replay-1",
        game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
        round: 42,
        seed: "demo",
        totalBet: 420,
        totalWin: 100,
        timestamp: 1735707845000,
        durationMs: 5,
        ...overrides,
    };
}

describe("describeReplayResult", () => {
    it("flattens the descriptor's fields alongside the replay id", () => {
        const record = createRecord();

        expect(describeReplayResult(record)).toEqual({
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

    it("leaves screen undefined when the descriptor's screen is null", () => {
        const record = createRecord({descriptor: createDescriptor({screen: null})});

        expect(describeReplayResult(record).screen).toBeUndefined();
    });

    it("stringifies non-string screen cells", () => {
        const record = createRecord({
            descriptor: createDescriptor({
                screen: [[{symbol: "wild"}, 7, true, null]],
            }),
        });

        expect(describeReplayResult(record).screen).toEqual([['{"symbol":"wild"}', "7", "true", ""]]);
    });

    it("preserves a null seed", () => {
        const record = createRecord({descriptor: createDescriptor({seed: null})});

        expect(describeReplayResult(record).seed).toBeNull();
    });
});

describe("describeReplayList", () => {
    it("reports empty for no entries", () => {
        expect(describeReplayList([])).toEqual({status: "empty"});
    });

    it("wraps a non-empty list as loaded, unchanged", () => {
        const entries = [createListEntry({id: "replay-1"}), createListEntry({id: "replay-2"})];

        expect(describeReplayList(entries)).toEqual({status: "loaded", entries});
    });
});
