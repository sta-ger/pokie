import {computeFairnessCommitment, computeFairnessServerSeedCommitment, FairnessCommitmentValidator} from "pokie";

describe("FairnessCommitmentValidator", () => {
    const validator = new FairnessCommitmentValidator();
    const serverSeedCommitment = computeFairnessServerSeedCommitment({serverSeed: "a-secret-server-seed"});
    const validCommitment = computeFairnessCommitment({
        serverSeedCommitment,
        clientSeed: "a-client-seed",
        nonce: 0,
        libraryId: "base-lib",
        libraryHash: `sha256:${"a".repeat(64)}`,
        modeName: "base",
    });

    it("accepts a genuine, untampered commitment", () => {
        expect(validator.validate(validCommitment)).toEqual([]);
    });

    it("rejects a candidate that isn't shaped like a FairnessCommitment at all", () => {
        expect(validator.validate(null).map((issue) => issue.code)).toEqual(["fairness-commitment-malformed"]);
        expect(validator.validate("not a commitment").map((issue) => issue.code)).toEqual(["fairness-commitment-malformed"]);
        expect(validator.validate({}).map((issue) => issue.code)).toEqual(["fairness-commitment-malformed"]);
        expect(validator.validate([]).map((issue) => issue.code)).toEqual(["fairness-commitment-malformed"]);
    });

    it("rejects a commitment carrying an extra, unexpected field (closed shape)", () => {
        const issues = validator.validate({...validCommitment, extra: "field"});
        expect(issues.map((issue) => issue.code)).toEqual(["fairness-commitment-malformed"]);
    });

    it("rejects a missing required field", () => {
        const {clientSeed: _clientSeed, ...withoutClientSeed} = validCommitment;
        expect(validator.validate(withoutClientSeed).map((issue) => issue.code)).toEqual(["fairness-commitment-malformed"]);
    });

    it("rejects an unsupported schemaVersion", () => {
        const issues = validator.validate({...validCommitment, schemaVersion: 999});
        expect(issues.map((issue) => issue.code)).toContain("fairness-commitment-schema-version-unsupported");
    });

    it("rejects an unsupported algorithmVersion", () => {
        const issues = validator.validate({...validCommitment, algorithmVersion: "some-other-algorithm-v1"});
        expect(issues.map((issue) => issue.code)).toContain("fairness-commitment-algorithm-unsupported");
    });

    it("rejects an invalid serverSeedHash/libraryHash (not a well-formed sha256:<hex>)", () => {
        expect(validator.validate({...validCommitment, serverSeedHash: "not-a-hash"}).map((issue) => issue.code)).toEqual([
            "fairness-commitment-malformed",
        ]);
        expect(validator.validate({...validCommitment, libraryHash: "sha256:short"}).map((issue) => issue.code)).toEqual([
            "fairness-commitment-malformed",
        ]);
    });

    it("rejects an empty clientSeed/libraryId/modeName", () => {
        expect(validator.validate({...validCommitment, clientSeed: ""}).map((issue) => issue.code)).toEqual(["fairness-commitment-malformed"]);
        expect(validator.validate({...validCommitment, libraryId: ""}).map((issue) => issue.code)).toEqual(["fairness-commitment-malformed"]);
        expect(validator.validate({...validCommitment, modeName: ""}).map((issue) => issue.code)).toEqual(["fairness-commitment-malformed"]);
    });

    it("rejects a modeName that doesn't match this bundle format's own canonical rule ([A-Za-z0-9_-]+)", () => {
        // modeName is later embedded in a filename (index_<modeName>.json/outcomes_<modeName>.jsonl) — a "/" or
        // ".." here would otherwise be a path-traversal vector once a draw is attempted against a live bundle.
        expect(validator.validate({...validCommitment, modeName: "../outside"}).map((issue) => issue.code)).toEqual(["fairness-commitment-malformed"]);
        expect(validator.validate({...validCommitment, modeName: "mode/name"}).map((issue) => issue.code)).toEqual(["fairness-commitment-malformed"]);
        expect(validator.validate({...validCommitment, modeName: "mode name"}).map((issue) => issue.code)).toEqual(["fairness-commitment-malformed"]);
    });

    it("rejects a negative or non-integer nonce", () => {
        expect(validator.validate({...validCommitment, nonce: -1}).map((issue) => issue.code)).toEqual(["fairness-commitment-malformed"]);
        expect(validator.validate({...validCommitment, nonce: 1.5}).map((issue) => issue.code)).toEqual(["fairness-commitment-malformed"]);
    });

    it("rejects an issuedAt that isn't a valid canonical ISO timestamp", () => {
        expect(validator.validate({...validCommitment, issuedAt: "not a date"}).map((issue) => issue.code)).toEqual([
            "fairness-commitment-malformed",
        ]);
        expect(validator.validate({...validCommitment, issuedAt: "2024-01-01"}).map((issue) => issue.code)).toEqual([
            "fairness-commitment-malformed",
        ]);
    });
});
