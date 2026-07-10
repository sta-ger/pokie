import type {PokieSessionState} from "./PokieSessionState.js";
import type {SessionRepository} from "./SessionRepository.js";

// Default SessionRepository: state lives only in a Map for the lifetime of the process,
// same as PokieDevServer's original behavior before storage became replaceable.
export class InMemorySessionRepository implements SessionRepository {
    private readonly states = new Map<string, PokieSessionState>();

    public save(sessionId: string, state: PokieSessionState): Promise<void> {
        this.states.set(sessionId, state);
        return Promise.resolve();
    }

    public load(sessionId: string): Promise<PokieSessionState | undefined> {
        return Promise.resolve(this.states.get(sessionId));
    }
}
