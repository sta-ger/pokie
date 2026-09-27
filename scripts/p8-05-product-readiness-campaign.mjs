#!/usr/bin/env node
/**
 * Validates P8-05's append-only, clean-room product-readiness campaign.
 *
 * This is intentionally a validator, not an audit generator: a script must
 * never manufacture first-time-user observations, screenshots, or a clean
 * closeout.  Reviewers write bounded records and this module rejects records
 * that are not tied to the candidate which they actually exercised.
 */
import {createHash} from "node:crypto";
import {existsSync} from "node:fs";
import {readFile, stat} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";
import {validateP805RenderedPersonaAudit} from "./p8-05-valera-browser-audit.mjs";

export const P805_SCHEMA_VERSION = 4;
export const P805_EVIDENCE_DIRECTORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "docs", "evidence", "p8-05-product-readiness");
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const P805_PERSONAS = ["mathematician", "programmer", "producer", "ui-ux", "graphic-designer"];
export const P805_REQUIRED_EVIDENCE_KINDS = ["screenshot", "live-dom-transaction", "page-state", "cli-transcript", "browser-log", "api-log", "error", "timing", "reproduction", "artifact", "cleanup"];
export const P805_REQUIRED_OBSERVATIONS = {
    mathematician:["blueprint", "par-xlsx-round-trip", "reels-paytable-modes-mechanics", "simulation-success-failure-cancellation", "simulation-rtp-volatility-features", "outcome-library-report-diff-replay", "replay-artifact-success-failure-recovery", "certification-conditional", "fairness-conditional", "build-export-output-folder", "import-export-defaults"],
    programmer:["packed-install", "npx-pokie", "recursive-help", "create-build-inspect", "validate-sim-report-diff-replay-serve-wasm", "spaces-invalid-inputs-exit-codes-ci-recovery", "build-export-output-folder"],
    producer:["product-framing", "end-to-end-navigation", "trust"],
    "ui-ux":["onboarding-terminology-forms-progress", "reload-reconnect-recovery-cancellation-project-switch", "keyboard-responsive-accessibility"],
    "graphic-designer":["hierarchy-typography-spacing-density-controls-finish"],
};
const P805_REQUIRED_TUPLES = P805_PERSONAS.flatMap((persona) => P805_REQUIRED_OBSERVATIONS[persona].flatMap((observation) => ["wide", "compact", "narrow"].map((viewport) => ({persona, observation, viewport}))));
const tupleKey = (tuple) => `${tuple?.persona}/${tuple?.observation}/${tuple?.viewport}`;
/** Validate the parent-owned tuple ledger before a controller may consume it.
 * This is deliberately independent from the legacy five-audit campaign
 * record: a parent has to prove that it accepted every immutable child tuple,
 * in sequence, rather than infer completion from a persona-sized summary. */
export function validateP805TupleProofLedger(ledger, expected) {
    const tuples = P805_REQUIRED_TUPLES.map(tupleKey);
    const runtime = ledger?.runtime;
    if (!ledger || ledger.kind !== "p8-05-process-isolated-packed-proof" || ledger.status !== "passed" || ledger.candidateId !== expected?.candidateId || ledger.candidatePackageSha256 !== expected?.candidatePackageSha256 || runtime?.kind !== "p8-05-immutable-packed-runtime" || !path.isAbsolute(runtime.root ?? "") || typeof runtime.receiptPath !== "string" || path.basename(runtime.receiptPath) !== runtime.receiptPath || !sha(runtime.receiptSha256) || runtime.candidateId !== expected.candidateId || runtime.candidatePackageSha256 !== expected.candidatePackageSha256 || runtime.candidateExecutableSha256 !== expected.candidateExecutableSha256 || runtime.archiveSha256 !== expected.candidatePackageSha256 || runtime.installationCount !== 1 || runtime.permissions !== "read-only-before-any-tuple-child" || !Array.isArray(ledger.children) || !Array.isArray(ledger.acceptedReceipts) || ledger.children.length !== tuples.length || ledger.acceptedReceipts.length !== tuples.length || ledger.finalResult?.status !== "passed" || ledger.finalResult?.children !== tuples.length || ledger.finalResult?.checkpointReceipts !== tuples.length || ledger.finalResult?.aggregation !== "independently-verified-immutable-tuple-child-receipts-only") fail("tuple proof ledger does not prove a complete passing child matrix");
    const accepted = new Set(), immutableArtifacts = new Set();
    for (const [index, child] of ledger.children.entries()) {
        const tuple = child?.tuple, key = `${tuple?.persona}/${tuple?.observation}/${tuple?.viewport}`, receipt = ledger.acceptedReceipts[index];
        const tupleReceipt = receipt?.receipt, cleanupReceipt = receipt?.cleanup, checkpoint = tupleReceipt?.checkpointReceipt;
        if (key !== tuples[index] || accepted.has(key) || child?.worker?.pid === ledger.parent?.pid || !child?.auditPath || !sha(child?.auditSha256) || !child?.tupleReceiptPath || !sha(child?.tupleReceiptSha256) || !child?.cleanupPath || !sha(child?.cleanupSha256) || !Array.isArray(child?.checkpointReceiptSha256s) || child.checkpointReceiptSha256s.length !== 1 || !sha(child.checkpointReceiptSha256s[0]) || child?.exitCode !== 0 || child?.signal !== null || child?.parentCleanup?.processTreeDrained !== true || child?.parentCleanup?.resourcesDrained !== true || JSON.stringify(receipt?.tuple) !== JSON.stringify(tuple) || receipt?.receiptPath !== child.tupleReceiptPath || receipt?.receiptSha256 !== child.tupleReceiptSha256 || receipt?.cleanupPath !== child.cleanupPath || receipt?.cleanupSha256 !== child.cleanupSha256 || !sha(receipt?.receiptSha256) || !sha(receipt?.cleanupSha256) || tupleReceipt?.schemaVersion !== 1 || tupleReceipt.kind !== "p8-05-packed-tuple-receipt" || tupleReceipt.status !== "passed" || tupleReceipt.candidateId !== expected.candidateId || tupleReceipt.candidatePackageSha256 !== expected.candidatePackageSha256 || JSON.stringify(tupleReceipt.tuple) !== JSON.stringify(tuple) || tupleReceipt.worker?.pid !== child.worker?.pid || !tupleReceipt.auditId || !checkpoint || checkpoint.candidateId !== expected.candidateId || checkpoint.candidatePackageSha256 !== expected.candidatePackageSha256 || checkpoint.persona !== tuple.persona || checkpoint.observation !== tuple.observation || checkpoint.viewport !== tuple.viewport || !sha(checkpoint.actionSha256) || cleanupReceipt?.schemaVersion !== 1 || cleanupReceipt.kind !== "p8-05-packed-tuple-cleanup" || cleanupReceipt.candidateId !== expected.candidateId || cleanupReceipt.candidatePackageSha256 !== expected.candidatePackageSha256 || JSON.stringify(cleanupReceipt.tuple) !== JSON.stringify(tuple) || cleanupReceipt.worker?.pid !== child.worker?.pid || cleanupReceipt.cleanup?.exit !== "success" || cleanupReceipt.cleanup?.processTreeDrained !== true || cleanupReceipt.cleanup?.resourcesDrained !== true || cleanupReceipt.cleanup?.contextRemoved !== true || cleanupReceipt.cleanupEvidenceId !== child.cleanupEvidenceId || tupleReceipt.cleanupEvidenceId !== cleanupReceipt.cleanupEvidenceId || tupleReceipt.cleanupSha256 !== receipt.cleanupSha256) fail(`tuple proof ledger has a missing, duplicate, stale, cross-candidate, cross-persona, cross-viewport, or unclean child ${key}`);
        for (const artifact of [child.auditSha256, child.tupleReceiptSha256, child.cleanupSha256, child.checkpointReceiptSha256s[0]]) {
            if (immutableArtifacts.has(artifact)) fail(`tuple proof ledger has content-equivalent immutable evidence for ${key}`);
            immutableArtifacts.add(artifact);
        }
        accepted.add(key);
    }
    if (accepted.size !== tuples.length) fail("tuple proof ledger has an incomplete accepted child matrix");
    return ledger;
}
// This is an evidence contract, not a list of pages to visit.  Each audit
// observation must name the public operation that caused it, its rendered
// control, the server activity it expects to see, and the durable result that
// makes the observation useful to a first-time user.  Keeping it here lets
// the collector and the append-only validator reject a relabelled screenshot.
export const P805_WORKFLOW_CONTRACTS = {
    mathematician: {
        "blueprint": {route:"overview", control:"Overview", method:"GET", api:"/api/project/context", terminal:"project-context"},
        "par-xlsx-round-trip": {route:"exportDeploy", control:"Build/Export", actionControl:"Build", actionControlId:"artifact-build-parWorkbook", method:"POST", api:"/api/project/artifacts/build", body:"artifact-build", poll:"/api/project/artifacts/build/{id}", artifact:"artifact-build-output", terminal:"round-trip"},
        "reels-paytable-modes-mechanics": {route:"gameModel", control:"Game Model", method:"GET", api:"/api/project/gameModel", terminal:"model-visible"},
        "simulation-success-failure-cancellation": {route:"simulation", control:"Simulation", actionControl:"Run Simulation", actionControlId:"simulation-run", method:"POST", api:"/api/project/simulations", body:"simulation", poll:"/api/project/simulations/{id}", terminal:"cancelled-and-retry-completed"},
        "simulation-rtp-volatility-features": {route:"simulation", control:"Simulation", actionControl:"Refresh", actionControlId:"simulation-refresh-reports", method:"GET", api:"/api/project/reports", body:"simulation-reports", artifact:"simulation-report", terminal:"report-completed"},
        "outcome-library-report-diff-replay": {route:"exportDeploy", control:"Build/Export", actionControl:"Generate exact outcome library", actionControlId:"outcome-library-generate", actionControlMatch:"prefix", method:"POST", api:"/api/project/outcome-libraries/generate/jobs", body:"outcome-library", poll:"/api/project/outcome-libraries/generate/jobs/{id}", artifact:"outcome-library", terminal:"library-generated"},
        "replay-artifact-success-failure-recovery": {route:"replay", control:"Replay", actionControl:"Run again", actionControlId:"replay-run", method:"POST", api:"/api/project/replays", body:"replay", poll:"/api/project/replays/{id}", artifact:"replay-descriptor", terminal:"failure-and-recovery"},
        "certification-conditional": {route:"certification", control:"Certification", actionControl:"Validate source bundle", actionControlId:"certification-validate-source", method:"POST", api:"/api/project/certification/validate-source", body:"certification", artifact:"certification-preflight", terminal:"conditional-state"},
        "fairness-conditional": {route:"provablyFair", control:"Provably Fair", actionControl:"Compute commitments", actionControlId:"fairness-compute-commitments", method:"POST", api:"/api/project/fairness/configure", body:"fairness", artifact:"fairness-proof", terminal:"conditional-state"},
        "build-export-output-folder": {route:"exportDeploy", control:"Build/Export", actionControl:"Build", actionControlId:"artifact-build-parWorkbook", method:"POST", api:"/api/project/artifacts/build", body:"artifact-build", poll:"/api/project/artifacts/build/{id}", artifact:"artifact-build-output", terminal:"artifact-completed"},
        "import-export-defaults": {route:"overview", control:"Overview", method:"GET", api:"/api/project/context", terminal:"defaults-visible"},
    },
    programmer: {
        "packed-install": {route:"overview", control:"Overview", method:"GET", api:"/api/project/context", cli:"packed CLI install", terminal:"installed-launcher"}, "npx-pokie": {route:"overview", control:"Overview", method:"GET", api:"/api/project/context", cli:"PACKED_NPX_HELP", terminal:"npx-help"}, "recursive-help": {route:"overview", control:"Overview", method:"GET", api:"/api/project/context", cli:"packed CLI recursive help", terminal:"help"},
        "create-build-inspect": {route:"exportDeploy", control:"Build/Export", actionControl:"Build", actionControlId:"artifact-build-parWorkbook", method:"POST", api:"/api/project/artifacts/build", body:"artifact-build", poll:"/api/project/artifacts/build/{id}", cli:"packed CLI create", artifact:"artifact-build-output", terminal:"created-and-built"}, "validate-sim-report-diff-replay-serve-wasm": {route:"simulation", control:"Simulation", actionControl:"Run Simulation", actionControlId:"simulation-run", method:"POST", api:"/api/project/simulations", body:"simulation", poll:"/api/project/simulations/{id}", cli:"packed CLI WASM build", artifact:"simulation-report", terminal:"commands-completed"},
        "spaces-invalid-inputs-exit-codes-ci-recovery": {route:"overview", control:"Overview", method:"GET", api:"/api/project/context", cli:"packed CLI invalid-input recovery", terminal:"actionable-exit-code"}, "build-export-output-folder": {route:"exportDeploy", control:"Build/Export", actionControl:"Build", actionControlId:"artifact-build-parWorkbook", method:"POST", api:"/api/project/artifacts/build", body:"artifact-build", poll:"/api/project/artifacts/build/{id}", cli:"packed CLI PAR build", artifact:"artifact-build-output", terminal:"output-written"},
    },
    producer: {"product-framing": {route:"overview", control:"Overview", method:"GET", api:"/api/project/context", terminal:"project-context"}, "end-to-end-navigation": {route:"play", control:"Play", method:"GET", api:"/api/project/context", terminal:"navigation-visible"}, trust: {route:"certification", control:"Certification", actionControl:"Validate source bundle", actionControlId:"certification-validate-source", method:"POST", api:"/api/project/certification/validate-source", body:"certification", terminal:"trust-state"}},
    "ui-ux": {"onboarding-terminology-forms-progress": {route:"overview", control:"Overview", method:"GET", api:"/api/project/context", terminal:"labels-visible"}, "reload-reconnect-recovery-cancellation-project-switch": {route:"simulation", control:"Simulation", actionControl:"Run Simulation", actionControlId:"simulation-run", method:"POST", api:"/api/project/simulations", body:"simulation", terminal:"recovered"}, "keyboard-responsive-accessibility": {route:"overview", control:"Overview", method:"GET", api:"/api/project/context", terminal:"keyboard-visible"}},
    "graphic-designer": {"hierarchy-typography-spacing-density-controls-finish": {route:"overview", control:"Overview", method:"GET", api:"/api/project/context", terminal:"rendered-finish"}},
};
// Recovery controls are rendered operations too. They are deliberately
// distinct from editable submissions because Cancel/Retry acts on an
// existing durable request rather than a form the person is submitting.
export const P805_RENDERED_TRANSACTION_STATE_CLASSES = ["navigation", "read-only-operation", "editable-submission", "recovery-operation"];

/**
 * Accept only the transaction class published by a rendered lifecycle
 * control/result.  This deliberately does not infer a class from the audit
 * contract: an endpoint changing from a form submission to a refresh (or the
 * reverse) must be visible in the product DOM before a tuple can be accepted.
 */
export function p805TransactionStateClass(value) {
    const stateClass = typeof value === "string" ? value : value?.transactionState ?? value?.stateClass;
    return P805_RENDERED_TRANSACTION_STATE_CLASSES.includes(stateClass) ? stateClass : undefined;
}
// The packed browser runner deliberately uses this state table rather than a
// generic "find a label and press Enter" helper.  A state is the public
// screen the person can see, its stable accessible control identity, and the
// rendered result that must be present after the browser-owned request has
// settled.  Keeping this beside the evidence contract makes additions fail
// closed: a new persona observation has no executable UI path until it names
// a concrete screen state.
export const P805_SCREEN_CONTROL_STATES = {
    overview: {region: "project-dashboard-heading", navigationControl:"Overview", navigationControlId:"project-tab:overview", result: "Overview"},
    gameModel: {region: "project-dashboard-heading", navigationControl:"Game Model", navigationControlId:"project-tab:gameModel", result: "Game Model"},
    play: {region: "project-dashboard-heading", navigationControl:"Play", navigationControlId:"project-tab:play", result: "Play"},
    simulation: {region: "project-dashboard-heading", navigationControl:"Simulation", navigationControlId:"project-tab:simulation", result: "Simulation"},
    replay: {region: "project-dashboard-heading", navigationControl:"Replay", navigationControlId:"project-tab:replay", result: "Replay"},
    exportDeploy: {region: "project-dashboard-heading", navigationControl:"Build/Export", navigationControlId:"project-tab:exportDeploy", result: "Build"},
    certification: {region: "project-dashboard-heading", navigationControl:"Certification", navigationControlId:"project-tab:certification", result: "Certification"},
    provablyFair: {region: "project-dashboard-heading", navigationControl:"Provably Fair", navigationControlId:"project-tab:provablyFair", result: "Provably Fair"},
};
const RECORDS = ["PROVENANCE.json", "initial-audits.json", "frozen-findings.json", "finding-register.json", "regressions.json", "retests.json", "manifest.json", "closeout.json"];
const BLOCKING = (finding) => finding.severity === "P0" || finding.severity === "P1" || (finding.severity === "P2" && finding.material === true);
const sha = (value) => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
const commit = (value) => typeof value === "string" && /^[a-f0-9]{40}$/i.test(value);
const iso = (value) => typeof value === "string" && !Number.isNaN(Date.parse(value)) && /^\d{4}-\d{2}-\d{2}T/.test(value);
const digest = (contents) => createHash("sha256").update(contents).digest("hex");
// The external anchor is a locator for the frozen register; excluding that
// locator prevents an impossible self-referential digest while preserving all
// frozen finding fields in the anchored canonical payload.
const frozenDigest = (frozen) => {
    const {externalAnchor, ...payload} = frozen;
    return digest(`${JSON.stringify(payload, null, 2)}\n`);
};
const closeoutDigest = (closeout) => {
    const {externalAnchor, ...payload} = closeout;
    return digest(`${JSON.stringify(payload, null, 2)}\n`);
};
const fail = (message) => { throw new Error(`P8-05 product-readiness evidence is invalid: ${message}`); };
const relative = (value) => typeof value === "string" && value.length > 0 && !path.isAbsolute(value) && !value.split(/[\\/]+/).includes("..");
const unique = (items, label, property = "id") => {
    const values = items.map((item) => item?.[property]);
    if (values.some((value) => typeof value !== "string" || !value) || new Set(values).size !== values.length) fail(`${label} has a duplicate or missing ${property}`);
};
const candidate = (record, expected, label) => {
    if (!record || record.candidateId !== expected.candidateId || record.candidatePackageSha256 !== expected.candidatePackageSha256) fail(`${label} is not bound to the exact candidate and package digest`);
};
const noSecrets = (contents) => !/(?:authorization:\s*bearer|node_auth_token|pc20_drive_access_token|password\s*=|api[_-]?key\s*[=:])/i.test(contents);

async function json(directory, name) {
    const target = path.join(directory, name);
    if (!existsSync(target)) fail(`missing ${name}`);
    let contents;
    try { contents = await readFile(target, "utf8"); } catch { fail(`${name} cannot be read`); }
    try { return {contents, value:JSON.parse(contents)}; } catch { fail(`${name} is not JSON`); }
}
async function externalJson(target, label) {
    let contents;
    try { contents = await readFile(target, "utf8"); } catch { fail(`${label} cannot be read`); }
    try { return {contents, value:JSON.parse(contents)}; } catch { fail(`${label} is not JSON`); }
}

async function boundedEvidence(directory, record, expected, label, {after, before, used} = {}) {
    if (!record || typeof record.evidenceId !== "string" || !record.evidenceId || !relative(record.path) || !sha(record.sha256) || !Number.isSafeInteger(record.sizeBytes) || record.sizeBytes < 1 || record.sizeBytes > 5 * 1024 * 1024 || !iso(record.capturedAt) || typeof record.kind !== "string" || !record.kind || !Array.isArray(record.observationIds) || !record.observationIds.every((value) => typeof value === "string" && value)) fail(`${label} lacks bounded evidence metadata`);
    candidate(record, expected, `${label} evidence`);
    if ((after && Date.parse(record.capturedAt) < Date.parse(after)) || (before && Date.parse(record.capturedAt) > Date.parse(before))) fail(`${label} evidence timestamp is outside its audit`);
    if (used?.has(record.evidenceId)) fail(`${label} reuses evidence ${record.evidenceId}`);
    used?.add(record.evidenceId);
    const target = path.resolve(directory, record.path);
    if (!target.startsWith(`${path.resolve(directory)}${path.sep}`)) fail(`${label} evidence escapes the campaign directory`);
    let contents, file;
    try { [contents, file] = await Promise.all([readFile(target), stat(target)]); } catch { fail(`${label} evidence is missing: ${record.path}`); }
    if (contents.length !== record.sizeBytes || file.size !== record.sizeBytes || digest(contents) !== record.sha256) fail(`${label} evidence digest or size differs from its record`);
    if (!noSecrets(contents.toString("utf8"))) fail(`${label} evidence contains a credential-like value`);
    return contents;
}

/**
 * A tuple is accepted only from the browser-captured transaction boundary
 * produced by the rendered control itself.  This is deliberately distinct
 * from the runtime page-state evidence used for recovery diagnostics: a
 * route, a similarly-shaped API response, or a Node-side request cannot
 * stand in for a person activating a live DOM lifecycle control.
 */
function liveDomTransaction(contents, observation, persona, label) {
    let page;
    try { page = JSON.parse(contents.toString("utf8")); } catch { fail(`${label} is not parsed live-DOM transaction evidence`); }
    const pointer = page.transaction?.pointerActivations?.[0], keyboard = page.transaction?.keyboardActivations?.[0];
    const postTransition = page.transaction?.postTransitionRenderedState;
    const replacementStateIsBound = postTransition?.controlState === "retained"
        ? postTransition.currentControlId === page.control?.id && postTransition.capturedControlConnected === true
        : postTransition?.controlState === "replaced"
            ? postTransition.currentControlId === page.control?.id && postTransition.capturedControlConnected === false
            : postTransition?.controlState === "removed" && postTransition.currentControlId === null && postTransition.capturedControlConnected === false;
    const renderedActivation = page.interaction?.activation === "pointer"
        ? page.interaction.pointerActivated === true && page.transaction?.pointerActivations?.length === 1 && pointer?.kind === "pointer" && pointer.count === 1 && pointer.controlId === page.control?.id && pointer.capturedControlId === page.control?.id && typeof pointer.captureKey === "string" && pointer.captureKey.length > 0 && pointer.preDispatchFocus?.controlId === page.control?.id && pointer.preDispatchFocus?.native === true && pointer.hitTest?.capturedControlId === page.control?.id && pointer.hitTest?.matchesCapturedControl === true && pointer.dispatch?.kind === "native-pointer" && pointer.dispatch?.pressed === true && pointer.dispatch?.released === true && postTransition?.capturedControlId === page.control?.id && postTransition.captureKey === pointer.captureKey && replacementStateIsBound && postTransition.requestId === page.request?.browserRequestId && postTransition.resultSha256 === page.terminal?.resultSha256 && postTransition.renderedTerminal === true
        : page.interaction?.activation === "keyboard" && page.interaction.keyboardFocused === true && page.interaction.keyboardActivated === true && page.transaction?.keyboardActivations?.length === 1 && keyboard?.kind === "keyboard" && keyboard?.nativeFocus === true && keyboard?.preDispatchFocus?.controlId === page.control?.id && keyboard?.preDispatchFocus?.native === true && keyboard?.count === 1 && keyboard.controlId === page.control?.id;
    const contract = P805_WORKFLOW_CONTRACTS[persona]?.[observation];
    const screenState = contract && P805_SCREEN_CONTROL_STATES[contract.route];
    const modern = page.request?.method !== undefined;
    const activatedControl = contract?.actionControl ?? contract?.control;
    const operation = contract?.operation ?? contract?.body;
    const expectedLifecycle = operation === undefined ? {kind: "navigation", value: contract?.route} : {kind: "operation", value:operation};
    const matchedControl = page.interaction?.matchedLabel;
    const correctRenderedControl = contract?.actionControlMatch === "prefix" ? typeof matchedControl === "string" && matchedControl.startsWith(activatedControl) : matchedControl === undefined || matchedControl === activatedControl;
    const terminalResult = page.terminal?.result;
    const transactionState = p805TransactionStateClass(page.transaction);
    const stateClassMatchesRequest = expectedLifecycle.kind === "navigation"
        ? transactionState === "navigation"
        : transactionState === "editable-submission"
            ? contract?.method !== "GET"
            : transactionState === "read-only-operation" && contract?.method === "GET";
    const configuredForm = page.transaction?.formState;
    const validRenderedForm = transactionState !== "editable-submission" ? configuredForm === undefined : (
        configuredForm?.operation === operation &&
        configuredForm.capturedBeforeSubmission === true &&
        configuredForm.scope?.identityAttribute === "data-pokie-lifecycle-form" &&
        configuredForm.scope?.value === operation &&
        typeof configuredForm.scope?.tagName === "string" && configuredForm.scope.tagName.length > 0 &&
        configuredForm.actionControl?.stableControlId === page.interaction?.stableControlId &&
        configuredForm.actionControl?.identityAttribute === "id" &&
        configuredForm.actionControl?.visible === true &&
        typeof configuredForm.actionControl?.accessibleName === "string" && configuredForm.actionControl.accessibleName.trim().length > 0 &&
        configuredForm.actionControl?.validation?.valid === true &&
        typeof configuredForm.actionControl?.validation?.message === "string" &&
        Array.isArray(configuredForm.fields) && configuredForm.fields.length > 0 &&
        configuredForm.fields.every((field) => typeof field?.stableControlId === "string" && field.stableControlId.length > 0 && field.identityAttribute === "id" && field.visible === true && typeof field.accessibleName === "string" && field.accessibleName.trim().length > 0 && typeof field.value === "string" && typeof field.disabled === "boolean" && typeof field.required === "boolean" && field.disabled === false && field.validation?.valid === true && typeof field.validation.message === "string")
    );
    // `expectedOutcome` is a contract label, not evidence.  The saved result
    // must be the exact response/polled job object and it must itself be a
    // terminal success.  This prevents a collector from recording a 202,
    // empty list, or HTTP-200 failure as a completed persona operation.
    const resultStatus = terminalResult?.status;
    const terminalSucceeded = terminalResult && ["completed", "success", "ok", "valid", "partial"].includes(resultStatus ?? page.terminal?.status);
    const terminalDigest = terminalResult === undefined ? undefined : digest(JSON.stringify(terminalResult));
    const nonEmptyReport = contract?.terminal === "report-completed" ? Array.isArray(terminalResult) && terminalResult.length > 0 : true;
    // An id merely says that an operation was accepted.  A persona can only
    // assess an artifact workflow after the rendered terminal result names
    // an output that can be opened or downloaded.
    const requiresPublishedArtifact = ["round-trip", "artifact-completed", "library-generated", "report-completed", "output-written"].includes(contract?.terminal);
    // Some public list endpoints intentionally return a compact summary with
    // no transport path.  The rendered result must then expose the concrete
    // Open/download control; accepting a list merely because it is nonempty
    // would again turn a route-level refresh into a claimed output.
    const renderedArtifact = page.renderedTerminal?.lifecycle?.artifact;
    const publishedArtifact = !requiresPublishedArtifact ? true : (
        typeof terminalResult?.outputPath === "string" ||
        typeof terminalResult?.downloadPath === "string" ||
        typeof terminalResult?.path === "string" ||
        (Array.isArray(terminalResult?.outputs) && terminalResult.outputs.some((output) => typeof output?.path === "string" || typeof output?.downloadPath === "string")) ||
        (Array.isArray(terminalResult) && terminalResult.some((item) => typeof item?.path === "string" || typeof item?.downloadPath === "string")) ||
        (renderedArtifact?.name === contract?.artifact && typeof renderedArtifact.accessibleName === "string" && renderedArtifact.accessibleName.trim().length > 0)
    );
    // Write-producing controls are only observations after the page has
    // polled the durable record.  A 202 or a 200 wrapper is an acceptance,
    // not the completed operation a persona is evaluating.
    const requiresTerminalPoll = typeof contract?.poll === "string";
    if (page.precondition?.disabledExplanation !== null) fail(`${label} does not record the rendered disabled-control explanation for ${observation}`);
    const terminalControlIsBound = page.renderedTerminal?.lifecycle?.controlId === page.control?.id;
    const terminalStateIsBound = page.renderedTerminal?.lifecycle?.stateClass === transactionState;
    const terminalJobIsBound = !requiresTerminalPoll || page.renderedTerminal?.lifecycle?.jobId === page.terminal?.jobId;
    const outcomeLibraryTransaction = contract?.body !== "outcome-library" || (
        page.transaction?.preflight?.state === "ready" &&
        page.transaction.preflight?.status === "ok" &&
        page.transaction.preflight?.controlId === "outcome-library-generate" &&
        page.transaction.preflight?.cardLabel === "Outcome library generator" &&
        page.transaction.preflight?.enabled === true &&
        page.transaction.preflight?.disabled === false &&
        page.renderedTerminal?.lifecycle?.operation === "outcome-library" &&
        page.renderedTerminal.lifecycle?.receipt === "durable-terminal" &&
        page.renderedTerminal.lifecycle?.durableJobId === page.terminal?.jobId &&
        page.renderedTerminal.lifecycle?.durableStatus === page.terminal?.status &&
        typeof page.renderedTerminal.lifecycle?.artifact?.outputPath === "string" &&
        page.renderedTerminal.lifecycle.artifact.outputPath.length > 0
    );
    if (!outcomeLibraryTransaction) fail(`${label} Outcome Library control, preflight, or durable result is missing, loading, unsupported, disabled, or stale`);
    if (!contract || !screenState || !transactionState || !stateClassMatchesRequest || !validRenderedForm || page.kind !== "p8-05-live-dom-transaction" || page.operation !== observation || page.expectedOutcome !== contract.terminal || typeof page.route !== "string" || !page.route.endsWith(`/${contract.route}`) || !["wide", "compact", "narrow"].includes(page.viewport) || page.screen?.name !== contract.route || page.screen?.region !== screenState.region || page.screen?.navigationControl !== screenState.navigationControl || page.screen?.terminalText !== screenState.result || typeof page.control?.id !== "string" || !page.control.id || page.interaction?.stableControlId !== page.control.id || page.interaction?.identityAttribute !== "id" || page.interaction?.transactionState !== transactionState || page.interaction?.lifecycle?.kind !== expectedLifecycle.kind || page.interaction?.lifecycle?.value !== expectedLifecycle.value || typeof page.control?.role !== "string" || !page.control.role || page.control?.accessibleName !== matchedControl || page.control?.enabled !== true || page.precondition?.enabled !== true || page.precondition?.disabled !== false || page.precondition?.accessibleName !== matchedControl || page.precondition?.region !== screenState.region || !page.interaction || page.interaction.control !== activatedControl || !correctRenderedControl || !renderedActivation || page.transaction?.stateClass !== transactionState || page.transaction?.control?.stableControlId !== page.control?.id || page.transaction.control?.identityAttribute !== "id" || page.transaction.control?.accessibleName !== matchedControl || page.transaction.control?.enabled !== true || page.transaction.control?.disabled !== false || page.transaction.control?.disabledExplanation !== null || page.transaction.confirmation?.required !== false || page.transaction.confirmation?.state !== "not-required" || page.contextRevalidation?.method !== "GET" || page.contextRevalidation?.path !== "/api/project/context" || !sha(page.contextRevalidation?.responseSha256) || !["loaded", "outcome-source", "artifact"].includes(page.contextRevalidation?.projectStatus) || page.contextRevalidation?.completedBeforeSelection !== true || typeof page.contextRevalidation?.browserRequestId !== "string" || !page.contextRevalidation.browserRequestId || !Number.isInteger(page.contextRevalidation.status) || page.contextRevalidation.status < 200 || page.contextRevalidation.status >= 400 || !page.workflow || page.workflow.persona !== persona || page.workflow.source !== "rendered-control" || page.workflow.transactionState !== transactionState || page.workflow.expectedApi !== contract.api || (modern && (page.workflow.expectedMethod !== contract.method || page.workflow.expectedBodyKind !== (contract.body ?? null))) || page.workflow.expectedArtifact !== (contract.artifact ?? null) || page.workflow.terminal !== contract.terminal || !page.request || page.request.path !== contract.api || (modern && (page.request.method !== contract.method || page.request.bodyKind !== (contract.body ?? null) || !sha(page.request.bodySha256) || !sha(page.request.responseSha256) || typeof page.request.browserRequestId !== "string" || page.request.initiator !== "rendered-control" || !page.terminal || !["response", "rendered-poll"].includes(page.terminal.source) || (requiresTerminalPoll && (page.terminal.source !== "rendered-poll" || typeof page.terminal.jobId !== "string" || !page.terminal.jobId || page.terminal.pollPath !== contract.poll.replace("{id}", encodeURIComponent(page.terminal.jobId)) || typeof page.terminal.browserRequestId !== "string" || !page.terminal.browserRequestId)) || (!requiresTerminalPoll && page.terminal.source !== "response") || !["completed", "success", "ok", "valid", "partial"].includes(page.terminal.status) || page.terminal.complete !== true || !sha(page.terminal.resultSha256) || page.terminal.resultSha256 !== terminalDigest || !Object.hasOwn(page.terminal, "result") || !terminalSucceeded || !nonEmptyReport || !publishedArtifact || ["failed", "error", "cancelled", "incomplete", "load-error", "invalid"].includes(resultStatus))) || !page.renderedTerminal || page.renderedTerminal.state !== "rendered" || page.renderedTerminal.changedAfterRequest !== true || page.renderedTerminal.observedAfterRequestId !== page.request.browserRequestId || page.renderedTerminal.resultSha256 !== terminalDigest || !terminalControlIsBound || !terminalStateIsBound || !terminalJobIsBound || !sha(page.renderedTerminal.beforeTextSha256) || !sha(page.renderedTerminal.textSha256) || page.renderedTerminal.beforeTextSha256 === page.renderedTerminal.textSha256 || typeof page.renderedTerminal.text !== "string" || page.renderedTerminal.text.trim().length < 3 || page.renderedTerminal.lifecycle?.role === undefined || typeof page.renderedTerminal.lifecycle.terminal !== "string" || !page.renderedTerminal.lifecycle.terminal || typeof page.renderedTerminal.lifecycle.text !== "string" || page.renderedTerminal.lifecycle.text.trim().length < 3 || (contract.body !== undefined && contract.artifact !== undefined && (page.renderedTerminal.lifecycle.artifact?.name !== contract.artifact || typeof page.renderedTerminal.lifecycle.artifact?.accessibleName !== "string" || !page.renderedTerminal.lifecycle.artifact.accessibleName)) || !iso(page.renderedTerminal.observedAt) || !Number.isInteger(page.request.status) || page.request.status < 200 || page.request.status >= 400 || !page.state || typeof page.state.text !== "string" || !Array.isArray(page.state.controls) || page.state.overflow !== false || !Array.isArray(page.state.accessibility?.namedRegions) || page.state.accessibility.namedRegions.length === 0 || page.state.accessibility.visibleFocus !== true || page.state.accessibility.unexplainedDisabledControls !== 0) fail(`${label} does not prove a DOM-derived state-class transaction, screen-specific public control, request body, API, rendered terminal result, artifact, and terminal outcome for ${observation}`);
    return page;
}

async function validateAuditEvidence(directory, audit, expected, label, used) {
    const evidenceById = new Map();
    for (const item of audit.evidence) evidenceById.set(item.evidenceId, {item, contents:await boundedEvidence(directory, item, expected, label, {after:audit.startedAt, before:audit.endedAt, used})});
    const one = (kind) => [...evidenceById.values()].find((entry) => entry.item.kind === kind)?.contents;
    const text = (kind) => one(kind)?.toString("utf8") ?? "";
    let api, browser, timing, artifact;
    try { api = JSON.parse(text("api-log")); browser = JSON.parse(text("browser-log")); timing = JSON.parse(text("timing")); artifact = JSON.parse(text("artifact")); } catch { fail(`${label} has unparsed machine workflow evidence`); }
    const claimedBrowserRequestIds = new Map();
    const claimBrowserRequestId = (browserRequestId, owner) => {
        if (typeof browserRequestId !== "string" || !browserRequestId) fail(`${label} ${owner} lacks a browser request identity`);
        const previous = claimedBrowserRequestIds.get(browserRequestId);
        if (previous) fail(`${label} reuses browser request ${browserRequestId} for ${owner} after ${previous}`);
        claimedBrowserRequestIds.set(browserRequestId, owner);
    };
    const apiByBrowserRequestId = (browserRequestId, owner) => {
        const records = api?.filter?.((entry) => entry?.browserRequestId === browserRequestId) ?? [];
        if (records.length !== 1) fail(`${label} ${owner} does not resolve exactly one API record by browser request identity`);
        return records[0];
    };
    const auditTuples = audit?.tuple === undefined
        ? (audit.workflowPersonas ?? [audit.persona]).flatMap((persona) => P805_REQUIRED_OBSERVATIONS[persona].flatMap((observation) => ["wide", "compact", "narrow"].map((viewport) => ({persona, observation, viewport}))))
        : [audit.tuple];
    // The packed combined run writes one audit headed by its primary persona,
    // but it must not let that heading hide weaker records for the other four
    // personas.  Validate each saved screen state at the exact breakpoint
    // where its action ran; a generic project screenshot or a wide-only state
    // is not evidence for compact and narrow workflows.
    for (const {persona, observation, viewport} of auditTuples) {
        const action = audit.rendered.actions.find((value) => (value.persona ?? audit.persona) === persona && value.observation === observation && value.viewport === viewport);
        const evidenceId = action?.evidenceId, transactionEvidence = evidenceById.get(evidenceId);
        if (!transactionEvidence || transactionEvidence.item.kind !== "live-dom-transaction" || !transactionEvidence.item.observationIds.includes(observation) || !action) fail(`${label} lacks ${persona} ${viewport} live-DOM transaction evidence for ${observation}`);
        const page = liveDomTransaction(transactionEvidence.contents, observation, persona, `${label} ${persona} ${viewport} ${observation}`);
        if (page.viewport !== viewport) fail(`${label} ${persona} ${observation} reuses ${page.viewport} live-DOM transaction for ${viewport}`);
        const requestOwner = `${persona} ${viewport} ${observation} action`, contextOwner = `${persona} ${viewport} ${observation} context`, sharedNavigationContext = page.contextRevalidation.browserRequestId === page.request.browserRequestId;
        claimBrowserRequestId(page.request.browserRequestId, requestOwner);
        if (!sharedNavigationContext) claimBrowserRequestId(page.contextRevalidation.browserRequestId, contextOwner);
        if (page.request.browserRequestId === page.contextRevalidation.browserRequestId) fail(`${label} ${persona} ${viewport} ${observation} substitutes its action request for context`);
        // Select the machine record once, by Chromium's request identity,
        // before comparing any semantic fields.  Method/path/body equality is
        // corroboration only: it must never be the lookup that lets an
        // otherwise equivalent request from another viewport impersonate this
        // rendered action.
        const request = apiByBrowserRequestId(page.request.browserRequestId, requestOwner);
        let terminalPoll;
        const pollOwner = `${persona} ${viewport} ${observation} terminal poll`;
        if (page.terminal.source === "rendered-poll") {
            claimBrowserRequestId(page.terminal.browserRequestId, pollOwner);
            if (page.terminal.browserRequestId === page.request.browserRequestId || page.terminal.browserRequestId === page.contextRevalidation.browserRequestId) fail(`${label} ${persona} ${viewport} ${observation} substitutes a request identity for its terminal poll`);
            terminalPoll = apiByBrowserRequestId(page.terminal.browserRequestId, pollOwner);
        }
        if (!request || request.observation !== observation || request.initiator !== "rendered-control" || request.browserRequestId !== page.request.browserRequestId || request.method !== page.request.method || request.path !== page.request.path || request.bodySha256 !== page.request.bodySha256 || request.responseSha256 !== page.request.responseSha256 || request.status !== page.request.status || (page.terminal.source === "response" && JSON.stringify(request.payload) !== JSON.stringify(page.terminal.result)) || (page.terminal.source === "rendered-poll" && (!page.terminal.jobId || terminalPoll?.path !== page.terminal.pollPath || terminalPoll?.payload?.status !== page.terminal.status || JSON.stringify(terminalPoll?.payload) !== JSON.stringify(page.terminal.result)))) fail(`${label} ${persona} ${viewport} ${observation} live-DOM terminal result is not correlated to its captured browser request and terminal result`);
        const browserRequest = browser?.find?.((event) => event?.method === "Network.requestWillBeSent" && event.params?.requestId === page.request.browserRequestId && (() => {
            try { return new URL(event.params.request?.url).pathname === page.request.path && event.params.request?.method === page.request.method && digest(event.params.request?.postData ?? "") === page.request.bodySha256; } catch { return false; }
        })());
        const browserResponse = browser?.find?.((event) => event?.method === "Network.responseReceived" && event.params?.requestId === page.request.browserRequestId && event.params?.response?.status === page.request.status);
        if (!browserRequest || !browserResponse) fail(`${label} ${persona} ${viewport} ${observation} does not bind its live-DOM transaction to the captured browser request and response`);
        const contextRequest = apiByBrowserRequestId(page.contextRevalidation.browserRequestId, sharedNavigationContext ? requestOwner : contextOwner);
        const browserContextRequest = browser?.find?.((event) => event?.method === "Network.requestWillBeSent" && event.params?.requestId === page.contextRevalidation.browserRequestId && (() => { try { return new URL(event.params.request?.url).pathname === "/api/project/context" && event.params.request?.method === "GET"; } catch { return false; } })());
        const browserContextResponse = browser?.find?.((event) => event?.method === "Network.responseReceived" && event.params?.requestId === page.contextRevalidation.browserRequestId && event.params?.response?.status === page.contextRevalidation.status);
        if (!contextRequest || !browserContextRequest || !browserContextResponse) fail(`${label} ${persona} ${viewport} ${observation} does not bind its selected workflow to a fresh rendered project-context revalidation`);
        if (page.terminal.source === "rendered-poll") {
            const browserPoll = browser?.find?.((event) => event?.method === "Network.requestWillBeSent" && event.params?.requestId === terminalPoll?.browserRequestId);
            if (!terminalPoll || terminalPoll.initiator !== "rendered-poll" || terminalPoll.path !== page.terminal.pollPath || terminalPoll.payload?.status !== page.terminal.status || JSON.stringify(terminalPoll.payload) !== JSON.stringify(page.terminal.result) || !browserPoll) fail(`${label} ${persona} ${viewport} ${observation} terminal job is not bound to its browser-owned poll identity`);
        }
        const screenshot = evidenceById.get(action.screenshotEvidenceId);
        if (!screenshot || screenshot.item.kind !== "screenshot" || !screenshot.item.observationIds.includes(observation)) fail(`${label} lacks linked ${persona} ${viewport} screenshot evidence for ${observation}`);
    }
    // The aggregate must be a digest-authenticated view of immutable chunks,
    // not another self-asserted summary.  Require one exact action receipt
    // for every persona/observation/viewport tuple and reject even a
    // byte-identical receipt when it is substituted into a different slot.
    const checkpointIds = new Set(), checkpointPaths = new Set(), checkpointActions = new Set();
    for (const receipt of audit.checkpointReceipts ?? []) {
        const actionKey = `${receipt?.persona}/${receipt?.observation}/${receipt?.viewport}`;
        if (!receipt || typeof receipt.receiptId !== "string" || !receipt.receiptId || checkpointIds.has(receipt.receiptId) || checkpointPaths.has(receipt.path) || checkpointActions.has(actionKey) || !relative(receipt.path) || !sha(receipt.sha256) || !Number.isSafeInteger(receipt.sizeBytes) || receipt.sizeBytes < 1 || receipt.sizeBytes > 5 * 1024 * 1024 || !iso(receipt.capturedAt) || Date.parse(receipt.capturedAt) < Date.parse(audit.startedAt) || Date.parse(receipt.capturedAt) > Date.parse(audit.endedAt) || receipt.candidateId !== expected.candidateId || receipt.candidatePackageSha256 !== expected.candidatePackageSha256 || !sha(receipt.actionSha256)) fail(`${label} has a missing, duplicate, stale, cross-candidate, or substituted checkpoint receipt`);
        const target = path.resolve(directory, receipt.path);
        if (!target.startsWith(`${path.resolve(directory)}${path.sep}`)) fail(`${label} checkpoint receipt escapes the campaign directory`);
        let contents, checkpoint;
        try { contents = await readFile(target); checkpoint = JSON.parse(contents.toString("utf8")); } catch { fail(`${label} checkpoint receipt is unreadable`); }
        const action = audit.rendered.actions.find((value) => (value?.persona ?? audit.persona) === receipt.persona && value?.observation === receipt.observation && value?.viewport === receipt.viewport);
        if (contents.length !== receipt.sizeBytes || digest(contents) !== receipt.sha256 || checkpoint?.schemaVersion !== 1 || checkpoint.kind !== "p8-05-packed-workflow-checkpoint" || checkpoint.receiptId !== receipt.receiptId || checkpoint.auditId !== audit.auditId || typeof checkpoint.runNonce !== "string" || !checkpoint.runNonce || checkpoint.sequence !== checkpointPaths.size + 1 || checkpoint.status !== "passed" || checkpoint.capturedAt !== receipt.capturedAt || checkpoint.candidateId !== expected.candidateId || checkpoint.candidatePackageSha256 !== expected.candidatePackageSha256 || checkpoint.phase !== audit.phase || checkpoint.persona !== receipt.persona || checkpoint.observation !== receipt.observation || checkpoint.viewport !== receipt.viewport || !action || receipt.actionSha256 !== digest(JSON.stringify(action)) || JSON.stringify(checkpoint.action) !== JSON.stringify(action)) fail(`${label} checkpoint receipt does not bind its exact DOM action, request, terminal, artifact, timing, accessibility, provenance, and viewport`);
        checkpointIds.add(receipt.receiptId); checkpointPaths.add(receipt.path); checkpointActions.add(actionKey);
    }
    for (const {persona, observation, viewport} of auditTuples) {
        if (!checkpointActions.has(`${persona}/${observation}/${viewport}`)) fail(`${label} lacks a checkpoint receipt for ${persona}/${observation}/${viewport}`);
    }
    if (JSON.stringify(audit.finalResult?.checkpointReceiptSha256s) !== JSON.stringify((audit.checkpointReceipts ?? []).map((receipt) => receipt.sha256))) fail(`${label} final result does not aggregate only its verified checkpoint receipts`);
    const tupleCli = audit.tuple && P805_WORKFLOW_CONTRACTS[audit.tuple.persona][audit.tuple.observation].cli;
    if (!text("cli-transcript").includes("PACKED_INSTALL") || !text("cli-transcript").includes("packed CLI create") || (tupleCli && !text("cli-transcript").includes(tupleCli)) || (!audit.tuple && (!text("cli-transcript").includes("packed CLI WASM run") || !text("cli-transcript").includes("packed CLI serve"))) || !Array.isArray(api) || !api.some((entry) => entry?.path === "/api/health") || !Array.isArray(browser) || JSON.stringify(timing) !== JSON.stringify(audit.timings) || artifact?.candidateId !== expected.candidateId || artifact?.candidatePackageSha256 !== expected.candidatePackageSha256 || artifact?.packedPackageSha256 !== expected.candidatePackageSha256 || artifact?.candidatePackageJsonSha256 !== audit.packageIdentity.candidatePackageJsonSha256 || artifact?.installedPackageJsonSha256 !== audit.packageIdentity.installedPackageJsonSha256 || artifact?.declaredCandidateExecutableSha256 !== audit.packageIdentity.declaredCandidateExecutableSha256 || artifact?.candidateExecutableSha256 !== audit.packageIdentity.candidateExecutableSha256 || artifact?.candidateExecutableSha256 !== artifact?.declaredCandidateExecutableSha256 || artifact?.candidateExecutableReceiptSha256 !== audit.packageIdentity.candidateExecutableReceiptSha256 || artifact?.candidateExecutableReceiptId !== audit.packageIdentity.candidateExecutableReceiptId || artifact?.candidateExecutableReceiptIssuer !== audit.packageIdentity.candidateExecutableReceiptIssuer || artifact?.candidateTreeManifestCandidateId !== expected.candidateId || artifact?.candidateTreeManifestSha256 !== audit.packageIdentity.candidateTreeManifestSha256 || artifact?.candidateTreeObjectId !== audit.packageIdentity.candidateTreeObjectId || !/^[a-f0-9]{40}$/i.test(artifact?.candidateTreeObjectId ?? "") || artifact?.archiveGitHead !== expected.candidateId || audit.packageIdentity.archiveGitHead !== expected.candidateId || !text("reproduction").includes("Persona:") || !text("error")) fail(`${label} workflow evidence does not prove its packed CLI, Studio API, candidate binding, timing, and artifact operations`);
    // Recovery is its own UI/UX tuple in the tuple ledger.  Requiring every
    // independently owned child to replay it would make one child execute
    // several workflows and would erase already accepted receipts after a
    // later recovery failure.
    if (audit.tuple !== undefined) return;
    // Recovery must be a captured runtime result, not a collection of booleans
    // copied into `rendered`.  In particular reports use their own `id` (not a
    // fictional `simulationId`), so the cancellation assertion is only useful
    // when the captured list proves that the cancelled job id is absent.
    let runtime;
    for (const entry of evidenceById.values()) {
        if (entry.item.kind !== "page-state") continue;
        try {
            const value = JSON.parse(entry.contents.toString("utf8"));
            if (value?.kind === "p8-05-runtime-observation") runtime = {value, evidenceId:entry.item.evidenceId};
        } catch { /* tuple transaction parsing above reports its own error */ }
    }
    const recoveryNames = ["reloadReconnect", "projectSwitch", "staleResponseIsolation", "unsavedWorkProtection", "serverRestart"], runtimeRecovery = runtime?.value?.recovery, cancelledId = runtime?.value?.outcomes?.cancelledSimulationId, reports = runtime?.value?.outcomes?.reports, transactions = Object.values(runtime?.value?.transactions ?? {}), transactionValid = (transaction) => transaction?.control?.identityAttribute === "id" && typeof transaction.control.stableControlId === "string" && transaction.control.stableControlId.length > 0 && typeof transaction.control.accessibleName === "string" && transaction.control.accessibleName.length > 0 && transaction.control.enabled === true && transaction.control.disabled === false && transaction.control.disabledExplanation === null && Array.isArray(transaction.keyboardActivations) && transaction.keyboardActivations.length >= 1 && transaction.keyboardActivations.every((activation) => activation?.count === 1 && activation.controlId === transaction.control.stableControlId || activation?.phase === "confirmation" && activation?.count === 1 && activation.controlId === transaction.confirmation?.control?.stableControlId);
    const durableTransactionNames = ["activeReloadStart", "activeReloadCancellation", "simulationSuccess", "replaySuccess", "replayRecovery", "cancellableSimulation", "cooperativeCancellation", "simulationRetry", "restartSimulation"];
    const terminalTransactionValid = (transaction) => transaction?.request?.browserRequestId && typeof transaction.request.method === "string" && typeof transaction.request.path === "string" && Number.isInteger(transaction.request.status) && /^[a-f0-9]{64}$/i.test(transaction.request.responseSha256 ?? "") && transaction?.terminal?.source === "rendered-poll" && typeof transaction.terminal.pollPath === "string" && typeof transaction.terminal.browserRequestId === "string" && transaction.terminal.browserRequestId && transaction.terminal.causedByRequestId === transaction.request.browserRequestId && /^[a-f0-9]{64}$/i.test(transaction.terminal.resultSha256 ?? "");
    const keyboardDomControl = (control) => control?.identityAttribute === "id" && typeof control.stableControlId === "string" && control.stableControlId.length > 0 && typeof control.accessibleName === "string" && control.accessibleName.length > 0 && control.keyboardFocused === true && control.keyboardActivations === 1;
    if (!runtime || recoveryNames.some((name) => runtimeRecovery?.[name] !== true) || transactions.length < 9 || transactions.some((transaction) => !transactionValid(transaction)) || durableTransactionNames.some((name) => !terminalTransactionValid(runtime.value.transactions?.[name])) || runtime.value.transactions?.activeReloadCancellation?.confirmation?.state !== "confirmed" || runtime.value.transactions?.cooperativeCancellation?.confirmation?.state !== "confirmed" || runtime.value.transactions?.activeReloadCancellation?.confirmation?.control?.identityAttribute !== "id" || runtime.value.transactions?.cooperativeCancellation?.confirmation?.control?.identityAttribute !== "id" || typeof runtime.value.reload?.activeJobId !== "string" || runtime.value.reload.activeJobId.length === 0 || runtime.value.reload?.terminal?.status !== "cancelled" || runtime.value.reload?.discoveredAfterReload !== true || !Number.isSafeInteger(runtime.value.staleResponse?.responseCount) || runtime.value.staleResponse.responseCount < 1 || typeof runtime.value.staleResponse?.delayedRequestId !== "string" || runtime.value.staleResponse.completedAfterSwitch !== true || runtime.value.staleResponse?.sourceRoute === runtime.value.staleResponse?.destinationRoute || typeof runtime.value.unsavedWork?.editedControl !== "string" || !runtime.value.unsavedWork.editedControl || !keyboardDomControl(runtime.value.unsavedWork?.editControl) || !keyboardDomControl(runtime.value.unsavedWork?.navigationControl) || !keyboardDomControl(runtime.value.unsavedWork?.cancelControl) || typeof runtime.value.unsavedWork?.protectionText !== "string" || !/unsaved/i.test(runtime.value.unsavedWork.protectionText) || runtime.value.unsavedWork.preserved !== true || typeof runtime.value.restart?.activeJobId !== "string" || !runtime.value.restart.activeJobId || runtime.value.restart.recovered !== true || runtime.value.jobs?.success?.status !== "completed" || runtime.value.jobs?.actionableFailure === undefined || runtime.value.jobs?.cooperativeCancellation?.status !== "cancelled" || typeof runtime.value.jobs?.retryWithoutPartialArtifacts?.id !== "string" || typeof cancelledId !== "string" || !Array.isArray(reports) || reports.some((report) => report?.id === cancelledId) || runtime.value.outcomes?.cancelledReportAbsent !== true || Object.values(audit.rendered.recovery ?? {}).some((value) => value?.evidenceId !== runtime.evidenceId) || Object.values(audit.rendered.jobs ?? {}).some((value) => value?.evidenceId !== runtime.evidenceId)) fail(`${label} lacks captured recovery, terminal-job, and cancelled-report identity evidence`);
    const cleanup = evidenceById.get(audit.cleanup?.evidenceId);
    let cleanupRecord;
    try { cleanupRecord = JSON.parse(cleanup?.contents.toString("utf8") ?? ""); } catch { fail(`${label} cleanup evidence is not machine JSON`); }
    if (cleanup?.item.kind !== "cleanup" || cleanupRecord.kind !== "p8-05-cleanup" || cleanupRecord.processTreeDrained !== true || cleanupRecord.resourcesDrained !== true || cleanupRecord.contextRemoved !== true || !Array.isArray(cleanupRecord.ownership) || !cleanupRecord.ownership.length || cleanupRecord.ownership.some((owner) => !owner?.spawnedAt || !Number.isInteger(owner.pid) || owner.pid < 1 || owner.drain?.processTreeDrained !== true || owner.drain?.resourcesDrained !== true)) fail(`${label} cleanup evidence does not prove spawn-time owned resource drainage`);
}

function validateFinding(value, label) {
    if (!value || typeof value.id !== "string" || !value.id || !["P0", "P1", "P2", "P3"].includes(value.severity) || (value.severity === "P2" && typeof value.material !== "boolean") || !P805_PERSONAS.includes(value.persona) || typeof value.publicSurface !== "string" || !value.publicSurface || typeof value.reproducer !== "string" || !value.reproducer || typeof value.owner !== "string" || !value.owner || !["open", "resolved", "accepted", "blocked", "not-material"].includes(value.status)) fail(`${label} is incomplete`);
}

function frozenFields(initial, later) {
    for (const field of ["id", "severity", "material", "persona", "publicSurface", "reproducer", "owner", "evidence"]) {
        if (JSON.stringify(initial[field]) !== JSON.stringify(later[field])) fail(`finding ${initial.id} rewrites frozen ${field}`);
    }
}

function auditRecord(record, phase, initial, finalCandidate) {
    const timings = record?.timings;
    const timingNames = ["startupMs", "projectCreationMs", "validationMs", "buildMs", "simulationMs", "replayMs", "cancellationMs"];
    const tuple = record?.tuple, tupleIsValid = tuple !== undefined && P805_REQUIRED_TUPLES.some((required) => tupleKey(required) === tupleKey(tuple)), cleanContexts = record?.cleanContexts ?? [record?.cleanContext];
    const expectedObservations = tuple === undefined ? P805_REQUIRED_OBSERVATIONS[record?.persona] : [tuple.observation];
    if (!record || !P805_PERSONAS.includes(record.persona) || record.phase !== phase || typeof record.auditId !== "string" || !record.auditId || !iso(record.startedAt) || !iso(record.endedAt) || Date.parse(record.startedAt) >= Date.parse(record.endedAt) || !Array.isArray(record.observations) || !expectedObservations || expectedObservations.some((required) => !record.observations.includes(required)) || (tuple !== undefined && (!tupleIsValid || record.persona !== tuple.persona || record.observations.length !== 1 || record.observations[0] !== tuple.observation)) || !Array.isArray(cleanContexts) || cleanContexts.length === 0 || cleanContexts.some((context) => !context || !path.isAbsolute(context.workspace) || !path.isAbsolute(context.configurationRoot) || !path.isAbsolute(context.browserProfile) || context.reused !== false) || !Array.isArray(record.evidence) || P805_REQUIRED_EVIDENCE_KINDS.some((kind) => !record.evidence.some((item) => item?.kind === kind)) || !record.observationEvidence || typeof record.observationEvidence !== "object" || !timings || typeof timings !== "object" || timingNames.some((name) => !Number.isSafeInteger(timings[name]) || timings[name] <= 0 || timings[name] > 30 * 60 * 1000) || !record.performance || timingNames.some((name) => !Number.isSafeInteger(record.performance[name]?.budgetMs) || record.performance[name].budgetMs <= 0 || record.performance[name].elapsedMs !== timings[name] || !["within-budget", "regression"].includes(record.performance[name].classification))) fail(`${phase} audit is incomplete for ${record?.persona ?? "unknown persona"}`);
    candidate(record, phase === "initial" ? initial : finalCandidate, `${phase} audit ${record.persona}`);
    validateP805RenderedPersonaAudit(record);
}

/** Campaign records remain readable by the five-persona schema, while the
 * executable collector records its stronger tuple matrix.  Never accept a
 * partial mixture: that would let a later worker failure be hidden behind a
 * persona aggregate. */
export function validateP805AuditMatrix(audits, phase) {
    if (!Array.isArray(audits)) fail(`${phase} audit record is missing audits`);
    if (audits.some((audit) => audit?.tuple !== undefined) || audits.length !== P805_PERSONAS.length) fail(`${phase} audit record must contain exactly five persona aggregates, never direct tuple audits`);
    unique(audits, `${phase} audits`, "persona");
    if (JSON.stringify(audits.map((audit) => audit.persona)) !== JSON.stringify(P805_PERSONAS)) fail(`${phase} audit record has a missing, duplicate, or reordered persona aggregate`);
    for (const audit of audits) {
        // A persona record is a projection only: it is valid solely while it
        // retains every immutable child reference it aggregates.
        const expected = P805_REQUIRED_TUPLES.filter((tuple) => tuple.persona === audit.persona).map(tupleKey), actual = audit.tupleReceipts.map((receipt) => tupleKey(receipt?.tuple));
        if (!Array.isArray(audit.tupleReceipts) || actual.length !== expected.length || JSON.stringify(actual) !== JSON.stringify(expected) || audit.tupleReceipts.some((receipt) => typeof receipt?.auditId !== "string" || !receipt.auditId || !sha(receipt.auditSha256) || !sha(receipt.tupleReceiptSha256) || !sha(receipt.cleanupSha256) || !Array.isArray(receipt.checkpointReceiptSha256s) || receipt.checkpointReceiptSha256s.length !== 1 || !sha(receipt.checkpointReceiptSha256s[0]) || typeof receipt.auditPath !== "string" || typeof receipt.tupleReceiptPath !== "string" || typeof receipt.cleanupPath !== "string")) fail(`${phase} ${audit.persona} aggregate omits an immutable child tuple receipt`);
    }
    return false;
}

function qualityDefects(audit) {
    const measurements = audit.rendered?.measurements ?? {};
    const defects = [
        ["console", measurements.consoleExceptions], ["request", measurements.unhandledRequestFailures],
        ["accessibility", measurements.inaccessiblePrimaryActions], ["disabled-control", measurements.unexplainedDisabledControls],
        ["overflow", measurements.documentOverflow === true ? 1 : 0],
        ["named-region", measurements.namedRegions < 1 ? 1 : 0],
        ["focus", measurements.visibleFocus === true ? 0 : 1],
        ["performance", Object.values(audit.performance ?? {}).some((entry) => entry?.classification === "regression") ? 1 : 0],
    ].filter(([, count]) => count > 0).map(([kind]) => kind);
    if (!Array.isArray(audit.rendered?.defects) || defects.some((kind) => !audit.rendered.defects.some((defect) => defect?.kind === kind && typeof defect.evidenceId === "string" && defect.evidenceId))) fail(`${audit.phase} ${audit.persona} does not retain every measured browser defect as evidence`);
    return defects;
}

/**
 * Validate the full campaign. `expected` is provided by the release
 * controller, never inferred from mutable campaign files.
 */
export async function validateP805ProductReadinessCampaign(directory, expected) {
    const root = path.resolve(directory);
    if (!expected || !commit(expected.candidateId) || !sha(expected.candidatePackageSha256) || !sha(expected.freezeAnchorSha256) || !sha(expected.closeoutAnchorSha256)) fail("verifier-supplied retest candidate, package digest, freeze anchor digest, and closeout anchor digest are required");
    for (const name of RECORDS) if (!existsSync(path.join(root, name))) fail(`missing required campaign record ${name}`);
    const entries = await Promise.all(RECORDS.map((name) => json(root, name)));
    const records = Object.fromEntries(RECORDS.map((name, index) => [name, entries[index].value]));
    const provenance = records["PROVENANCE.json"];
    if (provenance.schemaVersion !== P805_SCHEMA_VERSION || typeof provenance.campaignId !== "string" || !provenance.campaignId || !provenance.cleanRoomAttestation || provenance.cleanRoomAttestation !== "I recorded each initial persona audit before reading prior findings, source, fixes, or prior campaign evidence." || !provenance.initialCandidate || !commit(provenance.initialCandidate.candidateId) || !sha(provenance.initialCandidate.candidatePackageSha256) || !iso(provenance.startedAt)) fail("provenance lacks a clean-room initial candidate attestation");
    const initialCandidate = provenance.initialCandidate;
    const finalCandidate = {candidateId:expected.candidateId, candidatePackageSha256:expected.candidatePackageSha256};
    if (initialCandidate.candidateId === finalCandidate.candidateId) fail("blind retests must use a new candidate after the initial audit");
    const used = new Set(), contexts = new Set();
    const initial = records["initial-audits.json"];
    if (initial.schemaVersion !== P805_SCHEMA_VERSION || initial.campaignId !== provenance.campaignId) fail("initial audit record is not bound to the campaign");
    validateP805AuditMatrix(initial.audits, "initial");
    for (const audit of initial.audits) {
        auditRecord(audit, "initial", initialCandidate, finalCandidate);
        if (Date.parse(audit.startedAt) <= Date.parse(provenance.startedAt)) fail(`initial audit ${audit.persona} predates provenance`);
        for (const context of audit.cleanContexts ?? [audit.cleanContext]) for (const value of Object.values(context)) if (typeof value === "string") { if (contexts.has(value)) fail(`initial audit ${audit.persona} reuses a clean context`); contexts.add(value); }
        await validateAuditEvidence(root, audit, initialCandidate, `initial ${audit.persona}`, used);
    }
    const frozen = records["frozen-findings.json"];
    if (frozen.schemaVersion !== P805_SCHEMA_VERSION || frozen.campaignId !== provenance.campaignId || frozen.candidateId !== initialCandidate.candidateId || frozen.candidatePackageSha256 !== initialCandidate.candidatePackageSha256 || !iso(frozen.frozenAt) || !Array.isArray(frozen.findings)) fail("frozen findings are not tied to the initial candidate");
    if (initial.audits.some((audit) => Date.parse(audit.endedAt) >= Date.parse(frozen.frozenAt))) fail("finding freeze must follow every initial audit");
    if (!frozen.externalAnchor || !path.isAbsolute(frozen.externalAnchor.path) || path.resolve(frozen.externalAnchor.path).startsWith(`${root}${path.sep}`) || frozen.externalAnchor.sha256 !== expected.freezeAnchorSha256 || !iso(frozen.externalAnchor.anchoredAt) || Date.parse(frozen.externalAnchor.anchoredAt) < Date.parse(frozen.frozenAt)) fail("finding freeze lacks the verifier-supplied immutable anchor");
    let anchorContents;
    try { anchorContents = await readFile(frozen.externalAnchor.path, "utf8"); } catch { fail("external finding-freeze anchor is unreadable"); }
    if (digest(anchorContents) !== expected.freezeAnchorSha256) fail("external finding-freeze anchor digest differs from verifier anchor");
    let anchor;
    try { anchor = JSON.parse(anchorContents); } catch { fail("external finding-freeze anchor is not JSON"); }
    if (anchor.kind !== "p8-05-freeze-anchor" || anchor.campaignId !== provenance.campaignId || anchor.candidateId !== initialCandidate.candidateId || anchor.candidatePackageSha256 !== initialCandidate.candidatePackageSha256 || anchor.frozenFindingsSha256 !== frozenDigest(frozen) || anchor.initialAuditsSha256 !== digest(entries[1].contents) || typeof anchor.receiptId !== "string" || !anchor.receiptId || !iso(anchor.anchoredAt) || Date.parse(anchor.anchoredAt) < Date.parse(frozen.frozenAt)) fail("external finding-freeze anchor does not bind the initial audit and frozen register");
    unique(frozen.findings, "frozen findings");
    for (const item of frozen.findings) { validateFinding(item, `frozen finding ${item?.id ?? "unknown"}`); await boundedEvidence(root, item.evidence, initialCandidate, `frozen finding ${item.id}`, {after:provenance.startedAt, before:frozen.frozenAt, used}); }
    for (const audit of initial.audits) for (const defect of qualityDefects(audit)) {
        const measured = audit.rendered.defects.find((value) => value.kind === defect);
        const evidence = audit.evidence.find((item) => item.evidenceId === measured?.evidenceId);
        if (!evidence || !["browser-log", "live-dom-transaction", "page-state", "timing"].includes(evidence.kind) || !frozen.findings.some((finding) => finding.persona === audit.persona && finding.evidence?.evidenceId === measured?.evidenceId && finding.evidence?.sha256 === evidence.sha256 && finding.measurement?.kind === defect && finding.measurement?.evidenceId === measured?.evidenceId && finding.measurement?.sha256 === evidence.sha256)) fail(`initial ${audit.persona} ${defect} defect was not frozen against its measured evidence`);
    }
    const findingRegister = records["finding-register.json"];
    if (findingRegister.schemaVersion !== P805_SCHEMA_VERSION || findingRegister.campaignId !== provenance.campaignId || !Array.isArray(findingRegister.findings)) fail("finding register is incomplete");
    unique(findingRegister.findings, "finding register");
    if (findingRegister.findings.length !== frozen.findings.length) fail("finding register may not add findings after the freeze");
    for (const frozenFinding of frozen.findings) {
        const registered = findingRegister.findings.find((finding) => finding.id === frozenFinding.id);
        if (!registered) fail(`finding register omits frozen finding ${frozenFinding.id}`);
        validateFinding(registered, `finding register ${registered.id}`); frozenFields(frozenFinding, registered);
    }
    const regressions = records["regressions.json"];
    if (regressions.schemaVersion !== P805_SCHEMA_VERSION || regressions.campaignId !== provenance.campaignId || !Array.isArray(regressions.regressions)) fail("regression register is incomplete");
    unique(regressions.regressions, "regressions", "findingId");
    const machineReceipts = new Set();
    for (const finding of findingRegister.findings) {
        validateFinding(finding, `finding register ${finding?.id ?? "unknown"}`);
        if (BLOCKING(finding)) {
            if (finding.status !== "resolved") fail(`release-blocking finding remains ${finding.status}: ${finding.id}`);
            const regression = regressions.regressions.find((item) => item.findingId === finding.id);
            if (!regression || typeof regression.testPath !== "string" || !regression.testPath.startsWith("tests/") || !existsSync(path.join(repositoryRoot, regression.testPath)) || regression.commitId !== finalCandidate.candidateId || regression.candidatePackageSha256 !== finalCandidate.candidatePackageSha256 || regression.result !== "passed" || !iso(regression.verifiedAt) || Date.parse(regression.verifiedAt) < Date.parse(frozen.frozenAt) || !Array.isArray(regression.assertions) || !regression.assertions.length || !regression.machineResultEvidence) fail(`resolved blocking finding ${finding.id} has no focused final-candidate regression`);
            const output = await boundedEvidence(root, regression.machineResultEvidence, finalCandidate, `regression ${finding.id}`, {after:frozen.frozenAt, used});
            let result;
            try { result = JSON.parse(output.toString("utf8")); } catch { fail(`regression ${finding.id} result evidence is not machine JSON`); }
            const {receipt, ...resultPayload} = result;
            if (result.kind !== "p8-05-regression-result" || result.testPath !== regression.testPath || result.candidateId !== finalCandidate.candidateId || result.candidatePackageSha256 !== finalCandidate.candidatePackageSha256 || result.passed !== true || !iso(result.completedAt) || Date.parse(result.completedAt) < Date.parse(regression.verifiedAt) || !receipt || !path.isAbsolute(receipt.path ?? "") || path.resolve(receipt.path).startsWith(`${root}${path.sep}`) || !sha(receipt.sha256)) fail(`regression ${finding.id} result evidence does not prove an independently authenticated machine result`);
            const machineReceipt = await externalJson(receipt.path, `regression ${finding.id} machine receipt`);
            if (machineReceipts.has(receipt.sha256)) fail(`regression ${finding.id} reuses an independently authenticated machine receipt`);
            machineReceipts.add(receipt.sha256);
            const authentication = machineReceipt.value?.authentication;
            if (digest(machineReceipt.contents) !== receipt.sha256 || machineReceipt.value?.kind !== "p8-05-machine-receipt" || typeof machineReceipt.value?.issuer !== "string" || !machineReceipt.value.issuer || typeof machineReceipt.value?.receiptId !== "string" || !machineReceipt.value.receiptId || !authentication || authentication.scheme !== "verifier-owned-digest" || typeof authentication.verifierId !== "string" || !authentication.verifierId || authentication.attestedResultSha256 !== digest(`${JSON.stringify(resultPayload)}\n`) || machineReceipt.value?.candidateId !== finalCandidate.candidateId || machineReceipt.value?.candidatePackageSha256 !== finalCandidate.candidatePackageSha256 || machineReceipt.value?.testPath !== regression.testPath || machineReceipt.value?.passed !== true || machineReceipt.value?.resultSha256 !== digest(`${JSON.stringify(resultPayload)}\n`) || !iso(machineReceipt.value?.completedAt) || Date.parse(machineReceipt.value.completedAt) < Date.parse(result.completedAt)) fail(`regression ${finding.id} machine receipt is not an independent authenticated result`);
        }
    }
    const retests = records["retests.json"];
    if (retests.schemaVersion !== P805_SCHEMA_VERSION || retests.campaignId !== provenance.campaignId || !iso(retests.startedAt)) fail("retest record is not bound to the campaign");
    validateP805AuditMatrix(retests.audits, "retest");
    if (Date.parse(retests.startedAt) <= Date.parse(frozen.frozenAt)) fail("retests started before findings were frozen");
    for (const audit of retests.audits) {
        auditRecord(audit, "retest", initialCandidate, finalCandidate);
        if (qualityDefects(audit).length) fail(`clean retest ${audit.persona} retains a browser quality defect`);
        for (const context of audit.cleanContexts ?? [audit.cleanContext]) for (const value of Object.values(context)) if (typeof value === "string") { if (contexts.has(value)) fail(`retest audit ${audit.persona} reuses a clean context`); contexts.add(value); }
        if (Date.parse(audit.startedAt) < Date.parse(retests.startedAt) || Date.parse(audit.startedAt) <= Date.parse(frozen.frozenAt)) fail(`retest ${audit.persona} predates its declared clean retest start`);
        for (const regression of regressions.regressions) if (regression.commitId === finalCandidate.candidateId && Date.parse(regression.verifiedAt) > Date.parse(audit.startedAt)) fail(`retest ${audit.persona} predates regression verification`);
        await validateAuditEvidence(root, audit, finalCandidate, `retest ${audit.persona}`, used);
    }
    const manifest = records["manifest.json"];
    const manifestRecords = ["PROVENANCE.json", "initial-audits.json", "frozen-findings.json", "finding-register.json", "regressions.json", "retests.json"];
    if (manifest.schemaVersion !== P805_SCHEMA_VERSION || manifest.kind !== "p8-05-immutable-manifest" || manifest.campaignId !== provenance.campaignId || !manifest.records || typeof manifest.records !== "object" || !Array.isArray(manifest.evidence) || !Array.isArray(manifest.cleanupEvidence)) fail("immutable campaign manifest is incomplete");
    for (const name of manifestRecords) if (manifest.records[name] !== digest(entries[RECORDS.indexOf(name)].contents)) fail(`immutable campaign manifest does not bind ${name}`);
    const boundEvidence = new Map();
    for (const audit of [...initial.audits, ...retests.audits]) for (const item of audit.evidence) boundEvidence.set(item.evidenceId, item.sha256);
    for (const finding of frozen.findings) boundEvidence.set(finding.evidence.evidenceId, finding.evidence.sha256);
    for (const regression of regressions.regressions) if (regression.machineResultEvidence) boundEvidence.set(regression.machineResultEvidence.evidenceId, regression.machineResultEvidence.sha256);
    if (manifest.evidence.length !== boundEvidence.size || manifest.evidence.some((item) => !item || boundEvidence.get(item.evidenceId) !== item.sha256)) fail("immutable campaign manifest does not bind the complete evidence index");
    const cleanupEvidence = [...initial.audits, ...retests.audits].map((audit) => audit.cleanup?.evidenceId);
    if (cleanupEvidence.some((id) => typeof id !== "string") || manifest.cleanupEvidence.length !== cleanupEvidence.length || manifest.cleanupEvidence.some((id, index) => id !== cleanupEvidence[index])) fail("immutable campaign manifest does not bind every measured cleanup record");
    const closeout = records["closeout.json"];
    if (closeout.schemaVersion !== P805_SCHEMA_VERSION || closeout.campaignId !== provenance.campaignId || closeout.manifestSha256 !== digest(entries[RECORDS.indexOf("manifest.json")].contents) || !iso(closeout.closedAt) || !Array.isArray(closeout.dispositions) || closeout.dispositions.length !== frozen.findings.length || closeout.releaseReady !== true || !closeout.externalAnchor || !path.isAbsolute(closeout.externalAnchor.path || "") || path.resolve(closeout.externalAnchor.path).startsWith(`${root}${path.sep}`) || closeout.externalAnchor.sha256 !== expected.closeoutAnchorSha256) fail("closeout is incomplete or lacks the verifier-supplied immutable anchor");
    candidate(closeout, finalCandidate, "closeout"); unique(closeout.dispositions, "closeout dispositions", "findingId");
    if (retests.audits.some((audit) => Date.parse(audit.endedAt) >= Date.parse(closeout.closedAt))) fail("closeout must follow every clean retest");
    for (const finding of frozen.findings) {
        const disposition = closeout.dispositions.find((entry) => entry.findingId === finding.id);
        const personaAudit = retests.audits.find((audit) => audit.persona === finding.persona && audit.auditId === disposition?.retestAuditId);
        if (!disposition || disposition.status !== (findingRegister.findings.find((entry) => entry.id === finding.id)?.status) || !personaAudit || typeof disposition.retestEvidenceId !== "string" || !personaAudit.evidence.some((item) => item.evidenceId === disposition.retestEvidenceId)) fail(`closeout lacks verified persona retest disposition for ${finding.id}`);
        if (BLOCKING(finding) && disposition.status !== "resolved") fail(`closeout leaves release-blocking finding ${finding.id} unresolved`);
    }
    if (!closeout.cleanup || closeout.cleanup.noOwnedProcessesRemain !== true || closeout.cleanup.failedOrCancelledArtifactsRemoved !== true) fail("closeout lacks cleanup attestations");
    const closeoutAnchor = await externalJson(closeout.externalAnchor.path, "trusted closeout anchor");
    if (digest(closeoutAnchor.contents) !== expected.closeoutAnchorSha256 || closeoutAnchor.value.kind !== "p8-05-closeout-anchor" || closeoutAnchor.value.campaignId !== provenance.campaignId || closeoutAnchor.value.closeoutSha256 !== closeoutDigest(closeout) || closeoutAnchor.value.manifestSha256 !== closeout.manifestSha256 || !iso(closeoutAnchor.value.anchoredAt) || Date.parse(closeoutAnchor.value.anchoredAt) < Date.parse(closeout.closedAt)) fail("trusted closeout anchor does not bind the completed campaign");
    return {campaignId:provenance.campaignId, candidateId:finalCandidate.candidateId, candidatePackageSha256:finalCandidate.candidatePackageSha256, frozenFindingsSha256:frozenDigest(frozen), closeoutSha256:closeoutDigest(closeout), closedAt:closeout.closedAt, freezeAnchorSha256:expected.freezeAnchorSha256, closeoutAnchorSha256:expected.closeoutAnchorSha256, personas:[...P805_PERSONAS]};
}

function usage() { fail("usage: --campaign-dir <absolute-path> --expected-candidate <40-char-sha> --expected-package-sha256 <sha256> --freeze-anchor-sha256 <sha256> --closeout-anchor-sha256 <sha256>"); }
export async function main(argv = process.argv) {
    const args = argv.slice(2), values = {};
    for (let index = 0; index < args.length; index += 2) { if (!args[index]?.startsWith("--") || typeof args[index + 1] !== "string" || values[args[index]]) usage(); values[args[index]] = args[index + 1]; }
    if (args.length !== 10 || !path.isAbsolute(values["--campaign-dir"] || "") || !values["--expected-candidate"] || !values["--expected-package-sha256"] || !values["--freeze-anchor-sha256"] || !values["--closeout-anchor-sha256"]) usage();
    const result = await validateP805ProductReadinessCampaign(values["--campaign-dir"], {candidateId:values["--expected-candidate"], candidatePackageSha256:values["--expected-package-sha256"], freezeAnchorSha256:values["--freeze-anchor-sha256"], closeoutAnchorSha256:values["--closeout-anchor-sha256"]});
    process.stdout.write(`P805_PRODUCT_READINESS_PASS candidate=${result.candidateId} personas=${result.personas.length}\n`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
