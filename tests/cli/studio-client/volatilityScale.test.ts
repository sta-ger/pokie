import {VOLATILITY_SCALE_DECISION} from "../../../cli/studio-client/src/domain/volatilityScale.js";

describe("volatility scale policy", () => {
    it("records the explicit no-universal-band decision and keeps the producer's own bands possible", () => {
        expect(VOLATILITY_SCALE_DECISION).toContain("low/medium/high");
        expect(VOLATILITY_SCALE_DECISION).toContain("does not assign an industry-wide low/medium/high band");
        expect(VOLATILITY_SCALE_DECISION).toContain("only label this number for your own portfolio");
        expect(VOLATILITY_SCALE_DECISION).toContain("do not change the game's math");
    });
});
