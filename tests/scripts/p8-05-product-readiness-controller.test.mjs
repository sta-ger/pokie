import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {test} from "@jest/globals";
import {P805_PERSONAS, P805_REQUIRED_OBSERVATIONS} from "../../scripts/p8-05-product-readiness-campaign.mjs";
import {prepareP805Freeze, runP805Freeze, runP805InitialAudit, runP805PostFix, validateP805ControllerMachineProof} from "../../scripts/p8-05-product-readiness-controller.mjs";

const initial = {candidateId:"1".repeat(40), candidatePackageSha256:"a".repeat(64), candidateExecutableSha256:"c".repeat(64), candidateExecutableReceipt:{path:"/tmp/p8-05-initial-receipt.json", sha256:"e".repeat(64)}};
const retest = {candidateId:"2".repeat(40), candidatePackageSha256:"b".repeat(64), candidateExecutableSha256:"d".repeat(64), candidateExecutableReceipt:{path:"/tmp/p8-05-retest-receipt.json", sha256:"f".repeat(64)}};
const attestation = "I recorded each initial persona audit before reading prior findings, source, fixes, or prior campaign evidence.";
const packed = {packedCli:"/tmp/pokie/dist/cli/pokie.js", packedPackage:"/tmp/pokie/pokie.tgz"};
const tuples = P805_PERSONAS.flatMap((persona) => P805_REQUIRED_OBSERVATIONS[persona].flatMap((observation) => ["wide", "compact", "narrow"].map((viewport) => ({persona, observation, viewport}))));
const digestAt = (prefix, index) => `${prefix}${index.toString(16).padStart(63, "0")}`;
const machineProofLedger = () => ({
    schemaVersion:1,
    kind:"p8-05-process-isolated-packed-proof",
    phase:"initial",
    status:"passed",
    candidateId:initial.candidateId,
    candidatePackageSha256:initial.candidatePackageSha256,
    parent:{pid:1},
    runtime:{kind:"p8-05-immutable-packed-runtime", root:"/tmp/p8-05-runtime", receiptPath:"runtime.json", receiptSha256:"f".repeat(64), candidateId:initial.candidateId, candidatePackageSha256:initial.candidatePackageSha256, candidateExecutableSha256:initial.candidateExecutableSha256, archiveSha256:initial.candidatePackageSha256, installationCount:1, permissions:"read-only-before-any-tuple-child"},
    children:tuples.map((tuple, index) => ({tuple, worker:{pid:index + 2}, auditPath:`audit-${index}.json`, auditSha256:digestAt("a", index), tupleReceiptPath:`receipt-${index}.json`, tupleReceiptSha256:digestAt("b", index), cleanupPath:`cleanup-${index}.json`, cleanupSha256:digestAt("c", index), checkpointReceiptSha256s:[digestAt("d", index)], cleanupEvidenceId:`cleanup-${index}`, parentCleanup:{processTreeDrained:true, resourcesDrained:true}, exitCode:0, signal:null})),
    acceptedReceipts:tuples.map((tuple, index) => ({tuple, receiptPath:`receipt-${index}.json`, receiptSha256:digestAt("b", index), cleanupPath:`cleanup-${index}.json`, cleanupSha256:digestAt("c", index), receipt:{schemaVersion:1, kind:"p8-05-packed-tuple-receipt", status:"passed", candidateId:initial.candidateId, candidatePackageSha256:initial.candidatePackageSha256, tuple, worker:{pid:index + 2}, auditId:`audit-${index}`, cleanupEvidenceId:`cleanup-${index}`, cleanupSha256:digestAt("c", index), checkpointReceipt:{candidateId:initial.candidateId, candidatePackageSha256:initial.candidatePackageSha256, persona:tuple.persona, observation:tuple.observation, viewport:tuple.viewport, actionSha256:digestAt("e", index)}}, cleanup:{schemaVersion:1, kind:"p8-05-packed-tuple-cleanup", candidateId:initial.candidateId, candidatePackageSha256:initial.candidatePackageSha256, tuple, worker:{pid:index + 2}, cleanup:{exit:"success", processTreeDrained:true, resourcesDrained:true, contextRemoved:true}, cleanupEvidenceId:`cleanup-${index}`}})),
    finalResult:{status:"passed", children:tuples.length, checkpointReceipts:tuples.length, aggregation:"independently-verified-immutable-tuple-child-receipts-only"},
});
const machineProofTupleEvidence = (ledger) => ledger.children.map((child, index) => ({tuple:child.tuple, auditId:ledger.acceptedReceipts[index].receipt.auditId, auditPath:child.auditPath, auditSha256:child.auditSha256, tupleReceiptPath:child.tupleReceiptPath, tupleReceiptSha256:child.tupleReceiptSha256, cleanupPath:child.cleanupPath, cleanupSha256:child.cleanupSha256, checkpointReceiptSha256:child.checkpointReceiptSha256s[0], actionSha256:ledger.acceptedReceipts[index].receipt.checkpointReceipt.actionSha256, cleanupEvidenceId:child.cleanupEvidenceId}));
const machineProofRenderedTupleEvidence = (ledger) => ledger.children.map((child, index) => {
    const browserRequestId = `request-${index}`, resultSha256 = digestAt("f", index);
    return {tuple:child.tuple, auditSha256:child.auditSha256, checkpointReceiptSha256:child.checkpointReceiptSha256s[0], actionSha256:ledger.acceptedReceipts[index].receipt.checkpointReceipt.actionSha256, activation:{kind:"pointer", controlId:"project-tab:overview", capturedControlId:"project-tab:overview", preDispatchFocus:{controlId:"project-tab:overview", native:true}, hitTest:{capturedControlId:"project-tab:overview", matchesCapturedControl:true}, dispatch:{kind:"native-pointer", pressed:true, released:true}}, request:{browserRequestId, method:"GET", path:"/api/project/context", responseSha256:digestAt("e", index)}, terminal:{status:"completed", resultSha256}, rendered:{state:"rendered", observedAfterRequestId:browserRequestId, resultSha256, postTransitionRenderedState:{capturedControlId:"project-tab:overview", controlState:"replaced", requestId:browserRequestId, resultSha256, renderedTerminal:true}}, artifact:null, timing:{elapsedMs:index + 1}, accessibility:{visibleFocus:true, namedRegions:["main"], unexplainedDisabledControls:0}, provenance:{archiveGitHead:initial.candidateId, candidateTreeObjectId:initial.candidateId, candidateExecutableReceiptSha256:initial.candidateExecutableReceipt.sha256}, evidence:{actionEvidenceId:`action-${index}`, screenshotEvidenceId:`screenshot-${index}`, cleanupEvidenceId:`cleanup-${index}`}};
});

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
    const ledger = machineProofLedger(), ledgerContents = `${JSON.stringify(ledger)}\n`, proof = {
        schemaVersion:4,
        kind:"p8-05-controller-machine-proof",
        status:"passed",
        execution:"controller-owned-exact-candidate-packed-cli-and-rendered-studio-matrix",
        phase:"initial",
        candidateId:initial.candidateId,
        candidatePackageSha256:initial.candidatePackageSha256,
        candidateExecutableSha256:initial.candidateExecutableSha256,
        proofLedger:{path:"initial-process-isolated-packed-proof.json", sha256:createHash("sha256").update(ledgerContents).digest("hex"), candidateId:initial.candidateId, candidatePackageSha256:initial.candidatePackageSha256, status:"passed", aggregation:"independently-verified-immutable-tuple-child-receipts-only"},
        tuples:tuples.map((tuple) => `${tuple.persona}/${tuple.observation}/${tuple.viewport}`),
        audits:{count:P805_PERSONAS.length, personas:P805_PERSONAS, ids:P805_PERSONAS.map((persona) => `aggregate-${persona}`), tupleReceiptAuditIds:tuples.map((_tuple, index) => `audit-${index}`), tupleEvidence:machineProofTupleEvidence(ledger), renderedTupleEvidence:machineProofRenderedTupleEvidence(ledger)},
    };
    assert.equal(validateP805ControllerMachineProof(proof, "initial", initial, ledgerContents), proof);
    assert.throws(() => validateP805ControllerMachineProof({...proof, proofLedger:{...proof.proofLedger, candidateId:retest.candidateId}}, "initial", initial, ledgerContents), /exact candidate/i);
    assert.throws(() => validateP805ControllerMachineProof({...proof, tuples:[...proof.tuples, proof.tuples[0]], audits:{count:2, personas:P805_PERSONAS, ids:["audit-1", "audit-2"], tupleReceiptAuditIds:proof.audits.tupleReceiptAuditIds}}, "initial", initial, ledgerContents), /five persona aggregates/i);
    assert.throws(() => validateP805ControllerMachineProof({...proof, audits:{...proof.audits, tupleReceiptAuditIds:["substituted-audit", ...proof.audits.tupleReceiptAuditIds.slice(1)]}}, "initial", initial, ledgerContents), /five persona aggregates/i);
    assert.throws(() => validateP805ControllerMachineProof({...proof, audits:{...proof.audits, tupleEvidence:[{...proof.audits.tupleEvidence[0], auditSha256:"f".repeat(64)}, ...proof.audits.tupleEvidence.slice(1)]}}, "initial", initial, ledgerContents), /five persona aggregates/i);
    assert.throws(() => validateP805ControllerMachineProof({...proof, audits:{...proof.audits, renderedTupleEvidence:[{...proof.audits.renderedTupleEvidence[0], activation:{...proof.audits.renderedTupleEvidence[0].activation, hitTest:{capturedControlId:"project-tab:overview", matchesCapturedControl:false}}}, ...proof.audits.renderedTupleEvidence.slice(1)]}}, "initial", initial, ledgerContents), /five persona aggregates/i);
    assert.throws(() => validateP805ControllerMachineProof({...proof, audits:{...proof.audits, renderedTupleEvidence:[{...proof.audits.renderedTupleEvidence[0], actionSha256:"f".repeat(64)}, ...proof.audits.renderedTupleEvidence.slice(1)]}}, "initial", initial, ledgerContents), /five persona aggregates/i);
    const incompleteLedger = structuredClone(ledger);
    incompleteLedger.children.pop(); incompleteLedger.acceptedReceipts.pop(); incompleteLedger.finalResult.children -= 1; incompleteLedger.finalResult.checkpointReceipts -= 1;
    const incompleteContents = `${JSON.stringify(incompleteLedger)}\n`, incompleteProof = {...proof, proofLedger:{...proof.proofLedger, sha256:createHash("sha256").update(incompleteContents).digest("hex")}, tuples:proof.tuples.slice(0, -1), audits:{...proof.audits, tupleReceiptAuditIds:proof.audits.tupleReceiptAuditIds.slice(0, -1)}};
    assert.throws(() => validateP805ControllerMachineProof(incompleteProof, "initial", initial, incompleteContents), /tuple proof ledger/i);
});
