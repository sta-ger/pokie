import {computeFairnessServerSeedCommitment, FairnessServerSeedCommitmentValidator} from "pokie";

describe("FairnessServerSeedCommitmentValidator", () => {
    const validator = new FairnessServerSeedCommitmentValidator();
    const validCommitment = computeFairnessServerSeedCommitment({serverSeed: "a-secret-server-seed"});

    it("accepts a genuine, untampered commitment", () => {
        expect(validator.validate(validCommitment)).toEqual([]);
    });

    it("rejects a candidate that isn't shaped like a FairnessServerSeedCommitment at all", () => {
        expect(validator.validate(null).map((issue) => issue.code)).toEqual(["fairness-server-seed-commitment-malformed"]);
        expect(validator.validate("not a commitment").map((issue) => issue.code)).toEqual(["fairness-server-seed-commitment-malformed"]);
        expect(validator.validate({}).map((issue) => issue.code)).toEqual(["fairness-server-seed-commitment-malformed"]);
    });

    it("rejects a commitment carrying an extra, unexpected field (closed shape) — e.g. a smuggled-in clientSeed/nonce", () => {
        expect(validator.validate({...validCommitment, clientSeed: "sneaky"}).map((issue) => issue.code)).toEqual([
            "fairness-server-seed-commitment-malformed",
        ]);
        expect(validator.validate({...validCommitment, extra: "field"}).map((issue) => issue.code)).toEqual([
            "fairness-server-seed-commitment-malformed",
        ]);
    });

    it("rejects a missing required field", () => {
        const {serverSeedHash: _serverSeedHash, ...withoutServerSeedHash} = validCommitment;
        expect(validator.validate(withoutServerSeedHash).map((issue) => issue.code)).toEqual(["fairness-server-seed-commitment-malformed"]);
    });

    it("rejects an unsupported schemaVersion", () => {
        const issues = validator.validate({...validCommitment, schemaVersion: 999});
        expect(issues.map((issue) => issue.code)).toContain("fairness-server-seed-commitment-schema-version-unsupported");
    });

    it("rejects an unsupported algorithmVersion", () => {
        const issues = validator.validate({...validCommitment, algorithmVersion: "some-other-algorithm-v1"});
        expect(issues.map((issue) => issue.code)).toContain("fairness-server-seed-commitment-algorithm-unsupported");
    });

    it("rejects a serverSeedHash that isn't a well-formed sha256:<hex>", () => {
        expect(validator.validate({...validCommitment, serverSeedHash: "not-a-hash"}).map((issue) => issue.code)).toEqual([
            "fairness-server-seed-commitment-malformed",
        ]);
    });

    it("rejects an issuedAt that isn't a valid canonical ISO timestamp", () => {
        expect(validator.validate({...validCommitment, issuedAt: "not a date"}).map((issue) => issue.code)).toEqual([
            "fairness-server-seed-commitment-malformed",
        ]);
        expect(validator.validate({...validCommitment, issuedAt: "2024-01-01"}).map((issue) => issue.code)).toEqual([
            "fairness-server-seed-commitment-malformed",
        ]);
    });
});
