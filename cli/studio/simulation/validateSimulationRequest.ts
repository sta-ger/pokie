import {MAX_STUDIO_SIMULATION_ROUNDS} from "./StudioSimulationLimits.js";

export type SimulationRequestInput = {
    rounds?: unknown;
    seed?: unknown;
};

export type ValidatedSimulationRequest = {
    rounds: number;
    seed?: string;
};

// The one place a POST /api/project/simulations body is turned into a trusted
// ValidatedSimulationRequest — throws a plain, client-safe Error (no stack trace leaks; StudioServer
// catches this and maps it to 400) for anything malformed: a non-integer/non-positive/oversized
// `rounds`, or a `seed` that's present but not a non-empty string.
export function validateSimulationRequest(input: SimulationRequestInput): ValidatedSimulationRequest {
    const {rounds, seed} = input;

    if (typeof rounds !== "number" || !Number.isInteger(rounds) || rounds < 1) {
        throw new Error('"rounds" must be a positive integer.');
    }
    if (rounds > MAX_STUDIO_SIMULATION_ROUNDS) {
        throw new Error(`"rounds" must not exceed ${MAX_STUDIO_SIMULATION_ROUNDS}.`);
    }

    if (seed === undefined) {
        return {rounds};
    }
    if (typeof seed !== "string" || seed.trim().length === 0) {
        throw new Error('"seed" must be a non-empty string when given.');
    }
    return {rounds, seed};
}
