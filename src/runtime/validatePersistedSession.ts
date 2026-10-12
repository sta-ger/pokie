import {RoundArtifactValidator} from "../artifact/RoundArtifactValidator.js";
import {sessionStateSchemasMatch} from "../session/SessionStateRestoring.js";
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
    for (const key of ["initialPayload", "roundPayload", "initialDebugPayload", "roundDebugPayload"] as const) {
        if (state[key] !== undefined && (typeof state[key] !== "object" || state[key] === null || Array.isArray(state[key]))) return {status: "corrupt-state", reason: `Invalid ${key}.`};
    }
    if (state.capturePolicy !== undefined && (typeof state.capturePolicy !== "object" || state.capturePolicy === null ||
        state.capturePolicy.version !== 1 || !["partial", "full"].includes(state.capturePolicy.mode) || typeof state.capturePolicy.captureDebugPayloads !== "boolean")) {
        return {status: "corrupt-state", reason: "Invalid session capture policy."};
    }
    if (state.roundArtifactUnavailableReason !== undefined && typeof state.roundArtifactUnavailableReason !== "string") return {status: "corrupt-state", reason: "Invalid round artifact diagnostic."};
    if (state.roundArtifact !== undefined && new RoundArtifactValidator().validate(state.roundArtifact).length > 0) return {status: "corrupt-state", reason: "Invalid captured round artifact."};
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
    if (!isSnapshotData(state)) return {status: "corrupt-state", reason: "Session contains nonfinite, cyclic or nonserializable snapshot data."};
    try {
        if (state.executionState === "durably-restorable") {
            if (state.stateSchema === undefined) throw new Error("Required executable state schema is missing.");
            const schema = game.getSessionStateSchema?.();
            if (schema === undefined) return {status: "incompatible-state", reason: "Selected game does not declare an authoritative executable state codec."};
            if (!sessionStateSchemasMatch(schema, state.stateSchema)) throw new Error("Stored executable schema does not match the selected game codec.");
            validateExecutableState(state.featureState, schema, game.validateSessionState === undefined ? undefined : value => game.validateSessionState!(value, state.context));
            if (schema.kind !== "custom") game.validateSessionState?.(state.featureState, state.context);
            if (state.stateSchema.kind === "bet-modes" && !state.commandCapabilities?.modes?.includes((state.featureState as {betModeId: string}).betModeId)) {
                throw new Error("Persisted bet mode is not supported by the resolved model.");
            }
        }
        if (state.executionState === "live-only" && state.featureState !== undefined) {
            const schema = game.getSessionStateSchema?.();
            if (schema !== undefined) {
                if (!sessionStateSchemasMatch(schema, state.stateSchema)) throw new Error("Stored executable schema does not match the selected game codec.");
                // Live-only collaborators can expose partial snapshots. Their game validator owns them.
                if (schema.kind === "custom") validateExecutableState(state.featureState, schema, game.validateSessionState === undefined ? undefined : value => game.validateSessionState!(value, state.context));
                else {
                    validateExecutableState(state.featureState);
                    game.validateSessionState?.(state.featureState, state.context);
                }
            } else {
                // A package without a declared codec stays live-only. It cannot authorize an
                // executable snapshot for reconstruction; partial observable envelopes still
                // receive nonmutating structural validation before publication.
                validateExecutableState(state.featureState);
            }
        }
    } catch (error) {
        return {status: "corrupt-state", reason: error instanceof Error ? error.message : String(error)};
    }
    return undefined;
}

// Optional object properties may be undefined before file serialization. All retained values
// must otherwise be finite JSON data; a permissive custom codec cannot authorize executable code.
function isSnapshotData(value: unknown, parents = new Set<object>(), depth = 0): boolean {
    if (value === undefined || value === null || typeof value === "string" || typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value !== "object" || depth > 128 || parents.has(value)) return false;
    parents.add(value);
    const valid = Object.values(value).every(child => isSnapshotData(child, parents, depth + 1));
    parents.delete(value);
    return valid;
}
