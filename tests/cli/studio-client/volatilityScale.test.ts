import {VOLATILITY_SCALE_DECISION} from "../../../cli/studio-client/src/domain/volatilityScale.js";

describe("volatility scale policy", () => {
    it("records the explicit no-universal-band decision and keeps the producer's own bands possible", () => {
        expect(VOLATILITY_SCALE_DECISION).toContain("low, medium or high");
        expect(VOLATILITY_SCALE_DECISION).toContain("no single industry threshold set");
        expect(VOLATILITY_SCALE_DECISION).toContain("own portfolio");
    });
});
