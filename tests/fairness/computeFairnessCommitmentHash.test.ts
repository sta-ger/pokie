import {computeFairnessCommitment, computeFairnessCommitmentHash, computeFairnessServerSeedCommitment, FairnessCommitment} from "pokie";

describe("computeFairnessCommitmentHash", () => {
    const serverSeedCommitment = computeFairnessServerSeedCommitment({serverSeed: "a-secret-server-seed", issuedAt: "2026-01-01T00:00:00.000Z"});
    const commitment: FairnessCommitment = computeFairnessCommitment({
        serverSeedCommitment,
        clientSeed: "a-client-seed",
        nonce: 3,
        libraryId: "base-lib",
        libraryHash: `sha256:${"a".repeat(64)}`,
        modeName: "base",
        issuedAt: "2026-01-01T00:01:00.000Z",
    });

    it("is deterministic for the exact same commitment content", () => {
        expect(computeFairnessCommitmentHash(commitment)).toBe(computeFairnessCommitmentHash({...commitment}));
    });

    it("is stable regardless of the source object's own key order", () => {
        const reordered: FairnessCommitment = {
            modeName: commitment.modeName,
            libraryHash: commitment.libraryHash,
            libraryId: commitment.libraryId,
            nonce: commitment.nonce,
            clientSeed: commitment.clientSeed,
            serverSeedHash: commitment.serverSeedHash,
            algorithmVersion: commitment.algorithmVersion,
            schemaVersion: commitment.schemaVersion,
            issuedAt: commitment.issuedAt,
        };
        expect(computeFairnessCommitmentHash(reordered)).toBe(computeFairnessCommitmentHash(commitment));
    });

    it("changes when any field changes", () => {
        const baseline = computeFairnessCommitmentHash(commitment);

        expect(computeFairnessCommitmentHash({...commitment, nonce: commitment.nonce + 1})).not.toBe(baseline);
        expect(computeFairnessCommitmentHash({...commitment, clientSeed: "different-client-seed"})).not.toBe(baseline);
        expect(computeFairnessCommitmentHash({...commitment, libraryId: "different-lib"})).not.toBe(baseline);
    });

    it("returns the sha256:<hex> convention every hash in this codebase shares", () => {
        expect(computeFairnessCommitmentHash(commitment)).toMatch(/^sha256:[0-9a-f]{64}$/);
    });
});
