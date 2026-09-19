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
import {PC20_EVIDENCE_DIRECTORY, validatePc20CandidateLifecycleReceipt, validatePc20CandidateReleaseGate, validatePc20RetainedReleaseGate} from "./pc-20-release-completion.mjs";
import {runAuthorizedPc20Lifecycle} from "./pc-20-authorized-release-runner.mjs";
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
    if (!config || !commit(config.candidateId) || !sha(config.candidatePackageSha256) || !path.isAbsolute(config.campaignDirectory || "") || !path.isAbsolute(config.outputDirectory || "") || !sha(config.freezeAnchorSha256) || !sha(config.closeoutAnchorSha256) || !config.pc20 || typeof config.pc20 !== "object") fail("config must name external campaign/release directories, trusted anchors, exact candidate, digest, and PC-20 configuration");
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
    const services = {validateCampaign:validateP805ProductReadinessCampaign, validatePc20Gate:validatePc20CandidateReleaseGate, validateRetainedPc20Gate:validatePc20RetainedReleaseGate, mkdir, writeFile, readFile, exists:existsSync, readJson, now:() => new Date().toISOString(), ...dependencies};
    const closeout = await services.validateCampaign(config.campaignDirectory, {candidateId:config.candidateId, candidatePackageSha256:config.candidatePackageSha256, freezeAnchorSha256:config.freezeAnchorSha256, closeoutAnchorSha256:config.closeoutAnchorSha256});
    if (closeout.candidateId !== config.candidateId || closeout.candidatePackageSha256 !== config.candidatePackageSha256) fail("clean campaign closeout drifted from the requested release candidate");
    const output = receiptPath(config.candidateId, config.outputDirectory);
    if (services.exists(output)) {
        const existing = (await services.readJson(output, "P8-05 release gate receipt")).value;
        if (existing.schemaVersion !== P805_RELEASE_SCHEMA_VERSION || existing.kind !== "p8-05-release-gate" || existing.candidateId !== config.candidateId || existing.candidatePackageSha256 !== config.candidatePackageSha256 || existing.campaignId !== closeout.campaignId || existing.campaignCloseoutSha256 !== closeout.closeoutSha256 || !sha(existing.pc20GateSha256) || !iso(existing.completedAt) || Date.parse(existing.completedAt) <= Date.parse(closeout.closedAt) || JSON.stringify(existing.chronology) !== JSON.stringify(["clean-retest-closeout", "check-release-and-npm-pack-smoke"])) fail("existing P8-05 release gate receipt drifted");
        const retained = await services.validateRetainedPc20Gate(config.pc20);
        if (retained.sha256 !== existing.pc20GateSha256 || Date.parse(retained.gate.startedAt) <= Date.parse(closeout.closedAt)) fail("retained PC-20 gate artifacts or chronology drifted");
        return {...existing, reused:true};
    }
    // PC-20 runs check:release and the real npm pack/install smoke once. Its
    // retained output is the authoritative artifact rather than an imitation.
    const pc20 = await services.validatePc20Gate(config.pc20);
    // PC-20's public result is deliberately nested: {gate:{gate, sha256,
    // reused}}.  Reading the inner retained gate avoids a false drift after a
    // successful official gate.
    if (!pc20?.gate?.gate || !sha(pc20.gate.sha256) || pc20.gate.gate.candidateId !== config.candidateId || pc20.gate.gate.candidatePackageSha256 !== config.candidatePackageSha256 || !iso(pc20.gate.gate.startedAt) || Date.parse(pc20.gate.gate.startedAt) <= Date.parse(closeout.closedAt)) fail("PC-20 retained release gate is not after the clean retest candidate closeout");
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
    const services = {validateCampaign:validateP805ProductReadinessCampaign, validatePc20Lifecycle:validatePc20CandidateLifecycleReceipt, validateRetainedPc20Gate:validatePc20RetainedReleaseGate, runAuthorizedLifecycle:runAuthorizedPc20Lifecycle, readJson, exists:existsSync, writeFile, readFile, now:() => new Date().toISOString(), ...dependencies};
    const closeout = await services.validateCampaign(config.campaignDirectory, {candidateId:config.candidateId, candidatePackageSha256:config.candidatePackageSha256, freezeAnchorSha256:config.freezeAnchorSha256, closeoutAnchorSha256:config.closeoutAnchorSha256});
    const gate = await services.readJson(receiptPath(config.candidateId, config.outputDirectory), "P8-05 release gate receipt");
    const value = gate.value;
    if (value.schemaVersion !== P805_RELEASE_SCHEMA_VERSION || value.kind !== "p8-05-release-gate" || value.candidateId !== config.candidateId || value.candidatePackageSha256 !== config.candidatePackageSha256 || value.campaignId !== closeout.campaignId || value.campaignCloseoutSha256 !== closeout.closeoutSha256 || !sha(value.pc20GateSha256) || !iso(value.completedAt) || Date.parse(value.completedAt) <= Date.parse(closeout.closedAt) || JSON.stringify(value.chronology) !== JSON.stringify(["clean-retest-closeout", "check-release-and-npm-pack-smoke"])) fail("P8-05 release gate receipt is not bound to the clean campaign closeout");
    // Completion may reuse an external lifecycle receipt, but never a mutable
    // PC-20 gate: re-read gate, archive and smoke on every completion path.
    const retainedGate = await services.validateRetainedPc20Gate(config.pc20);
    if (!retainedGate?.gate || retainedGate.sha256 !== value.pc20GateSha256 || retainedGate.gate.candidateId !== config.candidateId || retainedGate.gate.candidatePackageSha256 !== config.candidatePackageSha256) fail("retained PC-20 gate/archive/smoke artifacts drifted before completion");
    let lifecycleConfig = config.pc20;
    if (!lifecycleConfig.lifecycleReceiptSha256) {
        await services.runAuthorizedLifecycle(lifecycleConfig, config.candidateId);
        lifecycleConfig = {...lifecycleConfig, lifecycleReceiptSha256:digest(await services.readFile(lifecycleConfig.lifecycleReceiptPath))};
    }
    const pc20 = await services.validatePc20Lifecycle(lifecycleConfig, value.pc20GateSha256);
    if (!pc20?.value || pc20.value.candidateId !== config.candidateId || pc20.value.candidatePackageSha256 !== config.candidatePackageSha256) fail("PC-20 final lifecycle receipt is not this release candidate");
    const output = completionPath(config.candidateId, config.outputDirectory);
    if (services.exists(output)) {
        const existing = await services.readJson(output, "P8-05 final completion receipt");
        const receipt = existing.value;
        if (receipt.schemaVersion !== P805_RELEASE_SCHEMA_VERSION || receipt.kind !== "p8-05-final-lifecycle" || receipt.candidateId !== config.candidateId || receipt.candidatePackageSha256 !== config.candidatePackageSha256 || receipt.campaignCloseoutSha256 !== closeout.closeoutSha256 || receipt.p805GateSha256 !== digest(gate.contents) || receipt.pc20LifecycleSha256 !== pc20.sha256 || !iso(receipt.completedAt) || JSON.stringify(receipt.chronology) !== JSON.stringify(["clean-retest-closeout", "check-release-and-npm-pack-smoke", "integration-push", "publication", "drive-upload", "drive-read-back", "final-completion"])) fail("existing P8-05 completion record drifted");
        return {...receipt, sha256:digest(existing.contents), reused:true};
    }
    const completedAt = services.now();
    const lifecycleTimes = [pc20.value.git?.pushedAt, pc20.value.publication?.publishedAt, pc20.value.drive?.uploadedAt, pc20.value.drive?.readBackAt, pc20.value.issuedAt];
    if (!iso(completedAt) || lifecycleTimes.some((time) => !iso(time) || Date.parse(time) <= Date.parse(value.completedAt)) || Date.parse(completedAt) <= Date.parse(pc20.value.issuedAt)) fail("protected lifecycle must follow closeout and gate before final completion");
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
