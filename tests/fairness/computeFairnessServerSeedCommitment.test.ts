import crypto from "crypto";
import {computeFairnessServerSeedCommitment, POKIE_FAIRNESS_ALGORITHM_VERSION} from "pokie";

function sha256OfBytes(bytes: string): string {
    return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

describe("computeFairnessServerSeedCommitment", () => {
    it("fixes serverSeedHash from serverSeed, never exposing the seed itself", () => {
        const serverSeed = "a-secret-server-seed";
        const commitment = computeFairnessServerSeedCommitment({serverSeed});

        expect(commitment.serverSeedHash).toBe(sha256OfBytes(serverSeed));
        expect(JSON.stringify(commitment)).not.toContain(serverSeed);
        expect(Object.keys(commitment)).not.toContain("serverSeed");
    });

    it("carries no clientSeed/nonce/library fields at all — only serverSeedHash and algorithm/schema stamps", () => {
        const commitment = computeFairnessServerSeedCommitment({serverSeed: "a-secret-server-seed"});

        expect(Object.keys(commitment).sort()).toEqual(["algorithmVersion", "issuedAt", "schemaVersion", "serverSeedHash"]);
        expect(commitment.algorithmVersion).toBe(POKIE_FAIRNESS_ALGORITHM_VERSION);
        expect(commitment.schemaVersion).toBe(1);
    });

    it("returns a deeply frozen commitment", () => {
        const commitment = computeFairnessServerSeedCommitment({serverSeed: "a-secret-server-seed"});

        expect(Object.isFrozen(commitment)).toBe(true);
        expect(() => {
            (commitment as {serverSeedHash: string}).serverSeedHash = "sha256:tampered";
        }).toThrow();
    });

    it("rejects an empty serverSeed", () => {
        expect(() => computeFairnessServerSeedCommitment({serverSeed: ""})).toThrow(RangeError);
    });

    it("rejects an invalid custom issuedAt, without ever needing a bundle", () => {
        expect(() => computeFairnessServerSeedCommitment({serverSeed: "a-secret-server-seed", issuedAt: "not a date"})).toThrow(RangeError);
        expect(() => computeFairnessServerSeedCommitment({serverSeed: "a-secret-server-seed", issuedAt: "2024-01-01"})).toThrow(RangeError);
    });

    it("accepts a valid custom issuedAt", () => {
        const issuedAt = "2026-01-01T00:00:00.000Z";
        const commitment = computeFairnessServerSeedCommitment({serverSeed: "a-secret-server-seed", issuedAt});
        expect(commitment.issuedAt).toBe(issuedAt);
    });
});
