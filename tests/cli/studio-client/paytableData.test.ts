import {paytableDataFromRows} from "../../../cli/studio-client/src/domain/paytableData.js";

describe("paytableDataFromRows", () => {
    it("groups the flat Game Model rows by symbol and preserves one-based match columns", () => {
        const table = paytableDataFromRows([
            {symbolId: "A", matchCount: 3, payout: 8},
            {symbolId: "A", matchCount: 4, payout: 16},
            {symbolId: "K", matchCount: 3, payout: 6},
        ]);
        expect(table).toEqual({A: {"3": 8, "4": 16}, K: {"3": 6}});
    });
});
