import {extractKnownRoundView, extractStages} from "../../../cli/client/interpretResponse.js";
import {SessionResponse} from "../../../cli/client/types.js";

function response(fields: Record<string, unknown>): SessionResponse {
    return {sessionId: "s1", game: {id: "g", name: "G", version: "1.0.0"}, credits: 1000, ...fields};
}

describe("extractKnownRoundView", () => {
    it("reads the legacy narrow DTO's win/screen fields", () => {
        const view = extractKnownRoundView(response({bet: 5, win: 15, screen: [["A", "K"]]}));

        expect(view).toEqual({credits: 1000, bet: 5, win: 15, screen: [["A", "K"]]});
    });

    it("falls back to totalWin/reelsSymbols for a richer serializer payload", () => {
        const view = extractKnownRoundView(response({bet: 5, totalWin: 20, reelsSymbols: [["Q", "J"]]}));

        expect(view).toEqual({credits: 1000, bet: 5, win: 20, screen: [["Q", "J"]]});
    });

    it("prefers win/screen over totalWin/reelsSymbols when both happen to be present", () => {
        const view = extractKnownRoundView(response({win: 5, totalWin: 999, screen: [["A"]], reelsSymbols: [["Z"]]}));

        expect(view.win).toBe(5);
        expect(view.screen).toEqual([["A"]]);
    });

    it("leaves win/screen/bet undefined when nothing recognizable is present", () => {
        const view = extractKnownRoundView(response({}));

        expect(view).toEqual({credits: 1000, bet: undefined, win: undefined, screen: undefined});
    });
});

describe("extractStages", () => {
    it("returns undefined when the response has no stages field", () => {
        expect(extractStages(response({}))).toBeUndefined();
    });

    it("returns undefined when stages isn't an array", () => {
        expect(extractStages(response({stages: "not-an-array"}))).toBeUndefined();
    });

    it("returns the stages array generically, without knowing anything about its contents (cascade or otherwise)", () => {
        const stages = [{screen: [["A"]], removedPositions: [[0, 0]]}, {screen: [["B"]], removedPositions: []}];

        expect(extractStages(response({stages}))).toEqual(stages);
    });

    it("returns an empty stages array as-is, not undefined", () => {
        expect(extractStages(response({stages: []}))).toEqual([]);
    });
});
