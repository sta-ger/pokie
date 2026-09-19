import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {test} from "@jest/globals";
import {prepareP805Freeze, runP805Freeze, runP805InitialAudit, runP805PostFix, runP805Retest} from "../../scripts/p8-05-product-readiness-controller.mjs";

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
        await assert.rejects(() => runP805Freeze({directory}), /frozen-findings-payload/i);
        const prepared = await prepareP805Freeze({directory, frozenFindings:{frozenAt:"2026-09-19T20:00:00.000Z", findings:[]}});
        const anchorPath = path.join(directory, "..", `${path.basename(directory)}-freeze-anchor.json`);
        const anchor = {kind:"p8-05-freeze-anchor", campaignId:"p8-05-controller", ...initial, initialAuditsSha256:prepared.initialAuditsSha256, frozenFindingsSha256:prepared.frozenFindingsSha256, anchoredAt:"2026-09-19T20:01:00.000Z"};
        await writeFile(anchorPath, JSON.stringify(anchor));
        const anchorSha256 = (await import("node:crypto")).createHash("sha256").update(await readFile(anchorPath)).digest("hex");
        await runP805Freeze({directory, freezeAnchor:{path:anchorPath, sha256:anchorSha256}});
        await runP805PostFix({directory, retestCandidate:retest, findingRegister:{findings:[]}, regressions:{regressions:[]}});
        const retests = await runP805Retest({directory, retestCandidate:retest, ...packed}, {runAudit:runner});
        assert.equal(retests.length, 5);
    } finally { await rm(directory, {recursive:true, force:true}); }
});

test("controller publishes distinct phase commands and refuses missing phase payloads", () => {
    const controller = path.join(process.cwd(), "scripts/p8-05-product-readiness-controller.mjs");
    for (const phase of ["initial-audit", "prepare-freeze", "freeze", "post-fix", "retest", "prepare-closeout", "closeout"]) {
        assert.throws(() => execFileSync(process.execPath, [controller, phase], {encoding:"utf8", stdio:"pipe"}), (error) => /usage/i.test(String(error.stderr)));
    }
});
