import fs from "fs";
import os from "os";
import path from "path";
import {
    InMemoryPreGeneratedOutcomeSource,
    InMemoryPreGeneratedSessionRepository,
    InMemoryWallet,
    OutcomeLibraryBundleOutcomeSource,
    OutcomeLibraryBundleReader,
    OutcomeLibraryBundleReading,
    OutcomeLibraryBundleWriter,
    PreGeneratedSpinCommandHandler,
    WeightedOutcomeInput,
    buildWeightedOutcomeLibrary,
    computeWeightedOutcomeLibraryHash,
} from "pokie";
import {artifactWith} from "../../weightedoutcome/WeightedOutcomeTestFixtures.js";

// Ids given in canonical (plain code-point) sort order — jackpot < no-win < small-win — since
// OutcomeLibraryBundleWriter, unlike buildWeightedOutcomeLibrary, streams outcomes in arrival order and requires
// the caller to already provide them sorted.
function buildOutcomes(): WeightedOutcomeInput<string>[] {
    return [
        {id: "jackpot", weight: 5, artifact: artifactWith({roundId: "jackpot", totalWin: 500, stake: 1})},
        {id: "no-win", weight: 70, artifact: artifactWith({roundId: "no-win", totalWin: 0, stake: 1})},
        {id: "small-win", weight: 25, artifact: artifactWith({roundId: "small-win", totalWin: 5, stake: 1})},
    ];
}

// The req-4/req-7 integration tests for the pre-generated outcome source stabilization pass: a real
// PreGeneratedSpinCommandHandler wired directly to a canonical outcome-library bundle (no in-memory
// WeightedOutcomeLibrary involved at all), proving it behaves identically to the in-memory adapter and that the
// session-identity check genuinely relates to the same bundle version a draw was made against.
describe("PreGeneratedSpinCommandHandler against a canonical outcome-library bundle", () => {
    let bundleDir: string;

    beforeEach(async () => {
        bundleDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-pregenerated-bundle-handler-test-"));
        fs.rmdirSync(bundleDir);
        await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([{modeName: "base", libraryId: "bundle-lib", outcomes: buildOutcomes()}], bundleDir);
    });

    afterEach(() => {
        fs.rmSync(bundleDir, {recursive: true, force: true});
    });

    async function bundleLibraryHash(): Promise<string> {
        const index = await new OutcomeLibraryBundleReader().readModeIndex(bundleDir, "base");
        return index.libraryHash;
    }

    it("plays rounds directly off the bundle, settling the wallet, without ever calling readLibrary()", async () => {
        const realReader = new OutcomeLibraryBundleReader();
        const readLibrary = jest.fn(() => {
            throw new Error("readLibrary() should never be called when the runtime is wired to a bundle");
        });
        const spyingReader: OutcomeLibraryBundleReading = {
            readManifest: (dir) => realReader.readManifest(dir),
            readModeIndex: (dir, modeName) => realReader.readModeIndex(dir, modeName),
            iterateModeOutcomes: (dir, modeName) => realReader.iterateModeOutcomes(dir, modeName),
            readOutcomeById: (dir, modeName, id) => realReader.readOutcomeById(dir, modeName, id),
            drawOutcome: (dir, modeName, randomSource) => realReader.drawOutcome(dir, modeName, randomSource),
            readLibrary,
        };
        const outcomeSource = new OutcomeLibraryBundleOutcomeSource(bundleDir, "base", spyingReader);
        const wallet = new InMemoryWallet(1000);
        const sessionRepository = new InMemoryPreGeneratedSessionRepository();
        const handler = new PreGeneratedSpinCommandHandler(outcomeSource, wallet, sessionRepository);
        await sessionRepository.save("s1", {libraryId: "bundle-lib", libraryHash: await bundleLibraryHash(), seed: "seed-1", roundsPlayed: 0});

        const result = await handler.handle("s1");

        expect(result.status).toBe("played");
        if (result.status !== "played") {
            throw new Error("expected played");
        }
        expect(await wallet.getBalance("s1")).toBe(result.result.runtime.balanceAfter);
        expect((await sessionRepository.load("s1"))?.roundsPlayed).toBe(1);
        expect(readLibrary).not.toHaveBeenCalled();
    });

    it("gives identical deterministic results to an equivalent in-memory library for the same seed, round after round", async () => {
        const outcomes = buildOutcomes();
        const library = buildWeightedOutcomeLibrary({libraryId: "bundle-lib", outcomes});
        const libraryHash = computeWeightedOutcomeLibraryHash(library);
        expect(await bundleLibraryHash()).toBe(libraryHash);

        const inMemorySessionRepository = new InMemoryPreGeneratedSessionRepository();
        const bundleSessionRepository = new InMemoryPreGeneratedSessionRepository();
        await inMemorySessionRepository.save("s1", {libraryId: "bundle-lib", libraryHash, seed: "shared-seed", roundsPlayed: 0});
        await bundleSessionRepository.save("s1", {libraryId: "bundle-lib", libraryHash, seed: "shared-seed", roundsPlayed: 0});

        const inMemoryHandler = new PreGeneratedSpinCommandHandler(
            new InMemoryPreGeneratedOutcomeSource(library, libraryHash),
            new InMemoryWallet(1000),
            inMemorySessionRepository,
        );
        const bundleHandler = new PreGeneratedSpinCommandHandler(
            new OutcomeLibraryBundleOutcomeSource(bundleDir, "base"),
            new InMemoryWallet(1000),
            bundleSessionRepository,
        );

        for (let round = 1; round <= 20; round++) {
            const inMemoryResult = await inMemoryHandler.handle("s1");
            const bundleResult = await bundleHandler.handle("s1");
            if (inMemoryResult.status !== "played" || bundleResult.status !== "played") {
                throw new Error(`expected round ${round} to be played by both handlers`);
            }

            expect(bundleResult.result.selection.outcomeId).toBe(inMemoryResult.result.selection.outcomeId);
            expect(bundleResult.result.selection.weight).toBe(inMemoryResult.result.selection.weight);
            expect(bundleResult.result.selection.totalWeight).toBe(inMemoryResult.result.selection.totalWeight);
            expect(bundleResult.result.selection.probability).toBe(inMemoryResult.result.selection.probability);
            expect(bundleResult.result.artifact.totalWin).toBe(inMemoryResult.result.artifact.totalWin);
        }
    });

    // The exact race req 4 exists to close: a session is created against one version of the bundle; before its
    // next spin, the bundle is rebuilt in place (a redeploy regenerating the same libraryId/modeName with
    // different weights) — simulating another process changing the bundle out from under a long-lived session.
    // The handler's own draw always reads the *current* bundle, so its identity check (right after the draw,
    // before any wallet transaction) must catch this immediately rather than silently drawing against content
    // the session was never meant to be played against.
    it("returns conflict, without any wallet write or roundsPlayed advance, when the bundle is rebuilt between spins", async () => {
        const wallet = new InMemoryWallet(1000);
        const sessionRepository = new InMemoryPreGeneratedSessionRepository();
        const outcomeSource = new OutcomeLibraryBundleOutcomeSource(bundleDir, "base");
        const handler = new PreGeneratedSpinCommandHandler(outcomeSource, wallet, sessionRepository);
        const originalHash = await bundleLibraryHash();
        await sessionRepository.save("s1", {libraryId: "bundle-lib", libraryHash: originalHash, seed: "seed-1", roundsPlayed: 0});
        const balanceBefore = await wallet.getBalance("s1");

        const changedOutcomes = buildOutcomes().map((outcome) => ({...outcome, weight: outcome.weight + 1}));
        await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([{modeName: "base", libraryId: "bundle-lib", outcomes: changedOutcomes}], bundleDir);
        expect(await bundleLibraryHash()).not.toBe(originalHash);

        const result = await handler.handle("s1");

        expect(result.status).toBe("conflict");
        expect(await wallet.getBalance("s1")).toBe(balanceBefore);
        expect((await sessionRepository.load("s1"))?.roundsPlayed).toBe(0);
    });
});
