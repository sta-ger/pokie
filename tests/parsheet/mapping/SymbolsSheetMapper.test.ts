import {SymbolsSheetMapper} from "../../../src/parsheet/mapping/SymbolsSheetMapper.js";

describe("SymbolsSheetMapper", () => {
    const mapper = new SymbolsSheetMapper();

    it("maps symbol/wild/scatter rows to symbols/wilds/scatters", () => {
        const {value, issues} = mapper.fromRows([
            ["Symbol", "Wild", "Scatter"],
            ["A", false, false],
            ["W", true, false],
            ["S", false, true],
        ]);

        expect(issues).toEqual([]);
        expect(value).toEqual({symbols: ["A", "W", "S"], wilds: ["W"], scatters: ["S"]});
    });

    it("accepts text/number boolean spellings for Wild/Scatter", () => {
        const {value, issues} = mapper.fromRows([
            ["Symbol", "Wild", "Scatter"],
            ["A", "yes", "0"],
            ["W", 1, "no"],
        ]);

        expect(issues).toEqual([]);
        expect(value).toEqual({symbols: ["A", "W"], wilds: ["A", "W"], scatters: []});
    });

    it("reports a blank Symbol cell and drops that row", () => {
        const {value, issues} = mapper.fromRows([
            ["Symbol", "Wild", "Scatter"],
            ["A", false, false],
            ["", false, false],
        ]);

        expect(value.symbols).toEqual(["A"]);
        expect(issues).toEqual([expect.objectContaining({code: "parsheet-symbol-missing-id", severity: "error"})]);
    });

    it("reports an unrecognizable Wild/Scatter cell", () => {
        const {issues} = mapper.fromRows([
            ["Symbol", "Wild", "Scatter"],
            ["A", "maybe", false],
        ]);

        expect(issues).toEqual([expect.objectContaining({code: "parsheet-symbol-invalid-flag", severity: "error"})]);
    });

    it("skips fully blank rows", () => {
        const {value, issues} = mapper.fromRows([
            ["Symbol", "Wild", "Scatter"],
            ["", "", ""],
            ["A", false, false],
        ]);

        expect(issues).toEqual([]);
        expect(value.symbols).toEqual(["A"]);
    });

    it("round-trips toRows -> fromRows back to the original value", () => {
        const original = {symbols: ["A", "K", "W", "S"], wilds: ["W"], scatters: ["S"]};
        const {value, issues} = mapper.fromRows(mapper.toRows(original));

        expect(issues).toEqual([]);
        expect(value).toEqual(original);
    });
});
