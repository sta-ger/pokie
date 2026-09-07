#!/usr/bin/env node
/**
 * PC-20's deliberately fail-closed release controller.
 *
 * This program is not a publisher credential shim.  An authorized release
 * operator supplies independently anchored PC-19 and lifecycle receipts; the
 * controller owns the one local release gate and writes append-only receipts
 * tying those operations to the same immutable source and package identities.
 */
import {createHash} from "node:crypto";
import {existsSync} from "node:fs";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {spawn, spawnSync} from "node:child_process";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";
import {validatePc19IndependentColdStartReview} from "./pc-19-independent-cold-start-review.mjs";

export const PC20_SCHEMA_VERSION = 1;
const sha = (value) => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
const gitSha = (value) => typeof value === "string" && /^[a-f0-9]{40}$/i.test(value);
const utc = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) && !Number.isNaN(Date.parse(value));
const digest = (contents) => createHash("sha256").update(contents).digest("hex");
const fail = (message) => { throw new Error(`PC-20 release completion is invalid: ${message}`); };
const now = () => new Date().toISOString();

function required(value, name) {
    if (typeof value !== "string" || !value) fail(`${name} is required`);
    return value;
}

function outputPaths(config) {
    const root = path.resolve(required(config.outputDirectory, "outputDirectory"));
    const name = `pc-20-${config.candidateId}`;
    return {root, gate:path.join(root, `${name}-release-gate.json`), completion:path.join(root, `${name}-completion.json`)};
}

async function readJson(target, label) {
    let contents;
    try { contents = await readFile(target, "utf8"); } catch { fail(`${label} is missing: ${target}`); }
    try { return {contents, value:JSON.parse(contents)}; } catch { fail(`${label} is not JSON`); }
}

function validateConfig(config) {
    if (!config || typeof config !== "object") fail("config must be an object");
    if (!gitSha(config.candidateId) || !sha(config.candidatePackageSha256)) fail("a verifier-supplied exact candidate SHA and package digest are required");
    for (const key of ["reviewDirectory", "freezeReceiptPath", "lifecycleReceiptPath", "outputDirectory", "repositoryDirectory"]) {
        if (!path.isAbsolute(required(config[key], key))) fail(`${key} must be an absolute path`);
    }
    if (!sha(config.freezeReceiptSha256) || !sha(config.lifecycleReceiptSha256)) fail("trusted receipt digests are required");
    if (path.resolve(config.freezeReceiptPath).startsWith(`${path.resolve(config.reviewDirectory)}${path.sep}`)) fail("PC-19 freeze receipt must be outside mutable review evidence");
    if (path.resolve(config.lifecycleReceiptPath).startsWith(`${path.resolve(config.outputDirectory)}${path.sep}`)) fail("external lifecycle receipt must be outside mutable PC-20 evidence");
    required(config.packageName, "packageName");
    required(config.packageVersion, "packageVersion");
}

function commandResult(command, args, cwd) {
    const result = spawnSync(command, args, {cwd, encoding:"utf8"});
    if (result.error) fail(`could not run ${command}: ${result.error.message}`);
    if (result.status !== 0) fail(`${command} ${args.join(" ")} failed: ${(result.stderr || result.stdout || "").trim()}`);
    return (result.stdout || "").trim();
}

export function readRepositoryState(repositoryDirectory) {
    const cwd = path.resolve(repositoryDirectory);
    const head = commandResult("git", ["rev-parse", "HEAD"], cwd);
    const branch = commandResult("git", ["branch", "--show-current"], cwd);
    const dirty = spawnSync("git", ["diff", "--quiet"], {cwd}).status !== 0 || spawnSync("git", ["diff", "--cached", "--quiet"], {cwd}).status !== 0;
    return {head, branch, dirty};
}

function assertExactCleanDevelop(state, candidateId, phase) {
    if (!state || state.head !== candidateId || state.branch !== "develop" || state.dirty) fail(`${phase} must run from clean develop at the accepted candidate SHA`);
}

/** Run one bounded process group and prove its group was drained before returning. */
export async function runReleaseGate(repositoryDirectory, timeoutMs = 60 * 60 * 1000) {
    const startedAt = now();
    const child = spawn("npm", ["run", "check:release"], {
        cwd:path.resolve(repositoryDirectory),
        detached:process.platform !== "win32",
        stdio:"inherit",
    });
    let timedOut = false;
    const timeout = setTimeout(() => {
        timedOut = true;
        if (process.platform === "win32") child.kill("SIGTERM");
        else { try { process.kill(-child.pid, "SIGTERM"); } catch { /* exited already */ } }
    }, timeoutMs);
    const exitCode = await new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", (code) => resolve(code));
    }).finally(() => clearTimeout(timeout));
    let processGroupDrained = true;
    if (process.platform !== "win32" && child.pid) {
        try { process.kill(-child.pid, 0); processGroupDrained = false; process.kill(-child.pid, "SIGTERM"); } catch { /* group is gone */ }
    }
    const endedAt = now();
    return {command:"npm run check:release", startedAt, endedAt, exitCode, timedOut, cancelled:false, processGroupDrained};
}

function validateGate(gate, config) {
    if (!gate || gate.schemaVersion !== PC20_SCHEMA_VERSION || gate.kind !== "release-gate" || gate.candidateId !== config.candidateId || gate.candidatePackageSha256 !== config.candidatePackageSha256 || gate.command !== "npm run check:release" || gate.exitCode !== 0 || gate.timedOut || gate.cancelled || gate.processGroupDrained !== true || !utc(gate.startedAt) || !utc(gate.endedAt) || Date.parse(gate.startedAt) > Date.parse(gate.endedAt)) fail("release gate record is incomplete, failed, or bound to a different candidate");
}

async function obtainGate(config, dependencies) {
    const paths = outputPaths(config);
    if (existsSync(paths.gate)) {
        const existing = await readJson(paths.gate, "release gate record");
        validateGate(existing.value, config);
        return {gate:existing.value, sha256:digest(existing.contents), reused:true};
    }
    const result = await dependencies.runReleaseGate(config.repositoryDirectory);
    const gate = {schemaVersion:PC20_SCHEMA_VERSION, kind:"release-gate", candidateId:config.candidateId, candidatePackageSha256:config.candidatePackageSha256, ...result};
    validateGate(gate, config);
    await mkdir(paths.root, {recursive:true});
    const contents = `${JSON.stringify(gate, null, 2)}\n`;
    try { await writeFile(paths.gate, contents, {flag:"wx"}); } catch { fail("release gate record already exists; retry so its immutable contents can be validated"); }
    return {gate, sha256:digest(contents), reused:false};
}

function validateLifecycleReceipt(receipt, config, gateSha256) {
    if (!receipt || receipt.schemaVersion !== PC20_SCHEMA_VERSION || typeof receipt.receiptId !== "string" || !receipt.receiptId || !utc(receipt.issuedAt) || receipt.candidateId !== config.candidateId || receipt.releaseSha !== config.candidateId || receipt.candidatePackageSha256 !== config.candidatePackageSha256) fail("external lifecycle receipt is not bound to the accepted candidate/package");
    const git = receipt.git;
    if (!git || git.mergedToDevelop !== true || git.cleanDevelop !== true || git.developSha !== config.candidateId || git.pushedSha !== config.candidateId || typeof git.remote !== "string" || !git.remote || !utc(git.pushedAt)) fail("external lifecycle receipt lacks the clean develop merge/push of the accepted SHA");
    const publication = receipt.publication;
    if (!publication || publication.published !== true || publication.packageName !== config.packageName || publication.packageVersion !== config.packageVersion || publication.packageSha256 !== config.candidatePackageSha256 || publication.publishedSha !== config.candidateId || typeof publication.registryIdentity !== "string" || !publication.registryIdentity || !utc(publication.publishedAt)) fail("external lifecycle receipt lacks the exact registry publication identity");
    const drive = receipt.drive;
    if (!drive || drive.uploaded !== true || drive.readBack !== true || drive.releaseGateSha256 !== gateSha256 || typeof drive.uploadId !== "string" || !drive.uploadId || !utc(drive.uploadedAt) || !utc(drive.readBackAt)) fail("external lifecycle receipt lacks a successful Drive upload/read-back tied to the release gate");
}

async function readTrustedLifecycleReceipt(config, gateSha256) {
    const target = path.resolve(config.lifecycleReceiptPath);
    const loaded = await readJson(target, "trusted external lifecycle receipt");
    if (digest(loaded.contents) !== config.lifecycleReceiptSha256) fail("trusted external lifecycle receipt digest differs from its supplied anchor");
    validateLifecycleReceipt(loaded.value, config, gateSha256);
    return {value:loaded.value, sha256:digest(loaded.contents)};
}

export async function validatePc20ReleaseCompletion(config, dependencies = {}) {
    validateConfig(config);
    const services = {validatePc19:validatePc19IndependentColdStartReview, readRepositoryState, runReleaseGate, ...dependencies};
    const pc19 = await services.validatePc19(config.reviewDirectory, {
        candidateId:config.candidateId,
        candidatePackageSha256:config.candidatePackageSha256,
        freezeReceiptPath:config.freezeReceiptPath,
        freezeReceiptSha256:config.freezeReceiptSha256,
    });
    if (!pc19 || pc19.candidateId !== config.candidateId) fail("PC-19 did not accept the exact release candidate");
    assertExactCleanDevelop(services.readRepositoryState(config.repositoryDirectory), config.candidateId, "before the release gate");
    const gate = await obtainGate(config, services);
    assertExactCleanDevelop(services.readRepositoryState(config.repositoryDirectory), config.candidateId, "after the release gate");
    const lifecycle = await readTrustedLifecycleReceipt(config, gate.sha256);
    const paths = outputPaths(config);
    if (existsSync(paths.completion)) {
        const existing = await readJson(paths.completion, "completion record");
        if (existing.value.candidateId !== config.candidateId || existing.value.releaseGateSha256 !== gate.sha256 || existing.value.lifecycleReceiptSha256 !== lifecycle.sha256) fail("existing completion record is not the exact immutable completion being requested");
        return {...existing.value, reused:true};
    }
    const completion = {schemaVersion:PC20_SCHEMA_VERSION, kind:"campaign-completion", campaign:"phase7-product-coherence", stepId:"PC-20", completedAt:now(), candidateId:config.candidateId, candidatePackageSha256:config.candidatePackageSha256, pc19:{frozenFindingsSha256:pc19.frozenFindingsSha256, freezeReceiptSha256:pc19.freezeReceiptSha256, coverageIds:pc19.coverageIds}, releaseGateSha256:gate.sha256, lifecycleReceiptSha256:lifecycle.sha256};
    const contents = `${JSON.stringify(completion, null, 2)}\n`;
    try { await writeFile(paths.completion, contents, {flag:"wx"}); } catch { fail("completion record was concurrently created; retry so its immutable contents can be validated"); }
    return completion;
}

function usage() { throw new Error("Usage: node scripts/pc-20-release-completion.mjs --config <absolute-release-config.json>"); }
export async function main(argv = process.argv) {
    if (argv.length !== 4 || argv[2] !== "--config" || !path.isAbsolute(argv[3])) usage();
    const config = (await readJson(argv[3], "release config")).value;
    const result = await validatePc20ReleaseCompletion(config);
    process.stdout.write(`PC20_RELEASE_COMPLETION_PASS candidate=${result.candidateId}\n`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
