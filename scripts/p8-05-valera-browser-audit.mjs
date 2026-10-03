#!/usr/bin/env node
/** Execute one isolated, packed-CLI and rendered-Studio P8-05 persona audit. */
import {p805OperationPerformance} from "./p8-05-persona-projection.mjs";
import {createHash, randomBytes} from "node:crypto";
import {spawn, spawnSync} from "node:child_process";
import {chmod, link, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile} from "node:fs/promises";
import {existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {createServer} from "node:net";
import path from "node:path";
import process from "node:process";
import {isDeepStrictEqual} from "node:util";
import {fileURLToPath} from "node:url";
import WebSocket from "ws";
import {P805_PERSONAS, P805_REQUIRED_OBSERVATIONS, P805_SCREEN_CONTROL_STATES, P805_WORKFLOW_CONTRACTS, p805TransactionStateClass} from "./p8-05-product-readiness-campaign.mjs";
import {createPc20OwnershipTracker, drainProcessTree, processIdentity, registerPc20OwnedResource} from "./pc-20-release-completion.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Audit workers install only the candidate archive with lifecycle scripts
// disabled.  They must still use the Node installation's real npm entrypoint:
// test-launch command-policy wrappers are deliberately incapable of owning a
// packed-install proof and would turn an otherwise clean child into a false
// spawn failure.
const nativeNpmCommand = () => {
    const npmCli = path.join(path.dirname(path.dirname(process.execPath)), "lib", "node_modules", "npm", "bin", "npm-cli.js");
    return existsSync(npmCli) ? {npm:process.execPath, npmArgs:[npmCli]} : {npm:"npm", npmArgs:[]};
};
const digest = (value) => createHash("sha256").update(value).digest("hex");
const sha = (value) => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
const now = () => new Date().toISOString();
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const fail = (message) => { throw new Error(`P8-05 Valera browser audit is invalid: ${message}`); };
const P805_ACTIVE_JOB_STATUSES = new Set(["queued", "running"]);
const P805_OUTCOME_LIBRARY_ACTIVE_JOB_STATUSES = new Set(["queued", "running", "cancelling", "pending"]);
class OutcomeLibraryTerminalBoundaryError extends Error {
    constructor(kind, details) {
        super(`Outcome Library durable terminal boundary ${kind}: ${JSON.stringify(details)}`);
        this.name = "OutcomeLibraryTerminalBoundaryError";
        this.kind = kind;
        this.details = details;
    }
}
const auditTuples = (audit) => audit?.tuple ? [audit.tuple] : (audit?.workflowPersonas ?? [audit?.persona]).flatMap((persona) => (P805_REQUIRED_OBSERVATIONS[persona] ?? []).flatMap((observation) => ["wide", "compact", "narrow"].map((viewport) => ({persona, observation, viewport}))));
// These observations name several terminal outcomes. Their tuple worker must
// run that whole workflow, not label one representative request as the whole
// scenario. The remaining tuples retain their single-workflow isolation.
const P805_COMPOUND_TUPLE_OBSERVATIONS = new Set([
    "simulation-success-failure-cancellation",
    "outcome-library-report-diff-replay",
    "replay-artifact-success-failure-recovery",
    "reload-reconnect-recovery-cancellation-project-switch",
]);
const tupleRequiresCompleteWorkflow = (tuple) => P805_COMPOUND_TUPLE_OBSERVATIONS.has(tuple?.observation);
const P805_OUTCOME_LIBRARY_COMPOUND_OUTPUTS = [
    {output:"outcome-library-export", command:"packed CLI Outcome Library export"},
    {output:"simulation-report-source", command:"packed CLI simulation report source"},
    {output:"report", command:"packed CLI report"},
    {output:"diff", command:"packed CLI diff"},
    {output:"replay", command:"packed CLI replay"},
];
export const tupleBootstrapContract = (tuple) => [
    {kind:"packed-package-install", purpose:"mandatory-local-bootstrap", publicWorkflow:tuple.observation},
    {kind:"packed-cli-create", purpose:"mandatory-local-bootstrap", publicWorkflow:tuple.observation},
    {kind:"studio-project-create", purpose:"mandatory-local-bootstrap", publicWorkflow:tuple.observation},
    ...(tuple.observation === "simulation-rtp-volatility-features" ? [
        {kind:"studio-simulation-report-source", purpose:"rendered-report-source", publicWorkflow:tuple.observation, output:"simulation-report"},
    ] : []),
    ...(P805_WORKFLOW_CONTRACTS[tuple.persona][tuple.observation].route === "certification" ? [
        {kind:"outcome-library-source-bundle", purpose:"certification-source", publicWorkflow:tuple.observation, output:"outcome-bundle"},
        {kind:"studio-import-outcome-bundle", purpose:"certification-source", publicWorkflow:tuple.observation, output:"outcome-bundle"},
    ] : []),
    ...(P805_WORKFLOW_CONTRACTS[tuple.persona][tuple.observation].route === "provablyFair" ? [
        {kind:"outcome-library-source-bundle", purpose:"fairness-source", publicWorkflow:tuple.observation, output:"outcome-bundle"},
        {kind:"runtime-package", purpose:"fairness-source", publicWorkflow:tuple.observation, output:"runtime-package"},
        {kind:"studio-import-runtime-package", purpose:"fairness-source", publicWorkflow:tuple.observation, output:"runtime-package"},
    ] : []),
    ...(tuple.persona === "mathematician" && tuple.observation === "outcome-library-report-diff-replay" ? P805_OUTCOME_LIBRARY_COMPOUND_OUTPUTS.map(({output, command}) => ({kind:"packed-cli-output", purpose:"compound-mathematician-output", publicWorkflow:tuple.observation, output, command})) : []),
];
export const P805_PUBLIC_HELP_ARGUMENTS = [["--help"], ...["build", "certification", "client", "create", "dev", "diff", "edit", "export", "fairness", "generate", "import", "init", "inspect", "par", "reel", "run", "replay", "report", "sample", "serve", "sim", "validate"].map((command) => [command, "--help"]), ...[["certification", "build"], ["certification", "verify"], ["fairness", "seed-commit"], ["fairness", "commit"], ["fairness", "reveal"], ["fairness", "verify"], ["par", "import"], ["par", "export"], ["reel", "generate"]].map((command) => [...command, "--help"])];
export function hasP805NativeActivation(activation, controlId) {
    if (activation?.count !== 1 || activation.controlId !== controlId) return false;
    if (activation.kind === "keyboard") return activation.nativeFocus === true && activation.preDispatchFocus?.controlId === controlId && activation.preDispatchFocus.native === true
        && activation.dispatch?.kind === "native-keyboard" && activation.dispatch.pressed === true && activation.dispatch.released === true
        && activation.dispatch.keyDownCount === 1 && activation.dispatch.keyUpCount === 1 && ["Enter", " "].includes(activation.dispatch.key)
        && activation.dispatch.focus?.controlId === controlId && activation.dispatch.focus.native === true && activation.dispatch.focus.trusted === true && activation.dispatch.focus.targetMatchesCapturedControl === true;
    return activation.kind === "pointer" && activation.capturedControlId === controlId && typeof activation.captureKey === "string" && activation.captureKey.length > 0
        && activation.preDispatchFocus?.controlId === controlId && activation.preDispatchFocus.native === true
        && activation.hitTest?.capturedControlId === controlId && activation.hitTest.matchesCapturedControl === true
        && activation.dispatch?.kind === "native-pointer" && activation.dispatch.pressed === true && activation.dispatch.released === true
        && activation.dispatch.pointerDownCount === 1 && activation.dispatch.pointerUpCount === 1 && activation.dispatch.clickCount === 1
        && activation.dispatch.eventsTrusted === true && activation.dispatch.targetsMatchCapturedControl === true
        && activation.dispatch.focus?.observedAt === "pre-dispatch" && typeof activation.dispatch.focus.atDispatchNative === "boolean"
        && activation.dispatch.focus?.controlId === controlId && activation.dispatch.focus.native === true && activation.dispatch.focus.trusted === true && activation.dispatch.focus.targetMatchesCapturedControl === true;
}
export function hasP805TransactionActivations(transaction) {
    if (!Array.isArray(transaction?.pointerActivations) || !Array.isArray(transaction?.keyboardActivations)) return false;
    const activations = [...transaction.pointerActivations, ...transaction.keyboardActivations];
    return activations.length === 1 && hasP805NativeActivation(activations[0], transaction.control?.stableControlId)
        && (transaction.confirmation?.required === true
            ? transaction.confirmation.state === "confirmed" && hasP805NativeActivation(transaction.confirmation.activation, transaction.confirmation.control?.stableControlId)
            : transaction.confirmation?.state === "not-required" && transaction.confirmation?.activation === undefined);
}
const hasRenderedActivation = (action, controlId) => {
    const {interaction, transaction} = action ?? {};
    if (!interaction || !hasP805TransactionActivations(transaction)) return false;
    const pointer = transaction?.pointerActivations?.[0];
    if (interaction.activation === "pointer") {
        const postTransition = transaction?.postTransitionRenderedState;
        const replacementStateIsBound = postTransition?.controlState === "retained"
            ? postTransition.currentControlId === controlId && postTransition.capturedControlConnected === true
            : postTransition?.controlState === "replaced"
                ? postTransition.currentControlId === controlId && postTransition.capturedControlConnected === false
                : postTransition?.controlState === "removed" && postTransition.currentControlId === null && postTransition.capturedControlConnected === false;
        const preservedPreDispatchEvidence = postTransition?.preDispatchEvidence;
        return interaction.pointerActivated === true && transaction?.keyboardActivations?.length === 0 && transaction?.pointerActivations?.length === 1 && pointer?.kind === "pointer" && pointer.count === 1 && pointer.controlId === controlId && pointer.capturedControlId === controlId && typeof pointer.captureKey === "string" && pointer.captureKey.length > 0 && pointer.preDispatchFocus?.controlId === controlId && pointer.preDispatchFocus?.native === true && pointer.hitTest?.capturedControlId === controlId && pointer.hitTest?.matchesCapturedControl === true && pointer.dispatch?.kind === "native-pointer" && pointer.dispatch?.pressed === true && pointer.dispatch?.released === true && pointer.dispatch?.focus?.controlId === controlId && pointer.dispatch.focus?.native === true && pointer.dispatch.focus?.targetMatchesCapturedControl === true && postTransition?.capturedControlId === controlId && postTransition.captureKey === pointer.captureKey && preservedPreDispatchEvidence?.capturedControlId === pointer.capturedControlId && preservedPreDispatchEvidence?.focus?.controlId === pointer.preDispatchFocus.controlId && preservedPreDispatchEvidence.focus?.native === true && preservedPreDispatchEvidence?.hitTest?.capturedControlId === pointer.hitTest.capturedControlId && preservedPreDispatchEvidence.hitTest?.matchesCapturedControl === true && preservedPreDispatchEvidence?.dispatch?.kind === pointer.dispatch.kind && preservedPreDispatchEvidence.dispatch?.pressed === true && preservedPreDispatchEvidence.dispatch?.released === true && preservedPreDispatchEvidence.dispatch?.focus?.controlId === pointer.dispatch.focus.controlId && preservedPreDispatchEvidence.dispatch.focus?.native === true && preservedPreDispatchEvidence.dispatch.focus?.targetMatchesCapturedControl === true && replacementStateIsBound && postTransition.requestId === transaction.request?.browserRequestId && postTransition.resultSha256 === transaction.terminal?.resultSha256 && postTransition.resultControlId === controlId && postTransition.renderedTerminal === true;
    }
    const keyboard = transaction?.keyboardActivations?.[0];
    return interaction.activation === "keyboard" && interaction.keyboardFocused === true && interaction.keyboardActivated === true && transaction?.pointerActivations?.length === 0 && transaction?.keyboardActivations?.length === 1 && keyboard?.kind === "keyboard" && keyboard?.nativeFocus === true && keyboard?.preDispatchFocus?.controlId === controlId && keyboard?.preDispatchFocus?.native === true && keyboard?.count === 1 && keyboard.controlId === controlId;
};
export function validateP805RetryTerminalReceipt(receipt) {
    const transaction = receipt?.transaction;
    const retryAction = {interaction:{activation:"pointer", pointerActivated:true}, transaction};
    if (receipt?.operation !== "simulation-retry" || receipt?.controlId !== "simulation-retry" || receipt?.stateClass !== "recovery-operation" || transaction?.operation !== "simulation-retry" || transaction?.stateClass !== "recovery-operation" || transaction?.control?.stableControlId !== "simulation-retry" || transaction?.requestCount !== 1 || transaction?.request?.method !== "POST" || transaction?.request?.path !== "/api/project/simulations" || typeof transaction.request?.browserRequestId !== "string" || !transaction.request.browserRequestId || transaction?.terminal?.status !== "completed" || typeof transaction.terminal?.jobId !== "string" || !transaction.terminal.jobId || transaction.terminal?.causedByRequestId !== transaction.request.browserRequestId || !sha(transaction.terminal?.resultSha256) || transaction?.postTransitionRenderedState?.resultControlId !== "simulation-retry" || transaction.postTransitionRenderedState?.resultOperation !== "simulation-retry" || transaction.postTransitionRenderedState?.resultStateClass !== "recovery-operation" || transaction.postTransitionRenderedState?.resultReceipt !== "durable-terminal" || transaction.postTransitionRenderedState?.resultJobId !== transaction.terminal.jobId || transaction.postTransitionRenderedState?.resultTerminal !== transaction.terminal.status || !hasRenderedActivation(retryAction, "simulation-retry")) fail("simulation Retry terminal receipt is status/job-equivalent but not bound to its captured Retry control");
    return receipt;
}
// The Home recovery boundary is deliberately separate from the generic
// tuple-action contract: it starts with an interrupted project Open, whose
// request must not happen at all. The only trustworthy continuation is the
// actual, visible Start a game tab the person presses after choosing Stay.
export function validateP805HomeProjectSwitchReceipt(receipt) {
    const cancelled = receipt?.cancelledProjectOpen, startGame = receipt?.startGameNavigation, created = receipt?.createdProject, stale = receipt?.staleResponse;
    const pointerActivation = (activation, controlId) => activation?.kind === "pointer" && activation?.count === 1 && activation.controlId === controlId && activation.capturedControlId === controlId && typeof activation.captureKey === "string" && activation.captureKey.length > 0 && activation.preDispatchFocus?.controlId === controlId && activation.preDispatchFocus?.native === true && activation.hitTest?.capturedControlId === controlId && activation.hitTest?.matchesCapturedControl === true && activation.dispatch?.kind === "native-pointer" && activation.dispatch?.pressed === true && activation.dispatch?.released === true && activation.dispatch?.focus?.controlId === controlId && activation.dispatch.focus?.native === true && activation.dispatch.focus?.targetMatchesCapturedControl === true;
    const liveControl = (control, id, name) => control?.stableControlId === id && control?.identityAttribute === "id" && control?.accessibleName === name && control?.keyboardFocused === true && control?.enabled === true && control?.disabled === false;
    if (!cancelled || cancelled.routeBefore !== "#/home/projects" || cancelled.routeAfter !== cancelled.routeBefore || cancelled.projectOpenRequestCount !== 0 || !liveControl(cancelled.stayControl, "design-navigation-guard-stay", "Stay") || !pointerActivation(cancelled.stayActivation, cancelled.stayControl.stableControlId) || !startGame || startGame.routeBefore !== cancelled.routeAfter || startGame.routeAfter !== "#/home/design" || startGame.control?.lifecycle?.kind !== "navigation" || startGame.control.lifecycle?.value !== "design" || !liveControl(startGame.control, "home-tab:design", "Start a game") || !pointerActivation(startGame.activation, startGame.control.stableControlId) || !created || created.route !== receipt?.destinationRoute || !/^#\/project(?:\/[^/]+){1,2}$/.test(created.route ?? "") || !liveControl(created.control, "blueprint-create-game", "Create game") || !pointerActivation(created.activation, created.control.stableControlId) || !stale || !Number.isSafeInteger(stale.responseCount) || stale.responseCount < 1 || typeof stale.delayedRequestId !== "string" || !stale.delayedRequestId || stale.completedAfterSwitch !== true || stale.sourceRoute !== cancelled.routeBefore || stale.destinationRoute !== created.route) fail("Home project-switch receipt does not bind cancelled Open, visible Start a game, created project, and stale response to one DOM workflow");
    return receipt;
}
// A server restart has no executor to poll to completion.  Its terminal is
// therefore valid only when the original rendered submission, durable job,
// newly rendered recovery result, and the owned server drain all agree.
export function validateP805RestartRecoveryTerminalReceipt(receipt) {
    const transaction = receipt?.transaction, terminal = receipt?.terminal, rendered = receipt?.rendered, replacement = rendered?.postRestartReplacementState, drain = receipt?.ownedProcessDrain, priorStudio = receipt?.priorStudio ?? drain?.priorStudioShutdown, preLossJob = priorStudio?.durableJobBeforeLoss, postLossJob = priorStudio?.durableJob;
    const pointer = transaction?.pointerActivations?.[0];
    if (!hasP805TransactionActivations(transaction) || receipt?.operation !== "simulation" || receipt?.controlId !== "simulation-run" || receipt?.stateClass !== "editable-submission" || transaction?.operation !== "simulation" || transaction?.stateClass !== "editable-submission" || transaction?.control?.stableControlId !== "simulation-run" || transaction?.requestCount !== 1 || transaction?.request?.method !== "POST" || transaction?.request?.path !== "/api/project/simulations" || typeof transaction.request?.browserRequestId !== "string" || !transaction.request.browserRequestId || typeof receipt?.capturedJobId !== "string" || !receipt.capturedJobId || priorStudio?.shutdown?.kind !== "abrupt-service-loss" || priorStudio.shutdown?.gracefulShutdownReceived !== false || priorStudio.shutdown?.requestedSignal !== "SIGKILL" || priorStudio.shutdown?.observedSignal !== "SIGKILL" || priorStudio?.processStateBeforeLoss?.status !== "running" || !Number.isSafeInteger(priorStudio.processStateBeforeLoss?.updatedAt) || [preLossJob, postLossJob].some((job) => job?.id !== receipt.capturedJobId || job?.operation !== "simulation" || !P805_ACTIVE_JOB_STATUSES.has(job?.status) || job?.terminal !== false || job?.causedByRequestId !== transaction.request.browserRequestId || !Number.isSafeInteger(job?.request?.rounds) || job.request.rounds <= 0 || !Number.isSafeInteger(job?.request?.workers) || job.request.workers <= 0) || JSON.stringify(preLossJob?.request) !== JSON.stringify(postLossJob?.request) || terminal?.status !== "recovery-required" || typeof terminal?.jobId !== "string" || !terminal.jobId || receipt.capturedJobId !== terminal.jobId || terminal?.operation !== "simulation" || JSON.stringify(terminal?.request) !== JSON.stringify(postLossJob.request) || terminal?.causedByRequestId !== transaction.request.browserRequestId || !sha(terminal?.resultSha256) || !pointer || pointer.controlId !== "simulation-run" || pointer.capturedControlId !== "simulation-run" || typeof pointer.captureKey !== "string" || !pointer.captureKey || pointer.preDispatchFocus?.controlId !== "simulation-run" || pointer.preDispatchFocus?.native !== true || pointer.hitTest?.capturedControlId !== "simulation-run" || pointer.hitTest?.matchesCapturedControl !== true || pointer.dispatch?.kind !== "native-pointer" || pointer.dispatch?.pressed !== true || pointer.dispatch?.released !== true || pointer.dispatch?.focus?.controlId !== "simulation-run" || pointer.dispatch?.focus?.native !== true || pointer.dispatch?.focus?.targetMatchesCapturedControl !== true || rendered?.resultControlId !== "simulation-run" || rendered?.resultOperation !== "simulation" || rendered?.resultStateClass !== "editable-submission" || rendered?.resultReceipt !== "durable-terminal" || rendered?.resultJobId !== terminal.jobId || rendered?.resultRequestId !== terminal.jobId || rendered?.resultTerminal !== "recovery-required" || rendered?.resultRecovery !== "restart-reconciled" || rendered?.resultExecutor !== "unavailable-after-restart" || rendered?.renderedTerminal !== true || replacement?.capturedControlId !== "simulation-run" || replacement?.captureKey !== pointer.captureKey || replacement?.controlState !== "replaced-after-restart" || replacement?.currentControlId !== "simulation-run" || replacement?.capturedControlConnected !== false || !Number.isSafeInteger(receipt?.timing?.elapsedMs) || receipt.timing.elapsedMs <= 0 || typeof receipt?.evidence?.screenshotEvidenceId !== "string" || !receipt.evidence.screenshotEvidenceId || typeof receipt?.evidence?.cleanupEvidenceId !== "string" || !receipt.evidence.cleanupEvidenceId || !drain || drain.processTreeDrained !== true || drain.resourcesDrained !== true) fail("simulation restart recovery receipt must preserve a pre- and post-abrupt-loss nonterminal durable job through exact rendered recovery, timing, evidence, and owned-process drainage");
    return receipt;
}
/**
 * The parent ledger must authenticate the tuple action itself before it
 * accepts a worker's immutable receipts.  `readChildAudit` is deliberately
 * injectable for the parent-ledger tests, so treating its successful return
 * as this check would leave a state-class substitution seam at the exact
 * hand-off the parent owns.
 */
function validatePackedTupleAction(action, tuple) {
    const contract = P805_WORKFLOW_CONTRACTS[tuple?.persona]?.[tuple?.observation];
    const operation = contract?.operation ?? contract?.body;
    const expectedLifecycle = operation === undefined ? {kind:"navigation", value:contract?.route} : {kind:"operation", value:operation};
    const expectedStateClass = expectedLifecycle.kind === "navigation" ? "navigation" : contract?.method === "GET" ? "read-only-operation" : "editable-submission";
    const stateClass = p805TransactionStateClass(action?.transaction);
    const terminalBound = action?.visibleTerminal?.lifecycle?.controlId === action?.stableControlId && action?.visibleTerminal?.lifecycle?.stateClass === stateClass && (!contract?.poll || action?.visibleTerminal?.lifecycle?.jobId === action?.terminal?.jobId);
    if (!contract || action?.persona !== tuple.persona || action?.observation !== tuple.observation || action?.viewport !== tuple.viewport || stateClass !== expectedStateClass || action?.interaction?.transactionState !== expectedStateClass || action?.interaction?.lifecycle?.kind !== expectedLifecycle.kind || action?.interaction?.lifecycle?.value !== expectedLifecycle.value || action?.expectedMethod !== contract.method || action?.expectedBodyKind !== (contract.body ?? null) || action?.expectedApi !== contract.api || action?.expectedArtifact !== (contract.artifact ?? null) || action?.expectedTerminal !== contract.terminal || action?.transaction?.stateClass !== expectedStateClass || action?.transaction?.control?.stableControlId !== action?.stableControlId || !hasRenderedActivation(action, action?.stableControlId) || action?.transaction?.request?.browserRequestId !== action?.browserRequestId || action?.transaction?.request?.method !== contract.method || action?.transaction?.request?.path !== contract.api || action?.visibleTerminal?.observedAfterRequestId !== action?.browserRequestId || action?.visibleTerminal?.resultSha256 !== action?.terminal?.resultSha256 || !terminalBound) fail(`packed ${tuple.persona}/${tuple.observation}/${tuple.viewport} child receipt substitutes a state-class or rendered transaction boundary`);
}
/** Publish a completed receipt without exposing a partially-written record.
 * `link` is a no-replace atomic publish on the local evidence filesystem; a
 * restart therefore cannot overwrite or reinterpret an earlier receipt. */
async function writeImmutableReceipt(target, contents, services = {writeFile, link, rm}) {
    const staged = `${target}.${randomBytes(16).toString("hex")}.partial`;
    await services.writeFile(staged, contents, {flag:"wx"});
    try { await services.link(staged, target); }
    finally { await services.rm(staged, {force:true}); }
}
async function freeLoopbackPort() {
    const server = createServer();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (!address || typeof address === "string") fail("could not reserve a loopback port");
    return address.port;
}

export function validateP805RenderedPersonaAudit(audit) {
    const initial = audit?.phase === "initial", rawRendered = audit?.rendered, rendered = rawRendered, workflowPersonas = audit?.workflowPersonas ?? [audit?.persona], expected = P805_REQUIRED_OBSERVATIONS[audit?.persona] ?? [], tuples = auditTuples(audit);
    const requiredViewports = audit?.tuple ? [audit.tuple.viewport] : ["wide", "compact", "narrow"];
    if (!P805_PERSONAS.includes(audit?.persona) || !rendered || rendered.execution !== "packed-public-cli-built-studio-rendered-controls" || !requiredViewports.every((viewport) => rendered.viewports?.includes(viewport)) || !rendered.measurements || !["consoleExceptions", "unhandledRequestFailures", "inaccessiblePrimaryActions", "unexplainedDisabledControls", "namedRegions"].every((name) => Number.isSafeInteger(rendered.measurements[name]) && rendered.measurements[name] >= 0) || typeof rendered.measurements.visibleFocus !== "boolean" || (!initial && (rendered.measurements.namedRegions < 1 || rendered.measurements.visibleFocus !== true)) || typeof rendered.measurements.documentOverflow !== "boolean" || !Array.isArray(rendered.actions) || rendered.actions.length < (audit.tuple ? 1 : expected.length)) fail(`rendered ${audit?.persona ?? "persona"} audit lacks measured public-browser observations`);
    if (!Array.isArray(workflowPersonas) || workflowPersonas.length === 0 || workflowPersonas.some((persona) => !P805_PERSONAS.includes(persona)) || new Set(workflowPersonas).size !== workflowPersonas.length || !workflowPersonas.includes(audit.persona)) fail(`rendered ${audit.persona} audit has an invalid packed workflow persona registry`);
    if (!audit.packageIdentity || audit.packageIdentity.archiveSha256 !== audit.candidatePackageSha256 || !/^[a-f0-9]{64}$/i.test(audit.packageIdentity.candidatePackageJsonSha256 ?? "") || !/^[a-f0-9]{64}$/i.test(audit.packageIdentity.declaredCandidateExecutableSha256 ?? "") || audit.packageIdentity.candidateExecutableSha256 !== audit.packageIdentity.declaredCandidateExecutableSha256 || !/^[a-f0-9]{64}$/i.test(audit.packageIdentity.candidateExecutableReceiptSha256 ?? "") || typeof audit.packageIdentity.candidateExecutableReceiptId !== "string" || !audit.packageIdentity.candidateExecutableReceiptId || typeof audit.packageIdentity.candidateExecutableReceiptIssuer !== "string" || !audit.packageIdentity.candidateExecutableReceiptIssuer || !/^[a-f0-9]{64}$/i.test(audit.packageIdentity.candidateTreeManifestSha256 ?? "") || !/^[a-f0-9]{40}$/i.test(audit.packageIdentity.candidateTreeObjectId ?? "") || audit.packageIdentity.candidateTreeManifestCandidateId !== audit.candidateId || !Number.isSafeInteger(audit.packageIdentity.candidateExecutableFiles) || audit.packageIdentity.candidateExecutableFiles < 1 || (audit.packageIdentity.archiveGitHead !== undefined && audit.packageIdentity.archiveGitHead !== audit.candidateId) || typeof audit.packageIdentity.installedCli !== "string" || !audit.packageIdentity.installedCli || !audit.packageIdentity.installedPackageJsonSha256) fail(`rendered ${audit.persona} audit does not prove its installed archive executable contents are this candidate`);
    if (!Array.isArray(rendered.responsive) || !requiredViewports.every((viewport) => rendered.responsive.some((measurement) => measurement?.viewport === viewport && typeof measurement?.overflow === "boolean" && typeof measurement?.visibleFocus === "boolean" && (initial || measurement.overflow === false && measurement.visibleFocus === true) && measurement?.screenshotEvidenceId))) fail(`rendered ${audit.persona} audit lacks measured required responsive states`);
    if (audit.tuple && (rendered.actions.length !== 1 || auditTuples(audit).length !== 1)) fail(`rendered ${audit.persona} tuple audit contains more than its one assigned workflow`);
    if (audit.tuple && (audit.workflowScope?.kind !== "p8-05-single-tuple-workflow-scope" || JSON.stringify(audit.workflowScope.tuple) !== JSON.stringify(audit.tuple) || audit.workflowScope?.scopeEvidenceId === undefined || !Array.isArray(audit.workflowScope?.bootstrap) || JSON.stringify(audit.workflowScope.bootstrap.map(({evidenceId, ...entry}) => entry)) !== JSON.stringify(tupleBootstrapContract(audit.tuple)) || audit.workflowScope.bootstrap.some((entry) => typeof entry?.evidenceId !== "string" || !entry.evidenceId) || audit.workflowScope?.recoveryRequired !== tupleRequiresCompleteWorkflow(audit.tuple) || (audit.workflowScope?.recoveryRequired === false && (Object.keys(rendered.recovery ?? {}).length > 0 || Object.keys(rendered.jobs ?? {}).length > 0)))) fail(`rendered ${audit.persona} tuple audit has unscoped bootstrap, recovery, or cross-tuple workflow work`);
    if (audit.tuple?.persona === "mathematician" && audit.tuple.observation === "outcome-library-report-diff-replay") {
        const outputs = audit.workflowScope?.compoundCliOutputs;
        const validOutputs = Array.isArray(outputs) && JSON.stringify(outputs.map(({output, command}) => ({output, command}))) === JSON.stringify(P805_OUTCOME_LIBRARY_COMPOUND_OUTPUTS) && outputs.every((entry) => {
            const files = entry?.files;
            return entry?.kind === "p8-05-packed-cli-output" && entry.candidateId === audit.candidateId && entry.candidatePackageSha256 === audit.candidatePackageSha256 && entry.candidateExecutableSha256 === audit.packageIdentity?.candidateExecutableSha256 && sha(entry.sha256) && typeof entry.evidenceId === "string" && entry.evidenceId && Array.isArray(files) && files.length > 0 && files.every((file) => typeof file?.path === "string" && file.path && sha(file.sha256) && Number.isSafeInteger(file.sizeBytes) && file.sizeBytes > 0 && typeof file.contentsBase64 === "string" && Buffer.from(file.contentsBase64, "base64").length === file.sizeBytes && digest(Buffer.from(file.contentsBase64, "base64")) === file.sha256) && entry.sha256 === digest(JSON.stringify(files.map(({path, sha256, sizeBytes, contentsBase64}) => ({path, sha256, sizeBytes, contentsBase64})).sort((left, right) => left.path.localeCompare(right.path))));
        });
        if (!validOutputs) fail("rendered mathematician Outcome Library tuple does not retain its exact packed CLI output artifacts");
    }
    for (const {persona, observation, viewport} of tuples) { const contract = P805_WORKFLOW_CONTRACTS[persona][observation], action = rendered.actions.find((value) => (value?.persona ?? audit.persona) === persona && value?.observation === observation && value?.viewport === viewport), state = contract && P805_SCREEN_CONTROL_STATES[contract.route], operation = contract?.operation ?? contract?.body, expectedLifecycle = operation ? {kind:"operation", value:operation} : {kind:"navigation", value:contract?.route}, stateClass = p805TransactionStateClass(action?.transaction), isNavigation = expectedLifecycle.kind === "navigation", stateClassMatchesRequest = isNavigation ? stateClass === "navigation" : stateClass === "editable-submission" ? contract?.method !== "GET" : stateClass === "read-only-operation" && contract?.method === "GET", terminalControlIsBound = action?.visibleTerminal?.lifecycle?.controlId === action?.stableControlId, terminalStateIsBound = action?.visibleTerminal?.lifecycle?.stateClass === stateClass, terminalJobIsBound = !contract?.poll || action?.visibleTerminal?.lifecycle?.jobId === action?.terminal?.jobId; if (!contract || !state || !action || !stateClass || !stateClassMatchesRequest || typeof action.route !== "string" || !action.route.endsWith(`/project/${contract.route}`) && !action.route.endsWith(`/${contract.route}`) || action.screenState !== contract.route || action.screenNavigationControl !== state.navigationControl || typeof action.stableControlId !== "string" || !action.stableControlId || action.domControlId !== action.stableControlId || action.identityAttribute !== "id" || action.interaction?.stableControlId !== action.stableControlId || action.interaction?.identityAttribute !== "id" || action.interaction?.transactionState !== stateClass || action.interaction?.lifecycle?.kind !== expectedLifecycle.kind || action.interaction?.lifecycle?.value !== expectedLifecycle.value || action.precondition?.enabled !== true || action.precondition?.disabled !== false || action.precondition?.disabledExplanation !== null || action.precondition?.accessibleName !== action.interaction?.matchedLabel || !action.transaction || action.transaction?.stateClass !== stateClass || action.transaction.control?.stableControlId !== action.stableControlId || action.transaction.control?.accessibleName !== action.interaction?.matchedLabel || action.transaction.control?.enabled !== true || action.transaction.control?.disabled !== false || action.transaction.control?.disabledExplanation !== null || action.transaction.confirmation?.required !== false || action.transaction.confirmation?.state !== "not-required" || !hasRenderedActivation(action, action.stableControlId) || typeof action.browserRequestId !== "string" || !action.browserRequestId || action.visibleTerminal?.state !== "rendered" || action.visibleTerminal?.changedAfterRequest !== true || action.visibleTerminal?.observedAfterRequestId !== action.browserRequestId || action.visibleTerminal?.resultSha256 !== action.terminal?.resultSha256 || (contract.artifact !== undefined && action.visibleTerminal?.lifecycle?.artifact?.name !== contract.artifact) || !terminalControlIsBound || !terminalStateIsBound || !terminalJobIsBound || action.expectedControl !== contract.control || (action.expectedMethod !== undefined && (action.expectedMethod !== contract.method || action.expectedBodyKind !== (contract.body ?? null))) || action.expectedApi !== contract.api || action.expectedArtifact !== (contract.artifact ?? null) || action.expectedTerminal !== contract.terminal || !action.terminal || !["completed", "success", "ok", "valid", "partial"].includes(action.terminal.status) || !/^[a-f0-9]{64}$/i.test(action.terminal.resultSha256 ?? "") || !action.evidenceId || !action.screenshotEvidenceId || !Number.isSafeInteger(action.elapsedMs) || action.elapsedMs <= 0 || typeof action.overflow !== "boolean" || typeof action.accessibility?.visibleFocus !== "boolean" || !Number.isSafeInteger(action.accessibility?.unexplainedDisabledControls) || action.accessibility.unexplainedDisabledControls < 0 || (!initial && action.overflow !== false) || !action.interaction || !Array.isArray(action.accessibility?.namedRegions) || (!initial && (action.accessibility.namedRegions.length === 0 || action.accessibility.visibleFocus !== true || action.accessibility.unexplainedDisabledControls !== 0))) fail(`rendered ${persona} audit lacks a DOM-bound tuple action for ${observation}/${viewport}`); }
    const expectedChunks = tuples.length, receipts = audit?.checkpointReceipts;
    if (!audit?.finalResult || audit.finalResult.status !== "passed" || audit.finalResult.aggregation !== "verified-checkpoint-receipts-only" || audit.finalResult.chunks !== expectedChunks || !Array.isArray(receipts) || receipts.length !== expectedChunks || !Array.isArray(audit.finalResult.checkpointReceiptSha256s) || audit.finalResult.checkpointReceiptSha256s.length !== expectedChunks || !audit.finalResult.cleanupEvidenceId) fail(`rendered ${audit?.persona ?? "persona"} audit lacks a checkpointed packed final result`);
    const receiptIds = new Set(), receiptActions = new Set();
    for (const receipt of receipts) {
        // Validate the compatibility view above, but authenticate the exact
        // persisted pointer action.  Hashing the compatibility projection
        // would make a valid immutable checkpoint look substituted merely
        // because validation exposes its legacy keyboard-shaped fields.
        const action = rendered.actions.find((value) => (value?.persona ?? audit.persona) === receipt?.persona && value?.observation === receipt?.observation && value?.viewport === receipt?.viewport), rawAction = rawRendered?.actions?.find((value) => (value?.persona ?? audit.persona) === receipt?.persona && value?.observation === receipt?.observation && value?.viewport === receipt?.viewport), actionKey = `${receipt?.persona}/${receipt?.observation}/${receipt?.viewport}`;
        if (!receipt || typeof receipt.receiptId !== "string" || !receipt.receiptId || receiptIds.has(receipt.receiptId) || receiptActions.has(actionKey) || receipt.candidateId !== audit.candidateId || receipt.candidatePackageSha256 !== audit.candidatePackageSha256 || receipt.persona === undefined || receipt.observation === undefined || receipt.viewport === undefined || !action || !rawAction || receipt.actionSha256 !== digest(JSON.stringify(rawAction))) fail(`rendered ${audit?.persona ?? "persona"} audit has a missing, duplicate, stale, or substituted checkpoint receipt`);
        receiptIds.add(receipt.receiptId); receiptActions.add(actionKey);
    }
    for (const {persona, observation, viewport} of tuples) if (!receiptActions.has(`${persona}/${observation}/${viewport}`)) fail(`rendered ${audit?.persona ?? "persona"} audit lacks a checkpoint receipt for ${persona}/${observation}/${viewport}`);
    if (JSON.stringify(audit.finalResult.checkpointReceiptSha256s) !== JSON.stringify(receipts.map((receipt) => receipt.sha256))) fail(`rendered ${audit?.persona ?? "persona"} audit final result does not aggregate its verified checkpoint receipts`);
    const identityLedger = new Map();
    for (const action of rendered.actions) for (const [kind, browserRequestId] of [["action", action?.browserRequestId], ...(action?.contextRevalidation?.browserRequestId === action?.browserRequestId ? [] : [["context", action?.contextRevalidation?.browserRequestId]]), ...(action?.terminal?.source === "rendered-poll" ? [["poll", action.terminal.browserRequestId]] : [])]) {
        if (typeof browserRequestId !== "string" || !browserRequestId) fail(`rendered ${audit.persona} audit lacks a ${kind} browser request identity`);
        const prior = identityLedger.get(browserRequestId);
        if (prior) fail(`rendered ${audit.persona} audit reuses ${kind} browser request ${browserRequestId} after ${prior}`);
        identityLedger.set(browserRequestId, `${action.persona ?? audit.persona}/${action.viewport}/${action.observation}`);
    }
    for (const action of rendered.actions) {
        const operation = action?.interaction?.lifecycle?.kind === "operation" ? action.interaction.lifecycle.value : undefined;
        if (operation === undefined) continue;
        const formState = action.transaction?.formState, requiresEditableForm = action.transaction?.stateClass === "editable-submission";
        if (!requiresEditableForm && formState !== undefined) fail(`rendered ${audit.persona} audit records editable fields for non-editable ${operation}`);
        if (requiresEditableForm && (formState?.operation !== operation || formState.capturedBeforeSubmission !== true || formState.scope?.identityAttribute !== "data-pokie-lifecycle-form" || formState.scope?.value !== operation || typeof formState.scope?.tagName !== "string" || !formState.scope.tagName || formState.actionControl?.stableControlId !== action.transaction.control?.stableControlId || formState.actionControl?.identityAttribute !== "id" || formState.actionControl?.visible !== true || typeof formState.actionControl?.accessibleName !== "string" || !formState.actionControl.accessibleName || formState.actionControl?.validation?.valid !== true || typeof formState.actionControl?.validation?.message !== "string" || !Array.isArray(formState.fields) || formState.fields.length === 0 || formState.fields.some((field) => typeof field?.stableControlId !== "string" || !field.stableControlId || field.identityAttribute !== "id" || field.visible !== true || typeof field.accessibleName !== "string" || !field.accessibleName || typeof field.value !== "string" || field.disabled !== false || typeof field.required !== "boolean" || field.validation?.valid !== true || typeof field.validation.message !== "string"))) fail(`rendered ${audit.persona} audit lacks valid DOM-derived form state before ${operation} submission`);
    }
    const requiresRecovery = audit.tuple ? audit.workflowScope?.recoveryRequired === true : audit.persona === "ui-ux";
    if (requiresRecovery) {
        for (const name of ["reloadReconnect", "projectSwitch", "staleResponseIsolation", "unsavedWorkProtection", "serverRestart"]) if (rendered.recovery?.[name]?.observed !== true || !rendered.recovery[name].evidenceId) fail(`rendered ${audit.persona} audit lacks measured recovery observations`);
        for (const name of ["success", "actionableFailure", "cooperativeCancellation", "retryWithoutPartialArtifacts", "restartRecovery"]) if (rendered.jobs?.[name]?.observed !== true || !rendered.jobs[name].evidenceId) fail(`rendered ${audit.persona} audit lacks measured success/failure/cancellation/retry/restart observations`);
        validateP805RetryTerminalReceipt(rendered.jobs?.retryWithoutPartialArtifacts?.receipt);
        const restartReceipt = rendered.jobs?.restartRecovery?.receipt;
        validateP805RestartRecoveryTerminalReceipt(restartReceipt);
        if (restartReceipt.evidence.cleanupEvidenceId !== audit.cleanup?.evidenceId || audit.timings?.restartRecoveryMs !== restartReceipt.timing.elapsedMs || !audit.evidence?.some((entry) => entry?.evidenceId === restartReceipt.evidence.screenshotEvidenceId && entry.kind === "screenshot")) fail(`rendered ${audit.persona} audit does not bind restart recovery timing, screenshot, and cleanup to its terminal receipt`);
    }
    if (!audit.cleanup || audit.cleanup.processTreeDrained !== true || audit.cleanup.resourcesDrained !== true || audit.cleanup.contextRemoved !== true || !audit.cleanup.evidenceId) fail(`rendered ${audit.persona} audit lacks machine-measured cleanup`);
}

/** Polling is a value-returning boundary.  Job callers need the final durable
 * record, not merely proof that a predicate was eventually truthy. */
// A public screen control must either surface its state promptly or provide a
// visible failure.  Keeping the rendered boundary short also means the packed
// proof reports the particular stuck control instead of letting a synchronous
// test runner consume its entire outer timeout.
async function waitFor(predicate, label, timeout = 30000) {
    const until = Date.now() + timeout;
    for (;;) {
        const value = await predicate();
        if (value) return value;
        if (Date.now() > until) throw new Error(`Timed out waiting for ${label}`);
        await wait(125);
    }
}
function descendants(pid) { const listing = process.platform === "win32" ? "" : (spawnSync("ps", ["-eo", "pid=,ppid=,pgid="], {encoding:"utf8"}).stdout || ""), processes = new Map(); let rootGroup; for (const line of listing.split("\n")) { const match = /^\s*(\d+)\s+(\d+)\s+(\d+)/.exec(line); if (match) { const details = {parent:Number(match[2]), group:Number(match[3])}; processes.set(Number(match[1]), details); if (Number(match[1]) === pid && details.group === pid) rootGroup = details.group; } } const owned = new Map(); if (Number.isInteger(pid) && pid > 0) owned.set(pid, processIdentity(pid)); let changed = true; while (changed) { changed = false; for (const [child, details] of processes) if ((owned.has(details.parent) || (rootGroup !== undefined && details.group === rootGroup)) && !owned.has(child)) { owned.set(child, processIdentity(child)); changed = true; } } return owned; }
export function createP805OwnedProcessRecord(label, child, ownerOptions, spawnedAt = now()) {
    const spawned = descendants(child?.pid);
    return {
        label, pid:child?.pid, processGroupId:child?.pid, spawnedAt,
        identity:processIdentity(child?.pid),
        spawnTimeProcessIdentities:[...spawned].map(([pid, identity]) => ({pid, identity})),
        ownedProcesses:spawned, child,
        resourceRegistryPath:ownerOptions.resourceRegistryPath,
        resourceRegistrySecret:ownerOptions.resourceRegistrySecret,
        // Release and final cleanup must use the same authenticated namespace
        // as acquisition. Omitting this field left Chromium alive after the
        // first failed tuple and stranded the parent until its 75-minute cap.
        operationId:ownerOptions.operationId,
    };
}
const supervisorEnvironment = (environment) => ({POKIE_PC20_RESOURCE_REGISTRY:environment.POKIE_P805_SUPERVISOR_REGISTRY, POKIE_PC20_RESOURCE_REGISTRY_SECRET:environment.POKIE_P805_SUPERVISOR_SECRET, POKIE_PC20_OPERATION_ID:environment.POKIE_P805_SUPERVISOR_OPERATION});
function releaseP805BrowserOwner(owner) {
    const resource = {kind:"browser", resourceId:owner.resourceId, pid:owner.pid, processIdentity:owner.identity};
    registerPc20OwnedResource(resource, "released", {POKIE_PC20_RESOURCE_REGISTRY:owner.resourceRegistryPath, POKIE_PC20_RESOURCE_REGISTRY_SECRET:owner.resourceRegistrySecret, POKIE_PC20_OPERATION_ID:owner.operationId});
    if (process.env.POKIE_P805_SUPERVISOR_REGISTRY) registerPc20OwnedResource(resource, "released", supervisorEnvironment(process.env));
}
export async function createP805TupleSupervisor(options, tuple, nonce, services = {writeFile}) {
    const stem = `${options.phase}-${tupleFileStem(tuple)}-${nonce}`, registry = path.join(options.output, `${stem}-owned-resources.ndjson`), secret = randomBytes(32).toString("hex"), operationId = randomBytes(16).toString("hex"), record = {schemaVersion:1, operationId, action:"registry-ready", kind:"registry", resourceId:`registry:supervisor:${process.pid}`};
    const signature = createHash("sha256").update(secret).update("\0").update(JSON.stringify(record)).digest("hex");
    await services.writeFile(registry, `${JSON.stringify({...record, signature})}\n`, {flag:"wx", mode:0o600});
    const hook = path.join(root, "scripts", "pc-20-resource-ownership-hook.cjs"), env = {...process.env, POKIE_P805_SUPERVISOR_REGISTRY:registry, POKIE_P805_SUPERVISOR_SECRET:secret, POKIE_P805_SUPERVISOR_OPERATION:operationId, POKIE_PC20_RESOURCE_REGISTRY:path.join(options.output, `${stem}-worker-resources.ndjson`), POKIE_PC20_RESOURCE_REGISTRY_SECRET:randomBytes(32).toString("hex"), POKIE_PC20_OPERATION_ID:randomBytes(16).toString("hex"), NODE_OPTIONS:[process.env.NODE_OPTIONS, `--require=${hook}`].filter(Boolean).join(" ")};
    let tracker;
    return {
        env,
        attach(child) { tracker = createPc20OwnershipTracker(child?.pid, registry, secret, {operationId, captureIntervalMs:5_000}); },
        stop() { tracker?.stop(); },
        async cleanup(child, kind) {
            // Read all signed acquisitions before signalling the root. A late
            // process-table snapshot cannot recover reparented descendants.
            tracker ??= createPc20OwnershipTracker(child?.pid, registry, secret, {operationId, captureIntervalMs:5_000});
            let authenticationError;
            try { tracker.capture({final:true}); } catch (error) { authenticationError = error; }
            let result;
            // Reconcile acquisitions made during shutdown as well. No
            // resource release is certified until every retained PID is gone.
            for (let pass = 0; pass < 3; pass++) {
                result = await drainProcessTree(child, kind === "success" ? 250 : 1_000, tracker.ownedProcesses, tracker.ownedResources);
                const size = tracker.ownedProcesses.size;
                try { tracker.capture({final:true}); } catch (error) { authenticationError ??= error; }
                if (size === tracker.ownedProcesses.size && result.processTreeDrained) break;
            }
            if (authenticationError) return {...result, resourcesDrained:false, authenticated:false, error:String(authenticationError)};
            const forcedReleases = [];
            if (result.processTreeDrained) {
                for (const resource of tracker.ownedResources.values()) {
                    if (resource.released || resource.pid === undefined) continue;
                    // Identity-verified absence was proved by drainProcessTree,
                    // including for the process that owned a worker thread.
                    registerPc20OwnedResource(resource, "released", supervisorEnvironment(env));
                    forcedReleases.push({kind:resource.kind, resourceId:resource.resourceId, pid:resource.pid, processIdentity:resource.processIdentity});
                }
                tracker.capture({final:true});
                result = await drainProcessTree(child, 0, tracker.ownedProcesses, tracker.ownedResources);
            }
            // A process-table snapshot may already see a killed root as a
            // zombie while Node has not delivered its exit event. Do not
            // publish an authenticated terminal with an unobserved status.
            if (result.processTreeDrained && child?.pid) await waitFor(() => child.exitCode !== null || child.signalCode !== null, "tuple worker exit after ownership drainage", 1_000);
            return {...result, authenticated:true, operationId, registryPath:path.basename(registry), forcedReleases};
        },
    };
}
async function responseJson(url, options) { const response = await fetch(url, options); if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`); return response.json(); }
export async function connectP805Devtools(devtools, initialUrl = "about:blank") {
    // Creating a target at the live URL starts automatic validation before
    // this socket can collect it. Instrument the blank target first, including
    // when the packed startup caller supplies its production initialUrl.
    const target = await responseJson(`${devtools}/json/new?${encodeURIComponent("about:blank")}`, {method:"PUT"}), socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
    let id = 0;
    const pending = new Map(), events = [];
    // Chromium emits a high-volume stream of data/loading notifications for
    // every Studio bundle.  Retaining all of them makes each later
    // `slice(cursor).find(...)` progressively more expensive and can turn the
    // packed whole-file workflow into the very performance regression it is
    // intended to detect.  Keep the machine-observable events that bind a
    // browser action to its request/result and those needed for diagnostics.
    const retainedEvents = new Set([
        "Network.requestWillBeSent",
        "Network.responseReceived",
        // One completion per response binds getResponseBody to the fully
        // received bytes. Keep this boundary while dropping dataReceived.
        "Network.loadingFinished",
        "Network.loadingFailed",
        "Runtime.exceptionThrown",
        "Log.entryAdded",
    ]);
    socket.on("message", (raw) => {
        // Do this inexpensive envelope check before JSON.parse.  Chromium
        // continues to emit high-volume unneeded protocol notifications while
        // Studio renders a long-running job; parsing every one starves the
        // audit's timer and prevents the first real control from being
        // reached.  Responses always have an id, and only this small set of
        // event envelopes contributes evidence, so ignored frames cannot
        // become a hidden workflow result.
        const contents = raw.toString();
        if (!contents.includes('"id"') && ![...retainedEvents].some((method) => contents.includes(`"method":"${method}"`))) return;
        const value = JSON.parse(contents);
        if (value.id === undefined) {
            if (retainedEvents.has(value.method)) events.push(value);
            return;
        }
        const job = pending.get(value.id);
        if (!job) return;
        pending.delete(value.id);
        value.error ? job.reject(new Error(JSON.stringify(value.error))) : job.resolve(value.result);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const messageId = ++id;
        pending.set(messageId, {resolve, reject});
        socket.send(JSON.stringify({id:messageId, method, params}));
    });
    const close = async () => {
        if (socket.readyState === WebSocket.CLOSED) return;
        // A failed rendered operation can leave Chromium's DevTools target in
        // a closing state without delivering the WebSocket close event.  The
        // runner must still reach its ownership-drain finally path on that
        // error/cancellation branch; waiting indefinitely here turns one
        // rejected workflow into an orphaned Studio/browser pair.
        await new Promise((resolve) => {
            const timeout = setTimeout(() => {
                socket.removeListener("close", onClose);
                socket.terminate();
                resolve();
            }, 1_000);
            const onClose = () => {
                clearTimeout(timeout);
                resolve();
            };
            socket.once("close", onClose);
            socket.close();
        });
    };
    let startupPhase = "enabling-event-domains";
    try {
        // Await each domain before navigation can emit even an immediate
        // request/response/completion sequence on the live Studio page.
        for (const method of ["Page.enable", "Runtime.enable", "Log.enable", "Network.enable"]) await send(method);
        startupPhase = "settling-instrumented-blank-document";
        // Every caller receives a settled instrumented target, including callers that navigate
        // themselves. Otherwise the initial blank commit can cancel their live navigation too.
        await waitFor(async () => {
            const result = await send("Runtime.evaluate", {expression:"location.href === 'about:blank' && document.readyState === 'complete'", returnByValue:true});
            return result.result?.value === true;
        }, "instrumented about:blank document", 10_000);
        if (initialUrl !== "about:blank") {
            startupPhase = "navigating-instrumented-Studio-target";
            const navigation = await send("Page.navigate", {url:initialUrl});
            if (navigation.errorText) fail(`initial Studio navigation failed: ${navigation.errorText}`);
        }
    } catch (error) {
        await close();
        throw new Error(`DevTools startup failed during ${startupPhase}: ${error.message}`, {cause:error});
    }
    return {send, events, close};
}
// The startup and project-switch paths share the durable-browser contract's
// rendered boundary. A label or an older validation response is insufficient.
export const p805CreateControlExpression = `(() => {
    const control = document.getElementById('blueprint-create-game');
    if (!(control instanceof HTMLButtonElement)) return null;
    const rect = control.getBoundingClientRect();
    const descriptionIds = (control.getAttribute('aria-describedby') ?? '').split(/\\s+/).filter(Boolean);
    const descriptions = descriptionIds.map((id) => document.getElementById(id));
    return {controlId: control.id, accessibleName: control.textContent?.trim(),
        validationGuidance: {ids: descriptionIds, text: descriptions.map((item) => item?.textContent?.trim() ?? '').join(' '),
            visible: descriptions.length > 0 && descriptions.every((item) => item instanceof HTMLElement && item.getClientRects().length > 0)},
        validationState: control.getAttribute('data-pokie-validation-state'),
        enabled: !control.disabled, ariaBusy: control.getAttribute('aria-busy'),
        visible: control.getClientRects().length > 0 && rect.width > 0 && rect.height > 0};
})()`;

export const isP805CreateValidationReady = (control) => control?.controlId === "blueprint-create-game"
    && control.accessibleName === "Create game" && control.validationState === "ok"
    && control.enabled && control.visible && (control.ariaBusy === null || control.ariaBusy === "false");

// Preserve the reason the real control rejected activation. A pending check and a terminal
// invalid design require different recovery actions, even though both suppress the pointer.
const p805CreateReadinessPhase = (control) => ["idle", "loading", "invalid", "stale", "error"].includes(control?.validationState)
    ? `validation-${control.validationState}` : "dom-unready";

export async function waitForP805CreateValidation(evaluate, timeout = 90_000, observeValidation) {
    let control;
    const diagnostics = {};
    try {
        return await waitFor(async () => {
            control = await evaluate(p805CreateControlExpression);
            if (!isP805CreateValidationReady(control)) {
                diagnostics.phase = p805CreateReadinessPhase(control);
                return false;
            }
            diagnostics.phase = "missing-validation-network-evidence";
            const proof = observeValidation ? await observeValidation(diagnostics) : undefined;
            if (observeValidation && !proof) return false;
            // Reading a response and focusing the real control can yield to a
            // render (including a blur-committed edit). Publish the current DOM
            // boundary, never the ok snapshot from before that observation.
            control = await evaluate(p805CreateControlExpression);
            if (!isP805CreateValidationReady(control)) {
                diagnostics.phase = "dom-changed-during-validation-observation";
                diagnostics.invalidatedControl = control;
                diagnostics.readinessPhase = p805CreateReadinessPhase(control);
                return false;
            }
            return {control, proof};
        }, "rendered Create game validation-ready boundary", timeout);
    } catch (error) {
        // Worker/parent failure receipts retain error.message, not its cause
        // chain. Keep the actual proof failure in that serialized diagnostic.
        throw new Error(`Missing rendered Create game validation-ready boundary; control: ${JSON.stringify(control)}; validation proof: ${JSON.stringify(diagnostics)}; reason: ${error.message}`, {cause:error});
    }
}

export async function waitForP805CreatedDashboard(evaluate, timeout = 180_000) {
    let dashboard;
    try {
        return await waitFor(async () => {
            dashboard = await evaluate(`(() => {
                const result = document.querySelector('[data-pokie-lifecycle-result="navigation"][data-pokie-lifecycle-route="overview"][data-pokie-lifecycle-result-control="project-tab:overview"]');
                return {route: location.hash, overview: document.body?.innerText.includes('Overview') ?? false,
                    terminal: result?.getAttribute('data-pokie-lifecycle-terminal') ?? null,
                    visible: result instanceof HTMLElement && result.getClientRects().length > 0};
            })()`);
            return /^#\/project\/[^/]+\/overview$/.test(dashboard?.route ?? "") && dashboard.overview
                && dashboard.terminal === "rendered" && dashboard.visible ? dashboard : false;
        }, "created project Overview/dashboard transition", timeout);
    } catch (error) {
        throw new Error(`Failed post-click Create game Overview/dashboard transition; rendered: ${JSON.stringify(dashboard)}; reason: ${error.message}`, {cause:error});
    }
}

export async function createP805RenderedGame(cdp, evaluate, observations, validationTimeout = 90_000, readBrowserResponseBody, dashboardTimeout = 180_000) {
    const {control, proof} = await waitForP805CreateValidation(evaluate, validationTimeout,
        readBrowserResponseBody ? (diagnostics) => observeP805CreatorValidation(cdp, evaluate, readBrowserResponseBody, diagnostics) : undefined);
    observations.push({kind:"validation-ready", observedAt:Date.now(), ...control, ...(proof ? {validation:proof.validation} : {})});
    // Record actual dispatch independently from readiness, even if the
    // dashboard never appears. The pointer helper rechecks the captured node
    // after scroll/hover and will not borrow an earlier ok render.
    let dispatch;
    const activation = await clickP805CapturedControl({send:async (method, params) => {
        if (method === "Input.dispatchMouseEvent" && params.type === "mousePressed") {
            if (dispatch) fail("Create game must receive exactly one pointer activation");
            if (proof && latestP805CreatorValidationRequest(cdp)?.params.requestId !== proof.validation.browserRequestId) {
                fail(`Missing Create game validation network evidence before pointer dispatch: superseded-validation; validated request: ${proof.validation.browserRequestId}; latest request: ${latestP805CreatorValidationRequest(cdp)?.params.requestId}`);
            }
            dispatch = {kind:"pointer-dispatch", controlId:control.controlId, dispatchedAt:Date.now(), count:1, pressed:false, released:false};
            observations.push(dispatch);
        }
        const result = await cdp.send(method, params);
        if (method === "Input.dispatchMouseEvent" && params.type === "mousePressed") dispatch.pressed = true;
        if (method === "Input.dispatchMouseEvent" && params.type === "mouseReleased") dispatch.released = true;
        return result;
    }}, evaluate, control.controlId, false, true, true);
    Object.assign(dispatch, {capturedControlId:activation.capturedControlId, captureKey:activation.captureKey,
        preDispatchFocus:activation.preDispatchFocus, hitTest:activation.hitTest, nativeDispatch:activation.dispatch});
    const nativeValidation = activation.dispatch.focus;
    if (nativeValidation.trusted !== true || nativeValidation.validationState !== "ok" || nativeValidation.enabled !== true
        || ![null, "false"].includes(nativeValidation.ariaBusy)) {
        fail(`Create game native pointer did not retain its rendered validation-ready boundary: ${JSON.stringify(nativeValidation)}`);
    }
    const dashboard = await waitForP805CreatedDashboard(evaluate, dashboardTimeout);
    observations.push({kind:"dashboard-transition", observedAt:Date.now(), ...dashboard});
    return {control:{stableControlId:control.controlId, identityAttribute:"id", accessibleName:control.accessibleName,
        validationState:control.validationState, keyboardFocused:activation.preDispatchFocus.native, enabled:control.enabled, disabled:!control.enabled},
        validation:proof?.validation, activation:{kind:"pointer", controlId:control.controlId, count:1, ...activation}, dashboard};
}

/** Observe the latest browser validation and its rendered Create game state.
 * An older completed response must not authorize a newer, still-pending check. */
const latestP805CreatorValidationRequest = (cdp) => cdp.events.findLast((event) => event.method === "Network.requestWillBeSent"
    && event.params.request.method === "POST" && new URL(event.params.request.url).pathname === "/api/home/blueprints/validate");
export async function observeP805CreatorValidation(cdp, evaluate, readBrowserResponseBody, diagnostics = {}) {
    const validationPath = "/api/home/blueprints/validate";
    const latestRequest = () => latestP805CreatorValidationRequest(cdp);
    const request = latestRequest();
    if (!request) {
        diagnostics.phase = "missing-request";
        return false;
    }
    const browserRequestId = request.params.requestId;
    diagnostics.browserRequestId = browserRequestId;
    const superseded = () => {
        if (latestRequest()?.params.requestId === browserRequestId) return false;
        diagnostics.phase = "superseded-validation";
        return true;
    };
    const failed = cdp.events.findLast((event) => event.method === "Network.loadingFailed" && event.params.requestId === browserRequestId);
    if (failed) {
        diagnostics.phase = "loading-failed";
        fail(`initial rendered Design validation failed to complete: ${failed.params.errorText}`);
    }
    const response = cdp.events.findLast((event) => event.method === "Network.responseReceived" && event.params.requestId === browserRequestId && new URL(event.params.response.url).pathname === validationPath);
    if (!response) {
        diagnostics.phase = "missing-response";
        return false;
    }
    if (!cdp.events.some((event) => event.method === "Network.loadingFinished" && event.params.requestId === browserRequestId)) {
        diagnostics.phase = "missing-completion";
        return false;
    }
    diagnostics.phase = "unreadable-response-body";
    let body;
    try {
        body = await readBrowserResponseBody(browserRequestId, "initial rendered Design validation");
    } catch (error) {
        // A focus/field edit can replace this request while DevTools reads its body. An obsolete
        // body (including one evicted by navigation) must not fail the current draft's proof.
        if (superseded()) return false;
        throw error;
    }
    if (superseded()) return false;
    const bytes = body.base64Encoded ? Buffer.from(body.body, "base64") : Buffer.from(body.body);
    const payload = JSON.parse(bytes.toString("utf8"));
    diagnostics.phase = "rejected-response";
    if (response.params.response.status !== 200 || payload.status !== "ok") fail(`initial rendered Design validation did not accept the starter game: HTTP ${response.params.response.status}, status ${payload.status}`);
    diagnostics.phase = "dom-unready";
    const control = await evaluate("(() => { if (document.readyState !== 'complete' || location.hash !== '#/home/design') return false; const item=document.getElementById('blueprint-create-game'); if (!(item instanceof HTMLButtonElement) || item.disabled || item.getAttribute('data-pokie-validation-state') !== 'ok' || ![null, 'false'].includes(item.getAttribute('aria-busy')) || item.textContent?.trim() !== 'Create game' || item.getClientRects().length === 0) return false; item.focus({preventScroll:true}); return document.activeElement === item ? {stableControlId:item.id, validationState:item.getAttribute('data-pokie-validation-state')} : false; })()");
    if (superseded()) return false;
    if (!control) return false;
    diagnostics.phase = "ready";
    return {control, validation:{browserRequestId, payload, status:response.params.response.status, completed:true, bodySha256:digest(bytes), responseSha256:digest(JSON.stringify(payload)), renderedValidation:{controlId:control.stableControlId, status:control.validationState}}};
}
// A routed dashboard can expose its shell before its context and dependent
// tabs render. Do not capture that transitional shell's disclosure control.
export async function observeP805NavigationReadiness(evaluate, route) {
    return evaluate(`(()=>{
        const item=[...document.querySelectorAll('[data-pokie-lifecycle="navigation"]')].find((candidate)=>candidate.getAttribute('data-pokie-lifecycle-route')===${JSON.stringify(route)});
        if(!(item instanceof HTMLElement)||!item.id||('disabled' in item&&item.disabled)||item.getClientRects().length===0)return false;
        const currentRoute=location.hash;
        let terminal=null;
        if(currentRoute.startsWith('#/project/')){
            const selectedRoute=currentRoute.split('?')[0].split('/').at(-1);
            const result=[...document.querySelectorAll('[data-pokie-lifecycle-result="navigation"]')].find((candidate)=>candidate.getAttribute('data-pokie-lifecycle-route')===selectedRoute&&candidate.getAttribute('data-pokie-lifecycle-result-control')==='project-tab:'+selectedRoute);
            if(!(result instanceof HTMLElement)||result.getClientRects().length===0)return false;
            terminal=result.getAttribute('data-pokie-lifecycle-terminal');
            if(!['rendered','error'].includes(terminal))return false;
        }
        return {controlId:item.id,currentRoute,terminal};
    })()`);
}
// Both the packed runner and its bounded Chromium regression use this one
// native pointer boundary. Post-activation control replacement is permitted;
// pre-dispatch identity, focus, and hit testing remain mandatory.
export async function activateP805KeyboardControl(cdp, evaluate, controlId) {
    const captureKey = randomBytes(16).toString("hex");
    const captured = await evaluate(`(()=>{
        const item=document.getElementById(${JSON.stringify(controlId)});
        if(!(item instanceof HTMLElement)||!item.isConnected||item.disabled||document.activeElement!==item)return null;
        const key=item instanceof HTMLInputElement&&item.type==='radio'?' ':'Enter';
        const receipt={kind:'native-keyboard',key,pressed:false,released:false,keyDownCount:0,keyUpCount:0,focus:null};
        const capture=(event)=>{
            if(event.key!==key)return;
            if(event.type==='keydown'){
                receipt.keyDownCount++;receipt.pressed=true;
                receipt.focus={controlId:item.id,native:document.activeElement===item,trusted:event.isTrusted,targetMatchesCapturedControl:event.target===item||item.contains(event.target)};
            }else{receipt.keyUpCount++;receipt.released=event.isTrusted;}
        };
        document.addEventListener('keydown',capture,true);document.addEventListener('keyup',capture,true);
        window.__p805KeyboardReceipts??=new Map();window.__p805KeyboardReceipts.set(${JSON.stringify(captureKey)},{capture,receipt});
        return {key,preDispatchFocus:{controlId:item.id,native:true}};
    })()`);
    if (!captured) fail(`rendered ${controlId} lost native keyboard focus`);
    let dispatch;
    try {
        if (captured.key === ' ') {
            await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:" ", code:"Space", text:" ", windowsVirtualKeyCode:32, nativeVirtualKeyCode:32});
            await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:" ", code:"Space", windowsVirtualKeyCode:32, nativeVirtualKeyCode:32});
        } else await pressP805Enter(cdp);
    } finally {
        // Always remove observers, including rejected native dispatches.
        dispatch = await evaluate(`(()=>{const record=window.__p805KeyboardReceipts?.get(${JSON.stringify(captureKey)});if(record){document.removeEventListener('keydown',record.capture,true);document.removeEventListener('keyup',record.capture,true);}window.__p805KeyboardReceipts?.delete(${JSON.stringify(captureKey)});return record?.receipt;})()`);
    }
    const activation = {kind:"keyboard", controlId, count:1, nativeFocus:true, preDispatchFocus:captured.preDispatchFocus, dispatch};
    if (!hasP805NativeActivation(activation, controlId)) fail(`rendered ${controlId} did not receive one native keyboard activation`);
    return activation;
}
export async function setP805ReplayArtifactInput(cdp, evaluate, text) {
    const ready = await evaluate(`(()=>{const item=document.getElementById('replay-artifact-json');if(!(item instanceof HTMLTextAreaElement)||item.disabled)return false;item.scrollIntoView({block:'center',inline:'nearest'});item.focus({preventScroll:true});item.select();return document.activeElement===item;})()`);
    if (!ready) fail("Replay Artifact input is not ready for native text entry");
    await cdp.send("Input.insertText", {text});
    await waitFor(() => evaluate(`document.getElementById('replay-artifact-json')?.value === ${JSON.stringify(text)}`), "native Replay Artifact text entry");
}
export async function clickP805CapturedControl(cdp, evaluate, stableControlId, requireViewportHit = false, completePointerState = false, scrollIntoViewIfNeeded = requireViewportHit, retainCapturedControl = false) {
    // A control can be rendered yet sit below the compact viewport.
    // CDP accepts that off-screen coordinate without giving React a
    // pointer event, which used to leave the Replay Load transition
    // in its precondition state and let the tuple time out. Bring the
    // exact captured control into the rendered viewport and prove its
    // hit target before issuing its single browser pointer activation.
    if (stableControlId === "blueprint-create-game") {
        const control = await evaluate(p805CreateControlExpression);
        if (!isP805CreateValidationReady(control)) fail(`Missing rendered Create game validation-ready boundary before pointer dispatch; readiness: ${p805CreateReadinessPhase(control)}; control: ${JSON.stringify(control)}`);
    }
    const captureKey = randomBytes(16).toString("hex");
    const capturePoint = async () => evaluate(`(()=>{
        const item=document.getElementById(${JSON.stringify(stableControlId)});
        if(!(item instanceof HTMLElement)||item.disabled)return null;
        if(item.id==='blueprint-create-game'&&(item.getAttribute('data-pokie-validation-state')!=='ok'||![null,'false'].includes(item.getAttribute('aria-busy'))))return null;
        if(${JSON.stringify(scrollIntoViewIfNeeded)})item.scrollIntoView({behavior:'instant',block:'center',inline:'nearest'});
        item.focus({preventScroll:true});
        const preDispatchFocus={controlId:item.id,native:document.activeElement===item};
        const box=item.getBoundingClientRect(),x=box.left+box.width/2,y=box.top+box.height/2,hit=document.elementFromPoint(x,y);
        const matchesCapturedControl=hit===item||item.contains(hit);
        const capturedControl={controlId:item.id,preDispatchFocus,hitTest:{capturedControlId:item.id,targetId:hit instanceof HTMLElement?hit.id||null:null,targetRole:hit instanceof HTMLElement?hit.getAttribute('role')||hit.tagName.toLowerCase():null,matchesCapturedControl}};
        window.__p805CapturedControls??=new Map();window.__p805PointerDispatchReceipts??=new Map();
        const receipt={dispatch:null,pointerDownCount:0,pointerUpCount:0,clickCount:0,eventsTrusted:true,targetsMatchCapturedControl:true};
        const capture=(event)=>{
            const target=event.target,matches=target===item||item.contains(target);
            receipt.eventsTrusted&&=event.isTrusted;
            receipt.targetsMatchCapturedControl&&=matches;
            if(event.type==='pointerup')receipt.pointerUpCount++;
            if(event.type==='click')receipt.clickCount++;
            if(event.type!=='pointerdown')return;
            receipt.pointerDownCount++;
            if(receipt.dispatch!==null)return;
            receipt.dispatch={eventType:event.type,trusted:event.isTrusted,validationState:item.getAttribute('data-pokie-validation-state'),enabled:!item.disabled,ariaBusy:item.getAttribute('aria-busy'),controlId:capturedControl.controlId,native:document.activeElement===item,targetId:target instanceof HTMLElement?target.id||null:null,targetRole:target instanceof HTMLElement?target.getAttribute('role')||target.tagName.toLowerCase():null,targetMatchesCapturedControl:matches};
        };
        for(const type of ['pointerdown','pointerup','click'])document.addEventListener(type,capture,true);
        window.__p805CapturedControls.set(${JSON.stringify(captureKey)},item);
        window.__p805PointerDispatchReceipts.set(${JSON.stringify(captureKey)},{capture,receipt,capturedControl});
        return box.width>0&&box.height>0&&preDispatchFocus.native&&matchesCapturedControl&&(!${JSON.stringify(requireViewportHit)}||(box.left>=0&&box.right<=window.innerWidth&&box.top>=0&&box.bottom<=window.innerHeight))?{x,y,capturedControlId:capturedControl.controlId,captureKey:${JSON.stringify(captureKey)},preDispatchFocus:capturedControl.preDispatchFocus,hitTest:capturedControl.hitTest}:null;
    })()`);
    const removeCapture = () => evaluate(`(()=>{
        const record=window.__p805PointerDispatchReceipts?.get(${JSON.stringify(captureKey)});
        if(record){for(const type of ['pointerdown','pointerup','click'])document.removeEventListener(type,record.capture,true);window.__p805PointerDispatchReceipts.delete(${JSON.stringify(captureKey)});}
        window.__p805CapturedControls?.delete(${JSON.stringify(captureKey)});
    })()`);
    let point = await waitFor(async () => {
        const captured = await capturePoint();
        if (captured) return captured;
        await removeCapture();
        return false;
    }, `rendered ${stableControlId} browser click target`);
    if (!point) {
        await removeCapture();
        fail("rendered control lost its visible browser click target");
    }
    try {
        // Portal and terminal transitions can move the original control after
        // capture. Keep that node's identity, settle only animations affecting
        // it, and measure its live point again. Never resolve a replacement by id
        // or dispatch through a wrapper/overlay that fails the native hit-test.
        let settled = false;
        for (let attempt = 0; attempt < 4; attempt += 1) {
            await cdp.send("Input.dispatchMouseEvent", {type:"mouseMoved", x:point.x, y:point.y, ...(completePointerState ? {pointerType:"mouse"} : {})});
            const readyToPress = await evaluate(`(async()=>{
                const item=window.__p805CapturedControls?.get(${JSON.stringify(captureKey)});
                const record=window.__p805PointerDispatchReceipts?.get(${JSON.stringify(captureKey)});
                const sameControl=()=>item instanceof HTMLElement&&item.isConnected&&!item.disabled&&document.getElementById(${JSON.stringify(stableControlId)})===item&&!!record&&(item.id!=='blueprint-create-game'||(item.getAttribute('data-pokie-validation-state')==='ok'&&[null,'false'].includes(item.getAttribute('aria-busy'))));
                if(!sameControl())return null;
                // Hover and responsive layout can commit on the following
                // frame without an animation being registered yet. Flush
                // those frames on the captured node before inspecting its
                // animations and live hit target; never resolve another node.
                await new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
                if(!sameControl())return null;
                const animations=document.getAnimations().filter((animation)=>{
                    const target=animation.effect?.target;
                    return target instanceof Element&&(target===item||target.contains(item))&&animation.playState!=='finished';
                });
                if(animations.length){
                    let timeout;
                    const finished=await Promise.race([
                        Promise.all(animations.map((animation)=>animation.finished.catch(()=>undefined))).then(()=>true),
                        new Promise((resolve)=>{timeout=setTimeout(()=>resolve(false),1000);}),
                    ]);
                    clearTimeout(timeout);
                    if(!finished||!sameControl())return null;
                }
                item.focus({preventScroll:true});
                // Import panels and mobile scrolling can reflow the table
                // without registering an animation on this control's ancestors.
                // Require its geometry and viewport to settle on the same node
                // before handing its coordinates to the native press.
                const layoutSettled=await new Promise((resolve)=>{
                    let frame,previous=null,stableSince=null;
                    const finish=(value)=>{clearTimeout(timer);cancelAnimationFrame(frame);resolve(value);};
                    const timer=setTimeout(()=>finish(false),2000);
                    const sample=(time)=>{
                        if(!sameControl()){finish(false);return;}
                        const box=item.getBoundingClientRect(),viewport=window.visualViewport;
                        const hit=document.elementFromPoint(box.left+box.width/2,box.top+box.height/2);
                        // A sibling overlay or scrolling table can change the
                        // hit target while this button's rectangle stays still.
                        // Settle the actual hit region, not geometry alone.
                        if(!(hit===item||item.contains(hit))){previous=null;stableSince=null;frame=requestAnimationFrame(sample);return;}
                        const signature=JSON.stringify([box.left,box.top,box.width,box.height,scrollX,scrollY,viewport?.offsetLeft,viewport?.offsetTop,viewport?.scale]);
                        if(signature!==previous){previous=signature;stableSince=time;}
                        else if(time-stableSince>=100){finish(true);return;}
                        frame=requestAnimationFrame(sample);
                    };
                    frame=requestAnimationFrame(sample);
                });
                if(!layoutSettled||!sameControl())return null;
                const box=item.getBoundingClientRect(),x=box.left+box.width/2,y=box.top+box.height/2;
                const hit=document.elementFromPoint(x,y);
                const preDispatchFocus={controlId:item.id,native:document.activeElement===item};
                const hitTest={capturedControlId:item.id,targetId:hit instanceof HTMLElement?hit.id||null:null,targetRole:hit instanceof HTMLElement?hit.getAttribute('role')||hit.tagName.toLowerCase():null,matchesCapturedControl:hit===item||item.contains(hit)};
                if(!sameControl()||box.width<=0||box.height<=0||!preDispatchFocus.native||!hitTest.matchesCapturedControl||(${JSON.stringify(requireViewportHit)}&&(box.left<0||box.right>window.innerWidth||box.top<0||box.bottom>window.innerHeight)))return null;
                // The capture-phase dispatch listener retains this same receipt
                // object; update its measured boundary without replacing its node.
                record.capturedControl.preDispatchFocus=preDispatchFocus;
                record.capturedControl.hitTest=hitTest;
                return {x,y,preDispatchFocus,hitTest};
            })()`);
            if (!readyToPress) {
                const diagnostic = await evaluate(`(()=>{
                    const captured=window.__p805CapturedControls?.get(${JSON.stringify(captureKey)}), current=document.getElementById(${JSON.stringify(stableControlId)});
                    const box=captured instanceof HTMLElement?captured.getBoundingClientRect():null,hit=box?document.elementFromPoint(box.left+box.width/2,box.top+box.height/2):null;
                    return {controlId:${JSON.stringify(stableControlId)},capturedConnected:captured?.isConnected===true,identityPreserved:current===captured,enabled:captured instanceof HTMLElement&&!captured.disabled,nativeFocus:document.activeElement===captured,hitMatchesCaptured:hit===captured||captured?.contains(hit)===true,hitTargetId:hit instanceof HTMLElement?hit.id||null:null,viewport:{width:window.innerWidth,height:window.innerHeight},box:box?{left:box.left,right:box.right,top:box.top,bottom:box.bottom}:null};
                })()`);
                fail((stableControlId === "blueprint-create-game"
                    ? "Missing rendered Create game validation-ready boundary before pointer dispatch: captured control lost validation, identity, focus, or hit target"
                    : "rendered control changed its captured identity, native focus, or hit target before pointer dispatch") + `; captured boundary: ${JSON.stringify(diagnostic)}`);
            }
            const samePoint = readyToPress.x === point.x && readyToPress.y === point.y;
            point = {...point, ...readyToPress};
            if (samePoint) {
                settled = true;
                break;
            }
            // Move the same gesture to the measured point, then verify it again.
            // Only the single press/release below can activate the public control.
        }
        if (!settled) fail("rendered control did not settle its captured hit target before pointer dispatch");
        const pointer = completePointerState ? {buttons:1, pointerType:"mouse"} : {};
        await cdp.send("Input.dispatchMouseEvent", {type:"mousePressed", x:point.x, y:point.y, button:"left", ...pointer, clickCount:1});
        await cdp.send("Input.dispatchMouseEvent", {type:"mouseReleased", x:point.x, y:point.y, button:"left", ...(completePointerState ? {buttons:0, pointerType:"mouse"} : {}), clickCount:1});
        // Chromium may change activeElement as the native press starts.
        // The public-action boundary is the focus and hit-test captured
        // immediately before that press, so preserve those observed facts
        // rather than treating a post-dispatch focus transfer as a second
        // control identity.
        const observed = await evaluate(`(()=>{
            const record=window.__p805PointerDispatchReceipts?.get(${JSON.stringify(captureKey)});
            if(record){for(const type of ['pointerdown','pointerup','click'])document.removeEventListener(type,record.capture,true);window.__p805PointerDispatchReceipts.delete(${JSON.stringify(captureKey)});}
            if(!${JSON.stringify(retainCapturedControl)})window.__p805CapturedControls?.delete(${JSON.stringify(captureKey)});
            const capturedControl=record?.capturedControl,receipt=record?.receipt,dispatch=receipt?.dispatch;
            return {pointerDownCount:receipt?.pointerDownCount,pointerUpCount:receipt?.pointerUpCount,clickCount:receipt?.clickCount,eventsTrusted:receipt?.eventsTrusted===true,targetsMatchCapturedControl:receipt?.targetsMatchCapturedControl===true,focus:{
                observedAt:'pre-dispatch',eventType:dispatch?.eventType??null,trusted:dispatch?.trusted===true,
                validationState:dispatch?.validationState??null,enabled:dispatch?.enabled===true,ariaBusy:dispatch?.ariaBusy??null,
                controlId:capturedControl?.controlId??null,native:capturedControl?.preDispatchFocus?.native===true,atDispatchNative:dispatch?.native===true,
                hitTest:capturedControl?.hitTest??null,targetId:dispatch?.targetId??null,targetRole:dispatch?.targetRole??null,targetMatchesCapturedControl:dispatch?.targetMatchesCapturedControl===true
            }};
        })()`);
        // Native focus is measured immediately before the press on the exact
        // captured node. Chromium or a capture-phase product handler can move
        // it during dispatch; retain that separate observation without
        // relabelling it as lost identity. All three trusted native events
        // must still target this node, and only one click may authorize it.
        const dispatch = {kind:"native-pointer", pressed:true, released:true, buttons:completePointerState ? 1 : 0, pointerType:completePointerState ? "mouse" : null, ...observed};
        const activation = {kind:"pointer", count:1, controlId:stableControlId, ...point, dispatch};
        if (!hasP805NativeActivation(activation, stableControlId)) fail(`rendered control lost native focus or its captured hit target at pointer dispatch; captured boundary: ${JSON.stringify(activation)}`);
        return {...point, dispatch};
    } catch (error) {
        await removeCapture();
        throw error;
    }
}
export async function observeP805PointerTerminal(evaluate, transaction, receipt) {
    const pointer = transaction.pointerActivations?.[0];
    if (!pointer) return false;
    return await evaluate(`(()=>{
        const captured=window.__p805CapturedControls?.get(${JSON.stringify(pointer.captureKey)});
        const current=document.getElementById(${JSON.stringify(transaction.control?.stableControlId)});
        const result=[...document.querySelectorAll('[data-pokie-lifecycle-result]')].find((item)=>item instanceof HTMLElement&&!!(item.offsetWidth||item.offsetHeight||item.getClientRects().length)&&item.getAttribute('data-pokie-lifecycle-result-control')===${JSON.stringify(transaction.control?.stableControlId)}&&item.getAttribute('data-pokie-lifecycle-result-operation')===${JSON.stringify(transaction.operation)}&&item.getAttribute('data-pokie-lifecycle-result-state')===${JSON.stringify(transaction.stateClass)}&&item.getAttribute('data-pokie-lifecycle-terminal')===${JSON.stringify(receipt.status)}&&item.getAttribute('data-pokie-lifecycle-result-receipt')==='durable-terminal'&&item.getAttribute('data-pokie-lifecycle-result-durable-status')===${JSON.stringify(receipt.status)}&&(${JSON.stringify(receipt.result?.id ?? null)}===null||(item.getAttribute('data-pokie-lifecycle-result-job')===${JSON.stringify(receipt.result?.id ?? null)}&&item.getAttribute('data-pokie-lifecycle-result-durable-job')===${JSON.stringify(receipt.result?.id ?? null)})));
        if (!(result instanceof HTMLElement)) return false;
        const capturedControlId=captured instanceof HTMLElement?captured.id:null;
        const controlState=!(captured instanceof HTMLElement)?'missing':current===null?'removed':current===captured?'retained':'replaced';
        const capturedControlConnected=captured instanceof HTMLElement&&captured.isConnected;
        window.__p805CapturedControls?.delete(${JSON.stringify(pointer.captureKey)});
        return {capturedControlId,captureKey:${JSON.stringify(pointer.captureKey)},preDispatchEvidence:{capturedControlId:${JSON.stringify(pointer.capturedControlId)},focus:${JSON.stringify(pointer.preDispatchFocus)},hitTest:${JSON.stringify(pointer.hitTest)},dispatch:${JSON.stringify(pointer.dispatch)}},controlState,currentControlId:current instanceof HTMLElement?current.id:null,capturedControlConnected,activeElementId:document.activeElement instanceof HTMLElement?document.activeElement.id||null:null,requestId:${JSON.stringify(transaction.request?.browserRequestId)},resultSha256:${JSON.stringify(receipt.resultSha256)},renderedTerminal:result instanceof HTMLElement,resultControlId:result instanceof HTMLElement?result.getAttribute('data-pokie-lifecycle-result-control'):null,resultOperation:result instanceof HTMLElement?result.getAttribute('data-pokie-lifecycle-result-operation'):null,resultStateClass:result instanceof HTMLElement?result.getAttribute('data-pokie-lifecycle-result-state'):null,resultReceipt:result instanceof HTMLElement?result.getAttribute('data-pokie-lifecycle-result-receipt'):null,resultJobId:result instanceof HTMLElement?result.getAttribute('data-pokie-lifecycle-result-durable-job'):null,resultTerminal:result instanceof HTMLElement?result.getAttribute('data-pokie-lifecycle-result-durable-status'):null};
    })()`);
}

export function validateP805BlueprintMutationResponse(pathname, status, payload) {
    // Validation is a 200 response; a successful save is a 201 even when
    // overwriting an existing Blueprint. Domain errors may themselves be 200.
    const expectedStatus = pathname === "/api/home/blueprints/validate" ? 200
        : pathname === "/api/home/blueprints/save" ? 201 : undefined;
    if (expectedStatus === undefined || status !== expectedStatus || payload?.status !== "ok") fail(`${pathname} did not reach a successful terminal (HTTP ${status}: ${JSON.stringify(payload)})`);
    return payload;
}
export async function pressP805Enter(cdp) {
    await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:"Enter", code:"Enter", text:"\r", unmodifiedText:"\r", windowsVirtualKeyCode:13, nativeVirtualKeyCode:13});
    // One held physical activation lets portal-backed controls receive their
    // native default action before the matching release. This is not a retry.
    await wait(50);
    await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:"Enter", code:"Enter", windowsVirtualKeyCode:13, nativeVirtualKeyCode:13});
}
function optionsFrom(argv) { const args = argv.slice(2), values = {}; for (let index = 0; index < args.length; index += 2) { if (!args[index]?.startsWith("--") || values[args[index]] || args[index + 1] === undefined) fail("usage: --persona <persona> --phase <initial|retest> --candidate <sha> --package-sha256 <sha> --candidate-executable-sha256 <sha> --candidate-executable-receipt <absolute-json> --candidate-executable-receipt-sha256 <sha256> --packed-package <absolute-tgz> --output <absolute-path> [--packed-cli <absolute-path>] [--runtime-root <absolute-path> --runtime-identity-receipt <absolute-json> --runtime-identity-receipt-sha256 <sha256>] [--workflow-personas <comma-separated-personas>] [--observation <observation> --viewport <wide|compact|narrow>]"); values[args[index]] = args[index + 1]; } const persona = values["--persona"], observation = values["--observation"], viewport = values["--viewport"], runtimeRoot = values["--runtime-root"]; return {persona, workflowPersonas:(values["--workflow-personas"] ?? persona ?? "").split(",").filter(Boolean), phase:values["--phase"], candidateId:values["--candidate"], candidatePackageSha256:values["--package-sha256"], candidateExecutableSha256:values["--candidate-executable-sha256"], candidateExecutableReceipt:{path:values["--candidate-executable-receipt"], sha256:values["--candidate-executable-receipt-sha256"]}, packedPackage:values["--packed-package"], output:values["--output"], packedCli:values["--packed-cli"] ?? path.join(root, "dist/cli/pokie.js"), runtime:runtimeRoot === undefined ? undefined : {root:runtimeRoot, receipt:{path:values["--runtime-identity-receipt"], sha256:values["--runtime-identity-receipt-sha256"]}}, tuple:observation === undefined && viewport === undefined ? undefined : {persona, observation, viewport}, tupleReceiptPath:values["--tuple-receipt"], tupleCleanupPath:values["--tuple-cleanup"]}; }
function validOptions(value) { const tuple = value?.tuple, runtime = value?.runtime, validRuntime = runtime === undefined || path.isAbsolute(runtime.root ?? "") && path.isAbsolute(runtime.receipt?.path ?? "") && /^[a-f0-9]{64}$/i.test(runtime.receipt?.sha256 ?? ""); return P805_PERSONAS.includes(value?.persona) && Array.isArray(value?.workflowPersonas) && value.workflowPersonas.length > 0 && value.workflowPersonas.every((persona) => P805_PERSONAS.includes(persona)) && new Set(value.workflowPersonas).size === value.workflowPersonas.length && validRuntime && (!tuple || tuple.persona === value.persona && value.workflowPersonas.length === 1 && value.workflowPersonas[0] === value.persona && P805_REQUIRED_OBSERVATIONS[value.persona]?.includes(tuple.observation) && ["wide", "compact", "narrow"].includes(tuple.viewport) && path.isAbsolute(value.tupleReceiptPath ?? "") && path.isAbsolute(value.tupleCleanupPath ?? "")) && ["initial", "retest"].includes(value.phase) && /^[a-f0-9]{40}$/i.test(value.candidateId ?? "") && /^[a-f0-9]{64}$/i.test(value.candidatePackageSha256 ?? "") && /^[a-f0-9]{64}$/i.test(value.candidateExecutableSha256 ?? "") && path.isAbsolute(value?.candidateExecutableReceipt?.path ?? "") && /^[a-f0-9]{64}$/i.test(value?.candidateExecutableReceipt?.sha256 ?? "") && ["output", "packedPackage"].every((key) => path.isAbsolute(value[key] ?? "")); }
function validProcessProofOptions(value) { return value?.persona === "all" && value.workflowPersonas.length === 1 && value.workflowPersonas[0] === "all" && ["initial", "retest"].includes(value.phase) && /^[a-f0-9]{40}$/i.test(value.candidateId ?? "") && /^[a-f0-9]{64}$/i.test(value.candidatePackageSha256 ?? "") && /^[a-f0-9]{64}$/i.test(value.candidateExecutableSha256 ?? "") && path.isAbsolute(value?.candidateExecutableReceipt?.path ?? "") && /^[a-f0-9]{64}$/i.test(value?.candidateExecutableReceipt?.sha256 ?? "") && ["output", "packedPackage"].every((key) => path.isAbsolute(value[key] ?? "")); }

function childResult(child, label, expectedExitCode = 0, timeoutMs = 120_000, abortSignal, terminateOnTimeout = true) {
    return new Promise((resolve, reject) => {
        let stdout = "", stderr = "";
        let settled = false;
        const cancel = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            abortSignal.removeEventListener("abort", cancel);
            reject(new Error(`${label} cancelled`));
        };
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            abortSignal?.removeEventListener("abort", cancel);
            // Tuple parents authenticate retained receipts and capture the
            // ownership registry before the supervisor terminates the worker.
            // Standalone CLI callers retain their existing timeout signal.
            if (terminateOnTimeout) child.kill("SIGTERM");
            reject(new Error(`${label} exceeded its ${timeoutMs}ms public-command budget`));
        }, timeoutMs);
        const complete = (code, signal) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            abortSignal?.removeEventListener("abort", cancel);
            const result = {label, exitCode:code, signal, stdout, stderr};
            if (expectedExitCode != null && code !== expectedExitCode) reject(new Error(`${label} exited ${code ?? "null"}: ${stderr || stdout}`));
            else resolve(result);
        };
        child.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
        child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
        child.once("error", (error) => { if (!settled) { settled = true; clearTimeout(timer); abortSignal?.removeEventListener("abort", cancel); reject(error); } });
        child.once("exit", complete);
        // A few wrapped launchers close their handles before Node delivers an
        // exit notification.  The close status is still the public command's
        // terminal status, so retain it as an equivalent bounded completion.
        child.once("close", complete);
        abortSignal?.addEventListener("abort", cancel, {once:true});
        if (abortSignal?.aborted) cancel();
    });
}

/** Bind every installed executable to the verified canonical package bytes and
 * retain a digest of that exact executable manifest.  package.json bytes
 * alone are not an executable provenance claim. */
async function candidateExecutableManifest(installedRoot, candidateId, services) {
    const files = [];
    const collect = async (directory, relative = "") => {
        for (const entry of await readdir(directory, {withFileTypes:true})) {
            const next = path.join(relative, entry.name), target = path.join(directory, entry.name);
            if (entry.isDirectory()) await collect(target, next);
            else if (entry.isFile() && (next === "package.json" || next.startsWith(`dist${path.sep}`))) files.push(next.replaceAll(path.sep, "/"));
        }
    };
    await collect(installedRoot);
    if (!files.some((value) => value === "package.json") || !files.some((value) => value.startsWith("dist/"))) fail("packed archive has no installed executable package contents");
    const entries = [];
    for (const file of files.sort()) {
        const installed = await services.readFile(path.join(installedRoot, file));
        entries.push({path:file, sha256:digest(installed)});
    }
    const packageJson = JSON.parse((await services.readFile(path.join(installedRoot, "package.json"))).toString("utf8"));
    if (packageJson.gitHead !== undefined && packageJson.gitHead !== candidateId) fail("packed archive gitHead is not the declared candidate");
    return {sha256:digest(JSON.stringify(entries)), files:entries.length};
}

/**
 * Calculate the same executable projection from the declared git tree before
 * accepting an archive.  The candidate commit is the authority here: a
 * campaign argument cannot turn an arbitrary archive into that commit merely
 * by repeating a digest supplied by the campaign itself.
 */
function candidateTreeExecutableManifest(candidateId) {
    // `dist` is deliberately not committed.  Bind a receipt to the complete
    // *source projection* that produces the packed executable instead of
    // pretending package.json alone identifies the JavaScript in an archive.
    // The external pack verifier then binds its independently calculated dist
    // projection to this immutable candidate source manifest.
    const listing = spawnSync("git", ["ls-tree", "-r", "--name-only", candidateId, "--", "package.json", "package-lock.json", "tsconfig.json", "cli", "src", "scripts", "generate-barrels.js"], {cwd:root, encoding:"utf8"});
    if (listing.status !== 0) fail("declared candidate executable tree cannot be read");
    const files = listing.stdout.split("\n").filter(Boolean).filter((file) => file === "package.json" || file === "package-lock.json" || file === "tsconfig.json" || file === "generate-barrels.js" || file.startsWith("cli/") || file.startsWith("src/") || file.startsWith("scripts/"));
    if (!files.includes("package.json")) fail("declared candidate has no package declaration");
    const entries = files.sort().map((file) => {
        const object = spawnSync("git", ["rev-parse", `${candidateId}:${file}`], {cwd:root, encoding:"utf8"});
        if (object.status !== 0 || !/^[a-f0-9]{40}$/i.test(object.stdout.trim())) fail(`declared candidate cannot resolve executable ${file}`);
        return {path:file, gitBlob:object.stdout.trim()};
    });
    const tree = spawnSync("git", ["rev-parse", `${candidateId}^{tree}`], {cwd:root, encoding:"utf8"}).stdout.trim();
    if (!/^[a-f0-9]{40}$/i.test(tree)) fail("declared candidate tree cannot be resolved");
    return {candidateId, tree, files:entries, sha256:digest(JSON.stringify({tree, entries}))};
}

/** A pack-producing verifier, not the campaign, attests to the candidate's
 * executable projection.  `gitHead` is useful corroboration but cannot prove
 * that an arbitrary tarball's dist files were packed from that commit. */
async function trustedCandidateExecutableReceipt(receipt, candidateId, packageSha256, executableSha256, services, output) {
    if (!receipt || !path.isAbsolute(receipt.path ?? "") || path.resolve(receipt.path).startsWith(`${path.resolve(output)}${path.sep}`) || !/^[a-f0-9]{64}$/i.test(receipt.sha256 ?? "")) fail("candidate executable receipt must be an external verifier-owned digest");
    let bytes, value;
    try { bytes = await services.readFile(receipt.path); value = JSON.parse(bytes.toString("utf8")); } catch { fail("candidate executable receipt is unreadable JSON"); }
    const authentication = value?.authentication;
    if (digest(bytes) !== receipt.sha256 || value?.kind !== "p8-05-candidate-executable-receipt" || typeof value?.issuer !== "string" || !value.issuer || typeof value?.receiptId !== "string" || !value.receiptId || value?.candidateId !== candidateId || value?.candidatePackageSha256 !== packageSha256 || value?.candidateExecutableSha256 !== executableSha256 || !/^[a-f0-9]{64}$/i.test(value?.candidateTreeManifestSha256 ?? "") || !/^[a-f0-9]{40}$/i.test(value?.candidateTreeObjectId ?? "") || !value?.candidateTreeManifestCandidateId || value.candidateTreeManifestCandidateId !== candidateId || authentication?.scheme !== "verifier-owned-candidate-tree" || typeof authentication?.verifierId !== "string" || !authentication.verifierId || authentication.attestedCandidateId !== candidateId || authentication.attestedCandidateTreeManifestSha256 !== value.candidateTreeManifestSha256 || authentication.attestedExecutableSha256 !== executableSha256 || value.verifiedBuild?.kind !== "p8-05-verified-candidate-build" || value.verifiedBuild.candidateId !== candidateId || !sha(value.verifiedBuild.executableSha256) || value.verifiedBuild.executableFiles < 1 || authentication.attestedBuildSha256 !== digest(JSON.stringify(value.verifiedBuild))) fail("candidate executable receipt is not a trusted candidate-derived manifest");
    return value;
}

async function makeReadOnly(directory, services) {
    for (const entry of await services.readdir(directory, {withFileTypes:true})) {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) await makeReadOnly(target, services);
        else if (entry.isFile()) await services.chmod(target, 0o555);
    }
    await services.chmod(directory, 0o555);
}

/** Only the parent may release its runtime, and only after it has stopped
 * accepting tuple receipts.  Tuple workers never receive this capability. */
async function releaseP805SharedRuntime(runtime, services, retainEvidence = false) {
    if (!runtime?.root || !services.exists(runtime.root)) return {root:runtime?.root, removed:true, alreadyAbsent:true};
    // A passing aggregate is itself an audit artifact.  Retain the sealed
    // installation long enough for its receipt's immutable executable and
    // read-only assertions to remain independently inspectable.  Failure
    // paths still remove this parent-owned resource immediately.
    if (retainEvidence) {
        const writableBits = (await services.stat(runtime.root)).mode & 0o222;
        if (writableBits !== 0) fail("parent-owned immutable packed runtime became writable before receipt retention");
        return {root:runtime.root, removed:false, retained:true, permissions:"read-only-before-any-tuple-child"};
    }
    const makeWritable = async (directory) => {
        for (const entry of await services.readdir(directory, {withFileTypes:true})) {
            const target = path.join(directory, entry.name);
            if (entry.isDirectory()) await makeWritable(target);
            else if (entry.isFile()) await services.chmod(target, 0o755);
        }
        await services.chmod(directory, 0o755);
    };
    await makeWritable(runtime.root);
    await services.rm(runtime.root, {recursive:true, force:true});
    if (services.exists(runtime.root)) fail("parent-owned immutable packed runtime was not drained");
    return {root:runtime.root, removed:true, alreadyAbsent:false};
}

// A local candidate archive still has registry dependencies. Retry only a
// completed npm attempt that reports a transient transport error, with the
// same archive and one shared deadline. No tuple can start before the normal
// package/executable authentication and read-only sealing below succeeds.
export async function installP805PackedRuntime(services, installationRoot, packedPackage, spawnOptions, label, timeoutMs = 900_000) {
    const args = [...services.npmArgs, "install", "--ignore-scripts", "--no-audit", "--no-fund", "--prefix", installationRoot, packedPackage];
    const deadline = Date.now() + timeoutMs, attempts = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) fail(`${label} exceeded its ${timeoutMs}ms public-command budget`);
        const child = services.spawn(services.npm, args, spawnOptions);
        let result;
        try {
            result = await (services.childResult ?? childResult)(child, label, null, remainingMs);
        } finally {
            // Spawn failure and timeout are not transport retries. Await
            // drainage on every attempt before retrying or propagating an
            // error to the parent's failure ledger.
            const drain = await (services.settleInstaller ?? ((installer) => drainProcessTree(installer, 5_000)))(child);
            if (!drain.processTreeDrained || !drain.resourcesDrained) fail(`${label} failed to drain its installer`);
        }
        attempts.push(result);
        if (result.exitCode === 0 && result.signal === null) {
            return {...result, stdout:attempts.map((value) => value.stdout).join("\n"), stderr:attempts.map((value) => value.stderr).join("\n"), attempts};
        }
        const transient = result.exitCode !== null && result.signal === null && /^npm (?:ERR!|error) code (?:ECONNRESET|ETIMEDOUT|EAI_AGAIN)\s*$/m.test(result.stderr);
        if (!transient || attempt === 1) fail(`${label} exited ${result.exitCode ?? "null"}: ${result.stderr || result.stdout}`);
        // The failed process has exited. Discard only its incomplete local
        // installation; retain the isolated npm cache for the second attempt.
        await services.rm(installationRoot, {recursive:true, force:true});
        await services.mkdir(installationRoot, {recursive:true});
    }
}

async function prepareP805SharedRuntime(options, parent, services) {
    const runtimeRoot = path.join(options.output, `${options.phase}-packed-runtime-${parent.nonce}`), runtimeWorkspace = path.join(options.output, `${options.phase}-packed-runtime-workspace-${parent.nonce}`), runtimeConfiguration = path.join(options.output, `${options.phase}-packed-runtime-configuration-${parent.nonce}`), receiptPath = path.join(options.output, `${options.phase}-packed-runtime-${parent.nonce}.json`);
    await Promise.all([runtimeRoot, runtimeWorkspace, runtimeConfiguration].map((directory) => services.mkdir(directory, {recursive:true})));
    const archive = await services.readFile(options.packedPackage);
    if (digest(archive) !== options.candidatePackageSha256) fail("parent packed runtime archive digest differs from declared candidate package identity");
    const result = await installP805PackedRuntime(services, runtimeRoot, options.packedPackage, {cwd:runtimeWorkspace, env:{...process.env, HOME:runtimeConfiguration, XDG_CONFIG_HOME:runtimeConfiguration}, stdio:"pipe"}, "parent immutable packed runtime installation");
    const packageRoot = path.join(runtimeRoot, "node_modules", "pokie"), installedCli = path.join(runtimeRoot, "node_modules", ".bin", process.platform === "win32" ? "pokie.cmd" : "pokie"), packageJson = path.join(packageRoot, "package.json");
    if (!services.exists(installedCli) || !services.exists(packageJson)) fail("parent immutable packed runtime did not expose its public CLI");
    const candidateManifest = JSON.parse(Buffer.from(spawnSync("git", ["show", `${options.candidateId}:package.json`], {cwd:root, encoding:"buffer"}).stdout).toString("utf8")), installedManifest = JSON.parse((await services.readFile(packageJson)).toString("utf8"));
    if (installedManifest?.name !== candidateManifest?.name || installedManifest?.version !== candidateManifest?.version || (installedManifest?.gitHead !== undefined && installedManifest.gitHead !== options.candidateId)) fail("parent immutable packed runtime package metadata is not bound to the candidate");
    const candidateTreeManifest = candidateTreeExecutableManifest(options.candidateId), candidateReceipt = await trustedCandidateExecutableReceipt(options.candidateExecutableReceipt, options.candidateId, options.candidatePackageSha256, options.candidateExecutableSha256, services, options.output), executable = await candidateExecutableManifest(packageRoot, options.candidateId, services);
    if (candidateReceipt.candidateTreeManifestSha256 !== candidateTreeManifest.sha256 || candidateReceipt.candidateTreeObjectId !== candidateTreeManifest.tree || executable.sha256 !== options.candidateExecutableSha256) fail("parent immutable packed runtime executable manifest differs from the verifier-supplied candidate");
    await Promise.all([services.rm(runtimeWorkspace, {recursive:true, force:true}), services.rm(runtimeConfiguration, {recursive:true, force:true})]);
    await makeReadOnly(runtimeRoot, services);
    const receipt = {schemaVersion:1, kind:"p8-05-immutable-packed-runtime", phase:options.phase, candidateId:options.candidateId, candidatePackageSha256:options.candidatePackageSha256, candidateExecutableSha256:options.candidateExecutableSha256, candidateExecutableReceiptSha256:options.candidateExecutableReceipt.sha256, candidateTreeManifestSha256:candidateTreeManifest.sha256, runtimeRoot, packageRoot, installedCli, archiveSha256:digest(archive), installation:{count:1, attempts:result.attempts.map(({exitCode, signal, stdout, stderr}) => ({exitCode, signal, outputSha256:digest(`${stdout}${stderr}`)})), command:"npm install --ignore-scripts --no-audit --no-fund", stdoutSha256:digest(`${result.stdout}${result.stderr}`)}, permissions:"read-only-before-any-tuple-child", parent};
    const contents = `${JSON.stringify(receipt, null, 2)}\n`;
    await writeImmutableReceipt(receiptPath, contents, services);
    return {root:runtimeRoot, receipt:{path:receiptPath, sha256:digest(contents)}, value:receipt};
}

async function trustedSharedRuntime(runtime, options, services) {
    if (!runtime) return undefined;
    let bytes, value;
    try { bytes = await services.readFile(runtime.receipt.path); value = JSON.parse(bytes.toString("utf8")); } catch { fail("tuple child cannot read the parent immutable packed runtime receipt"); }
    const packageRoot = path.join(runtime.root, "node_modules", "pokie"), installedCli = path.join(runtime.root, "node_modules", ".bin", process.platform === "win32" ? "pokie.cmd" : "pokie"), rootMode = (await services.stat(runtime.root)).mode & 0o222, packageMode = (await services.stat(packageRoot)).mode & 0o222;
    if (digest(bytes) !== runtime.receipt.sha256 || value?.kind !== "p8-05-immutable-packed-runtime" || value.candidateId !== options.candidateId || value.candidatePackageSha256 !== options.candidatePackageSha256 || value.candidateExecutableSha256 !== options.candidateExecutableSha256 || value.runtimeRoot !== runtime.root || value.packageRoot !== packageRoot || value.installedCli !== installedCli || value.permissions !== "read-only-before-any-tuple-child" || value.installation?.count !== 1 || rootMode !== 0 || packageMode !== 0 || !services.exists(installedCli)) fail("tuple child immutable runtime is stale, mutable, or substituted");
    const executable = await candidateExecutableManifest(packageRoot, options.candidateId, services);
    if (executable.sha256 !== options.candidateExecutableSha256) fail("tuple child immutable runtime executable manifest changed after parent authentication");
    return {receipt:value, packageRoot, installedCli};
}


/** Runs one persona in a fresh workspace, configuration root, and browser profile. */
export async function runP805ValeraBrowserAudit(options, dependencies = {}) {
    if (!validOptions(options)) fail("runner configuration is incomplete");
    const services = {spawn, link, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile, exists:existsSync, chromium:process.env.P805_CHROMIUM_BINARY ?? "chromium-browser", ...nativeNpmCommand(), now, ...dependencies}, startedAt = services.now(), nonce = digest(`${startedAt}:${options.phase}:${options.persona}:${Math.random()}`).slice(0, 16), auditId = `${options.phase}-${options.persona}-${nonce}`, worker = {pid:process.pid, processIdentity:processIdentity(process.pid), nonce, startedAt}, base = await services.mkdtemp(path.join(tmpdir(), `p8-05-${options.phase}-${options.persona}-`)), context = {workspace:path.join(base, "workspace"), configurationRoot:path.join(base, "configuration"), documents:path.join(base, "documents"), browserProfile:path.join(base, "browser-profile"), reused:false}, installationRoot = options.runtime?.root ?? path.join(base, "packed-install"), port = await freeLoopbackPort(), devtoolsPort = await freeLoopbackPort(), origin = `http://127.0.0.1:${port}`, devtools = `http://127.0.0.1:${devtoolsPort}`, evidence = [], checkpointReceipts = [], transcript = [], api = [], errors = [], observationEvidence = {}, timings = {startupMs:null, projectCreationMs:null, validationMs:null, buildMs:null, simulationMs:null, replayMs:null, cancellationMs:null, restartRecoveryMs:null, retryMs:null, replayArtifactMs:null, screenshotMs:null, recursiveHelpMs:null};
    const save = async (kind, name, content, observationIds = []) => { const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content), relativePath = path.join(options.phase, options.persona, nonce, name), target = path.join(options.output, relativePath); await services.mkdir(path.dirname(target), {recursive:true}); await writeImmutableReceipt(target, bytes, services); const evidenceId = `${options.phase}-${options.persona}-${nonce}-${kind}-${evidence.length + 1}`; evidence.push({evidenceId, kind, path:relativePath, sha256:digest(bytes), sizeBytes:bytes.length, capturedAt:services.now(), candidateId:options.candidateId, candidatePackageSha256:options.candidatePackageSha256, observationIds}); for (const observation of observationIds) if (!observationEvidence[observation]) observationEvidence[observation] = evidenceId; return evidenceId; };
    // The aggregate audit may only reference receipts written immediately
    // after a real public workflow chunk settles.  This prevents closeout
    // from substituting an equivalent action from another viewport/persona.
    let pendingTupleReceipt, publishedTupleCleanup;
    const saveCheckpoint = async (action) => {
        const sequence = checkpointReceipts.length + 1, receiptId = `${auditId}-checkpoint-${sequence}`,
            relativePath = path.join(options.phase, options.persona, nonce, "checkpoints", `${String(sequence).padStart(3, "0")}-${action.persona}-${action.viewport}.json`),
            receipt = {schemaVersion:1, kind:"p8-05-packed-workflow-checkpoint", receiptId, auditId, runNonce:nonce, worker, sequence, status:"passed", capturedAt:services.now(), candidateId:options.candidateId, candidatePackageSha256:options.candidatePackageSha256, phase:options.phase, persona:action.persona, observation:action.observation, viewport:action.viewport, action},
            contents = `${JSON.stringify(receipt)}\n`, target = path.join(options.output, relativePath);
        await services.mkdir(path.dirname(target), {recursive:true});
        await writeImmutableReceipt(target, contents, services);
        const checkpointReceipt = {receiptId, path:relativePath, sha256:digest(contents), sizeBytes:Buffer.byteLength(contents), capturedAt:receipt.capturedAt, candidateId:options.candidateId, candidatePackageSha256:options.candidatePackageSha256, workerNonce:worker.nonce, workerPid:worker.pid, persona:action.persona, observation:action.observation, viewport:action.viewport, actionSha256:digest(JSON.stringify(action))};
        checkpointReceipts.push(checkpointReceipt);
        // A tuple child owns exactly one checkpoint. Keep its semantic receipt
        // private until cleanup succeeds and the complete audit validates.
        // Publishing it earlier lets a parent observe a passing semantic claim
        // which a later teardown can invalidate.
        if (options.tupleReceiptPath) {
            if (pendingTupleReceipt) fail(`tuple ${options.tuple.persona}/${options.tuple.observation}/${options.tuple.viewport} published more than one semantic checkpoint`);
            pendingTupleReceipt = {schemaVersion:1, kind:"p8-05-packed-tuple-receipt", status:"passed", phase:options.phase, candidateId:options.candidateId, candidatePackageSha256:options.candidatePackageSha256, tuple:options.tuple, worker, auditId, checkpointReceipt, action};
        }
    };
    const ownership = [], childOwners = new WeakMap();
    let compoundCliOutputs = [];
    let ownershipSequence = 0;
    const ownershipEnvironment = (label, browserResource = false) => {
        // A restarted Studio is a separate owned process with a newly minted
        // signing secret.  Reusing its predecessor's registry file mixes
        // otherwise valid records signed by different owners and makes the
        // final resource-drain capture reject the restarted workflow.
        const ownershipId = ++ownershipSequence, resourceRegistryPath = path.join(base, `${label.replaceAll(/[^a-z0-9]+/gi, "-")}-${ownershipId}-owned-resources.ndjson`), resourceRegistrySecret = randomBytes(32).toString("hex"), operationId = randomBytes(16).toString("hex"), ownershipHook = path.join(root, "scripts", "pc-20-resource-ownership-hook.cjs");
        const env = {...process.env, POKIE_PC20_RESOURCE_REGISTRY:resourceRegistryPath, POKIE_PC20_RESOURCE_REGISTRY_SECRET:resourceRegistrySecret, POKIE_PC20_OPERATION_ID:operationId, NODE_OPTIONS:[process.env.NODE_OPTIONS, `--require=${ownershipHook}`].filter(Boolean).join(" ")};
        // Chromium cannot load NODE_OPTIONS.  Start the authenticated registry
        // before its spawn, then register its PID synchronously below; this
        // closes the detach/reparent window instead of relying on a final ps.
        if (browserResource) {
            const ready = spawnSync(process.execPath, ["-e", ""], {env, stdio:"ignore"});
            if (ready.status !== 0 || !existsSync(resourceRegistryPath)) fail(`could not initialize browser ownership registry for ${label}`);
        }
        return {resourceRegistryPath, resourceRegistrySecret, operationId, env, browserResource};
    };
    // Node-owned commands receive the authenticated PC-20 preload before they
    // can spawn children.  Browser descendants cannot load NODE_OPTIONS, so
    // their direct browser PID is recorded synchronously and its process tree
    // is continuously retained for the whole browser lifetime.
    const own = (label, child, ownerOptions = {}) => {
        const record = createP805OwnedProcessRecord(label, child, ownerOptions, services.now());
        if (ownerOptions.browserResource) {
            record.resourceId = `browser:${child?.pid}:${label}`;
            if (!registerPc20OwnedResource({kind:"browser", resourceId:record.resourceId, pid:child?.pid, processIdentity:record.identity}, "acquired", ownerOptions.env)) fail(`could not synchronously register browser ownership for ${label}`);
            if (process.env.POKIE_P805_SUPERVISOR_REGISTRY) registerPc20OwnedResource({kind:"browser", resourceId:record.resourceId, pid:child?.pid, processIdentity:record.identity}, "acquired", supervisorEnvironment(process.env));
        }
        // The authenticated preload writes every Node child at acquisition;
        // this sampler is the complementary fallback for a native detached
        // descendant.  A 10ms full process-table scan can starve the CDP
        // event loop itself on a busy verifier host, so use a bounded cadence
        // while retaining spawn-time records and final drainage validation.
        // Node children are authenticated by the preload at acquisition and
        // each detached browser root is synchronously registered above.  A
        // five-second reconciliation is consequently a fallback for native
        // reparenting, not the primary ownership boundary.  Polling `ps` four
        // times per second for both Chromium and Studio starves their CDP
        // event loop on a busy verifier host and can make the bounded runner
        // time out before it reaches any rendered workflow.
        if (ownerOptions.resourceRegistryPath) record.tracker = createPc20OwnershipTracker(child?.pid, ownerOptions.resourceRegistryPath, ownerOptions.resourceRegistrySecret, {operationId:ownerOptions.operationId, captureIntervalMs:5_000});
        // Sample continuously enough to retain short-lived descendants, while
        // leaving the packed workflow enough CPU to measure its own behavior.
        // A 10ms synchronous `ps` loop made the observer itself a material
        // performance regression in the whole-file runner.
        record.descendantSampler = setInterval(() => { for (const [pid, identity] of descendants(record.pid)) record.ownedProcesses.set(pid, identity); record.tracker?.capture(); }, 5_000);
        ownership.push(record); childOwners.set(child, record); return child;
    };
    // Drain completed commands promptly.  Retaining every finished command's
    // 10ms process sampler until the final persona teardown creates enough
    // process-table traffic to hide the real user workflow behind the audit.
    const settleOwner = async (owner) => {
        if (!owner || owner.settled) return owner?.drain;
        clearInterval(owner.descendantSampler);
        if (owner.resourceId) releaseP805BrowserOwner(owner);
        let ownershipError;
        try {
            owner.tracker?.capture({final:true});
        } catch (error) {
            ownershipError = error;
        }
        for (const [pid, identity] of descendants(owner.pid)) owner.ownedProcesses.set(pid, identity);
        // `childResult` has already observed a normal command exit.  Its
        // descendants still need ownership drainage, but holding each exited
        // command for the full server/browser grace period makes the packed
        // public workflow itself exceed its measured budget.
        const graceMs = owner.child.exitCode === null && owner.child.signalCode === null ? 5_000 : 250;
        owner.drain = await drainProcessTree(owner.child, graceMs, owner.tracker?.ownedProcesses ?? owner.ownedProcesses, owner.tracker?.ownedResources);
        if (!owner.drain.processTreeDrained || !owner.drain.resourcesDrained) fail(`owned ${owner.label} resources could not be drained`);
        owner.tracker?.stop(); owner.settled = true;
        if (ownershipError) throw ownershipError;
        return owner.drain;
    };
    const abruptStudioLosses = new WeakSet();
    const settleChild = (child) => abruptStudioLosses.has(child) ? abruptlyLoseStudio(child) : settleOwner(childOwners.get(child));
    let postLossJobCapture;
    const abruptlyLoseStudio = async (child) => {
        const owner = childOwners.get(child);
        if (!owner || owner.settled || !Number.isInteger(child?.pid) || child.pid <= 0) fail("restart fixture has no live owned Studio process to lose abruptly");
        // SIGTERM is Studio's public graceful-stop path and deliberately asks
        // every active executor to cancel. The recovery fixture needs the
        // opposite boundary: a bounded service loss that leaves the durable
        // job nonterminal for the next process to reconcile.
        let killed = false;
        if (process.platform !== "win32") {
            try { process.kill(-child.pid, "SIGKILL"); killed = true; } catch { /* root signal below verifies the loss */ }
        }
        try { process.kill(child.pid, "SIGKILL"); killed = true; } catch { /* the group may already have reaped its root */ }
        if (!killed) fail("restart fixture could not abruptly lose the owned Studio process");
        await waitFor(() => child.signalCode === "SIGKILL" ? true : false, "abrupt Studio SIGKILL exit", 5_000);
        const drain = await settleOwner(owner);
        // This callback runs after SIGKILL and its owner drain, but before
        // the replacement Studio is started. It prevents a pre-loss snapshot
        // from being misrepresented as proof of the actual restart boundary.
        const postLossJob = await postLossJobCapture?.();
        if (!postLossJob) fail("restart fixture did not retain a nonterminal durable job after abrupt service loss");
        return {
            ...drain,
            postLossJob,
            priorStudioShutdown:{kind:"abrupt-service-loss", gracefulShutdownReceived:false, requestedSignal:"SIGKILL", observedSignal:child.signalCode},
        };
    };
    let studio, browser, cdp, audit, thrown, installedPackageBytes, candidatePackageJsonBytes, candidateExecutable;
    try {
        await services.mkdir(options.output, {recursive:true}); await Promise.all([context.workspace, context.configurationRoot, context.documents, context.browserProfile, ...(options.runtime ? [] : [installationRoot])].map((directory) => services.mkdir(directory, {recursive:true}))); const packageBytes = await services.readFile(options.packedPackage); if (digest(packageBytes) !== options.candidatePackageSha256) fail("packed package archive digest differs from declared candidate package identity");
        // Tuple workers use the parent's authenticated read-only runtime.
        // A standalone audit installs the same archive with an isolated npm
        // cache and the same bounded transport recovery as the parent.
        // This branch owns the compound recovery workflow. A tuple worker
        // enters it for the simulation cancellation/retry observation, where
        // `viewport` is otherwise only scoped to the earlier action loop.
        // Keep the receipt and its screenshot bound to the tuple's declared
        // viewport instead of accidentally borrowing a loop-local value.
        const recoveryViewport = options.tuple?.viewport ?? "wide";
        let runtimeIdentity;
        if (options.runtime) {
            runtimeIdentity = await trustedSharedRuntime(options.runtime, options, services);
            transcript.push(`[${services.now()}] PACKED_INSTALL parent-authenticated shared runtime ${runtimeIdentity.installedCli}\n`);
        } else {
            const installOwnership = ownershipEnvironment("packed-package-install"), install = await installP805PackedRuntime({...services, childResult, spawn:(...args) => own("packed-package-install", services.spawn(...args), installOwnership), settleInstaller:settleChild}, installationRoot, options.packedPackage, {cwd:context.workspace, env:{...installOwnership.env, HOME:context.configurationRoot, XDG_CONFIG_HOME:context.configurationRoot}, stdio:"pipe"}, "packed package installation"); transcript.push(`[${services.now()}] PACKED_INSTALL\n${install.stdout}${install.stderr}`);
        }
        const installedCli = path.join(installationRoot, "node_modules", ".bin", process.platform === "win32" ? "pokie.cmd" : "pokie"), installedPackageJson = path.join(installationRoot, "node_modules", "pokie", "package.json"); if (!services.exists(installedCli) || !services.exists(installedPackageJson)) fail("packed package installation did not expose its pokie launcher and package metadata"); installedPackageBytes = await services.readFile(installedPackageJson); const candidatePackage = spawnSync("git", ["show", `${options.candidateId}:package.json`], {cwd:root, encoding:"buffer"}); if (candidatePackage.status !== 0 || !candidatePackage.stdout?.length) fail("declared candidate does not expose package.json for archive binding"); candidatePackageJsonBytes = Buffer.from(candidatePackage.stdout); let installedPackage, candidateManifest; try { installedPackage = JSON.parse(installedPackageBytes.toString("utf8")); candidateManifest = JSON.parse(candidatePackageJsonBytes.toString("utf8")); } catch { fail("installed packed package metadata is not JSON"); } if (installedPackage?.name !== candidateManifest?.name || installedPackage?.version !== candidateManifest?.version || (installedPackage?.gitHead !== undefined && installedPackage.gitHead !== options.candidateId)) fail("installed archive package metadata is not bound to the declared candidate");
        const candidateTreeManifest = candidateTreeExecutableManifest(options.candidateId), candidateReceipt = await trustedCandidateExecutableReceipt(options.candidateExecutableReceipt, options.candidateId, options.candidatePackageSha256, options.candidateExecutableSha256, services, options.output);
        if (candidateReceipt.candidateTreeManifestSha256 !== candidateTreeManifest.sha256 || candidateReceipt.candidateTreeObjectId !== candidateTreeManifest.tree) fail("candidate executable receipt does not bind the declared candidate tree manifest");
        candidateExecutable = await candidateExecutableManifest(path.join(installationRoot, "node_modules", "pokie"), options.candidateId, services); if (candidateExecutable.sha256 !== options.candidateExecutableSha256) fail("packed archive executable manifest differs from the verifier-supplied declared candidate manifest"); const packedEnvironment = {...process.env, HOME:context.configurationRoot, XDG_CONFIG_HOME:context.configurationRoot, XDG_DOCUMENTS_DIR:context.documents, PATH:`${path.dirname(installedCli)}${path.delimiter}${process.env.PATH ?? ""}`}; const runPackedCli = async (label, args, expectedExitCode = 0) => { process.stderr.write(`P805_CLI command=${label} phase=start\n`); const commandStarted = Date.now(), commandOwnership = ownershipEnvironment(label), child = own(label, services.spawn(installedCli, args, {cwd:context.workspace, env:{...packedEnvironment, ...commandOwnership.env}, stdio:"pipe"}), commandOwnership); let result; try { result = await childResult(child, label, expectedExitCode); } finally { await settleChild(child); } transcript.push(`[${services.now()}] ${label} ${args.join(" ")}\n${result.stdout}${result.stderr}`); const timingName = {create:"projectCreationMs", import:"projectCreationMs", validate:"validationMs", build:"buildMs", sim:"simulationMs", replay:"replayMs"}[args[0]];
            if (timingName && !args.includes("--help")) timings[timingName] = Math.max(timings[timingName] ?? 0, Date.now() - commandStarted);
            if (args.includes("--help") && (!options.tuple || options.tuple.observation === "recursive-help")) timings.recursiveHelpMs = (timings.recursiveHelpMs ?? 0) + Date.now() - commandStarted;
            process.stderr.write(`P805_CLI command=${label} phase=complete\n`); return result; };
        const blueprint = path.join(context.workspace, "Valera audit blueprint.json"), workbook = path.join(context.workspace, "Valera audit.xlsx"), importedBlueprint = path.join(context.workspace, "Valera imported blueprint.json"), wasm = path.join(context.workspace, "Valera audit.wasm"), packageRoot = path.join(context.workspace, "Valera audit package"), simulationReport = path.join(context.workspace, "Valera simulation report.json"), renderedReport = path.join(context.workspace, "Valera simulation report.md"), diffReport = path.join(context.workspace, "Valera simulation diff.json"), replayArtifact = path.join(context.workspace, "Valera replay.json"), outcomeBundle = path.join(context.workspace, "Valera outcomes"), certificationConfig = path.join(context.workspace, "Valera certification config.json"), certificationBundle = path.join(context.workspace, "Valera certification"), serverSeed = path.join(context.workspace, "Valera server seed.txt"), seedCommitment = path.join(context.workspace, "Valera seed commitment.json"), roundCommitment = path.join(context.workspace, "Valera round commitment.json"), fairnessProof = path.join(context.workspace, "Valera fairness proof.json");
        const requireOutput = async (label, target) => { if (!services.exists(target)) fail(`${label} did not create its declared output ${target}`); };
        // The compound mathematician tuple has five public CLI results in
        // addition to its rendered Studio transaction.  Its workspace is
        // deliberately cleaned after the tuple, so preserve a candidate-bound
        // immutable manifest now; a transcript alone cannot later prove that
        // those commands actually wrote their declared outputs.
        const preservePackedCliOutput = async (output, command, target) => {
            const entries = [];
            const collect = async (directory, relative = "") => {
                for (const entry of await services.readdir(directory, {withFileTypes:true})) {
                    const next = path.join(relative, entry.name), candidate = path.join(directory, entry.name);
                    if (entry.isDirectory()) await collect(candidate, next);
                    else if (entry.isFile()) {
                        const bytes = await services.readFile(candidate);
                        entries.push({path:next.replaceAll(path.sep, "/"), sha256:digest(bytes), sizeBytes:bytes.length, contentsBase64:Buffer.from(bytes).toString("base64")});
                    }
                }
            };
            const metadata = await services.stat(target);
            if (metadata.isDirectory()) await collect(target);
            else if (metadata.isFile()) {
                const bytes = await services.readFile(target);
                entries.push({path:path.basename(target), sha256:digest(bytes), sizeBytes:bytes.length, contentsBase64:Buffer.from(bytes).toString("base64")});
            }
            if (entries.length === 0) fail(`${command} created no retainable ${output} output`);
            entries.sort((left, right) => left.path.localeCompare(right.path));
            const receipt = {kind:"p8-05-packed-cli-output", candidateId:options.candidateId, candidatePackageSha256:options.candidatePackageSha256, candidateExecutableSha256:options.candidateExecutableSha256, publicWorkflow:"outcome-library-report-diff-replay", output, command, files:entries, sha256:digest(JSON.stringify(entries))};
            const evidenceId = await save("artifact", `compound-${output}.json`, JSON.stringify(receipt), ["outcome-library-report-diff-replay"]);
            return {...receipt, evidenceId};
        };
        await runPackedCli("packed CLI create", ["create", "Valera audit", "--random", "--seed", "805", "--out", blueprint]); await requireOutput("packed CLI create", blueprint);
        const tupleContract = options.tuple ? P805_WORKFLOW_CONTRACTS[options.tuple.persona][options.tuple.observation] : undefined,
            requiresOutcomeBootstrap = tupleContract?.route === "certification" || tupleContract?.route === "provablyFair",
            requiresRuntimeBootstrap = tupleContract?.route === "provablyFair",
            // A tuple child may never inherit the programmer's whole CLI
            // campaign as hidden setup. The legacy persona-sized invocation
            // retains that matrix for backward-compatible campaign records.
            fullCliMatrix = !options.tuple && options.workflowPersonas.includes("programmer");
        const runTupleCliWorkflow = async () => {
            if (!options.tuple) return;
            const {persona, observation} = options.tuple;
            // A packed child is not a convenient sample of the CLI suite.
            // Each named Programmer observation owns the installed public
            // commands that make its terminal claim true.  Keeping these
            // branches here also prevents a later generic setup command from
            // impersonating a help, error, WASM, or artifact workflow.
            if (persona === "programmer") {
                if (observation === "npx-pokie") {
                    const npxOwnership = ownershipEnvironment("packed-npx-help"), npxCli = path.join(path.dirname(path.dirname(process.execPath)), "lib", "node_modules", "npm", "bin", "npx-cli.js");
                    if (!services.exists(npxCli)) fail("the installed Node npx launcher is unavailable");
                    const npxChild = own("packed npx help", services.spawn(process.execPath, [npxCli, "--no-install", "--prefix", installationRoot, "pokie", "--help"], {cwd:installationRoot, env:{...packedEnvironment, ...npxOwnership.env}, stdio:"pipe"}), npxOwnership), npx = await childResult(npxChild, "packed npx help");
                    await settleChild(npxChild); transcript.push(`[${services.now()}] PACKED_NPX_HELP\n${npx.stdout}${npx.stderr}`);
                }
                if (observation === "recursive-help") for (const args of P805_PUBLIC_HELP_ARGUMENTS) await runPackedCli(`packed CLI help ${args.join("-")}`, args);
                if (observation === "create-build-inspect") {
                    await runPackedCli("packed CLI package build", ["build", blueprint, "--target", "tsPackage", "--out", packageRoot]); await requireOutput("packed CLI package build", packageRoot);
                    await runPackedCli("packed CLI inspect", ["inspect", packageRoot]);
                }
                if (observation === "validate-sim-report-diff-replay-serve-wasm") {
                    await runPackedCli("packed CLI WASM build", ["build", blueprint, "--target", "wasm", "--out", wasm]); await requireOutput("packed CLI WASM build", wasm);
                    await runPackedCli("packed CLI WASM inspect", ["inspect", wasm]); await runPackedCli("packed CLI WASM validate", ["validate", wasm]); await runPackedCli("packed CLI WASM run", ["run", wasm, "--seed", "p8-05-wasm"]);
                    await runPackedCli("packed CLI package build", ["build", blueprint, "--target", "tsPackage", "--out", packageRoot]); await requireOutput("packed CLI package build", packageRoot);
                    await runPackedCli("packed CLI sim", ["sim", packageRoot, "--rounds", "10", "--seed", "p8-05", "--out", simulationReport]); await requireOutput("packed CLI sim", simulationReport);
                    await runPackedCli("packed CLI report", ["report", simulationReport, "--format", "markdown", "--out", renderedReport]); await requireOutput("packed CLI report", renderedReport);
                    await runPackedCli("packed CLI diff", ["diff", simulationReport, simulationReport, "--out", diffReport]); await requireOutput("packed CLI diff", diffReport);
                    await runPackedCli("packed CLI replay", ["replay", packageRoot, "--seed", "p8-05", "--round", "1", "--out", replayArtifact]); await requireOutput("packed CLI replay", replayArtifact);
                    const servePort = await freeLoopbackPort(), serveOwnership = ownershipEnvironment("packed-cli-serve"), serveChild = own("packed CLI serve", services.spawn(installedCli, ["serve", packageRoot, "--host", "127.0.0.1", "--port", String(servePort)], {cwd:context.workspace, env:{...packedEnvironment, ...serveOwnership.env}, stdio:"pipe"}), serveOwnership);
                    let serveOutput = "";
                    serveChild.stdout?.on("data", (chunk) => { serveOutput += chunk.toString(); }); serveChild.stderr?.on("data", (chunk) => { serveOutput += chunk.toString(); });
                    await waitFor(async () => { try { return (await fetch(`http://127.0.0.1:${servePort}`)).status < 500 && /POKIE dev server listening/.test(serveOutput); } catch { return false; } }, "packed CLI serve");
                    transcript.push(`[${services.now()}] packed CLI serve ${packageRoot} --port ${servePort}`); await settleChild(serveChild);
                }
                if (observation === "spaces-invalid-inputs-exit-codes-ci-recovery") {
                    await runPackedCli("packed CLI CI validate", ["validate", blueprint, "--format", "json"]);
                    await runPackedCli("packed CLI invalid-input recovery", ["validate", path.join(context.workspace, "missing blueprint.json")], 1);
                }
                if (observation === "build-export-output-folder") {
                    await runPackedCli("packed CLI PAR build", ["build", blueprint, "--target", "parWorkbook", "--out", workbook]); await requireOutput("packed CLI PAR build", workbook);
                }
            }
            if (persona === "mathematician") {
                if (observation === "par-xlsx-round-trip") {
                    await runPackedCli("packed CLI PAR build", ["build", blueprint, "--target", "parWorkbook", "--out", workbook]); await requireOutput("packed CLI PAR build", workbook);
                    await runPackedCli("packed CLI PAR import", ["par", "import", workbook, "--out", importedBlueprint]); await requireOutput("packed CLI PAR import", importedBlueprint);
                }
                if (observation === "reels-paytable-modes-mechanics") { await runPackedCli("packed CLI validate", ["validate", blueprint]); await runPackedCli("packed CLI reels", ["reel", "generate", blueprint, "--format", "json"]); }
                if (observation === "outcome-library-report-diff-replay") {
                    await runPackedCli("packed CLI package build for report/diff/replay", ["build", blueprint, "--target", "tsPackage", "--out", packageRoot]); await requireOutput("packed CLI package build for report/diff/replay", packageRoot);
                    await runPackedCli("packed CLI Outcome Library export", ["export", blueprint, "--to", "outcomes", "--out", outcomeBundle]); await requireOutput("packed CLI Outcome Library export", outcomeBundle);
                    await runPackedCli("packed CLI simulation report source", ["sim", packageRoot, "--rounds", "10", "--seed", "p8-05-mathematician", "--out", simulationReport]); await requireOutput("packed CLI simulation report source", simulationReport);
                    await runPackedCli("packed CLI report", ["report", simulationReport, "--format", "markdown", "--out", renderedReport]); await requireOutput("packed CLI report", renderedReport);
                    await runPackedCli("packed CLI diff", ["diff", simulationReport, simulationReport, "--out", diffReport]); await requireOutput("packed CLI diff", diffReport);
                    await runPackedCli("packed CLI replay", ["replay", packageRoot, "--seed", "p8-05-mathematician", "--round", "1", "--out", replayArtifact]); await requireOutput("packed CLI replay", replayArtifact);
                }
                if (observation === "import-export-defaults") { await runPackedCli("packed CLI PAR export", ["par", "export", blueprint, "--out", workbook]); await requireOutput("packed CLI PAR export", workbook); }
            }
        };
        if (options.tuple && !tupleRequiresCompleteWorkflow(options.tuple)) {
            if (requiresRuntimeBootstrap) {
                await runPackedCli("packed CLI package build", ["build", blueprint, "--target", "tsPackage", "--out", packageRoot]); await requireOutput("packed CLI package build", packageRoot);
            }
            if (requiresOutcomeBootstrap) {
                await runPackedCli(`packed CLI Outcome Library export for ${options.tuple.observation}`, ["export", blueprint, "--to", "outcomes", "--out", outcomeBundle]); await requireOutput("packed CLI Outcome Library export", outcomeBundle);
            }
            await runTupleCliWorkflow();
        } else if (!fullCliMatrix) {
            if (!options.tuple || requiresRuntimeBootstrap) {
                await runPackedCli("packed CLI package build", ["build", blueprint, "--target", "tsPackage", "--out", packageRoot]); await requireOutput("packed CLI package build", packageRoot);
            }
            if (!options.tuple || requiresOutcomeBootstrap) {
                await runPackedCli("packed CLI Outcome Library export", ["export", blueprint, "--to", "outcomes", "--out", outcomeBundle]); await requireOutput("packed CLI Outcome Library export", outcomeBundle);
            }
            if (options.tuple) await runTupleCliWorkflow();
        } else {
        await runPackedCli("packed CLI validate", ["validate", blueprint]); await runPackedCli("packed CLI reels", ["reel", "generate", blueprint, "--format", "json"]);

        await runPackedCli("packed CLI PAR build", ["build", blueprint, "--target", "parWorkbook", "--out", workbook]); await requireOutput("packed CLI PAR build", workbook);
        await runPackedCli("packed CLI PAR export", ["par", "export", blueprint, "--out", path.join(context.workspace, "Valera direct.xlsx")]);
        await runPackedCli("packed CLI PAR import", ["par", "import", workbook, "--out", importedBlueprint]); await requireOutput("packed CLI PAR import", importedBlueprint);
        await runPackedCli("packed CLI package build", ["build", blueprint, "--target", "tsPackage", "--out", packageRoot]); await requireOutput("packed CLI package build", packageRoot);
        await runPackedCli("packed CLI WASM build", ["build", blueprint, "--target", "wasm", "--out", wasm]); await requireOutput("packed CLI WASM build", wasm);
        await runPackedCli("packed CLI inspect", ["inspect", packageRoot]);
        await runPackedCli("packed CLI WASM inspect", ["inspect", wasm]);
        await runPackedCli("packed CLI WASM validate", ["validate", wasm]);
        await runPackedCli("packed CLI WASM run", ["run", wasm, "--seed", "p8-05-wasm"]);
        await runPackedCli("packed CLI sim", ["sim", packageRoot, "--rounds", "10", "--seed", "p8-05", "--out", simulationReport]); await requireOutput("packed CLI sim", simulationReport);
        await runPackedCli("packed CLI report", ["report", simulationReport, "--format", "markdown", "--out", renderedReport]); await requireOutput("packed CLI report", renderedReport);
        await runPackedCli("packed CLI diff", ["diff", simulationReport, simulationReport, "--out", diffReport]); await requireOutput("packed CLI diff", diffReport);
        await runPackedCli("packed CLI replay", ["replay", packageRoot, "--seed", "p8-05", "--round", "1", "--out", replayArtifact]); await requireOutput("packed CLI replay", replayArtifact);
        await runPackedCli("packed CLI Outcome Library export", ["export", blueprint, "--to", "outcomes", "--out", outcomeBundle]); await requireOutput("packed CLI Outcome Library export", outcomeBundle);
        await services.writeFile(certificationConfig, JSON.stringify({modes:[{modeName:"base", seed:"p8-05-certification", sampleCount:1}]}));
        await runPackedCli("packed CLI certification build", ["certification", "build", outcomeBundle, certificationConfig, "--out", certificationBundle]); await requireOutput("packed CLI certification build", certificationBundle);
        await runPackedCli("packed CLI certification verify", ["certification", "verify", certificationBundle, "--source", outcomeBundle]);
        await services.writeFile(serverSeed, "p8-05-server-seed\n");
        await runPackedCli("packed CLI fairness seed commit", ["fairness", "seed-commit", serverSeed, "--out", seedCommitment]); await requireOutput("packed CLI fairness seed commit", seedCommitment);
        await runPackedCli("packed CLI fairness commit", ["fairness", "commit", seedCommitment, "--client-seed", "p8-05-client-seed", "--nonce", "0", "--source", outcomeBundle, "--mode", "base", "--out", roundCommitment]); await requireOutput("packed CLI fairness commit", roundCommitment);
        await runPackedCli("packed CLI fairness reveal", ["fairness", "reveal", roundCommitment, "--server-seed", serverSeed, "--source", outcomeBundle, "--out", fairnessProof]); await requireOutput("packed CLI fairness reveal", fairnessProof);
        await runPackedCli("packed CLI fairness verify", ["fairness", "verify", fairnessProof, "--commitment", roundCommitment, "--source", outcomeBundle]);
        const servePort = await freeLoopbackPort(), serveOwnership = ownershipEnvironment("packed-cli-serve"), serveChild = own("packed CLI serve", services.spawn(installedCli, ["serve", packageRoot, "--host", "127.0.0.1", "--port", String(servePort)], {cwd:context.workspace, env:{...packedEnvironment, ...serveOwnership.env}, stdio:"pipe"}), serveOwnership);
        let serveOutput = "";
        serveChild.stdout?.on("data", (chunk) => { serveOutput += chunk.toString(); });
        serveChild.stderr?.on("data", (chunk) => { serveOutput += chunk.toString(); });
        // `serve` is a package development server, not a web-site generator:
        // a package without an index page correctly answers 404 at `/`.  Its
        // listener transcript plus any non-5xx loopback response proves the
        // installed public command is serving instead of mistaking that 404
        // for a semantic command failure.
        await waitFor(async () => { try { const response = await fetch(`http://127.0.0.1:${servePort}`); return response.status < 500 && /POKIE dev server listening/.test(serveOutput); } catch { return false; } }, "packed CLI serve");
        transcript.push(`[${services.now()}] packed CLI serve ${packageRoot} --port ${servePort}`);
        await settleChild(serveChild);
        await runPackedCli("packed CLI CI validate", ["validate", blueprint, "--format", "json"]);
        await runPackedCli("packed CLI invalid-input recovery", ["validate", path.join(context.workspace, "missing blueprint.json")], 1);
        for (const args of P805_PUBLIC_HELP_ARGUMENTS) await runPackedCli(`packed CLI help ${args.join("-")}`, args);
        const npxOwnership = ownershipEnvironment("packed-npx-help"), npxCli = path.join(path.dirname(path.dirname(process.execPath)), "lib", "node_modules", "npm", "bin", "npx-cli.js"); if (!services.exists(npxCli)) fail("the installed Node npx launcher is unavailable"); const npxChild = own("packed npx help", services.spawn(process.execPath, [npxCli, "--no-install", "--prefix", installationRoot, "pokie", "--help"], {cwd:installationRoot, env:{...packedEnvironment, ...npxOwnership.env}, stdio:"pipe"}), npxOwnership), npx = await childResult(npxChild, "packed npx help"); await settleChild(npxChild); transcript.push(`[${services.now()}] PACKED_NPX_HELP\n${npx.stdout}${npx.stderr}`);
        }
        if (options.tuple?.persona === "mathematician" && options.tuple.observation === "outcome-library-report-diff-replay") {
            compoundCliOutputs = await Promise.all(P805_OUTCOME_LIBRARY_COMPOUND_OUTPUTS.map(({output, command}) => preservePackedCliOutput(output, command, {
                "outcome-library-export":outcomeBundle,
                "simulation-report-source":simulationReport,
                report:renderedReport,
                diff:diffReport,
                replay:replayArtifact,
            }[output])));
        }
        const startStudio = () => { const studioOwnership = ownershipEnvironment("studio"), child = own("studio", services.spawn(installedCli, ["--no-open", "--host", "127.0.0.1", "--port", String(port)], {cwd:context.workspace, detached:process.platform !== "win32", env:{...packedEnvironment, ...studioOwnership.env}, stdio:"pipe"}), studioOwnership); child.stdout?.on("data", (chunk) => transcript.push(chunk.toString())); child.stderr?.on("data", (chunk) => { errors.push(chunk.toString()); transcript.push(chunk.toString()); }); return child; }; const started = Date.now(); transcript.push(`[${services.now()}] START installed packed public CLI ${installedCli}`); studio = startStudio(); await waitFor(async () => { try { const response = await fetch(`${origin}/api/health`); api.push({path:"/api/health", status:response.status}); return response.ok; } catch { return false; } }, "built Studio API", 90_000); timings.startupMs = Date.now() - started;
        // Loading the public Studio entry point is browser startup, not a
        // workflow transition. Every subsequent route change is activated
        // through the live rendered navigation control below.
        const browserOwnership = ownershipEnvironment("browser", true); browser = own("browser", services.spawn(services.chromium, ["--headless=new", "--no-sandbox", "--no-first-run", `--user-data-dir=${context.browserProfile}`, `--remote-debugging-address=127.0.0.1`, `--remote-debugging-port=${devtoolsPort}`, "about:blank"], {detached:process.platform !== "win32", env:browserOwnership.env, stdio:"pipe"}), browserOwnership); await waitFor(async () => { try { return Array.isArray(await responseJson(`${devtools}/json/list`)); } catch { return false; } }, "fresh browser profile"); cdp = await connectP805Devtools(devtools, `${origin}/#/home/design`); const evaluate = async (source) => { const result = await cdp.send("Runtime.evaluate", {expression:source, returnByValue:true, awaitPromise:true}); if (result.exceptionDetails) fail(`rendered browser evaluation failed: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "unknown exception"}`); return result.result.value; };
        // Chromium's headless DevTools target needs the native virtual-key
        // code as well as the DOM key name to perform a button's default
        // keyboard activation.  Without it, focus evidence was recorded but
        // React's actual public action owner was never invoked.
        const captureScreenshot = async () => {
            const captureStartedAt = Date.now();
            const result = await cdp.send("Page.captureScreenshot", {format:"png", captureBeyondViewport:false});
            timings.screenshotMs = Math.max(timings.screenshotMs ?? 0, Date.now() - captureStartedAt);
            return result;
        };
        const pressEnter = () => pressP805Enter(cdp);
        const pressSpace = async () => {
            await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:" ", code:"Space", text:" ", unmodifiedText:" ", windowsVirtualKeyCode:32, nativeVirtualKeyCode:32});
            await wait(50);
            await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:" ", code:"Space", windowsVirtualKeyCode:32, nativeVirtualKeyCode:32});
        };
        // Focus establishes the accessibility receipt, but the public action
        // itself is a browser-native pointer interaction. Chromium's CDP key
        // dispatch can focus Mantine NavLink buttons without delivering their
        // React click default; treating that focus as an activation produced
        // a route-only claim. Capture the focused visible control and click
        // its actual rendered hit target instead.
        const activateFocusedControl = async (lifecycle = "operation", control, transport = "pointer", retainCapturedControl = false) => {
            const stableControlId = control?.stableControlId ?? await evaluate("(()=>{const active=document.activeElement; return active instanceof HTMLElement ? active.id || active.closest('[id]')?.id || '' : '';})()");
            if (typeof stableControlId !== "string" || !stableControlId) fail(`rendered ${lifecycle} control lost its focused DOM identity before pointer activation`);
            if (transport === "keyboard") {
                // Replay replaces its review action with durable progress in
                // the same React update that submits it.  On a narrow screen
                // a CDP pointer release can be retargeted during that update,
                // leaving a recorded click without the public submission.
                // Enter is the focused button's native, keyboard-operable
                // public activation and retains the exact rendered identity.
                return activateP805KeyboardControl(cdp, evaluate, stableControlId);
            }
            // A compact NavLink can remain in the DOM after its drawer has
            // moved off canvas.  It is not an interactable public control
            // until its current rendered hit target is inside the viewport.
            // Re-check that boundary for navigation just as for forms before
            // issuing the sole browser pointer activation.
            // Navigation was already exposed through the product's visible
            // desktop tab or narrow drawer. Scrolling that drawer item again
            // can move the overlay between focus and pointer dispatch, so
            // retain the live hit-test but do not mutate its rendered layout.
            // A form operation can be mounted below a narrow viewport just as
            // a navigation tab can live in its drawer. Its DOM presence and
            // focus are not enough: bring the exact public control into the
            // live hit-test area before its single browser pointer action.
            // Every operation is a live rendered control, including the
            // initial Create game button before a project tab has published a
            // transaction state.  Treating that button as an exception let
            // CDP press an off-viewport coordinate and record focus without
            // delivering the product action.  Scroll and hit-test every
            // public operation at the pointer boundary instead.
            // The mobile Burger is a real rendered navigation control too.
            // It must receive the same complete native pointer sequence as
            // the tab it exposes; omitting `buttons`/`pointerType` lets CDP
            // focus the Burger while Mantine never receives the click, which
            // leaves the requested tab off-canvas at the narrow breakpoint.
            // Recovery has the same visible hit-target requirement as every
            // other operation. Settle its review layout on the captured node.
            const requiresViewportHit = ["precondition", "navigation", "navigation-drawer", "operation", "recovery"].includes(lifecycle);
            // Preserve the complete native pointer state for every rendered
            // public operation as well as navigation/preconditions. Mantine's
            // initial Create game action has no tab transaction attribute;
            // without `buttons` and `pointerType` its visual focus was
            // captured but React never received the click that starts the
            // validation/save/navigation lifecycle.
            const pointer = await clickCapturedControl(stableControlId, requiresViewportHit, ["precondition", "navigation", "navigation-drawer", "operation", "recovery"].includes(lifecycle), !["navigation", "navigation-drawer"].includes(lifecycle), retainCapturedControl);
            return {kind:"pointer", controlId:stableControlId, count:1, ...pointer};
        };
        const clickCapturedControl = (...args) => clickP805CapturedControl(cdp, evaluate, ...args);
        // A semantic observation is only valid when the browser itself issued
        // the declared request after the rendered control was activated.  Do
        // not "complete" a page click by making an unrelated Node-side fetch:
        // that was a convenient audit shortcut, but it hid broken forms and
        // disabled controls from the campaign.
        // `responseReceived` can precede the point where DevTools exposes
        // bytes for a small JSON response. Retry that read briefly, while
        // retaining the original browser request id; a failed response never
        // becomes a Node-side substitute request.
        const readBrowserResponseBody = async (requestId, label) => {
            let lastError;
            for (let attempt = 0; attempt < 20; attempt += 1) {
                // CDP can retain a request entry while its response body is
                // unavailable.  A bare await here makes one workflow chunk
                // unbounded and hides both its terminal result and cleanup.
                // Keep the Chromium request identity, but cap each read so
                // the existing retry window reports the exact failed receipt.
                try { return await Promise.race([cdp.send("Network.getResponseBody", {requestId}), wait(1_250).then(() => Promise.reject(new Error("CDP response-body read timed out")))]); }
                catch (error) { lastError = error; await wait(125); }
            }
            throw new Error(`${label} browser response body was unavailable: ${String(lastError)}`);
        };
        const browserRequest = async (contract, observation, cursor, transaction) => {
            if (!transaction) fail(`${observation} has no rendered operation transaction`);
            // The request window begins immediately before the keyboard
            // activation, not while the runner is still reading form state or
            // waiting for preflight.  That boundary is what makes this a
            // receipt for the rendered control instead of an equivalent
            // background request from the surrounding screen.
            const activationCursor = transaction.browserEventCursor;
            if (!Number.isSafeInteger(activationCursor) || activationCursor < cursor) fail(`${observation} has no browser event boundary for its rendered activation`);
            // Select one browser-created request event after the keyboard
            // activation, then carry its Chromium identity through every
            // subsequent lookup. React may legitimately issue a second
            // freshness read of the same path; rejecting that rendered
            // reality for not being "exactly one" used to make Game Model
            // navigation time out even though the first public request had a
            // complete, independently verifiable request id.
            const requestEvent = await waitFor(() => cdp.events.slice(activationCursor).find((event) => event.method === "Network.requestWillBeSent" && new URL(event.params.request.url).pathname === contract.api && event.params.request.method === contract.method) || false, `${observation} rendered request identity`);
            // Chromium allocates this identity. Once selected, every receipt
            // below is retrieved by request ID, never content-equivalence.
            const browserRequestId = requestEvent.params.requestId;
            const responseEvent = await waitFor(() => cdp.events.slice(activationCursor).find((event) => event.method === "Network.responseReceived" && event.params.requestId === browserRequestId) || false, `${observation} rendered response`);
            if (!requestEvent) fail(`${observation} lost its selected browser request identity`);
            const response = await readBrowserResponseBody(browserRequestId, observation), body = response.body ?? "", payload = JSON.parse(body || "{}"), serialized = requestEvent.params.request.postData ?? "", entry = {observation, method:requestEvent.params.request.method, path:contract.api, bodyKind:contract.body ?? null, bodySha256:digest(serialized), status:responseEvent.params.response.status, responseSha256:digest(JSON.stringify(payload)), payload, browserRequestId, initiator:"rendered-control"};
            api.push(entry);
            transaction.request = {browserRequestId:entry.browserRequestId, method:entry.method, path:entry.path, bodySha256:entry.bodySha256, status:entry.status, responseSha256:entry.responseSha256};
            transaction.elapsedMs = Date.now() - transaction.startedAtMs;
            transaction.requestCount = 1;
            if (entry.method !== contract.method || entry.status < 200 || entry.status >= 400 || payload?.ok === false || payload?.success === false || payload?.valid === false || payload?.error !== undefined || (Array.isArray(payload) && payload.length === 0) || ["failed", "error", "cancelled", "incomplete", "load-error", "invalid"].includes(payload?.status)) fail(`${observation} rendered control did not produce a successful semantic response (HTTP ${entry.status}: ${JSON.stringify(payload)})`);
            const started = payload?.job ?? payload, jobId = started?.id;
            // Only contracts with an explicit durable-job route may be
            // polled.  Several public Studio operations (PAR export,
            // certification validation and fairness configuration) return a
            // completed semantic result directly; treating any response that
            // happens to contain an id as a job made those controls wait for a
            // request the page never performs.
            if (!contract.poll) {
                // Context/navigation endpoints expose their resource state
                // (for example `loaded`), not an operation outcome.  The
                // visible lifecycle result is the terminal outcome while the
                // complete response remains bound verbatim below.
                const terminalStatus = ["completed", "success", "ok", "valid", "partial"].includes(started?.status) ? started.status : "success";
                const terminal = {status:terminalStatus, result:started, resultSha256:digest(JSON.stringify(started)), jobId:undefined, source:"response"};
                transaction.terminal = {status:terminal.status, resultSha256:terminal.resultSha256, source:terminal.source};
                return {...entry, terminal};
            }
            if (typeof jobId !== "string" || !jobId) fail(`${observation} rendered control did not return the durable job required by its contract`);
            // Retain the start response and every browser-owned poll. A very
            // fast job can complete before its first progress repaint, so the
            // start snapshot prevents a genuine durable transaction from
            // looking like an unobserved timeout.
            const progressSnapshots = contract.body === "outcome-library" ? [{
                source:"start-response",
                browserRequestId:entry.browserRequestId,
                jobId,
                durableStatus:started?.status,
                lifecycleStage:started?.lifecycleStage,
                durableProgress:started?.durableProgress ?? started?.progress,
                responseSha256:entry.responseSha256,
            }] : undefined;
            if (progressSnapshots !== undefined) transaction.progressSnapshots = progressSnapshots;
            // Retain the *first terminal durable record*, including a failed
            // or cancelled one.  Polling only for a success used to turn a
            // useful terminal result into a timeout and let callers lose the
            // actual diagnostic that a persona saw.
            const observedPolls = new Set();
            let lastObserved;
            let terminalEvent;
            try { terminalEvent = await waitFor(async () => {
                const expectedPath = contract.poll.replace("{id}", encodeURIComponent(jobId));
                const events = cdp.events.slice(activationCursor).filter((value) => value.method === "Network.responseReceived" && new URL(value.params.response.url).pathname === expectedPath);
                // Process responses in browser order. The first non-active
                // durable record is the terminal truth; a later rerender or
                // recovery read may never replace it.
                for (const event of events) {
                    if (observedPolls.has(event.params.requestId)) continue;
                    observedPolls.add(event.params.requestId);
                    if (event.params.response.status < 200 || event.params.response.status >= 300) {
                        throw new OutcomeLibraryTerminalBoundaryError("server-error", {
                            requestId:entry.browserRequestId,
                            jobId,
                            lastObserved:{browserRequestId:event.params.requestId, httpStatus:event.params.response.status},
                        });
                    }
                    let result;
                    try {
                        const body = await readBrowserResponseBody(event.params.requestId, observation);
                        result = JSON.parse(body.body || "{}");
                    } catch (error) {
                        lastObserved = {browserRequestId:event.params.requestId, httpStatus:event.params.response.status, readError:String(error)};
                        continue;
                    }
                    const snapshot = {source:"rendered-poll", browserRequestId:event.params.requestId, jobId:result?.id, durableStatus:result?.status, lifecycleStage:result?.lifecycleStage, durableProgress:result?.durableProgress ?? result?.progress, httpStatus:event.params.response.status, responseSha256:digest(JSON.stringify(result))};
                    if (progressSnapshots !== undefined) progressSnapshots.push(snapshot);
                    lastObserved = snapshot;
                    if (result?.id !== jobId) throw new OutcomeLibraryTerminalBoundaryError("uncorrelated-poll", {requestId:entry.browserRequestId, jobId, lastObserved});
                    if (!P805_OUTCOME_LIBRARY_ACTIVE_JOB_STATUSES.has(result?.status)) return {event, result};
                }
                return false;
            }, `${observation} rendered terminal job`, contract.body === "outcome-library" ? 120_000 : 30_000); }
            catch (error) {
                if (error instanceof OutcomeLibraryTerminalBoundaryError) throw error;
                const kind = lastObserved === undefined ? "missing-poll" : P805_OUTCOME_LIBRARY_ACTIVE_JOB_STATUSES.has(lastObserved.durableStatus) ? "slow-job" : "poll-read-failure";
                throw new OutcomeLibraryTerminalBoundaryError(kind, {requestId:entry.browserRequestId, jobId, lastObserved, progressSnapshots});
            }
            api.push({observation, method:"GET", path:new URL(terminalEvent.event.params.response.url).pathname, status:terminalEvent.event.params.response.status, payload:terminalEvent.result, browserRequestId:terminalEvent.event.params.requestId, initiator:"rendered-poll"});
            if (!["completed", "success", "ok", "valid", "partial"].includes(terminalEvent.result?.status) || ["failed", "error", "cancelled", "incomplete", "load-error", "invalid"].includes(terminalEvent.result?.result?.status)) throw new OutcomeLibraryTerminalBoundaryError("terminal-failure", {requestId:entry.browserRequestId, jobId, firstTerminal:{browserRequestId:terminalEvent.event.params.requestId, durableStatus:terminalEvent.result?.status, result:terminalEvent.result}, progressSnapshots});
            const terminal = {status:terminalEvent.result.status, result:terminalEvent.result, resultSha256:digest(JSON.stringify(terminalEvent.result)), jobId, pollPath:contract.poll.replace("{id}", encodeURIComponent(jobId)), browserRequestId:terminalEvent.event.params.requestId, source:"rendered-poll"};
            transaction.terminal = {status:terminal.status, resultSha256:terminal.resultSha256, source:terminal.source, pollPath:terminal.pollPath, browserRequestId:terminal.browserRequestId, causedByRequestId:entry.browserRequestId};
            return {...entry, terminal};
        };
        // Recovery uses the very same operation transaction as the persona
        // matrix.  Its initial response may intentionally be a 202, but its
        // final browser poll must still close the original control's receipt.
        const browserTerminal = async (pathname, observation, cursor, statuses, transactions = [], timeout = 30_000, capturePointerTransition = false) => {
            const terminal = await waitFor(async () => {
                // As above, retain the most recent durable state rather than
                // pinning this recovery path to its first queued response.
                const event = cdp.events.slice(cursor).findLast((value) => value.method === "Network.responseReceived" && new URL(value.params.response.url).pathname === pathname);
                if (!event) return false;
                try { const response = await readBrowserResponseBody(event.params.requestId, observation), payload = JSON.parse(response.body || "{}"); return statuses.includes(payload?.status) ? {event, payload} : false; } catch { return false; }
            }, `${observation} rendered terminal result`, timeout);
            api.push({observation, method:"GET", path:pathname, status:terminal.event.params.response.status, payload:terminal.payload, browserRequestId:terminal.event.params.requestId, initiator:"rendered-poll"});
            const receipt = {status:terminal.payload.status, jobId:terminal.payload.id, result:terminal.payload, resultSha256:digest(JSON.stringify(terminal.payload)), source:"rendered-poll", pollPath:pathname, browserRequestId:terminal.event.params.requestId};
            for (const transaction of Array.isArray(transactions) ? transactions : [transactions]) {
                if (!transaction) continue;
                transaction.terminal = {...receipt, causedByRequestId:transaction.request?.browserRequestId};
                transaction.elapsedMs = Date.now() - transaction.startedAtMs;
                const pointer = transaction.pointerActivations?.[0];
                if (capturePointerTransition && pointer) {
                    // The terminal network response can precede React's
                    // replacement commit.  Keep the pre-dispatch native
                    // pointer receipt intact, then wait for the correlated
                    // terminal result before classifying its control as
                    // retained, replaced, or removed.  Sampling immediately
                    // here made a valid Retry look like it had lost focus
                    // merely because React had not painted its replacement
                    // yet.
                    transaction.postTransitionRenderedState = await waitFor(() => observeP805PointerTerminal(evaluate, transaction, receipt), `${observation} post-transition rendered terminal`, timeout);
                    if (!hasRenderedActivation({interaction:{activation:"pointer", pointerActivated:true}, transaction}, transaction.control?.stableControlId)) fail(`${observation} pointer transaction lost its captured identity, native dispatch focus, hit-tested dispatch, request, terminal, or post-transition replacement state`);
                }
            }
            return terminal.payload;
        };
        // One transaction owns a public control from its rendered
        // precondition through its request and terminal result.  It is
        // deliberately not an adapter that accepts a caller-supplied DOM id
        // or label: the lifecycle selector finds the product control, then
        // records the identity, name and disabled explanation actually shown
        // to the person.  Each rendered control receives one keyboard
        // activation; a confirmation is a second, explicit lifecycle phase,
        // never an Enter/Space retry race.
        const captureRenderedOperationFields = async (operation, observation, lifecycleField) => waitFor(() => evaluate(`(() => {
            const lifecycleField = ${JSON.stringify(lifecycleField ?? null)};
            const visible = (item) => !!(item.offsetWidth || item.offsetHeight || item.getClientRects().length);
            const accessibleName = (item) => {
                const labelledBy = (item.getAttribute('aria-labelledby') || '').split(/\\s+/).filter(Boolean)
                    .map((id) => document.getElementById(id)?.textContent?.trim()).filter(Boolean).join(' ');
                const labels = item instanceof HTMLInputElement || item instanceof HTMLTextAreaElement || item instanceof HTMLSelectElement
                    ? [...item.labels || []].map((label) => label.textContent?.trim()).filter(Boolean).join(' ') : '';
                return (item.getAttribute('aria-label') || labelledBy || labels || item.getAttribute('name') || '').trim();
            };
            const forms = [...document.querySelectorAll('[data-pokie-lifecycle-form="' + ${JSON.stringify(operation)} + '"]')]
                .filter((candidate) => candidate instanceof HTMLElement && visible(candidate));
            // Build/Export can render several registry cards. The transaction
            // must read the card that contains this public field, never the
            // first similarly-classed sibling in DOM order.
            const form = lifecycleField === null
                ? forms[0]
                : forms.find((candidate) => candidate.querySelector('[data-pokie-lifecycle-field="' + lifecycleField + '"]') !== null);
            if (!(form instanceof HTMLElement) || !visible(form)) return false;
            const fields = [...form.querySelectorAll('input,textarea,select')].filter((item) => visible(item)).map((item) => {
                const validatable = item instanceof HTMLInputElement || item instanceof HTMLTextAreaElement || item instanceof HTMLSelectElement;
                return {
                    stableControlId:item.id,
                    identityAttribute:'id',
                    visible:true,
                    accessibleName:accessibleName(item),
                    value:item.value,
                    disabled:item.disabled,
                    required:item.required,
                    validation:{valid:validatable ? item.checkValidity() : false, message:validatable ? item.validationMessage : ''},
                };
            });
            return {scope:{identityAttribute:'data-pokie-lifecycle-form', value:${JSON.stringify(operation)}, tagName:form.tagName.toLowerCase()}, fields};
        })()`), `${observation} rendered ${operation} form fields`);
        // Editable fields belong to an editable-submission control, not to a
        // generic operation name.  Read the rendered control first and only
        // then collect the form that makes that exact control submittable.
        // This keeps list/refresh controls from inheriting a nearby Configure
        // form merely because they share an operation's screen.
        const captureRenderedEditableFormState = async (operation, observation, actionControlId, preparedFormState, requireValid = true) => {
            const formState = await waitFor(() => evaluate(`(() => {
                const operation = ${JSON.stringify(operation)}, actionControlId = ${JSON.stringify(actionControlId)}, preparedFormState = ${JSON.stringify(preparedFormState ?? null)}, requireValid = ${JSON.stringify(requireValid)};
                const visible = (item) => !!(item.offsetWidth || item.offsetHeight || item.getClientRects().length);
                const accessibleName = (item) => {
                    const labelledBy = (item.getAttribute('aria-labelledby') || '').split(/\\s+/).filter(Boolean)
                        .map((id) => document.getElementById(id)?.textContent?.trim()).filter(Boolean).join(' ');
                    const labels = item instanceof HTMLInputElement || item instanceof HTMLTextAreaElement || item instanceof HTMLSelectElement
                        ? [...item.labels || []].map((label) => label.textContent?.trim()).filter(Boolean).join(' ') : '';
                    return (item.getAttribute('aria-label') || labelledBy || labels || item.innerText || item.textContent || item.getAttribute('name') || '').trim();
                };
                const action = document.getElementById(actionControlId);
                if (!(action instanceof HTMLElement) || !visible(action) || action.getAttribute('data-pokie-lifecycle') !== 'operation' || action.getAttribute('data-pokie-lifecycle-operation') !== operation || action.getAttribute('data-pokie-transaction-state') !== 'editable-submission') return false;
                const form = action.closest('[data-pokie-lifecycle-form="' + operation + '"]');
                const scope = form instanceof HTMLElement && visible(form)
                    ? {identityAttribute:'data-pokie-lifecycle-form', value:operation, tagName:form.tagName.toLowerCase()}
                    : preparedFormState?.scope;
                const fields = preparedFormState === null ? (form instanceof HTMLElement && visible(form) ? [...form.querySelectorAll('input,textarea,select')].filter((item) => visible(item)).map((item) => {
                    const validatable = item instanceof HTMLInputElement || item instanceof HTMLTextAreaElement || item instanceof HTMLSelectElement;
                    return {
                        stableControlId:item.id,
                        identityAttribute:'id',
                        visible:true,
                        accessibleName:accessibleName(item),
                        value:item.value,
                        disabled:item.disabled,
                        required:item.required,
                        validation:{valid:validatable ? item.checkValidity() : false, message:validatable ? item.validationMessage : ''},
                    };
                }) : []) : preparedFormState.fields;
                // An intentionally invalid submission (the recovery/error
                // path) still needs the exact same DOM receipt as a valid
                // one.  Preserve its browser validation state instead of
                // making the runner skip directly to a server request.
                if (fields.length === 0 || fields.some((field) => !field.stableControlId || !field.accessibleName || (requireValid && !field.validation.valid) || field.disabled)) return false;
                const validatableAction = action instanceof HTMLButtonElement || action instanceof HTMLInputElement || action instanceof HTMLSelectElement || action instanceof HTMLTextAreaElement;
                if (scope?.identityAttribute !== 'data-pokie-lifecycle-form' || scope.value !== operation || typeof scope.tagName !== 'string' || !scope.tagName) return false;
                return {operation, capturedBeforeSubmission:true, scope, actionControl:{stableControlId:action.id, identityAttribute:'id', visible:true, accessibleName:accessibleName(action), validation:{valid:!validatableAction || action.checkValidity(), message:validatableAction ? action.validationMessage : ''}}, fields};
            })()`), `${observation} visible rendered form state for ${operation}`);
            return formState;
        };
        const focusCapturedLifecycleControl = async (lifecycle, operation, stableControlId) => evaluate(`(() => {
            const visible = (item) => !!(item.offsetWidth || item.offsetHeight || item.getClientRects().length);
            const accessibleName = (item) => (item.getAttribute('aria-label') || item.innerText || item.textContent || '').trim();
            const item = document.getElementById(${JSON.stringify(stableControlId)});
            if (!(item instanceof HTMLElement) || !visible(item) || item.getAttribute('data-pokie-lifecycle') !== ${JSON.stringify(lifecycle)} || item.getAttribute('data-pokie-lifecycle-operation') !== ${JSON.stringify(operation)}) return null;
            const disabled = 'disabled' in item && Boolean(item.disabled);
            const descriptionIds = (item.getAttribute('aria-describedby') || '').split(/\\s+/).filter(Boolean);
            const disabledExplanation = item.getAttribute('title') || descriptionIds.map((id) => document.getElementById(id)?.textContent?.trim()).find(Boolean) || null;
            item.focus({preventScroll:true});
            return document.activeElement === item ? {control:accessibleName(item), matchedLabel:accessibleName(item), keyboardFocused:true, enabled:!disabled, disabled, disabledExplanation, accessibleName:accessibleName(item), role:item.getAttribute('role') || item.tagName.toLowerCase(), stableControlId:item.id, identityAttribute:'id', transactionState:item.getAttribute('data-pokie-transaction-state'), lifecycle:{kind:${JSON.stringify(lifecycle)}, value:${JSON.stringify(operation)}}} : null;
        })()`);
        const renderedTransactionControl = async ({lifecycle, operation, observation, formState}) => {
            const control = await waitFor(async () => {
                const candidate = formState === undefined
                    ? await focusLifecycleControl(lifecycle, operation, "button,a")
                    : await focusCapturedLifecycleControl(lifecycle, operation, formState.actionControl.stableControlId);
                // The collector records the disabled state and explanation
                // from the real control, then waits for Studio's own
                // preflight to enable it. This avoids converting a transient
                // rendered loading state into an audit-side retry or a
                // separate API call.
                return candidate?.keyboardFocused && candidate.enabled && typeof candidate.transactionState === "string" && candidate.transactionState.length > 0 ? candidate : false;
            }, `${observation} rendered ${operation} control`);
            if (!p805TransactionStateClass(control)) fail(`${observation} rendered ${operation} did not publish a supported transaction state class`);
            return control;
        };
        const beginRenderedTransaction = async ({lifecycle, operation, observation, confirmation = false, formState, stateClass, control:capturedControl, transport = "pointer", capturePostTransition = false}) => {
            const control = capturedControl ?? await renderedTransactionControl({lifecycle, operation, observation, formState});
            if (p805TransactionStateClass(control) !== stateClass) fail(`${observation} transaction state was not derived from its rendered control`);
            if (formState !== undefined && control.transactionState !== "editable-submission") fail(`${observation} recorded editable fields for a ${control.transactionState} control`);
            const transaction = {
                operation,
                stateClass,
                // Persist the name that was exposed while the form was valid
                // and ready to submit. Preflight may replace the button text
                // during the same click, but it cannot change this DOM id.
                control:formState === undefined ? control : {...control, control:formState.actionControl.accessibleName, matchedLabel:formState.actionControl.accessibleName, accessibleName:formState.actionControl.accessibleName},
                ...(formState === undefined ? {} : {formState}),
                confirmation: {required:confirmation, state:confirmation ? "opening" : "not-required", control:null},
                pointerActivations:[],
                keyboardActivations:[],
            };
            transaction.viewport = await evaluate("({width:window.innerWidth,height:window.innerHeight})");
            transaction.startedAtMs = Date.now();
            transaction.browserEventCursor = cdp.events.length;
            // Recovery retains its native pointer receipt even when React
            // replaces the activated control. Replay has its own keyboard
            // transport; it does not substitute evidence for Retry.
            const activation = await activateFocusedControl(lifecycle, control, transport === "keyboard" || operation === "replay" ? "keyboard" : "pointer", capturePostTransition);
            if (activation.kind === "pointer" && activation.preDispatchFocus?.native !== true) fail(observation + " rendered " + operation + " control did not retain native focus through its pointer activation");
            control.keyboardFocused = activation.preDispatchFocus?.native === true;
            transaction[activation.kind === "keyboard" ? "keyboardActivations" : "pointerActivations"].push({phase:"operation", ...activation});
            if (confirmation) {
                const confirmationControl = await waitFor(() => evaluate(`(() => {
                    const visible = (item) => !!(item.offsetWidth || item.offsetHeight || item.getClientRects().length);
                    const accessibleName = (item) => (item.getAttribute('aria-label') || item.innerText || item.textContent || '').trim();
                    const item = [...document.querySelectorAll('[data-pokie-confirmation="confirm"]')].find((candidate) => visible(candidate) && candidate.getAttribute('data-pokie-confirmation-operation') === ${JSON.stringify(operation)});
                    if (!(item instanceof HTMLButtonElement)) return false;
                    const disabled = item.disabled;
                    const descriptionIds = (item.getAttribute('aria-describedby') || '').split(/\\s+/).filter(Boolean);
                    const disabledExplanation = item.getAttribute('title') || descriptionIds.map((id) => document.getElementById(id)?.textContent?.trim()).find(Boolean) || null;
                    item.focus({preventScroll:true});
                    return document.activeElement === item ? {stableControlId:item.id, identityAttribute:'id', accessibleName:accessibleName(item), enabled:!disabled, disabled, disabledExplanation, role:item.getAttribute('role') || item.tagName.toLowerCase()} : false;
                })()`), `${observation} rendered ${operation} confirmation`);
                if (!confirmationControl.enabled) fail(`Studio rendered ${operation} confirmation disabled: ${confirmationControl.disabledExplanation ?? "no explanation"}`);
                transaction.confirmation = {required:true, state:"visible", control:confirmationControl};
                transaction.browserEventCursor = cdp.events.length;
                // Mantine opens confirmations in a portal transition.  The
                // focused native button is already the public control, but
                // let its transition settle before its one keyboard
                // activation so the click cannot be lost to the mount frame.
                await wait(250);
                transaction.confirmation.activation = {kind:"pointer", controlId:confirmationControl.stableControlId, count:1, ...await clickCapturedControl(confirmationControl.stableControlId, true, true)};
                transaction.confirmation.state = "activated";
            }
            return transaction;
        };
        const activateRenderedTransaction = async ({lifecycle, operation, observation, cursor, method, path:expectedPath, confirmation = false, formState, stateClass = "read-only-operation", control, transport, capturePostTransition = false}) => {
            const transaction = await beginRenderedTransaction({lifecycle, operation, observation, confirmation, formState, stateClass, control, transport, capturePostTransition});
            const activationCursor = transaction.browserEventCursor;
            if (!Number.isSafeInteger(activationCursor) || activationCursor < cursor) fail(`${observation} has no browser event boundary for its rendered ${operation} activation`);
            const event = await waitFor(() => cdp.events.slice(activationCursor).find((value) => value.method === "Network.requestWillBeSent" && value.params.request.method === method && (expectedPath === undefined || new URL(value.params.request.url).pathname === expectedPath)) || false, `${observation} rendered ${operation} request`);
            const responseEvent = await waitFor(() => cdp.events.slice(activationCursor).find((value) => value.method === "Network.responseReceived" && value.params.requestId === event.params.requestId) || false, `${observation} rendered ${operation} response`);
            const response = await readBrowserResponseBody(event.params.requestId, observation), payload = JSON.parse(response.body || "{}"), entry = {observation, method:event.params.request.method, path:new URL(event.params.request.url).pathname, bodySha256:digest(event.params.request.postData ?? ""), status:responseEvent.params.response.status, responseSha256:digest(JSON.stringify(payload)), payload, browserRequestId:event.params.requestId, initiator:"rendered-control"};
            transaction.request = {browserRequestId:entry.browserRequestId, method:entry.method, path:entry.path, bodySha256:entry.bodySha256, status:entry.status, responseSha256:entry.responseSha256};
            transaction.elapsedMs = Date.now() - transaction.startedAtMs;
            transaction.requestCount = 1;
            if (transaction.confirmation.required) transaction.confirmation.state = "confirmed";
            api.push(entry); return {response:{status:entry.status, ok:entry.status >= 200 && entry.status < 300}, payload, entry, cursor, transaction};
        };
        const startRenderedSimulation = async (projectBaseRoute, observation, rounds, expectedStatuses = [202]) => {
            await navigateProjectTab(projectBaseRoute, "simulation", observation);
            await waitFor(() => evaluate("document.readyState === 'complete' && location.hash.endsWith('/simulation')"), `${observation} rendered simulation route`);
            // A server-side validation diagnostic intentionally leaves a
            // person on the Run step.  Return through the same rendered
            // Configure control before asking for its form again; waiting for
            // a hidden form would turn recovery into an audit-only shortcut.
            await ensureSimulationConfigure(observation);
            await waitFor(() => evaluate("document.body.innerText.includes('Run Simulation')"), `${observation} rendered simulation form`);
            const cursor = cdp.events.length;
            if (!await waitFor(() => setLifecycleField("simulation-rounds", String(rounds)), `${observation} rendered simulation rounds`)) fail(`Studio did not accept simulation rounds for ${observation}`);
            const control = await renderedTransactionControl({lifecycle:"operation", operation:"simulation", observation, expectedStateClass:"editable-submission"});
            const formState = await captureRenderedEditableFormState("simulation", observation, control.stableControlId, undefined, expectedStatuses.includes(400) === false);
            const started = await activateRenderedTransaction({lifecycle:"operation", operation:"simulation", observation, cursor, method:"POST", path:"/api/project/simulations", formState, stateClass:"editable-submission", control});
            if (!expectedStatuses.includes(started.response.status) || (expectedStatuses.includes(202) && typeof started.payload?.id !== "string")) fail(`${observation} rendered simulation did not produce its expected public response`);
            return started;
        };
        const startRenderedReplay = async (projectBaseRoute, observation, round = 1, expectedStatuses = [202]) => {
            await navigateProjectTab(projectBaseRoute, "replay", observation);
            await waitFor(() => evaluate("document.readyState === 'complete' && document.body.innerText.includes('Load')"), `${observation} rendered replay form`);
            const cursor = cdp.events.length;
            if (!await waitFor(() => setReplayRound(String(round)), `${observation} rendered replay round`)) fail(`Studio did not accept replay target for ${observation}`);
            // Loading the replay target is its own rendered precondition.  A
            // recovery replay must traverse it just as the persona matrix
            // does; otherwise it waits for an operation control that the UI
            // correctly has not rendered yet.
            // Load replaces this editable target form with the replay review
            // surface.  Keep the actual DOM field receipt from before that
            // product-owned transition and bind it to the later Run control;
            // collecting after Load would manufacture an empty Configure
            // receipt for this recovery submission.
            const preparedFormState = await captureRenderedOperationFields("replay", observation, "replay-round");
            if (preparedFormState.fields.length === 0 || preparedFormState.fields.some((field) => !field.stableControlId || !field.accessibleName || field.disabled || !field.validation?.valid)) fail(`Studio did not expose a valid rendered replay target form for ${observation}`);
            await activateRenderedPrecondition("replay-target", observation);
            await waitFor(() => evaluate("!!document.getElementById('replay-run')"), `${observation} rendered replay run control`);
            const control = await renderedTransactionControl({lifecycle:"operation", operation:"replay", observation, expectedStateClass:"editable-submission"});
            const formState = await captureRenderedEditableFormState("replay", observation, control.stableControlId, preparedFormState);
            const started = await activateRenderedTransaction({lifecycle:"operation", operation:"replay", observation, cursor, method:"POST", path:"/api/project/replays", formState, stateClass:"editable-submission", control});
            if (!expectedStatuses.includes(started.response.status) || (expectedStatuses.includes(202) && typeof started.payload?.id !== "string")) fail(`${observation} rendered replay did not produce its expected public response`);
            return started;
        };
        // Each state owns its route, navigation control, and terminal screen
        // predicate.  The runner therefore cannot turn an operation into a
        // route visit plus an unrelated request: a missing or disabled public
        // control fails before any network receipt can be written.
        const viewportDimensions = {
            wide: {width:1440, height:900, mobile:false},
            compact: {width:960, height:800, mobile:false},
            narrow: {width:390, height:844, mobile:true},
        };
        // Product controls declare their lifecycle role.  The collector only
        // selects that public role and reads the identity, accessible name and
        // current precondition back from the rendered element; it never gives
        // an id or label to the DOM lookup.
        const focusLifecycleControl = async (lifecycle, value, selector) => evaluate(`(() => {
            const lifecycle = ${JSON.stringify(lifecycle)}, value = ${JSON.stringify(value)};
            const visible = (item) => !!(item.offsetWidth || item.offsetHeight || item.getClientRects().length);
            const accessibleName = (item) => (item.getAttribute('aria-label') || item.innerText || item.textContent || '').trim();
            // A collapsed Mantine navbar leaves its tab controls measurable
            // while moving them beyond the viewport.  A layout-visible check alone would
            // then capture that stale sibling even after the real narrow
            // drawer was opened.  Resolve navigation from the same live
            // hit-target boundary used for pointer activation, so the receipt
            // always names the public control a person can actually press.
            const hitTarget = (item) => {
                const box = item.getBoundingClientRect();
                if (box.width <= 0 || box.height <= 0 || box.left < 0 || box.right > window.innerWidth || box.top < 0 || box.bottom > window.innerHeight) return false;
                const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
                return hit === item || item.contains(hit);
            };
            const item = [...document.querySelectorAll(${JSON.stringify(selector)})].find((control) => visible(control) && control.getAttribute('data-pokie-lifecycle') === lifecycle && (lifecycle === 'navigation' ? control.getAttribute('data-pokie-lifecycle-route') === value && hitTarget(control) : control.getAttribute('data-pokie-lifecycle-operation') === value));
            if (!(item instanceof HTMLElement)) return null;
            const disabled = 'disabled' in item && Boolean(item.disabled);
            const descriptionIds = (item.getAttribute('aria-describedby') || '').split(/\\s+/).filter(Boolean);
            const disabledExplanation = item.getAttribute('title') || descriptionIds.map((id) => document.getElementById(id)?.textContent?.trim()).find(Boolean) || null;
            item.focus({preventScroll:true});
            return {control:accessibleName(item), matchedLabel:accessibleName(item), keyboardFocused:document.activeElement === item,
                enabled:!disabled, disabled, disabledExplanation, accessibleName:accessibleName(item), role:item.getAttribute('role') || item.tagName.toLowerCase(),
                stableControlId:item.id, identityAttribute:'id', transactionState:item.getAttribute('data-pokie-transaction-state'), lifecycle:{kind:lifecycle, value}};
        })()`);
        // Recovery controls are not part of the persona operation matrix, but
        // they still have to be found from the live product DOM.  This helper
        // deliberately takes a DOM predicate rather than a control id: its
        // receipt is the actual id/name/focus state that the browser exposed.
        const focusRenderedControl = async (selector, predicateSource) => evaluate(`(() => {
            const visible = (item) => !!(item.offsetWidth || item.offsetHeight || item.getClientRects().length);
            const accessibleName = (item) => (item.getAttribute('aria-label') || [...item.labels || []].map((label) => label.textContent?.trim()).find(Boolean) || item.innerText || item.textContent || '').trim();
            const predicate = ${predicateSource};
            const item = [...document.querySelectorAll(${JSON.stringify(selector)})].find((candidate) => candidate instanceof HTMLElement && visible(candidate) && predicate(candidate, accessibleName(candidate)));
            if (!(item instanceof HTMLElement) || ('disabled' in item && Boolean(item.disabled))) return null;
            item.focus({preventScroll:true});
            return document.activeElement === item ? {stableControlId:item.id, identityAttribute:'id', accessibleName:accessibleName(item), keyboardFocused:true, enabled:true, disabled:false} : null;
        })()`);
        const setScreenField = async (label, value) => evaluate(`(() => {
            const label = [...document.querySelectorAll('label')].find((item) => item.textContent?.trim() === ${JSON.stringify(label)});
            // Mantine associates some composite inputs through their input
            // name rather than a label htmlFor.  Read that relationship from
            // the rendered form; do not invent a runner-only control id.
            const input = label?.htmlFor ? document.getElementById(label.htmlFor) : [...document.querySelectorAll('input,textarea')].find((item) => item.getAttribute('aria-label') === ${JSON.stringify(label)} || item.getAttribute('name') === ${JSON.stringify(label.toLowerCase().replaceAll(/[^a-z0-9]+/g, ""))});
            if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) || input.disabled) return false;
            const prototype = input instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
            Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(input, ${JSON.stringify(value)});
            input.dispatchEvent(new Event('input', {bubbles:true}));
            input.dispatchEvent(new Event('change', {bubbles:true}));
            return input.value === ${JSON.stringify(value)};
        })()`);
        const setReplayRound = async (value) => setLifecycleField("replay-round", value);
        // A restored terminal job intentionally opens its Review step.  The
        // next first-time-user run must explicitly return to Configure through
        // the product's own keyboard-operable step control before it can set
        // its request fields.  This is not an audit-side state reset: read the
        // stable identity from the rendered DOM and activate that real control.
        const ensureSimulationConfigure = async (observation) => {
            if (await evaluate("!!document.querySelector('[data-pokie-lifecycle-field=\"simulation-rounds\"]')")) return;
            const configured = await waitFor(() => evaluate(`(() => {
                const item = document.querySelector('[data-pokie-lifecycle-step="simulation-configure"]');
                // Mantine retains aria-disabled while it reconciles a prior
                // completed step.  That advisory attribute must not override
                // the native enabled state of its keyboard-operable step
                // button: the product test surface proves Configure remains
                // usable after a completed simulation.  Read the actual DOM
                // control state and let the keyboard activation verify the
                // transition instead of rejecting a stale ARIA snapshot.
                if (!(item instanceof HTMLElement) || item.id !== 'simulation-configure' || ('disabled' in item && Boolean(item.disabled))) return false;
                item.focus({preventScroll:true});
                return document.activeElement === item ? {stableControlId:item.id, identityAttribute:'id'} : false;
            })()`), `${observation} rendered simulation Configure step`);
            if (configured.stableControlId !== "simulation-configure" || configured.identityAttribute !== "id") fail(`${observation} did not expose its rendered Configure control identity`);
            // The Stepper exposes Configure as a native keyboard-operable
            // button. Its visual sub-elements can be replaced while a
            // completed terminal promotes Review, whereas Enter stays bound
            // to the focused public step and performs the same user action.
            await activateFocusedControl("operation", configured, "keyboard");
            await waitFor(() => evaluate("!!document.querySelector('[data-pokie-lifecycle-field=\"simulation-rounds\"]')"), `${observation} rendered simulation Configure form`);
        };
        const activateRenderedPrecondition = async (operation, observation) => {
            const control = await waitFor(async () => {
                const candidate = await focusLifecycleControl("precondition", operation, "button,a");
                return candidate?.keyboardFocused ? candidate : false;
            }, `${observation} rendered ${operation} precondition`);
            if (!control.enabled) fail(`Studio rendered ${operation} precondition disabled for ${observation}: ${control.disabledExplanation ?? "no explanation"}`);
            // Replay Load replaces its own control with Run. At narrow
            // widths Chromium can retarget the release of a CDP pointer at
            // that replacement, which either loses Load or immediately
            // activates Run. Enter is the focused native button's real
            // keyboard interaction, keeps the observed DOM identity, and
            // lets the complete pointer receipt remain owned by the later
            // rendered Run control that creates the durable replay request.
            if (operation === "replay-target") await pressEnter();
            else await activateFocusedControl("precondition", control);
            return control;
        };
        // CDP is an observer/keyboard transport, never a route adapter.  A
        // route becomes eligible only after the product's visible navigation
        // control received its keyboard activation.
        const revealRenderedNavigationControl = async (route, observation) => {
            await waitFor(() => observeP805NavigationReadiness(evaluate, route), `${observation} rendered ${route} navigation context`);
            // Find and focus one live target in the same browser turn. A
            // narrow drawer is allowed to finish closing once a tab receives
            // focus, so a successful visibility probe must itself return the
            // control receipt rather than asking a later DOM lookup to find
            // the same tab again.
            const focusVisibleNavigationControl = () => evaluate(`(() => {
                const visible = (item) => !!(item.offsetWidth || item.offsetHeight || item.getClientRects().length);
                const accessibleName = (item) => (item.getAttribute('aria-label') || item.innerText || item.textContent || '').trim();
                const item = [...document.querySelectorAll('button,a')].find((candidate) => {
                    if (!(candidate instanceof HTMLElement) || !visible(candidate) || candidate.getAttribute('data-pokie-lifecycle') !== 'navigation' || candidate.getAttribute('data-pokie-lifecycle-route') !== ${JSON.stringify(route)}) return false;
                    const panel = candidate.closest('#studio-navigation-panel');
                    if (panel instanceof HTMLElement && panel.getBoundingClientRect().left >= 0) candidate.scrollIntoView({block:'nearest',inline:'nearest'});
                    const box = candidate.getBoundingClientRect();
                    if (box.width <= 0 || box.height <= 0 || box.left < 0 || box.right > window.innerWidth || box.top < 0 || box.bottom > window.innerHeight) return false;
                    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
                    return hit === candidate || candidate.contains(hit);
                });
                if (!(item instanceof HTMLElement) || ('disabled' in item && Boolean(item.disabled))) return false;
                item.focus({preventScroll:true});
                const descriptionIds = (item.getAttribute('aria-describedby') || '').split(/\\s+/).filter(Boolean);
                return {control:accessibleName(item), matchedLabel:accessibleName(item), keyboardFocused:document.activeElement === item, enabled:true, disabled:false,
                    disabledExplanation:item.getAttribute('title') || descriptionIds.map((id) => document.getElementById(id)?.textContent?.trim()).find(Boolean) || null,
                    accessibleName:accessibleName(item), role:item.getAttribute('role') || item.tagName.toLowerCase(), stableControlId:item.id, identityAttribute:'id',
                    transactionState:item.getAttribute('data-pokie-transaction-state'), lifecycle:{kind:'navigation', value:${JSON.stringify(route)}}};
            })()`);
            // On a narrow viewport Mantine retains the tab buttons in its
            // collapsed drawer.  Their DOM presence is not a visible public
            // control and clicking their off-canvas coordinates is not a user
            // workflow.  Open the product's own Burger first, then obtain the
            // tab from the visible drawer exactly as a phone user would.
            const visibleControl = await focusVisibleNavigationControl();
            if (visibleControl) return visibleControl;
            // Use the rendered disclosure rather than a runner-side viewport
            // threshold. Chromium mobile emulation and Mantine's `sm`
            // breakpoint need not expose the same `innerWidth`; the live
            // Burger is the product's authoritative indication that the tabs
            // are currently in the collapsed drawer.
            const compactNavigation = await evaluate("(()=>{const item=document.getElementById('studio-navigation-toggle'); return item instanceof HTMLButtonElement && !!(item.offsetWidth||item.offsetHeight||item.getClientRects().length);})()");
            if (!compactNavigation) {
                await evaluate(`document.querySelector('[data-pokie-lifecycle="navigation"][data-pokie-lifecycle-route=${JSON.stringify(route)}]')?.scrollIntoView({block:'nearest'});`);
                return waitFor(focusVisibleNavigationControl, `${observation} rendered ${route} navigation control`);
            }
            const burger = await waitFor(() => evaluate(`(() => {
                        const item = [...document.querySelectorAll('button')].find((candidate) => candidate instanceof HTMLButtonElement && candidate.getAttribute('aria-label') === 'Toggle navigation' && !candidate.disabled);
                        if (!(item instanceof HTMLElement)) return false;
                        item.focus({preventScroll:true});
                        return document.activeElement === item ? {stableControlId:item.id, identityAttribute:'id'} : false;
                    })()`), `${observation} rendered narrow navigation drawer control`);
            // This is one native pointer activation of the product's Burger.
            // `activateFocusedControl` preserves its complete pointer state
            // and live hit-test boundary, so Mantine receives the disclosure
            // click before the drawer's transition can expose the tab.
            const drawerOpen = await evaluate("document.getElementById('studio-navigation-toggle')?.getAttribute('aria-expanded') === 'true'");
            if (!drawerOpen) await activateFocusedControl("navigation-drawer", burger);
            return waitFor(focusVisibleNavigationControl, `${observation} rendered ${route} navigation control`);
        };
        const navigateRenderedControl = async (route, expectedRoute, observation) => {
            if (await evaluate(`location.hash === ${JSON.stringify(expectedRoute)}`)) return;
            const control = await revealRenderedNavigationControl(route, observation);
            // Keep the drawer's captured tab as the native pointer target;
            // revealRenderedNavigationControl scrolls its real scroll region
            // before capture, and focus never changes that geometry.
            const activation = await activateFocusedControl("navigation", control);
            try {
                await waitFor(() => evaluate(`location.hash === ${JSON.stringify(expectedRoute)}`), `${observation} rendered ${route} navigation`, 60_000);
            } catch (error) {
                const rendered = await evaluate(`(() => ({route:location.hash, control:document.getElementById(${JSON.stringify(control.stableControlId)})?.outerHTML?.slice(0, 500), active:[...document.querySelectorAll('[data-pokie-lifecycle="navigation"][aria-current="page"]')].map((item) => ({id:item.id, route:item.getAttribute('data-pokie-lifecycle-route'), name:(item.innerText || item.textContent || '').trim()})), terminal:[...document.querySelectorAll('[data-pokie-lifecycle-result="navigation"]')].map((item) => ({route:item.getAttribute('data-pokie-lifecycle-route'), terminal:item.getAttribute('data-pokie-lifecycle-terminal'), text:(item.textContent || '').trim()})), text:document.body.innerText.slice(0, 1000)}))()`);
                throw new Error(`${error instanceof Error ? error.message : String(error)}; rendered navigation state: ${JSON.stringify(rendered)}`);
            }
            return {control, activation};
        };
        const navigateProjectTab = async (projectBaseRoute, tab, observation, force = false) => {
            const expectedRoute = `${projectBaseRoute}/${tab}`;
            if (!force && await evaluate(`location.hash === ${JSON.stringify(expectedRoute)}`)) return;
            return navigateRenderedControl(tab, expectedRoute, observation);
        };
        const navigateHome = async (tab, observation) => {
            const expectedRoute = `#/home/${tab}`;
            if (!await evaluate("location.hash.startsWith('#/home/')")) {
                const home = await waitFor(() => focusRenderedControl("button,a", "(_item, name) => name === 'Your projects'"), `${observation} rendered Your projects breadcrumb`);
                if (!home?.keyboardFocused) fail(`${observation} did not expose its rendered Your projects breadcrumb`);
                await activateFocusedControl("navigation", home);
                // Closing a project can surface the product's real active-job
                // confirmation. Follow that visible recovery dialog through
                // its own keyboard-operable lifecycle control instead of
                // treating a stalled close as permission to navigate away.
                // A clean close never renders this control.
                let confirmedClose = false;
                await waitFor(async () => {
                    if (await evaluate("location.hash === '#/home/projects'")) return true;
                    const confirmation = await evaluate(`(() => {
                        const visible = (item) => !!(item.offsetWidth || item.offsetHeight || item.getClientRects().length);
                        const item = [...document.querySelectorAll('[data-pokie-confirmation="confirm"]')]
                            .find((candidate) => candidate instanceof HTMLElement && visible(candidate) && !('disabled' in candidate && Boolean(candidate.disabled)));
                        if (!(item instanceof HTMLElement)) return null;
                        item.focus({preventScroll:true});
                        return document.activeElement === item ? {stableControlId:item.id, identityAttribute:'id', accessibleName:(item.getAttribute('aria-label') || item.innerText || item.textContent || '').trim()} : null;
                    })()`);
                    if (!confirmation) return false;
                    if (confirmedClose) fail(`${observation} project-close confirmation remained visible after its one keyboard activation`);
                    if (!confirmation.stableControlId || confirmation.identityAttribute !== "id" || !confirmation.accessibleName) fail(`${observation} project-close confirmation lacks a rendered public control identity`);
                    confirmedClose = true;
                    await activateFocusedControl("recovery", confirmation);
                    return false;
                }, `${observation} rendered project close confirmation or navigation`);
                await waitFor(() => evaluate("location.hash === '#/home/projects'"), `${observation} rendered project close navigation`);
            }
            return navigateRenderedControl(tab, expectedRoute, observation);
        };
        const setLifecycleField = async (field, value) => evaluate(`(() => {
            const field = ${JSON.stringify(field)}, value = ${JSON.stringify(value)};
            const marker = document.querySelector('[data-pokie-lifecycle-field="' + field + '"]');
            const input = marker instanceof HTMLInputElement || marker instanceof HTMLTextAreaElement
                ? marker
                : marker?.querySelector('input,textarea');
            if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) || input.disabled) return false;
            const prototype = input instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
            Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(input, value);
            input.dispatchEvent(new Event('input', {bubbles:true}));
            input.dispatchEvent(new Event('change', {bubbles:true}));
            return input.value === value;
        })()`);
        // Outcome Library generation is the one Build/Export transaction
        // whose availability is determined by a separate asynchronous
        // preflight.  Read that product-owned card before the control is
        // activated so a missing, stale, loading, unsupported, or disabled
        // card fails at its own public boundary instead of later timing out
        // while some unrelated route happens to settle.
        const outcomeLibraryCardState = async () => evaluate(`(() => {
            const visible = (item) => !!(item.offsetWidth || item.offsetHeight || item.getClientRects().length);
            const card = document.querySelector('[data-pokie-lifecycle-card="outcome-library"]');
            const control = document.getElementById('outcome-library-generate');
            const preflight = document.querySelector('[data-pokie-lifecycle-preflight="outcome-library"]');
            if (!(card instanceof HTMLElement) || !visible(card)) return {state:'missing-card'};
            if (!(control instanceof HTMLButtonElement) || !visible(control)) return {state:'missing-control'};
            if (control.getAttribute('data-pokie-lifecycle') !== 'operation' || control.getAttribute('data-pokie-lifecycle-operation') !== 'outcome-library' || control.getAttribute('data-pokie-transaction-state') !== 'editable-submission') return {state:'stale-control'};
            if (!(preflight instanceof HTMLElement) || !visible(preflight) || preflight.getAttribute('data-pokie-lifecycle-preflight-control') !== control.id) return {state:'missing-preflight'};
            const status = preflight.getAttribute('data-pokie-lifecycle-preflight-status');
            if (status === 'loading') return {state:'loading', status};
            if (status !== 'ok') return {state:status === 'error' ? 'unsupported-preflight' : 'stale-preflight', status};
            if (control.disabled) return {state:'disabled-control', status, disabledExplanation:control.getAttribute('title') || null};
            return {state:'ready', status, controlId:control.id, cardLabel:[...card.querySelectorAll('*')].find((item) => item.textContent?.trim() === 'Outcome library generator')?.textContent?.trim() ?? null, enabled:true, disabled:false};
        })()`);
        const requireOutcomeLibraryCard = async (observation) => {
            let state = await outcomeLibraryCardState();
            // The route and its navigation receipt can render before the
            // Build/Export card subtree has committed.  In particular the
            // first artifact-target request is started by that subtree, so a
            // one-shot query here used to call a real, just-entered route a
            // missing Outcome Library card.  Wait for the public card and
            // its preflight as one rendered transaction boundary; do not
            // replace it with a route-level or API-only shortcut.
            if (['missing-card', 'missing-control', 'missing-preflight', 'loading'].includes(state?.state)) state = await waitFor(async () => {
                const next = await outcomeLibraryCardState();
                return ['missing-card', 'missing-control', 'missing-preflight', 'loading'].includes(next?.state) ? false : next;
            }, `${observation} rendered Outcome Library card and preflight`);
            // Bounded coverage is an explicit product choice.  When a real
            // project's outcome space requires it, make that choice through
            // the visible strategy control before accepting the Generate
            // button as an enabled submission.  This keeps the audit on the
            // same first-time-user path rather than weakening the product's
            // safety gate or treating a disabled operation as a ready one.
            if (state?.state === 'disabled-control' && state.disabledExplanation === 'Choose sampled or conditional bounded coverage before generating this Outcome Library.') {
                const sampled = await focusRenderedControl('button', "(item, name) => name === 'Sampled' && item.closest('[data-pokie-lifecycle-card=\"outcome-library\"]') !== null");
                if (!sampled?.keyboardFocused) fail(`${observation} did not expose its rendered sampled Outcome Library coverage control`);
                await activateFocusedControl('precondition', sampled);
                state = await waitFor(async () => {
                    const next = await outcomeLibraryCardState();
                    return ['loading', 'disabled-control'].includes(next?.state) ? false : next;
                }, `${observation} sampled Outcome Library coverage preflight`);
            }
            if (state?.state !== 'ready' || state.controlId !== 'outcome-library-generate' || state.cardLabel !== 'Outcome library generator') {
                fail(`${observation} rendered Outcome Library card is ${state?.state ?? 'unreadable'}${state?.disabledExplanation ? `: ${state.disabledExplanation}` : ''}`);
            }
            return state;
        };
        const prepareScreenOperation = async (body, viewport, observation) => {
            if (body === "outcome-library") {
                const preflight = await requireOutcomeLibraryCard(observation);
                const formState = await captureRenderedOperationFields("outcome-library", observation);
                if (formState.fields.length === 0 || formState.fields.some((field) => !field.stableControlId || !field.accessibleName || !field.validation?.valid || field.disabled)) {
                    fail(`${observation} rendered Outcome Library form is not an enabled, valid, named DOM submission state`);
                }
                return {formState, outcomeLibraryPreflight:preflight};
            }
            if (body === "artifact-build") {
                const configured = await waitFor(
                    () => setLifecycleField("artifact-build-destination", path.join(context.workspace, `P8-05 ${observation} ${viewport}.xlsx`)),
                    `${observation} product-owned artifact destination`,
                );
                if (!configured) return false;
                // Changing a destination deliberately starts the product's
                // asynchronous preflight. Capture this exact visible form
                // while it is still the public editable state that received
                // the person's value, rather than sampling it later from an
                // arbitrary screen after the preflight has reconciled.
                const formState = await captureRenderedOperationFields("artifact-build", observation, "artifact-build-destination");
                if (formState.fields.length === 0 || formState.fields.some((field) => !field.stableControlId || !field.accessibleName || !field.validation?.valid || field.disabled)) {
                    fail(`${observation} rendered artifact-build form is not an enabled, valid, named DOM submission state: ${JSON.stringify(formState)}`);
                }
                return {formState};
            }
            const setRequiredScreenField = (label, value) => waitFor(
                () => setScreenField(label, value),
                `${observation} product-owned ${label} field`,
            );
            if (body === "simulation") {
                await ensureSimulationConfigure(observation);
                return waitFor(
                    () => setLifecycleField("simulation-rounds", "1"),
                `${observation} product-owned simulation rounds field`,
                );
            }
            if (body === "replay") {
                if (!await waitFor(() => setReplayRound("1"), `${observation} product-owned replay round field`)) return false;
                // The Run button is rendered only after Load has accepted the
                // target, while the editable target form is intentionally
                // replaced by the replay review surface.  Read the real form
                // before that product transition and carry only that DOM
                // receipt to the eventual, separately-rendered submission
                // control.  This keeps a replay from being misclassified as
                // a read-only activation merely because its action lives in
                // the next rendered state.
                const formState = await captureRenderedOperationFields("replay", observation, "replay-round");
                if (formState.fields.length === 0 || formState.fields.some((field) => !field.stableControlId || !field.accessibleName || !field.validation?.valid || field.disabled)) return false;
                await activateRenderedPrecondition("replay-target", observation);
                const runControl = await waitFor(() => evaluate("!!document.getElementById('replay-run')"), `${observation} rendered replay run control`);
                return runControl ? {formState} : false;
            }
            if (body === "certification") {
                const source = await setRequiredScreenField("Source outcome-library bundle directory", outcomeBundle);
                // The validation action lives on the next step, so read the
                // configured source form before that legitimate product
                // transition hides it.  The later transaction still reads
                // the Validate button from the rendered DOM; this only
                // preserves the actual form state that enabled it.
                const formState = source ? await captureRenderedOperationFields("certification", observation) : undefined;
                if (source && (formState.fields.length === 0 || formState.fields.some((field) => !field.stableControlId || !field.accessibleName || !field.validation?.valid || field.disabled))) return false;
                // Validation is deliberately a separate first-time-user step:
                // entering a source only enables the product's Continue
                // control.  Traverse that real, labelled precondition before
                // looking up the subsequent Validate operation, rather than
                // treating a configured field as an invisible submission.
                if (source && !await evaluate("!!document.querySelector('[data-pokie-lifecycle=\"operation\"][data-pokie-lifecycle-operation=\"certification\"]')")) {
                    await activateRenderedPrecondition("certification-validate", observation);
                }
                return source ? {formState} : false;
            }
            if (body === "fairness") {
                const source = await setRequiredScreenField("Source outcome-library bundle directory", outcomeBundle);
                const mode = await setRequiredScreenField("Mode name", "base");
                const server = await setRequiredScreenField("Server seed", "p8-05-server-seed");
                const client = await setRequiredScreenField("Client seed", "p8-05-client-seed");
                return source && mode && server && client;
            }
            return true;
        };
        // Certification consumes an outcome-library project while Provably
        // Fair consumes a runnable package.  Open both through the rendered
        // Projects import flow before their corresponding workflow states;
        // merely pointing a blueprint route at those tabs would make their
        // intentionally capability-gated controls disappear.
        const openImportedProject = async (projectLocation, observation) => {
            await navigateHome("projects", observation);
            await waitFor(() => evaluate("document.readyState === 'complete' && !!document.getElementById('project-import-location') && !!document.getElementById('project-import-check')"), `${observation} rendered project import controls`);
            const locationSet = await evaluate(`(() => {
                const input = document.getElementById('project-import-location');
                if (!(input instanceof HTMLInputElement) || input.disabled) return false;
                Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, ${JSON.stringify(projectLocation)});
                input.dispatchEvent(new Event('input', {bubbles:true}));
                input.dispatchEvent(new Event('change', {bubbles:true}));
                return input.value === ${JSON.stringify(projectLocation)};
            })()`);
            if (!locationSet) fail(`${observation} could not set the rendered project import location`);
            const activate = async (id, label) => {
                const control = await evaluate(`(() => { const item = document.getElementById(${JSON.stringify(id)}); if (!(item instanceof HTMLElement) || ('disabled' in item && item.disabled)) return false; item.focus({preventScroll:true}); return document.activeElement === item ? {stableControlId:item.id} : false; })()`);
                if (!control?.stableControlId) fail(`${observation} did not expose its rendered ${label} control`);
                // Project import controls replace their own preview/card while
                // handling the action.  Native keyboard activation keeps the
                // focused rendered button as the event target through that
                // React update; a pointer release can otherwise be retargeted
                // to the reflowed panel and leave the person at a silent
                // unchanged form.
                await activateFocusedControl("operation", control, "keyboard");
            };
            await activate("project-import-check", "Check game");
            const importState = await waitFor(() => evaluate(`(() => {
                const registered = document.querySelector('[data-pokie-project-location=${JSON.stringify(projectLocation)}]');
                const preview = document.body.innerText.includes('Found a') && !!document.getElementById('project-import-add');
                return preview ? 'preview' : registered instanceof HTMLElement ? 'registered' : false;
            })()`), `${observation} rendered project import preview or existing registered project`);
            if (importState === "preview") await activate("project-import-add", "Add to projects");
            await waitFor(() => evaluate(`!!document.querySelector('[data-pokie-project-location=${JSON.stringify(projectLocation)}]')`), `${observation} rendered registered project`);
            const opened = await evaluate(`(() => { const item = document.querySelector('[data-pokie-project-location=${JSON.stringify(projectLocation)}]'); if (!(item instanceof HTMLElement) || ('disabled' in item && item.disabled)) return false; item.focus({preventScroll:true}); return document.activeElement === item ? {stableControlId:item.id} : false; })()`);
            if (!opened?.stableControlId) fail(`${observation} did not expose the rendered imported-project Open control`);
            await activateFocusedControl("operation", opened);
            await waitFor(() => evaluate("location.hash.includes('/project/')"), `${observation} rendered imported project dashboard`);
            const route = await evaluate("location.hash");
            if (typeof route !== "string" || !/^#\/project(?:\/[^/]+){1,2}$/.test(route)) fail(`${observation} did not open a project-scoped imported route`);
            return route.replace(/\/[^/]+$/, "");
        };
        const runBoundedReelEditorWorkflow = async (viewport, observation) => {
            // A file fixture is input to the public import flow, never a substitute for a rendered
            // edit/save request. Its owning tuple workspace and processes use the existing cleanup.
            const fixture = JSON.parse(await services.readFile(blueprint, "utf8"));
            const symbols = fixture.symbols;
            if (!Array.isArray(symbols) || symbols.length < 2) fail("bounded modeler fixture needs two canonical symbols");
            fixture.manifest = {...fixture.manifest, id:"bounded-reel-editor", name:"Bounded Reel Editor"};
            fixture.reels = 6;
            fixture.paylines = [Array(6).fill(0)];
            fixture.winModel = {type:"lines"};
            delete fixture.symbolWeights;
            delete fixture.reelStrips;
            fixture.reelStripGeneration = Array.from({length:6}, (_, reel) => ({type:"literal", strip:Array.from({length:reel === 0 ? 1 : reel === 1 ? 101 : 300}, (_, stop) => symbols[(reel + stop) % symbols.length])}));
            const fixturePath = path.join(context.workspace, "Bounded reel editor.json");
            await services.writeFile(fixturePath, JSON.stringify(fixture));
            await runPackedCli("packed CLI bounded modeler validate", ["validate", fixturePath]);
            await cdp.send("Emulation.setDeviceMetricsOverride", {...viewportDimensions[viewport], deviceScaleFactor:1});
            const projectBaseRoute = await openImportedProject(fixturePath, observation);
            await navigateProjectTab(projectBaseRoute, "gameModel", observation);
            const startedAt = Date.now(), interactions = [];
            const activate = async (id) => {
                const control = await waitFor(() => focusRenderedControl("button", `(item) => item.id === ${JSON.stringify(id)}`), `${observation} ${id}`);
                const cursor = cdp.events.length;
                const activation = await activateFocusedControl("operation", control);
                interactions.push({control, activation, browserEventCursor:cursor});
                return cursor;
            };
            const inspect = async (reel, first, last, count, pager) => waitFor(() => evaluate(`(() => {
                const inputs = [...document.querySelectorAll('input[aria-label]')].filter((item) => /^Reel [0-9]+ symbol [0-9]+$/.test(item.getAttribute('aria-label') || ''));
                const first = document.getElementById('reel-modeler-${reel}-symbol-${first}');
                const last = document.getElementById('reel-modeler-${reel}-symbol-${last}');
                const next = document.getElementById('reel-modeler-${reel}-symbols-next');
                if (inputs.length !== ${count} || !(first instanceof HTMLInputElement) || !(last instanceof HTMLInputElement) || ${pager ? "!(next instanceof HTMLButtonElement)" : "next !== null"}) return false;
                return {reel:${reel}, first:${first}, last:${last}, mountedSymbolCount:inputs.length, firstValue:first.value, lastValue:last.value, pager:${pager}, nextDisabled:next instanceof HTMLButtonElement ? next.disabled : null};
            })()`), `${observation} bounded reel ${reel} symbols ${first}–${last}`);
            const screenshot = async (name) => {
                const image = await captureScreenshot();
                return save("screenshot", `bounded-reel-${viewport}-${name}.png`, Buffer.from(image.data, "base64"), [observation]);
            };
            await activate("game-model-reels-edit");
            await activate("reel-modeler-select-6");
            const initial = await inspect(6, 1, 100, 100, true);
            await activate("reel-modeler-6-symbols-next");
            await inspect(6, 101, 200, 100, true);
            await activate("reel-modeler-6-symbols-next");
            const finalPage = await inspect(6, 201, 300, 100, true);
            if (!finalPage.nextDisabled) fail("Reel 6 last page did not disable forward paging");
            const finalPageScreenshotEvidenceId = await screenshot("last-page");
            await activate("reel-modeler-select");
            await activate("reel-modeler-select-1");
            const shortReel = await inspect(1, 1, 1, 1, false);
            await activate("reel-modeler-select");
            await activate("reel-modeler-select-2");
            await activate("reel-modeler-2-symbols-next");
            await inspect(2, 101, 101, 1, true);
            await activate("reel-modeler-2-symbol-101-remove");
            const clamped = await inspect(2, 1, 100, 100, false);
            const clampedScreenshotEvidenceId = await screenshot("clamped-page");
            await activate("reel-modeler-done");
            await activate("reel-modeler-apply");
            await activate("reel-modeler-select");
            await activate("reel-modeler-select-6");
            await activate("reel-modeler-6-symbols-next");
            await activate("reel-modeler-6-symbols-next");
            const replacement = symbols.find((symbol) => symbol !== finalPage.lastValue);
            const edited = await evaluate(`(() => {
                const item = document.getElementById('reel-modeler-6-symbol-300');
                if (!(item instanceof HTMLInputElement) || item.disabled) return false;
                item.focus({preventScroll:true});
                Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(item, ${JSON.stringify(replacement)});
                item.dispatchEvent(new Event('input', {bubbles:true}));
                item.dispatchEvent(new Event('change', {bubbles:true}));
                return {controlId:item.id, accessibleName:item.getAttribute('aria-label'), value:item.value, nativeFocus:document.activeElement === item};
            })()`);
            if (!edited?.nativeFocus || edited.value !== replacement) fail("bounded modeler did not edit its rendered final symbol");
            // The next native pointer blurs the field, committing through the actual buffered input.
            await activate("reel-modeler-done");
            await activate("reel-modeler-apply");
            const saveCursor = await activate("game-model-reels-save");
            const response = async (pathname) => {
                const request = await waitFor(() => cdp.events.slice(saveCursor).find((event) => event.method === "Network.requestWillBeSent" && new URL(event.params.request.url).pathname === pathname && event.params.request.method === "POST"), `${observation} ${pathname} request`);
                const responses = cdp.events.slice(saveCursor).filter((event) => event.method === "Network.requestWillBeSent" && new URL(event.params.request.url).pathname === pathname && event.params.request.method === "POST");
                if (responses.length !== 1) fail(`${observation} must submit ${pathname} exactly once`);
                const received = await waitFor(() => cdp.events.slice(saveCursor).find((event) => event.method === "Network.responseReceived" && event.params.requestId === request.params.requestId), `${observation} ${pathname} response`);
                const payload = JSON.parse((await readBrowserResponseBody(request.params.requestId, observation)).body);
                validateP805BlueprintMutationResponse(pathname, received.params.response.status, payload);
                const submitted = request.params.request.postData ?? (await cdp.send("Network.getRequestPostData", {requestId:request.params.requestId})).postData;
                const receipt = {browserRequestId:request.params.requestId, causedByControlId:"game-model-reels-save", requestCount:1, path:pathname, method:"POST", status:received.params.response.status, terminal:payload.status, payload, submitted:JSON.parse(submitted), resultSha256:digest(JSON.stringify(payload))};
                api.push({observation, ...receipt, initiator:"rendered-control"});
                return receipt;
            };
            const validation = await response("/api/home/blueprints/validate");
            const saved = await response("/api/home/blueprints/save");
            const expected = JSON.parse(JSON.stringify(fixture));
            expected.reelStripGeneration[1].strip.pop();
            expected.reelStripGeneration[5].strip[299] = replacement;
            if (!isDeepStrictEqual(validation.submitted.blueprint, expected) || !isDeepStrictEqual(saved.submitted.blueprint, expected)) fail("bounded modeler validation/save lost its absolute-position edit or clamped removal");
            if (saved.submitted.path !== fixturePath || saved.submitted.overwrite !== true) fail("bounded modeler saved a different source or did not retain its atomic overwrite contract");
            const artifact = JSON.parse(await services.readFile(fixturePath, "utf8"));
            if (!isDeepStrictEqual(artifact, expected)) fail("bounded modeler saved artifact differs from its DOM-driven request");
            // Reopening the saved source exercises the boundary consuming the persisted edit.
            await activate("game-model-reels-edit");
            await activate("reel-modeler-select-6");
            await activate("reel-modeler-6-symbols-next");
            await activate("reel-modeler-6-symbols-next");
            const reopened = await inspect(6, 201, 300, 100, true);
            if (reopened.lastValue !== replacement) fail("bounded modeler reopened a stale final symbol");
            await activate("game-model-reels-cancel");
            const elapsedMs = Math.max(1, Date.now() - startedAt);
            if (elapsedMs > 60_000) fail(`bounded modeler exceeded its transaction budget: ${elapsedMs}ms`);
            const receipt = {kind:"p8-05-bounded-reel-editor", source:"rendered-control", viewport, projectBaseRoute, initial, finalPage, shortReel, clamped, edited, interactions, validation, saved, reopened, artifact:{sha256:digest(JSON.stringify(artifact)), blueprint:artifact}, timing:{elapsedMs, budgetMs:60_000}, finalPageScreenshotEvidenceId, clampedScreenshotEvidenceId};
            receipt.evidenceId = await save("page-state", `bounded-reel-editor-${viewport}.json`, JSON.stringify(receipt), [observation]);
            return {projectBaseRoute, receipt};
        };
        const screenControlStates = Object.fromEntries(Object.entries(P805_SCREEN_CONTROL_STATES).map(([screen, state]) => [screen, {
            ...state,
            async enter(projectBaseRoute, viewport, observation, contract) {
                const route = `${projectBaseRoute}/${screen}`;
                if (contract.control !== state.navigationControl) fail(`${screen} contract navigation does not match its public control state`);
                await cdp.send("Emulation.setDeviceMetricsOverride", {...viewportDimensions[viewport], deviceScaleFactor:1});
                // Overview is the dashboard's default route.  Starting an
                // Overview observation there would turn keyboard activation
                // into a no-op and let its context request predate the
                // interaction.  Enter it from a different rendered screen so
                // the recorded request is caused by the public control.
                // Never start a keyboard navigation transaction from the
                // ambiguous `/project/:tab` compatibility route.  Entering
                // that route makes the legacy resolver race the tab's own
                // keyboard activation and can replace a real Replay request
                // with its fallback Overview route.  A different *scoped*
                // dashboard tab preserves the project identity and still
                // proves that the following public control performs the
                // observed navigation.
                const shellScreen = screen === "overview" ? "gameModel" : "overview", shellRoute = `${projectBaseRoute}/${shellScreen}`;
                await navigateProjectTab(projectBaseRoute, shellScreen, `${observation} source screen`);
                // The preceding keyboard navigation changes the hash before
                // React has necessarily reconciled the dashboard's
                // capability-driven tab. Starting the next keyboard
                // interaction against that previous DOM can focus an already
                // selected control and make its context receipt look like a
                // navigation. Wait for both the scoped route and the
                // product's active navigation control so the observed key
                // press begins from the opposite rendered tab.
                await waitFor(() => evaluate(`document.readyState === 'complete' && location.hash === ${JSON.stringify(shellRoute)} && !!document.querySelector('[data-pokie-lifecycle="navigation"][data-pokie-lifecycle-route="${shellScreen}"][aria-current="page"]') && !!document.querySelector('main, [role=main], nav') && document.body.innerText.trim().length > 40`), `${screen} active public shell`);
                // Capability-driven tabs mount after the project context has
                // rendered.  The collector observes that public transition
                // instead of assuming that a document-ready shell has already
                // enabled every navigation control.
                // Keep the exact visible control that the drawer exposed.
                // Looking it up again below is a state-class substitution
                // seam on narrow screens: Mantine may finish its drawer
                // transition between the successful hit-test and the second
                // lookup, leaving only an off-canvas DOM sibling.  The
                // captured control remains the one real public control whose
                // activation owns this navigation transaction.
                const navigationControl = await revealRenderedNavigationControl(screen, observation);
                const navigationCursor = cdp.events.length;
                const beforeActionText = await evaluate("document.body.innerText.slice(0,1600)");
                const navigationTransaction = await beginRenderedTransaction({lifecycle:"navigation", operation:screen, observation, stateClass:"navigation", control:navigationControl, capturePostTransition:true});
                const navigation = navigationTransaction.control;
                // The navigation control's request is a product transition,
                // not a route-marker convenience. Wait for its own fresh
                // context response before accepting the route that depends on
                // it, and retain that response beside the following operation
                // receipt. This makes a new capability visible only after the
                // durable operation and its owning context have both settled.
                const activationCursor = navigationTransaction.browserEventCursor;
                if (!Number.isSafeInteger(activationCursor) || activationCursor < navigationCursor) fail(`${screen} has no browser event boundary for its rendered navigation activation`);
                const contextRequest = await waitFor(() => cdp.events.slice(activationCursor).find((event) => event.method === "Network.requestWillBeSent" && new URL(event.params.request.url).pathname === "/api/project/context" && event.params.request.method === "GET") || false, `${screen} rendered project-context revalidation request`);
                const contextResponse = await waitFor(() => cdp.events.slice(activationCursor).find((event) => event.method === "Network.responseReceived" && event.params.requestId === contextRequest.params.requestId) || false, `${screen} rendered project-context revalidation response`);
                const contextBody = await readBrowserResponseBody(contextRequest.params.requestId, `${screen} rendered project-context revalidation`);
                const contextPayload = JSON.parse(contextBody.body || "{}");
                if (!contextPayload || ["empty", "error", "loading"].includes(contextPayload.status)) fail(`${screen} navigation did not receive a usable product context`);
                const contextRevalidation = {browserRequestId:contextRequest.params.requestId, method:"GET", path:"/api/project/context", status:contextResponse.params.response.status, responseSha256:digest(JSON.stringify(contextPayload)), projectStatus:contextPayload.status, completedBeforeSelection:true};
                api.push({observation, ...contextRevalidation, payload:contextPayload, initiator:"rendered-navigation-context"});
                try {
                    await waitFor(() => evaluate(`location.hash === ${JSON.stringify(route)}`), `${screen} public navigation for ${observation}`);
                } catch (error) {
                    const renderedNavigation = await evaluate("(()=>({route:location.hash, active:[...document.querySelectorAll('[data-pokie-lifecycle=\"navigation\"]')].filter((item)=>item.getAttribute('aria-current')==='page').map((item)=>({route:item.getAttribute('data-pokie-lifecycle-route'),id:item.id,name:(item.innerText||item.textContent||'').trim()})), text:document.body.innerText.slice(0,800)}))()");
                    throw new Error(`${error.message}; rendered navigation after public activation: ${JSON.stringify(renderedNavigation)}`);
                }
                return {route, navigation, navigationCursor, navigationTransaction, contextRevalidation, beforeActionText};
            },
        }]));
        const runScreenControlState = async (projectBaseRoute, viewport, observation, contract) => {
            const screen = contract.route, stateMachine = screenControlStates[screen];
            if (!stateMachine) fail(`${observation} has no declared public screen state`);
            process.stderr.write(`P805_SCREEN_STATE observation=${observation} screen=${screen} phase=enter\n`);
            const entered = await stateMachine.enter(projectBaseRoute, viewport, observation, contract);
            let interaction = entered.navigation, transaction = entered.navigationTransaction, entry, beforeActionText = entered.beforeActionText;
            if (contract.body || contract.operation) {
                const preparedOperation = contract.body ? await prepareScreenOperation(contract.body, viewport, observation) : undefined;
                if (contract.body && !preparedOperation) fail(`${screen} did not accept required ${contract.body} values for ${observation}`);
                const cursor = cdp.events.length;
                // Preflights are product-owned asynchronous state.  Wait for
                // the rendered, declared operation to become enabled rather
                // than racing its loading state or falling back to another
                // card with a similarly-labelled Build button.
                const operation = contract.operation ?? contract.body;
                // The durable request is only eligible after the actual visible
                // form state is read.  This closes the old route-plus-request
                // adapter: a later poll must now be causally preceded by one
                // configured, valid DOM submission from this exact control.
                const control = await renderedTransactionControl({lifecycle:"operation", operation, observation});
                // The control's state class is a rendered public fact.  It
                // decides whether this transaction may carry form fields;
                // the contract is only a fail-closed expectation afterwards.
                const stateClass = p805TransactionStateClass(control);
                if (!stateClass || stateClass === "navigation") fail(`${observation} rendered operation does not expose an operation transaction state`);
                const formState = stateClass === "editable-submission"
                    ? await captureRenderedEditableFormState(operation, observation, control.stableControlId, preparedOperation?.formState)
                    : undefined;
                beforeActionText = await evaluate("document.body.innerText.slice(0,1600)");
                transaction = await beginRenderedTransaction({lifecycle:"operation", operation, observation, formState, stateClass, control, capturePostTransition:true});
                if (contract.body === "outcome-library") transaction.preflight = preparedOperation.outcomeLibraryPreflight;
                if (formState !== undefined && transaction.control.stableControlId !== formState.actionControl.stableControlId) fail(`${observation} submitted a different control than its captured rendered form state`);
                interaction = transaction.control;
                entry = await browserRequest(contract, observation, cursor, transaction);
            } else entry = await browserRequest(contract, observation, entered.navigationCursor, transaction);
            process.stderr.write(`P805_SCREEN_STATE observation=${observation} screen=${screen} phase=terminal\n`);
            interaction.pointerActivated = transaction.pointerActivations.length === 1;
            interaction.keyboardActivated = transaction.keyboardActivations.length === 1;
            interaction.activation = transaction.keyboardActivations.length === 1 ? "keyboard" : "pointer";
            interaction.routeAfterActivation = await evaluate("location.hash");
            const terminalText = await waitFor(async () => {
                return evaluate(`(() => {
                    const text = document.body.innerText;
                    const live = [...document.querySelectorAll('[role=status],[role=alert],[aria-live]')]
                        .filter((item) => !!(item.offsetWidth || item.offsetHeight || item.getClientRects().length))
                        .map((item) => item.textContent?.trim() || '').filter(Boolean).join('\\n');
                    // A route title exists before activation.  A terminal receipt
                    // must be a post-request rendered change or a live status.
                    // Keep the visible live-region text in the captured
                    // terminal projection. A result can be rendered below
                    // the bounded body excerpt, so recording only the first
                    // 1,600 body characters made a real post-request status
                    // look byte-identical to the pre-action page.
                    const visibleText = text.slice(0, 1600) + (live ? '\\n' + live : '');
                    return typeof text === "string" && text.trim().length > 2 && (text.slice(0, 1600) !== ${JSON.stringify(beforeActionText)} || live.length > 0)
                        ? {text:visibleText, live} : false;
                })()`);
            }, `${observation} rendered terminal state`);
            // A text delta alone is not an operation receipt: unrelated page
            // activity can change it. The product publishes a lifecycle result
            // beside the control's own screen, including any visible artifact
            // affordance. Read this contract after the correlated browser
            // request has completed; the collector never creates it.
            const lifecycle = contract.body || contract.operation ? "operation" : "navigation", lifecycleValue = contract.operation ?? contract.body ?? contract.route;
            // The durable browser poll above has already observed this exact
            // job's terminal record.  Studio then reconciles that record into
            // the visible lifecycle receipt on its normal 500ms poll cadence.
            // A packed candidate can be CPU-throttled while another tuple is
            // draining Chromium descendants, so the old generic 30-second
            // DOM budget could reject a real terminal result before React had
            // painted it.  Keep the bounded wait local to this required,
            // already-correlated rendered handoff rather than accepting the
            // server result as a substitute for the visible receipt.
            const lifecycleResult = await waitFor(async () => evaluate(`(() => {
                const lifecycle = ${JSON.stringify(lifecycle)}, value = ${JSON.stringify(lifecycleValue)};
                const visible = (item) => !!(item.offsetWidth || item.offsetHeight || item.getClientRects().length);
                const accessibleName = (item) => (item.getAttribute('aria-label') || item.innerText || item.textContent || '').trim();
                const resultControlId = ${JSON.stringify(transaction.control.stableControlId)};
                const resultJobId = ${JSON.stringify(contract.poll ? entry.terminal?.jobId : null)};
                const resultStateClass = ${JSON.stringify(transaction.stateClass)};
                const result = [...document.querySelectorAll('[data-pokie-lifecycle-result]')].find((item) => visible(item) && item.getAttribute('data-pokie-lifecycle-result') === (lifecycle === 'operation' ? value : 'navigation') && (lifecycle === 'operation' || item.getAttribute('data-pokie-lifecycle-route') === value) && (value !== 'simulation' || item.getAttribute('data-pokie-lifecycle-result-operation') === value) && item.getAttribute('data-pokie-lifecycle-result-control') === resultControlId && item.getAttribute('data-pokie-lifecycle-result-state') === resultStateClass && (resultJobId === null || item.getAttribute('data-pokie-lifecycle-result-job') === resultJobId));
                if (!(result instanceof HTMLElement)) return false;
                const terminal = result.getAttribute('data-pokie-lifecycle-terminal');
                if (!terminal || ['idle', 'queued', 'running', 'loading', 'cancelling'].includes(terminal)) return false;
                const artifact = [...result.querySelectorAll('[data-pokie-lifecycle-artifact]')].find((item) => visible(item) && item.getAttribute('data-pokie-lifecycle-artifact') === ${JSON.stringify(contract.artifact ?? null)});
                // A durable terminal status can render one paint before its
                // result affordance.  The operation receipt is complete only
                // once the required rendered artifact is actually available;
                // returning the early status would recreate the timing gap
                // this transaction contract is meant to close.
                if (${JSON.stringify(Boolean(contract.body && contract.artifact))} && (!artifact || !accessibleName(artifact))) return false;
                return {role:result.getAttribute('role') || result.tagName.toLowerCase(), terminal, text:accessibleName(result), controlId:result.getAttribute('data-pokie-lifecycle-result-control'), operation:result.getAttribute('data-pokie-lifecycle-result-operation'), stateClass:result.getAttribute('data-pokie-lifecycle-result-state'), jobId:result.getAttribute('data-pokie-lifecycle-result-job'), receipt:result.getAttribute('data-pokie-lifecycle-result-receipt'), requestId:result.getAttribute('data-pokie-lifecycle-result-request-id'), progressSnapshots:result.getAttribute('data-pokie-lifecycle-result-progress-snapshots'), durableJobId:result.getAttribute('data-pokie-lifecycle-result-durable-job'), durableStatus:result.getAttribute('data-pokie-lifecycle-result-durable-status'), target:result.getAttribute('data-pokie-lifecycle-result-target'), outputPath:result.getAttribute('data-pokie-lifecycle-result-output'), artifact:artifact ? {name:artifact.getAttribute('data-pokie-lifecycle-artifact'), accessibleName:accessibleName(artifact), target:artifact.getAttribute('data-pokie-lifecycle-artifact-target'), outputPath:artifact.getAttribute('data-pokie-lifecycle-artifact-output')} : null};
            })()`), `${observation} product-owned lifecycle result`, contract.poll ? 120_000 : 30_000);
            if (contract.body && contract.artifact && (!lifecycleResult.artifact?.name || !lifecycleResult.artifact.accessibleName)) fail(`${observation} did not render a visible product-owned ${contract.artifact} artifact affordance`);
            if (contract.body === "outcome-library" && (transaction.preflight?.state !== "ready" || lifecycleResult.operation !== "outcome-library" || lifecycleResult.receipt !== "durable-terminal" || typeof lifecycleResult.requestId !== "string" || !lifecycleResult.requestId || lifecycleResult.progressSnapshots === null || Number(lifecycleResult.progressSnapshots) < 2 || lifecycleResult.durableJobId !== entry.terminal?.jobId || lifecycleResult.durableStatus !== entry.terminal?.status || !lifecycleResult.artifact?.outputPath)) fail(`${observation} rendered Outcome Library terminal is stale, detached from its preflight, request/progress receipt, or durable artifact result`);
            if (lifecycleResult.controlId !== transaction.control.stableControlId || (transaction.operation === "simulation" && lifecycleResult.operation !== transaction.operation) || lifecycleResult.stateClass !== transaction.stateClass || (contract.poll && lifecycleResult.jobId !== entry.terminal?.jobId)) fail(`${observation} rendered ${transaction.stateClass} terminal does not bind its activated control, operation, transaction state${contract.poll ? ", and durable job" : ""}`);
            const pointerActivation = transaction.pointerActivations[0];
            if (pointerActivation) {
                transaction.postTransitionRenderedState = await evaluate(`(()=>{
                    const captured = window.__p805CapturedControls?.get(${JSON.stringify(pointerActivation.captureKey)});
                    const current = document.getElementById(${JSON.stringify(transaction.control.stableControlId)});
                    const result = [...document.querySelectorAll('[data-pokie-lifecycle-result]')].find((item) => item instanceof HTMLElement && item.getAttribute('data-pokie-lifecycle-result-control') === ${JSON.stringify(transaction.control.stableControlId)} && (${JSON.stringify(transaction.operation)} !== 'simulation' || item.getAttribute('data-pokie-lifecycle-result-operation') === 'simulation') && item.getAttribute('data-pokie-lifecycle-result-state') === ${JSON.stringify(transaction.stateClass)} && item.getAttribute('data-pokie-lifecycle-terminal') === ${JSON.stringify(lifecycleResult.terminal)});
                    const capturedControlId = captured instanceof HTMLElement ? captured.id : null;
                    const controlState = !(captured instanceof HTMLElement) ? 'missing' : current === null ? 'removed' : current === captured ? 'retained' : 'replaced';
                    const capturedControlConnected = captured instanceof HTMLElement && captured.isConnected;
                    window.__p805CapturedControls?.delete(${JSON.stringify(pointerActivation.captureKey)});
                    return {capturedControlId,captureKey:${JSON.stringify(pointerActivation.captureKey)},preDispatchEvidence:{capturedControlId:${JSON.stringify(pointerActivation.capturedControlId)},focus:${JSON.stringify(pointerActivation.preDispatchFocus)},hitTest:${JSON.stringify(pointerActivation.hitTest)},dispatch:${JSON.stringify(pointerActivation.dispatch)}},controlState,currentControlId:current instanceof HTMLElement ? current.id : null,capturedControlConnected,activeElementId:document.activeElement instanceof HTMLElement ? document.activeElement.id || null : null,requestId:${JSON.stringify(entry.browserRequestId)},resultSha256:${JSON.stringify(entry.terminal.resultSha256)},renderedTerminal:result instanceof HTMLElement,resultControlId:result instanceof HTMLElement ? result.getAttribute('data-pokie-lifecycle-result-control') : null,resultOperation:result instanceof HTMLElement ? result.getAttribute('data-pokie-lifecycle-result-operation') : null,resultStateClass:result instanceof HTMLElement ? result.getAttribute('data-pokie-lifecycle-result-state') : null};
                })()`);
                if (!hasRenderedActivation({interaction:{activation:"pointer", pointerActivated:true}, transaction}, transaction.control.stableControlId)) fail(`${observation} pointer transaction lost its captured identity, hit-tested dispatch, request, terminal, or post-transition rendered state`);
            }
            const productState = await evaluate(`(() => {
                const visible = (item) => !!(item.offsetWidth || item.offsetHeight || item.getClientRects().length);
                const accessibleName = (item) => {
                    const labelledBy = (item.getAttribute("aria-labelledby") || "").split(/\\s+/).filter(Boolean)
                        .map((id) => document.getElementById(id)?.textContent?.trim()).filter(Boolean).join(" ");
                    const labels = item instanceof HTMLInputElement || item instanceof HTMLTextAreaElement || item instanceof HTMLSelectElement
                        ? [...item.labels || []].map((label) => label.textContent?.trim()).filter(Boolean).join(" ") : "";
                    return (item.getAttribute("aria-label") || labelledBy || labels || item.innerText || item.textContent || item.getAttribute("name") || "").trim();
                };
                const controls = [...document.querySelectorAll("button,a,input,select,textarea")].filter(visible);
                // Terminal rendering can replace the activated control. Read
                // the focus indicator from a currently rendered, operable
                // public control instead of treating that expected replacement
                // as an accessibility failure.
                controls.find((item) => !("disabled" in item && Boolean(item.disabled)))?.focus();
                // Browser-native number steppers can expose disabled internal
                // buttons alongside their named input. They are not public
                // controls a person can discover or operate, so require a
                // rendered accessible name before treating a disabled element
                // as a product action that needs explanatory text.
                const disabled = controls.filter((item) => item.disabled && accessibleName(item));
                const hasDisabledExplanation = (item) => {
                    if (item.getAttribute("title")) return true;
                    const ids = (item.getAttribute("aria-describedby") || "").split(/\\s+/).filter(Boolean);
                    return ids.length > 0 && ids.every((id) => {
                        const description = document.getElementById(id);
                        return description && visible(description) && Boolean(description.textContent?.trim());
                    });
                };
                const explainedDisabledControls = disabled.filter(hasDisabledExplanation).length;
                const focus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
                const style = focus ? getComputedStyle(focus) : undefined;
                return {
                    title: document.title,
                    text: document.body.innerText.slice(0, 1600),
                    controls: controls.map((item) => ({
                        id: item.id,
                        label: accessibleName(item),
                        disabled: Boolean(item.disabled),
                        accessible: Boolean(accessibleName(item)),
                    })),
                    overflow: document.documentElement.scrollWidth > window.innerWidth,
                    accessibility: {
                        namedRegions: [...document.querySelectorAll("main,[role=main],[role=region],nav")].filter(visible).map((item) => item.getAttribute("aria-label") || item.getAttribute("aria-labelledby") || item.id).filter(Boolean),
                        visibleFocus: Boolean(focus) && document.activeElement === focus && Boolean(style) && (style.outlineStyle !== "none" || style.boxShadow !== "none"),
                        disabledControls: disabled.length,
                        explainedDisabledControls,
                        unexplainedDisabledControls: disabled.length - explainedDisabledControls,
                        disabledControlDetails: disabled.map((item) => ({id:item.id, label:accessibleName(item), title:item.getAttribute("title"), describedBy:item.getAttribute("aria-describedby")})),
                    },
                };
            })()`);
            // A viewport-specific audit needs the rendered state a person can
            // actually see at that breakpoint.  Full-page captures repeatedly
            // rasterise hidden long-form panels and make the all-persona,
            // three-viewport proof exceed its bounded test window.
            const elapsedMs = Date.now() - transaction.startedAtMs;
            const screenshot = await captureScreenshot();
            const screenshotEvidenceId = await save("screenshot", `${viewport}-${observation}.png`, Buffer.from(screenshot.data, "base64"), [observation]);
            // This persisted object is the immutable boundary between the
            // browser's live control activation and the parent receipt.  It
            // intentionally carries the DOM identity, browser request and
            // rendered terminal together; neither a route transition nor a
            // Node-side request can manufacture a valid tuple transaction.
            const liveDomTransaction = {kind:"p8-05-live-dom-transaction", operation:observation, expectedOutcome:contract.terminal, route:entered.route, viewport, elapsedMs,
                screen:{name:screen, region:stateMachine.region, navigationControl:stateMachine.navigationControl, terminalText:stateMachine.result},
                control:{id:interaction.stableControlId, role:interaction.role, accessibleName:interaction.accessibleName, enabled:interaction.enabled},
                precondition:{enabled:interaction.enabled, disabled:interaction.disabled, disabledExplanation:interaction.disabledExplanation, accessibleName:interaction.accessibleName, region:stateMachine.region}, interaction, transaction,
                request:{path:contract.api, method:contract.method, bodyKind:contract.body ?? null, bodySha256:entry.bodySha256, responseSha256:entry.responseSha256, status:entry.status, browserRequestId:entry.browserRequestId, initiator:entry.initiator},
                terminal:{...entry.terminal, complete:true, artifact:contract.artifact ?? null},
                renderedTerminal:{state:"rendered", observedAfterRequestId:entry.browserRequestId, text:terminalText.text, liveText:terminalText.live, beforeTextSha256:digest(beforeActionText), textSha256:digest(terminalText.text), resultSha256:entry.terminal.resultSha256, observedAt:services.now(), changedAfterRequest:terminalText.text !== beforeActionText || terminalText.live.length > 0, lifecycle:lifecycleResult},
                workflow:{persona:options.persona, source:"rendered-control", transactionState:transaction.stateClass, expectedApi:contract.api, expectedMethod:contract.method, expectedBodyKind:contract.body ?? null, expectedArtifact:contract.artifact ?? null, terminal:contract.terminal}, state:productState};
            liveDomTransaction.contextRevalidation = entered.contextRevalidation;
            const timingName = {"project-validation":"validationMs", "artifact-build":"buildMs", build:"buildMs", simulation:"simulationMs", replay:"replayMs"}[transaction.operation];
            if (timingName) timings[timingName] = Math.max(timings[timingName] ?? 0, elapsedMs);
            const evidenceId = await save("live-dom-transaction", `${viewport}-${observation}.json`, JSON.stringify(liveDomTransaction), [observation]);
            return {elapsedMs, evidenceId, screenshotEvidenceId, state:productState, interaction, transaction, terminal:entry.terminal, browserRequestId:entry.browserRequestId, contextRevalidation:entered.contextRevalidation, screen, screenNavigationControl:stateMachine.navigationControl, precondition:liveDomTransaction.precondition, visibleTerminal:liveDomTransaction.renderedTerminal};
        };
        const creation = Date.now();
        // The final persona action intentionally leaves Studio at its narrow
        // breakpoint. Restore the assigned rendered shell before exercising the
        // persistent Home navigation; otherwise the visible mobile drawer is
        // closed and its hidden Projects control cannot receive a real key.
        await cdp.send("Emulation.setDeviceMetricsOverride", {...viewportDimensions[recoveryViewport], deviceScaleFactor:1});
        // Create game is enabled during the initial validation debounce too.
        // Wait for the actual browser validation response and the rendered
        // terminal state, then dispatch one native pointer to that same
        // control and wait for its full Overview transition.
        const creationCursor = cdp.events.length;
        const creationObservations = [];
        let creatorValidation, creationActivation;
        try {
            ({validation:creatorValidation, activation:creationActivation} = await createP805RenderedGame(cdp, evaluate, creationObservations, 90_000, readBrowserResponseBody));
            await waitFor(() => cdp.events.slice(creationCursor).find((event) => event.method === "Network.responseReceived" && new URL(event.params.response.url).pathname === "/api/home/blueprints/save-managed" && event.params.response.status === 201), "rendered Create game managed-save response");
            api.push({observation:"project creation validation", method:"POST", path:"/api/home/blueprints/validate", ...creatorValidation, activation:creationActivation, observations:creationObservations, initiator:"rendered-auto-validation"});
        } catch (error) {
            const rendered = await evaluate("(()=>({route:location.hash, active:document.activeElement instanceof HTMLElement ? {id:document.activeElement.id, text:(document.activeElement.innerText||document.activeElement.textContent||'').trim()} : null, create:document.getElementById('blueprint-create-game')?.outerHTML?.slice(0,800), status:[...document.querySelectorAll('[role=status],[role=alert]')].map((item)=>({text:(item.textContent||'').trim(),role:item.getAttribute('role')})), text:document.body.innerText.slice(0,2400)}))()");
            const managedSave = cdp.events.findLast((event) => event.method === "Network.responseReceived" && (() => { try { return new URL(event.params.response.url).pathname === "/api/home/blueprints/save-managed"; } catch { return false; } })());
            let managedSaveBody;
            try { managedSaveBody = managedSave ? (await readBrowserResponseBody(managedSave.params.requestId, "rendered Create game diagnostics")).body : undefined; } catch (readError) { managedSaveBody = `unreadable: ${String(readError)}`; }
            throw new Error(`${error instanceof Error ? error.message : String(error)}; Create observations: ${JSON.stringify(creationObservations)}; rendered Create game state: ${JSON.stringify(rendered)}; managed-save response: ${managedSaveBody ?? "missing"}; Studio diagnostics: ${JSON.stringify(errors.slice(-10))}`);
        }
        timings.projectCreationMs = Date.now() - creation;
        const createdProjectRoute = await evaluate("location.hash");
        if (typeof createdProjectRoute !== "string" || !/^#\/project(?:\/[^/]+){1,2}$/.test(createdProjectRoute)) fail("created Studio project did not retain a project-scoped route");
        const createdProjectBaseRoute = createdProjectRoute.replace(/\/[^/]+$/, "");
        // Process-isolated children are intentionally *not* miniature copies
        // of the former all-persona tour.  From this point a tuple may enter
        // only its declared product workflow.  Capability setup is performed
        // only when that exact workflow consumes it and is retained as scoped
        // evidence beside the action; recovery remains owned by its dedicated
        // UI/UX observation below in the legacy persona-sized path.
        if (options.tuple && !tupleRequiresCompleteWorkflow(options.tuple)) {
            const {persona, observation, viewport} = options.tuple, contract = tupleContract;
            let projectBaseRoute = createdProjectBaseRoute;
            if (contract.route === "certification") projectBaseRoute = await openImportedProject(outcomeBundle, `${observation} certification bootstrap`);
            if (contract.route === "provablyFair") projectBaseRoute = await openImportedProject(packageRoot, `${observation} fairness bootstrap`);
            let renderedBootstrap;
            if (observation === "simulation-rtp-volatility-features") {
                // Refresh is a report-list operation, so an isolated clean
                // project needs one actual Studio simulation to publish the
                // report it is about to refresh. This is a real DOM-driven
                // prerequisite, not a Node-side setup request.
                const reportSource = await startRenderedSimulation(projectBaseRoute, `${observation} rendered report source`, 1);
                const terminal = await browserTerminal(`/api/project/simulations/${encodeURIComponent(reportSource.payload.id)}`, `${observation} rendered report source`, reportSource.cursor, ["completed"], reportSource.transaction);
                renderedBootstrap = {kind:"studio-simulation-report-source", source:"rendered-control", controlId:reportSource.transaction.control.stableControlId, request:reportSource.transaction.request, terminal:{status:terminal.status, resultSha256:reportSource.transaction.terminal?.resultSha256, browserRequestId:reportSource.transaction.terminal?.browserRequestId}};
                if (terminal.status !== "completed" || !renderedBootstrap.request?.browserRequestId || !renderedBootstrap.terminal.resultSha256) fail(`${observation} did not create its report source through a rendered Studio simulation`);
            }
            const boundedReelEditor = observation === "reels-paytable-modes-mechanics" ? await runBoundedReelEditorWorkflow(viewport, observation) : undefined;
            if (boundedReelEditor) projectBaseRoute = boundedReelEditor.projectBaseRoute;
            const page = await runScreenControlState(projectBaseRoute, viewport, observation, contract), focus = await evaluate(`(()=>{
                const visible = (item) => !!(item.offsetWidth || item.offsetHeight || item.getClientRects().length);
                const control = document.getElementById(${JSON.stringify(page.interaction.stableControlId)});
                // Selecting a tab in the compact drawer correctly closes that
                // drawer, so the actual (already recorded) activating control
                // is no longer visible.  In that case the only valid focus
                // fallback is this transition's own visible lifecycle result,
                // never an arbitrary enabled control from the new page.
                const terminal = [...document.querySelectorAll('[data-pokie-lifecycle-result]')].find((item) => visible(item)
                    && item.getAttribute('data-pokie-lifecycle-result') === ${JSON.stringify(contract.body || contract.operation ? contract.operation ?? contract.body : "navigation")}
                    && (${JSON.stringify(Boolean(contract.body || contract.operation))} || item.getAttribute('data-pokie-lifecycle-route') === ${JSON.stringify(contract.route)})
                    && (${JSON.stringify(page.visibleTerminal.lifecycle.controlId)} === null || item.getAttribute('data-pokie-lifecycle-result-control') === ${JSON.stringify(page.visibleTerminal.lifecycle.controlId)})
                    && item.getAttribute('data-pokie-lifecycle-terminal') === ${JSON.stringify(page.visibleTerminal.lifecycle.terminal)});
                const item = control instanceof HTMLElement && visible(control) && !control.disabled
                    ? control
                    : terminal instanceof HTMLElement && terminal.tabIndex >= -1 ? terminal : null;
                if (!item) return {namedRegions:[], visibleFocus:false, target:null};
                item.focus({preventScroll:true});
                // Chromium's native focus ring is painted outside computed
                // CSS, so outlineStyle is not a reliable accessibility
                // signal for a real CDP focus. The focused DOM identity plus
                // this tuple's screenshot is the rendered proof instead.
                return {
                    namedRegions:[...document.querySelectorAll('main,[role=main],[role=region],nav')].filter(visible).map((item)=>item.id||item.getAttribute('aria-label')||item.tagName),
                    visibleFocus:document.activeElement===item,
                    target:item === control ? 'control' : 'terminal-result',
                };
            })()`);
            if (options.phase !== "initial" && (!focus.visibleFocus || focus.namedRegions.length === 0)) fail(`${observation} tuple did not retain a visible focused rendered control`);
            const action = {persona, observation, route:`${projectBaseRoute}/${contract.route}`, viewport, elapsedMs:page.elapsedMs, pageTextLength:page.state.text.length, controlCount:page.state.controls.length, inaccessiblePrimaryActions:page.state.controls.filter((control) => !control.disabled && control.accessible === false).length, overflow:page.state.overflow, screenState:page.screen, screenNavigationControl:page.screenNavigationControl, stableControlId:page.interaction.stableControlId, domControlId:page.interaction.stableControlId, identityAttribute:page.interaction.identityAttribute, browserRequestId:page.browserRequestId, contextRevalidation:page.contextRevalidation, precondition:page.precondition, visibleTerminal:page.visibleTerminal, accessibility:{...page.state.accessibility, namedRegions:focus.namedRegions, visibleFocus:focus.visibleFocus}, expectedControl:contract.control, expectedMethod:contract.method, expectedBodyKind:contract.body ?? null, expectedApi:contract.api, expectedArtifact:contract.artifact ?? null, expectedTerminal:contract.terminal, terminal:page.terminal, interaction:page.interaction, transaction:page.transaction, evidenceId:page.evidenceId, screenshotEvidenceId:page.screenshotEvidenceId};
            if (boundedReelEditor) action.boundedReelEditor = boundedReelEditor.receipt;
            action.interaction.pointerActivated = page.transaction.pointerActivations.length === 1;
            action.interaction.keyboardActivated = page.transaction.keyboardActivations.length === 1;
            action.interaction.activation = page.transaction.keyboardActivations.length === 1 ? "keyboard" : "pointer";
            const operationTiming = {"project-validation":"validationMs", "artifact-build":"buildMs", simulation:"simulationMs", replay:"replayMs"}[page.transaction.operation];
            if (operationTiming) timings[operationTiming] = Math.max(timings[operationTiming] ?? 0, page.elapsedMs);
            await saveCheckpoint(action);
            const observations = [observation], bootstrap = tupleBootstrapContract(options.tuple), bootstrapEvidenceId = await save("provenance", "tuple-bootstrap.json", JSON.stringify({kind:"p8-05-single-tuple-bootstrap", tuple:options.tuple, bootstrap, renderedBootstrap}), observations), scopedBootstrap = bootstrap.map((entry) => ({...entry, evidenceId:bootstrapEvidenceId})), workflowScope = {kind:"p8-05-single-tuple-workflow-scope", tuple:options.tuple, bootstrap:scopedBootstrap, recoveryRequired:false};
            workflowScope.scopeEvidenceId = await save("provenance", "workflow-scope.json", JSON.stringify(workflowScope), observations);
            await save("cli-transcript", "packed-cli.txt", transcript.join("\n"), observations); await save("browser-log", "browser.json", JSON.stringify(cdp.events), observations); await save("api-log", "api.json", JSON.stringify(api), observations); await save("error", "errors.txt", errors.join("\n") || "no browser/API/CLI errors observed\n", observations); await save("timing", "timings.json", JSON.stringify(timings), observations); await save("reproduction", "reproduction.md", `Installed packed CLI: ${installedCli}\nPacked package: ${options.packedPackage}\nPersona: ${persona}\nObservation: ${observation}\nViewport: ${viewport}\n`, observations); await save("artifact", "candidate.json", JSON.stringify({candidateId:options.candidateId, candidatePackageSha256:options.candidatePackageSha256, packedPackageSha256:digest(packageBytes), archiveGitHead:installedPackage.gitHead, installedCli, candidatePackageJsonSha256:digest(candidatePackageJsonBytes), installedPackageJsonSha256:digest(installedPackageBytes), declaredCandidateExecutableSha256:options.candidateExecutableSha256, candidateExecutableSha256:candidateExecutable.sha256, candidateExecutableReceiptSha256:options.candidateExecutableReceipt.sha256, candidateExecutableReceiptId:candidateReceipt.receiptId, candidateExecutableReceiptIssuer:candidateReceipt.issuer, candidateTreeManifestCandidateId:candidateTreeManifest.candidateId, candidateTreeManifestSha256:candidateTreeManifest.sha256, candidateTreeObjectId:candidateTreeManifest.tree}), observations);
            const performance = p805OperationPerformance(timings);
            const measurements = {consoleExceptions:cdp.events.filter((event) => event.method === "Runtime.exceptionThrown").length, unhandledRequestFailures:cdp.events.filter((event) => event.method === "Network.loadingFailed").length, documentOverflow:action.overflow, inaccessiblePrimaryActions:page.state.controls.filter((control) => !control.disabled && control.accessible === false).length, unexplainedDisabledControls:action.accessibility.unexplainedDisabledControls, namedRegions:action.accessibility.namedRegions.length, visibleFocus:action.accessibility.visibleFocus};
            audit = {auditId, worker, persona, workflowPersonas:[persona], tuple:options.tuple, workflowScope, phase:options.phase, candidateId:options.candidateId, candidatePackageSha256:options.candidatePackageSha256, packageIdentity:{archiveSha256:digest(packageBytes), archiveGitHead:installedPackage.gitHead, declaredPackedCli:options.packedCli, installedCli, sharedRuntimeReceiptSha256:options.runtime?.receipt.sha256, sharedRuntimeRoot:options.runtime?.root, candidatePackageJsonSha256:digest(candidatePackageJsonBytes), installedPackageJsonSha256:digest(installedPackageBytes), declaredCandidateExecutableSha256:options.candidateExecutableSha256, candidateExecutableSha256:candidateExecutable.sha256, candidateExecutableReceiptSha256:options.candidateExecutableReceipt.sha256, candidateExecutableReceiptId:candidateReceipt.receiptId, candidateExecutableReceiptIssuer:candidateReceipt.issuer, candidateExecutableFiles:candidateExecutable.files, candidateTreeManifestCandidateId:candidateTreeManifest.candidateId, candidateTreeManifestSha256:candidateTreeManifest.sha256, candidateTreeObjectId:candidateTreeManifest.tree}, startedAt, endedAt:undefined, cleanContext:context, observations, observationEvidence, evidence, checkpointReceipts, finalResult:{status:"passed", aggregation:"verified-checkpoint-receipts-only", chunks:1, checkpointReceiptSha256s:checkpointReceipts.map((receipt) => receipt.sha256)}, timings, performance, rendered:{execution:"packed-public-cli-built-studio-rendered-controls", viewports:[viewport], responsive:[{viewport, overflow:action.overflow, visibleFocus:action.accessibility.visibleFocus, screenshotEvidenceId:action.screenshotEvidenceId}], measurements, defects:[["console", measurements.consoleExceptions], ["request", measurements.unhandledRequestFailures], ["accessibility", measurements.inaccessiblePrimaryActions], ["disabled-control", measurements.unexplainedDisabledControls], ["overflow", measurements.documentOverflow ? 1 : 0], ["named-region", measurements.namedRegions < 1 ? 1 : 0], ["focus", measurements.visibleFocus ? 0 : 1], ["performance", Object.values(performance).some((item) => item.classification === "regression") ? 1 : 0]].filter(([, count]) => count > 0).map(([kind]) => ({kind, evidenceId:kind === "performance" ? evidence.find((item) => item.kind === "timing").evidenceId : kind === "console" || kind === "request" ? evidence.find((item) => item.kind === "browser-log").evidenceId : action.evidenceId})), actions:[action], recovery:{}, jobs:{}}};
        } else {
        // Validation is a Studio workflow, not a Node-side convenience fetch.
        // Follow the rendered Overview control through its request and visible
        // terminal state so its receipt shares the transaction contract used
        // for every other public operation below.
        // Ensure Overview is reached from a different rendered project tab so
        // validation cannot inherit a URL-selected state from browser setup.
        await navigateProjectTab(createdProjectBaseRoute, "gameModel", "project validation source");
        await navigateProjectTab(createdProjectBaseRoute, "overview", "project validation");
        await waitFor(() => evaluate("document.readyState === 'complete' && document.body.innerText.includes('Re-check project')"), "rendered project validation control");
        const validationCursor = cdp.events.length;
        const validation = await activateRenderedTransaction({lifecycle:"operation", operation:"project-validation", observation:"project validation", cursor:validationCursor, method:"GET", path:"/api/project/validate", stateClass:"read-only-operation"});
        if (validation.response.status !== 200) fail(`Studio did not validate the rendered project: HTTP ${validation.response.status}`);
        const validationTerminal = await waitFor(() => evaluate(`(() => {
            const result = document.querySelector('[data-pokie-lifecycle-result="project-validation"]');
            if (!(result instanceof HTMLElement) || !(result.offsetWidth || result.offsetHeight || result.getClientRects().length)) return false;
            const terminal = result.getAttribute('data-pokie-lifecycle-terminal');
            return terminal === 'completed' ? {terminal, text:(result.innerText || result.textContent || '').trim()} : false;
        })()`), "rendered project validation terminal");
        validation.transaction.terminal = {status:validationTerminal.terminal, resultSha256:digest(JSON.stringify(validation.payload)), source:"response", browserRequestId:validation.entry.browserRequestId, causedByRequestId:validation.entry.browserRequestId};
        timings.validationMs = Date.now() - validation.transaction.startedAtMs;
        // Reload only while a durable job exists.  A route-only reload says
        // nothing about reconnecting to active work, so retain the job id and
        // its post-reload repository discovery in the runtime evidence.
        // A one-million-round run keeps the durable job observable without
        // letting a cleanup probe monopolize the packaged public workflow.
        // Keep the job active across a full browser reload.  The probe is
        // cancelled through the rendered workflow immediately afterwards, so
        // this value is a durability window rather than work the audit waits
        // to complete.
        // This must remain inside Studio's public request boundary.  A value
        // above the server limit merely records a 400 validation failure and
        // never creates the durable job that the reload/cancel state machine
        // is meant to exercise.  The maximum accepted request gives the
        // browser a reliable active-work window while still proving the
        // rendered form and API's real validation contract.
        // Reload needs a durable request that survives the full browser
        // transition. Retry deliberately repeats its captured request, so
        // cancellation uses a separate, shorter real job that can still be
        // cancelled through the rendered control and then finish in the
        // browser-owned terminal-result window.
        const simulationRoundLimit = 2_000_000;
        // Reload/reconnect has to catch a genuinely active durable job after
        // the real page reload and route restoration.  One million rounds can
        // finish during Chromium's fresh-profile startup on fast hosts, which
        // leaves the correctly rendered Cancel control with no live request
        // to own. Keep this below the server's accepted maximum but long
        // enough for the public cancellation interaction to be observable.
        const reloadProbeRounds = 1_800_000;
        // The cancellation only needs to reach an active durable state. Keep
        // its retried workload representative but bounded: the retry must
        // complete in every isolated viewport child before that child can
        // publish its immutable receipt.
        // The cancellation transaction must remain active through the
        // rendered Cancel confirmation. Small probes can finish on a fast
        // packed worker before the user reaches that control, turning a
        // genuine cancellation path into a completed-job race.
        const retryProbeRounds = 500_000;
        const activeReload = await startRenderedSimulation(createdProjectBaseRoute, "active-job reload", reloadProbeRounds), reloadCursor = cdp.events.length;
        await cdp.send("Page.reload", {ignoreCache:true}); await waitFor(() => evaluate("document.readyState === 'complete' && location.hash.includes('/project/')"), "active project reload/reconnect"); const reloadJobs = await waitFor(async () => { const event = cdp.events.slice(reloadCursor).find((value) => value.method === "Network.responseReceived" && new URL(value.params.response.url).pathname === "/api/project/jobs"); if (!event) return false; try { const body = await cdp.send("Network.getResponseBody", {requestId:event.params.requestId}), payload = JSON.parse(body.body || "{}"); return {event, payload}; } catch { return false; } }, "rendered active-job reload discovery"), jobs = Array.isArray(reloadJobs.payload) ? reloadJobs.payload : reloadJobs.payload?.jobs; api.push({path:"/api/project/jobs", method:"GET", status:reloadJobs.event.params.response.status, payload:reloadJobs.payload, browserRequestId:reloadJobs.event.params.requestId, initiator:"rendered-reload", recovery:"reload"}); if (!Array.isArray(jobs) || !jobs.some((job) => job?.id === activeReload.payload.id)) fail("Studio reload did not discover the active durable job through its rendered recovery path");
        // A running job intentionally disables sibling tab navigation. The
        // reload restored the real public Simulation screen, so no route
        // adapter may intervene before the rendered Cancel control owns its
        // request.
        const recoveryNavigationCursor = cdp.events.length;
        await waitFor(() => evaluate("location.hash.endsWith('/simulation')"), "active-job reload Simulation recovery screen");
        // An active job deliberately replaces the Configure form, including
        // its "Run Simulation" label, with the Run-step progress surface.
        // The recovery contract is therefore the route followed by its own
        // stable Cancel control below; waiting for the hidden configure text
        // would turn a successful restored job into a false timeout.
        await waitFor(() => evaluate("document.readyState === 'complete' && location.hash.endsWith('/simulation')"), "active-job reload Simulation recovery navigation");
        // The generic Jobs list proves discovery; the restored Simulation tab
        // must also issue its own browser poll before Cancel can own the same
        // durable id.  Waiting for that rendered hook request closes the
        // reload race where a visible transition frame could receive a modal
        // confirmation before the reattached cancel callback had its id.
        const restoredSimulation = await waitFor(async () => {
            const event = cdp.events.slice(recoveryNavigationCursor).find((value) => value.method === "Network.responseReceived" && new URL(value.params.response.url).pathname === `/api/project/simulations/${encodeURIComponent(activeReload.payload.id)}`);
            if (!event) return false;
            try {
                const body = await readBrowserResponseBody(event.params.requestId, "active-job reload restored simulation"), payload = JSON.parse(body.body || "{}");
                return ["queued", "running", "cancelling"].includes(payload?.status) ? {event, payload} : false;
            } catch { return false; }
        }, "active-job reload restored Simulation poll");
        api.push({observation:"active-job reload", method:"GET", path:`/api/project/simulations/${encodeURIComponent(activeReload.payload.id)}`, status:restoredSimulation.event.params.response.status, payload:restoredSimulation.payload, browserRequestId:restoredSimulation.event.params.requestId, initiator:"rendered-reload-simulation"});
        await wait(250);
        const activeReloadCancellation = await activateRenderedTransaction({lifecycle:"recovery", operation:"simulation-cancel", observation:"active-job reload", cursor:cdp.events.length, method:"DELETE", path:`/api/project/simulations/${encodeURIComponent(activeReload.payload.id)}`, confirmation:true, stateClass:"recovery-operation"}); if (activeReloadCancellation.response.status !== 200 || activeReloadCancellation.entry.path !== `/api/project/simulations/${encodeURIComponent(activeReload.payload.id)}`) fail("Studio did not clean up the active reload job through its rendered control"); const activeReloadTerminal = await browserTerminal(`/api/project/simulations/${encodeURIComponent(activeReload.payload.id)}`, "active-job reload", activeReload.cursor, ["cancelled"], [activeReload.transaction, activeReloadCancellation.transaction]);
        // A tuple may prepare only the project its own declared screen uses.
        // Importing Certification/Fairness sources during an unrelated
        // simulation or recovery tuple both violates tuple isolation and
        // turns an optional source import into a false prerequisite.
        const tupleRoute = options.tuple ? P805_WORKFLOW_CONTRACTS[options.tuple.persona][options.tuple.observation].route : undefined;
        const outcomeLibraryProjectBaseRoute = !options.tuple || tupleRoute === "certification"
            ? await openImportedProject(outcomeBundle, "certification outcome-library import")
            : undefined;
        const runtimeProjectBaseRoute = !options.tuple || tupleRoute === "provablyFair"
            ? await openImportedProject(packageRoot, "fairness runtime-package import")
            : undefined;
        // The preceding import workflows intentionally replace Studio's
        // server-side current project. Re-enter the primary Blueprint through
        // the rendered Projects import path before collecting its workflows;
        // retaining the old route would make a visible control operate on the
        // runtime package while the receipt merely *claimed* the Blueprint.
        const projectBaseRoute = await openImportedProject(blueprint, "primary Blueprint workflow import"), viewports = ["wide", "compact", "narrow"], actions = [], workflows = options.tuple ? [options.tuple] : options.workflowPersonas.flatMap((persona) => P805_REQUIRED_OBSERVATIONS[persona].flatMap((observation) => viewports.map((viewport) => ({persona, observation, viewport}))));
        for (const {persona, observation, viewport} of workflows) {
            const contract = P805_WORKFLOW_CONTRACTS[persona][observation], primaryPersona = options.persona;
            options.persona = persona;
            let page;
            const workflowProjectBaseRoute = contract.route === "certification"
                ? outcomeLibraryProjectBaseRoute
                : contract.route === "provablyFair"
                    ? runtimeProjectBaseRoute
                    : projectBaseRoute;
            if (workflowProjectBaseRoute === undefined) fail(`${observation} is missing its declared imported-project bootstrap`);
            try { page = await runScreenControlState(workflowProjectBaseRoute, viewport, observation, contract); } finally { options.persona = primaryPersona; }
            const action = {persona, observation, route:`${workflowProjectBaseRoute}/${contract.route}`, viewport, elapsedMs:page.elapsedMs,
                pageTextLength:page.state.text.length, controlCount:page.state.controls.length, inaccessiblePrimaryActions:page.state.controls.filter((control) => !control.disabled && control.accessible === false).length, overflow:page.state.overflow,
                screenState:page.screen, screenNavigationControl:page.screenNavigationControl, stableControlId:page.interaction.stableControlId, domControlId:page.interaction.stableControlId, identityAttribute:page.interaction.identityAttribute, browserRequestId:page.browserRequestId, contextRevalidation:page.contextRevalidation, precondition:page.precondition, visibleTerminal:page.visibleTerminal, accessibility:page.state.accessibility,
                expectedControl:contract.control, expectedMethod:contract.method,
                expectedBodyKind:contract.body ?? null, expectedApi:contract.api, expectedArtifact:contract.artifact ?? null,
                expectedTerminal:contract.terminal, terminal:page.terminal, interaction:page.interaction, transaction:page.transaction,
                evidenceId:page.evidenceId, screenshotEvidenceId:page.screenshotEvidenceId};
            actions.push(action);
            await saveCheckpoint(action);
        }
        // Capture all three breakpoints even for personas with fewer than
        // three workflow observations.  This is rendered Studio evidence,
        // not a declared viewport list.
        const responsive = [];
        for (const [viewport, dimensions] of Object.entries(viewportDimensions).filter(([viewport]) => !options.tuple || viewport === options.tuple.viewport)) {
            await cdp.send("Emulation.setDeviceMetricsOverride", {...dimensions, deviceScaleFactor:1});
            await waitFor(() => evaluate("document.readyState === 'complete' && document.body.innerText.trim().length > 40"), `${viewport} responsive Studio state`);
            const state = await evaluate("(()=>{const item=[...document.querySelectorAll('button,a,input,select,textarea')].find((value)=>!value.disabled&&!!(value.offsetWidth||value.offsetHeight||value.getClientRects().length)); item?.focus(); const style=item?getComputedStyle(item):undefined; return {overflow:document.documentElement.scrollWidth>window.innerWidth,visibleFocus:!!item&&document.activeElement===item&&!!style&&(style.outlineStyle!=='none'||style.boxShadow!=='none')};})()"), screenshot = await captureScreenshot(), screenshotEvidenceId = await save("screenshot", `responsive-${viewport}.png`, Buffer.from(screenshot.data, "base64"));
            responsive.push({viewport, ...state, screenshotEvidenceId});
        }
        await cdp.send("Emulation.setDeviceMetricsOverride", {...viewportDimensions[recoveryViewport], deviceScaleFactor:1});
        await waitFor(() => evaluate(`window.innerWidth === ${viewportDimensions[recoveryViewport].width} && document.readyState === 'complete'`), `${recoveryViewport} compound workflow state`);
        // The browser form correctly blocks its own minimum-value error, so
        // use the first value above Studio's durable-job server limit.  This
        // keeps the error workflow an actual valid DOM submission whose 400
        // diagnostic belongs to the rendered request, rather than a native
        // validation bubble with no public request receipt.
        const failure = await startRenderedSimulation(projectBaseRoute, "actionable simulation failure", simulationRoundLimit + 1, [400]), simulation = await startRenderedSimulation(projectBaseRoute, "successful simulation", 1); if (failure.response.status !== 400 || simulation.response.status !== 202 || typeof simulation.payload?.id !== "string") fail("Studio did not demonstrate an actionable rendered simulation failure and successful rendered job creation"); const simulationId = simulation.payload.id, simulationTerminal = await browserTerminal(`/api/project/simulations/${encodeURIComponent(simulationId)}`, "successful simulation", simulation.cursor, ["completed"], simulation.transaction); timings.simulationMs = Date.now() - simulation.transaction.startedAtMs;
        const replay = await startRenderedReplay(projectBaseRoute, "successful replay");
        const replayTerminal = await browserTerminal(`/api/project/replays/${encodeURIComponent(replay.payload.id)}`, "successful replay", replay.cursor, ["completed"], replay.transaction);
        if (!replayTerminal.descriptor) fail("Replay produced no valid artifact for rendered loading");
        timings.replayMs = replay.transaction.elapsedMs;
        const artifactSource = await waitFor(() => focusRenderedControl("input", "(item) => item.type === 'radio' && item.value === 'artifact'"), "rendered Replay Artifact source");
        await activateFocusedControl("precondition", artifactSource, "keyboard");
        const loadReplayArtifact = async (observation, descriptor, expectedStatus) => {
            await setP805ReplayArtifactInput(cdp, evaluate, JSON.stringify(descriptor));
            const cursor = cdp.events.length;
            const control = await renderedTransactionControl({lifecycle:"operation", operation:"replay-artifact", observation});
            const formState = await captureRenderedEditableFormState("replay-artifact", observation, control.stableControlId);
            const loaded = await activateRenderedTransaction({lifecycle:"operation", operation:"replay-artifact", observation, cursor, method:"POST", path:"/api/project/replays/inspect-artifact", formState, stateClass:"editable-submission", control});
            if (loaded.response.status !== expectedStatus) fail(`${observation} did not inspect the actual pasted Replay Artifact`);
            loaded.transaction.terminal = {status:expectedStatus === 200 ? "loaded" : "error", source:"response", browserRequestId:loaded.entry.browserRequestId, causedByRequestId:loaded.entry.browserRequestId, resultSha256:digest(JSON.stringify(loaded.payload))};
            loaded.rendered = await waitFor(() => evaluate(`(()=>{
                const result=document.querySelector('[data-pokie-lifecycle-result="replay-artifact"]');
                if(!(result instanceof HTMLElement)||result.getClientRects().length===0||result.getAttribute('data-pokie-lifecycle-terminal')!==${JSON.stringify(loaded.transaction.terminal.status)})return false;
                const text=(result.innerText||result.textContent||'').trim(), round=result.getAttribute('data-pokie-lifecycle-artifact-round'),seed=result.getAttribute('data-pokie-lifecycle-artifact-seed');
                if(${expectedStatus}===200&&(round!==${JSON.stringify(String(loaded.payload.round))}||seed!==${JSON.stringify(loaded.payload.seed ?? "")}))return false;
                return text?{controlId:result.getAttribute('data-pokie-lifecycle-result-control'),status:result.getAttribute('data-pokie-lifecycle-terminal'),round,seed,text}:false;
            })()`), `${observation} rendered artifact diagnostic or loaded round`);
            await evaluate("document.querySelector('[data-pokie-lifecycle-result=\"replay-artifact\"]')?.scrollIntoView({block:'center',inline:'nearest'})");
            const screenshot = await captureScreenshot();
            loaded.transaction.elapsedMs = Date.now() - loaded.transaction.startedAtMs;
            timings.replayArtifactMs = Math.max(timings.replayArtifactMs ?? 0, loaded.transaction.elapsedMs);
            loaded.screenshotEvidenceId = await save("screenshot", `${recoveryViewport}-${observation}.png`, Buffer.from(screenshot.data,"base64"), [options.tuple?.observation ?? observation]);
            return loaded;
        };
        const replayArtifactValid = await loadReplayArtifact("replay-artifact-valid", replayTerminal.descriptor, 200);
        const replayFailure = await loadReplayArtifact("replay-artifact-invalid", {round:0, seed:"invalid-artifact"}, 400);
        const replayArtifactInspection = await loadReplayArtifact("replay-artifact-recovery", replayTerminal.descriptor, 200);
        // Keep this long enough for the rendered Cancel operation to attach,
        // but short enough that its rendered Retry can repeat the captured
        // request and reach a terminal report inside this tuple worker.
        const cancellationRounds = retryProbeRounds;
        const cancellable = await startRenderedSimulation(projectBaseRoute, "cooperative cancellation", cancellationRounds); if (cancellable.response.status !== 202 || typeof cancellable.payload?.id !== "string") fail("Studio did not start a cancellable rendered simulation"); const cancelled = await activateRenderedTransaction({lifecycle:"recovery", operation:"simulation-cancel", observation:"cooperative cancellation", cursor:cdp.events.length, method:"DELETE", confirmation:true, stateClass:"recovery-operation"}); if (cancelled.response.status !== 200 || cancelled.entry.path !== `/api/project/simulations/${encodeURIComponent(cancellable.payload.id)}` || !["cancelling", "cancelled"].includes(cancelled.payload?.status)) fail("Studio did not acknowledge cooperative simulation cancellation through its rendered control"); const cancelledTerminal = await browserTerminal(`/api/project/simulations/${encodeURIComponent(cancellable.payload.id)}`, "cooperative cancellation", cancellable.cursor, ["cancelled"], [cancellable.transaction, cancelled.transaction]); timings.cancellationMs = cancelled.transaction.elapsedMs;
        // The durable terminal response can arrive one React commit before
        // Simulation switches from its Run step to Review. Observe the
        // stable Retry control before its native pointer activation. React
        // may replace it as the request begins, but the receipt keeps the
        // captured identity, native focus, hit-test, and press/release proof.
        await waitFor(() => evaluate("(()=>{const item=document.getElementById('simulation-retry'); return item instanceof HTMLButtonElement && item.getAttribute('data-pokie-lifecycle') === 'recovery' && item.getAttribute('data-pokie-lifecycle-operation') === 'simulation-retry' && item.textContent?.trim() === 'Repeat simulation' && !item.disabled;})()"), "cooperative cancellation stable rendered retry control");
        const retryCursor = cdp.events.length, retry = await activateRenderedTransaction({lifecycle:"recovery", operation:"simulation-retry", observation:"simulation retry", cursor:retryCursor, method:"POST", stateClass:"recovery-operation", capturePostTransition:true}); if (retry.response.status !== 202 || typeof retry.payload?.id !== "string") fail("Studio did not start a fresh rendered retry through its recovery control"); const retryTerminal = await browserTerminal(`/api/project/simulations/${encodeURIComponent(retry.payload.id)}`, "simulation retry", retryCursor, ["completed"], retry.transaction, 180_000, true), retryReceipt = {operation:"simulation-retry", controlId:retry.transaction.control.stableControlId, stateClass:"recovery-operation", transaction:retry.transaction}; validateP805RetryTerminalReceipt(retryReceipt); timings.retryMs = retry.transaction.elapsedMs; const reportsEvent = await waitFor(async () => { const event = cdp.events.slice(retryCursor).find((value) => value.method === "Network.responseReceived" && new URL(value.params.response.url).pathname === "/api/project/reports"); if (!event) return false; try { const response = await cdp.send("Network.getResponseBody", {requestId:event.params.requestId}), payload = JSON.parse(response.body || "[]"); return Array.isArray(payload) ? {event, payload} : false; } catch { return false; } }, "rendered simulation reports"); const reports = {response:{status:reportsEvent.event.params.response.status, ok:true}, payload:reportsEvent.payload}; api.push({observation:"simulation retry", method:"GET", path:"/api/project/reports", status:reports.response.status, payload:reports.payload, browserRequestId:reportsEvent.event.params.requestId, initiator:"rendered-poll"});
        // A package project is intentionally read-only in Game Model.  The
        // first-time-user Design Game is the product-owned editable surface,
        // so use its native text field and its public Projects/Open workflow
        // to prove the same dirty-draft protection rather than pretending a
        // capability-gated Game Model section is editable.
        await navigateHome("design", "unsaved-work source");
        await waitFor(() => evaluate("document.readyState === 'complete' && document.getElementById('blueprint-create-game') instanceof HTMLButtonElement"), "rendered Design Game unsaved-work editor");
        const editedControl = await waitFor(() => evaluate(`(() => {
            const visible = (item) => !!(item.offsetWidth || item.offsetHeight || item.getClientRects().length);
            const item = [...document.querySelectorAll('input')].find((candidate) => candidate instanceof HTMLInputElement && visible(candidate) && !candidate.disabled && candidate.type !== 'hidden' && [...candidate.labels || []].some((label) => label.textContent?.trim() === 'Game name'));
            if (!(item instanceof HTMLInputElement)) return false;
            item.focus({preventScroll:true});
            const accessibleName = [...item.labels || []].map((label) => label.textContent?.trim()).find(Boolean) || item.getAttribute('aria-label') || item.name || '';
            return document.activeElement === item ? {stableControlId:item.id, identityAttribute:'id', accessibleName, keyboardFocused:true, enabled:true, disabled:false} : false;
        })()`), "rendered editable Design Game field");
        if (!editedControl?.stableControlId || !editedControl.accessibleName || !editedControl.keyboardFocused) fail("Studio did not expose a keyboard-operable Design Game field");
        await cdp.send("Input.insertText", {text:" P805 unsaved"});
        const dirtyInput = await waitFor(() => evaluate(`(() => {
            const item = document.getElementById(${JSON.stringify(editedControl.stableControlId)});
            return item instanceof HTMLInputElement || item instanceof HTMLTextAreaElement ? item.value.includes('P805 unsaved') ? item.getAttribute('aria-label') || [...item.labels || []].map((label) => label.textContent?.trim()).filter(Boolean).join(' ') || item.name || 'Design Game field' : false : false;
        })()`), "rendered unsaved Design Game input");
        const projects = await waitFor(async () => {
            const control = await focusLifecycleControl("navigation", "projects", "button,a");
            return control?.keyboardFocused ? control : false;
        }, "rendered Projects navigation control");
        if (!projects?.keyboardFocused || !projects.stableControlId || !projects.accessibleName) fail("Studio did not expose a Projects navigation control for unsaved-work protection");
        await activateFocusedControl("navigation", projects);
        await waitFor(() => evaluate("location.hash === '#/home/projects' && document.body.innerText.includes('Projects')"), "rendered Projects navigation");
        const recoveryBefore = await evaluate("location.hash");
        // Projects is still inside Home, so it correctly does not prompt for
        // a Design Game draft. Opening a project is the actual public exit
        // that must be blocked. Follow that rendered Open control, then keep
        // the draft with the dialog's real Stay action.
        const openProject = await waitFor(() => focusRenderedControl("[data-pokie-project-location]", "(_item, name) => name.length > 0"), "rendered project Open control for unsaved-work protection");
        if (!openProject?.keyboardFocused || !openProject.stableControlId || !openProject.accessibleName) fail("Studio did not expose a project Open control for unsaved-work protection");
        const cancelledProjectOpenCursor = cdp.events.length;
        const openProjectActivation = await activateFocusedControl("navigation", openProject);
        const protectionText = await waitFor(() => evaluate("document.body.innerText.match(/You have unsaved[^\\n]*/i)?.[0] || false"), "rendered unsaved-work protection");
        const cancelUnsaved = await waitFor(async () => {
            // The shared navigation guard publishes the rendered cancel
            // lifecycle on its actual Mantine button. Bind to that role and
            // still read the person's accessible name from the live DOM, so
            // a stale or unrelated "Stay" label cannot satisfy recovery.
            const control = await focusRenderedControl('[data-pokie-confirmation="cancel"]', "(_item, name) => name === 'Stay'");
            return control?.keyboardFocused ? control : false;
        }, "rendered unsaved-work cancel control");
        if (!cancelUnsaved?.keyboardFocused || !cancelUnsaved.stableControlId || !cancelUnsaved.accessibleName) fail("Studio did not expose an unsaved-work cancel control");
        const stayActivation = await activateFocusedControl("recovery", cancelUnsaved);
        await waitFor(() => evaluate("!document.querySelector('[data-pokie-confirmation=\"cancel\"]')"), "dismissed rendered unsaved-work Stay control");
        const routeAfterStay = await evaluate("location.hash");
        // The later Create game workflow legitimately opens the newly
        // created project. Snapshot the guarded Open request boundary now,
        // before that independent action can add its own request to the same
        // endpoint and falsely make the cancelled transition look unsafe.
        const cancelledProjectOpenRequestCount = cdp.events.slice(cancelledProjectOpenCursor)
            .filter((event) => event.method === "Network.requestWillBeSent" && new URL(event.params.request.url).pathname === "/api/home/projects/open").length;
        const unsavedWork = {editedControl:dirtyInput, editControl:{...editedControl, input:{kind:"native-text", text:" P805 unsaved", value:await evaluate(`document.getElementById(${JSON.stringify(editedControl.stableControlId)})?.value`)}}, navigationControl:{...openProject, activation:openProjectActivation}, cancelControl:{...cancelUnsaved, activation:stayActivation}, protectionText, preserved:routeAfterStay === recoveryBefore};
        const staleCursor = cdp.events.length;
        const startGameNavigation = await navigateHome("design", "project-switch source");
        if (!startGameNavigation || startGameNavigation.control?.stableControlId !== "home-tab:design" || startGameNavigation.control?.accessibleName !== "Start a game" || startGameNavigation.activation?.kind !== "pointer") fail("Studio did not activate the live visible Start a game control through one native pointer interaction");
        const projectSwitchCreationObservations = [];
        const {control:switched, activation:createdProjectActivation} = await createP805RenderedGame(cdp, evaluate, projectSwitchCreationObservations, 90_000, readBrowserResponseBody);
        const recoveryAfter = await evaluate("location.hash");
        await waitFor(() => evaluate("document.readyState === 'complete' && location.hash === " + JSON.stringify(recoveryAfter)), "stale-response isolation navigation");
        // The navigation promise can settle one event-loop turn before its
        // final rendered response is delivered.  Capture the response only
        // after the replacement project route is stable, otherwise a fast
        // real browser run races this receipt and incorrectly reports no
        // stale-response isolation evidence.
        const delayedResponse = await waitFor(() => cdp.events.slice(staleCursor).filter((event) => event.method === "Network.responseReceived").at(-1) ?? false, "stale response after project switch"), staleResponses = cdp.events.slice(staleCursor).filter((event) => event.method === "Network.responseReceived"), staleResponseIsolation = typeof delayedResponse?.params?.requestId === "string" && await evaluate("location.hash === " + JSON.stringify(recoveryAfter));
        const projectSwitchReceipt = {cancelledProjectOpen:{routeBefore:recoveryBefore, routeAfter:routeAfterStay, projectOpenRequestCount:cancelledProjectOpenRequestCount, stayControl:cancelUnsaved, stayActivation}, startGameNavigation:{routeBefore:routeAfterStay, routeAfter:"#/home/design", control:startGameNavigation.control, activation:startGameNavigation.activation}, createdProject:{route:recoveryAfter, control:switched, activation:createdProjectActivation, observations:projectSwitchCreationObservations}, staleResponse:{responseCount:staleResponses.length, delayedRequestId:delayedResponse?.params?.requestId, completedAfterSwitch:typeof delayedResponse?.params?.requestId === "string", sourceRoute:recoveryBefore, destinationRoute:recoveryAfter}, destinationRoute:recoveryAfter};
        validateP805HomeProjectSwitchReceipt(projectSwitchReceipt);
        const restartProjectBaseRoute = recoveryAfter.replace(/\/[^/]+$/, ""); await navigateProjectTab(restartProjectBaseRoute, "simulation", "restart recovery"); await waitFor(() => evaluate("document.body.innerText.includes('Run Simulation')"), "rendered restart-recovery simulation form"); await ensureSimulationConfigure("restart recovery"); const restartCursor = cdp.events.length, restartRecoveryStartedAt = Date.now(); if (!await waitFor(() => setLifecycleField("simulation-rounds", "1000000"), "rendered restart-recovery simulation rounds")) fail("Studio did not accept the rendered restart-recovery rounds"); const restartControl = await renderedTransactionControl({lifecycle:"operation", operation:"simulation", observation:"restart recovery", expectedStateClass:"editable-submission"}); const restartFormState = await captureRenderedEditableFormState("simulation", "restart recovery", restartControl.stableControlId); const restartJob = await activateRenderedTransaction({lifecycle:"operation", operation:"simulation", observation:"restart recovery", cursor:restartCursor, method:"POST", formState:restartFormState, stateClass:"editable-submission", control:restartControl}); if (restartJob.response.status !== 202 || typeof restartJob.payload?.id !== "string") fail("Studio did not start a rendered active job before restart");
        // The restarted Studio server was created through `own`, so it must
        // be drained through that same authenticated owner.  A generic
        // process-tree kill leaves the PC-20 registry live while its child
        // release records are still being written, which makes the later
        // immutable cleanup receipt race an unsigned partial record.
        // Simulation executors are intentionally not resumed after a server
        // restart.  The durable common job must instead render the captured
        // request as an explicit recovery-required terminal; waiting for the
        // vanished in-process executor to report "completed" turns the real
        // recovery receipt into a timeout.
        const preCrashJob = await waitFor(async () => {
            try {
                const stored = JSON.parse((await services.readFile(path.join(context.configurationRoot, "pokie", "studio-jobs", `${restartJob.payload.id}.json`))).toString("utf8"));
                if (stored?.id !== restartJob.payload.id || stored?.operation !== "simulation" || !P805_ACTIVE_JOB_STATUSES.has(stored?.status) || !Number.isSafeInteger(stored?.request?.rounds) || stored.request.rounds <= 0 || !Number.isSafeInteger(stored.request?.workers) || stored.request.workers <= 0) return false;
                return {id:stored.id, operation:stored.operation, status:stored.status, terminal:false, request:stored.request, causedByRequestId:restartJob.transaction.request.browserRequestId};
            } catch {
                return false;
            }
        }, "pre-crash durable nonterminal simulation job");
        const preCrashProcessState = await waitFor(async () => {
            try {
                const state = JSON.parse((await services.readFile(path.join(context.configurationRoot, "pokie", "studio-jobs", "_process-state.json"))).toString("utf8"));
                return state?.status === "running" && Number.isSafeInteger(state.updatedAt) ? state : false;
            } catch {
                return false;
            }
        }, "pre-crash ungraceful Studio process marker");
        postLossJobCapture = async () => await waitFor(async () => {
            try {
                const stored = JSON.parse((await services.readFile(path.join(context.configurationRoot, "pokie", "studio-jobs", `${restartJob.payload.id}.json`))).toString("utf8"));
                if (stored?.id !== restartJob.payload.id || stored?.operation !== "simulation" || !P805_ACTIVE_JOB_STATUSES.has(stored?.status) || !Number.isSafeInteger(stored?.request?.rounds) || stored.request.rounds <= 0 || !Number.isSafeInteger(stored.request?.workers) || stored.request.workers <= 0) return false;
                return {id:stored.id, operation:stored.operation, status:stored.status, terminal:false, request:stored.request, causedByRequestId:restartJob.transaction.request.browserRequestId};
            } catch {
                return false;
            }
        }, "post-loss durable nonterminal simulation job before restart reconciliation");
        abruptStudioLosses.add(studio);
        const priorStudio = studio, restartDrain = await settleChild(priorStudio); studio = startStudio(); await waitFor(async () => { try { return (await fetch(`${origin}/api/health`)).ok; } catch { return false; } }, "Studio server restart", 90_000); const restartRecoveryCursor = cdp.events.length; await cdp.send("Page.reload", {ignoreCache:true}); await waitFor(() => evaluate("document.readyState === 'complete' && location.hash.includes('/project/')"), "Studio server restart recovery"); const restartedProjectBaseRoute = (await evaluate("location.hash")).replace(/\/[^/]+$/, ""); await navigateProjectTab(restartedProjectBaseRoute, "simulation", "restart recovery"); const restartJobs = await waitFor(async () => { const event = cdp.events.slice(restartRecoveryCursor).find((value) => value.method === "Network.responseReceived" && new URL(value.params.response.url).pathname === "/api/project/jobs"); if (!event) return false; try { const body = await cdp.send("Network.getResponseBody", {requestId:event.params.requestId}), payload = JSON.parse(body.body || "{}"); return {event, payload}; } catch { return false; } }, "rendered restart job recovery"), restartList = Array.isArray(restartJobs.payload) ? restartJobs.payload : restartJobs.payload?.jobs ?? [], restartTerminal = restartList.find((job) => job?.id === restartJob.payload.id && job?.status === "recovery-required"), restartRecovered = restartTerminal !== undefined; if (!restartRecovered) fail("Studio restart did not discover the durable simulation recovery-required terminal"); const restartRendered = await waitFor(() => evaluate(`(()=>{const result=[...document.querySelectorAll('[data-pokie-lifecycle-result="simulation"]')].find((item)=>item instanceof HTMLElement&&item.getAttribute('data-pokie-lifecycle-result-control')==='simulation-run'&&item.getAttribute('data-pokie-lifecycle-result-operation')==='simulation'&&item.getAttribute('data-pokie-lifecycle-result-state')==='editable-submission'&&item.getAttribute('data-pokie-lifecycle-result-job')===${JSON.stringify(restartJob.payload.id)}&&item.getAttribute('data-pokie-lifecycle-result-request-id')===${JSON.stringify(restartJob.payload.id)}&&item.getAttribute('data-pokie-lifecycle-terminal')==='recovery-required'&&item.getAttribute('data-pokie-lifecycle-result-receipt')==='durable-terminal'&&item.getAttribute('data-pokie-lifecycle-result-durable-job')===${JSON.stringify(restartJob.payload.id)}&&item.getAttribute('data-pokie-lifecycle-result-captured-job')===${JSON.stringify(restartJob.payload.id)}&&item.getAttribute('data-pokie-lifecycle-result-durable-status')==='recovery-required'&&item.getAttribute('data-pokie-lifecycle-result-recovery')==='restart-reconciled'&&item.getAttribute('data-pokie-lifecycle-result-executor')==='unavailable-after-restart'); if(!(result instanceof HTMLElement))return false; return {resultControlId:result.getAttribute('data-pokie-lifecycle-result-control'),resultOperation:result.getAttribute('data-pokie-lifecycle-result-operation'),resultStateClass:result.getAttribute('data-pokie-lifecycle-result-state'),resultReceipt:result.getAttribute('data-pokie-lifecycle-result-receipt'),capturedJobId:result.getAttribute('data-pokie-lifecycle-result-captured-job'),resultJobId:result.getAttribute('data-pokie-lifecycle-result-durable-job'),resultRequestId:result.getAttribute('data-pokie-lifecycle-result-request-id'),resultTerminal:result.getAttribute('data-pokie-lifecycle-result-durable-status'),resultRecovery:result.getAttribute('data-pokie-lifecycle-result-recovery'),resultExecutor:result.getAttribute('data-pokie-lifecycle-result-executor'),renderedTerminal:true,postRestartReplacementState:{capturedControlId:${JSON.stringify(restartJob.transaction.control.stableControlId)},captureKey:${JSON.stringify(restartJob.transaction.pointerActivations[0].captureKey)},controlState:'replaced-after-restart',currentControlId:document.getElementById('simulation-run') instanceof HTMLElement?'simulation-run':null,capturedControlConnected:false}}})()`), "rendered restart recovery terminal"), restartScreenshot = await captureScreenshot(), restartScreenshotEvidenceId = await save("screenshot", `${recoveryViewport}-restart-recovery.png`, Buffer.from(restartScreenshot.data, "base64"), [options.tuple?.observation ?? "restart recovery"]); timings.restartRecoveryMs = Date.now() - restartRecoveryStartedAt; const restartReceipt = {operation:"simulation", controlId:restartJob.transaction.control.stableControlId, stateClass:restartJob.transaction.stateClass, capturedJobId:restartJob.payload.id, transaction:restartJob.transaction, terminal:{status:restartTerminal.status, jobId:restartTerminal.id, resultSha256:digest(JSON.stringify(restartTerminal)), causedByRequestId:restartJob.transaction.request.browserRequestId}, rendered:restartRendered, timing:{elapsedMs:timings.restartRecoveryMs}, evidence:{screenshotEvidenceId:restartScreenshotEvidenceId}, ownedProcessDrain:restartDrain}; api.push({path:"/api/project/jobs", method:"GET", status:restartJobs.event.params.response.status, payload:restartJobs.payload, browserRequestId:restartJobs.event.params.requestId, initiator:"rendered-restart", recovery:"restart"}); const recovery = {reloadReconnect:activeReloadTerminal.status === "cancelled" && jobs.some((job) => job?.id === activeReload.payload.id), projectSwitch:recoveryBefore !== recoveryAfter, staleResponseIsolation, unsavedWorkProtection:unsavedWork.preserved === true, serverRestart:restartDrain.processTreeDrained && restartDrain.resourcesDrained && restartRecovered && restartTerminal.status === "recovery-required" && restartRendered.renderedTerminal === true}; if (!Object.values(recovery).every(Boolean)) fail(`Studio recovery controls did not produce measured results: ${JSON.stringify(recovery)}`);
        if (JSON.stringify(restartTerminal.request) !== JSON.stringify(preCrashJob.request)) fail("Studio restart recovery did not retain the captured durable simulation request");
        restartReceipt.terminal.operation = restartTerminal.operation;
        restartReceipt.terminal.request = restartTerminal.request;
        // Preserve the abrupt-loss receipt as an explicit nested shutdown
        // record.  The terminal validator deliberately distinguishes the
        // prior service's signal boundary from the post-restart process drain;
        // flattening these fields made a real recovered durable job look like
        // an unproven restart even though its rendered terminal had arrived.
        restartReceipt.ownedProcessDrain = {
            ...restartDrain,
            priorStudioShutdown: {
                shutdown: restartDrain.priorStudioShutdown,
                processStateBeforeLoss: preCrashProcessState,
                durableJobBeforeLoss: preCrashJob,
                durableJob: restartDrain.postLossJob,
            },
        };
        const observations = options.tuple ? [options.tuple.observation] : P805_REQUIRED_OBSERVATIONS[options.persona]; const recoveryEvidenceId = await save("page-state", "recovery-and-jobs.json", JSON.stringify({kind:"p8-05-runtime-observation", viewport:recoveryViewport, replayArtifacts:{valid:replayArtifactValid, invalid:replayFailure, recovered:replayArtifactInspection}, recovery, transactions:{projectValidation:validation.transaction, activeReloadStart:activeReload.transaction, activeReloadCancellation:activeReloadCancellation.transaction, simulationFailure:failure.transaction, simulationSuccess:simulation.transaction, replayFailure:replayFailure.transaction, replaySuccess:replay.transaction, replayRecovery:replayArtifactInspection.transaction, cancellableSimulation:cancellable.transaction, cooperativeCancellation:cancelled.transaction, simulationRetry:retry.transaction, restartSimulation:restartJob.transaction}, reload:{activeJobId:activeReload.payload.id, terminal:activeReloadTerminal, discoveredAfterReload:jobs.some((job) => job?.id === activeReload.payload.id)}, staleResponse:projectSwitchReceipt.staleResponse, projectSwitchReceipt, unsavedWork, restart:{activeJobId:restartJob.payload.id, recovered:restartRecovered, terminal:restartTerminal, receipt:restartReceipt}, jobs:{success:simulationTerminal, actionableFailure:failure.payload, cooperativeCancellation:cancelledTerminal, retryWithoutPartialArtifacts:retryTerminal, replayTerminal}, outcomes:{failureStatus:failure.response.status, cancellationStatus:cancelledTerminal.status, retryStatus:retryTerminal.status, cancelledSimulationId:cancellable.payload.id, reports:reports.payload, cancelledReportAbsent:!reports.payload.some((report) => report?.id === cancellable.payload.id)}})); await save("cli-transcript", "packed-cli.txt", transcript.join("\n"), observations); await save("browser-log", "browser.json", JSON.stringify(cdp.events), observations); await save("api-log", "api.json", JSON.stringify(api), observations); await save("error", "errors.txt", errors.join("\n") || "no browser/API/CLI errors observed\n", observations); await save("timing", "timings.json", JSON.stringify(timings), observations); await save("reproduction", "reproduction.md", `Installed packed CLI: ${installedCli}\nPacked package: ${options.packedPackage}\nPersona: ${options.persona}\n`, observations); await save("artifact", "candidate.json", JSON.stringify({candidateId:options.candidateId, candidatePackageSha256:options.candidatePackageSha256, archiveGitHead:installedPackage.gitHead, installedCli, candidatePackageJsonSha256:digest(candidatePackageJsonBytes), installedPackageJsonSha256:digest(installedPackageBytes), declaredCandidateExecutableSha256:options.candidateExecutableSha256, candidateExecutableSha256:candidateExecutable.sha256, candidateExecutableReceiptSha256:options.candidateExecutableReceipt.sha256, candidateExecutableReceiptId:candidateReceipt.receiptId, candidateExecutableReceiptIssuer:candidateReceipt.issuer, candidateExecutableFiles:candidateExecutable.files, candidateTreeManifestCandidateId:candidateTreeManifest.candidateId, candidateTreeManifestSha256:candidateTreeManifest.sha256, candidateTreeObjectId:candidateTreeManifest.tree, candidateTreeManifestFiles:candidateTreeManifest.files.length, packedPackage:options.packedPackage, packedPackageSha256:digest(packageBytes)}), observations);
        let workflowScope;
        if (options.tuple) {
            const bootstrap = tupleBootstrapContract(options.tuple), bootstrapEvidenceId = await save("provenance", "tuple-bootstrap.json", JSON.stringify({kind:"p8-05-single-tuple-bootstrap", tuple:options.tuple, bootstrap, completeWorkflow:true}), observations);
            workflowScope = {kind:"p8-05-single-tuple-workflow-scope", tuple:options.tuple, bootstrap:bootstrap.map((entry) => ({...entry, evidenceId:bootstrapEvidenceId})), recoveryRequired:tupleRequiresCompleteWorkflow(options.tuple), ...(compoundCliOutputs.length === 0 ? {} : {compoundCliOutputs})};
            workflowScope.scopeEvidenceId = await save("provenance", "workflow-scope.json", JSON.stringify(workflowScope), observations);
        }
        const performance = p805OperationPerformance(timings);
        const controls = await evaluate("(()=>{const visible=(item)=>!!(item.offsetWidth||item.offsetHeight||item.getClientRects().length), controls=[...document.querySelectorAll('button,a,input,select,textarea')].filter(visible); const focusable=controls.find((item)=>!item.disabled); focusable?.focus(); const style=focusable?getComputedStyle(focusable):undefined, visibleFocus=!!focusable && document.activeElement===focusable && style && (style.outlineStyle!==\"none\"||style.boxShadow!==\"none\"); return {controls:controls.map((item)=>({disabled:!!item.disabled,accessible:!!(item.innerText||item.getAttribute('aria-label')||item.getAttribute('aria-labelledby')||item.name),explained:!!item.getAttribute('title')||!!item.getAttribute('aria-describedby')})),namedRegions:[...document.querySelectorAll('[role=region],[role=main],main,nav')].filter(visible).length,visibleFocus};})()"), measurements = {consoleExceptions:cdp.events.filter((event) => event.method === "Runtime.exceptionThrown").length, unhandledRequestFailures:cdp.events.filter((event) => event.method === "Network.loadingFailed").length, documentOverflow:actions.some((action) => action.overflow) || responsive.some((entry) => entry.overflow), inaccessiblePrimaryActions:controls.controls.filter((control) => !control.disabled && !control.accessible).length, unexplainedDisabledControls:controls.controls.filter((control) => control.disabled && !control.explained).length, namedRegions:controls.namedRegions, visibleFocus:controls.visibleFocus}, defects = [["console", measurements.consoleExceptions], ["request", measurements.unhandledRequestFailures], ["accessibility", measurements.inaccessiblePrimaryActions], ["disabled-control", measurements.unexplainedDisabledControls], ["overflow", measurements.documentOverflow ? 1 : 0], ["named-region", measurements.namedRegions < 1 ? 1 : 0], ["focus", measurements.visibleFocus ? 0 : 1], ["performance", Object.values(performance).some((item) => item.classification === "regression") ? 1 : 0]].filter(([, count]) => count > 0).map(([kind]) => ({kind, evidenceId:recoveryEvidenceId})); audit = {auditId, worker, persona:options.persona, workflowPersonas:options.workflowPersonas, tuple:options.tuple, phase:options.phase, candidateId:options.candidateId, candidatePackageSha256:options.candidatePackageSha256, packageIdentity:{archiveSha256:digest(packageBytes), archiveGitHead:installedPackage.gitHead, declaredPackedCli:options.packedCli, installedCli, sharedRuntimeReceiptSha256:options.runtime?.receipt.sha256, sharedRuntimeRoot:options.runtime?.root, candidatePackageJsonSha256:digest(candidatePackageJsonBytes), installedPackageJsonSha256:digest(installedPackageBytes), declaredCandidateExecutableSha256:options.candidateExecutableSha256, candidateExecutableSha256:candidateExecutable.sha256, candidateExecutableReceiptSha256:options.candidateExecutableReceipt.sha256, candidateExecutableReceiptId:candidateReceipt.receiptId, candidateExecutableReceiptIssuer:candidateReceipt.issuer, candidateExecutableFiles:candidateExecutable.files, candidateTreeManifestCandidateId:candidateTreeManifest.candidateId, candidateTreeManifestSha256:candidateTreeManifest.sha256, candidateTreeObjectId:candidateTreeManifest.tree}, startedAt, endedAt:undefined, cleanContext:context, observations, observationEvidence, evidence, checkpointReceipts, finalResult:{status:"passed", aggregation:"verified-checkpoint-receipts-only", chunks:checkpointReceipts.length, checkpointReceiptSha256s:checkpointReceipts.map((receipt) => receipt.sha256)}, timings, performance, rendered:{execution:"packed-public-cli-built-studio-rendered-controls", viewports:options.tuple ? [options.tuple.viewport] : ["wide", "compact", "narrow"], responsive, measurements, defects, actions, recovery:Object.fromEntries(Object.entries(recovery).map(([name, observed]) => [name, {observed, evidenceId:recoveryEvidenceId}])), jobs:{success:{observed:simulationTerminal.status === "completed", evidenceId:recoveryEvidenceId}, actionableFailure:{observed:failure.response.status === 400, evidenceId:recoveryEvidenceId}, cooperativeCancellation:{observed:cancelledTerminal.status === "cancelled", evidenceId:recoveryEvidenceId}, retryWithoutPartialArtifacts:{observed:retryTerminal.status === "completed" && cancelledTerminal.status === "cancelled" && !reports.payload.some((report) => report?.id === cancellable.payload.id), evidenceId:recoveryEvidenceId, receipt:retryReceipt}, restartRecovery:{observed:restartReceipt.terminal.status === "recovery-required", evidenceId:recoveryEvidenceId, receipt:restartReceipt}}}};
        if (options.tuple) audit.workflowScope = workflowScope;
        }
    } catch (error) { thrown = error; } finally { cdp?.close(); const drains = []; for (const owner of ownership.slice().reverse()) { try { if (!owner.settled) { clearInterval(owner.descendantSampler); if (owner.resourceId) releaseP805BrowserOwner(owner); let ownershipError; try { owner.tracker?.capture({final:true}); } catch (error) { ownershipError = error; } for (const [pid, identity] of descendants(owner.pid)) owner.ownedProcesses.set(pid, identity); owner.drain = await drainProcessTree(owner.child, 5_000, owner.tracker?.ownedProcesses ?? owner.ownedProcesses, owner.tracker?.ownedResources); if (!owner.drain.processTreeDrained || !owner.drain.resourcesDrained) fail(`owned ${owner.label} resources could not be drained`); if (ownershipError) throw ownershipError; } } catch (error) { owner.drain = {processTreeDrained:false, resourcesDrained:false, error:String(error)}; thrown ??= error; } finally { owner.tracker?.stop(); } delete owner.child; delete owner.ownedProcesses; delete owner.tracker; delete owner.descendantSampler; delete owner.resourceRegistrySecret; delete owner.operationId; drains.push(owner.drain); } await services.rm(base, {recursive:true, force:true}); const cleanup = {kind:"p8-05-cleanup", exit:thrown ? "error" : "success", processTreeDrained:drains.every((drain) => drain.processTreeDrained === true), resourcesDrained:drains.every((drain) => drain.resourcesDrained === true), contextRemoved:!services.exists(base), ownership}; const cleanupEvidenceId = await save("cleanup", "cleanup.json", JSON.stringify(cleanup), audit?.observations ?? []); if (audit) { audit.cleanup = {...cleanup, evidenceId:cleanupEvidenceId}; audit.finalResult.cleanupEvidenceId = cleanupEvidenceId; const restartReceipt = audit.rendered?.jobs?.restartRecovery?.receipt; if (restartReceipt) restartReceipt.evidence = {...restartReceipt.evidence, cleanupEvidenceId}; audit.endedAt = services.now(); } else if (thrown && typeof thrown === "object") { thrown.cleanupEvidenceId = cleanupEvidenceId; thrown.cleanup = cleanup; } if (options.tupleCleanupPath) { const tupleCleanup = {schemaVersion:1, kind:"p8-05-packed-tuple-cleanup", phase:options.phase, candidateId:options.candidateId, candidatePackageSha256:options.candidatePackageSha256, tuple:options.tuple, worker, cleanup, cleanupEvidenceId}; const contents = `${JSON.stringify(tupleCleanup)}\n`; await services.mkdir(path.dirname(options.tupleCleanupPath), {recursive:true}); await writeImmutableReceipt(options.tupleCleanupPath, contents, services); publishedTupleCleanup = {cleanupEvidenceId, sha256:digest(contents)}; } }
    if (thrown) throw thrown;
    const measuredDefects = new Map();
    const retainDefect = (kind, evidenceId) => measuredDefects.set(`${kind}/${evidenceId}`, {kind, evidenceId});
    const logId = audit.evidence.find((item) => item.kind === "browser-log")?.evidenceId, timingId = audit.evidence.find((item) => item.kind === "timing")?.evidenceId;
    for (const defect of audit.rendered.defects) retainDefect(defect.kind, defect.kind === "console" || defect.kind === "request" ? logId : defect.kind === "performance" ? timingId : defect.evidenceId);
    for (const action of audit.rendered.actions) {
        if (action.inaccessiblePrimaryActions > 0) retainDefect("accessibility", action.evidenceId);
        if (action.overflow) retainDefect("overflow", action.evidenceId);
        if (action.accessibility.namedRegions.length === 0) retainDefect("named-region", action.evidenceId);
        if (!action.accessibility.visibleFocus) retainDefect("focus", action.evidenceId);
        if (action.accessibility.unexplainedDisabledControls > 0) retainDefect("disabled-control", action.evidenceId);
    }
    audit.rendered.defects = [...measuredDefects.values()];
    try { validateP805RenderedPersonaAudit(audit); }
    catch (error) { process.stderr.write(`P805_INVALID_TUPLE_ACTION ${JSON.stringify(audit?.rendered?.actions?.[0])}\n`); throw error; }
    if (options.tupleReceiptPath) {
        if (!pendingTupleReceipt || !publishedTupleCleanup || audit.checkpointReceipts.length !== 1 || audit.rendered.actions.length !== 1) fail(`tuple ${options.tuple.persona}/${options.tuple.observation}/${options.tuple.viewport} did not complete exactly one cleaned rendered workflow`);
        const tupleReceipt = {...pendingTupleReceipt, cleanupEvidenceId:publishedTupleCleanup.cleanupEvidenceId, cleanupSha256:publishedTupleCleanup.sha256};
        await services.mkdir(path.dirname(options.tupleReceiptPath), {recursive:true});
        await writeImmutableReceipt(options.tupleReceiptPath, `${JSON.stringify(tupleReceipt, null, 2)}\n`, services);
    }
    return audit;
}
const tupleFileStem = ({persona, observation, viewport}) => `${persona}--${observation.replaceAll(/[^a-z0-9]+/gi, "-")}--${viewport}`;
function tupleFailureKind(error, child) {
    const message = String(error);
    if (/cancel/i.test(message)) return "cancellation";
    if (!child?.pid) return /restart would reuse an immutable tuple artifact/.test(message) ? "restart" : "spawn-failure";
    if (/parent cleanup failed after worker success|detached descendant/i.test(message)) return "detached-descendant";
    return /timeout|exceeded/i.test(message) ? "timeout" : "failure";
}
async function readChildTupleReceipt(receiptPath, cleanupPath, expected, childPid) {
    let receiptBytes, cleanupBytes, receipt, cleanup;
    try { [receiptBytes, cleanupBytes] = await Promise.all([readFile(receiptPath), readFile(cleanupPath)]); receipt = JSON.parse(receiptBytes.toString("utf8")); cleanup = JSON.parse(cleanupBytes.toString("utf8")); }
    catch { fail(`packed ${expected.persona}/${expected.observation}/${expected.viewport} child did not publish its tuple receipt and cleanup record`); }
    const checkpoint = receipt?.checkpointReceipt, action = receipt?.action;
    if (receipt?.schemaVersion !== 1 || receipt.kind !== "p8-05-packed-tuple-receipt" || receipt.status !== "passed" || receipt.phase !== expected.phase || receipt.candidateId !== expected.candidateId || receipt.candidatePackageSha256 !== expected.candidatePackageSha256 || JSON.stringify(receipt.tuple) !== JSON.stringify(expected.tuple) || receipt.worker?.pid !== childPid || !receipt.auditId || !checkpoint || checkpoint.persona !== expected.persona || checkpoint.observation !== expected.observation || checkpoint.viewport !== expected.viewport || checkpoint.candidateId !== expected.candidateId || checkpoint.candidatePackageSha256 !== expected.candidatePackageSha256 || checkpoint.workerPid !== childPid || checkpoint.actionSha256 !== digest(JSON.stringify(action)) || cleanup?.schemaVersion !== 1 || cleanup.kind !== "p8-05-packed-tuple-cleanup" || cleanup.phase !== expected.phase || cleanup.candidateId !== expected.candidateId || cleanup.candidatePackageSha256 !== expected.candidatePackageSha256 || JSON.stringify(cleanup.tuple) !== JSON.stringify(expected.tuple) || cleanup.worker?.pid !== childPid || cleanup.cleanup?.exit !== "success" || cleanup.cleanup?.processTreeDrained !== true || cleanup.cleanup?.resourcesDrained !== true || cleanup.cleanup?.contextRemoved !== true || !cleanup.cleanupEvidenceId || receipt.cleanupEvidenceId !== cleanup.cleanupEvidenceId || receipt.cleanupSha256 !== digest(cleanupBytes)) fail(`packed ${expected.persona}/${expected.observation}/${expected.viewport} child receipt is stale, substituted, or lacks cleanup`);
    return {receipt, cleanup, receiptPath:path.basename(receiptPath), receiptSha256:digest(receiptBytes), cleanupPath:path.basename(cleanupPath), cleanupSha256:digest(cleanupBytes)};
}
async function readChildAudit(output, phase, persona, candidateId, candidatePackageSha256, childPid, tuple) {
    const auditPath = path.join(output, tuple ? `${phase}-${tupleFileStem(tuple)}-audit.json` : `${phase}-${persona}-audit.json`);
    let bytes, audit;
    try { bytes = await readFile(auditPath); audit = JSON.parse(bytes.toString("utf8")); }
    catch { fail(`packed ${persona} worker did not publish its immutable audit receipt`); }
    if (audit?.persona !== persona || audit?.phase !== phase || audit?.candidateId !== candidateId || audit?.candidatePackageSha256 !== candidatePackageSha256 || audit?.worker?.pid !== childPid || !Array.isArray(audit?.workflowPersonas) || audit.workflowPersonas.length !== 1 || audit.workflowPersonas[0] !== persona || (tuple && JSON.stringify(audit.tuple) !== JSON.stringify(tuple))) fail(`packed ${persona} worker receipt is stale, cross-candidate, or not owned by its spawned process`);
    validateP805RenderedPersonaAudit(audit);
    const receiptIds = new Set(), receiptPaths = new Set(), receiptHashes = new Set();
    for (const receipt of audit.checkpointReceipts ?? []) {
        const target = path.resolve(output, receipt?.path ?? "");
        if (!target.startsWith(`${path.resolve(output)}${path.sep}`) || receiptIds.has(receipt.receiptId) || receiptPaths.has(receipt.path) || receiptHashes.has(receipt.sha256)) fail(`packed ${persona} worker has duplicate or escaping checkpoint receipts`);
        let contents, checkpoint;
        try { contents = await readFile(target); checkpoint = JSON.parse(contents.toString("utf8")); }
        catch { fail(`packed ${persona} worker checkpoint receipt is unreadable`); }
        const action = audit.rendered.actions.find((value) => value?.persona === receipt.persona && value?.observation === receipt.observation && value?.viewport === receipt.viewport);
        if (digest(contents) !== receipt.sha256 || checkpoint?.kind !== "p8-05-packed-workflow-checkpoint" || checkpoint.auditId !== audit.auditId || checkpoint.worker?.pid !== childPid || checkpoint.candidateId !== candidateId || checkpoint.candidatePackageSha256 !== candidatePackageSha256 || !action || receipt.actionSha256 !== digest(JSON.stringify(action)) || JSON.stringify(checkpoint.action) !== JSON.stringify(action)) fail(`packed ${persona} worker checkpoint does not bind its rendered action and candidate`);
        receiptIds.add(receipt.receiptId); receiptPaths.add(receipt.path); receiptHashes.add(receipt.sha256);
    }
    return {audit, auditPath:path.basename(auditPath), auditSha256:digest(bytes)};
}

/**
 * Revalidate the handoff at the parent-owned scheduler boundary.  The file
 * readers above verify bytes on disk, but the scheduler must not turn an
 * injected reader (used by deterministic negative coverage) into authority
 * for a semantic receipt.  This deliberately repeats the identity fields
 * which bind a child, its single rendered checkpoint, and its cleanup into
 * one atomic tuple acceptance.
 */
function validateParentTupleHandoff(tupleReceipt, published, expected, childPid) {
    const receipt = tupleReceipt?.receipt, cleanup = tupleReceipt?.cleanup, audit = published?.audit, checkpoint = receipt?.checkpointReceipt, auditCheckpoint = audit?.checkpointReceipts?.[0], action = audit?.rendered?.actions?.[0];
    const sameTuple = (value) => JSON.stringify(value) === JSON.stringify(expected.tuple);
    if (!receipt || receipt.schemaVersion !== 1 || receipt.kind !== "p8-05-packed-tuple-receipt" || receipt.status !== "passed" || receipt.phase !== expected.phase || receipt.candidateId !== expected.candidateId || receipt.candidatePackageSha256 !== expected.candidatePackageSha256 || !sameTuple(receipt.tuple) || receipt.worker?.pid !== childPid || !receipt.auditId || !checkpoint || checkpoint.persona !== expected.persona || checkpoint.observation !== expected.observation || checkpoint.viewport !== expected.viewport || checkpoint.candidateId !== expected.candidateId || checkpoint.candidatePackageSha256 !== expected.candidatePackageSha256 || checkpoint.workerPid !== childPid || checkpoint.actionSha256 !== digest(JSON.stringify(receipt.action)) || !sha(tupleReceipt.receiptSha256) || !sha(tupleReceipt.cleanupSha256)) fail(`packed ${expected.persona}/${expected.observation}/${expected.viewport} parent rejected a missing, stale, cross-candidate, cross-persona, or cross-viewport tuple receipt`);
    if (!cleanup || cleanup.schemaVersion !== 1 || cleanup.kind !== "p8-05-packed-tuple-cleanup" || cleanup.phase !== expected.phase || cleanup.candidateId !== expected.candidateId || cleanup.candidatePackageSha256 !== expected.candidatePackageSha256 || !sameTuple(cleanup.tuple) || cleanup.worker?.pid !== childPid || cleanup.cleanup?.exit !== "success" || cleanup.cleanup?.processTreeDrained !== true || cleanup.cleanup?.resourcesDrained !== true || cleanup.cleanup?.contextRemoved !== true || !cleanup.cleanupEvidenceId || receipt.cleanupEvidenceId !== cleanup.cleanupEvidenceId || receipt.cleanupSha256 !== tupleReceipt.cleanupSha256) fail(`packed ${expected.persona}/${expected.observation}/${expected.viewport} parent rejected a missing or substituted cleanup receipt`);
    if (!audit || audit.persona !== expected.persona || audit.phase !== expected.phase || audit.candidateId !== expected.candidateId || audit.candidatePackageSha256 !== expected.candidatePackageSha256 || audit.worker?.pid !== childPid || !Array.isArray(audit.workflowPersonas) || audit.workflowPersonas.length !== 1 || audit.workflowPersonas[0] !== expected.persona || !sameTuple(audit.tuple) || !Array.isArray(audit.checkpointReceipts) || audit.checkpointReceipts.length !== 1 || !Array.isArray(audit.rendered?.actions) || audit.rendered.actions.length !== 1 || !auditCheckpoint || !action || audit.auditId !== receipt.auditId || auditCheckpoint.receiptId !== checkpoint.receiptId || auditCheckpoint.persona !== expected.persona || auditCheckpoint.observation !== expected.observation || auditCheckpoint.viewport !== expected.viewport || auditCheckpoint.candidateId !== expected.candidateId || auditCheckpoint.candidatePackageSha256 !== expected.candidatePackageSha256 || auditCheckpoint.workerPid !== childPid || auditCheckpoint.sha256 !== checkpoint.sha256 || auditCheckpoint.actionSha256 !== checkpoint.actionSha256 || JSON.stringify(action) !== JSON.stringify(receipt.action) || audit.cleanup?.evidenceId !== cleanup.cleanupEvidenceId) fail(`packed ${expected.persona}/${expected.observation}/${expected.viewport} parent rejected a duplicate, stale, or substituted semantic receipt`);
}

/**
 * Parent-owned proof ledger.  The parent deliberately never imports or calls
 * a persona workflow: it installs and authenticates one immutable candidate
 * runtime, then every audit is a fresh Node worker with its own user context
 * which launches that runtime's public CLI and rendered Studio.
 */
export async function runP805ProcessIsolatedPackedProof(options, dependencies = {}) {
    if (!validProcessProofOptions(options)) fail("process-isolated runner configuration is incomplete");
    // These boundaries are injectable only for deterministic parent-ledger
    // tests.  The public command always uses the real packed worker, receipt
    // reader, and process-tree drainer below.
    const services = {spawn, chmod, link, mkdir, readFile, readdir, rm, stat, writeFile, now, childResult, readChildTupleReceipt, readChildAudit, createTupleSupervisor:createP805TupleSupervisor, cleanupChild:(child, kind, supervisor) => supervisor.cleanup(child, kind), validateSharedRuntime:trustedSharedRuntime, exists:existsSync, ...nativeNpmCommand(), prepareRuntime:prepareP805SharedRuntime, ...dependencies}, parent = {pid:process.pid, processIdentity:processIdentity(process.pid), nonce:digest(`${services.now()}:${options.phase}:${Math.random()}`).slice(0, 16), startedAt:services.now()}, audits = [], children = [], acceptedReceipts = [], receiptHashes = new Set(), immutableReceiptHashes = new Set(), workerPids = new Set(), tuples = dependencies.tuples ?? P805_PERSONAS.flatMap((persona) => P805_REQUIRED_OBSERVATIONS[persona].flatMap((observation) => ["wide", "compact", "narrow"].map((viewport) => ({persona, observation, viewport}))));
    await services.mkdir(options.output, {recursive:true});
    let runtime;
    const revalidateAcceptedReceipts = async () => {
        const validations = [];
        for (const [index, accepted] of acceptedReceipts.entries()) {
            const child = children[index], tuple = child.tuple, expected = {phase:options.phase, candidateId:options.candidateId, candidatePackageSha256:options.candidatePackageSha256, ...tuple, tuple};
            try {
                const current = await services.readChildTupleReceipt(path.join(options.output, child.tupleReceiptPath), path.join(options.output, child.cleanupPath), expected, child.worker.pid);
                const published = await services.readChildAudit(options.output, options.phase, tuple.persona, options.candidateId, options.candidatePackageSha256, child.worker.pid, tuple);
                validateParentTupleHandoff(current, published, expected, child.worker.pid);
                if (current.receiptSha256 !== child.tupleReceiptSha256 || current.cleanupSha256 !== child.cleanupSha256 || published.auditSha256 !== child.auditSha256 || !isDeepStrictEqual(current.receipt, accepted.receipt) || !isDeepStrictEqual(current.cleanup, accepted.cleanup) || !isDeepStrictEqual(published.audit, audits[index])) fail("accepted immutable tuple receipts changed after acceptance");
                validations.push({tuple, status:"verified", tupleReceiptSha256:current.receiptSha256, cleanupSha256:current.cleanupSha256, auditSha256:published.auditSha256});
            } catch (error) { validations.push({tuple, status:"rejected", error:String(error)}); }
        }
        return {checkedAt:services.now(), status:validations.every(({status}) => status === "verified") ? "verified" : "rejected", receipts:validations};
    };
    const publishFailure = async (failedTuple, error, attemptedChild, initialAcceptedReceiptValidation) => {
        // Keep the exact accepted objects even if a later worker damaged their
        // files. Re-read and authenticate them before releasing the runtime.
        const acceptedReceiptValidation = await revalidateAcceptedReceipts();
        let terminal;
        if (failedTuple) {
            const prefix = `${options.phase}-${tupleFileStem(failedTuple)}-supervisor-${parent.nonce}`, cleanupPath = `${prefix}-cleanup.json`, terminalPath = `${prefix}-terminal.json`, cleanup = {schemaVersion:1, kind:"p8-05-supervisor-tuple-cleanup", phase:options.phase, candidateId:options.candidateId, candidatePackageSha256:options.candidatePackageSha256, parent, tuple:failedTuple, worker:attemptedChild.worker, failureKind:attemptedChild.failureKind, cleanup:attemptedChild.cleanup}, contents = `${JSON.stringify(cleanup, null, 2)}\n`;
            await writeImmutableReceipt(path.join(options.output, cleanupPath), contents);
            const drained = attemptedChild.cleanup.authenticated === true && attemptedChild.cleanup.processTreeDrained === true && attemptedChild.cleanup.resourcesDrained === true;
            terminal = {schemaVersion:1, kind:"p8-05-supervisor-tuple-terminal", status:drained ? "failed-and-drained" : "cleanup-incomplete", phase:options.phase, candidateId:options.candidateId, candidatePackageSha256:options.candidatePackageSha256, parent, tuple:failedTuple, worker:attemptedChild.worker, failureKind:attemptedChild.failureKind, cleanupPath, cleanupSha256:digest(contents), initialAcceptedReceiptValidation, acceptedReceiptValidation};
            const terminalContents = `${JSON.stringify(terminal, null, 2)}\n`;
            await writeImmutableReceipt(path.join(options.output, terminalPath), terminalContents);
            terminal = {path:terminalPath, sha256:digest(terminalContents), status:terminal.status};
        }
        let runtimeCleanup;
        try { runtimeCleanup = await releaseP805SharedRuntime(runtime, services); } catch (cleanupError) { runtimeCleanup = {root:runtime?.root, removed:false, error:String(cleanupError)}; }
        const failure = {schemaVersion:1, kind:"p8-05-process-isolated-packed-proof", phase:options.phase, candidateId:options.candidateId, candidatePackageSha256:options.candidatePackageSha256, parent, status:"failed", failedTuple, acceptedReceipts, initialAcceptedReceiptValidation, acceptedReceiptValidation, children, attemptedChild, terminal, finalResult:{status:"failed", children:children.length, acceptedReceipts:acceptedReceipts.length, aggregation:"no-complete-tuple-aggregate-on-failure", runtimeCleanup}, failure:{message:error instanceof Error ? error.message : String(error), cleanup:attemptedChild?.cleanup ?? "not-spawned"}};
        await writeImmutableReceipt(path.join(options.output, `${options.phase}-process-isolated-packed-proof.failed-${parent.nonce}.json`), `${JSON.stringify(failure, null, 2)}\n`);
    };
    const completedLedgerPath = path.join(options.output, `${options.phase}-process-isolated-packed-proof.json`);
    if (existsSync(completedLedgerPath)) {
        const error = new Error("a complete tuple aggregate already exists; restarted parents cannot replace or supplement it");
        await publishFailure(undefined, error);
        throw error;
    }
    try { runtime = await services.prepareRuntime(options, parent, services); }
    catch (error) { await publishFailure(undefined, error); throw error; }
    for (const tuple of tuples) {
        const childStartedAt = services.now(), stem = tupleFileStem(tuple), receiptPath = path.join(options.output, `${options.phase}-${stem}-tuple-receipt.json`), cleanupPath = path.join(options.output, `${options.phase}-${stem}-tuple-cleanup.json`), args = [fileURLToPath(import.meta.url), "--persona", tuple.persona, "--workflow-personas", tuple.persona, "--observation", tuple.observation, "--viewport", tuple.viewport, "--tuple-receipt", receiptPath, "--tuple-cleanup", cleanupPath, "--phase", options.phase, "--candidate", options.candidateId, "--package-sha256", options.candidatePackageSha256, "--candidate-executable-sha256", options.candidateExecutableSha256, "--candidate-executable-receipt", options.candidateExecutableReceipt.path, "--candidate-executable-receipt-sha256", options.candidateExecutableReceipt.sha256, "--packed-package", options.packedPackage, "--packed-cli", options.packedCli, "--runtime-root", runtime.root, "--runtime-identity-receipt", runtime.receipt.path, "--runtime-identity-receipt-sha256", runtime.receipt.sha256, "--output", options.output];
        let child, result, attemptedChild, supervisor, worker;
        try {
            supervisor = await services.createTupleSupervisor(options, tuple, parent.nonce, services);
            const auditPath = path.join(options.output, `${options.phase}-${stem}-audit.json`);
            if ([receiptPath, cleanupPath, auditPath].some((target) => services.exists(target))) fail(`packed ${tuple.persona}/${tuple.observation}/${tuple.viewport} restart would reuse an immutable tuple artifact`);
            if (dependencies.signal?.aborted) throw new Error("tuple workflow cancelled before spawn");
            child = services.spawn(process.execPath, args, {cwd:root, env:supervisor.env, detached:process.platform !== "win32", stdio:"pipe"});
            worker = child?.pid ? {pid:child.pid, processIdentity:processIdentity(child.pid)} : undefined;
            supervisor.attach(child);
            result = await services.childResult(child, `packed ${tuple.persona}/${tuple.observation}/${tuple.viewport} workflow worker`, 0, dependencies.tupleTimeoutMs ?? 4_500_000, dependencies.signal, false);
            // A worker's own cleanup receipt is necessary but not sufficient:
            // the parent also drains the process identity it spawned before
            // accepting that tuple or advancing the ledger.  This covers a
            // detached descendant surviving a seemingly normal child exit.
            const parentCleanup = await services.cleanupChild(child, "success", supervisor);
            if (parentCleanup.authenticated !== true || !parentCleanup.processTreeDrained || !parentCleanup.resourcesDrained) fail(`packed ${tuple.persona}/${tuple.observation}/${tuple.viewport} parent cleanup failed after worker success`);
            const tupleReceipt = await services.readChildTupleReceipt(receiptPath, cleanupPath, {phase:options.phase, candidateId:options.candidateId, candidatePackageSha256:options.candidatePackageSha256, persona:tuple.persona, observation:tuple.observation, viewport:tuple.viewport, tuple}, child.pid);
            const published = await services.readChildAudit(options.output, options.phase, tuple.persona, options.candidateId, options.candidatePackageSha256, child.pid, tuple);
            // Re-authenticate the immutable parent runtime after the child has
            // exited, before accepting any semantic receipt.  A child may use
            // it but cannot replace, mutate, or merely relabel it between its
            // own startup validation and the parent's ledger advancement.
            await services.validateSharedRuntime({root:runtime.root, receipt:runtime.receipt}, options, services);
            const expectedRuntimeCli = path.join(runtime.root, "node_modules", ".bin", process.platform === "win32" ? "pokie.cmd" : "pokie"), reportedRuntimeReceipt = published.audit.packageIdentity?.sharedRuntimeReceiptSha256, reportedRuntimeRoot = published.audit.packageIdentity?.sharedRuntimeRoot;
            // The child may not merely repeat a parent-owned receipt pointer:
            // its recorded public launcher must resolve inside the one runtime
            // the parent authenticated both before and after the child run.
            // The child must name both parent-owned identity receipts.  An
            // omitted field is not a backward-compatible projection here: it
            // leaves the aggregate unable to prove which immutable runtime
            // supplied this tuple's public launcher.
            if (published.audit.packageIdentity?.installedCli !== expectedRuntimeCli || reportedRuntimeReceipt !== runtime.receipt.sha256 || reportedRuntimeRoot !== runtime.root) fail(`packed ${tuple.persona}/${tuple.observation}/${tuple.viewport} child substituted the parent immutable runtime identity (launcher ${published.audit.packageIdentity?.installedCli ?? "missing"}/${expectedRuntimeCli}, receipt ${reportedRuntimeReceipt ?? "missing"}/${runtime.receipt.sha256}, root ${reportedRuntimeRoot ?? "missing"}/${runtime.root})`);
            const checkpoint = published.audit.checkpointReceipts.find((value) => value.receiptId === tupleReceipt.receipt.checkpointReceipt.receiptId);
            validatePackedTupleAction(tupleReceipt.receipt.action, tuple);
            validatePackedTupleAction(published.audit.rendered.actions.find((value) => value.persona === tuple.persona && value.observation === tuple.observation && value.viewport === tuple.viewport), tuple);
            validateParentTupleHandoff(tupleReceipt, published, {phase:options.phase, candidateId:options.candidateId, candidatePackageSha256:options.candidatePackageSha256, persona:tuple.persona, observation:tuple.observation, viewport:tuple.viewport, tuple}, child.pid);
            if (published.audit.rendered.actions.length !== 1 || published.audit.checkpointReceipts.length !== 1 || !checkpoint || checkpoint.workerPid !== child.pid || tupleReceipt.receipt.auditId !== published.audit.auditId || checkpoint.sha256 !== tupleReceipt.receipt.checkpointReceipt.sha256 || checkpoint.actionSha256 !== tupleReceipt.receipt.checkpointReceipt.actionSha256 || JSON.stringify(tupleReceipt.receipt.action) !== JSON.stringify(published.audit.rendered.actions.find((value) => value.persona === tuple.persona && value.observation === tuple.observation && value.viewport === tuple.viewport)) || tupleReceipt.cleanup.cleanupEvidenceId !== published.audit.cleanup.evidenceId || tupleReceipt.receipt.cleanupEvidenceId !== tupleReceipt.cleanup.cleanupEvidenceId || tupleReceipt.receipt.cleanupSha256 !== tupleReceipt.cleanupSha256) fail(`packed ${tuple.persona}/${tuple.observation}/${tuple.viewport} child receipts do not bind the accepted rendered checkpoint, audit, and cleanup`);
            if (workerPids.has(published.audit.worker.pid) || published.audit.worker.pid === parent.pid) fail(`packed ${tuple.persona} worker process identity is not isolated`);
            workerPids.add(published.audit.worker.pid);
            for (const receipt of published.audit.checkpointReceipts) {
                if (receiptHashes.has(receipt.sha256)) fail(`packed ${tuple.persona} worker substituted content-equivalent checkpoint evidence`);
                receiptHashes.add(receipt.sha256);
            }
            for (const [kind, sha256] of [["audit", published.auditSha256], ["tuple receipt", tupleReceipt.receiptSha256], ["tuple cleanup", tupleReceipt.cleanupSha256], ...published.audit.checkpointReceipts.map((receipt) => ["checkpoint", receipt.sha256])]) {
                if (immutableReceiptHashes.has(sha256)) fail(`packed ${tuple.persona}/${tuple.observation}/${tuple.viewport} child substituted content-equivalent ${kind} evidence`);
                immutableReceiptHashes.add(sha256);
            }
            // Snapshot the same JSON representation that crosses the public
            // receipt boundary; later readers cannot mutate accepted objects.
            audits.push(JSON.parse(JSON.stringify(published.audit)));
            acceptedReceipts.push(JSON.parse(JSON.stringify({tuple, ...tupleReceipt})));
            children.push({tuple, worker:published.audit.worker, auditPath:published.auditPath, auditSha256:published.auditSha256, tupleReceiptPath:tupleReceipt.receiptPath, tupleReceiptSha256:tupleReceipt.receiptSha256, cleanupPath:tupleReceipt.cleanupPath, cleanupSha256:tupleReceipt.cleanupSha256, checkpointReceiptSha256s:published.audit.checkpointReceipts.map((receipt) => receipt.sha256), cleanupEvidenceId:published.audit.cleanup.evidenceId, parentCleanup, startedAt:childStartedAt, endedAt:services.now(), exitCode:result.exitCode, signal:result.signal});
        }
        catch (error) {
            let cleanup;
            const failureKind = tupleFailureKind(error, child);
            const initialAcceptedReceiptValidation = await revalidateAcceptedReceipts();
            try { cleanup = supervisor ? await services.cleanupChild(child, failureKind, supervisor) : {processTreeDrained:true, resourcesDrained:true, termination:"not-started"}; } catch (drainError) { cleanup = {processTreeDrained:false, resourcesDrained:false, error:String(drainError)}; }
            attemptedChild = {tuple, worker, startedAt:childStartedAt, endedAt:services.now(), exitCode:result?.exitCode ?? child?.exitCode ?? null, signal:result?.signal ?? child?.signalCode ?? null, cleanup:cleanup ?? {processTreeDrained:false, resourcesDrained:false, status:"cleanup-not-run"}, failureKind};
            await publishFailure(tuple, error, attemptedChild, initialAcceptedReceiptValidation);
            fail(`packed ${tuple.persona}/${tuple.observation}/${tuple.viewport} workflow worker failed after preserving ${acceptedReceipts.length} accepted tuple receipts: ${error instanceof Error ? error.message : String(error)}`);
        }
        finally { supervisor?.stop(); }
    }
    const acceptedReceiptValidation = await revalidateAcceptedReceipts();
    if (acceptedReceiptValidation.status !== "verified") {
        const error = new Error("accepted immutable tuple receipts failed final revalidation");
        await publishFailure(undefined, error);
        throw error;
    }
    // A successful aggregate retains its sealed installation as inspectable
    // evidence for the runtime receipt.  The caller owns its output directory
    // and removes it after verification; failure paths still drain it here.
    const runtimeCleanup = await releaseP805SharedRuntime(runtime, services, true);
    // The parent may only certify receipts which it wrote below this one
    // controller-owned namespace. Persist the root so a later controller
    // cannot replay an otherwise-valid ledger from a sibling output root.
    const ledger = {schemaVersion:1, kind:"p8-05-process-isolated-packed-proof", operationRoot:path.resolve(options.output), phase:options.phase, candidateId:options.candidateId, candidatePackageSha256:options.candidatePackageSha256, parent, runtime:{kind:runtime.value?.kind, root:runtime.root, receiptPath:path.basename(runtime.receipt.path), receiptSha256:runtime.receipt.sha256, candidateId:runtime.value?.candidateId, candidatePackageSha256:runtime.value?.candidatePackageSha256, candidateExecutableSha256:runtime.value?.candidateExecutableSha256, archiveSha256:runtime.value?.archiveSha256, installationCount:runtime.value?.installation?.count ?? 1, permissions:"read-only-before-any-tuple-child"}, status:"passed", children, acceptedReceipts, acceptedReceiptValidation, finalResult:{status:"passed", children:children.length, checkpointReceipts:receiptHashes.size, aggregation:"independently-verified-immutable-tuple-child-receipts-only", runtimeCleanup}};
    await writeImmutableReceipt(path.join(options.output, `${options.phase}-process-isolated-packed-proof.json`), `${JSON.stringify(ledger, null, 2)}\n`);
    return {ledger, audits};
}
async function main(argv = process.argv) { const options = optionsFrom(argv); if (options.persona === "all") { const proof = await runP805ProcessIsolatedPackedProof(options); process.stdout.write(`P805_VALERA_PROCESS_ISOLATED_PROOF_PASS phase=${proof.ledger.phase}\n`); return; } const audit = await runP805ValeraBrowserAudit(options), name = options.tuple ? `${options.phase}-${tupleFileStem(options.tuple)}-audit.json` : `${options.phase}-${options.persona}-audit.json`; await writeImmutableReceipt(path.join(options.output, name), `${JSON.stringify(audit, null, 2)}\n`); process.stdout.write(`P805_VALERA_AUDIT_PASS persona=${audit.persona} phase=${audit.phase}\n`); }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().then(() => process.exit(0)).catch((error) => { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1; });
