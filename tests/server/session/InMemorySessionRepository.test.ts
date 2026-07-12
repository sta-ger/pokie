import {InMemorySessionRepository, PokieSessionState, SessionVersionConflictError} from "pokie";

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

    describe("optimistic locking (loadVersioned/saveVersioned)", () => {
        it("returns undefined from loadVersioned for a sessionId that was never saved", async () => {
            const repository = new InMemorySessionRepository();

            await expect(repository.loadVersioned("does-not-exist")).resolves.toBeUndefined();
        });

        it("starts at version 1 after the first save and increments by 1 on every subsequent save", async () => {
            const repository = new InMemorySessionRepository();

            await repository.save("session-1", {bet: 1, win: 0});
            await expect(repository.loadVersioned("session-1")).resolves.toEqual({state: {bet: 1, win: 0}, version: 1});

            await repository.save("session-1", {bet: 1, win: 5});
            await expect(repository.loadVersioned("session-1")).resolves.toEqual({state: {bet: 1, win: 5}, version: 2});
        });

        it("saveVersioned succeeds when expectedVersion matches, and returns the new version", async () => {
            const repository = new InMemorySessionRepository();
            await repository.save("session-1", {bet: 1, win: 0});

            await expect(repository.saveVersioned("session-1", {bet: 1, win: 5}, 1)).resolves.toBe(2);
            await expect(repository.loadVersioned("session-1")).resolves.toEqual({state: {bet: 1, win: 5}, version: 2});
        });

        it("saveVersioned rejects with SessionVersionConflictError on a stale expectedVersion, leaving the stored state untouched", async () => {
            const repository = new InMemorySessionRepository();
            await repository.save("session-1", {bet: 1, win: 0}); // version 1
            await repository.saveVersioned("session-1", {bet: 1, win: 5}, 1); // version 2, committed by "someone else"

            await expect(repository.saveVersioned("session-1", {bet: 1, win: 999}, 1)).rejects.toThrow(SessionVersionConflictError);

            // The loser's write never landed — the winning writer's state/version are exactly as it left them.
            await expect(repository.loadVersioned("session-1")).resolves.toEqual({state: {bet: 1, win: 5}, version: 2});
        });

        it("only one of two saveVersioned calls racing against the same expectedVersion wins; nothing is lost", async () => {
            const repository = new InMemorySessionRepository();
            await repository.save("session-1", {bet: 1, win: 0}); // version 1

            const [first, second] = await Promise.allSettled([
                repository.saveVersioned("session-1", {bet: 1, win: 10}, 1),
                repository.saveVersioned("session-1", {bet: 1, win: 20}, 1),
            ]);

            const outcomes = [first.status, second.status].sort();
            expect(outcomes).toEqual(["fulfilled", "rejected"]);

            const rejected = first.status === "rejected" ? first : (second as PromiseRejectedResult);
            expect(rejected.reason).toBeInstanceOf(SessionVersionConflictError);

            // Whichever attempt won is exactly what's stored — version 2, and a recognizable win value.
            const stored = await repository.loadVersioned("session-1");
            expect(stored?.version).toBe(2);
            expect([10, 20]).toContain((stored?.state as PokieSessionState).win);
        });

        it("keeps different sessionIds' versions completely independent", async () => {
            const repository = new InMemorySessionRepository();

            await repository.save("session-1", {bet: 1, win: 0}); // version 1
            await repository.save("session-1", {bet: 1, win: 1}); // version 2
            await repository.save("session-2", {bet: 2, win: 0}); // version 1, unaffected by session-1's history

            await expect(repository.loadVersioned("session-1")).resolves.toEqual({state: {bet: 1, win: 1}, version: 2});
            await expect(repository.loadVersioned("session-2")).resolves.toEqual({state: {bet: 2, win: 0}, version: 1});

            // A conflict on session-1 must not affect session-2's own, independent version.
            await expect(repository.saveVersioned("session-1", {bet: 1, win: 99}, 1)).rejects.toThrow(SessionVersionConflictError);
            await expect(repository.saveVersioned("session-2", {bet: 2, win: 5}, 1)).resolves.toBe(2);
        });
    });
});
