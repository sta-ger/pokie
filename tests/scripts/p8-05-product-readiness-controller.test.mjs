import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {test} from "@jest/globals";
import {prepareP805Freeze, runP805Freeze, runP805InitialAudit, runP805PostFix, validateP805ControllerMachineProof} from "../../scripts/p8-05-product-readiness-controller.mjs";

const initial = {candidateId:"1".repeat(40), candidatePackageSha256:"a".repeat(64), candidateExecutableSha256:"c".repeat(64), candidateExecutableReceipt:{path:"/tmp/p8-05-initial-receipt.json", sha256:"e".repeat(64)}};
const retest = {candidateId:"2".repeat(40), candidatePackageSha256:"b".repeat(64), candidateExecutableSha256:"d".repeat(64), candidateExecutableReceipt:{path:"/tmp/p8-05-retest-receipt.json", sha256:"f".repeat(64)}};
const attestation = "I recorded each initial persona audit before reading prior findings, source, fixes, or prior campaign evidence.";
const packed = {packedCli:"/tmp/pokie/dist/cli/pokie.js", packedPackage:"/tmp/pokie/pokie.tgz"};

test("controller exposes fail-closed audit, freeze, post-fix, and retest phase boundaries", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "pokie-p8-05-controller-"));
    try {
        await assert.rejects(() => runP805Freeze({directory, frozenFindings:{findings:[]}}), /PROVENANCE/i);
        await assert.rejects(() => runP805InitialAudit({directory, initialCandidate:initial, provenance:{campaignId:"p8-05-controller", cleanRoomAttestation:attestation}}), /packed CLI and package archive/i);
        await writeFile(path.join(directory, "PROVENANCE.json"), JSON.stringify({campaignId:"p8-05-controller", initialCandidate:initial}));
        await writeFile(path.join(directory, "initial-audits.json"), JSON.stringify({audits:[]}));
        await assert.rejects(() => runP805PostFix({directory, retestCandidate:retest, findingRegister:{}, regressions:{}}), /frozen-findings/i);
        await assert.rejects(() => runP805Freeze({directory}), /frozen-findings-payload/i);
        const prepared = await prepareP805Freeze({directory, frozenFindings:{frozenAt:"2026-09-19T20:00:00.000Z", findings:[]}});
        const anchorPath = path.join(directory, "..", `${path.basename(directory)}-freeze-anchor.json`);
        const anchor = {kind:"p8-05-freeze-anchor", campaignId:"p8-05-controller", ...initial, initialAuditsSha256:prepared.initialAuditsSha256, frozenFindingsSha256:prepared.frozenFindingsSha256, anchoredAt:"2026-09-19T20:01:00.000Z"};
        await writeFile(anchorPath, JSON.stringify(anchor));
        const anchorSha256 = (await import("node:crypto")).createHash("sha256").update(await readFile(anchorPath)).digest("hex");
        await runP805Freeze({directory, freezeAnchor:{path:anchorPath, sha256:anchorSha256}});
        await runP805PostFix({directory, retestCandidate:retest, findingRegister:{findings:[]}, regressions:{regressions:[]}});
    } finally { await rm(directory, {recursive:true, force:true}); }
});

test("controller publishes distinct phase commands and refuses missing phase payloads", () => {
    const controller = path.join(process.cwd(), "scripts/p8-05-product-readiness-controller.mjs");
    for (const phase of ["initial-audit", "prepare-freeze", "freeze", "post-fix", "retest", "prepare-closeout", "closeout"]) {
        assert.throws(() => execFileSync(process.execPath, [controller, phase], {encoding:"utf8", stdio:"pipe"}), (error) => /usage/i.test(String(error.stderr)));
    }
});

test("controller does not expose an injected audit runner seam", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "pokie-p8-05-controller-real-runner-"));
    try {
        await assert.rejects(
            () => runP805InitialAudit({directory, initialCandidate:initial, provenance:{campaignId:"p8-05-controller-real", cleanRoomAttestation:attestation}, ...packed}, {runAudit:async () => ({auditId:"forged"})}),
            /packed package archive digest|ENOENT|no such file/i,
        );
    } finally { await rm(directory, {recursive:true, force:true}); }
});

test("controller machine-proof handoff is bound to its exact candidate ledger", () => {
    const ledgerContents = "{\"kind\":\"p8-05-process-isolated-packed-proof\"}\n", proof = {
        schemaVersion:4,
        kind:"p8-05-controller-machine-proof",
        status:"passed",
        execution:"controller-owned-exact-candidate-packed-cli-and-rendered-studio-matrix",
        phase:"initial",
        candidateId:initial.candidateId,
        candidatePackageSha256:initial.candidatePackageSha256,
        candidateExecutableSha256:initial.candidateExecutableSha256,
        proofLedger:{path:"initial-process-isolated-packed-proof.json", sha256:createHash("sha256").update(ledgerContents).digest("hex"), candidateId:initial.candidateId, candidatePackageSha256:initial.candidatePackageSha256, status:"passed", aggregation:"independently-verified-immutable-tuple-child-receipts-only"},
        tuples:["mathematician/blueprint/wide"],
        audits:{count:1, ids:["audit-1"]},
    };
    assert.equal(validateP805ControllerMachineProof(proof, "initial", initial, ledgerContents), proof);
    assert.throws(() => validateP805ControllerMachineProof({...proof, proofLedger:{...proof.proofLedger, candidateId:retest.candidateId}}, "initial", initial, ledgerContents), /exact candidate/i);
    assert.throws(() => validateP805ControllerMachineProof({...proof, tuples:[...proof.tuples, proof.tuples[0]], audits:{count:2, ids:["audit-1", "audit-2"]}}, "initial", initial, ledgerContents), /complete packed CLI\/Studio tuple ledger/i);
});
