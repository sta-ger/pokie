import {describeRecentSpinsList, describeRuntimeScreen, extractAdditionalRoundFields} from "../../../../../../cli/studio-client/src/domain/interpret/Runtime";
import type {StudioRuntimeSessionView} from "../../../../../../cli/studio-client/src/api/types";

const session: StudioRuntimeSessionView = {
    sessionId: "session-1",
    game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
    credits: 995,
    bet: 5,
    win: 0,
    sessionVersion: 2,
};

describe("interpretRuntime", () => {
    describe("describeRuntimeScreen", () => {
        it("returns undefined for an undefined screen", () => {
            expect(describeRuntimeScreen(undefined)).toBeUndefined();
        });

        it("formats string/number/boolean/null/object cells", () => {
            const screen = [["A", 5, true], [null, undefined, {x: 1}]];

            expect(describeRuntimeScreen(screen)).toEqual([
                ["A", "5", "true"],
                ["", "", '{"x":1}'],
            ]);
        });
    });

    describe("extractAdditionalRoundFields", () => {
        it("omits every known structural field, keeping nothing when there's nothing extra", () => {
            expect(extractAdditionalRoundFields(session)).toEqual({});
        });

        it("passes through whatever extra public fields the game's own serializer returned", () => {
            const rich: StudioRuntimeSessionView = {...session, remainingFreeSpins: 3, paytable: {cherry: 5}};

            expect(extractAdditionalRoundFields(rich)).toEqual({remainingFreeSpins: 3, paytable: {cherry: 5}});
        });

        it("never leaks the known fields (including debug, studioRequestId, and the recent-spin identity bookkeeping) even when present", () => {
            const withDebug: StudioRuntimeSessionView = {
                ...session,
                studioRequestId: "req-1",
                studioRound: 3,
                studioRecordedAt: "2026-07-29T00:00:00.000Z",
                studioSource: "play",
                debug: {stateAfter: {}, requestId: "req-1"},
                bonusRoundActive: true,
            };

            const extra = extractAdditionalRoundFields(withDebug);

            expect(extra).toEqual({bonusRoundActive: true});
            expect(extra).not.toHaveProperty("debug");
            expect(extra).not.toHaveProperty("studioRequestId");
            expect(extra).not.toHaveProperty("studioRound");
            expect(extra).not.toHaveProperty("studioRecordedAt");
            expect(extra).not.toHaveProperty("studioSource");
            expect(extra).not.toHaveProperty("sessionId");
            expect(extra).not.toHaveProperty("game");
            expect(extra).not.toHaveProperty("credits");
            expect(extra).not.toHaveProperty("bet");
            expect(extra).not.toHaveProperty("win");
            expect(extra).not.toHaveProperty("screen");
            expect(extra).not.toHaveProperty("sessionVersion");
        });
    });

    describe("describeRecentSpinsList", () => {
        it("reports empty for no entries", () => {
            expect(describeRecentSpinsList([])).toEqual({status: "empty"});
        });

        it("wraps a non-empty list as loaded, unchanged", () => {
            const entries = [session, {...session, sessionId: "session-2"}];

            expect(describeRecentSpinsList(entries)).toEqual({status: "loaded", entries});
        });
    });
});
