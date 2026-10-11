import {PaytableSheetMapper} from "../../../src/parsheet/mapping/PaytableSheetMapper.js";
import {serializeGameBlueprint} from "../../../cli/studio/blueprint/serializeGameBlueprint.js";
import {fractionalBetBlueprint} from "../../fixtures/math/FractionalBetFixture.js";
import {AvailableBetsSheetMapper} from "../../../src/parsheet/mapping/AvailableBetsSheetMapper.js";

describe("AvailableBetsSheetMapper", () => {
    const mapper = new AvailableBetsSheetMapper();

    it("preserves authored PAR and Blueprint paytable multipliers rather than stake-scaled amounts", () => {
        const blueprint = fractionalBetBlueprint();
        const paytableMapper = new PaytableSheetMapper();
        const {value, issues} = paytableMapper.fromRows(paytableMapper.toRows(blueprint.paytable));
        expect(issues).toEqual([]);
        expect(value).toEqual({A: {3: 5}, B: {3: 2}});
        const saved = JSON.parse(serializeGameBlueprint(blueprint));
        expect(saved.paytable).toEqual(value);
        expect(saved.availableBets).toEqual([0.01]);
    });

    it("maps Bet rows to an availableBets array", () => {
        const {value, issues} = mapper.fromRows([["Bet"], [1], [2], [5]]);

        expect(issues).toEqual([]);
        expect(value).toEqual([1, 2, 5]);
    });

    it("reports a non-numeric Bet cell and drops that row", () => {
        const {value, issues} = mapper.fromRows([["Bet"], ["free"]]);

        expect(value).toEqual([]);
        expect(issues).toEqual([expect.objectContaining({code: "parsheet-availablebets-invalid-cell", severity: "error"})]);
    });

    it("reports a missing Bet column", () => {
        const {issues} = mapper.fromRows([[]]);

        expect(issues).toEqual([expect.objectContaining({code: "parsheet-missing-column", severity: "error"})]);
    });

    it("also warns about an unrecognized column alongside the missing one", () => {
        const {issues} = mapper.fromRows([["Amount"]]);

        expect(issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({code: "parsheet-unknown-column", severity: "warning"}),
                expect.objectContaining({code: "parsheet-missing-column", severity: "error"}),
            ]),
        );
    });

    it("round-trips toRows -> fromRows back to the original array", () => {
        const original = [1, 2, 5, 10, 0.01, 0.1, 1.5, 1e-7];
        const {value, issues} = mapper.fromRows(mapper.toRows(original));

        expect(issues).toEqual([]);
        expect(value).toEqual(original);
    });
});
