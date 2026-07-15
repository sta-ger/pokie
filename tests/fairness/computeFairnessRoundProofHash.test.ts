import fs from "fs";
import os from "os";
import path from "path";
import {computeFairnessRoundProofHash, FairnessRoundProof, FairnessRoundProofBuilder} from "pokie";
import {buildFairnessSourceBundle, issueFairnessCommitmentFor} from "./FairnessRoundProofTestFixtures.js";

describe("computeFairnessRoundProofHash", () => {
    let tmpRoot: string;
    let bundleDir: string;
    let proof: FairnessRoundProof;

    beforeEach(async () => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fairness-proof-hash-"));
        bundleDir = path.join(tmpRoot, "bundle");
        await buildFairnessSourceBundle(bundleDir, ["base"]);

        const serverSeed = "server-seed-proof-hash";
        const commitment = await issueFairnessCommitmentFor(bundleDir, "base", {serverSeed});
        proof = await new FairnessRoundProofBuilder().build(commitment, serverSeed, bundleDir);
    });

    afterEach(() => {
        fs.rmSync(tmpRoot, {recursive: true, force: true});
    });

    it("is deterministic for the exact same proof content", () => {
        expect(computeFairnessRoundProofHash(proof)).toBe(computeFairnessRoundProofHash({...proof}));
    });

    it("is stable regardless of the source object's own key order", () => {
        const reordered: FairnessRoundProof = {
            revealedAt: proof.revealedAt,
            commitmentHash: proof.commitmentHash,
            recordHash: proof.recordHash,
            weight: proof.weight,
            outcomeId: proof.outcomeId,
            indexHash: proof.indexHash,
            modeName: proof.modeName,
            libraryHash: proof.libraryHash,
            libraryId: proof.libraryId,
            nonce: proof.nonce,
            clientSeed: proof.clientSeed,
            serverSeedHash: proof.serverSeedHash,
            serverSeed: proof.serverSeed,
            algorithmVersion: proof.algorithmVersion,
            schemaVersion: proof.schemaVersion,
        };
        expect(computeFairnessRoundProofHash(reordered)).toBe(computeFairnessRoundProofHash(proof));
    });

    it("changes when any field changes", () => {
        const baseline = computeFairnessRoundProofHash(proof);

        expect(computeFairnessRoundProofHash({...proof, weight: proof.weight + 1})).not.toBe(baseline);
        expect(computeFairnessRoundProofHash({...proof, outcomeId: "a-different-id"})).not.toBe(baseline);
    });

    it("returns the sha256:<hex> convention every hash in this codebase shares", () => {
        expect(computeFairnessRoundProofHash(proof)).toMatch(/^sha256:[0-9a-f]{64}$/);
    });
});
