import {canonicalWinLabel} from "../../../cli/client/player/videoSlotRoundView.js";

describe("player win labels", () => {
    it("presents numeric payline ids as one-based line numbers", () => {
        expect(canonicalWinLabel("line", "0", "J", 6, [])).toBe("Line: 1, win: 6");
        expect(canonicalWinLabel("line", "2", "J", 6, [])).toBe("Line: 3, win: 6");
    });

    it("leaves non-numeric game-defined line ids untouched", () => {
        expect(canonicalWinLabel("line", "top-row", "J", 6, [])).toBe("Line: top-row, win: 6");
    });
});
