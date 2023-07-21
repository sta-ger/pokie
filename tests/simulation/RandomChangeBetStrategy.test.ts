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
        c.setNumberOfRounds(1000);
        c.setChangeBetStrategy(new RandomChangeBetStrategy());
        const simulation = new Simulation(sessionMock, c);

        simulation.run();

        // Contents of betsDuringPlay after simulation should contain shuffled array of all possible bets
        expect(betsDuringPlay).not.toEqual(sessionMock.getAvailableBets());
        expect(betsDuringPlay.sort((a, b) => a - b)).toEqual(sessionMock.getAvailableBets());
    });
});
