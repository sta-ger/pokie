import type {PreGeneratedSessionRepository} from "./PreGeneratedSessionRepository.js";
import type {PreGeneratedSessionState} from "./PreGeneratedSessionState.js";

// Default PreGeneratedSessionRepository: ephemeral by design, same tradeoff as
// InMemorySessionRepository — a restart forgets every session's state.
export class InMemoryPreGeneratedSessionRepository implements PreGeneratedSessionRepository {
    private readonly states = new Map<string, PreGeneratedSessionState>();

    public save(sessionId: string, state: PreGeneratedSessionState): Promise<void> {
        this.states.set(sessionId, state);
        return Promise.resolve();
    }

    public load(sessionId: string): Promise<PreGeneratedSessionState | undefined> {
        return Promise.resolve(this.states.get(sessionId));
    }
}
