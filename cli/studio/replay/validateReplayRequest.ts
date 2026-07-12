import {MAX_STUDIO_REPLAY_ROUND} from "./StudioReplayLimits.js";

export type ReplayRequestInput = {
    round?: unknown;
    seed?: unknown;
};

export type ValidatedReplayRequest = {
    round: number;
    seed?: string;
};

// The one place a POST /api/project/replays body is turned into a trusted ValidatedReplayRequest —
// throws a plain, client-safe Error (no stack trace leaks; StudioServer catches this and maps it to
// 400) for anything malformed: a non-integer/non-positive/oversized `round`, or a `seed` that's
// present but not a non-empty string. Mirrors validateSimulationRequest.ts's own shape/reasoning.
export function validateReplayRequest(input: ReplayRequestInput): ValidatedReplayRequest {
    const {round, seed} = input;

    if (typeof round !== "number" || !Number.isInteger(round) || round < 1) {
        throw new Error('"round" must be a positive integer.');
    }
    if (round > MAX_STUDIO_REPLAY_ROUND) {
        throw new Error(`"round" must not exceed ${MAX_STUDIO_REPLAY_ROUND}.`);
    }

    if (seed === undefined) {
        return {round};
    }
    if (typeof seed !== "string" || seed.trim().length === 0) {
        throw new Error('"seed" must be a non-empty string when given.');
    }
    return {round, seed};
}
