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

    it("rejects a malformed serverSeedCommitment, via FairnessServerSeedCommitmentValidator", () => {
        expect(() => computeFairnessCommitment({...baseInput, serverSeedCommitment: null as unknown as FairnessServerSeedCommitment})).toThrow(RangeError);
        expect(() =>
            computeFairnessCommitment({...baseInput, serverSeedCommitment: {...serverSeedCommitment, serverSeedHash: ""}}),
        ).toThrow(RangeError);
        // Same closed-shape/algorithm-version checks FairnessServerSeedCommitmentValidator itself enforces — not
        // an ad-hoc, separately-maintained set of field checks that could silently drift from it.
        expect(() =>
            computeFairnessCommitment({...baseInput, serverSeedCommitment: {...serverSeedCommitment, extra: "field"} as unknown as FairnessServerSeedCommitment}),
        ).toThrow(RangeError);
        expect(() =>
            computeFairnessCommitment({...baseInput, serverSeedCommitment: {...serverSeedCommitment, algorithmVersion: "some-other-algorithm-v1"}}),
        ).toThrow(RangeError);
    });

    it("rejects an empty clientSeed", () => {
        expect(() => computeFairnessCommitment({...baseInput, clientSeed: ""})).toThrow(RangeError);
    });

    it("rejects a negative or non-integer nonce", () => {
        expect(() => computeFairnessCommitment({...baseInput, nonce: -1})).toThrow(RangeError);
        expect(() => computeFairnessCommitment({...baseInput, nonce: 1.5})).toThrow(RangeError);
    });

    it("rejects an empty libraryId/libraryHash", () => {
        expect(() => computeFairnessCommitment({...baseInput, libraryId: ""})).toThrow(RangeError);
        expect(() => computeFairnessCommitment({...baseInput, libraryHash: ""})).toThrow(RangeError);
    });

    it("rejects a modeName that doesn't match this bundle format's own canonical rule ([A-Za-z0-9_-]+)", () => {
        expect(() => computeFairnessCommitment({...baseInput, modeName: ""})).toThrow(RangeError);
        expect(() => computeFairnessCommitment({...baseInput, modeName: "../outside"})).toThrow(RangeError);
        expect(() => computeFairnessCommitment({...baseInput, modeName: "mode/name"})).toThrow(RangeError);
    });

    it("rejects an invalid custom issuedAt, without ever needing a bundle", () => {
        expect(() => computeFairnessCommitment({...baseInput, issuedAt: "not a date"})).toThrow(RangeError);
        expect(() => computeFairnessCommitment({...baseInput, issuedAt: "2024-01-01"})).toThrow(RangeError);
    });

    it("accepts a valid custom issuedAt", () => {
        const issuedAt = "2026-01-01T00:00:00.000Z";
        const commitment = computeFairnessCommitment({...baseInput, issuedAt});
        expect(commitment.issuedAt).toBe(issuedAt);
    });
});
