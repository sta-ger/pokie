import fs from "fs";
import os from "os";
import path from "path";
import {
    FairnessCommitment,
    FairnessRoundProofBuildError,
    FairnessRoundProofBuilder,
    OutcomeLibraryBundleModeIndex,
    OutcomeLibraryBundleReader,
    OutcomeLibraryBundleReading,
} from "pokie";
import {buildFairnessSourceBundle, issueFairnessCommitmentFor} from "./FairnessRoundProofTestFixtures.js";

describe("FairnessRoundProofBuilder", () => {
    let tmpRoot: string;
    let bundleDir: string;

    beforeEach(async () => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fairness-builder-"));
        bundleDir = path.join(tmpRoot, "bundle");
        await buildFairnessSourceBundle(bundleDir, ["base"]);
    });

    afterEach(() => {
        fs.rmSync(tmpRoot, {recursive: true, force: true});
    });

    it("builds a proof that reveals the seed, links its own commitmentHash, and pins the mode/library/index it was drawn from", async () => {
        const serverSeed = "server-seed-1";
        const commitment = await issueFairnessCommitmentFor(bundleDir, "base", {serverSeed});
        const builder = new FairnessRoundProofBuilder();

        const proof = await builder.build(commitment, serverSeed, bundleDir);

        expect(proof.serverSeed).toBe(serverSeed);
        expect(proof.serverSeedHash).toBe(commitment.serverSeedHash);
        expect(proof.clientSeed).toBe(commitment.clientSeed);
        expect(proof.nonce).toBe(commitment.nonce);
        expect(proof.libraryId).toBe(commitment.libraryId);
        expect(proof.libraryHash).toBe(commitment.libraryHash);
        expect(proof.modeName).toBe("base");
        expect(proof.outcomeId.length).toBeGreaterThan(0);
        expect(proof.weight).toBeGreaterThan(0);
        expect(proof.recordHash).toMatch(/^sha256:[0-9a-f]{64}$/);
        expect(proof.indexHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    });

    it("is deterministic — the same commitment/serverSeed/bundle always produces the exact same draw", async () => {
        const serverSeed = "server-seed-determinism";
        const commitment = await issueFairnessCommitmentFor(bundleDir, "base", {serverSeed});
        const builder = new FairnessRoundProofBuilder();

        const first = await builder.build(commitment, serverSeed, bundleDir);
        const second = await builder.build(commitment, serverSeed, bundleDir);

        expect(second.outcomeId).toBe(first.outcomeId);
        expect(second.weight).toBe(first.weight);
        expect(second.recordHash).toBe(first.recordHash);
        expect(second.indexHash).toBe(first.indexHash);
        expect(second.commitmentHash).toBe(first.commitmentHash);
    });

    it("returns a deeply frozen proof", async () => {
        const serverSeed = "server-seed-frozen";
        const commitment = await issueFairnessCommitmentFor(bundleDir, "base", {serverSeed});
        const proof = await new FairnessRoundProofBuilder().build(commitment, serverSeed, bundleDir);

        expect(Object.isFrozen(proof)).toBe(true);
        expect(() => {
            (proof as {outcomeId: string}).outcomeId = "tampered";
        }).toThrow();
    });

    it("rejects a commitment that doesn't validate on its own", async () => {
        const serverSeed = "server-seed-invalid-commitment";
        const commitment = await issueFairnessCommitmentFor(bundleDir, "base", {serverSeed});
        const malformedCommitment = {...commitment, extra: "field"};
        const builder = new FairnessRoundProofBuilder();

        await expect(builder.build(malformedCommitment as unknown as FairnessCommitment, serverSeed, bundleDir)).rejects.toThrow(
            FairnessRoundProofBuildError,
        );
    });

    it("rejects a revealed serverSeed that doesn't hash to the commitment's own serverSeedHash", async () => {
        const commitment = await issueFairnessCommitmentFor(bundleDir, "base", {serverSeed: "server-seed-committed"});
        const builder = new FairnessRoundProofBuilder();

        await expect(builder.build(commitment, "a-different-seed-entirely", bundleDir)).rejects.toThrow(FairnessRoundProofBuildError);
    });

    it("rejects a commitment whose libraryId/libraryHash no longer matches the live bundle's own mode index", async () => {
        const serverSeed = "server-seed-3";
        const commitment = await issueFairnessCommitmentFor(bundleDir, "base", {serverSeed});
        const tampered: FairnessCommitment = {...commitment, libraryHash: `sha256:${"0".repeat(64)}`};
        const builder = new FairnessRoundProofBuilder();

        await expect(builder.build(tampered, serverSeed, bundleDir)).rejects.toThrow(FairnessRoundProofBuildError);
    });

    it("aborts with bundle drift when the mode index changes between the first read and the post-draw re-verification", async () => {
        const serverSeed = "server-seed-drift";
        const commitment = await issueFairnessCommitmentFor(bundleDir, "base", {serverSeed});
        const reader = new OutcomeLibraryBundleReader();
        const originalIndex = await reader.readModeIndex(bundleDir, "base");
        const tamperedIndex: OutcomeLibraryBundleModeIndex = {
            ...originalIndex,
            entries: originalIndex.entries.map((entry) => (entry === originalIndex.entries[0] ? {...entry, weight: entry.weight + 1} : entry)),
        };

        let call = 0;
        const driftingReader: OutcomeLibraryBundleReading = {
            readManifest: (dir) => reader.readManifest(dir),
            readModeIndex: () => {
                call++;
                return Promise.resolve(call === 1 ? originalIndex : tamperedIndex);
            },
            iterateModeOutcomes: (dir, modeName) => reader.iterateModeOutcomes(dir, modeName),
            readOutcomeById: (dir, modeName, id) => reader.readOutcomeById(dir, modeName, id),
            drawOutcome: (dir, modeName, randomSource) => reader.drawOutcome(dir, modeName, randomSource),
            readLibrary: (dir, modeName) => reader.readLibrary(dir, modeName),
        };
        const builder = new FairnessRoundProofBuilder(driftingReader);

        await expect(builder.build(commitment, serverSeed, bundleDir)).rejects.toThrow(FairnessRoundProofBuildError);
    });

    it("still rejects a malformed commitment even when a permissive custom validator is injected", async () => {
        const serverSeed = "server-seed-permissive-validator";
        const commitment = await issueFairnessCommitmentFor(bundleDir, "base", {serverSeed});
        const malformedCommitment = {...commitment, extra: "field"} as unknown as FairnessCommitment;
        const alwaysValidCommitmentValidator = {validate: () => []};
        const builder = new FairnessRoundProofBuilder(undefined, undefined, alwaysValidCommitmentValidator);

        // The mandatory FairnessCommitmentValidator always runs first and can never be suppressed — an
        // "additional" validator that always reports no issues of its own is still only ever additive.
        await expect(builder.build(malformedCommitment, serverSeed, bundleDir)).rejects.toThrow(FairnessRoundProofBuildError);
    });

    it("rejects a modeName that doesn't match this bundle format's own canonical rule, without reading any file", async () => {
        const serverSeed = "server-seed-path-traversal";
        const commitment = await issueFairnessCommitmentFor(bundleDir, "base", {serverSeed});
        let readerWasCalled = false;
        const neverCalledReader: OutcomeLibraryBundleReading = {
            readManifest: () => {
                readerWasCalled = true;
                return Promise.reject(new Error("should never be called"));
            },
            readModeIndex: () => {
                readerWasCalled = true;
                return Promise.reject(new Error("should never be called"));
            },
            iterateModeOutcomes: () => {
                readerWasCalled = true;
                throw new Error("should never be called");
            },
            readOutcomeById: () => {
                readerWasCalled = true;
                return Promise.reject(new Error("should never be called"));
            },
            drawOutcome: () => {
                readerWasCalled = true;
                return Promise.reject(new Error("should never be called"));
            },
            readLibrary: () => {
                readerWasCalled = true;
                return Promise.reject(new Error("should never be called"));
            },
        };
        const tampered: FairnessCommitment = {...commitment, modeName: "../../outside"};
        const builder = new FairnessRoundProofBuilder(neverCalledReader);

        await expect(builder.build(tampered, serverSeed, bundleDir)).rejects.toThrow(FairnessRoundProofBuildError);
        expect(readerWasCalled).toBe(false);
    });
});
