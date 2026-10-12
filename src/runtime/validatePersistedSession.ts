import {validateExecutableState} from "./validateExecutableState.js";
import type {PokieGame} from "../gamepackage/PokieGame.js";
import type {PokieSessionState} from "../server/session/PokieSessionState.js";
import {resolveGameSessionIdentity} from "./GameSessionIdentity.js";

export function validatePersistedSession(value: unknown, game: PokieGame): {status: "incompatible-state" | "corrupt-state"; reason: string} | undefined {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {status: "corrupt-state", reason: "Session state must be an object."};
    const state = value as PokieSessionState;
    let expected: ReturnType<typeof resolveGameSessionIdentity>;
    try {
        expected = resolveGameSessionIdentity(game);
    } catch (error) {
        return {status: "incompatible-state", reason: error instanceof Error ? error.message : String(error)};
    }
    if (state.identity === undefined) return {status: "incompatible-state", reason: "Session has no game/model/schema identity. Explicitly create a new session; legacy snapshots cannot prove compatibility."};
    if (state.identity === null || typeof state.identity !== "object" || Array.isArray(state.identity)) return {status: "corrupt-state", reason: "Invalid session identity."};
    for (const key of ["gameId", "compatibilityVersion", "stateSchemaVersion", "modelHash"] as const) {
        if (state.identity[key] !== expected[key]) return {status: "incompatible-state", reason: `Session ${key} does not match the selected game.`};
    }
    if (!Number.isFinite(state.bet) || state.bet <= 0 || !Number.isFinite(state.win) || state.win < 0 ||
        !Number.isFinite(state.credits) || (state.credits as number) < 0 ||
        (state.screen !== undefined && (!Array.isArray(state.screen) || !state.screen.every(Array.isArray))) ||
        (state.executionState !== "live-only" && state.executionState !== "durably-restorable") ||
        (state.executionState === "durably-restorable" && state.featureState === undefined)) {
        return {status: "corrupt-state", reason: "Session contains invalid or missing executable/observable fields."};
    }
    const capabilities = state.commandCapabilities;
    if (capabilities === undefined || capabilities === null || typeof capabilities !== "object" || Array.isArray(capabilities) || !Array.isArray(capabilities.bets) || capabilities.bets.length === 0 ||
        !capabilities.bets.every(bet => typeof bet === "number" && Number.isFinite(bet) && bet > 0) || !capabilities.bets.includes(state.bet) ||
        (capabilities.modes !== undefined && (!Array.isArray(capabilities.modes) || !capabilities.modes.every(mode => typeof mode === "string" && mode.length > 0)))) {
        return {status: "corrupt-state", reason: "Session command capabilities are missing or invalid."};
    }
    if (state.context !== undefined && (typeof state.context !== "object" || state.context === null || Array.isArray(state.context) ||
        (state.context.seed !== undefined && typeof state.context.seed !== "string" && (typeof state.context.seed !== "number" || !Number.isFinite(state.context.seed))) ||
        (state.context.options !== undefined && (typeof state.context.options !== "object" || state.context.options === null || Array.isArray(state.context.options))))) {
        return {status: "corrupt-state", reason: "Invalid construction context."};
    }
    try {
        if (state.executionState === "durably-restorable") {
            if (state.stateSchema === undefined) throw new Error("Required executable state schema is missing.");
            validateExecutableState(state.featureState, state.stateSchema);
            if (state.stateSchema.kind === "bet-modes" && !state.commandCapabilities?.modes?.includes((state.featureState as {betModeId: string}).betModeId)) {
                throw new Error("Persisted bet mode is not supported by the resolved model.");
            }
        }
        game.validateSessionState?.(state.featureState, state.context);
    } catch (error) {
        return {status: "corrupt-state", reason: error instanceof Error ? error.message : String(error)};
    }
    return undefined;
}
