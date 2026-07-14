import type {PreGeneratedRoundResult} from "../../pregenerated/PreGeneratedRoundResult.js";

// The outcome of PreGeneratedSpinCommandHandler.handle() — transport-agnostic, same rationale as
// SpinCommandResult so a future non-HTTP transport could reuse this handler unchanged.
export type PreGeneratedSpinCommandResult<T extends string | number = string> =
    | {status: "played"; sessionId: string; result: PreGeneratedRoundResult<T>}
    | {status: "not-found"; sessionId: string};
