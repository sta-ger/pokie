import type {LiveSnapshotPolicy} from "./internal/LiveSessionAuthority.js";
import type {SessionStateSchema} from "../session/SessionStateRestoring.js";
/** Validate the built-in state envelopes without constructing a session or drawing randomness.
 * Custom codecs additionally validate their opaque payload in PokieGame.validateSessionState.
 * The built-in live-only partial policy permits an absent RNG/reel pair, while preserving model
 * constraints, feature counters and nested envelopes. It never authorizes reconstruction.
 */
export function validateExecutableState(value: unknown, schema?: SessionStateSchema, customValidator?: (state: unknown) => void, partial?: boolean, live?: LiveSnapshotPolicy): void {
    partial = live?.partial ?? partial ?? false;
    if (schema !== undefined && (typeof schema !== "object" || schema === null ||
        !["base", "seeded-video-slot", "free-games", "bet-modes", "custom"].includes(schema.kind))) throw new Error("Unknown executable state schema.");
    if (schema?.kind === "custom") {
        if (live?.opaque === true) {
            if (value === undefined && !live.optional) throw new Error("Required opaque live snapshot is missing.");
            return;
        }
        if (customValidator === undefined) throw new Error("Custom executable state requires the selected game's validator.");
        customValidator(value);
        return;
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Executable state must be an object.");
    const state = value as Record<string, unknown>;
    if (schema?.kind === "base" && Object.keys(state).length !== 0) throw new Error("Base-game state must be empty.");
    if (partial && schema?.kind === "seeded-video-slot" && (state.rngState === undefined) !== (state.reelStrips === undefined)) throw new Error("Partial seeded state must omit RNG and reels together.");
    if (!partial && schema?.kind === "seeded-video-slot" && state.rngState === undefined) throw new Error("Required seeded RNG snapshot is missing.");
    if (schema?.kind === "seeded-video-slot" && (!partial || state.reelStrips !== undefined) && (!Array.isArray(state.reelStrips) || state.reelStrips.length === 0 ||
        !state.reelStrips.every(strip => Array.isArray(strip) && strip.length > 0 && strip.every(symbol => typeof symbol === "string" || (typeof symbol === "number" && Number.isFinite(symbol)))))) throw new Error("Required resolved reel strips are missing or invalid.");
    if (schema?.kind === "seeded-video-slot" && state.reelStrips !== undefined) {
        const strips = state.reelStrips as (string | number)[][];
        if ((schema.reels !== undefined && strips.length !== schema.reels) ||
            (schema.symbols !== undefined && !strips.every(strip => strip.every(symbol => schema.symbols!.includes(symbol))))) throw new Error("Resolved reel strips do not match the selected model.");
    }
    if (schema?.kind === "free-games" && (state.freeGamesNum === undefined || state.freeGamesSum === undefined || state.freeGamesBank === undefined)) throw new Error("Required free-games state is missing.");
    if (schema?.kind === "bet-modes" && state.betModeId === undefined) throw new Error("Required bet-mode state is missing.");
    if ((schema?.kind === "free-games" || schema?.kind === "bet-modes") && (schema.base === undefined || (state.base === undefined && live?.base?.optional !== true))) throw new Error("Required base schema/state is missing.");
    if ("rngState" in state && (typeof state.rngState !== "number" || !Number.isSafeInteger(state.rngState) || state.rngState < 0 || state.rngState > 0xffffffff)) {
        throw new Error("Invalid seeded RNG snapshot.");
    }
    if ("freeGamesNum" in state || "freeGamesSum" in state || "freeGamesBank" in state) {
        for (const key of ["freeGamesNum", "freeGamesSum"] as const) {
            if (typeof state[key] !== "number" || !Number.isSafeInteger(state[key]) || state[key] < 0) throw new Error(`Invalid ${key}.`);
        }
        if ((state.freeGamesNum as number) > (state.freeGamesSum as number) ||
            typeof state.freeGamesBank !== "number" || !Number.isFinite(state.freeGamesBank) || state.freeGamesBank < 0 ||
            (state.wonFreeGamesNumber !== undefined && (typeof state.wonFreeGamesNumber !== "number" || !Number.isSafeInteger(state.wonFreeGamesNumber) || state.wonFreeGamesNumber < 0))) throw new Error("Invalid free-games progress or bank.");
        if (state.base === undefined && live?.base?.optional !== true) throw new Error("Free-games state requires its nested base state.");
    }
    if ("betModeId" in state && (typeof state.betModeId !== "string" || !state.betModeId || (state.base === undefined && live?.base?.optional !== true))) throw new Error("Invalid bet-mode state.");
    if (schema?.kind === "bet-modes" && live !== undefined && !live.modes?.includes(state.betModeId as string)) throw new Error("Persisted bet mode is not supported by the trusted live model.");
    if (state.base !== undefined) validateExecutableState(state.base,
        schema?.kind === "free-games" || schema?.kind === "bet-modes" ? schema.base : undefined, customValidator, partial, live?.base);
}
