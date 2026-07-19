import {MechanicsSheetMapper} from "../../../src/parsheet/mapping/MechanicsSheetMapper.js";

describe("MechanicsSheetMapper", () => {
    const mapper = new MechanicsSheetMapper();

    it("maps rows to a freeGames award", () => {
        const {value, issues} = mapper.fromRows([
            ["Scatter Symbol", "Matches", "Free Games"],
            ["S", 3, 8],
            ["S", 4, 15],
            ["S", 5, 25],
        ]);

        expect(issues).toEqual([]);
        expect(value).toEqual({scatterSymbol: "S", awardsByCount: {"3": 8, "4": 15, "5": 25}});
    });

    it("returns undefined when there are no data rows", () => {
        const {value, issues} = mapper.fromRows([["Scatter Symbol", "Matches", "Free Games"]]);

        expect(value).toBeUndefined();
        expect(issues).toEqual([]);
    });

    it("reports a blank Scatter Symbol cell and drops that row", () => {
        const {value, issues} = mapper.fromRows([
            ["Scatter Symbol", "Matches", "Free Games"],
            ["", 3, 8],
        ]);

        expect(value).toBeUndefined();
        expect(issues).toEqual([expect.objectContaining({code: "parsheet-mechanics-missing-scatter", severity: "error"})]);
    });

    it("reports a non-numeric Matches cell and drops that row", () => {
        const {value, issues} = mapper.fromRows([
            ["Scatter Symbol", "Matches", "Free Games"],
            ["S", "three", 8],
        ]);

        expect(value).toEqual({scatterSymbol: "S", awardsByCount: {}});
        expect(issues).toEqual([expect.objectContaining({code: "parsheet-mechanics-invalid-matches-cell", severity: "error"})]);
    });

    it("reports a non-numeric Free Games cell and drops that row", () => {
        const {value, issues} = mapper.fromRows([
            ["Scatter Symbol", "Matches", "Free Games"],
            ["S", 3, "lots"],
        ]);

        expect(value).toEqual({scatterSymbol: "S", awardsByCount: {}});
        expect(issues).toEqual([expect.objectContaining({code: "parsheet-mechanics-invalid-freegames-cell", severity: "error"})]);
    });

    it("warns about a duplicate match-count entry, keeping the last one", () => {
        const {value, issues} = mapper.fromRows([
            ["Scatter Symbol", "Matches", "Free Games"],
            ["S", 3, 8],
            ["S", 3, 10],
        ]);

        expect(value).toEqual({scatterSymbol: "S", awardsByCount: {"3": 10}});
        expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({code: "parsheet-mechanics-duplicate-entry", severity: "warning"})]));
    });

    // A single freeGames award has exactly one scatterSymbol -- a sheet hand-edited (or otherwise
    // produced) to reference two different symbols can't become one GameBlueprintFreeGames at all, so
    // this must be an explicit, non-silent rejection rather than quietly keeping only the first symbol's
    // rows without saying so.
    it("explicitly rejects rows that disagree on which scatter symbol they're for, instead of silently picking one", () => {
        const {value, issues} = mapper.fromRows([
            ["Scatter Symbol", "Matches", "Free Games"],
            ["S", 3, 8],
            ["B", 3, 8],
        ]);

        expect(value).toEqual({scatterSymbol: "S", awardsByCount: {"3": 8}});
        expect(issues).toEqual([
            expect.objectContaining({
                code: "parsheet-mechanics-multiple-scatter-symbols",
                severity: "error",
                details: expect.objectContaining({kept: "S", ignored: "B"}),
            }),
        ]);
    });

    it("reports a missing column", () => {
        const {issues} = mapper.fromRows([["Scatter Symbol"]]);

        expect(issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({code: "parsheet-missing-column", severity: "error", details: {sheet: "Mechanics", column: "Matches"}}),
                expect.objectContaining({code: "parsheet-missing-column", severity: "error", details: {sheet: "Mechanics", column: "Free Games"}}),
            ]),
        );
    });

    it("round-trips toRows -> fromRows back to the original freeGames award", () => {
        const original = {scatterSymbol: "S", awardsByCount: {"3": 8, "4": 15, "5": 25}};

        const {value, issues} = mapper.fromRows(mapper.toRows(original));

        expect(issues).toEqual([]);
        expect(value).toEqual(original);
    });
});
