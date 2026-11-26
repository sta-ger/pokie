import {StudioRoundRecorder} from "../../../cli/studio/runtime/StudioRoundRecorder.js";
import type {StudioRuntimeSessionView} from "../../../cli/studio/runtime/StudioRuntimeSessionView.js";

function recordedScreen(cursor: number, roundStake: number, screenStake: number, win = 0): StudioRuntimeSessionView {
    return {
        sessionId: "session-1",
        game: {id: "game", name: "Game", version: "1.0.0"},
        credits: 1000,
        win,
        logicalRound: {
            roundId: "round-1",
            cursor,
            mathematicalCursor: cursor,
            status: cursor === 1 ? "pending" : "completed",
            totalStake: roundStake,
            totalWin: win,
            totalPayout: win,
            currentStep: {totalWin: win},
            subrounds: [{index: cursor - 1, stake: screenStake, win, payout: win}],
        },
        debug: {artifact: {stake: screenStake, totalWin: win}},
    } as unknown as StudioRuntimeSessionView;
}

describe("StudioRoundRecorder paid-round screens", () => {
    it("keeps the paid trigger and every free/cascade screen as separately inspectable entries", () => {
        const recorder = new StudioRoundRecorder();
        const paid = recordedScreen(1, 1, 1);
        const free = recordedScreen(2, 1, 0);

        recorder.record(paid, {source: "play", operation: "find-free-games"});
        recorder.record(free, {source: "play", operation: "find-free-games"});

        const entries = recorder.list();
        expect(entries).toHaveLength(2);
        expect(entries[0]?.studioRound).toBe(2);
        expect(entries[1]?.studioRound).toBe(1);
        expect(entries[0]?.logicalRound?.roundId).toBe("round-1");
        expect(entries[1]?.logicalRound?.roundId).toBe("round-1");
        expect(entries[0]?.logicalRound?.cursor).toBe(2);
        expect(entries[1]?.logicalRound?.cursor).toBe(1);
        expect(entries[0]?.debug?.artifact?.stake).toBe(0);
        expect(entries[1]?.debug?.artifact?.stake).toBe(1);
    });

    it("deduplicates only a retry of the same screen, not the next screen of the round", () => {
        const recorder = new StudioRoundRecorder();
        recorder.record(recordedScreen(1, 1, 1), {source: "play", operation: "spin"});
        recorder.record(recordedScreen(2, 1, 0), {source: "play", operation: "spin"});

        const retriedFree = recordedScreen(2, 1, 0, 5);
        recorder.record(retriedFree, {source: "play", operation: "spin"});

        const entries = recorder.list();
        expect(entries).toHaveLength(2);
        expect(entries[0]?.win).toBe(5);
        expect(entries[0]?.studioRound).toBe(2);
        expect(entries[1]?.studioRound).toBe(1);
    });
});
