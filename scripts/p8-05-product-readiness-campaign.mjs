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

export const P805_SCHEMA_VERSION = 1;
export const P805_EVIDENCE_DIRECTORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "docs", "evidence", "p8-05-product-readiness");
export const P805_PERSONAS = ["mathematician", "programmer", "producer", "ui-ux", "graphic-designer"];
export const P805_REQUIRED_OBSERVATIONS = {
    mathematician:["blueprint", "par-xlsx-round-trip", "reels-paytable-modes-mechanics", "simulation-rtp-volatility-features", "outcome-library-report-diff-replay", "import-export-defaults"],
    programmer:["packed-install", "npx-pokie", "recursive-help", "create-build-inspect", "validate-sim-report-diff-replay-serve-wasm", "spaces-invalid-inputs-exit-codes-ci-recovery"],
    producer:["product-framing", "end-to-end-navigation", "trust"],
    "ui-ux":["onboarding-terminology-forms-progress", "reload-reconnect-recovery-cancellation-project-switch", "keyboard-responsive-accessibility"],
    "graphic-designer":["hierarchy-typography-spacing-density-controls-finish"],
};
const RECORDS = ["PROVENANCE.json", "initial-audits.json", "frozen-findings.json", "finding-register.json", "regressions.json", "retests.json", "closeout.json"];
const BLOCKING = (finding) => finding.severity === "P0" || finding.severity === "P1" || (finding.severity === "P2" && finding.material === true);
const sha = (value) => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
const commit = (value) => typeof value === "string" && /^[a-f0-9]{40}$/i.test(value);
const iso = (value) => typeof value === "string" && !Number.isNaN(Date.parse(value)) && /^\d{4}-\d{2}-\d{2}T/.test(value);
const digest = (contents) => createHash("sha256").update(contents).digest("hex");
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

async function boundedEvidence(directory, record, expected, label, {after, before, used} = {}) {
    if (!record || typeof record.evidenceId !== "string" || !record.evidenceId || !relative(record.path) || !sha(record.sha256) || !Number.isSafeInteger(record.sizeBytes) || record.sizeBytes < 1 || record.sizeBytes > 5 * 1024 * 1024 || !iso(record.capturedAt) || typeof record.kind !== "string" || !record.kind) fail(`${label} lacks bounded evidence metadata`);
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
    if (!record || !P805_PERSONAS.includes(record.persona) || record.phase !== phase || typeof record.auditId !== "string" || !record.auditId || !iso(record.startedAt) || !iso(record.endedAt) || Date.parse(record.startedAt) >= Date.parse(record.endedAt) || !Array.isArray(record.observations) || P805_REQUIRED_OBSERVATIONS[record.persona].some((required) => !record.observations.includes(required)) || !record.cleanContext || !path.isAbsolute(record.cleanContext.workspace) || !path.isAbsolute(record.cleanContext.configurationRoot) || !path.isAbsolute(record.cleanContext.browserProfile) || record.cleanContext.reused !== false || !Array.isArray(record.evidence) || record.evidence.length < 2 || !record.timings || typeof record.timings !== "object") fail(`${phase} audit is incomplete for ${record?.persona ?? "unknown persona"}`);
    candidate(record, phase === "initial" ? initial : finalCandidate, `${phase} audit ${record.persona}`);
    validateP805RenderedPersonaAudit(record);
}

/**
 * Validate the full campaign. `expected` is provided by the release
 * controller, never inferred from mutable campaign files.
 */
export async function validateP805ProductReadinessCampaign(directory, expected) {
    const root = path.resolve(directory);
    if (!expected || !commit(expected.candidateId) || !sha(expected.candidatePackageSha256)) fail("a verifier-supplied retest candidate and package digest are required");
    for (const name of RECORDS) if (!existsSync(path.join(root, name))) fail(`missing required campaign record ${name}`);
    const entries = await Promise.all(RECORDS.map((name) => json(root, name)));
    const records = Object.fromEntries(RECORDS.map((name, index) => [name, entries[index].value]));
    const provenance = records["PROVENANCE.json"];
    if (provenance.schemaVersion !== P805_SCHEMA_VERSION || typeof provenance.campaignId !== "string" || !provenance.campaignId || !provenance.cleanRoomAttestation || provenance.cleanRoomAttestation !== "I recorded each initial persona audit before reading prior findings, source, fixes, or prior campaign evidence." || !provenance.initialCandidate || !commit(provenance.initialCandidate.candidateId) || !sha(provenance.initialCandidate.candidatePackageSha256) || !iso(provenance.startedAt)) fail("provenance lacks a clean-room initial candidate attestation");
    const initialCandidate = provenance.initialCandidate;
    const finalCandidate = {candidateId:expected.candidateId, candidatePackageSha256:expected.candidatePackageSha256};
    if (initialCandidate.candidateId === finalCandidate.candidateId) fail("blind retests must use a new candidate after the initial audit");
    const used = new Set();
    const initial = records["initial-audits.json"];
    if (initial.schemaVersion !== P805_SCHEMA_VERSION || initial.campaignId !== provenance.campaignId || !Array.isArray(initial.audits) || initial.audits.length !== P805_PERSONAS.length) fail("initial audit record must contain exactly five personas");
    unique(initial.audits, "initial audits", "persona");
    for (const audit of initial.audits) {
        auditRecord(audit, "initial", initialCandidate, finalCandidate);
        for (const item of audit.evidence) await boundedEvidence(root, item, initialCandidate, `initial ${audit.persona}`, {after:audit.startedAt, before:audit.endedAt, used});
    }
    const frozen = records["frozen-findings.json"];
    if (frozen.schemaVersion !== P805_SCHEMA_VERSION || frozen.campaignId !== provenance.campaignId || frozen.candidateId !== initialCandidate.candidateId || frozen.candidatePackageSha256 !== initialCandidate.candidatePackageSha256 || !iso(frozen.frozenAt) || !Array.isArray(frozen.findings)) fail("frozen findings are not tied to the initial candidate");
    unique(frozen.findings, "frozen findings");
    for (const item of frozen.findings) { validateFinding(item, `frozen finding ${item?.id ?? "unknown"}`); await boundedEvidence(root, item.evidence, initialCandidate, `frozen finding ${item.id}`, {after:provenance.startedAt, before:frozen.frozenAt, used}); }
    const findingRegister = records["finding-register.json"];
    if (findingRegister.schemaVersion !== P805_SCHEMA_VERSION || findingRegister.campaignId !== provenance.campaignId || !Array.isArray(findingRegister.findings)) fail("finding register is incomplete");
    unique(findingRegister.findings, "finding register");
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
            if (!regression || typeof regression.testPath !== "string" || !regression.testPath.startsWith("tests/") || typeof regression.commitId !== "string" || !commit(regression.commitId) || !Array.isArray(regression.assertions) || !regression.assertions.length) fail(`resolved blocking finding ${finding.id} has no focused regression`);
        }
    }
    const retests = records["retests.json"];
    if (retests.schemaVersion !== P805_SCHEMA_VERSION || retests.campaignId !== provenance.campaignId || !Array.isArray(retests.audits) || retests.audits.length !== P805_PERSONAS.length || !iso(retests.startedAt)) fail("retest record must contain exactly five personas");
    unique(retests.audits, "retests", "persona");
    if (Date.parse(retests.startedAt) <= Date.parse(frozen.frozenAt)) fail("retests started before findings were frozen");
    for (const audit of retests.audits) {
        auditRecord(audit, "retest", initialCandidate, finalCandidate);
        if (Date.parse(audit.startedAt) <= Date.parse(frozen.frozenAt)) fail(`retest ${audit.persona} predates the finding freeze`);
        for (const item of audit.evidence) await boundedEvidence(root, item, finalCandidate, `retest ${audit.persona}`, {after:audit.startedAt, before:audit.endedAt, used});
    }
    const closeout = records["closeout.json"];
    if (closeout.schemaVersion !== P805_SCHEMA_VERSION || closeout.campaignId !== provenance.campaignId || !iso(closeout.closedAt) || !Array.isArray(closeout.dispositions) || closeout.dispositions.length !== frozen.findings.length || closeout.releaseReady !== true || closeout.appendOnly !== true) fail("closeout is incomplete or not append-only");
    candidate(closeout, finalCandidate, "closeout"); unique(closeout.dispositions, "closeout dispositions", "findingId");
    if (Date.parse(closeout.closedAt) <= Date.parse(retests.startedAt)) fail("closeout precedes the clean retests");
    for (const finding of frozen.findings) {
        const disposition = closeout.dispositions.find((entry) => entry.findingId === finding.id);
        if (!disposition || disposition.status !== (findingRegister.findings.find((entry) => entry.id === finding.id)?.status) || typeof disposition.retestEvidenceId !== "string" || !used.has(disposition.retestEvidenceId)) fail(`closeout lacks verified retest disposition for ${finding.id}`);
        if (BLOCKING(finding) && disposition.status !== "resolved") fail(`closeout leaves release-blocking finding ${finding.id} unresolved`);
    }
    if (!closeout.cleanup || closeout.cleanup.noOwnedProcessesRemain !== true || closeout.cleanup.failedOrCancelledArtifactsRemoved !== true) fail("closeout lacks cleanup attestations");
    return {campaignId:provenance.campaignId, candidateId:finalCandidate.candidateId, candidatePackageSha256:finalCandidate.candidatePackageSha256, frozenFindingsSha256:digest(entries[2].contents), closeoutSha256:digest(entries[6].contents), personas:[...P805_PERSONAS]};
}

function usage() { fail("usage: --campaign-dir <absolute-path> --expected-candidate <40-char-sha> --expected-package-sha256 <sha256>"); }
export async function main(argv = process.argv) {
    const args = argv.slice(2), values = {};
    for (let index = 0; index < args.length; index += 2) { if (!args[index]?.startsWith("--") || typeof args[index + 1] !== "string" || values[args[index]]) usage(); values[args[index]] = args[index + 1]; }
    if (args.length !== 6 || !path.isAbsolute(values["--campaign-dir"] || "") || !values["--expected-candidate"] || !values["--expected-package-sha256"]) usage();
    const result = await validateP805ProductReadinessCampaign(values["--campaign-dir"], {candidateId:values["--expected-candidate"], candidatePackageSha256:values["--expected-package-sha256"]});
    process.stdout.write(`P805_PRODUCT_READINESS_PASS candidate=${result.candidateId} personas=${result.personas.length}\n`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
