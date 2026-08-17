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
});
