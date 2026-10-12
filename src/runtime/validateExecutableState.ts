import type {SessionStateSchema} from "../session/SessionStateRestoring.js";
/** Validate the built-in state envelopes without constructing a session or drawing randomness.
 * Custom codecs additionally validate their opaque payload in PokieGame.validateSessionState.
 */
export function validateExecutableState(value: unknown, schema?: SessionStateSchema): void {
    if (schema !== undefined && (typeof schema !== "object" || schema === null ||
        !["base", "seeded-video-slot", "free-games", "bet-modes", "custom"].includes(schema.kind))) throw new Error("Unknown executable state schema.");
    if (schema?.kind === "custom") return;
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Executable state must be an object.");
    const state = value as Record<string, unknown>;
    if (schema?.kind === "base" && Object.keys(state).length !== 0) throw new Error("Base-game state must be empty.");
    if (schema?.kind === "seeded-video-slot" && state.rngState === undefined) throw new Error("Required seeded RNG snapshot is missing.");
    if (schema?.kind === "free-games" && (state.freeGamesNum === undefined || state.freeGamesSum === undefined || state.freeGamesBank === undefined)) throw new Error("Required free-games state is missing.");
    if (schema?.kind === "bet-modes" && state.betModeId === undefined) throw new Error("Required bet-mode state is missing.");
    if ((schema?.kind === "free-games" || schema?.kind === "bet-modes") && (schema.base === undefined || state.base === undefined)) throw new Error("Required base schema/state is missing.");
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
        if (state.base === undefined) throw new Error("Free-games state requires its nested base state.");
    }
    if ("betModeId" in state && (typeof state.betModeId !== "string" || !state.betModeId || state.base === undefined)) throw new Error("Invalid bet-mode state.");
    if (state.base !== undefined) validateExecutableState(state.base,
        schema?.kind === "free-games" || schema?.kind === "bet-modes" ? schema.base : undefined);
}
