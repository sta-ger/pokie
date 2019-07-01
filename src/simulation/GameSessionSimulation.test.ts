import {GameSessionSimulation} from "./GameSessionSimulation";
import fn = jest.fn;
import {IReelGameSessionConfig} from "..";
import {ReelGameSessionConfig} from "..";
import {ReelGameSessionReelsController} from "..";
import {IReelGameSessionReelsController} from "..";
import {IReelGameSessionWinCalculator} from "..";
import {ReelGameSession} from "..";
import {ReelGameSessionWinCalculator} from "..";
import {IReelGameSession} from "..";
import {IGameSessionSimulationConfig} from "./IGameSessionSimulationConfig";
import {IGameSessionSimulation} from "./IGameSessionSimulation";

describe("GameSessionSimulation", () => {

    it("plays specified number of rounds and calculates RTP", () => {
        const sessionConfig: IReelGameSessionConfig = new ReelGameSessionConfig();
        sessionConfig.creditsAmount = Infinity;
        sessionConfig.reelsItemsSequences = [
            ["J", "9", "Q", "10", "A", "S", "K"],
            ["K", "S", "10", "A", "9", "Q", "J"],
            ["J", "Q", "10", "9", "S", "A", "K"],
            ["Q", "10", "9", "S", "K", "A", "J"],
            ["Q", "A", "J", "10", "9", "S", "K"],
        ];
        const reelsController: IReelGameSessionReelsController = new ReelGameSessionReelsController(sessionConfig);
        const winningCalculator: IReelGameSessionWinCalculator = new ReelGameSessionWinCalculator(sessionConfig);
        const session: IReelGameSession = new ReelGameSession(sessionConfig, reelsController, winningCalculator);
        const simulationConfig: IGameSessionSimulationConfig = {
            numberOfRounds: 10000,
        };
        const simulation: IGameSessionSimulation = new GameSessionSimulation(session, simulationConfig);

        simulation.beforePlayCallback = fn();
        simulation.afterPlayCallback = fn();
        simulation.onFinishedCallback = fn();

        simulation.run();

        expect(simulation.beforePlayCallback).toBeCalledTimes(simulation.getTotalGameToPlayNumber());
        expect(simulation.afterPlayCallback).toBeCalledTimes(simulation.getTotalGameToPlayNumber());
        expect(simulation.onFinishedCallback).toBeCalledTimes(1);

        expect(simulation.getRtp()).toBeGreaterThan(0.5);
        expect(simulation.getRtp()).toBeLessThan(0.6);
    });

});
