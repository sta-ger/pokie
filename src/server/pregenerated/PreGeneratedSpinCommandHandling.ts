import type {PreGeneratedSpinCommandResult} from "./PreGeneratedSpinCommandResult.js";

export interface PreGeneratedSpinCommandHandling<T extends string | number = string> {
    // `requestId` is optional: omit it to always draw a fresh round (consuming the session's next
    // round index). Pass it to make a retried call with the same (sessionId, requestId) return the
    // previously computed result instead of drawing and settling the wallet again — same idempotency
    // contract as SpinCommandHandling.handle().
    handle(sessionId: string, requestId?: string): Promise<PreGeneratedSpinCommandResult<T>>;
}
