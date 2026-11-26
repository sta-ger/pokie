import {describeCandidatePaytableSanityWarning} from "../../../cli/studio-client/src/domain/optimizationCandidateSanity.js";

const paytable = [
    {symbolId: "A", matchCount: 3, payout: 8},
    {symbolId: "A", matchCount: 4, payout: 16},
    {symbolId: "A", matchCount: 5, payout: 32},
    {symbolId: "J", matchCount: 3, payout: 1},
];
const symbols = [
    {id: "A", isWild: false, isScatter: false},
    {id: "J", isWild: false, isScatter: false},
    {id: "S", isWild: false, isScatter: true},
];

describe("describeCandidatePaytableSanityWarning", () => {
    it("warns when a candidate raises a symbol's lowest match-count payout above 10x", () => {
        const warning = describeCandidatePaytableSanityWarning(
            [{path: "/paytable/A/3", before: 8, after: 13}],
            paytable,
            symbols,
        );
        expect(warning).toContain("A, 3 symbols");
        expect(warning).toContain("13× bet");
        expect(warning).toContain("lowest match count");
    });

    it("warns when a candidate adds a new lowest match count above 10x", () => {
        const warning = describeCandidatePaytableSanityWarning(
            [{path: "/paytable/A/2", before: 0, after: 20}],
            paytable,
            symbols,
        );
        expect(warning).toContain("A, 2 symbols");
        expect(warning).toContain("lowest match count");
    });

    it("does not warn for a higher match count or a value at the threshold", () => {
        expect(
            describeCandidatePaytableSanityWarning([{path: "/paytable/A/4", before: 16, after: 20}], paytable, symbols),
        ).toBeUndefined();
        expect(
            describeCandidatePaytableSanityWarning([{path: "/paytable/J/3", before: 1, after: 10}], paytable, symbols),
        ).toBeUndefined();
    });

    it("does not warn for a scatter or when the model does not identify symbols/paytable", () => {
        expect(
            describeCandidatePaytableSanityWarning(
                [{path: "/paytable/S/3", before: 1, after: 20}],
                [...paytable, {symbolId: "S", matchCount: 3, payout: 1}],
                symbols,
            ),
        ).toBeUndefined();
        expect(
            describeCandidatePaytableSanityWarning([{path: "/paytable/A/3", before: 8, after: 13}], undefined, symbols),
        ).toBeUndefined();
        expect(
            describeCandidatePaytableSanityWarning(
                [{path: "/paytable/A/3", before: 8, after: 13}],
                paytable,
                undefined,
            ),
        ).toBeUndefined();
    });

    it("ignores unrelated paths", () => {
        expect(
            describeCandidatePaytableSanityWarning(
                [{path: "/mechanics/freeGames/awardsByCount/3", before: 1, after: 20}],
                paytable,
                symbols,
            ),
        ).toBeUndefined();
    });
});
