#!/usr/bin/env node
/**
 * The executable half of the P8-05 campaign.  It deliberately cannot mint
 * freeze/closeout anchors: those receipts are supplied by a verifier-owned
 * append-only service after each corresponding payload is written.
 */
import {mkdir, readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";
import {P805_PERSONAS, P805_SCHEMA_VERSION, validateP805ProductReadinessCampaign} from "./p8-05-product-readiness-campaign.mjs";
import {runP805ValeraBrowserAudit} from "./p8-05-valera-browser-audit.mjs";

const sha = (value) => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
const commit = (value) => typeof value === "string" && /^[a-f0-9]{40}$/i.test(value);
const fail = (message) => { throw new Error(`P8-05 campaign controller is invalid: ${message}`); };
const now = () => new Date().toISOString();

async function writeRecord(directory, name, value) {
    await writeFile(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`, {flag:"wx"});
}

function candidate(value, name) {
    if (!value || !commit(value.candidateId) || !sha(value.candidatePackageSha256)) fail(`${name} must name an immutable candidate and package digest`);
}

/** Runs five new initial profiles and five new retest profiles; no state is reused. */
export async function runP805ProductReadinessController(config, dependencies = {}) {
    if (!config || !path.isAbsolute(config.directory || "") || !path.isAbsolute(config.packedCli || "")) fail("configuration requires absolute campaign directory and packed CLI");
    candidate(config.initialCandidate, "initial candidate"); candidate(config.retestCandidate, "retest candidate");
    if (config.initialCandidate.candidateId === config.retestCandidate.candidateId) fail("retest candidate must differ from the initial candidate");
    if (!config.provenance || typeof config.provenance.cleanRoomAttestation !== "string" || !config.frozenFindings || !config.findingRegister || !config.regressions || !config.closeout || !config.externalAnchors || !sha(config.externalAnchors.freezeAnchorSha256) || !sha(config.externalAnchors.closeoutAnchorSha256)) fail("verifier-owned anchors and campaign records are required");
    const services = {runAudit:runP805ValeraBrowserAudit, mkdir, now, ...dependencies};
    await services.mkdir(config.directory, {recursive:true});
    const campaignId = config.provenance.campaignId;
    if (typeof campaignId !== "string" || !campaignId) fail("provenance must supply a campaign id");
    await writeRecord(config.directory, "PROVENANCE.json", {schemaVersion:P805_SCHEMA_VERSION, ...config.provenance, campaignId, startedAt:config.provenance.startedAt ?? services.now(), initialCandidate:config.initialCandidate});
    const runPhase = async (phase, candidateValue) => Promise.all(P805_PERSONAS.map((persona) => services.runAudit({persona, phase, candidateId:candidateValue.candidateId, candidatePackageSha256:candidateValue.candidatePackageSha256, output:config.directory, packedCli:config.packedCli})));
    const initialAudits = await runPhase("initial", config.initialCandidate);
    await writeRecord(config.directory, "initial-audits.json", {schemaVersion:P805_SCHEMA_VERSION, campaignId, audits:initialAudits});
    // The caller has the initial-audits digest and freezes it through an
    // independent append-only service before supplying this controller config.
    await writeRecord(config.directory, "frozen-findings.json", {schemaVersion:P805_SCHEMA_VERSION, campaignId, ...config.initialCandidate, ...config.frozenFindings});
    await writeRecord(config.directory, "finding-register.json", {schemaVersion:P805_SCHEMA_VERSION, campaignId, ...config.findingRegister});
    await writeRecord(config.directory, "regressions.json", {schemaVersion:P805_SCHEMA_VERSION, campaignId, ...config.regressions});
    const retestStartedAt = services.now();
    const retests = await runPhase("retest", config.retestCandidate);
    await writeRecord(config.directory, "retests.json", {schemaVersion:P805_SCHEMA_VERSION, campaignId, startedAt:retestStartedAt, audits:retests});
    await writeRecord(config.directory, "closeout.json", {schemaVersion:P805_SCHEMA_VERSION, campaignId, ...config.retestCandidate, ...config.closeout});
    return validateP805ProductReadinessCampaign(config.directory, {candidateId:config.retestCandidate.candidateId, candidatePackageSha256:config.retestCandidate.candidatePackageSha256, ...config.externalAnchors});
}

async function main(argv = process.argv) {
    if (argv.length !== 4 || argv[2] !== "--config" || !path.isAbsolute(argv[3])) fail("usage: --config <absolute-path>");
    let config;
    try { config = JSON.parse(await readFile(argv[3], "utf8")); } catch { fail("config is unreadable JSON"); }
    const result = await runP805ProductReadinessController(config);
    process.stdout.write(`P805_PRODUCT_READINESS_CONTROLLER_PASS campaign=${result.campaignId} personas=${result.personas.length}\n`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
