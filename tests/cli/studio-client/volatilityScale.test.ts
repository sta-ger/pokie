import {VOLATILITY_SCALE_DECISION} from "../../../cli/studio-client/src/domain/volatilityScale.js";

describe("volatility scale policy", () => {
    it("records the explicit no-universal-band decision and keeps the producer's own bands possible", () => {
        expect(VOLATILITY_SCALE_DECISION).toContain("low/medium/high");
        expect(VOLATILITY_SCALE_DECISION).toContain("no single industry threshold for low/medium/high");
        expect(VOLATILITY_SCALE_DECISION).toContain("own portfolio");
    });
});
