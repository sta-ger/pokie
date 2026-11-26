import {describeDefinitionChangePath} from "../../../cli/studio-client/src/domain/definitionChangeLabels.js";

describe("describeDefinitionChangePath", () => {
    it("names paytable changes with the symbol and match count", () => {
        expect(describeDefinitionChangePath({path: "/paytable/A/3", context: {before: {symbolId: "A", matchCount: 3}, after: {symbolId: "A", matchCount: 3}}})).toBe("Paytable · A, 3 symbols");
    });

    it("turns reel strip indexes into one-based reel and stop labels", () => {
        expect(describeDefinitionChangePath({path: "/reelStrips/0/4"})).toBe("Reel strips · Reel 1 · Stop 5");
    });

    it("names free-games award changes without raw JSON pointers", () => {
        expect(describeDefinitionChangePath({path: "/mechanics/freeGames/awardsByCount/3"})).toBe("Free games · 3-scatter award");
        expect(describeDefinitionChangePath({path: "/mechanics/freeGames/retriggerPolicy"})).toBe("Free games · Retrigger policy");
    });

    it("labels metadata changes as metadata rather than mathematics", () => {
        expect(describeDefinitionChangePath({path: "/info/author"})).toBe("Metadata · Author");
        expect(describeDefinitionChangePath({path: "/info/name"})).toBe("Metadata · Game name");
    });

    it("uses the symbol id for symbol and scatter array changes", () => {
        expect(describeDefinitionChangePath({path: "/symbols/4", after: {present: true, value: "S", provenance: {authority: "test", status: "authored", authored: {present: true, value: "S"}}}})).toBe("Symbols · S");
        expect(describeDefinitionChangePath({path: "/scatters/0", after: {present: true, value: "S", provenance: {authority: "test", status: "authored", authored: {present: true, value: "S"}}}})).toBe("Scatters · S");
    });

    it("keeps unknown paths readable instead of hiding them", () => {
        expect(describeDefinitionChangePath({path: "/futureFeature/oddKey/0"})).toBe("Future Feature · Odd Key · 0");
    });
});
