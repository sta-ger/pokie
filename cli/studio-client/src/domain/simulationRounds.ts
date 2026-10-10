import {MAX_STUDIO_SIMULATION_ROUNDS} from "../../../studio/simulation/StudioSimulationLimits.js";

// Use Studio's server-owned ceiling for every browser submission entry point.
export {MAX_STUDIO_SIMULATION_ROUNDS};

export function getSimulationRoundsError(rounds: unknown): string | null {
    if (typeof rounds === "number" && Number.isInteger(rounds) && rounds >= 1 && rounds <= MAX_STUDIO_SIMULATION_ROUNDS) {
        return null;
    }
    return `Rounds must be a positive integer between 1 and ${MAX_STUDIO_SIMULATION_ROUNDS.toLocaleString("en-US")}.`;
}
