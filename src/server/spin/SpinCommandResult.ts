import type {PokieSessionState} from "../session/PokieSessionState.js";

// The outcome of SpinCommandHandler.handle(), transport-agnostic on purpose (no HTTP status codes
// here) so PokieDevServer can translate each case into a response and a future non-HTTP transport
// could reuse the same handler unchanged.
export type SpinCommandResult =
    | {status: "played"; sessionId: string; state: PokieSessionState; credits: number; win: number}
    | {status: "blocked"; sessionId: string; reason: string}
    | {status: "not-found"; sessionId: string};
