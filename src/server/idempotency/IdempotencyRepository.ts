// Stores the result of a command keyed by (sessionId, requestId), so a client retrying the same
// requestId (e.g. after a dropped response) gets the previously computed result back instead of
// the command running again — used by SpinCommandHandler to avoid double-charging a wallet for a
// retried spin. Two different sessionIds are free to reuse the same requestId independently.
export interface IdempotencyRepository<T = unknown> {
    load(sessionId: string, requestId: string): Promise<T | undefined>;

    save(sessionId: string, requestId: string, result: T): Promise<void>;
}
