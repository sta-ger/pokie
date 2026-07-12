import type {PokieSessionState} from "./PokieSessionState.js";
import {SessionVersionConflictError} from "./SessionVersionConflictError.js";
import type {VersionedSessionRepository, VersionedSessionState} from "./VersionedSessionRepository.js";

// Default SessionRepository: state lives only in a Map for the lifetime of the process, same as
// PokieDevServer's original behavior before storage became replaceable. Also implements
// VersionedSessionRepository so SpinCommandHandler gets optimistic-locking conflict detection out of
// the box — see that interface's own doc comment.
export class InMemorySessionRepository implements VersionedSessionRepository {
    private readonly states = new Map<string, PokieSessionState>();
    private readonly versions = new Map<string, number>();

    public save(sessionId: string, state: PokieSessionState): Promise<void> {
        this.states.set(sessionId, state);
        this.versions.set(sessionId, (this.versions.get(sessionId) ?? 0) + 1);
        return Promise.resolve();
    }

    public load(sessionId: string): Promise<PokieSessionState | undefined> {
        return Promise.resolve(this.states.get(sessionId));
    }

    public loadVersioned(sessionId: string): Promise<VersionedSessionState | undefined> {
        const state = this.states.get(sessionId);
        if (state === undefined) {
            return Promise.resolve(undefined);
        }
        return Promise.resolve({state, version: this.versions.get(sessionId) ?? 0});
    }

    public saveVersioned(sessionId: string, state: PokieSessionState, expectedVersion: number): Promise<number> {
        const currentVersion = this.versions.get(sessionId) ?? 0;
        if (currentVersion !== expectedVersion) {
            return Promise.reject(new SessionVersionConflictError(sessionId, expectedVersion, currentVersion));
        }
        const newVersion = currentVersion + 1;
        this.states.set(sessionId, state);
        this.versions.set(sessionId, newVersion);
        return Promise.resolve(newVersion);
    }
}
