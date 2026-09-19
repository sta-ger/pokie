import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {test} from "@jest/globals";
import {runP805Freeze, runP805InitialAudit, runP805PostFix, runP805Retest} from "../../scripts/p8-05-product-readiness-controller.mjs";

const initial = {candidateId:"1".repeat(40), candidatePackageSha256:"a".repeat(64)};
const retest = {candidateId:"2".repeat(40), candidatePackageSha256:"b".repeat(64)};
const attestation = "I recorded each initial persona audit before reading prior findings, source, fixes, or prior campaign evidence.";
const packed = {packedCli:"/tmp/pokie/dist/cli/pokie.js", packedPackage:"/tmp/pokie/pokie.tgz"};
const runner = async ({persona, phase, candidateId, candidatePackageSha256}) => ({persona, phase, candidateId, candidatePackageSha256, auditId:`${phase}-${persona}`});

test("controller exposes fail-closed audit, freeze, post-fix, and retest phase boundaries", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "pokie-p8-05-controller-"));
    try {
        await assert.rejects(() => runP805Freeze({directory, frozenFindings:{findings:[]}}), /PROVENANCE/i);
        const audits = await runP805InitialAudit({directory, initialCandidate:initial, provenance:{campaignId:"p8-05-controller", cleanRoomAttestation:attestation}, ...packed}, {runAudit:runner});
        assert.equal(audits.length, 5);
        await assert.rejects(() => runP805PostFix({directory, retestCandidate:retest, findingRegister:{}, regressions:{}}), /frozen-findings/i);
        await runP805Freeze({directory, frozenFindings:{frozenAt:"2026-09-19T20:00:00.000Z", findings:[], externalAnchor:{path:"/tmp/p8-05-freeze-anchor.json", sha256:"c".repeat(64), anchoredAt:"2026-09-19T20:00:01.000Z"}}});
        await runP805PostFix({directory, retestCandidate:retest, findingRegister:{findings:[]}, regressions:{regressions:[]}});
        const retests = await runP805Retest({directory, retestCandidate:retest, ...packed}, {runAudit:runner});
        assert.equal(retests.length, 5);
    } finally { await rm(directory, {recursive:true, force:true}); }
});
