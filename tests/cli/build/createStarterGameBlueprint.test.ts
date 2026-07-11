import {GameBlueprintValidator} from "pokie";
import {createStarterGameBlueprint} from "../../../cli/build/createStarterGameBlueprint.js";

describe("createStarterGameBlueprint", () => {
    it("passes the real GameBlueprintValidator with no errors or warnings", () => {
        const issues = new GameBlueprintValidator().validate(createStarterGameBlueprint());

        expect(issues).toEqual([]);
    });

    it("includes every field a first hand-edit needs: manifest, reels/rows, symbols, bets, paylines, paytable, and reel weighting", () => {
        const blueprint = createStarterGameBlueprint();

        expect(blueprint.manifest).toEqual({id: "starter-slot", name: "Starter Slot", version: "0.1.0"});
        expect(blueprint.reels).toBeGreaterThan(0);
        expect(blueprint.rows).toBeGreaterThan(0);
        expect(blueprint.symbols.length).toBeGreaterThan(0);
        expect(blueprint.availableBets?.length).toBeGreaterThan(0);
        expect(blueprint.paylines?.length).toBeGreaterThan(0);
        expect(Object.keys(blueprint.paytable).length).toBe(blueprint.symbols.length);
        expect(Object.keys(blueprint.symbolWeights ?? {}).length).toBe(blueprint.symbols.length);
    });

    it("returns a fresh object on every call, so a caller can't accidentally mutate a shared template", () => {
        const first = createStarterGameBlueprint();
        first.symbols.push("mutated");

        const second = createStarterGameBlueprint();

        expect(second.symbols).not.toContain("mutated");
    });
});
