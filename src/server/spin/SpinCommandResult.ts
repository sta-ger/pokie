import type {PokieSessionState} from "../session/PokieSessionState.js";

// The outcome of SpinCommandHandler.handle(), transport-agnostic on purpose (no HTTP status codes
// here) so PokieDevServer can translate each case into a response and a future non-HTTP transport
// could reuse the same handler unchanged. `previousState`/`requestId` on the "played" case are
// additive: internal/debug-only data (state before this round, and the idempotency key that produced
// it, if any) a transport can surface via its own internal/debug response path — see
// PokieDevServer's public/internal split — without ever being part of the public response.
export type SpinCommandResult =
    | {
          status: "played";
          sessionId: string;
          state: PokieSessionState;
          previousState?: PokieSessionState;
          credits: number;
          win: number;
          requestId?: string;
      }
    | {status: "blocked"; sessionId: string; reason: string}
    | {status: "not-found"; sessionId: string};
