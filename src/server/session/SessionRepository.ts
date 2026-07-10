import type {PokieSessionState} from "./PokieSessionState.js";

// A replaceable store for serializable game-session state — never live session objects
// (see PokieDevServer, which reconstructs a session from PokieGame.createSession() plus this
// state when there's no live session object cached for a sessionId).
export interface SessionRepository {
    save(sessionId: string, state: PokieSessionState): Promise<void>;

    load(sessionId: string): Promise<PokieSessionState | undefined>;
}
