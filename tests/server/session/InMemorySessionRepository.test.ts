import {InMemorySessionRepository, PokieSessionState} from "pokie";

describe("InMemorySessionRepository", () => {
    it("returns undefined for a sessionId that was never saved", async () => {
        const repository = new InMemorySessionRepository();

        await expect(repository.load("does-not-exist")).resolves.toBeUndefined();
    });

    it("round-trips saved state", async () => {
        const repository = new InMemorySessionRepository();
        const state: PokieSessionState = {bet: 5, win: 15, screen: [["A", "B"]]};

        await repository.save("session-1", state);

        await expect(repository.load("session-1")).resolves.toEqual(state);
    });

    it("keeps state for different sessionIds independent", async () => {
        const repository = new InMemorySessionRepository();

        await repository.save("session-1", {bet: 1, win: 0});
        await repository.save("session-2", {bet: 2, win: 0});

        await expect(repository.load("session-1")).resolves.toEqual({bet: 1, win: 0});
        await expect(repository.load("session-2")).resolves.toEqual({bet: 2, win: 0});
    });

    it("overwrites previously saved state for the same sessionId", async () => {
        const repository = new InMemorySessionRepository();

        await repository.save("session-1", {bet: 1, win: 0});
        await repository.save("session-1", {bet: 1, win: 10, screen: [["X"]]});

        await expect(repository.load("session-1")).resolves.toEqual({bet: 1, win: 10, screen: [["X"]]});
    });
});
