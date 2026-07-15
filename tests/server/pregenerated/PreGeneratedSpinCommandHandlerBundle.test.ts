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
    PreGeneratedOutcomeSelection,
    PreGeneratedOutcomeSourceConflictError,
    PreGeneratedOutcomeSourcing,
    PreGeneratedSpinCommandHandler,
    WeightedOutcomeInput,
    WeightedOutcomeRandomSource,
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

    // recordHash's own reason for existing, exercised end to end: a record tampered in place, with the id/weight
    // the index already knew about left completely untouched, must still be rejected — as a conflict, with no
    // wallet write — even though nothing about the session's own stamped libraryId/libraryHash changed at all.
    it("returns conflict, without any wallet write, when a record's content is tampered in place (same id/weight, same libraryHash)", async () => {
        const reader = new OutcomeLibraryBundleReader();
        const index = await reader.readModeIndex(bundleDir, "base");
        const entry = index.entries.find((candidate) => candidate.id === "jackpot")!;
        const outcomesPath = path.join(bundleDir, "outcomes_base.jsonl");
        const buffer = fs.readFileSync(outcomesPath);
        const original = buffer.subarray(entry.byteOffset, entry.byteOffset + entry.byteLength).toString("utf-8");
        const parsed = JSON.parse(original) as {artifact: {roundId: string}};
        const tamperedRoundId = "t".repeat(parsed.artifact.roundId.length);
        const tampered = original.replace(JSON.stringify(parsed.artifact.roundId), JSON.stringify(tamperedRoundId));
        expect(tampered).not.toBe(original);
        buffer.write(tampered, entry.byteOffset, entry.byteLength, "utf-8");
        fs.writeFileSync(outcomesPath, buffer);

        const wallet = new InMemoryWallet(1000);
        const sessionRepository = new InMemoryPreGeneratedSessionRepository();
        const realBundleSource = new OutcomeLibraryBundleOutcomeSource(bundleDir, "base");
        // Ignores the handler's own derived randomSource and always resolves to cumulative point 0 — which,
        // sorted by canonical id ("jackpot" < "no-win" < "small-win"), always lands on the tampered "jackpot"
        // entry regardless of the session's own seed — so this test doesn't depend on guessing a seed that
        // happens to draw it.
        const forcedFirstEntrySource: PreGeneratedOutcomeSourcing<string> = {
            drawOutcome: () => realBundleSource.drawOutcome({nextInt: () => 0}),
        };
        const handler = new PreGeneratedSpinCommandHandler(forcedFirstEntrySource, wallet, sessionRepository);
        await sessionRepository.save("s1", {libraryId: "bundle-lib", libraryHash: index.libraryHash, seed: "seed-1", roundsPlayed: 0});
        const balanceBefore = await wallet.getBalance("s1");

        const result = await handler.handle("s1");

        expect(result.status).toBe("conflict");
        expect(await wallet.getBalance("s1")).toBe(balanceBefore);
        expect((await sessionRepository.load("s1"))?.roundsPlayed).toBe(0);
    });

    // A hand-crafted PreGeneratedOutcomeSourcing implementation — standing in for a buggy or malicious custom
    // source — that returns a structurally invalid selection (weight exceeding totalWeight). The handler must
    // reject it as a conflict before ever touching the wallet, exactly as it would a real source's own detected
    // corruption.
    it("returns conflict, without any wallet write, for a forged custom PreGeneratedOutcomeSourcing that returns an invalid selection", async () => {
        const forgedSource: PreGeneratedOutcomeSourcing<string> = {
            drawOutcome: () =>
                Promise.resolve({
                    libraryId: "bundle-lib",
                    libraryHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
                    totalWeight: 10,
                    outcome: {id: "forged", weight: 999, artifact: artifactWith({roundId: "forged", totalWin: 0, stake: 1})},
                } satisfies PreGeneratedOutcomeSelection<string>),
        };
        const wallet = new InMemoryWallet(1000);
        const sessionRepository = new InMemoryPreGeneratedSessionRepository();
        const handler = new PreGeneratedSpinCommandHandler(forgedSource, wallet, sessionRepository);
        await sessionRepository.save("s1", {
            libraryId: "bundle-lib",
            libraryHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
            seed: "seed-1",
            roundsPlayed: 0,
        });
        const balanceBefore = await wallet.getBalance("s1");

        const result = await handler.handle("s1");

        expect(result.status).toBe("conflict");
        expect(await wallet.getBalance("s1")).toBe(balanceBefore);
        expect((await sessionRepository.load("s1"))?.roundsPlayed).toBe(0);
    });

    // A custom source directly throwing PreGeneratedOutcomeSourceConflictError — proving the handler's own
    // catch is keyed on the error type, not on which concrete PreGeneratedOutcomeSourcing implementation raised
    // it (OutcomeLibraryBundleOutcomeSource is only one of potentially many).
    it("returns conflict, without any wallet write, when a custom source throws PreGeneratedOutcomeSourceConflictError directly", async () => {
        const throwingSource: PreGeneratedOutcomeSourcing<string> = {
            drawOutcome: (_randomSource: WeightedOutcomeRandomSource) =>
                Promise.reject(new PreGeneratedOutcomeSourceConflictError("simulated custom source conflict")),
        };
        const wallet = new InMemoryWallet(1000);
        const sessionRepository = new InMemoryPreGeneratedSessionRepository();
        const handler = new PreGeneratedSpinCommandHandler(throwingSource, wallet, sessionRepository);
        await sessionRepository.save("s1", {libraryId: "bundle-lib", libraryHash: "sha256:whatever", seed: "seed-1", roundsPlayed: 0});
        const balanceBefore = await wallet.getBalance("s1");

        const result = await handler.handle("s1");

        expect(result.status).toBe("conflict");
        if (result.status === "conflict") {
            expect(result.reason).toContain("simulated custom source conflict");
        }
        expect(await wallet.getBalance("s1")).toBe(balanceBefore);
        expect((await sessionRepository.load("s1"))?.roundsPlayed).toBe(0);
    });
});
