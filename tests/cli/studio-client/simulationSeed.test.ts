import {generateSimulationSeed} from "../../../cli/studio-client/src/domain/simulationSeed.js";

describe("generateSimulationSeed", () => {
    it("returns a readable, non-empty Studio seed", () => {
        const seed = generateSimulationSeed();
        expect(seed).toMatch(/^studio-[a-z0-9]+$/);
        expect(seed.length).toBeGreaterThan("studio-".length);
    });

    it("does not return the same seed twice in a row", () => {
        expect(generateSimulationSeed()).not.toBe(generateSimulationSeed());
    });
});
