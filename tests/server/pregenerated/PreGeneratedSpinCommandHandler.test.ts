import {
    IdempotencyRepository,
    InMemoryPreGeneratedSessionRepository,
    InMemoryWallet,
    PreGeneratedRoundReplayer,
    PreGeneratedSessionRepository,
    PreGeneratedSpinCommandHandler,
    PreGeneratedSpinCommandResult,
    TransactionalWalletPort,
    WeightedOutcomeLibrary,
    buildWeightedOutcomeLibrary,
    computeWeightedOutcomeLibraryHash,
} from "pokie";
import {artifactWith} from "../../weightedoutcome/WeightedOutcomeTestFixtures";

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
        await sessionRepository.save("s1", {libraryId: library.libraryId, seed: "seed-1", roundsPlayed: 0});

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
        await sessionRepository.save("s1", {libraryId: library.libraryId, seed: "reproducible-seed", roundsPlayed: 0});

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

    it("replays an idempotent retry without re-debiting the wallet or advancing the round again", async () => {
        await sessionRepository.save("s1", {libraryId: library.libraryId, seed: "seed-1", roundsPlayed: 0});

        const first = await handler.handle("s1", "req-1");
        const second = await handler.handle("s1", "req-1");

        expect(second).toEqual(first);
        const state = await sessionRepository.load("s1");
        expect(state?.roundsPlayed).toBe(1);
    });

    it("spins twice for two different requestIds", async () => {
        await sessionRepository.save("s1", {libraryId: library.libraryId, seed: "seed-1", roundsPlayed: 0});

        await handler.handle("s1", "req-1");
        await handler.handle("s1", "req-2");

        const state = await sessionRepository.load("s1");
        expect(state?.roundsPlayed).toBe(2);
    });

    it("only spins once for a concurrently repeated requestId", async () => {
        await sessionRepository.save("s1", {libraryId: library.libraryId, seed: "seed-1", roundsPlayed: 0});

        const [first, second] = await Promise.all([handler.handle("s1", "req-concurrent"), handler.handle("s1", "req-concurrent")]);

        expect(second).toEqual(first);
        const state = await sessionRepository.load("s1");
        expect(state?.roundsPlayed).toBe(1);
    });

    it("reverses every applied wallet transaction and restores prior session state when persisting the new state fails", async () => {
        const priorState = {libraryId: library.libraryId, seed: "seed-1", roundsPlayed: 0};
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
        const priorState = {libraryId: library.libraryId, seed: "seed-1", roundsPlayed: 0};
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
        await sessionRepository.save("s2", {libraryId: library.libraryId, seed: "seed-2", roundsPlayed: 0});
        const otherHandler = new PreGeneratedSpinCommandHandler(library, libraryHash, plainTransactionalWallet, sessionRepository);

        const result = await otherHandler.handle("s2");
        expect(result.status).toBe("played");
    });
});
