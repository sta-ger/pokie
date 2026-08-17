import {describeRoundPresentation} from "../../../../../../cli/studio-client/src/components/common/roundPresentation";

describe("describeRoundPresentation", () => {
    it("uses the captured session's static player data for the inspected round instead of reconstructing it from wins", () => {
        const presentation = describeRoundPresentation(
            {
                initialPayload: {
                    bet: 1,
                    availableBets: [1, 2],
                    availableBetModeIds: ["base", "bonus"],
                    paytable: {
                        1: {A: {3: 5}, B: {3: 3}},
                        2: {A: {3: 10}, B: {3: 6}},
                    },
                },
            },
            {bet: 2, roundPayload: {betModeId: "bonus", freeGamesNum: 4}},
        );

        expect(presentation.paytable).toEqual({
            multipliers: [3],
            rows: [
                {symbolId: "A", amounts: [5]},
                {symbolId: "B", amounts: [3]},
            ],
        });
        expect(presentation.availableBets).toEqual([1, 2]);
        expect(presentation.currentBet).toBe(2);
        expect(presentation.availableModeIds).toEqual(["base", "bonus"]);
        expect(presentation.currentModeId).toBe("bonus");
        expect(presentation.featureCounters).toEqual([{label: "FG num", value: 4}]);
    });

    it("keeps an artifact-only import honest when no captured session data is available", () => {
        expect(describeRoundPresentation(undefined, undefined)).toEqual({});
    });

    it("reads the saved Studio Play capture's immutable initial payload", () => {
        // This is the same shape Studio sends to Play after a real spin; static player data lives in
        // the captured session state rather than being reconstructed from the round artifact.
        const stateAfter = {
            initialPayload: {
                availableBets: [1, 5],
                availableBetModeIds: ["base", "buy-feature"],
                paytable: {1: {A: {3: 5}}},
            },
        };
        expect(describeRoundPresentation(undefined, stateAfter, "buy-feature")).toMatchObject({
            availableBets: [1, 5],
            availableModeIds: ["base", "buy-feature"],
            currentModeId: "buy-feature",
            paytable: {rows: [{symbolId: "A", amounts: [5]}]},
        });
    });
});
