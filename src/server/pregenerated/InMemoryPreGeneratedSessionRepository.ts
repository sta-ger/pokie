import {PreGeneratedSessionVersionConflictError} from "./PreGeneratedSessionVersionConflictError.js";
import type {PreGeneratedSessionState} from "./PreGeneratedSessionState.js";
import type {VersionedPreGeneratedSessionRepository, VersionedPreGeneratedSessionState} from "./VersionedPreGeneratedSessionRepository.js";

// Default PreGeneratedSessionRepository: ephemeral by design, same tradeoff as
// InMemorySessionRepository — a restart forgets every session's state. Also implements
// VersionedPreGeneratedSessionRepository so PreGeneratedSpinCommandHandler gets optimistic-locking
// conflict detection out of the box — see that interface's own doc comment.
export class InMemoryPreGeneratedSessionRepository implements VersionedPreGeneratedSessionRepository {
    private readonly states = new Map<string, PreGeneratedSessionState>();
    private readonly versions = new Map<string, number>();

    public save(sessionId: string, state: PreGeneratedSessionState): Promise<void> {
        this.states.set(sessionId, state);
        this.versions.set(sessionId, (this.versions.get(sessionId) ?? 0) + 1);
        return Promise.resolve();
    }

    public load(sessionId: string): Promise<PreGeneratedSessionState | undefined> {
        return Promise.resolve(this.states.get(sessionId));
    }

    public loadVersioned(sessionId: string): Promise<VersionedPreGeneratedSessionState | undefined> {
        const state = this.states.get(sessionId);
        if (state === undefined) {
            return Promise.resolve(undefined);
        }
        return Promise.resolve({state, version: this.versions.get(sessionId) ?? 0});
    }

    public saveVersioned(sessionId: string, state: PreGeneratedSessionState, expectedVersion: number): Promise<number> {
        const currentVersion = this.versions.get(sessionId) ?? 0;
        if (currentVersion !== expectedVersion) {
            return Promise.reject(new PreGeneratedSessionVersionConflictError(sessionId, expectedVersion, currentVersion));
        }
        const newVersion = currentVersion + 1;
        this.states.set(sessionId, state);
        this.versions.set(sessionId, newVersion);
        return Promise.resolve(newVersion);
    }
}
