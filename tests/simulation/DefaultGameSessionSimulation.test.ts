import {
    BetForNextSimulationRoundSetting,
    GameSession,
    GameSessionConfig,
    Simulation,
    SimulationConfig,
    VideoSlotSession,
    VideoSlotConfig,
    SymbolsCombinationsGenerator,
    VideoSlotWinCalculator,
    SymbolsSequence,
    NextSessionRoundPlayableDetermining,
} from "pokie";

describe("DefaultGameSessionSimulation", () => {
    test("playSpecifiedNumOfRoundsAndCalculateRtpTest", () => {
        const sessionConfig = new VideoSlotConfig();
        sessionConfig.setSymbolsSequences([
            new SymbolsSequence().fromArray(["J", "9", "Q", "10", "A", "S", "K"]),
            new SymbolsSequence().fromArray(["K", "S", "10", "A", "9", "Q", "J"]),
            new SymbolsSequence().fromArray(["J", "Q", "10", "9", "S", "A", "K"]),
            new SymbolsSequence().fromArray(["Q", "10", "9", "S", "K", "A", "J"]),
            new SymbolsSequence().fromArray(["Q", "A", "J", "10", "9", "S", "K"]),
        ]);
        const combinationsGenerator = new SymbolsCombinationsGenerator(sessionConfig);
        const winCalculator = new VideoSlotWinCalculator(sessionConfig);
        const session = new VideoSlotSession(
            sessionConfig,
            combinationsGenerator,
            winCalculator,
            new GameSession(sessionConfig),
        );
        const simulationConfig = new SimulationConfig();
        simulationConfig.setNumberOfRounds(10000);
        const simulation = new Simulation(session, simulationConfig);

        let totalBet = 0;
        let totalReturn = 0;
        const callbacksCounts = [0, 0, 0];
        simulation.setBeforePlayCallback(() => {
            expect(simulation.getCurrentGameNumber()).toBe(callbacksCounts[0]);
            callbacksCounts[0]++;
            session.setCreditsAmount(10000);
        });
        simulation.setAfterPlayCallback(() => {
            callbacksCounts[1]++;
            totalBet += session.getBet();
            totalReturn += session.getWinAmount();
        });
        simulation.setOnFinishedCallback(() => callbacksCounts[2]++);

        simulation.run();

        expect(callbacksCounts[0]).toBe(simulation.getTotalGamesToPlayNumber());
        expect(callbacksCounts[1]).toBe(simulation.getTotalGamesToPlayNumber());
        expect(callbacksCounts[2]).toBe(1);

        expect(simulation.getTotalBetAmount()).toBe(totalBet);
        expect(simulation.getTotalReturn()).toBe(totalReturn);
        expect(simulation.getRtp()).toBeGreaterThan(0.5);
        expect(simulation.getRtp()).toBeLessThan(0.6);
    });

    test("testSetAndRemoveCallbacks", () => {
        const session = new GameSession(new GameSessionConfig());
        const simulationConfig = new SimulationConfig();
        simulationConfig.setNumberOfRounds(100);
        const simulation = new Simulation(session, simulationConfig);

        const callbacksCounts = [0, 0, 0];
        simulation.setBeforePlayCallback(() => callbacksCounts[0]++);
        simulation.setAfterPlayCallback(() => {
            callbacksCounts[1]++;
            if (simulation.getCurrentGameNumber() === 50) {
                simulation.removeBeforePlayCallback();
                simulation.removeAfterPlayCallback();
            }
        });
        simulation.setOnFinishedCallback(() => callbacksCounts[2]++);

        simulation.run();

        expect(callbacksCounts[0]).toBe(50);
        expect(callbacksCounts[1]).toBe(50);
        expect(callbacksCounts[2]).toBe(1);

        callbacksCounts[2] = 0;

        simulation.removeOnFinishedCallback();
        simulation.run();

        expect(callbacksCounts[2]).toBe(0);
    });

    test("testSetBetBeforePlay", () => {
        const bets = [1, 10];
        const config = new GameSessionConfig();
        config.setAvailableBets(bets);
        config.setCreditsAmount(59);
        config.setBet(10);
        const session = new GameSession(config);
        const simulationConfig = new SimulationConfig();
        const simulation = new Simulation(session, simulationConfig);

        let expectLowerBet = false;
        simulation.setBeforePlayCallback(() => {
            if (session.getCreditsAmount() < 10) {
                expectLowerBet = true;
            }
        });
        simulation.setAfterPlayCallback(() => {
            if (expectLowerBet) {
                expect(session.getBet()).toBe(1);
            } else {
                expect(session.getBet()).toBe(10);
            }
        });

        simulation.run();
    });

    test("testApplyChangeBetStrategy", () => {
        let betChanged = false;
        const createSimulation = (changeBetStrategy?: BetForNextSimulationRoundSetting) => {
            const config = new SimulationConfig();
            if (changeBetStrategy) {
                config.setChangeBetStrategy(changeBetStrategy);
            }
            return new Simulation(new GameSession(new GameSessionConfig()), config);
        };

        let simulation = createSimulation();
        simulation.run();
        expect(betChanged).toBeFalsy();

        simulation = createSimulation({
            setBetForNextRound() {
                betChanged = true;
            },
        });
        simulation.run();
        expect(betChanged).toBeTruthy();
    });

    test("testApplyPlayStrategy", () => {
        let playedRoundsNumber = 0;
        const createSimulation = (playStrategy?: NextSessionRoundPlayableDetermining) => {
            const config = new SimulationConfig();
            if (playStrategy) {
                config.setPlayStrategy(playStrategy);
            }
            const simulation = new Simulation(new GameSession(new GameSessionConfig()), config);
            simulation.setAfterPlayCallback(() => playedRoundsNumber++);
            return simulation;
        };

        let simulation = createSimulation();
        simulation.run();
        expect(playedRoundsNumber).toBe(SimulationConfig.DEFAULT_NUMBER_OF_ROUNDS);

        playedRoundsNumber = 0;
        simulation = createSimulation({
            canPlayNextSimulationRound(): boolean {
                return playedRoundsNumber < 5;
            },
        });
        simulation.run();
        expect(playedRoundsNumber).toBe(5);
    });
});
