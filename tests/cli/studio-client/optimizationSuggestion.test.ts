import {suggestNextTunableValue} from "../../../cli/studio-client/src/domain/optimizationSuggestion.js";

describe("suggestNextTunableValue", () => {
    it("suggests the integer payout that reaches the target by linear interpolation", () => {
        const evaluations = [
            {parameters: {"/paytable/A/3": 6}, measured: [0.79102]},
            {parameters: {"/paytable/A/3": 7}, measured: [0.81551]},
            {parameters: {"/paytable/A/3": 8}, measured: [0.84]},
            {parameters: {"/paytable/A/3": 9}, measured: [0.86449]},
            {parameters: {"/paytable/A/3": 10}, measured: [0.88898]},
        ];
        expect(suggestNextTunableValue("/paytable/A/3", 0.96, evaluations)).toEqual({value: 13, integer: true});
    });

    it("keeps a decimal value when the evaluated candidates are decimals", () => {
        const evaluations = [
            {parameters: {"/paytable/A/3": 8.5}, measured: [0.9]},
            {parameters: {"/paytable/A/3": 9.5}, measured: [0.94]},
        ];
        expect(suggestNextTunableValue("/paytable/A/3", 0.96, evaluations)).toEqual({value: 10, integer: false});
        const decimal = suggestNextTunableValue("/paytable/A/3", 0.96, [
            {parameters: {"/paytable/A/3": 8.5}, measured: [0.9]},
            {parameters: {"/paytable/A/3": 8.75}, measured: [0.94]},
        ]);
        expect(decimal).toEqual({value: 8.88, integer: false});
    });

    it("suggests the reachable decimal payout when the nearest integer was already evaluated", () => {
        const evaluations = [
            {parameters: {"/paytable/A/3": 7}, measured: [0.936893]},
            {parameters: {"/paytable/A/3": 8}, measured: [0.960567]},
        ];
        expect(suggestNextTunableValue("/paytable/A/3", 0.95, evaluations)).toEqual({value: 7.55, integer: false});
    });

    it("keeps integer-only fields integer-only when the rounded value was already evaluated", () => {
        const evaluations = [
            {parameters: {"/mechanics/freeGames/awards/3": 7}, measured: [0.936893]},
            {parameters: {"/mechanics/freeGames/awards/3": 8}, measured: [0.960567]},
        ];
        expect(suggestNextTunableValue("/mechanics/freeGames/awards/3", 0.95, evaluations)).toBeUndefined();
    });

    it("does not suggest a value that was already evaluated or has no usable slope", () => {
        const evaluations = [
            {parameters: {"/paytable/A/3": 8}, measured: [0.84]},
            {parameters: {"/paytable/A/3": 9}, measured: [0.84]},
        ];
        expect(suggestNextTunableValue("/paytable/A/3", 0.96, evaluations)).toBeUndefined();
    });
});
