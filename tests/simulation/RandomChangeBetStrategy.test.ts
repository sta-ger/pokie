import {Simulation, SimulationConfig, GameSessionHandling, RandomChangeBetStrategy} from "pokie";

describe("RandomChangeBetStrategyTest", () => {
    it("changes the bet randomly during the simulation", () => {
        const betsDuringPlay: number[] = [];
        const sessionMock: GameSessionHandling = {
            play: () => {
                /* no-op */
            },
            getCreditsAmount: () => 1,
            setCreditsAmount: () => {
                /* no-op */
            },
            getWinAmount: () => 0,
            getAvailableBets: () => {
                return Array.from({length: 99}, (_, i) => i + 1);
            },
            getBet: () => 0,
            setBet: (bet) => {
                if (!betsDuringPlay.some((value) => value === bet)) {
                    betsDuringPlay.push(bet);
                }
            },
            canPlayNextGame: () => true,
        };
        const c = new SimulationConfig();
        // With 99 available bets picked uniformly at random each round, the coupon-collector
        // expectation for seeing every bet at least once is ~99*ln(99) =~ 455 rounds. 1000 rounds
        // left a real (~0.4%) chance of missing one, which made this test flaky. 20000 rounds
        // pushes the probability of missing any single bet below 1e-9, without changing what's
        // under test: a genuinely random strategy that, given enough rounds, uses every bet.
        c.setNumberOfRounds(20000);
        c.setChangeBetStrategy(new RandomChangeBetStrategy());
        const simulation = new Simulation(sessionMock, c);

        simulation.run();

        // Contents of betsDuringPlay after simulation should contain shuffled array of all possible bets
        expect(betsDuringPlay).not.toEqual(sessionMock.getAvailableBets());
        expect(betsDuringPlay.sort((a, b) => a - b)).toEqual(sessionMock.getAvailableBets());
    });
});
