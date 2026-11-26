import {
    canonicalWinLabel,
    deriveFeatureCounters,
    displayLineId,
    formatPaytableMatchCount,
    formatPaytablePays,
    type VideoSlotRoundResponse,
} from "../../../cli/client/player/videoSlotRoundView.js";

describe("player feature counters", () => {
    it("reports cumulative free games plus the remaining count", () => {
        const counters = deriveFeatureCounters({
            freeGamesNum: 1,
            freeGamesSum: 2,
            freeGamesBank: 0,
        } as VideoSlotRoundResponse);
        expect(counters).toEqual([
            {label: "Free games played", value: 1},
            {label: "Free games awarded", value: 2},
            {label: "Free games remaining", value: 1},
            {label: "Free-game win bank", value: 0},
        ]);
    });

    it("never reports a negative remaining count", () => {
        const counters = deriveFeatureCounters({freeGamesNum: 3, freeGamesSum: 2} as VideoSlotRoundResponse);
        expect(counters).toContainEqual({label: "Free games remaining", value: 0});
    });
});

describe("player win labels", () => {
    it("presents numeric payline ids as one-based line numbers", () => {
        expect(displayLineId("0")).toBe("1");
        expect(displayLineId("2")).toBe("3");
        expect(canonicalWinLabel("line", "0", "J", 6, [])).toBe("Line: 1 · J, win: 6");
        expect(canonicalWinLabel("line", "2", "J", 6, [[0, 1], [1, 1], [2, 1], [3, 1]])).toBe("Line: 3 · J ×4, win: 6");
    });

    it("leaves non-numeric game-defined line ids untouched", () => {
        expect(canonicalWinLabel("line", "top-row", "J", 6, [])).toBe("Line: top-row · J, win: 6");
    });
});

describe("paytable labels", () => {
    it("names match counts and payouts in the direction a slot author reads them", () => {
        expect(formatPaytableMatchCount(3)).toBe("3 symbols");
        expect(formatPaytableMatchCount(1)).toBe("1 symbol");
        expect(formatPaytablePays(3, 8)).toBe("3 symbols → ×8");
        expect(formatPaytablePays(4, 0.5)).toBe("4 symbols → ×0.5");
    });
});
