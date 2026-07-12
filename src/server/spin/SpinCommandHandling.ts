import type {GameSessionHandling} from "../../session/GameSessionHandling.js";
import type {SpinCommandResult} from "./SpinCommandResult.js";

export interface SpinCommandHandling {
    // Registers an already-constructed live session for sessionId, so the very next handle() call
    // for it reuses this exact object instead of reconstructing one from SessionRepository state.
    // Called by PokieDevServer.handleCreateSession right after game.createSession().
    primeSession(sessionId: string, session: GameSessionHandling): void;

    // `requestId` is optional: omit it to always run a fresh spin (the original pokie serve
    // behavior). Pass it to make a retried call with the same (sessionId, requestId) return the
    // previously computed result instead of spinning and settling the wallet again.
    //
    // `expectedVersion` is optional and additive: when given and the configured SessionRepository is
    // versioned (see VersionedSessionRepository), it's compared against the version this handler
    // itself just loaded for the session — a mismatch returns a "conflict" result immediately, before
    // canPlayNextGame()/play()/any wallet transaction, so there's nothing to compensate. This is a
    // caller-declared precondition ("I expect the session to still be at version N"), distinct from
    // the handler's own storage-level optimistic-locking save (which always uses the version it just
    // loaded, regardless of what a caller expected). Ignored when the repository isn't versioned.
    handle(sessionId: string, requestId?: string, expectedVersion?: number): Promise<SpinCommandResult>;
}
