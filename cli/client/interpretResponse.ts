import type {SessionResponse} from "./types.js";

export type KnownRoundView = {
    credits: number;
    bet?: number;
    win?: number;
    screen?: unknown[][];
};

// Generic, name-agnostic interpretation of a session response: recognizes the handful of
// conceptually-universal fields across both the legacy narrow DTO (win/screen) and a richer
// net/-serializer payload (totalWin/reelsSymbols), without knowing anything about any specific
// game or mechanic. Everything else in the response is left for the raw-JSON fallback view — see
// dom.ts's renderRawJson.
export function extractKnownRoundView(response: SessionResponse): KnownRoundView {
    return {
        credits: response.credits,
        bet: pickNumber(response, ["bet"]),
        win: pickNumber(response, ["win", "totalWin"]),
        screen: pickArray(response, ["screen", "reelsSymbols"]),
    };
}

// A response using MultiStageRoundSessionSerializer (e.g. CascadeSessionSerializer) carries a
// generic `stages` array — this is what lets the client play back multi-stage/cascade rounds
// without any cascade-specific code: it recognizes the universal envelope, not the mechanic.
export function extractStages(response: SessionResponse): unknown[] | undefined {
    const stages = response.stages;
    return Array.isArray(stages) ? stages : undefined;
}

function pickNumber(response: SessionResponse, keys: string[]): number | undefined {
    for (const key of keys) {
        const value = response[key];
        if (typeof value === "number") {
            return value;
        }
    }
    return undefined;
}

function pickArray(response: SessionResponse, keys: string[]): unknown[][] | undefined {
    for (const key of keys) {
        const value = response[key];
        if (Array.isArray(value)) {
            return value as unknown[][];
        }
    }
    return undefined;
}
