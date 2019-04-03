import {GameSessionSimulation} from "./GameSessionSimulation";
import {ReelGameSessionConfig} from "../session/videogames/reelgames/ReelGameSessionConfig";
import {IGameSessionSimulationConfig, IReelGameSession, ReelGameSession} from "..";
import {IReelGameSessionReelsController} from "../session/videogames/reelgames/reelscontroller/IReelGameSessionReelsController";
import {IReelGameSessionWinCalculator} from "../session/videogames/reelgames/wincalculator/IReelGameSessionWinCalculator";
import {ReelGameSessionReelsController} from "../session/videogames/reelgames/reelscontroller/ReelGameSessionReelsController";
import {ReelGameSessionWinCalculator} from "../session/videogames/reelgames/wincalculator/ReelGameSessionWinCalculator";
import {IReelGameSessionConfig} from "../session/videogames/reelgames/IReelGameSessionConfig";
import fn = jest.fn;

describe("GameSessionSimulation", () => {

    it("plays specified number of rounds and calculates RTP", () => {
        const sessionConfig: IReelGameSessionConfig = new ReelGameSessionConfig();
        const reelsController: IReelGameSessionReelsController = new ReelGameSessionReelsController(sessionConfig);
        const winningCalculator: IReelGameSessionWinCalculator = new ReelGameSessionWinCalculator(sessionConfig);
        const session: IReelGameSession = new ReelGameSession(sessionConfig, reelsController, winningCalculator);
        const simulationConfig: IGameSessionSimulationConfig = {
            session: session
        };
        const simulation: GameSessionSimulation = new GameSessionSimulation(simulationConfig);


        simulation.beforePlayCallback = fn();
        simulation.afterPlayCallback = fn();
        simulation.onFinishedCallback = fn();

        simulation.run();

        expect(simulation.beforePlayCallback).toBeCalledTimes(simulation.getTotalGameToPlayNumber());
        expect(simulation.afterPlayCallback).toBeCalledTimes(simulation.getTotalGameToPlayNumber());
        expect(simulation.onFinishedCallback).toBeCalledTimes(1);

        expect(simulation.getRtp()).toBeGreaterThan(1);
        expect(simulation.getRtp()).toBeLessThan(3);
    });

});
