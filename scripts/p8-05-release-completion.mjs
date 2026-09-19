#!/usr/bin/env node
/**
 * P8-05's release interlock.  It layers candidate-bound product readiness on
 * top of PC-20's existing one-shot pack/release machinery; it does not alter
 * PC-19/PC-20 evidence or create a second publisher path.
 */
import {createHash} from "node:crypto";
import {existsSync} from "node:fs";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";
import {PC20_EVIDENCE_DIRECTORY, validatePc20CandidateLifecycleReceipt, validatePc20CandidateReleaseGate} from "./pc-20-release-completion.mjs";
import {P805_EVIDENCE_DIRECTORY, validateP805ProductReadinessCampaign} from "./p8-05-product-readiness-campaign.mjs";

export const P805_RELEASE_SCHEMA_VERSION = 1;
export const P805_RELEASE_DIRECTORY = path.join(P805_EVIDENCE_DIRECTORY, "release");
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = (value) => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
const commit = (value) => typeof value === "string" && /^[a-f0-9]{40}$/i.test(value);
const iso = (value) => typeof value === "string" && !Number.isNaN(Date.parse(value));
const digest = (value) => createHash("sha256").update(value).digest("hex");
const fail = (message) => { throw new Error(`P8-05 release completion is invalid: ${message}`); };

function requiredConfig(config) {
    if (!config || !commit(config.candidateId) || !sha(config.candidatePackageSha256) || !path.isAbsolute(config.campaignDirectory || "") || !path.isAbsolute(config.outputDirectory || "") || !config.pc20 || typeof config.pc20 !== "object") fail("config must name external campaign/release directories, exact candidate, digest, and PC-20 configuration");
    for (const [label, directory] of [["campaign", config.campaignDirectory], ["release", config.outputDirectory]]) if (path.resolve(directory) === repositoryRoot || path.resolve(directory).startsWith(`${repositoryRoot}${path.sep}`)) fail(`${label} evidence must be outside the exact-candidate checkout`);
    if (config.pc20.candidateId !== config.candidateId || config.pc20.candidatePackageSha256 !== config.candidatePackageSha256) fail("PC-20 configuration candidate differs from P8-05 closeout candidate");
}

const receiptPath = (candidateId, directory = P805_RELEASE_DIRECTORY) => path.join(directory, `p8-05-${candidateId}-release-gate.json`);
const completionPath = (candidateId, directory = P805_RELEASE_DIRECTORY) => path.join(directory, `p8-05-${candidateId}-completion.json`);
async function readJson(target, label) {
    let contents;
    try { contents = await readFile(target, "utf8"); } catch { fail(`${label} is missing`); }
    try { return {contents, value:JSON.parse(contents)}; } catch { fail(`${label} is not JSON`); }
}

/** Run/retain the one PC-20 gate only after a valid new-candidate retest. */
export async function validateP805ReleaseGate(config, dependencies = {}) {
    requiredConfig(config);
    const services = {validateCampaign:validateP805ProductReadinessCampaign, validatePc20Gate:validatePc20CandidateReleaseGate, mkdir, writeFile, readFile, exists:existsSync, readJson, now:() => new Date().toISOString(), ...dependencies};
    const closeout = await services.validateCampaign(config.campaignDirectory, {candidateId:config.candidateId, candidatePackageSha256:config.candidatePackageSha256});
    if (closeout.candidateId !== config.candidateId || closeout.candidatePackageSha256 !== config.candidatePackageSha256) fail("clean campaign closeout drifted from the requested release candidate");
    const output = receiptPath(config.candidateId, config.outputDirectory);
    if (services.exists(output)) {
        const existing = (await services.readJson(output, "P8-05 release gate receipt")).value;
        if (existing.schemaVersion !== P805_RELEASE_SCHEMA_VERSION || existing.kind !== "p8-05-release-gate" || existing.candidateId !== config.candidateId || existing.candidatePackageSha256 !== config.candidatePackageSha256 || existing.campaignId !== closeout.campaignId || existing.campaignCloseoutSha256 !== closeout.closeoutSha256 || !sha(existing.pc20GateSha256) || JSON.stringify(existing.chronology) !== JSON.stringify(["clean-retest-closeout", "check-release-and-npm-pack-smoke"])) fail("existing P8-05 release gate receipt drifted");
        return {...existing, reused:true};
    }
    // PC-20 runs check:release and the real npm pack/install smoke once. Its
    // retained output is the authoritative artifact rather than an imitation.
    const pc20 = await services.validatePc20Gate(config.pc20);
    // PC-20's public result is deliberately nested: {gate:{gate, sha256,
    // reused}}.  Reading the inner retained gate avoids a false drift after a
    // successful official gate.
    if (!pc20?.gate?.gate || !sha(pc20.gate.sha256) || pc20.gate.gate.candidateId !== config.candidateId || pc20.gate.gate.candidatePackageSha256 !== config.candidatePackageSha256) fail("PC-20 retained release gate is not the clean retest candidate");
    const receipt = {schemaVersion:P805_RELEASE_SCHEMA_VERSION, kind:"p8-05-release-gate", candidateId:config.candidateId, candidatePackageSha256:config.candidatePackageSha256, campaignId:closeout.campaignId, campaignCloseoutSha256:closeout.closeoutSha256, pc20GateSha256:pc20.gate.sha256, pc20EvidenceDirectory:PC20_EVIDENCE_DIRECTORY, completedAt:services.now(), chronology:["clean-retest-closeout", "check-release-and-npm-pack-smoke"]};
    if (!iso(receipt.completedAt)) fail("clock returned an invalid timestamp");
    await services.mkdir(config.outputDirectory, {recursive:true});
    await services.writeFile(output, `${JSON.stringify(receipt, null, 2)}\n`, {flag:"wx"});
    return {...receipt, sha256:digest(await services.readFile(output))};
}

/**
 * Require PC-20's protected push/publish/Drive lifecycle after the retained
 * P8-05 gate.  This only validates receipts; credentialed operations remain
 * in the protected PC-20 authorized runner.
 */
export async function validateP805ReleaseCompletion(config, dependencies = {}) {
    requiredConfig(config);
    const services = {validateCampaign:validateP805ProductReadinessCampaign, validatePc20Lifecycle:validatePc20CandidateLifecycleReceipt, readJson, exists:existsSync, writeFile, readFile, now:() => new Date().toISOString(), ...dependencies};
    const closeout = await services.validateCampaign(config.campaignDirectory, {candidateId:config.candidateId, candidatePackageSha256:config.candidatePackageSha256});
    const gate = await services.readJson(receiptPath(config.candidateId, config.outputDirectory), "P8-05 release gate receipt");
    const value = gate.value;
    if (value.schemaVersion !== P805_RELEASE_SCHEMA_VERSION || value.kind !== "p8-05-release-gate" || value.candidateId !== config.candidateId || value.candidatePackageSha256 !== config.candidatePackageSha256 || value.campaignId !== closeout.campaignId || value.campaignCloseoutSha256 !== closeout.closeoutSha256 || !sha(value.pc20GateSha256) || !iso(value.completedAt) || JSON.stringify(value.chronology) !== JSON.stringify(["clean-retest-closeout", "check-release-and-npm-pack-smoke"])) fail("P8-05 release gate receipt is not bound to the clean campaign closeout");
    const pc20 = await services.validatePc20Lifecycle(config.pc20, value.pc20GateSha256);
    if (!pc20?.value || pc20.value.candidateId !== config.candidateId || pc20.value.candidatePackageSha256 !== config.candidatePackageSha256) fail("PC-20 final lifecycle receipt is not this release candidate");
    const output = completionPath(config.candidateId, config.outputDirectory);
    if (services.exists(output)) fail("an append-only P8-05 completion record already exists for this candidate");
    const completedAt = services.now();
    if (!iso(completedAt) || Date.parse(completedAt) <= Date.parse(value.completedAt)) fail("final lifecycle completion must follow the clean gate");
    const receipt = {schemaVersion:P805_RELEASE_SCHEMA_VERSION, kind:"p8-05-final-lifecycle", candidateId:config.candidateId, candidatePackageSha256:config.candidatePackageSha256, campaignCloseoutSha256:closeout.closeoutSha256, p805GateSha256:digest(gate.contents), pc20LifecycleSha256:pc20.sha256, pc20Completion:pc20.value, completedAt, chronology:["clean-retest-closeout", "check-release-and-npm-pack-smoke", "integration-push", "publication", "drive-upload", "drive-read-back", "final-completion"]};
    await services.writeFile(output, `${JSON.stringify(receipt, null, 2)}\n`, {flag:"wx"});
    return {...receipt, sha256:digest(await services.readFile(output))};
}

async function main(argv = process.argv) {
    const gateOnly = argv.length === 5 && argv[2] === "--gate-only" && argv[3] === "--config";
    const configPath = gateOnly ? argv[4] : argv[3];
    if ((!gateOnly && (argv.length !== 4 || argv[2] !== "--config")) || !path.isAbsolute(configPath || "")) fail("usage: [--gate-only] --config <absolute-path>");
    const {value:config} = await readJson(configPath, "config");
    const result = gateOnly ? await validateP805ReleaseGate(config) : await validateP805ReleaseCompletion(config);
    process.stdout.write(`P805_RELEASE_${gateOnly ? "GATE" : "COMPLETION"}_PASS candidate=${result.candidateId}\n`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
