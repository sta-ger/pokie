import fs from "fs";
import os from "os";
import path from "path";
import {
    FairnessCommitment,
    FairnessRoundProof,
    FairnessRoundProofBuilder,
    FairnessRoundProofVerifier,
    OutcomeLibraryBundleModeIndex,
    OutcomeLibraryBundleReader,
    OutcomeLibraryBundleReading,
    OutcomeLibraryBundleWriter,
    WeightedOutcome,
} from "pokie";
import {buildOutcomeLibraryBundleModeInput} from "../weightedoutcome/bundle/OutcomeLibraryBundleTestFixtures.js";
import {buildFairnessSourceBundle, FAIRNESS_TEST_POKIE_VERSION, issueFairnessCommitmentFor} from "./FairnessRoundProofTestFixtures.js";

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
    let commitment: FairnessCommitment;
    let proof: FairnessRoundProof;

    beforeEach(async () => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fairness-verifier-"));
        bundleDir = path.join(tmpRoot, "bundle");
        verifier = new FairnessRoundProofVerifier();

        await buildFairnessSourceBundle(bundleDir, ["base"]);
        serverSeed = "server-seed-verifier";
        commitment = await issueFairnessCommitmentFor(bundleDir, "base", {serverSeed, clientSeed: "client-seed-verifier", nonce: 3});
        proof = await new FairnessRoundProofBuilder().build(commitment, serverSeed, bundleDir);
    });

    afterEach(() => {
        fs.rmSync(tmpRoot, {recursive: true, force: true});
    });

    it("verifies cleanly right after a build, against the original commitment and the unchanged source bundle", async () => {
        const issues = await verifier.verify(proof, {commitment, sourceBundleDir: bundleDir});
        expect(issues).toEqual([]);
    });

    it("rejects a candidate that isn't shaped like a proof, without touching the bundle", async () => {
        let readerWasCalled = false;
        const isolatedVerifier = new FairnessRoundProofVerifier(createNeverCalledReader(() => (readerWasCalled = true)));

        const issues = await isolatedVerifier.verify({not: "a proof"}, {commitment, sourceBundleDir: bundleDir});

        expect(readerWasCalled).toBe(false);
        expect(issues.map((issue) => issue.code)).toEqual(["fairness-round-proof-malformed"]);
    });

    it("short-circuits on an invalid seed without attempting a commitment or bundle cross-check", async () => {
        let readerWasCalled = false;
        const isolatedVerifier = new FairnessRoundProofVerifier(createNeverCalledReader(() => (readerWasCalled = true)));

        const issues = await isolatedVerifier.verify({...proof, serverSeed: "wrong-seed"}, {commitment, sourceBundleDir: bundleDir});

        expect(readerWasCalled).toBe(false);
        expect(issues.map((issue) => issue.code)).toContain("fairness-round-proof-server-seed-mismatch");
    });

    it("short-circuits on an unsupported algorithmVersion without attempting a commitment or bundle cross-check", async () => {
        let readerWasCalled = false;
        const isolatedVerifier = new FairnessRoundProofVerifier(createNeverCalledReader(() => (readerWasCalled = true)));

        const issues = await isolatedVerifier.verify(
            {...proof, algorithmVersion: "some-other-algorithm-v1"},
            {commitment, sourceBundleDir: bundleDir},
        );

        expect(readerWasCalled).toBe(false);
        expect(issues.map((issue) => issue.code)).toEqual(["fairness-round-proof-algorithm-unsupported"]);
    });

    it("requires an explicit commitment and reads nothing without one", async () => {
        let readerWasCalled = false;
        const isolatedVerifier = new FairnessRoundProofVerifier(createNeverCalledReader(() => (readerWasCalled = true)));

        const issues = await isolatedVerifier.verify(proof, {sourceBundleDir: bundleDir});

        expect(readerWasCalled).toBe(false);
        expect(issues.map((issue) => issue.code)).toContain("fairness-verify-commitment-required");
    });

    it("requires an explicit commitment even when sourceBundleDir is also omitted", async () => {
        const issues = await verifier.verify(proof);
        expect(issues.map((issue) => issue.code)).toContain("fairness-verify-commitment-required");
    });

    it("rejects a commitment that doesn't validate on its own, without touching the bundle", async () => {
        let readerWasCalled = false;
        const isolatedVerifier = new FairnessRoundProofVerifier(createNeverCalledReader(() => (readerWasCalled = true)));

        const issues = await isolatedVerifier.verify(proof, {commitment: {...commitment, extra: "field"}, sourceBundleDir: bundleDir});

        expect(readerWasCalled).toBe(false);
        expect(issues.map((issue) => issue.code)).toContain("fairness-verify-commitment-invalid");
    });

    it("requires an explicit sourceBundleDir once the commitment checks out, and reads nothing without one", async () => {
        let readerWasCalled = false;
        const isolatedVerifier = new FairnessRoundProofVerifier(createNeverCalledReader(() => (readerWasCalled = true)));

        const issues = await isolatedVerifier.verify(proof, {commitment});

        expect(readerWasCalled).toBe(false);
        expect(issues.map((issue) => issue.code)).toContain("fairness-verify-source-bundle-dir-required");
    });

    it("detects a forged proof built around a fresh, self-consistent serverSeed/serverSeedHash pair as not bound to the original commitment", async () => {
        // Fully self-consistent on its own (a genuine draw against the same bundle with a different serverSeed)
        // — passes FairnessRoundProofValidating by itself, and would verify cleanly against ITS OWN commitment.
        // The point: checked against the ORIGINAL commitment, it must still fail.
        const forgedServerSeed = "a-completely-unrelated-server-seed";
        const forgedCommitment = await issueFairnessCommitmentFor(bundleDir, "base", {
            serverSeed: forgedServerSeed,
            clientSeed: commitment.clientSeed,
            nonce: commitment.nonce,
        });
        const forgedProof = await new FairnessRoundProofBuilder().build(forgedCommitment, forgedServerSeed, bundleDir);

        const issues = await verifier.verify(forgedProof, {commitment, sourceBundleDir: bundleDir});
        const codes = issues.map((issue) => issue.code);

        expect(codes).toContain("fairness-verify-commitment-hash-mismatch");
        expect(codes).toContain("fairness-verify-commitment-mismatch");
    });

    it("detects a tampered clientSeed between commitment and proof", async () => {
        const tamperedCommitment: FairnessCommitment = {...commitment, clientSeed: "a-different-client-seed"};
        const issues = await verifier.verify(proof, {commitment: tamperedCommitment, sourceBundleDir: bundleDir});
        const codes = issues.map((issue) => issue.code);

        expect(codes).toContain("fairness-verify-commitment-mismatch");
    });

    it("detects a tampered nonce between commitment and proof", async () => {
        const tamperedCommitment: FairnessCommitment = {...commitment, nonce: commitment.nonce + 1};
        const issues = await verifier.verify(proof, {commitment: tamperedCommitment, sourceBundleDir: bundleDir});
        const codes = issues.map((issue) => issue.code);

        expect(codes).toContain("fairness-verify-commitment-mismatch");
    });

    it("detects a tampered libraryId/libraryHash/modeName between commitment and proof", async () => {
        const tamperedLibraryId = await verifier.verify(proof, {commitment: {...commitment, libraryId: "a-different-lib"}, sourceBundleDir: bundleDir});
        const tamperedLibraryHash = await verifier.verify(proof, {
            commitment: {...commitment, libraryHash: `sha256:${"9".repeat(64)}`},
            sourceBundleDir: bundleDir,
        });
        const tamperedModeName = await verifier.verify(proof, {commitment: {...commitment, modeName: "bonus"}, sourceBundleDir: bundleDir});

        expect(tamperedLibraryId.map((issue) => issue.code)).toContain("fairness-verify-commitment-mismatch");
        expect(tamperedLibraryHash.map((issue) => issue.code)).toContain("fairness-verify-commitment-mismatch");
        expect(tamperedModeName.map((issue) => issue.code)).toContain("fairness-verify-commitment-mismatch");
    });

    it("reports a diagnostic when the source bundle's mode index can't be read", async () => {
        const issues = await verifier.verify(proof, {commitment, sourceBundleDir: path.join(tmpRoot, "does-not-exist")});

        expect(issues.map((issue) => issue.code)).toContain("fairness-verify-source-bundle-unreadable");
    });

    it("detects bundle drift and a substituted record when the source library is rebuilt with different content", async () => {
        // Same modeName/ids ("0".."4"), but a different libraryId changes every outcome's own roundId (and
        // therefore its recordHash) while leaving weights numerically identical — isolating the drift/record
        // codes from a selection-mismatch that a weight-preserving rebuild would never trigger.
        const rebuiltMode = buildOutcomeLibraryBundleModeInput("base", "base-lib-rebuilt");
        await new OutcomeLibraryBundleWriter(FAIRNESS_TEST_POKIE_VERSION).writeToDirectory([rebuiltMode], bundleDir);

        const issues = await verifier.verify(proof, {commitment, sourceBundleDir: bundleDir});
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

        const issues = await verifier.verify(forgedProof, {commitment, sourceBundleDir: bundleDir});

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

        const issues = await verifier.verify(substitutedProof, {commitment, sourceBundleDir: bundleDir});
        const codes = issues.map((issue) => issue.code);

        // The substituted outcome is completely genuine and untampered — only "this isn't what this seed/nonce
        // would actually draw" (the selection check) can tell the two apart.
        expect(codes).not.toContain("fairness-verify-outcome-record-mismatch");
        expect(codes).toContain("fairness-verify-selection-mismatch");
    });

    it("detects a proof whose own nonce was tampered — a different nonce deterministically draws a different outcome", async () => {
        let differingNonce: number | undefined;
        for (let candidateNonce = 0; candidateNonce < 50; candidateNonce++) {
            if (candidateNonce === proof.nonce) {
                continue;
            }
            const candidateCommitment = await issueFairnessCommitmentFor(bundleDir, "base", {
                serverSeed,
                clientSeed: proof.clientSeed,
                nonce: candidateNonce,
            });
            const candidateProof = await new FairnessRoundProofBuilder().build(candidateCommitment, serverSeed, bundleDir);
            if (candidateProof.outcomeId !== proof.outcomeId) {
                differingNonce = candidateNonce;
                break;
            }
        }
        expect(differingNonce).toBeDefined();

        // Tamper the proof's own nonce (and, self-consistently, the commitment's — otherwise
        // fairness-verify-commitment-mismatch alone would explain the failure) to the one confirmed above to
        // draw a different outcome.
        const tamperedProof: FairnessRoundProof = {...proof, nonce: differingNonce as number};
        const tamperedCommitment: FairnessCommitment = {...commitment, nonce: differingNonce as number};

        const issues = await verifier.verify(tamperedProof, {commitment: tamperedCommitment, sourceBundleDir: bundleDir});

        expect(issues.map((issue) => issue.code)).toContain("fairness-verify-selection-mismatch");
    });

    it("detects an outcome id no longer present in the live bundle's mode index", async () => {
        const indexPath = path.join(bundleDir, "index_base.json");
        const originalIndex = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
        // The entry with the largest byteOffset (last on disk): removing only this one leaves every remaining
        // entry's own byteOffset untouched and still genuinely contiguous — and still matching the real,
        // unmodified outcomes file — so validatePinnedFairnessModeIndex's own byte-layout check still passes,
        // and the redraw below still reads real, correct bytes for whichever remaining entry it selects.
        const lastEntry = [...originalIndex.entries].sort((a: {byteOffset: number}, b: {byteOffset: number}) => b.byteOffset - a.byteOffset)[0];

        // Build a fresh proof/commitment whose own draw happens to land on exactly that entry, so removing it
        // is what makes THIS proof's own outcomeId go missing.
        let targetProof: FairnessRoundProof | undefined;
        let targetCommitment: FairnessCommitment | undefined;
        for (let candidateNonce = 0; candidateNonce < 50; candidateNonce++) {
            const candidateCommitment = await issueFairnessCommitmentFor(bundleDir, "base", {serverSeed, clientSeed: "outcome-missing-seed", nonce: candidateNonce});
            const candidateProof = await new FairnessRoundProofBuilder().build(candidateCommitment, serverSeed, bundleDir);
            if (candidateProof.outcomeId === lastEntry.id) {
                targetProof = candidateProof;
                targetCommitment = candidateCommitment;
                break;
            }
        }
        expect(targetProof).toBeDefined();

        const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
        index.entries = index.entries.filter((entry: {id: string}) => entry.id !== lastEntry.id);
        index.outcomeCount -= 1;
        index.totalWeight -= lastEntry.weight;
        fs.writeFileSync(indexPath, JSON.stringify(index));

        const issues = await verifier.verify(targetProof, {commitment: targetCommitment, sourceBundleDir: bundleDir});

        expect(issues.map((issue) => issue.code)).toContain("fairness-verify-outcome-missing");
    });

    it("detects the mode index changing between the first read and the post-draw re-verification (drift within one draw)", async () => {
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
        const isolatedVerifier = new FairnessRoundProofVerifier(driftingReader);

        const issues = await isolatedVerifier.verify(proof, {commitment, sourceBundleDir: bundleDir});

        expect(issues.map((issue) => issue.code)).toContain("fairness-verify-bundle-drift");
    });

    it("verifies cleanly when the bundle changes and is then restored to its exact original bytes before verification", async () => {
        const backupDir = path.join(tmpRoot, "bundle-backup");
        fs.cpSync(bundleDir, backupDir, {recursive: true});

        const rebuiltMode = buildOutcomeLibraryBundleModeInput("base", "base-lib-rebuilt");
        await new OutcomeLibraryBundleWriter(FAIRNESS_TEST_POKIE_VERSION).writeToDirectory([rebuiltMode], bundleDir);

        fs.rmSync(bundleDir, {recursive: true, force: true});
        fs.cpSync(backupDir, bundleDir, {recursive: true});

        const issues = await verifier.verify(proof, {commitment, sourceBundleDir: bundleDir});

        expect(issues).toEqual([]);
    });

    it("still rejects a malformed proof/commitment even when permissive custom validators are injected", async () => {
        const alwaysValidProofValidator = {validate: () => []};
        const alwaysValidCommitmentValidator = {validate: () => []};
        const isolatedVerifier = new FairnessRoundProofVerifier(undefined, undefined, alwaysValidProofValidator, alwaysValidCommitmentValidator);

        const malformedProofIssues = await isolatedVerifier.verify(
            {...proof, extra: "field"},
            {commitment, sourceBundleDir: bundleDir},
        );
        const malformedCommitmentIssues = await isolatedVerifier.verify(proof, {commitment: {...commitment, extra: "field"}, sourceBundleDir: bundleDir});

        // The mandatory FairnessRoundProofValidator/FairnessCommitmentValidator always run first and can never
        // be suppressed — an "additional" validator that always reports no issues of its own is still only ever
        // additive.
        expect(malformedProofIssues.map((issue) => issue.code)).toContain("fairness-round-proof-malformed");
        expect(malformedCommitmentIssues.map((issue) => issue.code)).toContain("fairness-verify-commitment-invalid");
    });

    it("rejects a proof/commitment modeName that doesn't match this bundle format's own canonical rule, without reading any file", async () => {
        let readerWasCalled = false;
        const isolatedVerifier = new FairnessRoundProofVerifier(createNeverCalledReader(() => (readerWasCalled = true)));

        const tamperedProof: FairnessRoundProof = {...proof, modeName: "../../outside"};
        const issues = await isolatedVerifier.verify(tamperedProof, {commitment, sourceBundleDir: bundleDir});

        expect(readerWasCalled).toBe(false);
        expect(issues.map((issue) => issue.code)).toEqual(["fairness-round-proof-malformed"]);
    });

    it("rejects a mode index with an outcomesFile that doesn't match the canonical outcomes_<modeName>.jsonl convention", async () => {
        const indexPath = path.join(bundleDir, "index_base.json");
        const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
        index.outcomesFile = "../outside.jsonl";
        fs.writeFileSync(indexPath, JSON.stringify(index));

        const issues = await verifier.verify(proof, {commitment, sourceBundleDir: bundleDir});

        expect(issues.map((issue) => issue.code)).toContain("fairness-verify-mode-index-invalid");
    });

    it("rejects a mode index that carries an extra, unexpected field (closed shape)", async () => {
        const indexPath = path.join(bundleDir, "index_base.json");
        const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
        index.extra = "field";
        fs.writeFileSync(indexPath, JSON.stringify(index));

        const issues = await verifier.verify(proof, {commitment, sourceBundleDir: bundleDir});

        expect(issues.map((issue) => issue.code)).toContain("fairness-verify-mode-index-invalid");
    });

    it("rejects a mode index with an unsupported schemaVersion/librarySchemaVersion", async () => {
        const indexPath = path.join(bundleDir, "index_base.json");
        const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));

        fs.writeFileSync(indexPath, JSON.stringify({...index, schemaVersion: 999}));
        const schemaIssues = await verifier.verify(proof, {commitment, sourceBundleDir: bundleDir});

        fs.writeFileSync(indexPath, JSON.stringify({...index, librarySchemaVersion: 999}));
        const librarySchemaIssues = await verifier.verify(proof, {commitment, sourceBundleDir: bundleDir});

        expect(schemaIssues.map((issue) => issue.code)).toContain("fairness-verify-mode-index-invalid");
        expect(librarySchemaIssues.map((issue) => issue.code)).toContain("fairness-verify-mode-index-invalid");
    });

    it("rejects a mode index whose entries are no longer canonically sorted by id", async () => {
        const indexPath = path.join(bundleDir, "index_base.json");
        const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
        index.entries = [...index.entries].reverse();
        fs.writeFileSync(indexPath, JSON.stringify(index));

        const issues = await verifier.verify(proof, {commitment, sourceBundleDir: bundleDir});

        expect(issues.map((issue) => issue.code)).toContain("fairness-verify-mode-index-invalid");
    });

    it("rejects a mode index entry carrying an extra, unexpected field (closed shape)", async () => {
        const indexPath = path.join(bundleDir, "index_base.json");
        const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
        index.entries[0] = {...index.entries[0], extra: "field"};
        fs.writeFileSync(indexPath, JSON.stringify(index));

        const issues = await verifier.verify(proof, {commitment, sourceBundleDir: bundleDir});

        expect(issues.map((issue) => issue.code)).toContain("fairness-verify-mode-index-invalid");
    });

    it("rejects a mode index whose first entry doesn't start at byteOffset 0", async () => {
        const indexPath = path.join(bundleDir, "index_base.json");
        const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
        index.entries[0] = {...index.entries[0], byteOffset: 1};
        fs.writeFileSync(indexPath, JSON.stringify(index));

        const issues = await verifier.verify(proof, {commitment, sourceBundleDir: bundleDir});

        expect(issues.map((issue) => issue.code)).toContain("fairness-verify-mode-index-invalid");
    });

    it("rejects a mode index with a gap between two entries' own byte ranges", async () => {
        const indexPath = path.join(bundleDir, "index_base.json");
        const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
        index.entries[1] = {...index.entries[1], byteOffset: index.entries[1].byteOffset + 10};
        fs.writeFileSync(indexPath, JSON.stringify(index));

        const issues = await verifier.verify(proof, {commitment, sourceBundleDir: bundleDir});

        expect(issues.map((issue) => issue.code)).toContain("fairness-verify-mode-index-invalid");
    });

    it("rejects a mode index with overlapping entry byte ranges", async () => {
        const indexPath = path.join(bundleDir, "index_base.json");
        const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
        index.entries[1] = {...index.entries[1], byteOffset: index.entries[0].byteOffset};
        fs.writeFileSync(indexPath, JSON.stringify(index));

        const issues = await verifier.verify(proof, {commitment, sourceBundleDir: bundleDir});

        expect(issues.map((issue) => issue.code)).toContain("fairness-verify-mode-index-invalid");
    });

    it("rejects a mode index entry whose byteOffset + byteLength overflows a safe integer", async () => {
        const indexPath = path.join(bundleDir, "index_base.json");
        const index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
        // entries[1]'s own byteOffset is left exactly as-is (still the correct, contiguous value) — only its
        // byteLength is pushed to Number.MAX_SAFE_INTEGER, itself a valid safe integer on its own, so this
        // isolates the byteOffset + byteLength overflow check from the contiguity check above it.
        index.entries[1] = {...index.entries[1], byteLength: Number.MAX_SAFE_INTEGER};
        fs.writeFileSync(indexPath, JSON.stringify(index));

        const issues = await verifier.verify(proof, {commitment, sourceBundleDir: bundleDir});

        expect(issues.map((issue) => issue.code)).toContain("fairness-verify-mode-index-invalid");
    });

    it("still verifies cleanly against a genuinely correct, untampered canonical index", async () => {
        // Sanity check for every mode-index-tampering test above: the exact same live bundle, unmodified,
        // continues to verify with no issues at all — the byte-layout/closed-shape/sort-order checks reject only
        // genuinely malformed indexes, never a real one produced by OutcomeLibraryBundleWriter.
        const issues = await verifier.verify(proof, {commitment, sourceBundleDir: bundleDir});
        expect(issues).toEqual([]);
    });
});
