import {BetModesSheetMapper} from "../../../src/parsheet/mapping/BetModesSheetMapper.js";

const COLUMNS = ["Id", "Label", "Cost Multiplier", "Runtime Type", "Is Default", "Forced Free Games"];

describe("BetModesSheetMapper", () => {
    const mapper = new BetModesSheetMapper();

    it("maps rows to bet modes with labels and cost multipliers", () => {
        const {value, issues} = mapper.fromRows([
            COLUMNS,
            ["base", "Base Game", "", "", "", ""],
            ["buy-bonus", "Buy Bonus", 100, "", "", ""],
        ]);

        expect(issues).toEqual([]);
        expect(value).toEqual([
            {id: "base", label: "Base Game"},
            {id: "buy-bonus", label: "Buy Bonus", costMultiplier: 100},
        ]);
    });

    it("omits Label/Cost Multiplier when their cells are blank", () => {
        const {value, issues} = mapper.fromRows([COLUMNS, ["base", "", "", "", "", ""]]);

        expect(issues).toEqual([]);
        expect(value).toEqual([{id: "base"}]);
    });

    it("reports a blank Id cell and drops that row", () => {
        const {value, issues} = mapper.fromRows([COLUMNS, ["", "Base Game", "", "", "", ""]]);

        expect(value).toEqual([]);
        expect(issues).toEqual([expect.objectContaining({code: "parsheet-betmodes-missing-id", severity: "error"})]);
    });

    it("reports a non-numeric Cost Multiplier cell and drops that row", () => {
        const {value, issues} = mapper.fromRows([COLUMNS, ["buy-bonus", "Buy Bonus", "lots", "", "", ""]]);

        expect(value).toEqual([]);
        expect(issues).toEqual([expect.objectContaining({code: "parsheet-betmodes-invalid-cost-multiplier-cell", severity: "error"})]);
    });

    it("reports a missing column", () => {
        const {issues} = mapper.fromRows([["Id"]]);

        expect(issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({code: "parsheet-missing-column", severity: "error", details: {sheet: "BetModes", column: "Label"}}),
                expect.objectContaining({code: "parsheet-missing-column", severity: "error", details: {sheet: "BetModes", column: "Cost Multiplier"}}),
                expect.objectContaining({code: "parsheet-missing-column", severity: "error", details: {sheet: "BetModes", column: "Runtime Type"}}),
                expect.objectContaining({code: "parsheet-missing-column", severity: "error", details: {sheet: "BetModes", column: "Is Default"}}),
                expect.objectContaining({
                    code: "parsheet-missing-column",
                    severity: "error",
                    details: {sheet: "BetModes", column: "Forced Free Games"},
                }),
            ]),
        );
    });

    it("round-trips toRows -> fromRows back to the original bet modes (pure metadata shape)", () => {
        const original = [
            {id: "base", label: "Base Game"},
            {id: "buy-bonus", label: "Buy Bonus", costMultiplier: 100},
            {id: "ante", costMultiplier: 1.25},
        ];

        const {value, issues} = mapper.fromRows(mapper.toRows(original));

        expect(issues).toEqual([]);
        expect(value).toEqual(original);
    });

    describe("explicit runtime-semantics columns (Runtime Type / Is Default / Forced Free Games)", () => {
        it("maps a persistent ante mode and a base default", () => {
            const {value, issues} = mapper.fromRows([
                COLUMNS,
                ["base", "Base", "", "base", true, ""],
                ["ante", "Ante Bet", 1.25, "ante", "", ""],
            ]);

            expect(issues).toEqual([]);
            expect(value).toEqual([
                {id: "base", label: "Base", runtimeType: "base", isDefault: true},
                {id: "ante", label: "Ante Bet", costMultiplier: 1.25, runtimeType: "ante"},
            ]);
        });

        it("maps a one-shot buyFeature mode with its forced free games count", () => {
            const {value, issues} = mapper.fromRows([
                COLUMNS,
                ["buy-bonus", "Buy Bonus", 100, "buyFeature", "", 10],
            ]);

            expect(issues).toEqual([]);
            expect(value).toEqual([{id: "buy-bonus", label: "Buy Bonus", costMultiplier: 100, runtimeType: "buyFeature", forcedFreeGames: 10}]);
        });

        it("reports an unrecognized Runtime Type cell and drops that row", () => {
            const {value, issues} = mapper.fromRows([COLUMNS, ["base", "", "", "bogus", "", ""]]);

            expect(value).toEqual([]);
            expect(issues).toEqual([expect.objectContaining({code: "parsheet-betmodes-invalid-runtimetype-cell", severity: "error"})]);
        });

        it("reports an unrecognizable Is Default cell and drops that row", () => {
            const {value, issues} = mapper.fromRows([COLUMNS, ["base", "", "", "base", "maybe", ""]]);

            expect(value).toEqual([]);
            expect(issues).toEqual([expect.objectContaining({code: "parsheet-betmodes-invalid-isdefault-cell", severity: "error"})]);
        });

        it("reports a non-numeric Forced Free Games cell and drops that row", () => {
            const {value, issues} = mapper.fromRows([COLUMNS, ["buy-bonus", "", 100, "buyFeature", "", "lots"]]);

            expect(value).toEqual([]);
            expect(issues).toEqual([expect.objectContaining({code: "parsheet-betmodes-invalid-forcedfreegames-cell", severity: "error"})]);
        });

        it("round-trips toRows -> fromRows back to the original bet modes, including the full runtime-semantics contract", () => {
            const original = [
                {id: "base", label: "Base", runtimeType: "base" as const, isDefault: true},
                {id: "ante", label: "Ante Bet", costMultiplier: 1.25, runtimeType: "ante" as const},
                {id: "buy-bonus", label: "Buy Bonus", costMultiplier: 100, runtimeType: "buyFeature" as const, forcedFreeGames: 10},
            ];

            const {value, issues} = mapper.fromRows(mapper.toRows(original));

            expect(issues).toEqual([]);
            expect(value).toEqual(original);
        });
    });
});
