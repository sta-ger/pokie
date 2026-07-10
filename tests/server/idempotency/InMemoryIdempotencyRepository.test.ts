import {InMemoryIdempotencyRepository} from "pokie";

describe("InMemoryIdempotencyRepository", () => {
    it("returns undefined for a sessionId/requestId pair it hasn't seen", async () => {
        const repository = new InMemoryIdempotencyRepository<string>();

        await expect(repository.load("session-1", "request-1")).resolves.toBeUndefined();
    });

    it("round-trips a result saved for a sessionId/requestId pair", async () => {
        const repository = new InMemoryIdempotencyRepository<{win: number}>();

        await repository.save("session-1", "request-1", {win: 15});

        await expect(repository.load("session-1", "request-1")).resolves.toEqual({win: 15});
    });

    it("keeps results for different sessionIds independent even with the same requestId", async () => {
        const repository = new InMemoryIdempotencyRepository<string>();

        await repository.save("session-1", "request-1", "result-for-session-1");
        await repository.save("session-2", "request-1", "result-for-session-2");

        await expect(repository.load("session-1", "request-1")).resolves.toBe("result-for-session-1");
        await expect(repository.load("session-2", "request-1")).resolves.toBe("result-for-session-2");
    });

    it("keeps results for different requestIds independent within the same sessionId", async () => {
        const repository = new InMemoryIdempotencyRepository<string>();

        await repository.save("session-1", "request-1", "first");
        await repository.save("session-1", "request-2", "second");

        await expect(repository.load("session-1", "request-1")).resolves.toBe("first");
        await expect(repository.load("session-1", "request-2")).resolves.toBe("second");
    });
});
