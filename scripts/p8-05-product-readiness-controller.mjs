#!/usr/bin/env node
/** Phase controller for the externally anchored P8-05 audit/fix/retest campaign. */
import {createHash} from "node:crypto";
import {existsSync} from "node:fs";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";
import {P805_PERSONAS, P805_SCHEMA_VERSION, validateP805ProductReadinessCampaign, validateP805TupleProofLedger} from "./p8-05-product-readiness-campaign.mjs";
import {runP805ProcessIsolatedPackedProof, validateP805RenderedPersonaAudit} from "./p8-05-valera-browser-audit.mjs";

const sha = (value) => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
const commit = (value) => typeof value === "string" && /^[a-f0-9]{40}$/i.test(value);
const iso = (value) => typeof value === "string" && !Number.isNaN(Date.parse(value)) && /^\d{4}-\d{2}-\d{2}T/.test(value);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const now = () => new Date().toISOString();
const fail = (message) => { throw new Error(`P8-05 campaign controller is invalid: ${message}`); };
const recordPath = (directory, name) => path.join(directory, name);
async function record(directory, name) { try { return {contents:await readFile(recordPath(directory, name), "utf8"), value:JSON.parse(await readFile(recordPath(directory, name), "utf8"))}; } catch { fail(`required ${name} does not exist as JSON`); } }
async function writeRecord(directory, name, value) { await writeFile(recordPath(directory, name), `${JSON.stringify(value, null, 2)}\n`, {flag:"wx"}); }
// The executable manifest is supplied by the pack-producing controller, not
// derived from the archive being audited.  This closes the "same package.json,
// different executable" substitution hole before a persona command runs.
function candidate(value, name) { if (!value || !commit(value.candidateId) || !sha(value.candidatePackageSha256) || !sha(value.candidateExecutableSha256) || !path.isAbsolute(value?.candidateExecutableReceipt?.path ?? "") || !sha(value?.candidateExecutableReceipt?.sha256)) fail(`${name} must name an immutable candidate, package digest, executable manifest digest, and external executable receipt`); }
function base(config) { if (!config || !path.isAbsolute(config.directory ?? "")) fail("configuration requires an absolute campaign directory"); }
function packed(config, name) { if (!path.isAbsolute(config?.packedCli ?? "") || !path.isAbsolute(config?.packedPackage ?? "")) fail(`${name} requires a packed CLI and package archive`); }
const machineProofName = (phase) => `${phase}-controller-machine-proof.json`;
const proofLedgerName = (phase) => `${phase}-process-isolated-packed-proof.json`;
const tupleEvidenceFor = (ledger) => ledger.children.map((child, index) => ({tuple:child.tuple, auditId:ledger.acceptedReceipts[index].receipt.auditId, auditPath:child.auditPath, auditSha256:child.auditSha256, tupleReceiptPath:child.tupleReceiptPath, tupleReceiptSha256:child.tupleReceiptSha256, cleanupPath:child.cleanupPath, cleanupSha256:child.cleanupSha256, checkpointReceiptSha256:child.checkpointReceiptSha256s[0], actionSha256:ledger.acceptedReceipts[index].receipt.checkpointReceipt.actionSha256, cleanupEvidenceId:child.cleanupEvidenceId}));
const renderedTupleEvidenceFor = (ledger, audits) => ledger.children.map((child, index) => {
    const audit = audits.find((value) => value.worker?.pid === child.worker?.pid), action = audit?.rendered?.actions?.[0], pointer = action?.transaction?.pointerActivations?.[0], keyboard = action?.transaction?.keyboardActivations?.[0], isPointer = action?.interaction?.activation === "pointer", activation = isPointer ? pointer : keyboard;
    if (!audit || !action || !activation) fail(`controller cannot project rendered evidence for ${child.tuple.persona}/${child.tuple.observation}/${child.tuple.viewport}`);
    return {
        tuple:child.tuple,
        auditSha256:child.auditSha256,
        checkpointReceiptSha256:child.checkpointReceiptSha256s[0],
        actionSha256:ledger.acceptedReceipts[index].receipt.checkpointReceipt.actionSha256,
        activation:{kind:isPointer ? "pointer" : "keyboard", controlId:action.stableControlId, capturedControlId:isPointer ? activation.capturedControlId : undefined, preDispatchFocus:activation.preDispatchFocus, hitTest:isPointer ? activation.hitTest : undefined, dispatch:isPointer ? activation.dispatch : {kind:"native-keyboard", nativeFocus:activation.nativeFocus}},
        request:action.transaction.request,
        terminal:{status:action.terminal.status, resultSha256:action.terminal.resultSha256},
        rendered:{state:action.visibleTerminal.state, observedAfterRequestId:action.visibleTerminal.observedAfterRequestId, resultSha256:action.visibleTerminal.resultSha256, postTransitionRenderedState:isPointer ? action.transaction.postTransitionRenderedState : undefined},
        artifact:action.visibleTerminal.lifecycle.artifact ?? null,
        timing:{elapsedMs:action.elapsedMs},
        accessibility:{visibleFocus:action.accessibility.visibleFocus, namedRegions:action.accessibility.namedRegions, unexplainedDisabledControls:action.accessibility.unexplainedDisabledControls},
        provenance:{archiveGitHead:audit.packageIdentity.archiveGitHead, candidateTreeObjectId:audit.packageIdentity.candidateTreeObjectId, candidateExecutableReceiptSha256:audit.packageIdentity.candidateExecutableReceiptSha256},
        evidence:{actionEvidenceId:action.evidenceId, screenshotEvidenceId:action.screenshotEvidenceId, cleanupEvidenceId:audit.cleanup.evidenceId},
    };
});
function validRenderedTupleEvidence(value, expected) {
    if (!Array.isArray(value) || value.length !== expected.length) return false;
    return value.every((entry, index) => {
        const bound = expected[index], pointer = entry?.activation?.kind === "pointer", activation = entry?.activation, request = entry?.request, terminal = entry?.terminal, rendered = entry?.rendered, accessibility = entry?.accessibility, provenance = entry?.provenance, evidence = entry?.evidence;
        return JSON.stringify(entry?.tuple) === JSON.stringify(bound.tuple) && entry?.auditSha256 === bound.auditSha256 && entry?.checkpointReceiptSha256 === bound.checkpointReceiptSha256 && entry?.actionSha256 === bound.actionSha256 && ["pointer", "keyboard"].includes(activation?.kind) && typeof activation?.controlId === "string" && activation.controlId && activation?.preDispatchFocus?.controlId === activation.controlId && activation.preDispatchFocus.native === true && (pointer ? activation.capturedControlId === activation.controlId && activation.hitTest?.capturedControlId === activation.controlId && activation.hitTest?.matchesCapturedControl === true && activation.dispatch?.kind === "native-pointer" && activation.dispatch?.pressed === true && activation.dispatch?.released === true && rendered?.postTransitionRenderedState?.capturedControlId === activation.controlId && ["retained", "replaced", "removed"].includes(rendered.postTransitionRenderedState.controlState) && rendered.postTransitionRenderedState.requestId === request?.browserRequestId && rendered.postTransitionRenderedState.resultSha256 === terminal?.resultSha256 && rendered.postTransitionRenderedState.renderedTerminal === true : activation.dispatch?.kind === "native-keyboard" && activation.dispatch?.nativeFocus === true) && typeof request?.browserRequestId === "string" && request.browserRequestId && typeof request?.method === "string" && typeof request?.path === "string" && sha(request?.responseSha256) && typeof terminal?.status === "string" && sha(terminal?.resultSha256) && rendered?.state === "rendered" && rendered?.observedAfterRequestId === request.browserRequestId && rendered?.resultSha256 === terminal.resultSha256 && (entry.artifact === null || typeof entry.artifact?.name === "string") && Number.isSafeInteger(entry?.timing?.elapsedMs) && entry.timing.elapsedMs > 0 && accessibility?.visibleFocus === true && Array.isArray(accessibility.namedRegions) && accessibility.namedRegions.length > 0 && accessibility.unexplainedDisabledControls === 0 && commit(provenance?.archiveGitHead) && commit(provenance?.candidateTreeObjectId) && sha(provenance?.candidateExecutableReceiptSha256) && typeof evidence?.actionEvidenceId === "string" && evidence.actionEvidenceId && typeof evidence?.screenshotEvidenceId === "string" && evidence.screenshotEvidenceId && evidence.cleanupEvidenceId === bound.cleanupEvidenceId;
    });
}
const localArtifactPath = (directory, name, label) => {
    if (typeof name !== "string" || !name || path.basename(name) !== name) fail(`${label} must name a local immutable artifact`);
    return path.join(directory, name);
};
async function immutableArtifact(directory, name, expectedSha256, label) {
    if (!sha(expectedSha256)) fail(`${label} is missing its immutable digest`);
    let contents, value;
    try { contents = await readFile(localArtifactPath(directory, name, label), "utf8"); value = JSON.parse(contents); }
    catch { fail(`${label} does not exist as immutable JSON`); }
    if (digest(contents) !== expectedSha256) fail(`${label} digest differs from its parent packed ledger`);
    return {contents, value};
}
async function externalAnchor(anchor, expectedKind, expected) {
    if (!anchor || !path.isAbsolute(anchor.path ?? "") || !sha(anchor.sha256)) fail(`${expectedKind} requires an external immutable anchor`);
    let contents, value;
    try { contents = await readFile(anchor.path, "utf8"); value = JSON.parse(contents); } catch { fail(`${expectedKind} external anchor is unreadable JSON`); }
    if (digest(contents) !== anchor.sha256 || value?.kind !== expectedKind || !iso(value.anchoredAt)) fail(`${expectedKind} external anchor digest, kind, or timestamp differs`);
    for (const [name, valueExpected] of Object.entries(expected)) if (value[name] !== valueExpected) fail(`${expectedKind} external anchor does not bind ${name}`);
    return value;
}

/**
 * The controller's receipt is deliberately derived only after re-reading the
 * immutable parent ledger that its public packed runner wrote.  It is the
 * handoff boundary between the controller-owned full candidate matrix and an
 * independent reviewer: a caller cannot substitute an in-memory audit claim
 * or publish a clean controller result before every tuple is accepted.
 */
export function validateP805ControllerMachineProof(value, phase, candidateValue, ledgerContents) {
    let ledger;
    try { ledger = JSON.parse(ledgerContents); }
    catch { fail("controller machine proof cannot read its packed CLI/Studio tuple ledger"); }
    validateP805TupleProofLedger(ledger, candidateValue);
    const tuples = ledger.children.map(({tuple}) => `${tuple.persona}/${tuple.observation}/${tuple.viewport}`), tupleAuditIds = ledger.acceptedReceipts.map(({receipt}) => receipt.auditId), tupleEvidence = tupleEvidenceFor(ledger);
    if (!value || value.schemaVersion !== P805_SCHEMA_VERSION || value.kind !== "p8-05-controller-machine-proof" || value.status !== "passed" || value.execution !== "controller-owned-exact-candidate-packed-cli-and-rendered-studio-matrix" || value.phase !== phase || ledger.phase !== phase || value.candidateId !== candidateValue.candidateId || value.candidatePackageSha256 !== candidateValue.candidatePackageSha256 || value.candidateExecutableSha256 !== candidateValue.candidateExecutableSha256 || value.proofLedger?.path !== proofLedgerName(phase) || value.proofLedger?.sha256 !== digest(ledgerContents) || value.proofLedger?.candidateId !== candidateValue.candidateId || value.proofLedger?.candidatePackageSha256 !== candidateValue.candidatePackageSha256 || value.proofLedger?.status !== "passed" || value.proofLedger?.aggregation !== "independently-verified-immutable-tuple-child-receipts-only" || JSON.stringify(value.tuples) !== JSON.stringify(tuples) || value.audits?.count !== P805_PERSONAS.length || JSON.stringify(value.audits?.personas) !== JSON.stringify(P805_PERSONAS) || !Array.isArray(value.audits?.ids) || value.audits.ids.length !== P805_PERSONAS.length || new Set(value.audits.ids).size !== P805_PERSONAS.length || JSON.stringify(value.audits?.tupleReceiptAuditIds) !== JSON.stringify(tupleAuditIds) || new Set(tupleAuditIds).size !== tupleAuditIds.length || JSON.stringify(value.audits?.tupleEvidence) !== JSON.stringify(tupleEvidence) || !validRenderedTupleEvidence(value.audits?.renderedTupleEvidence, tupleEvidence)) fail("controller machine proof does not bind five persona aggregates to the exact candidate's complete packed CLI/Studio tuple ledger");
    return value;
}

/**
 * The parent runner checks a child as it exits, but its return value is still
 * in-memory data.  The controller's public certification boundary re-reads
 * every sealed child artifact before it can aggregate five personas.  This
 * prevents a React replacement-state/pointer receipt from being replaced by
 * a same-shaped object between scheduler acceptance and controller output.
 */
async function reReadP805PackedTupleAudits(directory, ledger, phase, candidateValue) {
    validateP805TupleProofLedger(ledger, candidateValue);
    if (ledger.phase !== phase) fail("packed tuple ledger phase differs from the controller phase");
    const audits = [];
    for (const [index, child] of ledger.children.entries()) {
        const accepted = ledger.acceptedReceipts[index], tuple = child.tuple;
        const auditArtifact = await immutableArtifact(directory, child.auditPath, child.auditSha256, `packed ${tuple.persona}/${tuple.observation}/${tuple.viewport} audit`);
        const tupleArtifact = await immutableArtifact(directory, child.tupleReceiptPath, child.tupleReceiptSha256, `packed ${tuple.persona}/${tuple.observation}/${tuple.viewport} tuple receipt`);
        const cleanupArtifact = await immutableArtifact(directory, child.cleanupPath, child.cleanupSha256, `packed ${tuple.persona}/${tuple.observation}/${tuple.viewport} cleanup receipt`);
        const audit = auditArtifact.value, tupleReceipt = tupleArtifact.value, cleanup = cleanupArtifact.value, action = audit?.rendered?.actions?.[0], checkpoint = audit?.checkpointReceipts?.[0];
        validateP805RenderedPersonaAudit(audit);
        if (audit?.phase !== phase || audit?.candidateId !== candidateValue.candidateId || audit?.candidatePackageSha256 !== candidateValue.candidatePackageSha256 || audit?.packageIdentity?.declaredCandidateExecutableSha256 !== candidateValue.candidateExecutableSha256 || JSON.stringify(audit?.tuple) !== JSON.stringify(tuple) || audit?.auditId !== accepted?.receipt?.auditId || audit?.worker?.pid !== child.worker?.pid || audit?.checkpointReceipts?.length !== 1 || audit?.rendered?.actions?.length !== 1 || JSON.stringify(tupleReceipt) !== JSON.stringify(accepted?.receipt) || JSON.stringify(cleanup) !== JSON.stringify(accepted?.cleanup) || JSON.stringify(tupleReceipt?.action) !== JSON.stringify(action) || tupleReceipt?.checkpointReceipt?.actionSha256 !== checkpoint?.actionSha256 || tupleReceipt?.checkpointReceipt?.sha256 !== checkpoint?.sha256 || tupleReceipt?.cleanupEvidenceId !== cleanup?.cleanupEvidenceId || audit?.cleanup?.evidenceId !== cleanup?.cleanupEvidenceId) fail(`packed ${tuple.persona}/${tuple.observation}/${tuple.viewport} controller re-read found substituted rendered action, terminal, or cleanup evidence`);
        const checkpointArtifact = await immutableArtifact(directory, checkpoint?.path, checkpoint?.sha256, `packed ${tuple.persona}/${tuple.observation}/${tuple.viewport} checkpoint receipt`);
        if (checkpointArtifact.value?.kind !== "p8-05-packed-workflow-checkpoint" || checkpointArtifact.value?.auditId !== audit.auditId || checkpointArtifact.value?.candidateId !== candidateValue.candidateId || checkpointArtifact.value?.candidatePackageSha256 !== candidateValue.candidatePackageSha256 || JSON.stringify(checkpointArtifact.value?.action) !== JSON.stringify(action)) fail(`packed ${tuple.persona}/${tuple.observation}/${tuple.viewport} controller checkpoint does not bind its rendered action`);
        audits.push(audit);
    }
    return audits;
}

async function writeControllerMachineProof(config, phase, candidateValue, proof, audits) {
    const ledger = await record(config.directory, proofLedgerName(phase));
    validateP805TupleProofLedger(ledger.value, candidateValue);
    if (digest(`${JSON.stringify(proof.ledger, null, 2)}\n`) !== digest(ledger.contents)) fail("controller re-read ledger differs from the packed parent result");
    const tuples = ledger.value.children.map(({tuple}) => `${tuple.persona}/${tuple.observation}/${tuple.viewport}`), tupleAuditIds = ledger.value.acceptedReceipts.map(({receipt}) => receipt.auditId), tupleEvidence = tupleEvidenceFor(ledger.value), renderedTupleEvidence = renderedTupleEvidenceFor(ledger.value, audits), value = {
        schemaVersion:P805_SCHEMA_VERSION,
        kind:"p8-05-controller-machine-proof",
        status:"passed",
        execution:"controller-owned-exact-candidate-packed-cli-and-rendered-studio-matrix",
        phase,
        candidateId:candidateValue.candidateId,
        candidatePackageSha256:candidateValue.candidatePackageSha256,
        candidateExecutableSha256:candidateValue.candidateExecutableSha256,
        proofLedger:{path:proofLedgerName(phase), sha256:digest(ledger.contents), candidateId:ledger.value.candidateId, candidatePackageSha256:ledger.value.candidatePackageSha256, status:ledger.value.status, aggregation:ledger.value.finalResult?.aggregation},
        tuples,
        // The handoff is derived solely from the re-read immutable ledger.
        // In-memory audit objects are useful to write the campaign record,
        // but may never define what the controller certifies to review.
        audits:{count:audits.length, personas:audits.map((audit) => audit.persona), ids:audits.map((audit) => audit.auditId), tupleReceiptAuditIds:tupleAuditIds, tupleEvidence, renderedTupleEvidence},
    };
    if (existsSync(recordPath(config.directory, machineProofName(phase)))) fail("controller machine proof is append-only");
    validateP805ControllerMachineProof(value, phase, candidateValue, ledger.contents);
    await writeRecord(config.directory, machineProofName(phase), value);
    return value;
}

/**
 * The campaign exposes exactly one audit record per persona.  That record is
 * a read-only aggregation of independently accepted tuple receipts; it never
 * replaces the child ledger which remains the source of authentication.
 */
export function aggregateP805PersonaAudits(tupleAudits, ledger, phase, candidateValue) {
    validateP805TupleProofLedger(ledger, candidateValue);
    if (!Array.isArray(tupleAudits) || tupleAudits.length !== ledger.children.length) fail("persona aggregation requires every accepted immutable tuple audit");
    return P805_PERSONAS.map((persona) => {
        const children = ledger.children.filter((child) => child.tuple.persona === persona), audits = tupleAudits.filter((audit) => audit.persona === persona);
        if (children.length === 0 || audits.length !== children.length || audits.some((audit) => !audit.tuple || audit.phase !== phase)) fail(`persona aggregation is missing immutable ${persona} tuple audits`);
        const first = audits[0], timings = Object.fromEntries(Object.keys(first.timings).map((name) => [name, Math.max(...audits.map((audit) => audit.timings[name]))])), tupleReceipts = children.map((child) => {
            const audit = audits.find((value) => value.worker?.pid === child.worker?.pid);
            return {tuple:child.tuple, auditId:audit?.auditId, auditPath:child.auditPath, auditSha256:child.auditSha256, tupleReceiptPath:child.tupleReceiptPath, tupleReceiptSha256:child.tupleReceiptSha256, cleanupPath:child.cleanupPath, cleanupSha256:child.cleanupSha256, checkpointReceiptSha256s:child.checkpointReceiptSha256s, cleanupEvidenceId:child.cleanupEvidenceId};
        });
        return {
            ...first,
            auditId:`${phase}-${persona}-persona-aggregate-${digest(tupleReceipts.map((receipt) => receipt.auditSha256).join("\0")).slice(0, 16)}`,
            tuple:undefined,
            workflowScope:undefined,
            observations:[...new Set(audits.flatMap((audit) => audit.observations))],
            cleanContexts:audits.map((audit) => audit.cleanContext),
            evidence:audits.flatMap((audit) => audit.evidence),
            observationEvidence:Object.assign({}, ...audits.map((audit) => audit.observationEvidence)),
            checkpointReceipts:audits.flatMap((audit) => audit.checkpointReceipts),
            tupleReceipts,
            startedAt:audits.map((audit) => audit.startedAt).sort()[0],
            endedAt:audits.map((audit) => audit.endedAt).sort().at(-1),
            timings,
            performance:Object.fromEntries(Object.entries(first.performance).map(([name, value]) => [name, {...value, elapsedMs:timings[name], classification:timings[name] <= value.budgetMs ? "within-budget" : "regression"}])),
            finalResult:{status:"passed", aggregation:"verified-checkpoint-receipts-only", chunks:audits.reduce((count, audit) => count + audit.checkpointReceipts.length, 0), checkpointReceiptSha256s:audits.flatMap((audit) => audit.checkpointReceipts.map((receipt) => receipt.sha256)), cleanupEvidenceId:first.cleanup.evidenceId},
            rendered:{...first.rendered, viewports:["wide", "compact", "narrow"], responsive:["wide", "compact", "narrow"].map((viewport) => audits.find((audit) => audit.tuple.viewport === viewport)?.rendered.responsive[0]).filter(Boolean), measurements:{consoleExceptions:Math.max(...audits.map((audit) => audit.rendered.measurements.consoleExceptions)), unhandledRequestFailures:Math.max(...audits.map((audit) => audit.rendered.measurements.unhandledRequestFailures)), documentOverflow:audits.some((audit) => audit.rendered.measurements.documentOverflow), inaccessiblePrimaryActions:Math.max(...audits.map((audit) => audit.rendered.measurements.inaccessiblePrimaryActions)), unexplainedDisabledControls:Math.max(...audits.map((audit) => audit.rendered.measurements.unexplainedDisabledControls)), namedRegions:Math.max(...audits.map((audit) => audit.rendered.measurements.namedRegions)), visibleFocus:audits.every((audit) => audit.rendered.measurements.visibleFocus)}, defects:audits.flatMap((audit) => audit.rendered.defects), actions:audits.flatMap((audit) => audit.rendered.actions), recovery:Object.assign({}, ...audits.map((audit) => audit.rendered.recovery)), jobs:Object.assign({}, ...audits.map((audit) => audit.rendered.jobs))},
        };
    });
}

async function runAudits(config, phase, candidateValue) {
    // This is intentionally not injectable.  A controller that accepts audit
    // objects (or a replacement collector) can mint a green campaign without
    // ever launching the installed package and rendered Studio surface.
    packed(config, `${phase} audit`);
    // The controller owns a parent ledger, but every user-visible workflow is
    // run by a newly spawned worker.  Calling the audit function here would
    // let an in-process campaign claim process isolation without ever proving
    // the packed child boundary.
    try {
        const proof = await runP805ProcessIsolatedPackedProof({persona:"all", workflowPersonas:["all"], phase, candidateId:candidateValue.candidateId, candidatePackageSha256:candidateValue.candidatePackageSha256, candidateExecutableSha256:candidateValue.candidateExecutableSha256, candidateExecutableReceipt:candidateValue.candidateExecutableReceipt, output:config.directory, packedCli:config.packedCli, packedPackage:config.packedPackage});
        validateP805TupleProofLedger(proof.ledger, candidateValue);
        // Do not aggregate the runner's return value.  Only the controller's
        // fresh reads of the packed child receipts can cross this boundary.
        const audits = aggregateP805PersonaAudits(await reReadP805PackedTupleAudits(config.directory, proof.ledger, phase, candidateValue), proof.ledger, phase, candidateValue);
        await writeControllerMachineProof(config, phase, candidateValue, proof, audits);
        return audits;
    } catch (error) {
        const failure = {schemaVersion:P805_SCHEMA_VERSION, kind:"p8-05-audit-failure", phase, candidateId:candidateValue.candidateId, candidatePackageSha256:candidateValue.candidatePackageSha256, failedAt:now(), message:error instanceof Error ? error.message : String(error), cleanupEvidenceId:error?.cleanupEvidenceId, cleanup:error?.cleanup};
        // The packed parent owns its immutable tuple failure ledger.  Keep
        // the controller's phase envelope distinct so it can preserve that
        // ledger rather than attempting an append-only overwrite on a spawn,
        // timeout, cancellation, or receipt-validation failure.
        await writeRecord(config.directory, `${phase}-audit-failure.json`, failure);
        throw error;
    }
}

export async function runP805InitialAudit(config, dependencies = {}) {
    base(config); candidate(config.initialCandidate, "initial candidate"); packed(config, "initial audit"); if (!config.provenance?.campaignId || config.provenance.cleanRoomAttestation !== "I recorded each initial persona audit before reading prior findings, source, fixes, or prior campaign evidence.") fail("initial audit requires the clean-room provenance attestation");
    await (dependencies.mkdir ?? mkdir)(config.directory, {recursive:true}); if (existsSync(recordPath(config.directory, "PROVENANCE.json"))) fail("initial campaign provenance is append-only");
    const startedAt = (dependencies.now ?? now)(); await writeRecord(config.directory, "PROVENANCE.json", {schemaVersion:P805_SCHEMA_VERSION, ...config.provenance, startedAt, initialCandidate:config.initialCandidate});
    const audits = await runAudits(config, "initial", config.initialCandidate); await writeRecord(config.directory, "initial-audits.json", {schemaVersion:P805_SCHEMA_VERSION, campaignId:config.provenance.campaignId, audits}); return audits;
}

/** Prepare a freeze payload before asking the external verifier to anchor it.
 * Keeping preparation separate makes it impossible for a public invocation to
 * demand an anchor for a JSON record that has not been produced yet. */
export async function prepareP805Freeze(config) {
    base(config); const provenance = await record(config.directory, "PROVENANCE.json"), initial = await record(config.directory, "initial-audits.json");
    candidate(provenance.value.initialCandidate, "initial candidate");
    if (!config.frozenFindings || !Array.isArray(config.frozenFindings.findings) || !config.frozenFindings.frozenAt) fail("freeze preparation requires a complete finding payload after initial audits");
    if (existsSync(recordPath(config.directory, "frozen-findings-payload.json")) || existsSync(recordPath(config.directory, "frozen-findings.json"))) fail("frozen findings are append-only");
    const payload = {schemaVersion:P805_SCHEMA_VERSION, campaignId:provenance.value.campaignId, ...provenance.value.initialCandidate, ...config.frozenFindings};
    delete payload.externalAnchor;
    await writeRecord(config.directory, "frozen-findings-payload.json", payload);
    return {initialAuditsSha256:digest(initial.contents), frozenFindingsSha256:digest(`${JSON.stringify(payload, null, 2)}\n`)};
}

export async function runP805Freeze(config) {
    base(config); const provenance = await record(config.directory, "PROVENANCE.json"), initial = await record(config.directory, "initial-audits.json"), payload = await record(config.directory, "frozen-findings-payload.json");
    if (existsSync(recordPath(config.directory, "frozen-findings.json"))) fail("frozen findings are append-only");
    const anchor = config.freezeAnchor ?? config.frozenFindings?.externalAnchor;
    const receipt = await externalAnchor(anchor, "p8-05-freeze-anchor", {campaignId:provenance.value.campaignId, candidateId:provenance.value.initialCandidate.candidateId, candidatePackageSha256:provenance.value.initialCandidate.candidatePackageSha256, initialAuditsSha256:digest(initial.contents), frozenFindingsSha256:digest(payload.contents)});
    if (Date.parse(receipt.anchoredAt) < Date.parse(payload.value.frozenAt)) fail("freeze anchor predates the frozen findings payload");
    await writeRecord(config.directory, "frozen-findings.json", {...payload.value, externalAnchor:anchor});
    return {initialAuditsSha256:digest(initial.contents), frozenFindingsSha256:digest(payload.contents)};
}

export async function runP805PostFix(config) {
    base(config); candidate(config.retestCandidate, "retest candidate"); const provenance = await record(config.directory, "PROVENANCE.json"); await record(config.directory, "frozen-findings.json"); if (provenance.value.initialCandidate.candidateId === config.retestCandidate.candidateId) fail("post-fix candidate must differ from initial audit candidate"); if (!config.findingRegister || !config.regressions) fail("post-fix phase requires finding dispositions and machine regression results");
    for (const name of ["finding-register.json", "regressions.json"]) if (existsSync(recordPath(config.directory, name))) fail(`${name} is append-only`);
    await writeRecord(config.directory, "finding-register.json", {schemaVersion:P805_SCHEMA_VERSION, campaignId:provenance.value.campaignId, ...config.findingRegister, retestCandidate:config.retestCandidate}); await writeRecord(config.directory, "regressions.json", {schemaVersion:P805_SCHEMA_VERSION, campaignId:provenance.value.campaignId, ...config.regressions, retestCandidate:config.retestCandidate}); return config.retestCandidate;
}

export async function runP805Retest(config, dependencies = {}) {
    base(config); candidate(config.retestCandidate, "retest candidate"); await record(config.directory, "frozen-findings.json"); await record(config.directory, "regressions.json"); if (existsSync(recordPath(config.directory, "retests.json"))) fail("retests are append-only"); const startedAt = (dependencies.now ?? now)(), audits = await runAudits(config, "retest", config.retestCandidate), provenance = await record(config.directory, "PROVENANCE.json"); await writeRecord(config.directory, "retests.json", {schemaVersion:P805_SCHEMA_VERSION, campaignId:provenance.value.campaignId, startedAt, audits}); return audits;
}

export async function prepareP805Closeout(config) {
    base(config); candidate(config.retestCandidate, "retest candidate"); const provenance = await record(config.directory, "PROVENANCE.json"); await Promise.all([record(config.directory, "frozen-findings.json"), record(config.directory, "finding-register.json"), record(config.directory, "regressions.json"), record(config.directory, "retests.json")]); if (existsSync(recordPath(config.directory, "manifest.json")) || existsSync(recordPath(config.directory, "closeout.json")) || existsSync(recordPath(config.directory, "closeout-payload.json"))) fail("manifest and closeout are append-only"); if (!config.closeout || typeof config.closeout !== "object") fail("closeout preparation requires the completed disposition and cleanup payload");
    const names = ["PROVENANCE.json", "initial-audits.json", "frozen-findings.json", "finding-register.json", "regressions.json", "retests.json"], records = await Promise.all(names.map((name) => record(config.directory, name))), bound = new Map();
    for (const audit of [...records[1].value.audits, ...records[5].value.audits]) for (const item of audit.evidence) bound.set(item.evidenceId, item.sha256);
    for (const finding of records[2].value.findings) bound.set(finding.evidence.evidenceId, finding.evidence.sha256);
    for (const regression of records[4].value.regressions) if (regression.machineResultEvidence) bound.set(regression.machineResultEvidence.evidenceId, regression.machineResultEvidence.sha256);
    const manifest = {schemaVersion:P805_SCHEMA_VERSION, kind:"p8-05-immutable-manifest", campaignId:provenance.value.campaignId, records:Object.fromEntries(records.map((value, index) => [names[index], digest(value.contents)])), evidence:[...bound].map(([evidenceId, sha256]) => ({evidenceId, sha256})), cleanupEvidence:[...records[1].value.audits, ...records[5].value.audits].map((audit) => audit.cleanup?.evidenceId).filter(Boolean)};
    await writeRecord(config.directory, "manifest.json", manifest);
    const manifestContents = await readFile(recordPath(config.directory, "manifest.json"));
    const payload = {schemaVersion:P805_SCHEMA_VERSION, campaignId:provenance.value.campaignId, ...config.retestCandidate, ...config.closeout, manifestSha256:digest(manifestContents)};
    delete payload.externalAnchor;
    await writeRecord(config.directory, "closeout-payload.json", payload);
    return {manifestSha256:digest(manifestContents), closeoutSha256:digest(`${JSON.stringify(payload, null, 2)}\n`)};
}

export async function runP805Closeout(config, dependencies = {}) {
    base(config); candidate(config.retestCandidate, "retest candidate"); const provenance = await record(config.directory, "PROVENANCE.json"), payload = await record(config.directory, "closeout-payload.json");
    if (existsSync(recordPath(config.directory, "closeout.json"))) fail("closeout is append-only");
    const anchor = config.closeoutAnchor ?? config.closeout?.externalAnchor;
    const receipt = await externalAnchor(anchor, "p8-05-closeout-anchor", {campaignId:provenance.value.campaignId, manifestSha256:payload.value.manifestSha256, closeoutSha256:digest(payload.contents)});
    if (Date.parse(receipt.anchoredAt) < Date.parse(payload.value.closedAt)) fail("closeout anchor predates the closeout payload");
    await writeRecord(config.directory, "closeout.json", {...payload.value, externalAnchor:anchor});
    return validateP805ProductReadinessCampaign(config.directory, {candidateId:config.retestCandidate.candidateId, candidatePackageSha256:config.retestCandidate.candidatePackageSha256, freezeAnchorSha256:config.freezeAnchorSha256 ?? (await record(config.directory, "frozen-findings.json")).value.externalAnchor.sha256, closeoutAnchorSha256:config.closeoutAnchorSha256 ?? anchor.sha256});
}

// Kept as a programmatic convenience, but it intentionally cannot skip the
// externally owned freeze/fix/anchor boundaries.
export async function runP805ProductReadinessController(config, dependencies = {}) { if (!config?.phase) fail("controller requires an explicit phase"); return ({"initial-audit":runP805InitialAudit, "prepare-freeze":prepareP805Freeze, freeze:runP805Freeze, "post-fix":runP805PostFix, retest:runP805Retest, "prepare-closeout":prepareP805Closeout, closeout:runP805Closeout}[config.phase] ?? (() => fail("unknown controller phase")))(config, dependencies); }
async function main(argv = process.argv) { const phase = argv[2], configPath = argv[3] === "--config" ? argv[4] : undefined; if (!["initial-audit", "prepare-freeze", "freeze", "post-fix", "retest", "prepare-closeout", "closeout"].includes(phase) || !path.isAbsolute(configPath ?? "") || argv.length !== 5) fail("usage: <initial-audit|prepare-freeze|freeze|post-fix|retest|prepare-closeout|closeout> --config <absolute-path>"); const config = JSON.parse(await readFile(configPath, "utf8")); const result = await runP805ProductReadinessController({...config, phase}); process.stdout.write(`P805_PRODUCT_READINESS_${phase.toUpperCase().replaceAll("-", "_").toUpperCase()}_PASS ${JSON.stringify(result).slice(0, 200)}\n`); }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
