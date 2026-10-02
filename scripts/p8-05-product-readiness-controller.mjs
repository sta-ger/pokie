#!/usr/bin/env node
/** Phase controller for the externally anchored P8-05 audit/fix/retest campaign. */
import {projectP805PersonaAudit} from "./p8-05-persona-projection.mjs";
import {createHash} from "node:crypto";
import {existsSync} from "node:fs";
import {lstat, mkdir, readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";
import {P805_PERSONAS, P805_SCHEMA_VERSION, validateP805CollectedAudits, validateP805ProspectiveCloseout, validateP805ProductReadinessCampaign, validateP805TupleProofLedger} from "./p8-05-product-readiness-campaign.mjs";
import {runP805ProcessIsolatedPackedProof, hasP805NativeActivation, hasP805TransactionActivations, validateP805RenderedPersonaAudit, validateP805RestartRecoveryTerminalReceipt, validateP805RetryTerminalReceipt} from "./p8-05-valera-browser-audit.mjs";

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
const RECOVERY_WORKFLOW_OBSERVATIONS = new Set([
    "simulation-success-failure-cancellation",
    "outcome-library-report-diff-replay",
    "replay-artifact-success-failure-recovery",
    "reload-reconnect-recovery-cancellation-project-switch",
]);
const OUTCOME_LIBRARY_TUPLE = {persona:"mathematician", observation:"outcome-library-report-diff-replay"};
const OUTCOME_LIBRARY_TRANSACTION = {cardId:"outcome-library", controlId:"outcome-library-generate", operation:"outcome-library", requestPath:"/api/project/outcome-libraries/generate/jobs", terminalReceipt:"durable-terminal", artifact:"outcome-library"};
const tupleEvidenceFor = (ledger) => ledger.children.map((child, index) => ({tuple:child.tuple, auditId:ledger.acceptedReceipts[index].receipt.auditId, auditPath:child.auditPath, auditSha256:child.auditSha256, tupleReceiptPath:child.tupleReceiptPath, tupleReceiptSha256:child.tupleReceiptSha256, cleanupPath:child.cleanupPath, cleanupSha256:child.cleanupSha256, checkpointReceiptSha256:child.checkpointReceiptSha256s[0], actionSha256:ledger.acceptedReceipts[index].receipt.checkpointReceipt.actionSha256, cleanupEvidenceId:child.cleanupEvidenceId}));
// A persona aggregate inherits its first worker identity and contains many
// actions. Only the separately authenticated tuple audit can supply this
// projection; a PID alone is also insufficient after a long sequential run.
function acceptedTupleAudit(ledger, audits, index) {
    const child = ledger.children[index], accepted = ledger.acceptedReceipts[index];
    const matches = audits.filter((audit) => audit.auditId === accepted.receipt.auditId && audit.worker?.pid === child.worker?.pid && JSON.stringify(audit.tuple) === JSON.stringify(child.tuple));
    if (matches.length !== 1) fail(`controller requires one accepted immutable audit for ${child.tuple.persona}/${child.tuple.observation}/${child.tuple.viewport}`);
    const audit = matches[0], action = audit.rendered?.actions?.[0];
    if (audit.rendered?.actions?.length !== 1 || action?.persona !== child.tuple.persona || action?.observation !== child.tuple.observation || action?.viewport !== child.tuple.viewport || digest(JSON.stringify(action)) !== accepted.receipt.checkpointReceipt.actionSha256) fail("controller tuple projection cannot substitute another rendered action");
    return audit;
}
export const projectP805RenderedTupleEvidence = (ledger, tupleAudits) => ledger.children.map((child, index) => {
    const audit = acceptedTupleAudit(ledger, tupleAudits, index), action = audit.rendered?.actions?.[0], pointer = action?.transaction?.pointerActivations?.[0], keyboard = action?.transaction?.keyboardActivations?.[0], isPointer = action?.interaction?.activation === "pointer", activation = isPointer ? pointer : keyboard;
    if (!audit || !action || !activation || activation.controlId !== action.stableControlId || !hasP805TransactionActivations(action.transaction)) fail(`controller cannot project rendered evidence for ${child.tuple.persona}/${child.tuple.observation}/${child.tuple.viewport}`);
    return {
        tuple:child.tuple,
        auditSha256:child.auditSha256,
        checkpointReceiptSha256:child.checkpointReceiptSha256s[0],
        actionSha256:ledger.acceptedReceipts[index].receipt.checkpointReceipt.actionSha256,
        activation:JSON.parse(JSON.stringify(activation)),
        request:action.transaction.request,
        terminal:{status:action.terminal.status, resultSha256:action.terminal.resultSha256},
        rendered:{state:action.visibleTerminal.state, observedAfterRequestId:action.visibleTerminal.observedAfterRequestId, resultSha256:action.visibleTerminal.resultSha256, postTransitionRenderedState:isPointer ? action.transaction.postTransitionRenderedState : undefined},
        artifact:action.visibleTerminal.lifecycle.artifact ?? null,
        timing:{elapsedMs:action.elapsedMs},
        accessibility:{visibleFocus:action.accessibility.visibleFocus, namedRegions:action.accessibility.namedRegions, unexplainedDisabledControls:action.accessibility.unexplainedDisabledControls},
        provenance:{candidateId:audit.candidateId, archiveGitHead:audit.packageIdentity.archiveGitHead, candidateTreeObjectId:audit.packageIdentity.candidateTreeObjectId, candidateExecutableReceiptSha256:audit.packageIdentity.candidateExecutableReceiptSha256},
        evidence:{actionEvidenceId:action.evidenceId, screenshotEvidenceId:action.screenshotEvidenceId, cleanupEvidenceId:audit.cleanup.evidenceId},
    };
});
// Retry is a recovery operation rather than one of a tuple's primary form
// submissions.  Keep its receipt in the controller handoff explicitly: a
// generic completed simulation result must never be able to stand in for the
// captured Retry control after React has replaced that control.
const retryTerminalEvidenceFor = (ledger, audits) => ledger.children.flatMap((child, index) => {
    const audit = acceptedTupleAudit(ledger, audits, index);
    const receipt = audit?.rendered?.jobs?.retryWithoutPartialArtifacts?.receipt;
    if (receipt === undefined) return [];
    validateP805RetryTerminalReceipt(receipt);
    const transaction = receipt.transaction, pointer = transaction.pointerActivations[0], rendered = transaction.postTransitionRenderedState;
    return [{
        tuple:child.tuple,
        auditSha256:child.auditSha256,
        checkpointReceiptSha256:child.checkpointReceiptSha256s[0],
        actionSha256:ledger.acceptedReceipts[index].receipt.checkpointReceipt.actionSha256,
        operation:receipt.operation,
        controlId:receipt.controlId,
        stateClass:receipt.stateClass,
        activation:{...pointer, capturedControlId:pointer.capturedControlId, captureKey:pointer.captureKey, preDispatchFocus:pointer.preDispatchFocus, hitTest:pointer.hitTest, dispatch:pointer.dispatch},
        request:transaction.request,
        terminal:transaction.terminal,
        rendered,
        evidence:{retryEvidenceId:audit.rendered.jobs.retryWithoutPartialArtifacts.evidenceId, cleanupEvidenceId:audit.cleanup.evidenceId},
    }];
});
const validRetryTerminalEvidence = (value, expectedCount) => Array.isArray(value) && value.length === expectedCount && value.length > 0 && value.every((entry) => {
    const activation = entry.activation, request = entry.request, terminal = entry.terminal, rendered = entry.rendered;
    const replacementStateIsBound = rendered?.controlState === "retained"
        ? rendered.currentControlId === entry.controlId && rendered.capturedControlConnected === true
        : rendered?.controlState === "replaced"
            ? rendered.currentControlId === entry.controlId && rendered.capturedControlConnected === false
            : rendered?.controlState === "removed" && rendered.currentControlId === null && rendered.capturedControlConnected === false;
    // The controller receipt is consumed after the tuple worker has exited.
    // Preserve the immutable pre-dispatch facts here too: the post-transition
    // DOM may be a React replacement, but it cannot rewrite the focused
    // pointer target that issued the retry request.
    const preDispatch = rendered?.preDispatchEvidence;
    return entry.operation === "simulation-retry" && entry.controlId === "simulation-retry" && entry.stateClass === "recovery-operation" && hasP805NativeActivation(activation, entry.controlId) && activation?.capturedControlId === entry.controlId && typeof activation.captureKey === "string" && activation.captureKey.length > 0 && activation.preDispatchFocus?.controlId === entry.controlId && activation.preDispatchFocus.native === true && activation.hitTest?.capturedControlId === entry.controlId && activation.hitTest?.matchesCapturedControl === true && activation.dispatch?.kind === "native-pointer" && activation.dispatch?.pressed === true && activation.dispatch?.released === true && activation.dispatch.focus?.controlId === entry.controlId && activation.dispatch.focus.native === true && activation.dispatch.focus.targetMatchesCapturedControl === true && request?.method === "POST" && request?.path === "/api/project/simulations" && typeof request.browserRequestId === "string" && request.browserRequestId.length > 0 && terminal?.status === "completed" && typeof terminal.jobId === "string" && terminal.jobId.length > 0 && terminal.causedByRequestId === request.browserRequestId && sha(terminal.resultSha256) && rendered?.capturedControlId === entry.controlId && rendered.captureKey === activation.captureKey && preDispatch?.capturedControlId === activation.capturedControlId && preDispatch.focus?.controlId === activation.preDispatchFocus.controlId && preDispatch.focus.native === true && preDispatch.hitTest?.capturedControlId === activation.hitTest.capturedControlId && preDispatch.hitTest?.matchesCapturedControl === true && preDispatch.dispatch?.kind === activation.dispatch.kind && preDispatch.dispatch?.pressed === true && preDispatch.dispatch?.released === true && preDispatch.dispatch.focus?.controlId === activation.dispatch.focus.controlId && preDispatch.dispatch.focus.native === true && preDispatch.dispatch.focus.targetMatchesCapturedControl === true && replacementStateIsBound && rendered.requestId === request.browserRequestId && rendered.resultSha256 === terminal.resultSha256 && rendered.resultControlId === entry.controlId && rendered.resultOperation === entry.operation && rendered.resultStateClass === entry.stateClass && rendered.resultReceipt === "durable-terminal" && rendered.resultJobId === terminal.jobId && rendered.resultTerminal === terminal.status && rendered.renderedTerminal === true && typeof entry.evidence?.retryEvidenceId === "string" && entry.evidence.retryEvidenceId.length > 0 && typeof entry.evidence.cleanupEvidenceId === "string" && entry.evidence.cleanupEvidenceId.length > 0;
});
// Restart recovery has a different truth condition than Retry: the captured
// submission's executor is gone, so only the durable recovery-required job
// and its newly rendered replacement terminal may cross the controller
// boundary. Preserve the complete receipt here rather than projecting a
// generic simulation result with a matching status.
const restartRecoveryTerminalEvidenceFor = (ledger, audits) => ledger.children.flatMap((child, index) => {
    const audit = acceptedTupleAudit(ledger, audits, index);
    const restartRecovery = audit?.rendered?.jobs?.restartRecovery, receipt = restartRecovery?.receipt;
    if (receipt === undefined) return [];
    validateP805RestartRecoveryTerminalReceipt(receipt);
    return [{
        tuple:child.tuple,
        auditSha256:child.auditSha256,
        checkpointReceiptSha256:child.checkpointReceiptSha256s[0],
        actionSha256:ledger.acceptedReceipts[index].receipt.checkpointReceipt.actionSha256,
        ...receipt,
        evidence:{...receipt.evidence, restartRecoveryEvidenceId:restartRecovery.evidenceId, cleanupEvidenceId:audit.cleanup.evidenceId},
    }];
});
const validRestartRecoveryTerminalEvidence = (value, expected) => Array.isArray(value) && value.length === expected.length && value.length > 0 && value.every((entry, index) => {
    const bound = expected[index];
    if (JSON.stringify(entry?.tuple) !== JSON.stringify(bound?.tuple) || entry?.auditSha256 !== bound?.auditSha256 || entry?.checkpointReceiptSha256 !== bound?.checkpointReceiptSha256 || entry?.actionSha256 !== bound?.actionSha256 || entry?.capturedJobId !== entry?.terminal?.jobId || typeof entry?.evidence?.restartRecoveryEvidenceId !== "string" || !entry.evidence.restartRecoveryEvidenceId || typeof entry.evidence?.screenshotEvidenceId !== "string" || !entry.evidence.screenshotEvidenceId || entry.evidence?.cleanupEvidenceId !== bound?.cleanupEvidenceId) return false;
    try {
        validateP805RestartRecoveryTerminalReceipt(entry);
        return true;
    } catch {
        return false;
    }
});
function validRenderedTupleEvidence(value, expected, phase) {
    if (!Array.isArray(value) || value.length !== expected.length) return false;
    return value.every((entry, index) => {
        const bound = expected[index], pointer = entry?.activation?.kind === "pointer", activation = entry?.activation, request = entry?.request, terminal = entry?.terminal, rendered = entry?.rendered, accessibility = entry?.accessibility, provenance = entry?.provenance, evidence = entry?.evidence, postTransition = rendered?.postTransitionRenderedState;
        const replacementStateIsBound = postTransition?.controlState === "retained"
            ? postTransition.currentControlId === activation?.controlId && postTransition.capturedControlConnected === true
            : postTransition?.controlState === "replaced"
                ? postTransition.currentControlId === activation?.controlId && postTransition.capturedControlConnected === false
                : postTransition?.controlState === "removed" && postTransition.currentControlId === null && postTransition.capturedControlConnected === false;
        return JSON.stringify(entry?.tuple) === JSON.stringify(bound.tuple) && entry?.auditSha256 === bound.auditSha256 && entry?.checkpointReceiptSha256 === bound.checkpointReceiptSha256 && entry?.actionSha256 === bound.actionSha256 && hasP805NativeActivation(activation, activation?.controlId) && typeof activation?.controlId === "string" && activation.controlId && activation?.preDispatchFocus?.controlId === activation.controlId && activation.preDispatchFocus.native === true && (pointer ? activation.capturedControlId === activation.controlId && typeof activation.captureKey === "string" && activation.captureKey.length > 0 && activation.hitTest?.capturedControlId === activation.controlId && activation.hitTest?.matchesCapturedControl === true && activation.dispatch?.kind === "native-pointer" && activation.dispatch?.pressed === true && activation.dispatch?.released === true && postTransition?.capturedControlId === activation.controlId && postTransition.captureKey === activation.captureKey && replacementStateIsBound && postTransition.requestId === request?.browserRequestId && postTransition.resultSha256 === terminal?.resultSha256 && postTransition.renderedTerminal === true : activation.dispatch?.kind === "native-keyboard" && activation.nativeFocus === true) && typeof request?.browserRequestId === "string" && request.browserRequestId && typeof request?.method === "string" && typeof request?.path === "string" && sha(request?.responseSha256) && typeof terminal?.status === "string" && sha(terminal?.resultSha256) && rendered?.state === "rendered" && rendered?.observedAfterRequestId === request.browserRequestId && rendered?.resultSha256 === terminal.resultSha256 && (entry.artifact === null || typeof entry.artifact?.name === "string") && Number.isSafeInteger(entry?.timing?.elapsedMs) && entry.timing.elapsedMs > 0 && Array.isArray(accessibility?.namedRegions) && typeof accessibility.visibleFocus === "boolean" && Number.isSafeInteger(accessibility.unexplainedDisabledControls) && (phase === "initial" || accessibility.visibleFocus === true && accessibility.namedRegions.length > 0 && accessibility.unexplainedDisabledControls === 0) && commit(provenance?.archiveGitHead ?? provenance?.candidateId) && commit(provenance?.candidateTreeObjectId) && sha(provenance?.candidateExecutableReceiptSha256) && typeof evidence?.actionEvidenceId === "string" && evidence.actionEvidenceId && typeof evidence?.screenshotEvidenceId === "string" && evidence.screenshotEvidenceId && evidence.cleanupEvidenceId === bound.cleanupEvidenceId;
    });
}
// Outcome Library alone has a card preflight and a durable output artifact.
// Preserve that complete card transaction at the controller boundary so a
// generic Build/Export action cannot substitute for this mathematician tuple.
const outcomeLibraryTransactionEvidenceFor = (ledger, audits) => ledger.children.flatMap((child, index) => {
    if (child.tuple.persona !== OUTCOME_LIBRARY_TUPLE.persona || child.tuple.observation !== OUTCOME_LIBRARY_TUPLE.observation) return [];
    const audit = acceptedTupleAudit(ledger, audits, index), action = audit?.rendered?.actions?.find((value) => value.persona === child.tuple.persona && value.observation === child.tuple.observation && value.viewport === child.tuple.viewport), preflight = action?.transaction?.preflight, pointer = action?.transaction?.pointerActivations?.[0], lifecycle = action?.visibleTerminal?.lifecycle;
    if (!audit || !action || !preflight || !pointer || !lifecycle) fail(`controller cannot project the Outcome Library transaction for ${child.tuple.viewport}`);
    return [{tuple:child.tuple, auditSha256:child.auditSha256, checkpointReceiptSha256:child.checkpointReceiptSha256s[0], actionSha256:ledger.acceptedReceipts[index].receipt.checkpointReceipt.actionSha256, card:{id:OUTCOME_LIBRARY_TRANSACTION.cardId, label:preflight.cardLabel}, preflight, form:action.transaction.formState, activation:pointer, request:action.transaction.request, progressSnapshots:action.transaction.progressSnapshots, terminal:{status:action.terminal?.status, jobId:action.terminal?.jobId, receipt:lifecycle.receipt, durableJobId:lifecycle.durableJobId, durableStatus:lifecycle.durableStatus, resultSha256:action.terminal?.resultSha256}, rendered:{state:action.visibleTerminal?.state, observedAfterRequestId:action.visibleTerminal?.observedAfterRequestId, resultSha256:action.visibleTerminal?.resultSha256, controlId:lifecycle.controlId, operation:lifecycle.operation, stateClass:lifecycle.stateClass}, artifact:lifecycle.artifact, timing:{elapsedMs:action.elapsedMs}, accessibility:action.accessibility, provenance:{candidateId:audit.candidateId, archiveGitHead:audit.packageIdentity.archiveGitHead, candidateTreeObjectId:audit.packageIdentity.candidateTreeObjectId, candidateExecutableReceiptSha256:audit.packageIdentity.candidateExecutableReceiptSha256}, evidence:{actionEvidenceId:action.evidenceId, screenshotEvidenceId:action.screenshotEvidenceId, cleanupEvidenceId:audit.cleanup.evidenceId}}];
});
const validOutcomeLibraryTransactionEvidence = (value, expected, phase) => Array.isArray(value) && value.length === expected.length && value.length === 3 && value.every((entry, index) => {
    const bound = expected[index], preflight = entry?.preflight, form = entry?.form, activation = entry?.activation, request = entry?.request, progressSnapshots = entry?.progressSnapshots, terminal = entry?.terminal, rendered = entry?.rendered, artifact = entry?.artifact, accessibility = entry?.accessibility, provenance = entry?.provenance, evidence = entry?.evidence;
    const firstTerminalSnapshot = Array.isArray(progressSnapshots) ? progressSnapshots.find((snapshot) => !["queued", "running", "cancelling", "pending"].includes(snapshot?.durableStatus)) : undefined;
    return JSON.stringify(entry?.tuple) === JSON.stringify(bound?.tuple) && entry?.auditSha256 === bound?.auditSha256 && entry?.checkpointReceiptSha256 === bound?.checkpointReceiptSha256 && entry?.actionSha256 === bound?.actionSha256 && entry?.card?.id === OUTCOME_LIBRARY_TRANSACTION.cardId && entry.card.label === "Outcome library generator" && preflight?.state === "ready" && preflight.status === "ok" && preflight.controlId === OUTCOME_LIBRARY_TRANSACTION.controlId && preflight.enabled === true && preflight.disabled === false && form?.operation === OUTCOME_LIBRARY_TRANSACTION.operation && form.capturedBeforeSubmission === true && form.actionControl?.stableControlId === OUTCOME_LIBRARY_TRANSACTION.controlId && Array.isArray(form.fields) && form.fields.length > 0 && form.fields.every((field) => field?.stableControlId && field?.accessibleName && field?.disabled === false && field?.validation?.valid === true) && hasP805NativeActivation(activation, OUTCOME_LIBRARY_TRANSACTION.controlId) && activation?.kind === "pointer" && activation.controlId === OUTCOME_LIBRARY_TRANSACTION.controlId && activation.capturedControlId === OUTCOME_LIBRARY_TRANSACTION.controlId && typeof activation.captureKey === "string" && activation.captureKey.length > 0 && activation.preDispatchFocus?.controlId === OUTCOME_LIBRARY_TRANSACTION.controlId && activation.preDispatchFocus.native === true && activation.hitTest?.capturedControlId === OUTCOME_LIBRARY_TRANSACTION.controlId && activation.hitTest.matchesCapturedControl === true && activation.dispatch?.kind === "native-pointer" && activation.dispatch.pressed === true && activation.dispatch.released === true && activation.dispatch.focus?.controlId === OUTCOME_LIBRARY_TRANSACTION.controlId && activation.dispatch.focus.native === true && activation.dispatch.focus.targetMatchesCapturedControl === true && request?.method === "POST" && request.path === OUTCOME_LIBRARY_TRANSACTION.requestPath && typeof request.browserRequestId === "string" && request.browserRequestId.length > 0 && sha(request.responseSha256) && Array.isArray(progressSnapshots) && progressSnapshots.length >= 2 && progressSnapshots[0]?.source === "start-response" && progressSnapshots[0]?.browserRequestId === request.browserRequestId && progressSnapshots.every((snapshot) => snapshot?.jobId === terminal?.jobId && typeof snapshot?.browserRequestId === "string" && snapshot.browserRequestId.length > 0 && typeof snapshot?.durableStatus === "string") && firstTerminalSnapshot?.source === "rendered-poll" && firstTerminalSnapshot.jobId === terminal?.jobId && firstTerminalSnapshot.durableStatus === terminal?.status && terminal?.status === "completed" && typeof terminal.jobId === "string" && terminal.jobId.length > 0 && terminal.receipt === OUTCOME_LIBRARY_TRANSACTION.terminalReceipt && terminal.durableJobId === terminal.jobId && terminal.durableStatus === terminal.status && sha(terminal.resultSha256) && rendered?.state === "rendered" && rendered.observedAfterRequestId === request.browserRequestId && rendered.resultSha256 === terminal.resultSha256 && rendered.controlId === OUTCOME_LIBRARY_TRANSACTION.controlId && rendered.operation === OUTCOME_LIBRARY_TRANSACTION.operation && rendered.stateClass === "editable-submission" && artifact?.name === OUTCOME_LIBRARY_TRANSACTION.artifact && typeof artifact.accessibleName === "string" && artifact.accessibleName.length > 0 && typeof artifact.outputPath === "string" && artifact.outputPath.length > 0 && Number.isSafeInteger(entry?.timing?.elapsedMs) && entry.timing.elapsedMs > 0 && Array.isArray(accessibility?.namedRegions) && typeof accessibility.visibleFocus === "boolean" && Number.isSafeInteger(accessibility.unexplainedDisabledControls) && (phase === "initial" || accessibility.visibleFocus === true && accessibility.namedRegions.length > 0 && accessibility.unexplainedDisabledControls === 0) && commit(provenance?.archiveGitHead ?? provenance?.candidateId) && commit(provenance?.candidateTreeObjectId) && sha(provenance?.candidateExecutableReceiptSha256) && typeof evidence?.actionEvidenceId === "string" && evidence.actionEvidenceId.length > 0 && typeof evidence.screenshotEvidenceId === "string" && evidence.screenshotEvidenceId.length > 0 && evidence.cleanupEvidenceId === bound.cleanupEvidenceId;
});
export const p805ControllerArtifactPath = (directory, name, label) => {
    const root = path.resolve(directory);
    if (typeof name !== "string" || !name || path.isAbsolute(name) || path.normalize(name) !== name) fail(`${label} must name a canonical local immutable artifact`);
    const target = path.resolve(root, name), relative = path.relative(root, target);
    if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) fail(`${label} escapes the controller-owned immutable operation root`);
    return target;
};
/**
 * A digest-valid ledger from a sibling directory is not evidence for this
 * controller invocation. Verify the parent-sealed namespace before any tuple
 * receipt is allowed to cross into a persona aggregate.
 */
export const p805ControllerOperationRoot = (directory, ledger) => {
    const root = path.resolve(directory), declared = ledger?.operationRoot;
    if (!path.isAbsolute(declared ?? "") || path.resolve(declared) !== root || declared !== root) fail("packed tuple ledger substitutes the controller-owned immutable operation root");
    return root;
};
/**
 * Read one controller-owned artifact without letting a child substitute an
 * intermediate symlinked directory for the operation namespace.  The packed
 * worker can name only a lexical child of `directory`; every component is
 * then re-read from that one root before its bytes become aggregate input.
 */
export async function readP805ControllerImmutableArtifact(directory, name, expectedSha256, label) {
    if (!sha(expectedSha256)) fail(`${label} is missing its immutable digest`);
    let contents, value, metadata;
    try {
        const root = path.resolve(directory), target = p805ControllerArtifactPath(root, name, label), components = path.relative(root, target).split(path.sep);
        let current = root;
        const rootMetadata = await lstat(root);
        if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) fail(`${label} controller-owned immutable operation root is not a regular directory`);
        for (const component of components) {
            current = path.join(current, component);
            metadata = await lstat(current);
            if (metadata.isSymbolicLink() || (current !== target && !metadata.isDirectory())) fail(`${label} is not a regular artifact in the controller-owned immutable operation root`);
        }
        if (!metadata?.isFile()) fail(`${label} is not a regular artifact in the controller-owned immutable operation root`);
        contents = await readFile(target, "utf8");
        value = JSON.parse(contents);
    }
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
    const tuples = ledger.children.map(({tuple}) => `${tuple.persona}/${tuple.observation}/${tuple.viewport}`), tupleAuditIds = ledger.acceptedReceipts.map(({receipt}) => receipt.auditId), tupleEvidence = tupleEvidenceFor(ledger), outcomeLibraryEvidence = tupleEvidence.filter(({tuple}) => tuple.persona === OUTCOME_LIBRARY_TUPLE.persona && tuple.observation === OUTCOME_LIBRARY_TUPLE.observation), restartRecoveryEvidence = tupleEvidence.filter(({tuple}) => RECOVERY_WORKFLOW_OBSERVATIONS.has(tuple.observation)), expectedRetryCount = restartRecoveryEvidence.length;
    if (!value || value.schemaVersion !== P805_SCHEMA_VERSION || value.kind !== "p8-05-controller-machine-proof" || value.status !== "passed" || value.execution !== "controller-owned-exact-candidate-packed-cli-and-rendered-studio-matrix" || value.phase !== phase || ledger.phase !== phase || value.candidateId !== candidateValue.candidateId || value.candidatePackageSha256 !== candidateValue.candidatePackageSha256 || value.candidateExecutableSha256 !== candidateValue.candidateExecutableSha256 || value.proofLedger?.path !== proofLedgerName(phase) || value.proofLedger?.sha256 !== digest(ledgerContents) || value.proofLedger?.operationRoot !== ledger.operationRoot || !path.isAbsolute(value.proofLedger?.operationRoot ?? "") || value.proofLedger?.candidateId !== candidateValue.candidateId || value.proofLedger?.candidatePackageSha256 !== candidateValue.candidatePackageSha256 || value.proofLedger?.status !== "passed" || value.proofLedger?.aggregation !== "independently-verified-immutable-tuple-child-receipts-only" || JSON.stringify(value.tuples) !== JSON.stringify(tuples) || value.audits?.count !== P805_PERSONAS.length || JSON.stringify(value.audits?.personas) !== JSON.stringify(P805_PERSONAS) || !Array.isArray(value.audits?.ids) || value.audits.ids.length !== P805_PERSONAS.length || new Set(value.audits.ids).size !== P805_PERSONAS.length || JSON.stringify(value.audits?.tupleReceiptAuditIds) !== JSON.stringify(tupleAuditIds) || new Set(tupleAuditIds).size !== tupleAuditIds.length || JSON.stringify(value.audits?.tupleEvidence) !== JSON.stringify(tupleEvidence) || !validRenderedTupleEvidence(value.audits?.renderedTupleEvidence, tupleEvidence, phase) || !validOutcomeLibraryTransactionEvidence(value.audits?.outcomeLibraryTransactionEvidence, outcomeLibraryEvidence, phase) || !validRetryTerminalEvidence(value.audits?.retryTerminalEvidence, expectedRetryCount) || !validRestartRecoveryTerminalEvidence(value.audits?.restartRecoveryTerminalEvidence, restartRecoveryEvidence)) fail("controller machine proof does not bind five persona aggregates to the exact candidate's complete packed CLI/Studio tuple ledger");
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
    const operationRoot = p805ControllerOperationRoot(directory, ledger);
    if (ledger.phase !== phase) fail("packed tuple ledger phase differs from the controller phase");
    const audits = [];
    for (const [index, child] of ledger.children.entries()) {
        const accepted = ledger.acceptedReceipts[index], tuple = child.tuple;
        const auditArtifact = await readP805ControllerImmutableArtifact(operationRoot, child.auditPath, child.auditSha256, `packed ${tuple.persona}/${tuple.observation}/${tuple.viewport} audit`);
        const tupleArtifact = await readP805ControllerImmutableArtifact(operationRoot, child.tupleReceiptPath, child.tupleReceiptSha256, `packed ${tuple.persona}/${tuple.observation}/${tuple.viewport} tuple receipt`);
        const cleanupArtifact = await readP805ControllerImmutableArtifact(operationRoot, child.cleanupPath, child.cleanupSha256, `packed ${tuple.persona}/${tuple.observation}/${tuple.viewport} cleanup receipt`);
        const audit = auditArtifact.value, tupleReceipt = tupleArtifact.value, cleanup = cleanupArtifact.value, action = audit?.rendered?.actions?.[0], checkpoint = audit?.checkpointReceipts?.[0];
        validateP805RenderedPersonaAudit(audit);
        const actionSha256 = digest(JSON.stringify(action));
        if (audit?.phase !== phase || audit?.candidateId !== candidateValue.candidateId || audit?.candidatePackageSha256 !== candidateValue.candidatePackageSha256 || audit?.packageIdentity?.declaredCandidateExecutableSha256 !== candidateValue.candidateExecutableSha256 || JSON.stringify(audit?.tuple) !== JSON.stringify(tuple) || audit?.auditId !== accepted?.receipt?.auditId || audit?.worker?.pid !== child.worker?.pid || audit?.checkpointReceipts?.length !== 1 || audit?.rendered?.actions?.length !== 1 || JSON.stringify(tupleReceipt) !== JSON.stringify(accepted?.receipt) || JSON.stringify(cleanup) !== JSON.stringify(accepted?.cleanup) || JSON.stringify(tupleReceipt?.action) !== JSON.stringify(action) || checkpoint?.actionSha256 !== actionSha256 || tupleReceipt?.checkpointReceipt?.actionSha256 !== actionSha256 || tupleReceipt?.checkpointReceipt?.sha256 !== checkpoint?.sha256 || child?.checkpointReceiptSha256s?.[0] !== checkpoint?.sha256 || tupleReceipt?.cleanupEvidenceId !== cleanup?.cleanupEvidenceId || audit?.cleanup?.evidenceId !== cleanup?.cleanupEvidenceId || tupleReceipt?.cleanupSha256 !== digest(cleanupArtifact.contents) || child?.cleanupSha256 !== digest(cleanupArtifact.contents)) fail(`packed ${tuple.persona}/${tuple.observation}/${tuple.viewport} controller re-read found substituted rendered action, terminal, or cleanup evidence`);
        const checkpointArtifact = await readP805ControllerImmutableArtifact(operationRoot, checkpoint?.path, checkpoint?.sha256, `packed ${tuple.persona}/${tuple.observation}/${tuple.viewport} checkpoint receipt`);
        if (checkpointArtifact.value?.kind !== "p8-05-packed-workflow-checkpoint" || checkpointArtifact.value?.status !== "passed" || checkpointArtifact.value?.phase !== phase || checkpointArtifact.value?.auditId !== audit.auditId || checkpointArtifact.value?.worker?.pid !== child.worker?.pid || checkpointArtifact.value?.candidateId !== candidateValue.candidateId || checkpointArtifact.value?.candidatePackageSha256 !== candidateValue.candidatePackageSha256 || checkpointArtifact.value?.persona !== tuple.persona || checkpointArtifact.value?.observation !== tuple.observation || checkpointArtifact.value?.viewport !== tuple.viewport || JSON.stringify(checkpointArtifact.value?.action) !== JSON.stringify(action)) fail(`packed ${tuple.persona}/${tuple.observation}/${tuple.viewport} controller checkpoint does not bind its rendered action`);
        audits.push(audit);
    }
    return audits;
}

async function writeControllerMachineProof(config, phase, candidateValue, proof, audits, tupleAudits) {
    const ledger = await record(config.directory, proofLedgerName(phase));
    validateP805TupleProofLedger(ledger.value, candidateValue);
    const operationRoot = p805ControllerOperationRoot(config.directory, ledger.value);
    if (digest(`${JSON.stringify(proof.ledger, null, 2)}\n`) !== digest(ledger.contents)) fail("controller re-read ledger differs from the packed parent result");
    const tuples = ledger.value.children.map(({tuple}) => `${tuple.persona}/${tuple.observation}/${tuple.viewport}`), tupleAuditIds = ledger.value.acceptedReceipts.map(({receipt}) => receipt.auditId), tupleEvidence = tupleEvidenceFor(ledger.value), renderedTupleEvidence = projectP805RenderedTupleEvidence(ledger.value, tupleAudits), outcomeLibraryTransactionEvidence = outcomeLibraryTransactionEvidenceFor(ledger.value, tupleAudits), retryTerminalEvidence = retryTerminalEvidenceFor(ledger.value, tupleAudits), restartRecoveryTerminalEvidence = restartRecoveryTerminalEvidenceFor(ledger.value, tupleAudits), value = {
        schemaVersion:P805_SCHEMA_VERSION,
        kind:"p8-05-controller-machine-proof",
        status:"passed",
        execution:"controller-owned-exact-candidate-packed-cli-and-rendered-studio-matrix",
        phase,
        candidateId:candidateValue.candidateId,
        candidatePackageSha256:candidateValue.candidatePackageSha256,
        candidateExecutableSha256:candidateValue.candidateExecutableSha256,
        proofLedger:{path:proofLedgerName(phase), sha256:digest(ledger.contents), operationRoot, candidateId:ledger.value.candidateId, candidatePackageSha256:ledger.value.candidatePackageSha256, status:ledger.value.status, aggregation:ledger.value.finalResult?.aggregation},
        tuples,
        // The handoff is derived solely from the re-read immutable ledger.
        // In-memory audit objects are useful to write the campaign record,
        // but may never define what the controller certifies to review.
        audits:{count:audits.length, personas:audits.map((audit) => audit.persona), ids:audits.map((audit) => audit.auditId), tupleReceiptAuditIds:tupleAuditIds, tupleEvidence, renderedTupleEvidence, outcomeLibraryTransactionEvidence, retryTerminalEvidence, restartRecoveryTerminalEvidence},
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
        const children = ledger.children.filter((child) => child.tuple.persona === persona), audits = children.map((child) => acceptedTupleAudit(ledger, tupleAudits, ledger.children.indexOf(child)));
        if (children.length === 0 || audits.length !== children.length || audits.some((audit) => !audit.tuple || audit.phase !== phase)) fail(`persona aggregation is missing immutable ${persona} tuple audits`);
        const tupleReceipts = children.map((child) => {
            const audit = acceptedTupleAudit(ledger, audits, ledger.children.indexOf(child));
            return {tuple:child.tuple, auditId:audit.auditId, auditPath:child.auditPath, auditSha256:child.auditSha256, tupleReceiptPath:child.tupleReceiptPath, tupleReceiptSha256:child.tupleReceiptSha256, cleanupPath:child.cleanupPath, cleanupSha256:child.cleanupSha256, checkpointReceiptSha256s:child.checkpointReceiptSha256s, cleanupEvidenceId:child.cleanupEvidenceId};
        });
        return projectP805PersonaAudit(audits, tupleReceipts, phase, persona);
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
        const proof = await runP805ProcessIsolatedPackedProof({persona:"all", workflowPersonas:["all"], phase, candidateId:candidateValue.candidateId, candidatePackageSha256:candidateValue.candidatePackageSha256, candidateExecutableSha256:candidateValue.candidateExecutableSha256, candidateExecutableReceipt:candidateValue.candidateExecutableReceipt, output:config.directory, packedCli:config.packedCli, packedPackage:config.packedPackage}), persistedLedger = await record(config.directory, proofLedgerName(phase));
        validateP805TupleProofLedger(persistedLedger.value, candidateValue);
        p805ControllerOperationRoot(config.directory, persistedLedger.value);
        if (digest(`${JSON.stringify(proof.ledger, null, 2)}\n`) !== digest(persistedLedger.contents)) fail("controller packed parent result differs from its canonical immutable operation root");
        // Do not aggregate the runner's return value.  Only the controller's
        // fresh reads of the packed child receipts can cross this boundary.
        const tupleAudits = await reReadP805PackedTupleAudits(config.directory, persistedLedger.value, phase, candidateValue), audits = aggregateP805PersonaAudits(tupleAudits, persistedLedger.value, phase, candidateValue);
        await validateP805CollectedAudits(config.directory, audits, phase, candidateValue);
        await writeControllerMachineProof(config, phase, candidateValue, proof, audits, tupleAudits);
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
    const manifest = {schemaVersion:P805_SCHEMA_VERSION, kind:"p8-05-immutable-manifest", campaignId:provenance.value.campaignId, records:Object.fromEntries(records.map((value, index) => [names[index], digest(value.contents)])), evidence:[...bound].map(([evidenceId, sha256]) => ({evidenceId, sha256})), cleanupEvidence:[...records[1].value.audits, ...records[5].value.audits].flatMap((audit) => audit.tupleReceipts.map((receipt) => receipt.cleanupEvidenceId))};
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
    const expected = {candidateId:config.retestCandidate.candidateId, candidatePackageSha256:config.retestCandidate.candidatePackageSha256, freezeAnchorSha256:config.freezeAnchorSha256 ?? (await record(config.directory, "frozen-findings.json")).value.externalAnchor.sha256, closeoutAnchorSha256:config.closeoutAnchorSha256 ?? anchor.sha256};
    await validateP805ProspectiveCloseout(config.directory, expected, {...payload.value, externalAnchor:anchor});
    await writeRecord(config.directory, "closeout.json", {...payload.value, externalAnchor:anchor});
    return validateP805ProductReadinessCampaign(config.directory, expected);
}

// Kept as a programmatic convenience, but it intentionally cannot skip the
// externally owned freeze/fix/anchor boundaries.
export async function runP805ProductReadinessController(config, dependencies = {}) { if (!config?.phase) fail("controller requires an explicit phase"); return ({"initial-audit":runP805InitialAudit, "prepare-freeze":prepareP805Freeze, freeze:runP805Freeze, "post-fix":runP805PostFix, retest:runP805Retest, "prepare-closeout":prepareP805Closeout, closeout:runP805Closeout}[config.phase] ?? (() => fail("unknown controller phase")))(config, dependencies); }
async function main(argv = process.argv) { const phase = argv[2], configPath = argv[3] === "--config" ? argv[4] : undefined; if (!["initial-audit", "prepare-freeze", "freeze", "post-fix", "retest", "prepare-closeout", "closeout"].includes(phase) || !path.isAbsolute(configPath ?? "") || argv.length !== 5) fail("usage: <initial-audit|prepare-freeze|freeze|post-fix|retest|prepare-closeout|closeout> --config <absolute-path>"); const config = JSON.parse(await readFile(configPath, "utf8")); const result = await runP805ProductReadinessController({...config, phase}); process.stdout.write(`P805_PRODUCT_READINESS_${phase.toUpperCase().replaceAll("-", "_").toUpperCase()}_PASS ${JSON.stringify(result).slice(0, 200)}\n`); }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
