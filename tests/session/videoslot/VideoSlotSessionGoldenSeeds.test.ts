import {
    GameSession,
    SeededRandomNumberGenerator,
    SymbolsCombinationsGenerator,
    VideoSlotConfig,
    VideoSlotSession,
    VideoSlotWinCalculator,
} from "pokie";
import {goldenVideoSlotSymbolsSequences} from "./VideoSlotGoldenTestFixtures.js";

// Pins the exact screen and win for a handful of known seeds against the fixed reel strips in
// VideoSlotGoldenTestFixtures -- unlike SeededRandomNumberGenerator.test.ts (which only checks that
// draws are reproducible/in-range) or DefaultGameSessionSimulation.test.ts (which only checks aggregate
// RTP bounds over 10000 rounds), this locks in literal expected values so a change to the RNG algorithm,
// the reel-stop mapping, or the win calculation silently altering behavior gets caught immediately.
function playOneRound(seed: number): {screen: string[][]; win: number; creditsAfter: number; stopPositions: number[]} {
    const config = new VideoSlotConfig();
    config.setSymbolsSequences(goldenVideoSlotSymbolsSequences());
    const combinationsGenerator = new SymbolsCombinationsGenerator(config, new SeededRandomNumberGenerator(seed));
    const winCalculator = new VideoSlotWinCalculator(config);
    const session = new VideoSlotSession(config, combinationsGenerator, winCalculator, new GameSession(config));
    session.setBet(config.getAvailableBets()[0]);

    session.play();

    return {
        screen: session.getSymbolsCombination().toMatrix(),
        win: session.getWinAmount(),
        creditsAfter: session.getCreditsAmount(),
        stopPositions: combinationsGenerator.getLastStopPositions(),
    };
}

describe("VideoSlotSession golden seeds", () => {
    test.each([
        {
            seed: 1,
            screen: [
                ["9", "Q", "10"],
                ["9", "Q", "J"],
                ["A", "K", "J"],
                ["9", "S", "K"],
                ["K", "Q", "A"],
            ],
            stopPositions: [1, 4, 5, 2, 6],
            win: 0,
            creditsAfter: 999,
        },
        {
            seed: 11,
            screen: [
                ["10", "A", "S"],
                ["K", "S", "10"],
                ["9", "S", "A"],
                ["K", "A", "J"],
                ["10", "9", "S"],
            ],
            stopPositions: [3, 0, 3, 4, 3],
            win: 2,
            creditsAfter: 1001,
        },
    ])("seed $seed always reproduces the exact same screen, stop positions, and win", (expected) => {
        expect(playOneRound(expected.seed)).toEqual({
            screen: expected.screen,
            win: expected.win,
            creditsAfter: expected.creditsAfter,
            stopPositions: expected.stopPositions,
        });
    });

    test("the same seed reproduces the exact same round across independently constructed sessions", () => {
        expect(playOneRound(11)).toEqual(playOneRound(11));
    });
});
