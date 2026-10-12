import type {GameSessionHandling} from "./GameSessionHandling.js";

export type SessionStateSchema =
    | {readonly kind: "base" | "custom"}
    | {readonly kind: "seeded-video-slot"; readonly reels?: number; readonly symbols?: readonly (string | number)[]}
    | {readonly kind: "free-games" | "bet-modes"; readonly base: SessionStateSchema};

/** Explicit promise that the codec covers every collaborator influencing future rounds. */
export interface SessionStateRestoring {
    isSessionStateRestorable(): boolean;
    validateSessionState(state: unknown): void;
    getSessionStateSchema?(): SessionStateSchema;
}

export function isSessionStateRestorable(session: GameSessionHandling): boolean {
    const codec = session as Partial<SessionStateRestoring> & {toSessionState?: unknown; fromSessionState?: unknown};
    return typeof codec.isSessionStateRestorable === "function" && codec.isSessionStateRestorable() &&
        typeof codec.validateSessionState === "function" &&
        typeof codec.toSessionState === "function" && typeof codec.fromSessionState === "function";
}

export function resolveSessionStateSchema(session: GameSessionHandling): SessionStateSchema {
    return (session as Partial<SessionStateRestoring>).getSessionStateSchema?.() ?? {kind: "custom"};
}

export function sessionStateSchemasMatch(first: SessionStateSchema, second: SessionStateSchema | undefined): boolean {
    if (first.kind !== second?.kind) return false;
    if (first.kind === "free-games" || first.kind === "bet-modes") {
        return second !== undefined && "base" in second && sessionStateSchemasMatch(first.base, second.base);
    }
    return true;
}
