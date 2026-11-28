import {getSimulationRoundsError, MAX_STUDIO_SIMULATION_ROUNDS} from "../../../cli/studio-client/src/domain/simulationRounds.js";

describe("getSimulationRoundsError", () => {
    it.each([1, 10, 1_500_000, MAX_STUDIO_SIMULATION_ROUNDS])("accepts the whole budget %s", (rounds) => {
        expect(getSimulationRoundsError(rounds)).toBeNull();
    });

    it.each([0, -1, 1.5, 1_500_000.5, MAX_STUDIO_SIMULATION_ROUNDS + 1, Number.NaN, Number.POSITIVE_INFINITY, "1000", undefined, null])(
        "rejects the non-whole or out-of-range budget %p",
        (rounds) => {
            expect(getSimulationRoundsError(rounds)).toMatch(/positive integer between 1 and 10,000,000/);
        },
    );
});
