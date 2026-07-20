import type {PokieSessionState} from "../session/PokieSessionState.js";

// The outcome of SpinCommandHandler.handle(), transport-agnostic on purpose (no HTTP status codes
// here) so PokieDevServer can translate each case into a response and a future non-HTTP transport
// could reuse the same handler unchanged. `previousState`/`requestId`/`version` on the "played" case
// are additive: internal/debug-only data (state before this round, the idempotency key that produced
// it, if any, and the SessionRepository's own optimistic-locking revision after this round, if the
// configured repository supports one) a transport can surface via its own internal/debug response
// path — see PokieDevServer's public/internal split — without ever being part of the public response.
//
// "conflict" is a distinct outcome from "blocked"/"not-found": it means a versioned SessionRepository
// (see VersionedSessionRepository) rejected this attempt's save because the session's version moved
// between this handler's own load and save — e.g. a concurrent attempt on another PokieDevServer
// instance sharing this same repository committed first. Every wallet transaction this attempt applied
// has already been reversed and the live session evicted by the time this is returned, same
// compensation as any other mid-flight failure (see the class doc comment) — the caller/transport
// should surface this as a clear "try again" error, not a 500.
//
// "recovery-required" means a retried requestId's own prior attempt was interrupted (a process crash, or
// an in-process compensation failure — see SpinCommandHandler's own doc comment) in a way
// SpinReconciliationService could not safely resolve on its own: the checkpoint it left behind and the
// wallet's own current state disagree in a way that could mean either a phantom, un-reversed charge or a
// silently-lost result depending which is trusted, so neither is guessed at. "reason" explains exactly
// what's ambiguous; the caller/transport should surface this as a distinct "needs manual attention" case,
// never retried automatically and never treated as a plain 500 — see SpinReconciliationService's own
// "manual-recovery-required" outcome, which is what produces this.
export type SpinCommandResult =
    | {
          status: "played";
          sessionId: string;
          state: PokieSessionState;
          previousState?: PokieSessionState;
          credits: number;
          win: number;
          requestId?: string;
          version?: number;
      }
    | {status: "blocked"; sessionId: string; reason: string}
    | {status: "not-found"; sessionId: string}
    | {status: "conflict"; sessionId: string; reason: string}
    | {status: "recovery-required"; sessionId: string; requestId: string; reason: string};
