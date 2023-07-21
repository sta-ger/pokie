import {SimulationConfig} from "pokie";

describe("DefaultGameSessionSimulationConfig", () => {
    it("should create default simulation config", () => {
        const conf = new SimulationConfig();
        expect(conf.getNumberOfRounds()).toEqual(SimulationConfig.DEFAULT_NUMBER_OF_ROUNDS);
        expect(conf.getChangeBetStrategy()).toBeUndefined();
        expect(conf.getPlayStrategy()).toBeUndefined();
    });

    it("should create custom simulation config", () => {
        const conf = new SimulationConfig();
        conf.setNumberOfRounds(999);
        conf.setChangeBetStrategy({
            setBetForNextRound(): void {
                /* no-op */
            },
        });
        conf.setPlayStrategy({
            canPlayNextSimulationRound(): boolean {
                return false;
            },
        });
        expect(conf.getNumberOfRounds()).toEqual(999);
        expect(conf.getChangeBetStrategy()).not.toBeUndefined();
        expect(conf.getPlayStrategy()).not.toBeUndefined();
    });
});
