import crypto from "crypto";
import {computeFairnessCommitment, POKIE_FAIRNESS_ALGORITHM_VERSION} from "pokie";

function sha256OfBytes(bytes: string): string {
    return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

describe("computeFairnessCommitment", () => {
    const baseInput = {
        serverSeed: "a-secret-server-seed",
        clientSeed: "a-client-seed",
        nonce: 0,
        libraryId: "base-lib",
        libraryHash: `sha256:${"a".repeat(64)}`,
        modeName: "base",
    };

    it("fixes serverSeedHash from serverSeed, never exposing the seed itself", () => {
        const commitment = computeFairnessCommitment(baseInput);

        expect(commitment.serverSeedHash).toBe(sha256OfBytes(baseInput.serverSeed));
        expect(JSON.stringify(commitment)).not.toContain(baseInput.serverSeed);
        expect(Object.keys(commitment)).not.toContain("serverSeed");
    });

    it("stamps the current supported algorithmVersion/schemaVersion", () => {
        const commitment = computeFairnessCommitment(baseInput);

        expect(commitment.algorithmVersion).toBe(POKIE_FAIRNESS_ALGORITHM_VERSION);
        expect(commitment.schemaVersion).toBe(1);
    });

    it("carries clientSeed/nonce/libraryId/libraryHash/modeName through unchanged", () => {
        const commitment = computeFairnessCommitment(baseInput);

        expect(commitment.clientSeed).toBe(baseInput.clientSeed);
        expect(commitment.nonce).toBe(baseInput.nonce);
        expect(commitment.libraryId).toBe(baseInput.libraryId);
        expect(commitment.libraryHash).toBe(baseInput.libraryHash);
        expect(commitment.modeName).toBe(baseInput.modeName);
    });

    it("returns a deeply frozen commitment", () => {
        const commitment = computeFairnessCommitment(baseInput);

        expect(Object.isFrozen(commitment)).toBe(true);
        expect(() => {
            (commitment as {nonce: number}).nonce = 99;
        }).toThrow();
    });

    it("rejects an empty serverSeed/clientSeed", () => {
        expect(() => computeFairnessCommitment({...baseInput, serverSeed: ""})).toThrow(RangeError);
        expect(() => computeFairnessCommitment({...baseInput, clientSeed: ""})).toThrow(RangeError);
    });

    it("rejects a negative or non-integer nonce", () => {
        expect(() => computeFairnessCommitment({...baseInput, nonce: -1})).toThrow(RangeError);
        expect(() => computeFairnessCommitment({...baseInput, nonce: 1.5})).toThrow(RangeError);
    });
});
