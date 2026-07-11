import {FallbackSimulationRoundCategoryDeterminer, GameSessionHandling, SimulationRoundCategoryDetermining} from "pokie";

function fakeDeterminer(supports: boolean, category: string): SimulationRoundCategoryDetermining {
    return {
        supportsRoundCategorization: () => supports,
        categorizeRound: () => category,
    };
}

describe("FallbackSimulationRoundCategoryDeterminer", () => {
    const session = {} as unknown as GameSessionHandling;

    test("delegates to the first determiner that supports the round", () => {
        const first = fakeDeterminer(true, "fromFirst");
        const second = fakeDeterminer(true, "fromSecond");
        const fallback = new FallbackSimulationRoundCategoryDeterminer([first, second]);

        expect(fallback.supportsRoundCategorization(session)).toBe(true);
        expect(fallback.categorizeRound(session)).toBe("fromFirst");
    });

    test("falls through to the next determiner when the first doesn't support the round", () => {
        const first = fakeDeterminer(false, "fromFirst");
        const second = fakeDeterminer(true, "fromSecond");
        const fallback = new FallbackSimulationRoundCategoryDeterminer([first, second]);

        expect(fallback.supportsRoundCategorization(session)).toBe(true);
        expect(fallback.categorizeRound(session)).toBe("fromSecond");
    });

    test("supports nothing (and throws from categorizeRound) when no determiner supports the round", () => {
        const first = fakeDeterminer(false, "fromFirst");
        const second = fakeDeterminer(false, "fromSecond");
        const fallback = new FallbackSimulationRoundCategoryDeterminer([first, second]);

        expect(fallback.supportsRoundCategorization(session)).toBe(false);
        expect(() => fallback.categorizeRound(session)).toThrow(/none of its determiners support/);
    });

    test("supports nothing when constructed with an empty list", () => {
        const fallback = new FallbackSimulationRoundCategoryDeterminer([]);

        expect(fallback.supportsRoundCategorization(session)).toBe(false);
    });

    test("does not call a later determiner's categorizeRound once an earlier one is chosen", () => {
        const secondCategorize = jest.fn(() => "fromSecond");
        const first = fakeDeterminer(true, "fromFirst");
        const second: SimulationRoundCategoryDetermining = {
            supportsRoundCategorization: () => true,
            categorizeRound: secondCategorize,
        };
        const fallback = new FallbackSimulationRoundCategoryDeterminer([first, second]);

        fallback.categorizeRound(session);

        expect(secondCategorize).not.toHaveBeenCalled();
    });
});
