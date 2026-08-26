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
    // Only meaningful for a resolved "outcomeLibrary" project (see
    // StudioReplayExecutionService.runOutcomeSourceReplay's own doc comment) -- same "client already
    // resolved it" convention as simulationId above: for "Recent Simulation", the client reads this
    // straight off that simulation's own already-recorded modeName (never re-derived server-side from
    // simulationId), so the reproduced round preserves the exact mode the original run sampled.
    modeName?: unknown;
    // The portable native outcome-library descriptor retained by artifact inspection. It is not
    // interpreted here (the server validates it against the currently open bundle), but carrying it
    // through this request prevents a validated inspect step from being downgraded to a bare
    // seed/round replay at initiation time.
    outcomeSource?: unknown;
};

export type ValidatedReplayRequest = {
    round: number;
    seed?: string;
    simulationId?: string;
    modeName?: string;
};

// Native outcome-library selection has a stronger contract than package replay: the selected
// outcome is addressable only by all three recorded inputs.  Keep that distinction explicit at the
// shared request boundary instead of letting a caller accidentally treat an omitted seed/mode as a
// request to choose a fresh value or the manifest default.
export type ReplayValidationOptions = {
    requireOutcomeSourceProvenance?: boolean;
};

// The one place a POST /api/project/replays body is turned into a trusted ValidatedReplayRequest —
// throws a plain, client-safe Error (no stack trace leaks; StudioServer catches this and maps it to
// 400) for anything malformed: a non-integer/non-positive/oversized `round`, a `seed` that's present
// but not a non-empty string, or a `simulationId`/`modeName` that's present but not a non-empty string.
// Mirrors validateSimulationRequest.ts's own shape/reasoning.
export function validateReplayRequest(input: ReplayRequestInput, options: ReplayValidationOptions = {}): ValidatedReplayRequest {
    const {round, seed, simulationId, modeName} = input;

    if (typeof round !== "number" || !Number.isInteger(round) || round < 1) {
        throw new Error('"round" must be a positive integer.');
    }
    if (round > MAX_STUDIO_REPLAY_ROUND) {
        throw new Error(`"round" must not exceed ${MAX_STUDIO_REPLAY_ROUND}.`);
    }

    if (simulationId !== undefined && (typeof simulationId !== "string" || simulationId.trim().length === 0)) {
        throw new Error('"simulationId" must be a non-empty string when given.');
    }

    if (modeName !== undefined && (typeof modeName !== "string" || modeName.trim().length === 0)) {
        throw new Error('"modeName" must be a non-empty string when given.');
    }

    if (options.requireOutcomeSourceProvenance && seed === undefined) {
        throw new Error("Cannot exactly replay an outcome-library round without a seed. Restore the original session seed and retry.");
    }
    if (options.requireOutcomeSourceProvenance && modeName === undefined) {
        throw new Error("Cannot exactly replay an outcome-library round without its recorded mode. Restore the original mode and retry.");
    }

    const base: ValidatedReplayRequest = {
        round,
        ...(simulationId === undefined ? {} : {simulationId}),
        ...(modeName === undefined ? {} : {modeName}),
    };
    if (seed === undefined) {
        return base;
    }
    if (typeof seed !== "string" || seed.trim().length === 0) {
        throw new Error('"seed" must be a non-empty string when given.');
    }
    return {...base, seed};
}
