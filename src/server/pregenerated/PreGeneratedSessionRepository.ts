import type {PreGeneratedSessionState} from "./PreGeneratedSessionState.js";

// A replaceable store for a pre-generated session's own state — the counterpart to SessionRepository
// for the pre-generated round path.
export interface PreGeneratedSessionRepository {
    save(sessionId: string, state: PreGeneratedSessionState): Promise<void>;

    load(sessionId: string): Promise<PreGeneratedSessionState | undefined>;
}
