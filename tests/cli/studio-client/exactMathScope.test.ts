import {describeExactMathScope, freeGamesAreUncapped} from "../../../cli/studio-client/src/domain/exactMathScope.js";
import type {FreeGamesExactRtp} from "../../../src/weightedoutcome/computeFreeGamesExactRtp.js";

const available = (maxFreeGames?: number): FreeGamesExactRtp => (
    maxFreeGames === undefined
        ? {status: "available", baseRtp: 0.9, featureRtp: 0.07, totalRtp: 0.97, triggerProbability: 0.01, expectedAward: 7, expectedFreeSpins: 7.1, method: "additive-retrigger"}
        : {status: "available", baseRtp: 0.9, featureRtp: 0.07, totalRtp: 0.97, triggerProbability: 0.01, expectedAward: 7, expectedFreeSpins: 7.1, method: "additive-retrigger-capped", maxFreeGames}
);

describe("exactMathScope", () => {
    it("treats an available free-games total as whole-round exact", () => {
        expect(describeExactMathScope(available(), false)).toBe("whole-round");
        expect(describeExactMathScope(available(), undefined)).toBe("whole-round");
    });

    it("treats feature payouts included in the table as whole-round exact", () => {
        expect(describeExactMathScope(undefined, true)).toBe("whole-round");
    });

    it("reports base-spin scope only when feature payouts are explicitly excluded", () => {
        expect(describeExactMathScope(undefined, false)).toBe("base-spins");
    });

    it("does not claim a scope when the table was too large to inspect", () => {
        expect(describeExactMathScope(undefined, undefined)).toBe("uninspected");
    });

    it("never calls an unbounded free-games model a whole-round exact result", () => {
        expect(describeExactMathScope(
            {status: "infinite", baseRtp: 0.9, triggerProbability: 1, expectedAward: 10, reason: "Unbounded."},
            true,
        )).toBe("base-spins");
    });

    it("does not treat a featureless game's absent derivation as uncapped free games", () => {
        expect(freeGamesAreUncapped(undefined)).toBe(false);
        expect(freeGamesAreUncapped({status: "unsupported", reason: "No free games."})).toBe(false);
        expect(freeGamesAreUncapped({status: "infinite", baseRtp: 0.9, triggerProbability: 1, expectedAward: 10, reason: "Unbounded."})).toBe(false);
    });

    it("treats only an available derivation without a cap as uncapped", () => {
        expect(freeGamesAreUncapped(available(undefined))).toBe(true);
        expect(freeGamesAreUncapped(available(50))).toBe(false);
    });
});
