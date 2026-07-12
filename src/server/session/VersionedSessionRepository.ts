import type {PokieSessionState} from "./PokieSessionState.js";
import type {SessionRepository} from "./SessionRepository.js";

// A versioned snapshot returned by VersionedSessionRepository.loadVersioned(): the same
// PokieSessionState load() already returns, paired with the storage-level revision it was read at.
export type VersionedSessionState = {
    state: PokieSessionState;
    version: number;
};

// Additive optimistic-locking API — additive to SessionRepository the same way TransactionalWalletPort
// is additive to WalletPort (see isTransactionalWalletPort.ts). A repository implementing this lets
// SpinCommandHandler detect a session that moved between its own load and save — e.g. two
// PokieDevServer instances (or processes) sharing one FileSessionRepository directory, each running
// its own in-process command queue that only serializes commands *within* that one instance — and
// reject the loser with a clear conflict instead of silently overwriting whichever attempt committed
// first. A plain SessionRepository (implementing only save()/load()) keeps working exactly as before,
// with no conflict detection — see isVersionedSessionRepository().
export interface VersionedSessionRepository extends SessionRepository {
    // The version starts at 1 after the very first save() and increments by 1 on every subsequent
    // save()/successful saveVersioned() for that sessionId — never on a saveVersioned() that
    // conflicts. Returns undefined under the same condition load() would (sessionId never saved, or a
    // FileSessionRepository whose file is missing/corrupted).
    loadVersioned(sessionId: string): Promise<VersionedSessionState | undefined>;

    // Persists `state` only if the repository's current version for sessionId is exactly
    // expectedVersion, then returns the new (incremented) version. Rejects with a
    // SessionVersionConflictError — leaving whatever is currently stored completely untouched — when
    // the current version doesn't match, e.g. because a different attempt (this same process or
    // another one sharing this repository) already saved in between this caller's load and save.
    saveVersioned(sessionId: string, state: PokieSessionState, expectedVersion: number): Promise<number>;
}
