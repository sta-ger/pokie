import {
    describeVolatilityBand,
    formatVolatilityBands,
    parseVolatilityBands,
} from "../../../cli/studio-client/src/domain/volatilityBands.js";

describe("volatility bands", () => {
    const bands = {lowMax: 2, mediumMax: 5};

    it("labels values against the user's own portfolio boundaries", () => {
        expect(describeVolatilityBand(1.99, bands)).toBe("Low");
        expect(describeVolatilityBand(2, bands)).toBe("Medium");
        expect(describeVolatilityBand(5, bands)).toBe("Medium");
        expect(describeVolatilityBand(5.01, bands)).toBe("High");
    });

    it("stays silent when no bands were configured", () => {
        expect(describeVolatilityBand(2.8, undefined)).toBeUndefined();
        expect(describeVolatilityBand(Number.NaN, bands)).toBeUndefined();
    });

    it("rejects malformed or inverted bands instead of guessing", () => {
        expect(parseVolatilityBands({lowMax: 2, mediumMax: 5})).toEqual({lowMax: 2, mediumMax: 5});
        expect(parseVolatilityBands({lowMax: 5, mediumMax: 2})).toBeUndefined();
        expect(parseVolatilityBands({lowMax: -1, mediumMax: 5})).toBeUndefined();
        expect(parseVolatilityBands({lowMax: "2", mediumMax: 5})).toBeUndefined();
        expect(parseVolatilityBands(null)).toBeUndefined();
    });

    it("formats the configured scale without implying an industry standard", () => {
        expect(formatVolatilityBands(bands)).toBe("Low < 2.00 · Medium 2.00–5.00 · High > 5.00");
    });
});
