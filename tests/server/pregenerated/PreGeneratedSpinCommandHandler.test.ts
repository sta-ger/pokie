import {
    IdempotencyRepository,
    InMemoryPreGeneratedSessionRepository,
    InMemoryWallet,
    PreGeneratedRoundReplayer,
    PreGeneratedSessionRepository,
    PreGeneratedSpinCommandHandler,
    PreGeneratedSpinCommandResult,
    TransactionalWalletPort,
    VersionedPreGeneratedSessionRepository,
    WeightedOutcomeLibrary,
    buildWeightedOutcomeLibrary,
    computeWeightedOutcomeLibraryHash,
} from "pokie";
import {artifactWith} from "../../weightedoutcome/WeightedOutcomeTestFixtures.js";

// Mirrors the "racing repository" pattern PokieDevServer.test.ts uses for its own optimistic-locking
// tests: the first loadVersioned() call for a sessionId also sneaks in an unrelated saveVersioned()
// against the *real* repository before returning — simulating another PreGeneratedSpinCommandHandler
// instance (or process) sharing this same repository committing first, so this caller's own later
// saveVersioned() (still holding the version it read before the race) is guaranteed to conflict.
function createRacingSessionRepository(real: InMemoryPreGeneratedSessionRepository): VersionedPreGeneratedSessionRepository {
    let raced = false;
    return {
        load: (sessionId) => real.load(sessionId),
        save: (sessionId, state) => real.save(sessionId, state),
        loadVersioned: async (sessionId) => {
            const versioned = await real.loadVersioned(sessionId);
            if (versioned !== undefined && !raced) {
                raced = true;
                await real.saveVersioned(sessionId, versioned.state, versioned.version);
            }
            return versioned;
        },
        saveVersioned: (sessionId, state, expectedVersion) => real.saveVersioned(sessionId, state, expectedVersion),
    };
}

function buildLibrary(): WeightedOutcomeLibrary<string> {
    return buildWeightedOutcomeLibrary({
        libraryId: "handler-test",
        outcomes: [
            {id: "no-win", weight: 70, artifact: artifactWith({roundId: "no-win", totalWin: 0, stake: 1})},
            {id: "small-win", weight: 25, artifact: artifactWith({roundId: "small-win", totalWin: 5, stake: 1})},
            {id: "jackpot", weight: 5, artifact: artifactWith({roundId: "jackpot", totalWin: 500, stake: 1})},
        ],
    });
}

describe("PreGeneratedSpinCommandHandler", () => {
    let library: WeightedOutcomeLibrary<string>;
    let libraryHash: string;
    let wallet: InMemoryWallet;
    let sessionRepository: PreGeneratedSessionRepository;
    let handler: PreGeneratedSpinCommandHandler<string>;

    function initialState(seed: string, roundsPlayed = 0) {
        return {libraryId: library.libraryId, libraryHash, seed, roundsPlayed};
    }

    beforeEach(() => {
        library = buildLibrary();
        libraryHash = computeWeightedOutcomeLibraryHash(library);
        wallet = new InMemoryWallet(1000);
        sessionRepository = new InMemoryPreGeneratedSessionRepository();
        handler = new PreGeneratedSpinCommandHandler(library, libraryHash, wallet, sessionRepository);
    });

    it("returns not-found for an unknown sessionId", async () => {
        const result = await handler.handle("unknown-session");
        expect(result).toEqual({status: "not-found", sessionId: "unknown-session"});
    });

    it("draws a deterministic outcome, settles the wallet, and advances roundsPlayed", async () => {
        await sessionRepository.save("s1", initialState("seed-1"));

        const result = await handler.handle("s1");
        expect(result.status).toBe("played");
        if (result.status !== "played") {
            throw new Error("expected played");
        }

        const outcomeArtifact = result.result.artifact;
        expect(result.result.runtime.balanceBefore).toBe(1000);
        expect(result.result.runtime.balanceAfter).toBe(1000 - outcomeArtifact.stake + outcomeArtifact.totalWin);
        expect(await wallet.getBalance("s1")).toBe(result.result.runtime.balanceAfter);

        const newState = await sessionRepository.load("s1");
        expect(newState?.roundsPlayed).toBe(1);
    });

    it("matches PreGeneratedRoundReplayer's reconstruction of the same (seed, round)", async () => {
        await sessionRepository.save("s1", initialState("reproducible-seed"));

        const result = await handler.handle("s1");
        if (result.status !== "played") {
            throw new Error("expected played");
        }

        const replayed = new PreGeneratedRoundReplayer().replay({
            library,
            libraryHash,
            seed: "reproducible-seed",
            round: 1,
        });

        expect(replayed.outcomeId).toBe(result.result.selection.outcomeId);
        expect(replayed.totalWin).toBe(result.result.artifact.totalWin);
    });

    it("keeps replay determinism across many sequential rounds under the current (full-string) seed representation", async () => {
        // A regression guard for the move away from a 32-bit numeric seed fold-down: every one of a
        // long run of rounds must still be exactly reproducible via PreGeneratedRoundReplayer, not just
        // round 1 (where a shallow/collision-prone derivation would be least likely to show a problem).
        await sessionRepository.save("s1", initialState("long-run-seed"));
        const replayer = new PreGeneratedRoundReplayer();

        for (let round = 1; round <= 25; round++) {
            const result = await handler.handle("s1");
            if (result.status !== "played") {
                throw new Error(`expected round ${round} to be played`);
            }

            const replayed = replayer.replay({library, libraryHash, seed: "long-run-seed", round});
            expect(replayed.outcomeId).toBe(result.result.selection.outcomeId);
            expect(replayed.totalWin).toBe(result.result.artifact.totalWin);
        }
    });

    it("replays an idempotent retry without re-debiting the wallet or advancing the round again", async () => {
        await sessionRepository.save("s1", initialState("seed-1"));

        const first = await handler.handle("s1", "req-1");
        const second = await handler.handle("s1", "req-1");

        expect(second).toEqual(first);
        const state = await sessionRepository.load("s1");
        expect(state?.roundsPlayed).toBe(1);
    });

    it("spins twice for two different requestIds", async () => {
        await sessionRepository.save("s1", initialState("seed-1"));

        await handler.handle("s1", "req-1");
        await handler.handle("s1", "req-2");

        const state = await sessionRepository.load("s1");
        expect(state?.roundsPlayed).toBe(2);
    });

    it("only spins once for a concurrently repeated requestId", async () => {
        await sessionRepository.save("s1", initialState("seed-1"));

        const [first, second] = await Promise.all([handler.handle("s1", "req-concurrent"), handler.handle("s1", "req-concurrent")]);

        expect(second).toEqual(first);
        const state = await sessionRepository.load("s1");
        expect(state?.roundsPlayed).toBe(1);
    });

    it("reverses every applied wallet transaction and restores prior session state when persisting the new state fails", async () => {
        const priorState = initialState("seed-1");
        await sessionRepository.save("s1", priorState);
        const balanceBefore = await wallet.getBalance("s1");

        const failingRepository: PreGeneratedSessionRepository = {
            load: (sessionId) => sessionRepository.load(sessionId),
            save: async (sessionId, state) => {
                if (state.roundsPlayed > 0) {
                    throw new Error("simulated persistence failure");
                }
                await sessionRepository.save(sessionId, state);
            },
        };
        const failingHandler = new PreGeneratedSpinCommandHandler(library, libraryHash, wallet, failingRepository);

        await expect(failingHandler.handle("s1")).rejects.toThrow("simulated persistence failure");

        expect(await wallet.getBalance("s1")).toBe(balanceBefore);
        expect(await sessionRepository.load("s1")).toEqual(priorState);
    });

    it("restores prior session state and reverses wallet transactions when persisting the idempotency result fails", async () => {
        const priorState = initialState("seed-1");
        await sessionRepository.save("s1", priorState);
        const balanceBefore = await wallet.getBalance("s1");

        const failingIdempotencyRepository: IdempotencyRepository<PreGeneratedSpinCommandResult<string>> = {
            load: () => Promise.resolve(undefined),
            save: () => Promise.reject(new Error("simulated idempotency-store outage")),
        };
        const failingHandler = new PreGeneratedSpinCommandHandler(library, libraryHash, wallet, sessionRepository, failingIdempotencyRepository);

        await expect(failingHandler.handle("s1", "req-1")).rejects.toThrow("simulated idempotency-store outage");

        expect(await wallet.getBalance("s1")).toBe(balanceBefore);
        expect(await sessionRepository.load("s1")).toEqual(priorState);
    });

    it("uses a TransactionalWalletPort directly without requiring the InMemoryWallet class specifically", async () => {
        const plainTransactionalWallet: TransactionalWalletPort = wallet;
        await sessionRepository.save("s2", initialState("seed-2"));
        const otherHandler = new PreGeneratedSpinCommandHandler(library, libraryHash, plainTransactionalWallet, sessionRepository);

        const result = await otherHandler.handle("s2");
        expect(result.status).toBe("played");
    });

    it("returns conflict without touching the wallet when the session's libraryId doesn't match", async () => {
        const otherLibrary = buildWeightedOutcomeLibrary({
            libraryId: "a-completely-different-library",
            outcomes: [{id: "only", weight: 1, artifact: artifactWith({roundId: "only", totalWin: 0, stake: 1})}],
        });
        await sessionRepository.save("s1", {
            libraryId: otherLibrary.libraryId,
            libraryHash: computeWeightedOutcomeLibraryHash(otherLibrary),
            seed: "seed-1",
            roundsPlayed: 0,
        });
        const balanceBefore = await wallet.getBalance("s1");

        const result = await handler.handle("s1");

        expect(result.status).toBe("conflict");
        expect(await wallet.getBalance("s1")).toBe(balanceBefore);
        expect((await sessionRepository.load("s1"))?.roundsPlayed).toBe(0);
    });

    it("returns conflict when the session's libraryHash doesn't match (same libraryId, regenerated library)", async () => {
        // Same libraryId as `library`, but different weights — a distinct hash for content the session
        // was never actually drawn from.
        const regeneratedLibrary = buildWeightedOutcomeLibrary({
            libraryId: library.libraryId,
            outcomes: [
                {id: "no-win", weight: 1, artifact: artifactWith({roundId: "no-win", totalWin: 0, stake: 1})},
                {id: "small-win", weight: 1, artifact: artifactWith({roundId: "small-win", totalWin: 5, stake: 1})},
                {id: "jackpot", weight: 1, artifact: artifactWith({roundId: "jackpot", totalWin: 500, stake: 1})},
            ],
        });
        await sessionRepository.save("s1", {
            libraryId: library.libraryId,
            libraryHash: computeWeightedOutcomeLibraryHash(regeneratedLibrary),
            seed: "seed-1",
            roundsPlayed: 0,
        });
        const balanceBefore = await wallet.getBalance("s1");

        const result = await handler.handle("s1");

        expect(result.status).toBe("conflict");
        expect(await wallet.getBalance("s1")).toBe(balanceBefore);
    });

    it("returns conflict and reverses wallet transactions on a concurrent optimistic-locking version conflict", async () => {
        const realRepository = new InMemoryPreGeneratedSessionRepository();
        await realRepository.save("s1", initialState("seed-1"));
        const racingRepository = createRacingSessionRepository(realRepository);
        const racingHandler = new PreGeneratedSpinCommandHandler(library, libraryHash, wallet, racingRepository);
        const balanceBefore = await wallet.getBalance("s1");

        const result = await racingHandler.handle("s1");

        expect(result.status).toBe("conflict");
        expect(await wallet.getBalance("s1")).toBe(balanceBefore);
        // The racing repository's own sneaked-in save only bumped the version (to simulate another
        // writer committing in between) without changing the state's own content — the losing
        // attempt's compensation must not have clobbered that real, unrelated write.
        const afterConflict = await realRepository.loadVersioned("s1");
        expect(afterConflict?.state.roundsPlayed).toBe(0);
        expect(afterConflict?.version).toBe(2);
    });

    it("exposes the repository's own optimistic-locking version on a played result", async () => {
        await sessionRepository.save("s1", initialState("seed-1"));

        const result = await handler.handle("s1");

        expect(result.status).toBe("played");
        if (result.status === "played") {
            expect(result.version).toBe(2);
        }
    });

    it("returns conflict for a cached idempotency result once the session's library no longer matches", async () => {
        await sessionRepository.save("s1", initialState("seed-1"));

        // A result actually played (and cached) while the session still matched this handler's
        // library — then the session gets migrated to a different library (e.g. a redeploy that swaps
        // preGeneratedOutcomeLibrary) without its idempotency cache being cleared.
        const staleCachedResult = await handler.handle("s1", "req-1");
        expect(staleCachedResult.status).toBe("played");

        const otherLibrary = buildWeightedOutcomeLibrary({
            libraryId: "a-different-library-post-migration",
            outcomes: [{id: "only", weight: 1, artifact: artifactWith({roundId: "only", totalWin: 0, stake: 1})}],
        });
        await sessionRepository.save("s1", {
            libraryId: otherLibrary.libraryId,
            libraryHash: computeWeightedOutcomeLibraryHash(otherLibrary),
            seed: "seed-1",
            roundsPlayed: 1,
        });

        // Same (sessionId, requestId) as the cached result above — must not be returned as-is now that
        // the session's own library no longer matches what this handler is configured with.
        const result = await handler.handle("s1", "req-1");

        expect(result.status).toBe("conflict");
        expect(result).not.toEqual(staleCachedResult);
    });

    it("does not let a losing concurrent attempt's compensation reverse the winning attempt's wallet transactions (same requestId, two handler instances)", async () => {
        const realRepository = new InMemoryPreGeneratedSessionRepository();
        await realRepository.save("s1", initialState("seed-1"));

        const handlerA = new PreGeneratedSpinCommandHandler(library, libraryHash, wallet, realRepository);

        // handlerB's own repository lets handlerA's attempt for the exact same (sessionId, requestId)
        // run to completion and commit first, before handlerB proceeds with the (now stale) version it
        // already read — simulating a client's retried request landing on a second server instance
        // while the first instance's attempt for that same requestId is still in flight, both against
        // the same underlying session and wallet.
        let winnerPromise: Promise<PreGeneratedSpinCommandResult<string>> | undefined;
        const racingRepositoryForB: VersionedPreGeneratedSessionRepository = {
            load: (sessionId) => realRepository.load(sessionId),
            save: (sessionId, state) => realRepository.save(sessionId, state),
            loadVersioned: async (sessionId) => {
                const versioned = await realRepository.loadVersioned(sessionId);
                if (winnerPromise === undefined) {
                    winnerPromise = handlerA.handle("s1", "req-shared");
                }
                await winnerPromise;
                return versioned;
            },
            saveVersioned: (sessionId, state, expectedVersion) => realRepository.saveVersioned(sessionId, state, expectedVersion),
        };
        const handlerB = new PreGeneratedSpinCommandHandler(library, libraryHash, wallet, racingRepositoryForB);

        const loserResult = await handlerB.handle("s1", "req-shared");
        const winnerResult = await winnerPromise;

        expect(winnerResult?.status).toBe("played");
        expect(loserResult.status).toBe("conflict");
        if (winnerResult?.status !== "played") {
            throw new Error("expected handlerA to have won");
        }

        // The decisive check: with a fresh attemptId per attempt, handlerB's own debit/credit
        // transaction ids never collide with handlerA's, so handlerB's compensation (reversing only
        // its own transactions) leaves handlerA's committed settlement completely intact.
        expect(await wallet.getBalance("s1")).toBe(winnerResult.result.runtime.balanceAfter);

        // Replaying handlerA's own requestId against handlerA again must still return the exact same,
        // untouched result — proving handlerA's own idempotency record/wallet transactions were never
        // reversed by handlerB's compensation.
        const replay = await handlerA.handle("s1", "req-shared");
        expect(replay).toEqual(winnerResult);
    });
});
