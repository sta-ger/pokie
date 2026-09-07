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
import {mkdir, readFile, rm, stat, writeFile} from "node:fs/promises";
import {spawn, spawnSync} from "node:child_process";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";
import {validatePc19IndependentColdStartReview} from "./pc-19-independent-cold-start-review.mjs";

export const PC20_SCHEMA_VERSION = 1;
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PC20_EVIDENCE_DIRECTORY = path.join(repositoryRoot, "docs", "evidence", "phase7-product-coherence", "pc-20-release-completion");
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
    return {root, gate:path.join(root, `${name}-release-gate.json`), failed:path.join(root, `${name}-release-gate.failed.json`), completion:path.join(root, `${name}-completion.json`), smoke:path.join(root, `${name}-npm-pack-smoke.json`), archive:path.join(root, `${name}-package.tgz`), stdout:path.join(root, `${name}-release-gate.stdout.txt`), stderr:path.join(root, `${name}-release-gate.stderr.txt`)};
}

export function pc20CandidateReceiptPaths(candidateId, {includeCompletion = true, includeFailed = true} = {}) {
    const name = `pc-20-${candidateId}`;
    const paths = ["release-gate.json", "npm-pack-smoke.json", "package.tgz", "release-gate.stdout.txt", "release-gate.stderr.txt"];
    if (includeCompletion) paths.push("completion.json");
    if (includeFailed) paths.push("release-gate.failed.json");
    return new Set(paths.map((suffix) => path.join(PC20_EVIDENCE_DIRECTORY, `${name}-${suffix}`)));
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
    if (path.resolve(config.outputDirectory) !== PC20_EVIDENCE_DIRECTORY) fail("outputDirectory must be the canonical PC-20 evidence directory");
    if (path.resolve(config.repositoryDirectory) !== repositoryRoot) fail("repositoryDirectory must be this repository root");
    if (!sha(config.freezeReceiptSha256) || !sha(config.lifecycleReceiptSha256)) fail("trusted receipt digests are required");
    if (path.resolve(config.freezeReceiptPath).startsWith(`${path.resolve(config.reviewDirectory)}${path.sep}`)) fail("PC-19 freeze receipt must be outside mutable review evidence");
    if (path.resolve(config.lifecycleReceiptPath).startsWith(`${path.resolve(config.outputDirectory)}${path.sep}`)) fail("external lifecycle receipt must be outside mutable PC-20 evidence");
    required(config.packageName, "packageName");
    required(config.packageVersion, "packageVersion");
    let packageJson;
    try { packageJson = JSON.parse(commandResult("git", ["show", `${config.candidateId}:package.json`], repositoryRoot)); } catch { fail("the accepted candidate must contain a readable package.json"); }
    if (packageJson.name !== config.packageName || packageJson.version !== config.packageVersion) fail("config package name/version differs from the accepted candidate package identity");
}

function commandResult(command, args, cwd) {
    const result = spawnSync(command, args, {cwd, encoding:"utf8"});
    if (result.error) fail(`could not run ${command}: ${result.error.message}`);
    if (result.status !== 0) fail(`${command} ${args.join(" ")} failed: ${(result.stderr || result.stdout || "").trim()}`);
    return (result.stdout || "").trim();
}

export function readRepositoryState(repositoryDirectory, permittedReceiptPaths = new Set()) {
    const cwd = path.resolve(repositoryDirectory);
    const head = commandResult("git", ["rev-parse", "HEAD"], cwd);
    const branch = commandResult("git", ["branch", "--show-current"], cwd);
    const raw = commandResult("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], cwd);
    const records = raw ? raw.split("\0").filter(Boolean) : [];
    const changedPaths = [];
    for (let index = 0; index < records.length; index++) {
        const record = records[index];
        const changed = record.slice(3);
        changedPaths.push(path.resolve(cwd, changed));
        if (/^[RC]/.test(record.slice(0, 2))) changedPaths.push(path.resolve(cwd, records[++index] || ""));
    }
    const dirtyPaths = changedPaths.filter((changed) => !permittedReceiptPaths.has(changed));
    return {head, branch, dirty:dirtyPaths.length > 0, dirtyPaths};
}

function assertExactCleanDevelop(state, candidateId, phase) {
    if (!state || state.head !== candidateId || state.branch !== "develop" || state.dirty) fail(`${phase} must run from clean develop at the accepted candidate SHA`);
}

export function assertPc20CandidateClean(repositoryDirectory, candidateId, phase = "PC-20 lifecycle", receiptOptions = {}) {
    assertExactCleanDevelop(readRepositoryState(repositoryDirectory, pc20CandidateReceiptPaths(candidateId, receiptOptions)), candidateId, phase);
}

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function processGroupAlive(pid) {
    if (process.platform === "win32" || !Number.isInteger(pid) || pid <= 0) return false;
    try { process.kill(-pid, 0); return true; } catch { return false; }
}

function processSnapshot() {
    if (process.platform === "win32") return new Map();
    const result = spawnSync("ps", ["-eo", "pid=,ppid=,stat="], {encoding:"utf8"});
    const processes = new Map();
    for (const line of (result.stdout || "").split("\n")) {
        const match = /^\s*(\d+)\s+(\d+)\s+(\S+)/.exec(line);
        if (match) processes.set(Number(match[1]), {parentPid:Number(match[2]), zombie:match[3].startsWith("Z")});
    }
    return processes;
}

function createOwnershipTracker(pid) {
    const ownedPids = new Set(Number.isInteger(pid) && pid > 0 ? [pid] : []);
    const capture = () => {
        const snapshot = processSnapshot();
        let changed = true;
        while (changed) {
            changed = false;
            for (const [childPid, details] of snapshot) {
                if (ownedPids.has(details.parentPid) && !ownedPids.has(childPid)) {
                    ownedPids.add(childPid);
                    changed = true;
                }
            }
        }
    };
    capture();
    const timer = setInterval(capture, 10);
    return {ownedPids, capture, stop:() => clearInterval(timer)};
}

function processAlive(pid) {
    const details = processSnapshot().get(pid);
    if (details?.zombie) return false;
    try { process.kill(pid, 0); return true; } catch { return false; }
}

/** Terminate the root process group and every descendant observed while it ran. */
export async function drainProcessTree(child, graceMs = 1_000, ownedPids = new Set()) {
    const pid = child?.pid;
    if (Number.isInteger(pid) && pid > 0) ownedPids.add(pid);
    if (ownedPids.size === 0) return {processGroupDrained:true, processTreeDrained:true, ownedProcessIds:[], termination:"not-started"};
    const terminate = (signal) => {
        for (const processId of ownedPids) {
            try {
                if (process.platform === "win32") process.kill(processId, signal);
                else {
                    // A detached descendant gets its own process group; signal both its
                    // group and its PID, then verify it actually left the process table.
                    process.kill(-processId, signal);
                }
            } catch { /* a concurrently exiting tree is verified below */ }
            try { process.kill(processId, signal); } catch { /* see verification below */ }
        }
    };
    if (process.platform === "win32") {
        terminate("SIGTERM");
        await pause(graceMs);
        if ([...ownedPids].some(processAlive)) terminate("SIGKILL");
        await pause(25);
        const processTreeDrained = ![...ownedPids].some(processAlive);
        return {processGroupDrained:processTreeDrained, processTreeDrained, ownedProcessIds:[...ownedPids], termination:"windows-owned-processes"};
    }
    if (Number.isInteger(pid) && pid > 0 && processGroupAlive(pid)) terminate("SIGTERM");
    const deadline = Date.now() + graceMs;
    while ([...ownedPids].some(processAlive) && Date.now() < deadline) await pause(25);
    if ([...ownedPids].some(processAlive)) {
        terminate("SIGKILL");
        const killDeadline = Date.now() + graceMs;
        while ([...ownedPids].some(processAlive) && Date.now() < killDeadline) await pause(25);
    }
    const processTreeDrained = ![...ownedPids].some(processAlive);
    return {processGroupDrained:!processGroupAlive(pid), processTreeDrained, ownedProcessIds:[...ownedPids], termination:"tracked-process-tree"};
}

/**
 * Run one bounded process group.  The finally block is intentional: process
 * ownership is a release invariant on every exit path, including spawn error,
 * AbortSignal cancellation and timer expiry.
 */
export async function runBoundedProcess(command, args, {cwd, timeoutMs = 60 * 60 * 1000, signal, env = process.env, spawnCommand = spawn, ownedProcessIds = []} = {}) {
    const startedAt = now();
    let child;
    let timedOut = false;
    let cancelled = false;
    let timeout;
    let abort;
    let output = "", errorOutput = "", exitCode = null, spawnError, tracker, drainage = {processGroupDrained:true, processTreeDrained:true, ownedProcessIds:[]};
    let failure;
    try {
        if (signal?.aborted) { cancelled = true; throw new Error("release gate was cancelled before spawn"); }
        child = spawnCommand(command, args, {cwd:path.resolve(cwd), detached:process.platform !== "win32", stdio:["ignore", "pipe", "pipe"], env});
        tracker = createOwnershipTracker(child.pid);
        for (const processId of ownedProcessIds) if (Number.isInteger(processId) && processId > 0) tracker.ownedPids.add(processId);
        child.stdout?.on("data", (chunk) => { output += chunk; });
        child.stderr?.on("data", (chunk) => { errorOutput += chunk; });
        const exited = new Promise((resolve) => {
            child.once("error", (error) => { spawnError = error; resolve(); });
            child.once("exit", (code) => { exitCode = code; resolve(); });
        });
        timeout = setTimeout(() => { timedOut = true; void drainProcessTree(child, 1_000, tracker.ownedPids); }, timeoutMs);
        abort = () => { cancelled = true; void drainProcessTree(child, 1_000, tracker.ownedPids); };
        signal?.addEventListener("abort", abort, {once:true});
        await exited;
        if (spawnError) throw spawnError;
    } catch (error) {
        failure = error;
    } finally {
        clearTimeout(timeout);
        if (abort) signal?.removeEventListener("abort", abort);
        tracker?.capture();
        tracker?.stop();
        drainage = await drainProcessTree(child, 1_000, tracker?.ownedPids);
        if (!drainage.processGroupDrained || !drainage.processTreeDrained) failure = new Error("release gate tracked process tree could not be drained");
    }
    const result = {command:`${command} ${args.join(" ")}`, startedAt, endedAt:now(), exitCode, timedOut, cancelled, processGroupDrained:drainage.processGroupDrained, processTreeDrained:drainage.processTreeDrained, ownedProcessIds:drainage.ownedProcessIds, stdout:output, stderr:errorOutput};
    if (!failure && timedOut) failure = new Error("release gate timed out after its process tree was drained");
    if (!failure && cancelled) failure = new Error("release gate was cancelled after its process tree was drained");
    if (!failure && exitCode !== 0) failure = new Error(`release gate failed with exit code ${exitCode}`);
    if (failure) {
        failure.pc20Result = result;
        throw failure;
    }
    return result;
}

/** Run the sole release composite and retain the packaging smoke receipt it produced. */
export async function runReleaseGate(repositoryDirectory, options = {}) {
    const paths = options.paths;
    if (!paths) fail("release gate requires canonical evidence paths");
    await mkdir(paths.root, {recursive:true});
    const result = await runBoundedProcess("npm", ["run", "check:release"], {
        cwd:repositoryDirectory, timeoutMs:options.timeoutMs, signal:options.signal,
        env:{...process.env, ...options.env, POKIE_PACK_SMOKE_RECEIPT:paths.smoke, POKIE_PACK_SMOKE_ARCHIVE_PATH:paths.archive, POKIE_PACK_SMOKE_CANDIDATE_ID:options.candidateId, POKIE_PACK_SMOKE_CANDIDATE_PACKAGE_SHA256:options.candidatePackageSha256},
        spawnCommand:options.spawnCommand,
    });
    return result;
}

function validateSmokeReceipt(receipt, config, paths) {
    if (!receipt || receipt.schemaVersion !== PC20_SCHEMA_VERSION || receipt.kind !== "npm-pack-install-smoke" || receipt.complete !== true || receipt.candidateId !== config.candidateId || receipt.candidatePackageSha256 !== config.candidatePackageSha256 || receipt.packageName !== config.packageName || receipt.packageVersion !== config.packageVersion || path.resolve(receipt.archivePath || "") !== paths.archive || !sha(receipt.archiveSha256) || receipt.archiveSha256 !== config.candidatePackageSha256 || !Number.isSafeInteger(receipt.archiveSizeBytes) || receipt.archiveSizeBytes <= 0 || !receipt.installed || receipt.installed.cli !== true || receipt.installed.studioApi !== true || receipt.installed.studioAssets !== true || receipt.installed.libraryWorker !== true || receipt.installed.processesDrained !== true || !receipt.cleanup || receipt.cleanup.temporaryInstallRemoved !== true || receipt.cleanup.temporaryPackDirectoryRemoved !== true || receipt.cleanup.processesDrained !== true) fail("npm-pack/install smoke receipt is incomplete or bound to a different package archive");
}

async function verifySmokeReceipt(config, paths) {
    const receipt = await readJson(paths.smoke, "npm-pack/install smoke receipt");
    validateSmokeReceipt(receipt.value, config, paths);
    let archive;
    try { archive = await stat(paths.archive); } catch { fail("npm-pack/install smoke archive is missing"); }
    const archiveContents = await readFile(paths.archive);
    if (archive.size !== receipt.value.archiveSizeBytes || digest(archiveContents) !== config.candidatePackageSha256) fail("retained npm package archive digest differs from the accepted candidate");
    return {value:receipt.value, sha256:digest(receipt.contents)};
}

function validateGate(gate, config) {
    if (!gate || gate.schemaVersion !== PC20_SCHEMA_VERSION || gate.kind !== "release-gate" || gate.candidateId !== config.candidateId || gate.candidatePackageSha256 !== config.candidatePackageSha256 || gate.command !== "npm run check:release" || gate.exitCode !== 0 || gate.timedOut || gate.cancelled || gate.processGroupDrained !== true || gate.processTreeDrained !== true || !sha(gate.stdoutSha256) || !sha(gate.stderrSha256) || !sha(gate.packagingSmokeSha256) || !utc(gate.startedAt) || !utc(gate.endedAt) || Date.parse(gate.startedAt) > Date.parse(gate.endedAt)) fail("release gate record is incomplete, failed, or bound to a different candidate");
}

function validateFailedGate(gate, config) {
    if (!gate || gate.schemaVersion !== PC20_SCHEMA_VERSION || gate.kind !== "release-gate-failed" || gate.candidateId !== config.candidateId || gate.candidatePackageSha256 !== config.candidatePackageSha256 || gate.command !== "npm run check:release" || gate.success !== false || typeof gate.failure !== "string" || !gate.failure || !utc(gate.failedAt) || gate.processGroupDrained !== true || gate.processTreeDrained !== true) fail("failed release gate record is incomplete or bound to a different candidate");
}

async function cleanPartialGateArtifacts(paths) {
    await Promise.all([paths.smoke, paths.archive, paths.stdout, paths.stderr].map((target) => rm(target, {force:true})));
}

async function retainFailedGate(config, paths, error) {
    const result = error?.pc20Result || {};
    const failed = {schemaVersion:PC20_SCHEMA_VERSION, kind:"release-gate-failed", candidateId:config.candidateId, candidatePackageSha256:config.candidatePackageSha256, command:"npm run check:release", success:false, failedAt:now(), failure:error instanceof Error ? error.message : String(error), exitCode:result.exitCode ?? null, timedOut:result.timedOut === true, cancelled:result.cancelled === true, processGroupDrained:result.processGroupDrained !== false, processTreeDrained:result.processTreeDrained !== false, ownedProcessIds:Array.isArray(result.ownedProcessIds) ? result.ownedProcessIds : []};
    validateFailedGate(failed, config);
    try { await writeFile(paths.failed, `${JSON.stringify(failed, null, 2)}\n`, {flag:"wx"}); } catch { fail("failed release gate record already exists; this candidate is permanently locked"); }
}

async function obtainGate(config, dependencies) {
    const paths = outputPaths(config);
    if (existsSync(paths.failed)) {
        const failed = await readJson(paths.failed, "failed release gate record");
        validateFailedGate(failed.value, config);
        fail("this candidate's official release gate already failed and is permanently locked");
    }
    if (existsSync(paths.gate)) {
        const existing = await readJson(paths.gate, "release gate record");
        validateGate(existing.value, config);
        const smoke = await verifySmokeReceipt(config, paths);
        if (existing.value.packagingSmokeSha256 !== smoke.sha256) fail("release gate record is not bound to its retained packaging smoke receipt");
        return {gate:existing.value, sha256:digest(existing.contents), reused:true};
    }
    let result;
    try {
        result = await dependencies.runReleaseGate(config.repositoryDirectory, {paths, candidateId:config.candidateId, candidatePackageSha256:config.candidatePackageSha256});
    } catch (error) {
        await cleanPartialGateArtifacts(paths);
        await retainFailedGate(config, paths, error);
        throw error;
    }
    try {
        const smoke = await verifySmokeReceipt(config, paths);
        const stdout = required(result.stdout ?? "", "release gate stdout"), stderr = typeof result.stderr === "string" ? result.stderr : "";
        await writeFile(paths.stdout, stdout, {flag:"wx"});
        await writeFile(paths.stderr, stderr || "(no stderr)\n", {flag:"wx"});
        const gate = {schemaVersion:PC20_SCHEMA_VERSION, kind:"release-gate", candidateId:config.candidateId, candidatePackageSha256:config.candidatePackageSha256, ...result, stdout:undefined, stderr:undefined, stdoutPath:path.basename(paths.stdout), stdoutSha256:digest(stdout), stderrPath:path.basename(paths.stderr), stderrSha256:digest(stderr || "(no stderr)\n"), packagingSmokePath:path.basename(paths.smoke), packagingSmokeSha256:smoke.sha256, archivePath:path.basename(paths.archive), archiveSha256:config.candidatePackageSha256};
        validateGate(gate, config);
        const contents = `${JSON.stringify(gate, null, 2)}\n`;
        await writeFile(paths.gate, contents, {flag:"wx"});
        return {gate, sha256:digest(contents), reused:false};
    } catch (error) {
        await cleanPartialGateArtifacts(paths);
        await retainFailedGate(config, paths, error);
        throw error;
    }
}

function validateLifecycleReceipt(receipt, config, gateSha256) {
    if (!receipt || receipt.schemaVersion !== PC20_SCHEMA_VERSION || typeof receipt.receiptId !== "string" || !receipt.receiptId || !utc(receipt.issuedAt) || receipt.candidateId !== config.candidateId || receipt.releaseSha !== config.candidateId || receipt.candidatePackageSha256 !== config.candidatePackageSha256) fail("external lifecycle receipt is not bound to the accepted candidate/package");
    const git = receipt.git;
    if (!git || git.mergedToDevelop !== true || git.cleanDevelop !== true || git.developSha !== config.candidateId || git.pushedSha !== config.candidateId || typeof git.remote !== "string" || !git.remote || !utc(git.pushedAt)) fail("external lifecycle receipt lacks the clean develop merge/push of the accepted SHA");
    const publication = receipt.publication;
    if (!publication || publication.published !== true || publication.packageName !== config.packageName || publication.packageVersion !== config.packageVersion || publication.packageSha256 !== config.candidatePackageSha256 || publication.registryArchiveSha256 !== config.candidatePackageSha256 || publication.publishedSha !== config.candidateId || typeof publication.registryIdentity !== "string" || !publication.registryIdentity || !utc(publication.publishedAt)) fail("external lifecycle receipt lacks the exact registry publication identity");
    const drive = receipt.drive;
    if (!drive || drive.uploaded !== true || drive.readBack !== true || drive.releaseGateSha256 !== gateSha256 || drive.readBackSha256 !== gateSha256 || typeof drive.uploadId !== "string" || !drive.uploadId || !utc(drive.uploadedAt) || !utc(drive.readBackAt)) fail("external lifecycle receipt lacks a successful Drive upload/read-back tied to the release gate");
}

async function readTrustedLifecycleReceipt(config, gateSha256) {
    const target = path.resolve(config.lifecycleReceiptPath);
    const loaded = await readJson(target, "trusted external lifecycle receipt");
    if (digest(loaded.contents) !== config.lifecycleReceiptSha256) fail("trusted external lifecycle receipt digest differs from its supplied anchor");
    validateLifecycleReceipt(loaded.value, config, gateSha256);
    return {value:loaded.value, sha256:digest(loaded.contents)};
}

export async function validatePc20ReleaseGate(config, dependencies = {}) {
    validateConfig(config);
    const services = {validatePc19:validatePc19IndependentColdStartReview, readRepositoryState, runReleaseGate, ...dependencies};
    const pc19 = await services.validatePc19(config.reviewDirectory, {
        candidateId:config.candidateId,
        candidatePackageSha256:config.candidatePackageSha256,
        freezeReceiptPath:config.freezeReceiptPath,
        freezeReceiptSha256:config.freezeReceiptSha256,
    });
    if (!pc19 || pc19.candidateId !== config.candidateId) fail("PC-19 did not accept the exact release candidate");
    const permittedReceipts = pc20CandidateReceiptPaths(config.candidateId);
    assertExactCleanDevelop(services.readRepositoryState(config.repositoryDirectory, permittedReceipts), config.candidateId, "before the release gate");
    const gate = await obtainGate(config, services);
    assertExactCleanDevelop(services.readRepositoryState(config.repositoryDirectory, permittedReceipts), config.candidateId, "after the release gate");
    return {pc19, gate};
}

export async function validatePc20ReleaseCompletion(config, dependencies = {}) {
    const {pc19, gate} = await validatePc20ReleaseGate(config, dependencies);
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

function usage() { throw new Error("Usage: node scripts/pc-20-release-completion.mjs [--gate-only] --config <absolute-release-config.json>"); }
export async function main(argv = process.argv) {
    const gateOnly = argv.length === 5 && argv[2] === "--gate-only" && argv[3] === "--config";
    const configPath = gateOnly ? argv[4] : argv[3];
    if ((!gateOnly && (argv.length !== 4 || argv[2] !== "--config")) || !path.isAbsolute(configPath)) usage();
    const config = (await readJson(configPath, "release config")).value;
    const result = gateOnly ? await validatePc20ReleaseGate(config) : await validatePc20ReleaseCompletion(config);
    process.stdout.write(`PC20_RELEASE_${gateOnly ? "GATE" : "COMPLETION"}_PASS candidate=${result.gate?.gate.candidateId ?? result.candidateId}\n`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
