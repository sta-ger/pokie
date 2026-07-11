import {GameSessionHandling, StakeBasedSimulationRoundCategoryDeterminer} from "pokie";

describe("StakeBasedSimulationRoundCategoryDeterminer", () => {
    test("does not support categorization for a session without getStakeAmount", () => {
        const determiner = new StakeBasedSimulationRoundCategoryDeterminer();
        const session = {getBet: () => 1} as unknown as GameSessionHandling;

        expect(determiner.supportsRoundCategorization(session)).toBe(false);
    });

    test("supports categorization for a session with getStakeAmount", () => {
        const determiner = new StakeBasedSimulationRoundCategoryDeterminer();
        const session = {getBet: () => 1, getStakeAmount: () => 1} as unknown as GameSessionHandling;

        expect(determiner.supportsRoundCategorization(session)).toBe(true);
    });

    test("categorizes a round as base when getStakeAmount is greater than 0", () => {
        const determiner = new StakeBasedSimulationRoundCategoryDeterminer();
        const session = {getBet: () => 1, getStakeAmount: () => 1} as unknown as GameSessionHandling;

        expect(determiner.categorizeRound(session)).toBe(StakeBasedSimulationRoundCategoryDeterminer.BASE);
    });

    test("categorizes a round as freeGames when getStakeAmount is 0", () => {
        const determiner = new StakeBasedSimulationRoundCategoryDeterminer();
        const session = {getBet: () => 1, getStakeAmount: () => 0} as unknown as GameSessionHandling;

        expect(determiner.categorizeRound(session)).toBe(StakeBasedSimulationRoundCategoryDeterminer.FREE_GAMES);
    });
});
