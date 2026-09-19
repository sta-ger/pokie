import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import path from "node:path";
import {test} from "@jest/globals";
import {P805_RELEASE_DIRECTORY, validateP805ReleaseCompletion, validateP805ReleaseGate} from "../../scripts/p8-05-release-completion.mjs";

const candidateId = "c".repeat(40), candidatePackageSha256 = "d".repeat(64);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const config = () => ({candidateId, candidatePackageSha256, freezeAnchorSha256:"a".repeat(64), closeoutAnchorSha256:"b".repeat(64), campaignDirectory:path.join("/tmp", "p8-05-campaign"), outputDirectory:path.join("/tmp", "p8-05-release"), pc20:{candidateId, candidatePackageSha256, lifecycleReceiptPath:path.join("/tmp", "pc20-lifecycle.json"), lifecycleReceiptSha256:"f".repeat(64)}});

test("refuses the PC-20 gate before a candidate-bound clean five-persona closeout", async () => {
    await assert.rejects(() => validateP805ReleaseGate(config(), {validateCampaign:async () => { throw new Error("clean retest closeout missing"); }}), /clean retest closeout missing/);
});

test("keeps the documented receipt location separate from an executable clean checkout", () => {
    assert.match(P805_RELEASE_DIRECTORY, /docs[\\/]evidence[\\/]p8-05-product-readiness[\\/]release$/);
    return assert.rejects(() => validateP805ReleaseGate({...config(), campaignDirectory:path.resolve("docs/evidence/p8-05-product-readiness")}, {validateCampaign:async () => ({})}), /outside the exact-candidate checkout/i);
});

test("consumes PC-20's nested retained gate once and records its actual digest", async () => {
    const writes = new Map();
    const closeout = {campaignId:"campaign", candidateId, candidatePackageSha256, closeoutSha256:"e".repeat(64), closedAt:"2026-09-19T19:00:00.000Z"};
    const result = await validateP805ReleaseGate(config(), {validateCampaign:async () => closeout, validatePc20Gate:async () => ({gate:{gate:{candidateId, candidatePackageSha256, startedAt:"2026-09-19T19:30:00.000Z", endedAt:"2026-09-19T19:45:00.000Z"}, sha256:"f".repeat(64), reused:false}}), exists:() => false, mkdir:async () => undefined, writeFile:async (target, contents) => writes.set(target, contents), readFile:async (target) => writes.get(target), now:() => "2026-09-19T20:00:00.000Z"});
    assert.equal(result.pc20GateSha256, "f".repeat(64));
    assert.equal(writes.size, 1);
});

test("refuses retained P8-05 receipts whose bytes no longer match the verifier digest", async () => {
    const closeout = {campaignId:"campaign", candidateId, candidatePackageSha256, closeoutSha256:"e".repeat(64), closedAt:"2026-09-19T19:00:00.000Z"};
    const gate = {schemaVersion:1, kind:"p8-05-release-gate", candidateId, candidatePackageSha256, campaignId:"campaign", campaignCloseoutSha256:closeout.closeoutSha256, pc20GateSha256:"f".repeat(64), completedAt:"2026-09-19T20:00:00.000Z", chronology:["clean-retest-closeout", "check-release-and-npm-pack-smoke"]};
    await assert.rejects(() => validateP805ReleaseGate({...config(), retainedP805GateReceiptSha256:sha256(JSON.stringify(gate))}, {validateCampaign:async () => closeout, exists:() => true, readJson:async () => ({value:gate, contents:"tampered"})}), /trusted digest/i);
});

test("completion uses the retained PC-20 lifecycle receipt rather than PC-19 completion", async () => {
    const closeout = {campaignId:"campaign", candidateId, candidatePackageSha256, closeoutSha256:"e".repeat(64), closedAt:"2026-09-19T19:00:00.000Z"};
    const gate = {schemaVersion:1, kind:"p8-05-release-gate", candidateId, candidatePackageSha256, campaignId:"campaign", campaignCloseoutSha256:closeout.closeoutSha256, pc20GateSha256:"f".repeat(64), pc20GateEndedAt:"2026-09-19T19:50:00.000Z", completedAt:"2026-09-19T20:00:00.000Z", chronology:["clean-retest-closeout", "check-release-and-npm-pack-smoke"]};
    const result = await validateP805ReleaseCompletion({...config(), retainedP805GateReceiptSha256:sha256(JSON.stringify(gate))}, {validateCampaign:async () => closeout, readJson:async () => ({value:gate, contents:JSON.stringify(gate)}), exists:() => false, writeFile:async () => undefined, readFile:async () => "completion", validateRetainedPc20Gate:async () => ({gate:{candidateId, candidatePackageSha256, endedAt:gate.pc20GateEndedAt, archiveSha256:candidatePackageSha256}, sha256:"f".repeat(64)}), validatePc20Lifecycle:async () => ({value:{candidateId, candidatePackageSha256, git:{pushedAt:"2026-09-19T20:00:10.000Z"}, publication:{publishedAt:"2026-09-19T20:00:20.000Z"}, drive:{uploadedAt:"2026-09-19T20:00:30.000Z", readBackAt:"2026-09-19T20:00:40.000Z"}, issuedAt:"2026-09-19T20:00:50.000Z"}, sha256:"a".repeat(64)}), now:() => "2026-09-19T20:01:00.000Z"});
    assert.equal(result.pc20LifecycleSha256, "a".repeat(64));
});
