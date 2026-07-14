import {AvailableBetsSheetMapper} from "../../../src/parsheet/mapping/AvailableBetsSheetMapper.js";

describe("AvailableBetsSheetMapper", () => {
    const mapper = new AvailableBetsSheetMapper();

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
        const original = [1, 2, 5, 10];
        const {value, issues} = mapper.fromRows(mapper.toRows(original));

        expect(issues).toEqual([]);
        expect(value).toEqual(original);
    });
});
