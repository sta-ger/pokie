import {MAX_STUDIO_SIMULATION_ROUNDS} from "../../../../cli/studio/simulation/StudioSimulationLimits.js";
import {validateSimulationRequest} from "../../../../cli/studio/simulation/validateSimulationRequest.js";

describe("validateSimulationRequest", () => {
    it("accepts a positive integer rounds with no seed", () => {
        expect(validateSimulationRequest({rounds: 1000})).toEqual({rounds: 1000});
    });

    it("accepts a positive integer rounds with a non-empty seed", () => {
        expect(validateSimulationRequest({rounds: 500, seed: "demo"})).toEqual({rounds: 500, seed: "demo"});
    });

    it("rejects a missing rounds", () => {
        expect(() => validateSimulationRequest({})).toThrow('"rounds" must be a positive integer.');
    });

    it("rejects a non-numeric rounds", () => {
        expect(() => validateSimulationRequest({rounds: "1000"})).toThrow('"rounds" must be a positive integer.');
    });

    it("rejects a non-integer rounds", () => {
        expect(() => validateSimulationRequest({rounds: 12.5})).toThrow('"rounds" must be a positive integer.');
    });

    it("rejects rounds less than 1", () => {
        expect(() => validateSimulationRequest({rounds: 0})).toThrow('"rounds" must be a positive integer.');
        expect(() => validateSimulationRequest({rounds: -5})).toThrow('"rounds" must be a positive integer.');
    });

    it("rejects rounds above the safe Studio limit", () => {
        expect(() => validateSimulationRequest({rounds: MAX_STUDIO_SIMULATION_ROUNDS + 1})).toThrow(
            `"rounds" must not exceed ${MAX_STUDIO_SIMULATION_ROUNDS}.`,
        );
    });

    it("accepts rounds exactly at the safe Studio limit", () => {
        expect(validateSimulationRequest({rounds: MAX_STUDIO_SIMULATION_ROUNDS})).toEqual({
            rounds: MAX_STUDIO_SIMULATION_ROUNDS,
        });
    });

    it("rejects an empty seed", () => {
        expect(() => validateSimulationRequest({rounds: 1000, seed: ""})).toThrow(
            '"seed" must be a non-empty string when given.',
        );
    });

    it("rejects a whitespace-only seed", () => {
        expect(() => validateSimulationRequest({rounds: 1000, seed: "   "})).toThrow(
            '"seed" must be a non-empty string when given.',
        );
    });

    it("rejects a non-string seed", () => {
        expect(() => validateSimulationRequest({rounds: 1000, seed: 42})).toThrow(
            '"seed" must be a non-empty string when given.',
        );
    });
});
