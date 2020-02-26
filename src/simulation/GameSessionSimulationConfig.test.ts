import {GameSessionSimulationConfig} from "./GameSessionSimulationConfig";
import {RandomChangeBetStrategy} from "./RandomChangeBetStrategy";

describe("GameSessionSimulationConfig", () => {

    it("gets and sets values", () => {
        const s: RandomChangeBetStrategy = new RandomChangeBetStrategy();
        const c: GameSessionSimulationConfig = new GameSessionSimulationConfig(100, s);
        expect(c.numberOfRounds).toBe(100);
        expect(c.changeBetStrategy).toEqual(s);

        c.numberOfRounds = 1000;
        expect(c.numberOfRounds).toBe(1000);

        c.changeBetStrategy = undefined;
        expect(c.changeBetStrategy).toBeUndefined();

        expect(new GameSessionSimulationConfig().changeBetStrategy).toBeUndefined();
        expect(new GameSessionSimulationConfig().numberOfRounds).toBeUndefined();
    });

});
