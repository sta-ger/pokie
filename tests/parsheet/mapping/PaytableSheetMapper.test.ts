import {PaytableSheetMapper} from "../../../src/parsheet/mapping/PaytableSheetMapper.js";

describe("PaytableSheetMapper", () => {
    const mapper = new PaytableSheetMapper();

    it("maps Symbol/Matches/Multiplier rows to a paytable object", () => {
        const {value, issues} = mapper.fromRows([
            ["Symbol", "Matches", "Multiplier"],
            ["A", 3, 10],
            ["A", 4, 20],
            ["K", 3, 5],
        ]);

        expect(issues).toEqual([]);
        expect(value).toEqual({A: {"3": 10, "4": 20}, K: {"3": 5}});
    });

    it("reports a blank Symbol cell and drops that row", () => {
        const {value, issues} = mapper.fromRows([
            ["Symbol", "Matches", "Multiplier"],
            ["", 3, 10],
        ]);

        expect(value).toEqual({});
        expect(issues).toEqual([expect.objectContaining({code: "parsheet-paytable-missing-symbol", severity: "error"})]);
    });

    it("reports a non-numeric Matches cell and drops that row", () => {
        const {value, issues} = mapper.fromRows([
            ["Symbol", "Matches", "Multiplier"],
            ["A", "three", 10],
        ]);

        expect(value).toEqual({});
        expect(issues).toEqual([expect.objectContaining({code: "parsheet-paytable-invalid-matches-cell", severity: "error"})]);
    });

    it("reports a non-numeric Multiplier cell and drops that row", () => {
        const {value, issues} = mapper.fromRows([
            ["Symbol", "Matches", "Multiplier"],
            ["A", 3, "lots"],
        ]);

        expect(value).toEqual({});
        expect(issues).toEqual([expect.objectContaining({code: "parsheet-paytable-invalid-multiplier-cell", severity: "error"})]);
    });

    it("warns on a duplicate (Symbol, Matches) pair and keeps the last multiplier", () => {
        const {value, issues} = mapper.fromRows([
            ["Symbol", "Matches", "Multiplier"],
            ["A", 3, 10],
            ["A", 3, 99],
        ]);

        expect(value).toEqual({A: {"3": 99}});
        expect(issues).toEqual([expect.objectContaining({code: "parsheet-paytable-duplicate-entry", severity: "warning"})]);
    });

    it("round-trips toRows -> fromRows back to the original paytable, sorted by match count", () => {
        const original = {A: {"3": 10, "4": 20, "5": 40}, K: {"3": 5}};
        const {value, issues} = mapper.fromRows(mapper.toRows(original));

        expect(issues).toEqual([]);
        expect(value).toEqual(original);
    });
});
