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
    handle(sessionId: string, requestId?: string): Promise<SpinCommandResult>;
}
