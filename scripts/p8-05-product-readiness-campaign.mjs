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
export const P805_REQUIRED_EVIDENCE_KINDS = ["screenshot", "page-state", "cli-transcript", "browser-log", "api-log", "error", "timing", "reproduction", "artifact", "cleanup"];
export const P805_REQUIRED_OBSERVATIONS = {
    mathematician:["blueprint", "par-xlsx-round-trip", "reels-paytable-modes-mechanics", "simulation-success-failure-cancellation", "simulation-rtp-volatility-features", "outcome-library-report-diff-replay", "replay-artifact-success-failure-recovery", "certification-fairness-conditional", "build-export-output-folder", "import-export-defaults"],
    programmer:["packed-install", "npx-pokie", "recursive-help", "create-build-inspect", "validate-sim-report-diff-replay-serve-wasm", "spaces-invalid-inputs-exit-codes-ci-recovery", "build-export-output-folder"],
    producer:["product-framing", "end-to-end-navigation", "trust"],
    "ui-ux":["onboarding-terminology-forms-progress", "reload-reconnect-recovery-cancellation-project-switch", "keyboard-responsive-accessibility"],
    "graphic-designer":["hierarchy-typography-spacing-density-controls-finish"],
};
// This is an evidence contract, not a list of pages to visit.  Each audit
// observation must name the public operation that caused it, its rendered
// control, the server activity it expects to see, and the durable result that
// makes the observation useful to a first-time user.  Keeping it here lets
// the collector and the append-only validator reject a relabelled screenshot.
export const P805_WORKFLOW_CONTRACTS = {
    mathematician: {
        "blueprint": {route:"overview", control:"Overview", method:"GET", api:"/api/project/context", terminal:"project-context"},
        "par-xlsx-round-trip": {route:"gameModel", control:"Game Model", method:"POST", api:"/api/home/blueprints/par-export", body:"par-export", artifact:"xlsx", terminal:"round-trip"},
        "reels-paytable-modes-mechanics": {route:"gameModel", control:"Game Model", method:"GET", api:"/api/project/gameModel", terminal:"model-visible"},
        "simulation-success-failure-cancellation": {route:"simulation", control:"Simulation", method:"POST", api:"/api/project/simulations", body:"simulation", terminal:"cancelled-and-retry-completed"},
        "simulation-rtp-volatility-features": {route:"simulation", control:"Simulation", method:"GET", api:"/api/project/reports", artifact:"simulation-report", terminal:"report-completed"},
        "outcome-library-report-diff-replay": {route:"replay", control:"Replay", method:"GET", api:"/api/project/outcome-libraries/registry", artifact:"outcome-library", terminal:"library-visible"},
        "replay-artifact-success-failure-recovery": {route:"replay", control:"Replay", method:"POST", api:"/api/project/replays/inspect-artifact", body:"replay-artifact", artifact:"replay-descriptor", terminal:"failure-and-recovery"},
        "certification-fairness-conditional": {route:"certification", control:"Certification", method:"POST", api:"/api/project/certification/validate-source", body:"certification", terminal:"conditional-state"},
        "build-export-output-folder": {route:"exportDeploy", control:"Build/Export", method:"GET", api:"/api/project/artifacts/targets", artifact:"output-folder", terminal:"artifact-completed"},
        "import-export-defaults": {route:"overview", control:"Overview", method:"GET", api:"/api/project/context", terminal:"defaults-visible"},
    },
    programmer: {
        "packed-install": {route:"overview", control:"Overview", method:"GET", api:"/api/project/context", cli:"packed CLI install", terminal:"installed-launcher"}, "npx-pokie": {route:"overview", control:"Overview", method:"GET", api:"/api/project/context", cli:"PACKED_NPX_HELP", terminal:"npx-help"}, "recursive-help": {route:"overview", control:"Overview", method:"GET", api:"/api/project/context", cli:"packed CLI recursive help", terminal:"help"},
        "create-build-inspect": {route:"overview", control:"Overview", method:"GET", api:"/api/project/inspect", cli:"packed CLI create", artifact:"blueprint", terminal:"created-and-built"}, "validate-sim-report-diff-replay-serve-wasm": {route:"overview", control:"Overview", method:"GET", api:"/api/project/context", cli:"packed CLI WASM build", artifact:"wasm", terminal:"commands-completed"},
        "spaces-invalid-inputs-exit-codes-ci-recovery": {route:"overview", control:"Overview", method:"GET", api:"/api/project/context", cli:"packed CLI invalid-input recovery", terminal:"actionable-exit-code"}, "build-export-output-folder": {route:"exportDeploy", control:"Build/Export", method:"GET", api:"/api/project/artifacts/targets", cli:"packed CLI PAR build", artifact:"xlsx", terminal:"output-written"},
    },
    producer: {"product-framing": {route:"overview", control:"Overview", method:"GET", api:"/api/project/context", terminal:"project-context"}, "end-to-end-navigation": {route:"play", control:"Play", method:"GET", api:"/api/project/context", terminal:"navigation-visible"}, trust: {route:"certification", control:"Certification", method:"POST", api:"/api/project/certification/validate-source", body:"certification", terminal:"trust-state"}},
    "ui-ux": {"onboarding-terminology-forms-progress": {route:"overview", control:"Overview", method:"GET", api:"/api/project/context", terminal:"labels-visible"}, "reload-reconnect-recovery-cancellation-project-switch": {route:"simulation", control:"Simulation", method:"POST", api:"/api/project/simulations", body:"simulation", terminal:"recovered"}, "keyboard-responsive-accessibility": {route:"overview", control:"Overview", method:"GET", api:"/api/project/context", terminal:"keyboard-visible"}},
    "graphic-designer": {"hierarchy-typography-spacing-density-controls-finish": {route:"overview", control:"Overview", method:"GET", api:"/api/project/context", terminal:"rendered-finish"}},
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

function semanticObservation(contents, observation, persona, label) {
    let page;
    try { page = JSON.parse(contents.toString("utf8")); } catch { fail(`${label} is not parsed semantic page-state evidence`); }
    const contract = P805_WORKFLOW_CONTRACTS[persona]?.[observation];
    const modern = page.request?.method !== undefined;
    if (!contract || page.kind !== "p8-05-semantic-page-state" || page.operation !== observation || page.outcome !== contract.terminal || typeof page.route !== "string" || !["wide", "compact", "narrow"].includes(page.viewport) || !page.interaction || page.interaction.control !== contract.control || page.interaction.keyboardFocused !== true || page.interaction.keyboardActivated !== true || page.interaction.activation !== "keyboard" || page.interaction.outcome !== contract.terminal || !page.workflow || page.workflow.persona !== persona || page.workflow.source !== "rendered-control" || page.workflow.expectedApi !== contract.api || (modern && (page.workflow.expectedMethod !== contract.method || page.workflow.expectedBodyKind !== (contract.body ?? null))) || page.workflow.expectedArtifact !== (contract.artifact ?? null) || page.workflow.terminal !== contract.terminal || !page.request || page.request.path !== contract.api || (modern && (page.request.method !== contract.method || page.request.bodyKind !== (contract.body ?? null) || !sha(page.request.bodySha256) || !sha(page.request.responseSha256) || !page.terminal || page.terminal.status !== contract.terminal)) || !Number.isInteger(page.request.status) || page.request.status < 200 || page.request.status >= 400 || !page.state || typeof page.state.text !== "string" || !Array.isArray(page.state.controls) || typeof page.state.overflow !== "boolean") fail(`${label} does not prove the declared control, request body, API, artifact, and terminal outcome for ${observation}`);
}

async function validateAuditEvidence(directory, audit, expected, label, used) {
    const evidenceById = new Map();
    for (const item of audit.evidence) evidenceById.set(item.evidenceId, {item, contents:await boundedEvidence(directory, item, expected, label, {after:audit.startedAt, before:audit.endedAt, used})});
    for (const observation of P805_REQUIRED_OBSERVATIONS[audit.persona]) {
        const evidenceId = audit.observationEvidence[observation], semantic = evidenceById.get(evidenceId), action = audit.rendered.actions.find((value) => value.observation === observation);
        if (!semantic || semantic.item.kind !== "page-state" || !semantic.item.observationIds.includes(observation) || !action || action.evidenceId !== evidenceId) fail(`${label} lacks semantic evidence for ${observation}`);
        semanticObservation(semantic.contents, observation, audit.persona, `${label} ${observation}`);
        const screenshot = evidenceById.get(action.screenshotEvidenceId);
        if (!screenshot || screenshot.item.kind !== "screenshot" || !screenshot.item.observationIds.includes(observation)) fail(`${label} lacks linked screenshot evidence for ${observation}`);
    }
    const one = (kind) => [...evidenceById.values()].find((entry) => entry.item.kind === kind)?.contents;
    const text = (kind) => one(kind)?.toString("utf8") ?? "";
    let api, browser, timing, artifact;
    try { api = JSON.parse(text("api-log")); browser = JSON.parse(text("browser-log")); timing = JSON.parse(text("timing")); artifact = JSON.parse(text("artifact")); } catch { fail(`${label} has unparsed machine workflow evidence`); }
    if (!text("cli-transcript").includes("PACKED_INSTALL") || !text("cli-transcript").includes("packed CLI create") || !Array.isArray(api) || !api.some((entry) => entry?.path === "/api/health") || !Array.isArray(browser) || JSON.stringify(timing) !== JSON.stringify(audit.timings) || artifact?.candidateId !== expected.candidateId || artifact?.candidatePackageSha256 !== expected.candidatePackageSha256 || artifact?.packedPackageSha256 !== expected.candidatePackageSha256 || artifact?.candidatePackageJsonSha256 !== audit.packageIdentity.candidatePackageJsonSha256 || artifact?.installedPackageJsonSha256 !== audit.packageIdentity.installedPackageJsonSha256 || artifact?.candidateExecutableSha256 !== audit.packageIdentity.candidateExecutableSha256 || (audit.packageIdentity.candidateExecutableSha256 !== undefined && (artifact?.archiveGitHead !== expected.candidateId || audit.packageIdentity.archiveGitHead !== expected.candidateId)) || !text("reproduction").includes("Persona:") || !text("error")) fail(`${label} workflow evidence does not prove its packed CLI, Studio API, candidate binding, timing, and artifact operations`);
    for (const action of audit.rendered.actions.filter((value) => value.expectedMethod !== undefined)) {
        const contract = P805_WORKFLOW_CONTRACTS[audit.persona][action.observation];
        if (!api.some((entry) => entry?.observation === action.observation && entry.method === contract.method && entry.path === contract.api && entry.bodyKind === (contract.body ?? null) && sha(entry.bodySha256) && sha(entry.responseSha256) && entry.status >= 200 && entry.status < 400)) fail(`${label} lacks a correlated machine request for ${action.observation}`);
    }
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
    if (!record || !P805_PERSONAS.includes(record.persona) || record.phase !== phase || typeof record.auditId !== "string" || !record.auditId || !iso(record.startedAt) || !iso(record.endedAt) || Date.parse(record.startedAt) >= Date.parse(record.endedAt) || !Array.isArray(record.observations) || P805_REQUIRED_OBSERVATIONS[record.persona].some((required) => !record.observations.includes(required)) || !record.cleanContext || !path.isAbsolute(record.cleanContext.workspace) || !path.isAbsolute(record.cleanContext.configurationRoot) || !path.isAbsolute(record.cleanContext.browserProfile) || record.cleanContext.reused !== false || !Array.isArray(record.evidence) || P805_REQUIRED_EVIDENCE_KINDS.some((kind) => !record.evidence.some((item) => item?.kind === kind)) || !record.observationEvidence || typeof record.observationEvidence !== "object" || !timings || typeof timings !== "object" || timingNames.some((name) => !Number.isSafeInteger(timings[name]) || timings[name] <= 0 || timings[name] > 30 * 60 * 1000)) fail(`${phase} audit is incomplete for ${record?.persona ?? "unknown persona"}`);
    candidate(record, phase === "initial" ? initial : finalCandidate, `${phase} audit ${record.persona}`);
    validateP805RenderedPersonaAudit(record);
}

function qualityDefects(audit) {
    const measurements = audit.rendered?.measurements ?? {};
    const defects = [
        ["console", measurements.consoleExceptions], ["request", measurements.unhandledRequestFailures],
        ["accessibility", measurements.inaccessiblePrimaryActions], ["disabled-control", measurements.unexplainedDisabledControls],
        ["overflow", measurements.documentOverflow === true ? 1 : 0],
    ].filter(([, count]) => count > 0).map(([kind]) => kind);
    if (!Array.isArray(audit.rendered?.defects) || defects.some((kind) => !audit.rendered.defects.some((defect) => defect?.kind === kind && typeof defect.evidenceId === "string"))) fail(`${audit.phase} ${audit.persona} does not retain every measured browser defect as evidence`);
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
    if (initial.schemaVersion !== P805_SCHEMA_VERSION || initial.campaignId !== provenance.campaignId || !Array.isArray(initial.audits) || initial.audits.length !== P805_PERSONAS.length) fail("initial audit record must contain exactly five personas");
    unique(initial.audits, "initial audits", "persona");
    for (const audit of initial.audits) {
        auditRecord(audit, "initial", initialCandidate, finalCandidate);
        if (Date.parse(audit.startedAt) <= Date.parse(provenance.startedAt)) fail(`initial audit ${audit.persona} predates provenance`);
        for (const value of Object.values(audit.cleanContext)) if (typeof value === "string") { if (contexts.has(value)) fail(`initial audit ${audit.persona} reuses a clean context`); contexts.add(value); }
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
    for (const audit of initial.audits) for (const defect of qualityDefects(audit)) if (!frozen.findings.some((finding) => finding.persona === audit.persona && finding.publicSurface.toLowerCase().includes(defect))) fail(`initial ${audit.persona} ${defect} defect was not frozen as a finding`);
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
    for (const finding of findingRegister.findings) {
        validateFinding(finding, `finding register ${finding?.id ?? "unknown"}`);
        if (BLOCKING(finding)) {
            if (finding.status !== "resolved") fail(`release-blocking finding remains ${finding.status}: ${finding.id}`);
            const regression = regressions.regressions.find((item) => item.findingId === finding.id);
            if (!regression || typeof regression.testPath !== "string" || !regression.testPath.startsWith("tests/") || !existsSync(path.join(repositoryRoot, regression.testPath)) || regression.commitId !== finalCandidate.candidateId || regression.candidatePackageSha256 !== finalCandidate.candidatePackageSha256 || regression.result !== "passed" || !iso(regression.verifiedAt) || Date.parse(regression.verifiedAt) < Date.parse(frozen.frozenAt) || !Array.isArray(regression.assertions) || !regression.assertions.length || !regression.machineResultEvidence) fail(`resolved blocking finding ${finding.id} has no focused final-candidate regression`);
            const output = await boundedEvidence(root, regression.machineResultEvidence, finalCandidate, `regression ${finding.id}`, {after:frozen.frozenAt, used});
            let result;
            try { result = JSON.parse(output.toString("utf8")); } catch { fail(`regression ${finding.id} result evidence is not machine JSON`); }
            if (result.kind !== "p8-05-regression-result" || result.testPath !== regression.testPath || result.candidateId !== finalCandidate.candidateId || result.candidatePackageSha256 !== finalCandidate.candidatePackageSha256 || result.passed !== true || !iso(result.completedAt) || Date.parse(result.completedAt) < Date.parse(regression.verifiedAt)) fail(`regression ${finding.id} result evidence does not prove the claimed machine result`);
        }
    }
    const retests = records["retests.json"];
    if (retests.schemaVersion !== P805_SCHEMA_VERSION || retests.campaignId !== provenance.campaignId || !Array.isArray(retests.audits) || retests.audits.length !== P805_PERSONAS.length || !iso(retests.startedAt)) fail("retest record must contain exactly five personas");
    unique(retests.audits, "retests", "persona");
    if (Date.parse(retests.startedAt) <= Date.parse(frozen.frozenAt)) fail("retests started before findings were frozen");
    for (const audit of retests.audits) {
        auditRecord(audit, "retest", initialCandidate, finalCandidate);
        if (qualityDefects(audit).length) fail(`clean retest ${audit.persona} retains a browser quality defect`);
        for (const value of Object.values(audit.cleanContext)) if (typeof value === "string") { if (contexts.has(value)) fail(`retest audit ${audit.persona} reuses a clean context`); contexts.add(value); }
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
        const personaAudit = retests.audits.find((audit) => audit.persona === finding.persona);
        if (!disposition || disposition.status !== (findingRegister.findings.find((entry) => entry.id === finding.id)?.status) || disposition.retestAuditId !== personaAudit?.auditId || typeof disposition.retestEvidenceId !== "string" || !personaAudit.evidence.some((item) => item.evidenceId === disposition.retestEvidenceId)) fail(`closeout lacks verified persona retest disposition for ${finding.id}`);
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
