import type {PreGeneratedSessionRepository} from "./PreGeneratedSessionRepository.js";
import type {PreGeneratedSessionState} from "./PreGeneratedSessionState.js";

// A versioned snapshot returned by VersionedPreGeneratedSessionRepository.loadVersioned(): the same
// PreGeneratedSessionState load() already returns, paired with the storage-level revision it was read at.
export type VersionedPreGeneratedSessionState = {
    state: PreGeneratedSessionState;
    version: number;
};

// Additive optimistic-locking API — additive to PreGeneratedSessionRepository the same way
// VersionedSessionRepository is additive to SessionRepository (see that interface's own doc comment
// for the full rationale, which applies here unchanged): lets PreGeneratedSpinCommandHandler detect a
// session that moved between its own load and save — e.g. two PreGeneratedSpinCommandHandler instances
// (or processes) sharing one repository — and reject the loser with a clear conflict instead of
// silently overwriting whichever attempt committed first. A plain PreGeneratedSessionRepository
// (implementing only save()/load()) keeps working exactly as before, with no conflict detection — see
// isVersionedPreGeneratedSessionRepository().
export interface VersionedPreGeneratedSessionRepository extends PreGeneratedSessionRepository {
    // The version starts at 1 after the very first save() and increments by 1 on every subsequent
    // save()/successful saveVersioned() for that sessionId — never on a saveVersioned() that
    // conflicts. Returns undefined under the same condition load() would (sessionId never saved).
    loadVersioned(sessionId: string): Promise<VersionedPreGeneratedSessionState | undefined>;

    // Persists `state` only if the repository's current version for sessionId is exactly
    // expectedVersion, then returns the new (incremented) version. Rejects with a
    // PreGeneratedSessionVersionConflictError — leaving whatever is currently stored completely
    // untouched — when the current version doesn't match, e.g. because a different attempt (this same
    // process or another one sharing this repository) already saved in between this caller's load and
    // save.
    saveVersioned(sessionId: string, state: PreGeneratedSessionState, expectedVersion: number): Promise<number>;
}
