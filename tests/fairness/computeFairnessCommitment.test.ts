import {computeFairnessCommitment, computeFairnessServerSeedCommitment, FairnessServerSeedCommitment, POKIE_FAIRNESS_ALGORITHM_VERSION} from "pokie";

describe("computeFairnessCommitment", () => {
    const serverSeedCommitment: FairnessServerSeedCommitment = computeFairnessServerSeedCommitment({serverSeed: "a-secret-server-seed"});
    const baseInput = {
        serverSeedCommitment,
        clientSeed: "a-client-seed",
        nonce: 0,
        libraryId: "base-lib",
        libraryHash: `sha256:${"a".repeat(64)}`,
        modeName: "base",
    };

    it("carries serverSeedHash forward unchanged from the given serverSeedCommitment, never touching a raw serverSeed", () => {
        const commitment = computeFairnessCommitment(baseInput);

        expect(commitment.serverSeedHash).toBe(serverSeedCommitment.serverSeedHash);
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

    it("rejects a malformed serverSeedCommitment", () => {
        expect(() => computeFairnessCommitment({...baseInput, serverSeedCommitment: null as unknown as FairnessServerSeedCommitment})).toThrow(RangeError);
        expect(() =>
            computeFairnessCommitment({...baseInput, serverSeedCommitment: {...serverSeedCommitment, serverSeedHash: ""}}),
        ).toThrow(RangeError);
    });

    it("rejects an empty clientSeed", () => {
        expect(() => computeFairnessCommitment({...baseInput, clientSeed: ""})).toThrow(RangeError);
    });

    it("rejects a negative or non-integer nonce", () => {
        expect(() => computeFairnessCommitment({...baseInput, nonce: -1})).toThrow(RangeError);
        expect(() => computeFairnessCommitment({...baseInput, nonce: 1.5})).toThrow(RangeError);
    });

    it("rejects an empty libraryId/libraryHash/modeName", () => {
        expect(() => computeFairnessCommitment({...baseInput, libraryId: ""})).toThrow(RangeError);
        expect(() => computeFairnessCommitment({...baseInput, libraryHash: ""})).toThrow(RangeError);
        expect(() => computeFairnessCommitment({...baseInput, modeName: ""})).toThrow(RangeError);
    });
});
