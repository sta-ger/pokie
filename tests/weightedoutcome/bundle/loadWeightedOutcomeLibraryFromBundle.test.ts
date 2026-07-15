import fs from "fs";
import os from "os";
import path from "path";
import {
    InMemoryPreGeneratedOutcomeSource,
    InMemoryPreGeneratedSessionRepository,
    InMemoryWallet,
    OutcomeLibraryBundleWriter,
    PreGeneratedSpinCommandHandler,
    WeightedOutcomeLibrary,
    computeWeightedOutcomeLibraryHash,
    loadWeightedOutcomeLibraryFromBundle,
} from "pokie";
import {buildOutcomeLibraryBundleModeInput, buildOutcomeLibraryBundleTestLibrary} from "./OutcomeLibraryBundleTestFixtures.js";

describe("loadWeightedOutcomeLibraryFromBundle", () => {
    let outDir: string;
    let library: WeightedOutcomeLibrary<string>;

    beforeEach(async () => {
        outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-outcomelibrary-loader-test-"));
        fs.rmdirSync(outDir);
        library = buildOutcomeLibraryBundleTestLibrary("base-lib");
        const modes = [buildOutcomeLibraryBundleModeInput("base", "base-lib")];
        await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory(modes, outDir);
    });

    afterEach(() => {
        fs.rmSync(outDir, {recursive: true, force: true});
    });

    // This is the integration point the pre-generated runtime and the Stake Engine exporter both go through
    // (see docs/outcome-library-bundle.md) — proving here that its output is accepted, unmodified, by
    // PreGeneratedSpinCommandHandler's existing constructor is what makes "both load the same canonical bundle"
    // a real guarantee rather than just a shared function name. The Stake exporter side of this same guarantee
    // is covered by StakeEngineCommand.test.ts's own "loads a mode's library from a canonical outcome-library
    // bundle" test.
    it("produces a WeightedOutcomeLibrary that PreGeneratedSpinCommandHandler accepts and plays rounds against, with no special-casing", async () => {
        const loaded = await loadWeightedOutcomeLibraryFromBundle(outDir, "base");
        const loadedHash = computeWeightedOutcomeLibraryHash(loaded);
        expect(loadedHash).toBe(computeWeightedOutcomeLibraryHash(library));

        const wallet = new InMemoryWallet(1000);
        const sessionRepository = new InMemoryPreGeneratedSessionRepository();
        await sessionRepository.save("session-1", {libraryId: loaded.libraryId, libraryHash: loadedHash, seed: "seed-1", roundsPlayed: 0});
        const handler = new PreGeneratedSpinCommandHandler(new InMemoryPreGeneratedOutcomeSource(loaded, loadedHash), wallet, sessionRepository);

        const result = await handler.handle("session-1");

        expect(result.status).toBe("played");
    });
});
