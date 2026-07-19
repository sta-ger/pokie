import {BetModesSheetMapper} from "../../../src/parsheet/mapping/BetModesSheetMapper.js";

describe("BetModesSheetMapper", () => {
    const mapper = new BetModesSheetMapper();

    it("maps rows to bet modes with labels and cost multipliers", () => {
        const {value, issues} = mapper.fromRows([
            ["Id", "Label", "Cost Multiplier"],
            ["base", "Base Game", ""],
            ["buy-bonus", "Buy Bonus", 100],
        ]);

        expect(issues).toEqual([]);
        expect(value).toEqual([
            {id: "base", label: "Base Game"},
            {id: "buy-bonus", label: "Buy Bonus", costMultiplier: 100},
        ]);
    });

    it("omits Label/Cost Multiplier when their cells are blank", () => {
        const {value, issues} = mapper.fromRows([
            ["Id", "Label", "Cost Multiplier"],
            ["base", "", ""],
        ]);

        expect(issues).toEqual([]);
        expect(value).toEqual([{id: "base"}]);
    });

    it("reports a blank Id cell and drops that row", () => {
        const {value, issues} = mapper.fromRows([
            ["Id", "Label", "Cost Multiplier"],
            ["", "Base Game", ""],
        ]);

        expect(value).toEqual([]);
        expect(issues).toEqual([expect.objectContaining({code: "parsheet-betmodes-missing-id", severity: "error"})]);
    });

    it("reports a non-numeric Cost Multiplier cell and drops that row", () => {
        const {value, issues} = mapper.fromRows([
            ["Id", "Label", "Cost Multiplier"],
            ["buy-bonus", "Buy Bonus", "lots"],
        ]);

        expect(value).toEqual([]);
        expect(issues).toEqual([expect.objectContaining({code: "parsheet-betmodes-invalid-cost-multiplier-cell", severity: "error"})]);
    });

    it("reports a missing column", () => {
        const {issues} = mapper.fromRows([["Id"]]);

        expect(issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({code: "parsheet-missing-column", severity: "error", details: {sheet: "BetModes", column: "Label"}}),
                expect.objectContaining({code: "parsheet-missing-column", severity: "error", details: {sheet: "BetModes", column: "Cost Multiplier"}}),
            ]),
        );
    });

    it("round-trips toRows -> fromRows back to the original bet modes", () => {
        const original = [
            {id: "base", label: "Base Game"},
            {id: "buy-bonus", label: "Buy Bonus", costMultiplier: 100},
            {id: "ante", costMultiplier: 1.25},
        ];

        const {value, issues} = mapper.fromRows(mapper.toRows(original));

        expect(issues).toEqual([]);
        expect(value).toEqual(original);
    });
});
