import {MAX_STUDIO_REPLAY_ROUND} from "./StudioReplayLimits.js";

export type ReplayRequestInput = {
    round?: unknown;
    seed?: unknown;
    // Only ever set by the Replay tab's own "Recent Simulation" source (see ReplayTab.tsx) — the id of
    // the completed simulation report this round/seed was picked from. Never used to derive round/seed
    // themselves (the client already resolved those); its only purpose is letting StudioServer verify
    // the reference is real before tagging the reproduced round as a genuine simulation sample (see
    // StudioServer.handleStartReplay).
    simulationId?: unknown;
};

export type ValidatedReplayRequest = {
    round: number;
    seed?: string;
    simulationId?: string;
};

// The one place a POST /api/project/replays body is turned into a trusted ValidatedReplayRequest —
// throws a plain, client-safe Error (no stack trace leaks; StudioServer catches this and maps it to
// 400) for anything malformed: a non-integer/non-positive/oversized `round`, a `seed` that's present
// but not a non-empty string, or a `simulationId` that's present but not a non-empty string. Mirrors
// validateSimulationRequest.ts's own shape/reasoning.
export function validateReplayRequest(input: ReplayRequestInput): ValidatedReplayRequest {
    const {round, seed, simulationId} = input;

    if (typeof round !== "number" || !Number.isInteger(round) || round < 1) {
        throw new Error('"round" must be a positive integer.');
    }
    if (round > MAX_STUDIO_REPLAY_ROUND) {
        throw new Error(`"round" must not exceed ${MAX_STUDIO_REPLAY_ROUND}.`);
    }

    if (simulationId !== undefined && (typeof simulationId !== "string" || simulationId.trim().length === 0)) {
        throw new Error('"simulationId" must be a non-empty string when given.');
    }

    if (seed === undefined) {
        return simulationId === undefined ? {round} : {round, simulationId};
    }
    if (typeof seed !== "string" || seed.trim().length === 0) {
        throw new Error('"seed" must be a non-empty string when given.');
    }
    return simulationId === undefined ? {round, seed} : {round, seed, simulationId};
}
