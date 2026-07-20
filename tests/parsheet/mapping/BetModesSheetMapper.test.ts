import {BetModesSheetMapper} from "../../../src/parsheet/mapping/BetModesSheetMapper.js";

const COLUMNS = ["Id", "Label", "Cost Multiplier", "Target RTP", "Runtime Type", "Is Default", "Forced Free Games"];

describe("BetModesSheetMapper", () => {
    const mapper = new BetModesSheetMapper();

    it("maps rows to bet modes with labels and cost multipliers", () => {
        const {value, issues} = mapper.fromRows([
            COLUMNS,
            ["base", "Base Game", "", "", "", "", ""],
            ["buy-bonus", "Buy Bonus", 100, "", "", "", ""],
        ]);

        expect(issues).toEqual([]);
        expect(value).toEqual([
            {id: "base", label: "Base Game"},
            {id: "buy-bonus", label: "Buy Bonus", costMultiplier: 100},
        ]);
    });

    it("omits Label/Cost Multiplier/Target RTP when their cells are blank", () => {
        const {value, issues} = mapper.fromRows([COLUMNS, ["base", "", "", "", "", "", ""]]);

        expect(issues).toEqual([]);
        expect(value).toEqual([{id: "base"}]);
    });

    it("reports a blank Id cell and drops that row", () => {
        const {value, issues} = mapper.fromRows([COLUMNS, ["", "Base Game", "", "", "", "", ""]]);

        expect(value).toEqual([]);
        expect(issues).toEqual([expect.objectContaining({code: "parsheet-betmodes-missing-id", severity: "error"})]);
    });

    it("reports a non-numeric Cost Multiplier cell and drops that row", () => {
        const {value, issues} = mapper.fromRows([COLUMNS, ["buy-bonus", "Buy Bonus", "lots", "", "", "", ""]]);

        expect(value).toEqual([]);
        expect(issues).toEqual([expect.objectContaining({code: "parsheet-betmodes-invalid-cost-multiplier-cell", severity: "error"})]);
    });

    it("reports a missing column", () => {
        const {issues} = mapper.fromRows([["Id"]]);

        expect(issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({code: "parsheet-missing-column", severity: "error", details: {sheet: "BetModes", column: "Label"}}),
                expect.objectContaining({code: "parsheet-missing-column", severity: "error", details: {sheet: "BetModes", column: "Cost Multiplier"}}),
                expect.objectContaining({code: "parsheet-missing-column", severity: "error", details: {sheet: "BetModes", column: "Target RTP"}}),
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

    describe("Target RTP", () => {
        it("maps a Target RTP cell onto the bet mode, independently of the runtime-semantics opt-in", () => {
            const {value, issues} = mapper.fromRows([
                COLUMNS,
                ["base", "Base", "", 0.94, "", "", ""],
                ["ante", "Ante Bet", 1.25, 0.965, "", "", ""],
            ]);

            expect(issues).toEqual([]);
            expect(value).toEqual([
                {id: "base", label: "Base", targetRtp: 0.94},
                {id: "ante", label: "Ante Bet", costMultiplier: 1.25, targetRtp: 0.965},
            ]);
        });

        it("reports a non-numeric Target RTP cell and drops that row, rather than silently coercing or ignoring it", () => {
            const {value, issues} = mapper.fromRows([COLUMNS, ["buy-bonus", "Buy Bonus", 100, "very high", "", "", ""]]);

            expect(value).toEqual([]);
            expect(issues).toEqual([
                expect.objectContaining({
                    code: "parsheet-betmodes-invalid-targetrtp-cell",
                    severity: "error",
                    details: {sheet: "BetModes", row: 2, id: "buy-bonus"},
                }),
            ]);
        });

        it("round-trips toRows -> fromRows preserving targetRtp, alongside the pure metadata shape", () => {
            const original = [
                {id: "base", label: "Base Game", targetRtp: 0.94},
                {id: "buy-bonus", label: "Buy Bonus", costMultiplier: 100, targetRtp: 0.9},
                {id: "ante", costMultiplier: 1.25}, // no targetRtp declared -- must stay absent, not 0/null
            ];

            const {value, issues} = mapper.fromRows(mapper.toRows(original));

            expect(issues).toEqual([]);
            expect(value).toEqual(original);
        });
    });

    describe("explicit runtime-semantics columns (Runtime Type / Is Default / Forced Free Games)", () => {
        it("maps a persistent ante mode and a base default", () => {
            const {value, issues} = mapper.fromRows([
                COLUMNS,
                ["base", "Base", "", "", "base", true, ""],
                ["ante", "Ante Bet", 1.25, "", "ante", "", ""],
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
                ["buy-bonus", "Buy Bonus", 100, "", "buyFeature", "", 10],
            ]);

            expect(issues).toEqual([]);
            expect(value).toEqual([{id: "buy-bonus", label: "Buy Bonus", costMultiplier: 100, runtimeType: "buyFeature", forcedFreeGames: 10}]);
        });

        it("maps a fully-determined mode carrying both targetRtp and the runtime-semantics contract together", () => {
            const {value, issues} = mapper.fromRows([
                COLUMNS,
                ["buy-bonus", "Buy Bonus", 100, 0.9, "buyFeature", "", 10],
            ]);

            expect(issues).toEqual([]);
            expect(value).toEqual([
                {id: "buy-bonus", label: "Buy Bonus", costMultiplier: 100, targetRtp: 0.9, runtimeType: "buyFeature", forcedFreeGames: 10},
            ]);
        });

        it("reports an unrecognized Runtime Type cell and drops that row", () => {
            const {value, issues} = mapper.fromRows([COLUMNS, ["base", "", "", "", "bogus", "", ""]]);

            expect(value).toEqual([]);
            expect(issues).toEqual([expect.objectContaining({code: "parsheet-betmodes-invalid-runtimetype-cell", severity: "error"})]);
        });

        it("reports an unrecognizable Is Default cell and drops that row", () => {
            const {value, issues} = mapper.fromRows([COLUMNS, ["base", "", "", "", "base", "maybe", ""]]);

            expect(value).toEqual([]);
            expect(issues).toEqual([expect.objectContaining({code: "parsheet-betmodes-invalid-isdefault-cell", severity: "error"})]);
        });

        it("reports a non-numeric Forced Free Games cell and drops that row", () => {
            const {value, issues} = mapper.fromRows([COLUMNS, ["buy-bonus", "", 100, "", "buyFeature", "", "lots"]]);

            expect(value).toEqual([]);
            expect(issues).toEqual([expect.objectContaining({code: "parsheet-betmodes-invalid-forcedfreegames-cell", severity: "error"})]);
        });

        it("round-trips toRows -> fromRows back to the original bet modes, including the full runtime-semantics contract and targetRtp", () => {
            const original = [
                {id: "base", label: "Base", runtimeType: "base" as const, isDefault: true, targetRtp: 0.94},
                {id: "ante", label: "Ante Bet", costMultiplier: 1.25, runtimeType: "ante" as const},
                {id: "buy-bonus", label: "Buy Bonus", costMultiplier: 100, runtimeType: "buyFeature" as const, forcedFreeGames: 10, targetRtp: 0.9},
            ];

            const {value, issues} = mapper.fromRows(mapper.toRows(original));

            expect(issues).toEqual([]);
            expect(value).toEqual(original);
        });
    });
});
