import {MAX_SIMULATION_WORKERS} from "@fromstan/pokie";
import {MAX_STUDIO_SIMULATION_ROUNDS} from "./StudioSimulationLimits.js";

export type SimulationRequestInput = {
    rounds?: unknown;
    seed?: unknown;
    workers?: unknown;
    modeName?: unknown;
    convergence?: unknown;
};

export type ValidatedSimulationRequest = {
    rounds: number;
    convergence?: import("../../../src/simulation/SimulationConvergenceOptions.js").SimulationConvergenceOptions;
    seed?: string;
    // Optional (rather than required) so a hand-built ValidatedSimulationRequest (as used throughout
    // StudioSimulationService's own tests, calling start() directly without going through this
    // validator) doesn't need to specify it just to get the default — StudioSimulationService.start()
    // treats a missing value the same as 1, same as validateSimulationRequest() does below.
    workers?: number;
    // Package mode id (or "all"), or a native outcome-library mode name.
    modeName?: string;
};

// The one place a POST /api/project/simulations body is turned into a trusted
// ValidatedSimulationRequest — throws a plain, client-safe Error (no stack trace leaks; StudioServer
// catches this and maps it to 400) for anything malformed: a non-integer/non-positive/oversized
// `rounds`, a `seed` that's present but not a non-empty string, or a `workers` outside [1,
// MAX_SIMULATION_WORKERS].
export function validateSimulationRequest(input: SimulationRequestInput): ValidatedSimulationRequest {
    const {rounds, seed, workers, modeName} = input;
    const convergence = validateSimulationConvergence(input.convergence);

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
        return {rounds, ...(convergence ? {convergence} : {}), workers: validatedWorkers, ...(modeName === undefined ? {} : {modeName})};
    }
    if (typeof seed !== "string" || seed.trim().length === 0) {
        throw new Error('"seed" must be a non-empty string when given.');
    }
    return {rounds, seed, ...(convergence ? {convergence} : {}), workers: validatedWorkers, ...(modeName === undefined ? {} : {modeName})};
}

/** Adaptive options are one coherent request group, never silently ignored. */
export function validateSimulationConvergence(value: unknown): ValidatedSimulationRequest["convergence"] {
    if (value === undefined) return undefined;
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error('"convergence" must be an adaptive options object.');
    const c = value as Record<string, unknown>;
    if (Object.keys(c).some(k => !["minRounds", "rtpTolerance", "checkIntervalRounds", "stableChecks"].includes(k))) throw new Error('Unknown "convergence" option.');
    const integer = (v: unknown, min: number): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= MAX_STUDIO_SIMULATION_ROUNDS;
    if (!integer(c.minRounds, 0) || !integer(c.checkIntervalRounds, 1) || typeof c.rtpTolerance !== "number" || !Number.isFinite(c.rtpTolerance) || c.rtpTolerance <= 0 || (c.stableChecks !== undefined && !integer(c.stableChecks, 1))) {
        throw new Error('"convergence" requires minRounds (non-negative integer), rtpTolerance (positive finite RTP units), checkIntervalRounds (positive integer), and optional stableChecks (positive integer).');
    }
    return {minRounds: c.minRounds, rtpTolerance: c.rtpTolerance, checkIntervalRounds: c.checkIntervalRounds, ...(c.stableChecks === undefined ? {} : {stableChecks: c.stableChecks as number})};
}
