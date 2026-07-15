import fs from "fs";
import os from "os";
import path from "path";
import {
    computeFairnessCommitment,
    FairnessRoundProof,
    FairnessRoundProofBuilder,
    FairnessRoundProofValidator,
    OutcomeLibraryBundleReader,
} from "pokie";
import {buildFairnessSourceBundle} from "./FairnessRoundProofTestFixtures.js";

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
        const index = await new OutcomeLibraryBundleReader().readModeIndex(bundleDir, "base");
        const commitment = computeFairnessCommitment({
            serverSeed,
            clientSeed: "client-seed",
            nonce: 0,
            libraryId: index.libraryId,
            libraryHash: index.libraryHash,
            modeName: "base",
        });
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
});
