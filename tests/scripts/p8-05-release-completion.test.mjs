import assert from "node:assert/strict";
import path from "node:path";
import {test} from "@jest/globals";
import {P805_RELEASE_DIRECTORY, validateP805ReleaseGate} from "../../scripts/p8-05-release-completion.mjs";

const candidateId = "c".repeat(40), candidatePackageSha256 = "d".repeat(64);
const config = () => ({candidateId, candidatePackageSha256, campaignDirectory:path.resolve("docs/evidence/p8-05-product-readiness"), outputDirectory:P805_RELEASE_DIRECTORY, pc20:{candidateId, candidatePackageSha256}});

test("refuses the PC-20 gate before a candidate-bound clean five-persona closeout", async () => {
    await assert.rejects(() => validateP805ReleaseGate(config(), {validateCampaign:async () => { throw new Error("clean retest closeout missing"); }}), /clean retest closeout missing/);
});

test("keeps the release directory canonical", () => {
    assert.match(P805_RELEASE_DIRECTORY, /docs[\\/]evidence[\\/]p8-05-product-readiness[\\/]release$/);
});
