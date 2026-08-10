import {MAX_SIMULATION_WORKERS} from "pokie";
import {MAX_STUDIO_SIMULATION_ROUNDS} from "./StudioSimulationLimits.js";

export type SimulationRequestInput = {
    rounds?: unknown;
    seed?: unknown;
    workers?: unknown;
    modeName?: unknown;
};

export type ValidatedSimulationRequest = {
    rounds: number;
    seed?: string;
    // Optional (rather than required) so a hand-built ValidatedSimulationRequest (as used throughout
    // StudioSimulationService's own tests, calling start() directly without going through this
    // validator) doesn't need to specify it just to get the default — StudioSimulationService.start()
    // treats a missing value the same as 1, same as validateSimulationRequest() does below.
    workers?: number;
    // Only meaningful for a resolved "outcomeLibrary" project (see
    // StudioSimulationService.runOutcomeSourceSampling's own doc comment) -- undefined means "no explicit
    // choice", resolved to the manifest's own first mode by resolveOutcomeLibraryModeName, same as before
    // this field existed; harmlessly ignored for an ordinary "tsPackage"/"blueprint" simulation.
    modeName?: string;
};

// The one place a POST /api/project/simulations body is turned into a trusted
// ValidatedSimulationRequest — throws a plain, client-safe Error (no stack trace leaks; StudioServer
// catches this and maps it to 400) for anything malformed: a non-integer/non-positive/oversized
// `rounds`, a `seed` that's present but not a non-empty string, or a `workers` outside [1,
// MAX_SIMULATION_WORKERS].
export function validateSimulationRequest(input: SimulationRequestInput): ValidatedSimulationRequest {
    const {rounds, seed, workers, modeName} = input;

    if (typeof rounds !== "number" || !Number.isInteger(rounds) || rounds < 1) {
        throw new Error('"rounds" must be a positive integer.');
    }
    if (rounds > MAX_STUDIO_SIMULATION_ROUNDS) {
        throw new Error(`"rounds" must not exceed ${MAX_STUDIO_SIMULATION_ROUNDS}.`);
    }

    let validatedWorkers = 1;
    if (workers !== undefined) {
        if (typeof workers !== "number" || !Number.isInteger(workers) || workers < 1 || workers > MAX_SIMULATION_WORKERS) {
            throw new Error(`"workers" must be an integer between 1 and ${MAX_SIMULATION_WORKERS}.`);
        }
        validatedWorkers = workers;
    }

    if (modeName !== undefined && (typeof modeName !== "string" || modeName.trim().length === 0)) {
        throw new Error('"modeName" must be a non-empty string when given.');
    }

    if (seed === undefined) {
        return {rounds, workers: validatedWorkers, ...(modeName === undefined ? {} : {modeName})};
    }
    if (typeof seed !== "string" || seed.trim().length === 0) {
        throw new Error('"seed" must be a non-empty string when given.');
    }
    return {rounds, seed, workers: validatedWorkers, ...(modeName === undefined ? {} : {modeName})};
}
