import fs from "fs";
import os from "os";
import path from "path";
import {FairnessRoundProof, FairnessRoundProofBuilder, FairnessRoundProofValidator} from "pokie";
import {buildFairnessSourceBundle, issueFairnessCommitmentFor} from "./FairnessRoundProofTestFixtures.js";

describe("FairnessRoundProofValidator", () => {
    let tmpRoot: string;
    let bundleDir: string;
    let validProof: FairnessRoundProof;
    const validator = new FairnessRoundProofValidator();

    beforeEach(async () => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fairness-validator-"));
        bundleDir = path.join(tmpRoot, "bundle");
        await buildFairnessSourceBundle(bundleDir, ["base"]);

        const serverSeed = "server-seed-validator";
        const commitment = await issueFairnessCommitmentFor(bundleDir, "base", {serverSeed, clientSeed: "client-seed"});
        validProof = await new FairnessRoundProofBuilder().build(commitment, serverSeed, bundleDir);
    });

    afterEach(() => {
        fs.rmSync(tmpRoot, {recursive: true, force: true});
    });

    it("accepts a genuine, untampered proof", () => {
        expect(validator.validate(validProof)).toEqual([]);
    });

    it("rejects a candidate that isn't shaped like a FairnessRoundProof at all", () => {
        expect(validator.validate(null).map((issue) => issue.code)).toEqual(["fairness-round-proof-malformed"]);
        expect(validator.validate("not a proof").map((issue) => issue.code)).toEqual(["fairness-round-proof-malformed"]);
        expect(validator.validate({}).map((issue) => issue.code)).toEqual(["fairness-round-proof-malformed"]);
    });

    it("rejects a proof carrying an extra, unexpected field", () => {
        const issues = validator.validate({...validProof, extra: "field"});
        expect(issues.map((issue) => issue.code)).toEqual(["fairness-round-proof-malformed"]);
    });

    it("rejects a missing required field", () => {
        const {serverSeed: _serverSeed, ...withoutServerSeed} = validProof;
        expect(validator.validate(withoutServerSeed).map((issue) => issue.code)).toEqual(["fairness-round-proof-malformed"]);
    });

    it("rejects a proof missing its own commitmentHash", () => {
        const {commitmentHash: _commitmentHash, ...withoutCommitmentHash} = validProof;
        expect(validator.validate(withoutCommitmentHash).map((issue) => issue.code)).toEqual(["fairness-round-proof-malformed"]);
    });

    it("rejects a commitmentHash that isn't a well-formed sha256:<hex>", () => {
        expect(validator.validate({...validProof, commitmentHash: "not-a-hash"}).map((issue) => issue.code)).toEqual([
            "fairness-round-proof-malformed",
        ]);
    });

    it("rejects an unsupported schemaVersion", () => {
        const issues = validator.validate({...validProof, schemaVersion: 999});
        expect(issues.map((issue) => issue.code)).toContain("fairness-round-proof-schema-version-unsupported");
    });

    it("rejects an unsupported algorithmVersion", () => {
        const issues = validator.validate({...validProof, algorithmVersion: "some-other-algorithm-v1"});
        expect(issues.map((issue) => issue.code)).toContain("fairness-round-proof-algorithm-unsupported");
    });

    it("rejects a revealed serverSeed that doesn't hash to its own recorded serverSeedHash", () => {
        const issues = validator.validate({...validProof, serverSeed: "a-completely-different-seed"});
        expect(issues.map((issue) => issue.code)).toContain("fairness-round-proof-server-seed-mismatch");
    });

    it("rejects a serverSeedHash that doesn't hash to its own recorded serverSeed", () => {
        const issues = validator.validate({...validProof, serverSeedHash: `sha256:${"0".repeat(64)}`});
        expect(issues.map((issue) => issue.code)).toContain("fairness-round-proof-server-seed-mismatch");
    });

    it("rejects a negative or malformed nonce", () => {
        expect(validator.validate({...validProof, nonce: -1}).map((issue) => issue.code)).toEqual(["fairness-round-proof-malformed"]);
        expect(validator.validate({...validProof, nonce: 1.5}).map((issue) => issue.code)).toEqual(["fairness-round-proof-malformed"]);
    });

    it("rejects a revealedAt that isn't a valid canonical ISO timestamp", () => {
        expect(validator.validate({...validProof, revealedAt: "not a date"}).map((issue) => issue.code)).toEqual([
            "fairness-round-proof-malformed",
        ]);
    });
});
