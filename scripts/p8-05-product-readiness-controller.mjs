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
const digest = (value) => createHash("sha256").update(value).digest("hex");
const now = () => new Date().toISOString();
const fail = (message) => { throw new Error(`P8-05 campaign controller is invalid: ${message}`); };
const recordPath = (directory, name) => path.join(directory, name);
async function record(directory, name) { try { return {contents:await readFile(recordPath(directory, name), "utf8"), value:JSON.parse(await readFile(recordPath(directory, name), "utf8"))}; } catch { fail(`required ${name} does not exist as JSON`); } }
async function writeRecord(directory, name, value) { await writeFile(recordPath(directory, name), `${JSON.stringify(value, null, 2)}\n`, {flag:"wx"}); }
function candidate(value, name) { if (!value || !commit(value.candidateId) || !sha(value.candidatePackageSha256)) fail(`${name} must name an immutable candidate and package digest`); }
function base(config) { if (!config || !path.isAbsolute(config.directory ?? "")) fail("configuration requires an absolute campaign directory"); }
function packed(config, name) { if (!path.isAbsolute(config?.packedCli ?? "") || !path.isAbsolute(config?.packedPackage ?? "")) fail(`${name} requires a packed CLI and package archive`); }

async function runAudits(config, phase, candidateValue, dependencies) {
    const services = {runAudit:runP805ValeraBrowserAudit, now, ...dependencies}; packed(config, `${phase} audit`);
    const audits = [];
    // Sequential execution guarantees per-persona process ownership and avoids a
    // shared random Studio port being mistaken for clean-room reuse.
    for (const persona of P805_PERSONAS) audits.push(await services.runAudit({persona, phase, candidateId:candidateValue.candidateId, candidatePackageSha256:candidateValue.candidatePackageSha256, output:config.directory, packedCli:config.packedCli, packedPackage:config.packedPackage}));
    return audits;
}

export async function runP805InitialAudit(config, dependencies = {}) {
    base(config); candidate(config.initialCandidate, "initial candidate"); packed(config, "initial audit"); if (!config.provenance?.campaignId || config.provenance.cleanRoomAttestation !== "I recorded each initial persona audit before reading prior findings, source, fixes, or prior campaign evidence.") fail("initial audit requires the clean-room provenance attestation");
    await (dependencies.mkdir ?? mkdir)(config.directory, {recursive:true}); if (existsSync(recordPath(config.directory, "PROVENANCE.json"))) fail("initial campaign provenance is append-only");
    const startedAt = (dependencies.now ?? now)(); await writeRecord(config.directory, "PROVENANCE.json", {schemaVersion:P805_SCHEMA_VERSION, ...config.provenance, startedAt, initialCandidate:config.initialCandidate});
    const audits = await runAudits(config, "initial", config.initialCandidate, dependencies); await writeRecord(config.directory, "initial-audits.json", {schemaVersion:P805_SCHEMA_VERSION, campaignId:config.provenance.campaignId, audits}); return audits;
}

export async function runP805Freeze(config) {
    base(config); const provenance = await record(config.directory, "PROVENANCE.json"), initial = await record(config.directory, "initial-audits.json"); candidate(provenance.value.initialCandidate, "initial candidate"); if (!config.frozenFindings || !Array.isArray(config.frozenFindings.findings) || !config.frozenFindings.externalAnchor || !sha(config.frozenFindings.externalAnchor.sha256)) fail("freeze requires findings and a verifier anchor produced after initial audits");
    if (existsSync(recordPath(config.directory, "frozen-findings.json"))) fail("frozen findings are append-only"); await writeRecord(config.directory, "frozen-findings.json", {schemaVersion:P805_SCHEMA_VERSION, campaignId:provenance.value.campaignId, ...provenance.value.initialCandidate, ...config.frozenFindings}); return {initialAuditsSha256:digest(initial.contents)};
}

export async function runP805PostFix(config) {
    base(config); candidate(config.retestCandidate, "retest candidate"); const provenance = await record(config.directory, "PROVENANCE.json"); await record(config.directory, "frozen-findings.json"); if (provenance.value.initialCandidate.candidateId === config.retestCandidate.candidateId) fail("post-fix candidate must differ from initial audit candidate"); if (!config.findingRegister || !config.regressions) fail("post-fix phase requires finding dispositions and machine regression results");
    for (const name of ["finding-register.json", "regressions.json"]) if (existsSync(recordPath(config.directory, name))) fail(`${name} is append-only`);
    await writeRecord(config.directory, "finding-register.json", {schemaVersion:P805_SCHEMA_VERSION, campaignId:provenance.value.campaignId, ...config.findingRegister}); await writeRecord(config.directory, "regressions.json", {schemaVersion:P805_SCHEMA_VERSION, campaignId:provenance.value.campaignId, ...config.regressions}); return config.retestCandidate;
}

export async function runP805Retest(config, dependencies = {}) {
    base(config); candidate(config.retestCandidate, "retest candidate"); await record(config.directory, "frozen-findings.json"); await record(config.directory, "regressions.json"); if (existsSync(recordPath(config.directory, "retests.json"))) fail("retests are append-only"); const startedAt = (dependencies.now ?? now)(), audits = await runAudits(config, "retest", config.retestCandidate, dependencies), provenance = await record(config.directory, "PROVENANCE.json"); await writeRecord(config.directory, "retests.json", {schemaVersion:P805_SCHEMA_VERSION, campaignId:provenance.value.campaignId, startedAt, audits}); return audits;
}

export async function runP805Closeout(config, dependencies = {}) {
    base(config); candidate(config.retestCandidate, "retest candidate"); const provenance = await record(config.directory, "PROVENANCE.json"); await Promise.all([record(config.directory, "frozen-findings.json"), record(config.directory, "finding-register.json"), record(config.directory, "regressions.json"), record(config.directory, "retests.json")]); if (existsSync(recordPath(config.directory, "manifest.json")) || existsSync(recordPath(config.directory, "closeout.json"))) fail("manifest and closeout are append-only"); if (!config.closeout?.externalAnchor || !sha(config.closeout.externalAnchor.sha256)) fail("closeout requires a verifier anchor after its payload is prepared");
    const names = ["PROVENANCE.json", "initial-audits.json", "frozen-findings.json", "finding-register.json", "regressions.json", "retests.json"], records = await Promise.all(names.map((name) => record(config.directory, name))), bound = new Map();
    for (const audit of [...records[1].value.audits, ...records[5].value.audits]) for (const item of audit.evidence) bound.set(item.evidenceId, item.sha256);
    for (const finding of records[2].value.findings) bound.set(finding.evidence.evidenceId, finding.evidence.sha256);
    for (const regression of records[4].value.regressions) if (regression.machineResultEvidence) bound.set(regression.machineResultEvidence.evidenceId, regression.machineResultEvidence.sha256);
    const manifest = {schemaVersion:P805_SCHEMA_VERSION, kind:"p8-05-immutable-manifest", campaignId:provenance.value.campaignId, records:Object.fromEntries(records.map((value, index) => [names[index], digest(value.contents)])), evidence:[...bound].map(([evidenceId, sha256]) => ({evidenceId, sha256}))}; await writeRecord(config.directory, "manifest.json", manifest); const manifestContents = await readFile(recordPath(config.directory, "manifest.json")); await writeRecord(config.directory, "closeout.json", {schemaVersion:P805_SCHEMA_VERSION, campaignId:provenance.value.campaignId, ...config.retestCandidate, ...config.closeout, manifestSha256:digest(manifestContents)});
    return validateP805ProductReadinessCampaign(config.directory, {candidateId:config.retestCandidate.candidateId, candidatePackageSha256:config.retestCandidate.candidatePackageSha256, freezeAnchorSha256:config.freezeAnchorSha256, closeoutAnchorSha256:config.closeoutAnchorSha256});
}

// Kept as a programmatic convenience, but it intentionally cannot skip the
// externally owned freeze/fix/anchor boundaries.
export async function runP805ProductReadinessController(config, dependencies = {}) { if (!config?.phase) fail("controller requires an explicit phase"); return ({"initial-audit":runP805InitialAudit, freeze:runP805Freeze, "post-fix":runP805PostFix, retest:runP805Retest, closeout:runP805Closeout}[config.phase] ?? (() => fail("unknown controller phase")))(config, dependencies); }
async function main(argv = process.argv) { const phase = argv[2], configPath = argv[3] === "--config" ? argv[4] : undefined; if (!["initial-audit", "freeze", "post-fix", "retest", "closeout"].includes(phase) || !path.isAbsolute(configPath ?? "") || argv.length !== 5) fail("usage: <initial-audit|freeze|post-fix|retest|closeout> --config <absolute-path>"); const config = JSON.parse(await readFile(configPath, "utf8")); const result = await runP805ProductReadinessController({...config, phase}); process.stdout.write(`P805_PRODUCT_READINESS_${phase.toUpperCase().replace("-", "_")}_PASS ${JSON.stringify(result).slice(0, 200)}\n`); }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
