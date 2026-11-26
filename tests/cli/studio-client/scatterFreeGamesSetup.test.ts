import {
    defaultScatterReels,
    previewScatterFreeGamesSetup,
    suggestScatterSymbolId,
} from "../../../cli/studio-client/src/domain/scatterFreeGamesSetup.js";

describe("scatter + free games setup helpers", () => {
    it("suggests an unused scatter symbol id", () => {
        expect(suggestScatterSymbolId({symbols: ["A", "K", "Q", "J"]})).toBe("S");
        expect(suggestScatterSymbolId({symbols: ["A", "S"]})).toBe("X");
        expect(suggestScatterSymbolId({symbols: ["A", "S", "X", "Y", "Z"]})).toBe("S2");
    });

    it("spreads the default placement across at least three reels", () => {
        expect(defaultScatterReels(5)).toEqual([0, 2, 4]);
        expect(defaultScatterReels(3)).toEqual([0, 1, 2]);
        expect(defaultScatterReels(2)).toEqual([0, 1]);
    });

    it("previews a finite three-reel starter exactly", () => {
        const preview = previewScatterFreeGamesSetup({
            rows: 3,
            reelStripLengths: [5, 5, 5, 5, 5],
            selectedReels: [0, 2, 4],
            awards: {3: 1, 4: 2, 5: 3},
        });
        // Replacing one stop keeps each selected reel 5 stops long; a 3-row window sees it 3/5 of the time.
        expect(preview.triggerProbability).toBeCloseTo(0.216, 12);
        expect(preview.expectedAward).toBeCloseTo(1, 12);
        expect(preview.retriggerFactor).toBeCloseTo(0.216, 12);
        expect(preview.expectedFreeSpins).toBeCloseTo(1.275510204082, 9);
    });

    it("shows the lower trigger frequency of the 10-stop demo reels", () => {
        const preview = previewScatterFreeGamesSetup({
            rows: 3,
            reelStripLengths: [10, 5, 10, 5, 10],
            selectedReels: [0, 2, 4],
            awards: {3: 10, 4: 15, 5: 25},
        });
        expect(preview.triggerProbability).toBeCloseTo(0.027, 12);
        expect(preview.retriggerFactor).toBeCloseTo(0.27, 12);
        expect(preview.expectedFreeSpins).toBeCloseTo(10 / 0.73, 9);
    });

    it("flags the common 10/15/20 starter as supercritical on every reel", () => {
        const preview = previewScatterFreeGamesSetup({
            rows: 3,
            reelStripLengths: [5, 5, 5, 5, 5],
            selectedReels: [0, 1, 2, 3, 4],
            awards: {3: 10, 4: 15, 5: 20},
        });
        expect(preview.triggerProbability).toBeCloseTo(0.68256, 10);
        expect(preview.retriggerFactor).toBeGreaterThan(1);
        expect(preview.expectedFreeSpins).toBeUndefined();
    });

    it("cannot trigger with fewer than three scatter reels", () => {
        const preview = previewScatterFreeGamesSetup({
            rows: 3,
            reelStripLengths: [5, 5, 5],
            selectedReels: [0, 1],
            awards: {3: 10, 4: 15, 5: 20},
        });
        expect(preview.triggerProbability).toBe(0);
        expect(preview.retriggerFactor).toBe(0);
    });
});
