import {BetModeSimulationUnsupportedError} from "../../src/simulation/BetModeSimulationUnsupportedError.js";

describe("BetModeSimulationUnsupportedError", () => {
    it("describes selecting a mode without claiming the caller is always simulating", () => {
        const error = new BetModeSimulationUnsupportedError("bonus");
        expect(error.message).toContain('Cannot select bet mode "bonus"');
        expect(error.message).not.toContain("simulation run");
        expect(error.getModeId()).toBe("bonus");
    });
});
