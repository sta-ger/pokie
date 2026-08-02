import {GameBlueprintValidator} from "pokie";
import {createBlankGameBlueprint} from "../../../cli/build/createBlankGameBlueprint.js";

describe("createBlankGameBlueprint", () => {
    it("passes the real GameBlueprintValidator with no errors or warnings", () => {
        const issues = new GameBlueprintValidator().validate(createBlankGameBlueprint());

        expect(issues).toEqual([]);
    });

    it("is smaller than the starter template: no paylines/symbolWeights/availableBets, one payout per symbol", () => {
        const blueprint = createBlankGameBlueprint();

        expect(blueprint.paylines).toBeUndefined();
        expect(blueprint.symbolWeights).toBeUndefined();
        expect(blueprint.availableBets).toBeUndefined();
        for (const payouts of Object.values(blueprint.paytable)) {
            expect(Object.keys(payouts)).toHaveLength(1);
        }
    });

    it("returns a fresh object on every call, so a caller can't accidentally mutate a shared template", () => {
        const first = createBlankGameBlueprint();
        first.symbols.push("mutated");

        const second = createBlankGameBlueprint();

        expect(second.symbols).not.toContain("mutated");
    });
});
