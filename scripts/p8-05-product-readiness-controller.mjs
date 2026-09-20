#!/usr/bin/env node
/** Phase controller for the externally anchored P8-05 audit/fix/retest campaign. */
import {createHash} from "node:crypto";
import {existsSync} from "node:fs";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";
import {P805_PERSONAS, P805_SCHEMA_VERSION, validateP805ProductReadinessCampaign} from "./p8-05-product-readiness-campaign.mjs";
import {runP805ValeraBrowserAudit} from "./p8-05-valera-browser-audit.mjs";

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
async function externalAnchor(anchor, expectedKind, expected) {
    if (!anchor || !path.isAbsolute(anchor.path ?? "") || !sha(anchor.sha256)) fail(`${expectedKind} requires an external immutable anchor`);
    let contents, value;
    try { contents = await readFile(anchor.path, "utf8"); value = JSON.parse(contents); } catch { fail(`${expectedKind} external anchor is unreadable JSON`); }
    if (digest(contents) !== anchor.sha256 || value?.kind !== expectedKind || !iso(value.anchoredAt)) fail(`${expectedKind} external anchor digest, kind, or timestamp differs`);
    for (const [name, valueExpected] of Object.entries(expected)) if (value[name] !== valueExpected) fail(`${expectedKind} external anchor does not bind ${name}`);
    return value;
}

async function runAudits(config, phase, candidateValue) {
    // This is intentionally not injectable.  A controller that accepts audit
    // objects (or a replacement collector) can mint a green campaign without
    // ever launching the installed package and rendered Studio surface.
    packed(config, `${phase} audit`);
    const audits = [];
    // Sequential execution guarantees per-persona process ownership and avoids a
    // shared random Studio port being mistaken for clean-room reuse.
    for (const persona of P805_PERSONAS) {
        try { audits.push(await runP805ValeraBrowserAudit({persona, workflowPersonas:[persona], phase, candidateId:candidateValue.candidateId, candidatePackageSha256:candidateValue.candidatePackageSha256, candidateExecutableSha256:candidateValue.candidateExecutableSha256, candidateExecutableReceipt:candidateValue.candidateExecutableReceipt, output:config.directory, packedCli:config.packedCli, packedPackage:config.packedPackage})); }
        catch (error) {
            const failure = {schemaVersion:P805_SCHEMA_VERSION, kind:"p8-05-audit-failure", phase, persona, candidateId:candidateValue.candidateId, candidatePackageSha256:candidateValue.candidatePackageSha256, failedAt:now(), message:error instanceof Error ? error.message : String(error), cleanupEvidenceId:error?.cleanupEvidenceId, cleanup:error?.cleanup};
            await writeRecord(config.directory, `${phase}-${persona}-audit.failed.json`, failure);
            throw error;
        }
    }
    return audits;
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
