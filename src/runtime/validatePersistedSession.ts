import {validateLogicalRound} from "./LogicalRound.js";
import {captureCoordinatePublicPayload} from "../server/session/internal/captureCoordinatePublicPayload.js";
import {ScreenProjection} from "../session/videoslot/coordinates/ScreenProjection.js";
import type {LiveSessionAuthority, LiveSnapshotPolicy} from "./internal/LiveSessionAuthority.js";
import {RoundArtifactValidator} from "../artifact/RoundArtifactValidator.js";
import {sessionStateSchemasMatch, type SessionStateSchema} from "../session/SessionStateRestoring.js";
import {validateExecutableState} from "./validateExecutableState.js";
import type {PokieGame} from "../gamepackage/PokieGame.js";
import type {PokieSessionState} from "../server/session/PokieSessionState.js";
import {resolveGameSessionIdentity} from "./GameSessionIdentity.js";

export function validatePersistedSession(value: unknown, game: PokieGame, live?: LiveSessionAuthority, sessionId?: string): {status: "incompatible-state" | "corrupt-state" | "restoration-unsupported"; reason: string} | undefined {
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
    try {
        if (state.coordinates !== undefined) {
            const expectedScreen = new ScreenProjection(state.coordinates.geometry).project(state.coordinates.generatedScreen, "visible");
            if (JSON.stringify(expectedScreen) !== JSON.stringify(state.screen)) throw new Error("Persisted viewport does not match generated coordinate evidence.");
            if (state.roundPayload) captureCoordinatePublicPayload(state, state.roundPayload);
            if (state.roundArtifact && (JSON.stringify(state.roundArtifact.geometry) !== JSON.stringify(state.coordinates.geometry) ||
                JSON.stringify(state.roundArtifact.generatedScreen) !== JSON.stringify(state.coordinates.generatedScreen))) throw new Error("Persisted artifact coordinate evidence differs from session capture.");
        }
        let schema = state.stateSchema;
        const visitedSchemas = new Set<unknown>();
        while (schema && "base" in schema) {
            if (visitedSchemas.has(schema)) throw new Error("Cyclic executable state schema.");
            visitedSchemas.add(schema);
            schema = schema.base;
        }
        if (schema?.kind === "seeded-video-slot" && schema.screenGeometry && !new ScreenProjection(schema.screenGeometry).isIdentity() &&
            JSON.stringify(new ScreenProjection(schema.screenGeometry).getGeometry()) !== JSON.stringify(state.coordinates?.geometry)) throw new Error("Persisted coordinate contract is missing or differs from its schema.");
    } catch (error) {
        return {status: "corrupt-state", reason: String(error)};
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
    if (state.logicalRound !== undefined) {
        const invalid = validateLogicalRound(state.logicalRound);
        if (invalid) return {status: "corrupt-state", reason: invalid};
        if (sessionId !== undefined && (state.logicalRound.entry as {sessionId?: string}).sessionId !== sessionId) return {status: "corrupt-state", reason: "Retained logical round belongs to another session."};
        const last = state.logicalRound.subrounds[state.logicalRound.cursor - 1];
        if (last.win !== state.win || last.credits !== state.credits || (last.screen !== undefined && JSON.stringify(last.screen) !== JSON.stringify(state.screen))) return {status: "corrupt-state", reason: "Retained logical output differs from executable capture."};
        let schema = state.stateSchema;
        let feature = state.featureState as {base?: unknown; freeGamesNum?: number; freeGamesSum?: number} | undefined;
        let pending = false;
        let known = schema?.kind !== "custom";
        while (schema && (schema.kind === "free-games" || schema.kind === "bet-modes")) {
            if (schema.kind === "free-games") pending ||= (feature?.freeGamesNum ?? 0) < (feature?.freeGamesSum ?? 0);
            feature = feature?.base as typeof feature;
            schema = schema.base;
            if (schema.kind === "custom") known = false;
        }
        if (known && (state.logicalRound.mathematicalStatus === "pending") !== pending) return {status: "corrupt-state", reason: "Logical progress differs from executable feature progress."};
        if (state.logicalRound.bet !== state.bet) return {status: "corrupt-state", reason: "Logical entry bet differs from executable selection."};
    }
    if (state.logicalRoundIds !== undefined && (!Array.isArray(state.logicalRoundIds) || new Set(state.logicalRoundIds).size !== state.logicalRoundIds.length || state.logicalRoundIds.some(id => typeof id !== "string" || !id.trim() || id.includes("\0")) || (state.logicalRound !== undefined && !state.logicalRoundIds.includes(state.logicalRound.id)))) return {status: "corrupt-state", reason: "Invalid retained logical entry identities."};
    if (state.logicalRoundDeliverySupported !== undefined && typeof state.logicalRoundDeliverySupported !== "boolean") return {status: "corrupt-state", reason: "Invalid logical delivery capability."};
    const statistics = state.logicalRoundStatistics;
    if (statistics !== undefined && (!statistics || !Number.isSafeInteger(statistics.rounds) || statistics.rounds < 0 || !Number.isSafeInteger(statistics.steps) || statistics.steps < statistics.rounds || ![statistics.totalStake, statistics.totalWin].every(n => Number.isFinite(n) && n >= 0))) return {status: "corrupt-state", reason: "Invalid logical-round statistics."};
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
        const schema = game.getSessionStateSchema?.();
        if (schema !== undefined) {
            // Capability markers and missing snapshots cannot choose a weaker codec.
            if (!sessionStateSchemasMatch(schema, state.stateSchema)) throw new Error("Stored executable schema does not match the selected game codec.");
            const validator = state.executionState === "live-only" ? game.validateLiveSessionState ?? game.validateSessionState : game.validateSessionState;
            validateExecutableState(state.featureState, schema,
                validator === undefined ? undefined : value => Reflect.apply(validator, game, [value, state.context]), state.executionState === "live-only" && game.validateLiveSessionState !== undefined);
            if (schema.kind !== "custom" && validator !== undefined) Reflect.apply(validator, game, [state.featureState, state.context]);
        } else {
            if (state.executionState === "durably-restorable") return {status: "incompatible-state", reason: "Selected game does not declare an authoritative executable state codec."};
            // Legacy packages with no executable codec retain observable live-only envelopes.
            // They cannot authorize reconstruction or selection from this metadata.
            if (live !== undefined) {
                if (!sessionStateSchemasMatch(live.schema, state.stateSchema)) throw new Error("Stored executable schema does not match the trusted live session.");
                validateExecutableState(state.featureState, live.schema, undefined, false, live.snapshotPolicy);
            } else if (game.getSessionCommandCapabilities === undefined) return {status: "restoration-unsupported", reason: "Session requires trusted live snapshot authority; its live executable state has been lost."};
            else if (state.featureState !== undefined) validateExecutableState(state.featureState);
            game.validateLiveSessionState?.(state.featureState, state.context);
        }
        const declared = game.getSessionCommandCapabilities?.(state.context);
        if (declared === undefined && state.executionState === "durably-restorable") return {status: "incompatible-state", reason: "Selected game does not declare authoritative command capabilities."};
        const authority = declared ?? live?.capabilities;
        if (authority === undefined) return {status: "restoration-unsupported", reason: "Session requires trusted live command authority; its live executable state has been lost."};
        if (!supportsSelections(authority.bets, capabilities.bets) || !supportsSelections(authority.modes, capabilities.modes)) {
            throw new Error("Stored command capabilities do not match the selected game model.");
        }
        validateSelectedModes(state.featureState, schema ?? live?.schema, authority.modes, capabilities.modes, schema === undefined ? live?.snapshotPolicy : undefined);
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

function supportsSelections<T extends string | number>(expected: readonly T[] | undefined, actual: readonly T[] | undefined): boolean {
    if (actual === undefined) return true;
    return Array.isArray(expected) && new Set(actual).size === actual.length && actual.every(selection => expected.includes(selection));
}

// Declared authority applies throughout its codec and its observable-only retry fallback.
// Trusted live compositions validate each node against its own captured construction policy.
function validateSelectedModes(value: unknown, schema: SessionStateSchema | undefined, modes: readonly string[] | undefined, restrictions?: readonly string[], live?: LiveSnapshotPolicy): void {
    if ((schema !== undefined && schema.kind !== "free-games" && schema.kind !== "bet-modes") || value === undefined) return;
    const state = value as {betModeId?: string; base?: unknown};
    if ((schema?.kind === "bet-modes" || (schema === undefined && state.betModeId !== undefined)) && (!(live?.modes ?? modes)?.includes(state.betModeId as string) || (restrictions !== undefined && !restrictions.includes(state.betModeId as string)))) throw new Error("Persisted bet mode is not supported by the resolved model.");
    validateSelectedModes(state.base, schema?.base, modes, restrictions, live?.base);
}
