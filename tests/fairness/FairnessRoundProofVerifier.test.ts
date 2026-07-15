import fs from "fs";
import os from "os";
import path from "path";
import {
    computeFairnessCommitment,
    FairnessRoundProof,
    FairnessRoundProofBuilder,
    FairnessRoundProofVerifier,
    OutcomeLibraryBundleReader,
    OutcomeLibraryBundleReading,
    OutcomeLibraryBundleWriter,
    WeightedOutcome,
} from "pokie";
import {buildOutcomeLibraryBundleModeInput} from "../weightedoutcome/bundle/OutcomeLibraryBundleTestFixtures.js";
import {buildFairnessSourceBundle, FAIRNESS_TEST_POKIE_VERSION} from "./FairnessRoundProofTestFixtures.js";

function createNeverCalledReader(onCalled: () => void): OutcomeLibraryBundleReading {
    return {
        readManifest: () => {
            onCalled();
            return Promise.reject(new Error("should never be called"));
        },
        readModeIndex: () => {
            onCalled();
            return Promise.reject(new Error("should never be called"));
        },
        iterateModeOutcomes: (): AsyncIterable<WeightedOutcome> => {
            onCalled();
            throw new Error("should never be called");
        },
        readOutcomeById: () => {
            onCalled();
            return Promise.reject(new Error("should never be called"));
        },
        drawOutcome: () => {
            onCalled();
            return Promise.reject(new Error("should never be called"));
        },
        readLibrary: () => {
            onCalled();
            return Promise.reject(new Error("should never be called"));
        },
    };
}

describe("FairnessRoundProofVerifier", () => {
    let tmpRoot: string;
    let bundleDir: string;
    let verifier: FairnessRoundProofVerifier;
    let serverSeed: string;
    let proof: FairnessRoundProof;

    beforeEach(async () => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fairness-verifier-"));
        bundleDir = path.join(tmpRoot, "bundle");
        verifier = new FairnessRoundProofVerifier();

        await buildFairnessSourceBundle(bundleDir, ["base"]);
        serverSeed = "server-seed-verifier";
        const index = await new OutcomeLibraryBundleReader().readModeIndex(bundleDir, "base");
        const commitment = computeFairnessCommitment({
            serverSeed,
            clientSeed: "client-seed-verifier",
            nonce: 3,
            libraryId: index.libraryId,
            libraryHash: index.libraryHash,
            modeName: "base",
        });
        proof = await new FairnessRoundProofBuilder().build(commitment, serverSeed, bundleDir);
    });

    afterEach(() => {
        fs.rmSync(tmpRoot, {recursive: true, force: true});
    });

    it("verifies cleanly right after a build, against the unchanged source bundle", async () => {
        const issues = await verifier.verify(proof, {sourceBundleDir: bundleDir});
        expect(issues).toEqual([]);
    });

    it("rejects a candidate that isn't shaped like a proof, without touching the bundle", async () => {
        let readerWasCalled = false;
        const isolatedVerifier = new FairnessRoundProofVerifier(undefined, createNeverCalledReader(() => (readerWasCalled = true)));

        const issues = await isolatedVerifier.verify({not: "a proof"}, {sourceBundleDir: bundleDir});

        expect(readerWasCalled).toBe(false);
        expect(issues.map((issue) => issue.code)).toEqual(["fairness-round-proof-malformed"]);
    });

    it("short-circuits on an invalid seed without attempting a live bundle cross-check", async () => {
        let readerWasCalled = false;
        const isolatedVerifier = new FairnessRoundProofVerifier(undefined, createNeverCalledReader(() => (readerWasCalled = true)));

        const issues = await isolatedVerifier.verify({...proof, serverSeed: "wrong-seed"}, {sourceBundleDir: bundleDir});

        expect(readerWasCalled).toBe(false);
        expect(issues.map((issue) => issue.code)).toContain("fairness-round-proof-server-seed-mismatch");
    });

    it("short-circuits on an unsupported algorithmVersion without attempting a live bundle cross-check", async () => {
        let readerWasCalled = false;
        const isolatedVerifier = new FairnessRoundProofVerifier(undefined, createNeverCalledReader(() => (readerWasCalled = true)));

        const issues = await isolatedVerifier.verify({...proof, algorithmVersion: "some-other-algorithm-v1"}, {sourceBundleDir: bundleDir});

        expect(readerWasCalled).toBe(false);
        expect(issues.map((issue) => issue.code)).toEqual(["fairness-round-proof-algorithm-unsupported"]);
    });

    it("requires an explicit sourceBundleDir and reads nothing without one", async () => {
        let readerWasCalled = false;
        const isolatedVerifier = new FairnessRoundProofVerifier(undefined, createNeverCalledReader(() => (readerWasCalled = true)));

        const issues = await isolatedVerifier.verify(proof);

        expect(readerWasCalled).toBe(false);
        expect(issues.map((issue) => issue.code)).toContain("fairness-verify-source-bundle-dir-required");
    });

    it("reports a diagnostic when the source bundle's mode index can't be read", async () => {
        const issues = await verifier.verify(proof, {sourceBundleDir: path.join(tmpRoot, "does-not-exist")});

        expect(issues.map((issue) => issue.code)).toContain("fairness-verify-source-bundle-unreadable");
    });

    it("detects bundle drift and a substituted record when the source library is rebuilt with different content", async () => {
        // Same modeName/ids ("0".."4"), but a different libraryId changes every outcome's own roundId (and
        // therefore its recordHash) while leaving weights numerically identical — isolating the drift/record
        // codes from a selection-mismatch that a weight-preserving rebuild would never trigger.
        const rebuiltMode = buildOutcomeLibraryBundleModeInput("base", "base-lib-rebuilt");
        await new OutcomeLibraryBundleWriter(FAIRNESS_TEST_POKIE_VERSION).writeToDirectory([rebuiltMode], bundleDir);

        const issues = await verifier.verify(proof, {sourceBundleDir: bundleDir});
        const codes = issues.map((issue) => issue.code);

        expect(codes).toContain("fairness-verify-library-mismatch");
        expect(codes).toContain("fairness-verify-index-hash-mismatch");
        expect(codes).toContain("fairness-verify-outcome-record-mismatch");
    });

    it("detects a weight/recordHash forged self-consistently for the same outcome id, via the live index cross-check", async () => {
        const forgedProof: FairnessRoundProof = {
            ...proof,
            weight: proof.weight + 1,
            recordHash: `sha256:${"f".repeat(64)}`,
        };

        const issues = await verifier.verify(forgedProof, {sourceBundleDir: bundleDir});

        expect(issues.map((issue) => issue.code)).toContain("fairness-verify-outcome-record-mismatch");
    });

    it("detects a proof substituted with a different, individually valid, still-existing outcome (selection mismatch)", async () => {
        const index = await new OutcomeLibraryBundleReader().readModeIndex(bundleDir, "base");
        const substituteEntry = index.entries.find((entry) => entry.id !== proof.outcomeId)!;

        const substitutedProof: FairnessRoundProof = {
            ...proof,
            outcomeId: substituteEntry.id,
            weight: substituteEntry.weight,
            recordHash: substituteEntry.recordHash,
        };

        const issues = await verifier.verify(substitutedProof, {sourceBundleDir: bundleDir});
        const codes = issues.map((issue) => issue.code);

        // The substituted outcome is completely genuine and untampered — only "this isn't what this seed/nonce
        // would actually draw" (the selection check) can tell the two apart.
        expect(codes).not.toContain("fairness-verify-outcome-record-mismatch");
        expect(codes).toContain("fairness-verify-selection-mismatch");
    });

    it("detects a tampered nonce — a different nonce deterministically draws a different outcome", async () => {
        const index = await new OutcomeLibraryBundleReader().readModeIndex(bundleDir, "base");
        const builder = new FairnessRoundProofBuilder();

        let differingNonce: number | undefined;
        for (let candidateNonce = 0; candidateNonce < 50; candidateNonce++) {
            if (candidateNonce === proof.nonce) {
                continue;
            }
            const candidateCommitment = computeFairnessCommitment({
                serverSeed,
                clientSeed: proof.clientSeed,
                nonce: candidateNonce,
                libraryId: index.libraryId,
                libraryHash: index.libraryHash,
                modeName: "base",
            });
            const candidateProof = await builder.build(candidateCommitment, serverSeed, bundleDir);
            if (candidateProof.outcomeId !== proof.outcomeId) {
                differingNonce = candidateNonce;
                break;
            }
        }
        expect(differingNonce).toBeDefined();

        const tamperedProof: FairnessRoundProof = {...proof, nonce: differingNonce as number};
        const issues = await verifier.verify(tamperedProof, {sourceBundleDir: bundleDir});

        expect(issues.map((issue) => issue.code)).toContain("fairness-verify-selection-mismatch");
    });

    it("detects an outcome id no longer present in the live bundle's mode index", async () => {
        const indexPath = path.join(bundleDir, "index_base.json");
        const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
        index.entries = index.entries.filter((entry: {id: string}) => entry.id !== proof.outcomeId);
        fs.writeFileSync(indexPath, JSON.stringify(index));

        const issues = await verifier.verify(proof, {sourceBundleDir: bundleDir});

        expect(issues.map((issue) => issue.code)).toContain("fairness-verify-outcome-missing");
    });
});
