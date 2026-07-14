import type {PreGeneratedRoundResult} from "../../pregenerated/PreGeneratedRoundResult.js";

// The outcome of PreGeneratedSpinCommandHandler.handle() — transport-agnostic, same rationale as
// SpinCommandResult so a future non-HTTP transport could reuse this handler unchanged. `version` on the
// "played" case is the configured PreGeneratedSessionRepository's own optimistic-locking revision after
// this round, present only when that repository supports one (see VersionedPreGeneratedSessionRepository).
//
// "conflict" covers two distinct causes, both surfaced identically to a transport (see
// PokieDevServer, which maps either to HTTP 409): (1) the loaded session's own libraryId/libraryHash
// doesn't match the library this handler is configured with — caught before anything is applied, so
// there's nothing to compensate; (2) a versioned PreGeneratedSessionRepository rejected this attempt's
// save because the session's version moved between load and save (e.g. a concurrent attempt on another
// PreGeneratedSpinCommandHandler instance sharing this repository committed first) — every wallet
// transaction this attempt applied has already been reversed by the time this is returned.
export type PreGeneratedSpinCommandResult<T extends string | number = string> =
    | {status: "played"; sessionId: string; result: PreGeneratedRoundResult<T>; version?: number}
    | {status: "not-found"; sessionId: string}
    | {status: "conflict"; sessionId: string; reason: string};
