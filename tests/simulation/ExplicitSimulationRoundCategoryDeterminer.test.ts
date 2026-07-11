import {ExplicitSimulationRoundCategoryDeterminer, GameSessionHandling} from "pokie";

function sessionWithCategory(category: unknown): GameSessionHandling {
    return {getSimulationCategory: () => category} as unknown as GameSessionHandling;
}

describe("ExplicitSimulationRoundCategoryDeterminer", () => {
    const determiner = new ExplicitSimulationRoundCategoryDeterminer();

    test("does not support a session without getSimulationCategory", () => {
        const session = {getBet: () => 1} as unknown as GameSessionHandling;

        expect(determiner.supportsRoundCategorization(session)).toBe(false);
    });

    test("supports and returns a valid explicit category", () => {
        const session = sessionWithCategory("bonus");

        expect(determiner.supportsRoundCategorization(session)).toBe(true);
        expect(determiner.categorizeRound(session)).toBe("bonus");
    });

    test("does not support a round where the session returns an empty category", () => {
        const session = sessionWithCategory("");

        expect(determiner.supportsRoundCategorization(session)).toBe(false);
    });

    test("does not support a round where the session returns a whitespace-only category", () => {
        const session = sessionWithCategory("   ");

        expect(determiner.supportsRoundCategorization(session)).toBe(false);
    });

    test("does not support a round where the session returns an invalid category (bad characters)", () => {
        const session = sessionWithCategory("bonus round!");

        expect(determiner.supportsRoundCategorization(session)).toBe(false);
    });

    test("does not support a round where the session returns a non-string category", () => {
        const session = sessionWithCategory(42);

        expect(determiner.supportsRoundCategorization(session)).toBe(false);
    });

    test("trims the category before returning it", () => {
        const session = sessionWithCategory("  respins  ");

        expect(determiner.categorizeRound(session)).toBe("respins");
    });

    test("a session can return a different category on different calls (per-round)", () => {
        let current = "base";
        const session = {getSimulationCategory: () => current} as unknown as GameSessionHandling;

        expect(determiner.categorizeRound(session)).toBe("base");
        current = "bonus";
        expect(determiner.categorizeRound(session)).toBe("bonus");
    });

    test("throws a clear error if categorizeRound is called without checking support first", () => {
        const session = sessionWithCategory("");

        expect(() => determiner.categorizeRound(session)).toThrow(/doesn't support/);
    });
});
