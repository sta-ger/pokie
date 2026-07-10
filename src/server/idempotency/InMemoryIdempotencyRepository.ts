import type {IdempotencyRepository} from "./IdempotencyRepository.js";

// Default IdempotencyRepository: results live only in a Map for the lifetime of the process, same
// tradeoff as InMemorySessionRepository/InMemoryWallet — a restart forgets every stored result, so
// a requestId retried after a restart runs the command again rather than replaying a stale result.
export class InMemoryIdempotencyRepository<T = unknown> implements IdempotencyRepository<T> {
    private readonly results = new Map<string, T>();

    public load(sessionId: string, requestId: string): Promise<T | undefined> {
        return Promise.resolve(this.results.get(this.keyFor(sessionId, requestId)));
    }

    public save(sessionId: string, requestId: string, result: T): Promise<void> {
        this.results.set(this.keyFor(sessionId, requestId), result);
        return Promise.resolve();
    }

    private keyFor(sessionId: string, requestId: string): string {
        // \0 can't appear in a sessionId/requestId supplied over JSON/HTTP, so joining with it
        // can't collide the way a plain "+" or ":" join could for adversarially chosen ids.
        return `${sessionId}\0${requestId}`;
    }
}
