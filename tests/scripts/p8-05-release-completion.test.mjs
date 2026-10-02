import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import path from "node:path";
import {test} from "@jest/globals";
import {P805_RELEASE_DIRECTORY, validateP805ReleaseCompletion, validateP805ReleaseGate} from "../../scripts/p8-05-release-completion.mjs";

const candidateId = "c".repeat(40), candidatePackageSha256 = "d".repeat(64);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const protectedLifecycle = () => ({candidateId, candidatePackageSha256, git:{pushedAt:"2026-09-19T20:00:10.000Z"}, publication:{publishedAt:"2026-09-19T20:00:20.000Z"}, drive:{uploadedAt:"2026-09-19T20:00:30.000Z", readBackAt:"2026-09-19T20:00:40.000Z"}, issuedAt:"2026-09-19T20:00:50.000Z"});
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
    const closeout = {campaignId:"campaign", candidateId, candidatePackageSha256, closeoutSha256:"e".repeat(64), manifestSha256:"9".repeat(64), closedAt:"2026-09-19T19:00:00.000Z"};
    const result = await validateP805ReleaseGate(config(), {validateCampaign:async () => closeout, validatePc20Gate:async () => ({gate:{gate:{candidateId, candidatePackageSha256, startedAt:"2026-09-19T19:30:00.000Z", endedAt:"2026-09-19T19:45:00.000Z"}, sha256:"f".repeat(64), reused:false}}), exists:() => false, mkdir:async () => undefined, writeFile:async (target, contents) => writes.set(target, contents), readFile:async (target) => writes.get(target), now:() => "2026-09-19T20:00:00.000Z"});
    assert.equal(result.pc20GateSha256, "f".repeat(64));
    assert.equal(writes.size, 1);
});

test("refuses retained P8-05 receipts whose bytes no longer match the verifier digest", async () => {
    const closeout = {campaignId:"campaign", candidateId, candidatePackageSha256, closeoutSha256:"e".repeat(64), manifestSha256:"9".repeat(64), closedAt:"2026-09-19T19:00:00.000Z"};
    const gate = {schemaVersion:1, kind:"p8-05-release-gate", candidateId, candidatePackageSha256, campaignId:"campaign", campaignCloseoutSha256:closeout.closeoutSha256, pc20GateSha256:"f".repeat(64), completedAt:"2026-09-19T20:00:00.000Z", chronology:["clean-retest-closeout", "check-release-and-npm-pack-smoke"]};
    await assert.rejects(() => validateP805ReleaseGate({...config(), retainedP805GateReceiptSha256:sha256(JSON.stringify(gate))}, {validateCampaign:async () => closeout, exists:() => true, readJson:async () => ({value:gate, contents:"tampered"})}), /trusted digest/i);
});

test("refuses a trusted retained P8-05 gate when its recorded PC-20 end differs", async () => {
    const closeout = {campaignId:"campaign", candidateId, candidatePackageSha256, closeoutSha256:"e".repeat(64), manifestSha256:"9".repeat(64), closedAt:"2026-09-19T19:00:00.000Z"};
    const gate = {schemaVersion:1, kind:"p8-05-release-gate", candidateId, candidatePackageSha256, campaignId:"campaign", campaignCloseoutSha256:closeout.closeoutSha256, pc20GateSha256:"f".repeat(64), pc20GateEndedAt:"2026-09-19T19:44:00.000Z", completedAt:"2026-09-19T20:00:00.000Z", chronology:["clean-retest-closeout", "check-release-and-npm-pack-smoke"]};
    await assert.rejects(() => validateP805ReleaseGate({...config(), retainedP805GateReceiptSha256:sha256(JSON.stringify(gate))}, {validateCampaign:async () => closeout, exists:() => true, readJson:async () => ({value:gate, contents:JSON.stringify(gate)}), validateRetainedPc20Gate:async () => ({gate:{candidateId, candidatePackageSha256, startedAt:"2026-09-19T19:30:00.000Z", endedAt:"2026-09-19T19:45:00.000Z"}, sha256:"f".repeat(64)})}), /artifacts or chronology drifted/i);
});

test("completion uses the retained PC-20 lifecycle receipt rather than PC-19 completion", async () => {
    const closeout = {campaignId:"campaign", candidateId, candidatePackageSha256, closeoutSha256:"e".repeat(64), manifestSha256:"9".repeat(64), closedAt:"2026-09-19T19:00:00.000Z"};
    const gate = {schemaVersion:1, kind:"p8-05-release-gate", candidateId, candidatePackageSha256, campaignId:"campaign", campaignCloseoutSha256:closeout.closeoutSha256, pc20GateSha256:"f".repeat(64), pc20GateEndedAt:"2026-09-19T19:50:00.000Z", completedAt:"2026-09-19T20:00:00.000Z", chronology:["clean-retest-closeout", "check-release-and-npm-pack-smoke"]};
    const result = await validateP805ReleaseCompletion({...config(), retainedP805GateReceiptSha256:sha256(JSON.stringify(gate))}, {validateCampaign:async () => closeout, readJson:async () => ({value:gate, contents:JSON.stringify(gate)}), exists:() => false, writeFile:async () => undefined, readFile:async () => "completion", validateRetainedPc20Gate:async () => ({gate:{candidateId, candidatePackageSha256, startedAt:"2026-09-19T19:30:00.000Z", endedAt:gate.pc20GateEndedAt, archiveSha256:candidatePackageSha256}, sha256:"f".repeat(64)}), validatePc20Lifecycle:async () => ({value:{candidateId, candidatePackageSha256, git:{pushedAt:"2026-09-19T20:00:10.000Z"}, publication:{publishedAt:"2026-09-19T20:00:20.000Z"}, drive:{uploadedAt:"2026-09-19T20:00:30.000Z", readBackAt:"2026-09-19T20:00:40.000Z"}, issuedAt:"2026-09-19T20:00:50.000Z"}, sha256:"a".repeat(64)}), now:() => "2026-09-19T20:01:00.000Z"});
    assert.equal(result.pc20LifecycleSha256, "a".repeat(64));
});

test("completion reuse authenticates the final evidence index as well as both retained receipts", async () => {
    const closeout = {campaignId:"campaign", candidateId, candidatePackageSha256, closeoutSha256:"e".repeat(64), manifestSha256:"9".repeat(64), closedAt:"2026-09-19T19:00:00.000Z"};
    const gate = {schemaVersion:1, kind:"p8-05-release-gate", candidateId, candidatePackageSha256, campaignId:"campaign", campaignCloseoutSha256:closeout.closeoutSha256, pc20GateSha256:"f".repeat(64), pc20GateEndedAt:"2026-09-19T19:50:00.000Z", completedAt:"2026-09-19T20:00:00.000Z", chronology:["clean-retest-closeout", "check-release-and-npm-pack-smoke"]};
    const gateContents = JSON.stringify(gate), completion = {schemaVersion:1, kind:"p8-05-final-lifecycle", candidateId, candidatePackageSha256, campaignCloseoutSha256:closeout.closeoutSha256, p805GateSha256:sha256(gateContents), pc20LifecycleSha256:"a".repeat(64), pc20Completion:protectedLifecycle(), completedAt:"2026-09-19T20:01:00.000Z", chronology:["clean-retest-closeout", "check-release-and-npm-pack-smoke", "integration-push", "publication", "drive-upload", "drive-read-back", "final-completion"]}, completionContents = JSON.stringify(completion);
    const index = {schemaVersion:1, kind:"p8-05-final-evidence-index", candidateId, candidatePackageSha256, campaignId:"campaign", campaignManifestSha256:closeout.manifestSha256, campaignCloseoutSha256:closeout.closeoutSha256, archiveSha256:candidatePackageSha256, p805GateSha256:sha256(gateContents), pc20GateSha256:"f".repeat(64), pc20LifecycleSha256:"a".repeat(64), completionSha256:sha256(completionContents), completedAt:"2026-09-19T20:01:00.000Z"}, indexContents = JSON.stringify(index);
    const lifecycle = {candidateId, candidatePackageSha256, git:{pushedAt:"2026-09-19T20:00:10.000Z"}, publication:{publishedAt:"2026-09-19T20:00:20.000Z"}, drive:{uploadedAt:"2026-09-19T20:00:30.000Z", readBackAt:"2026-09-19T20:00:40.000Z"}, issuedAt:"2026-09-19T20:00:50.000Z"};
    const dependencies = {validateCampaign:async () => closeout, exists:() => true, readJson:async (target) => target.includes("evidence-index") ? {value:index, contents:indexContents} : target.includes("completion") ? {value:completion, contents:completionContents} : {value:gate, contents:gateContents}, validateRetainedPc20Gate:async () => ({gate:{candidateId, candidatePackageSha256, startedAt:"2026-09-19T19:30:00.000Z", endedAt:gate.pc20GateEndedAt, archiveSha256:candidatePackageSha256}, sha256:"f".repeat(64)}), validatePc20Lifecycle:async () => ({value:lifecycle, sha256:"a".repeat(64)})};
    const retained = {...config(), retainedP805GateReceiptSha256:sha256(gateContents), retainedP805CompletionReceiptSha256:sha256(completionContents), retainedP805EvidenceIndexSha256:sha256(indexContents), pc20:{...config().pc20, lifecycleReceiptSha256:"a".repeat(64)}};
    assert.equal((await validateP805ReleaseCompletion(retained, dependencies)).reused, true);
    await assert.rejects(() => validateP805ReleaseCompletion({...retained, retainedP805EvidenceIndexSha256:"0".repeat(64)}, dependencies), /evidence index digest/i);
});

test("rejects incomplete prior completion before the authorized lifecycle can run", async () => {
    const closeout = {campaignId:"campaign", candidateId, candidatePackageSha256, closeoutSha256:"e".repeat(64), manifestSha256:"9".repeat(64), closedAt:"2026-09-19T19:00:00.000Z"};
    const gate = {schemaVersion:1, kind:"p8-05-release-gate", candidateId, candidatePackageSha256, campaignId:"campaign", campaignCloseoutSha256:closeout.closeoutSha256, pc20GateSha256:"f".repeat(64), pc20GateEndedAt:"2026-09-19T19:50:00.000Z", completedAt:"2026-09-19T20:00:00.000Z", chronology:["clean-retest-closeout", "check-release-and-npm-pack-smoke"]};
    const incomplete = JSON.stringify({kind:"p8-05-final-lifecycle", candidateId});
    let invoked = false;
    await assert.rejects(() => validateP805ReleaseCompletion({...config(), retainedP805GateReceiptSha256:sha256(JSON.stringify(gate)), retainedP805CompletionReceiptSha256:sha256(incomplete), pc20:{...config().pc20, lifecycleReceiptSha256:undefined}}, {
        validateCampaign:async () => closeout,
        readJson:async (target) => target.includes("completion") ? {value:JSON.parse(incomplete), contents:incomplete} : {value:gate, contents:JSON.stringify(gate)},
        exists:() => true,
        validateRetainedPc20Gate:async () => ({sha256:gate.pc20GateSha256, gate:{candidateId, candidatePackageSha256, startedAt:"2026-09-19T19:30:00.000Z", endedAt:gate.pc20GateEndedAt}}),
        runAuthorizedLifecycle:async () => { invoked = true; },
    }), /completion record drifted/);
    assert.equal(invoked, false);
});

test("completion rejects a retained gate started before closeout even with a trusted P8-05 receipt", async () => {
    const closeout = {campaignId:"campaign", candidateId, candidatePackageSha256, closeoutSha256:"e".repeat(64), manifestSha256:"9".repeat(64), closedAt:"2026-09-19T19:00:00.000Z"};
    const gate = {schemaVersion:1, kind:"p8-05-release-gate", candidateId, candidatePackageSha256, campaignId:"campaign", campaignCloseoutSha256:closeout.closeoutSha256, pc20GateSha256:"f".repeat(64), pc20GateEndedAt:"2026-09-19T19:50:00.000Z", completedAt:"2026-09-19T20:00:00.000Z", chronology:["clean-retest-closeout", "check-release-and-npm-pack-smoke"]};
    let invoked = false;
    await assert.rejects(() => validateP805ReleaseCompletion({...config(), retainedP805GateReceiptSha256:sha256(JSON.stringify(gate))}, {
        validateCampaign:async () => closeout,
        readJson:async () => ({value:gate, contents:JSON.stringify(gate)}),
        validateRetainedPc20Gate:async () => ({sha256:gate.pc20GateSha256, gate:{candidateId, candidatePackageSha256, startedAt:"2026-09-19T18:30:00.000Z", endedAt:gate.pc20GateEndedAt}}),
        runAuthorizedLifecycle:async () => { invoked = true; },
    }), /artifacts drifted/);
    assert.equal(invoked, false);
});


test("authorizes lifecycle only after validated closeout and gate, then reuses immutable completion", async () => {
    const closeout = {campaignId:"campaign", candidateId, candidatePackageSha256, closeoutSha256:"e".repeat(64), manifestSha256:"9".repeat(64), closedAt:"2026-09-19T19:00:00.000Z"};
    const gate = {schemaVersion:1, kind:"p8-05-release-gate", candidateId, candidatePackageSha256, campaignId:"campaign", campaignCloseoutSha256:closeout.closeoutSha256, pc20GateSha256:"f".repeat(64), pc20GateEndedAt:"2026-09-19T19:50:00.000Z", completedAt:"2026-09-19T20:00:00.000Z", chronology:["clean-retest-closeout", "check-release-and-npm-pack-smoke"]};
    const gateContents = JSON.stringify(gate), records = new Map(), lifecycleContents = JSON.stringify(protectedLifecycle());
    let authorizedCalls = 0;
    const settings = {...config(), retainedP805GateReceiptSha256:sha256(gateContents), pc20:{...config().pc20, lifecycleReceiptSha256:undefined}};
    const dependencies = {
        validateCampaign:async () => closeout,
        exists:(target) => records.has(target),
        readJson:async (target) => { const contents = records.get(target) ?? gateContents; return {contents, value:JSON.parse(contents)}; },
        writeFile:async (target, contents) => { assert.equal(records.has(target), false); records.set(target, contents); },
        readFile:async (target) => records.get(target),
        validateRetainedPc20Gate:async () => ({sha256:gate.pc20GateSha256, gate:{candidateId, candidatePackageSha256, archiveSha256:candidatePackageSha256, startedAt:"2026-09-19T19:30:00.000Z", endedAt:gate.pc20GateEndedAt}}),
        runAuthorizedLifecycle:async (pc20, candidate) => { authorizedCalls += 1; assert.equal(candidate, candidateId); records.set(pc20.lifecycleReceiptPath, lifecycleContents); },
        validatePc20Lifecycle:async (pc20, gateSha256) => { assert.equal(pc20.lifecycleReceiptSha256, sha256(lifecycleContents)); assert.equal(gateSha256, gate.pc20GateSha256); return {value:protectedLifecycle(), sha256:sha256(lifecycleContents)}; },
        now:() => "2026-09-19T20:01:00.000Z",
    };
    const created = await validateP805ReleaseCompletion(settings, dependencies);
    assert.equal(authorizedCalls, 1);
    assert.equal(created.evidenceIndex.campaignManifestSha256, closeout.manifestSha256);
    assert.equal(created.evidenceIndex.archiveSha256, candidatePackageSha256);
    const reused = await validateP805ReleaseCompletion({...settings, retainedP805CompletionReceiptSha256:created.sha256, retainedP805EvidenceIndexSha256:sha256([...records.entries()].find(([target]) => target.includes("evidence-index"))[1]), pc20:{...settings.pc20, lifecycleReceiptSha256:sha256(lifecycleContents)}}, dependencies);
    assert.equal(reused.reused, true);
    assert.equal(authorizedCalls, 1);
});
