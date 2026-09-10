#!/usr/bin/env node
/**
 * PC-20's deliberately fail-closed release controller.
 *
 * This program is not a publisher credential shim.  An authorized release
 * operator supplies independently anchored PC-19 and lifecycle receipts; the
 * controller owns the one local release gate and writes append-only receipts
 * tying those operations to the same immutable source and package identities.
 */
import {createHash, randomBytes, timingSafeEqual} from "node:crypto";
import {appendFileSync, existsSync, readFileSync} from "node:fs";
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
const resourceKinds = new Set(["provider", "browser", "worker", "container", "process"]);
const resourceActions = new Set(["acquired", "released"]);
const registryAction = "registry-ready";

function required(value, name) {
    if (typeof value !== "string" || !value) fail(`${name} is required`);
    return value;
}

function outputPaths(config) {
    const root = path.resolve(required(config.outputDirectory, "outputDirectory"));
    const name = `pc-20-${config.candidateId}`;
    return {root, gate:path.join(root, `${name}-release-gate.json`), failed:path.join(root, `${name}-release-gate.failed.json`), completion:path.join(root, `${name}-completion.json`), smoke:path.join(root, `${name}-npm-pack-smoke.json`), archive:path.join(root, `${name}-package.tgz`), resources:path.join(root, `${name}-owned-resources.ndjson`), stdout:path.join(root, `${name}-release-gate.stdout.txt`), stderr:path.join(root, `${name}-release-gate.stderr.txt`)};
}

export function pc20CandidateReceiptPaths(candidateId, {includeCompletion = true, includeFailed = true} = {}) {
    const name = `pc-20-${candidateId}`;
    const paths = ["release-gate.json", "npm-pack-smoke.json", "package.tgz", "owned-resources.ndjson", "release-gate.stdout.txt", "release-gate.stderr.txt"];
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

/** A gate is allowed to run from an immutable candidate checkout before develop is fast-forwarded. */
export function assertPc20CandidateCheckout(repositoryDirectory, candidateId, phase = "PC-20 release gate", receiptOptions = {}) {
    const state = readRepositoryState(repositoryDirectory, pc20CandidateReceiptPaths(candidateId, receiptOptions));
    assertExactCandidateCheckout(state, candidateId, phase);
}

function assertExactCandidateCheckout(state, candidateId, phase) {
    if (!state || state.head !== candidateId || state.dirty) fail(`${phase} must run from a clean checkout of the accepted candidate SHA`);
}

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function processGroupAlive(pid) {
    if (process.platform === "win32" || !Number.isInteger(pid) || pid <= 0) return false;
    try { process.kill(-pid, 0); return true; } catch { return false; }
}

export function processIdentity(pid) {
    if (!Number.isInteger(pid) || pid <= 0 || process.platform !== "linux") return undefined;
    try {
        const contents = readFileSync(`/proc/${pid}/stat`, "utf8");
        const closingParenthesis = contents.lastIndexOf(")");
        const fields = contents.slice(closingParenthesis + 2).trim().split(/\s+/);
        const startTicks = fields[19];
        return /^\d+$/.test(startTicks) ? `linux-start-ticks:${startTicks}` : undefined;
    } catch { return undefined; }
}

function processSnapshot() {
    if (process.platform === "win32") return new Map();
    const result = spawnSync("ps", ["-eo", "pid=,ppid=,stat="], {encoding:"utf8"});
    const processes = new Map();
    for (const line of (result.stdout || "").split("\n")) {
        const match = /^\s*(\d+)\s+(\d+)\s+(\S+)/.exec(line);
        if (match) {
            const pid = Number(match[1]);
            processes.set(pid, {parentPid:Number(match[2]), zombie:match[3].startsWith("Z"), identity:processIdentity(pid)});
        }
    }
    return processes;
}

function resourceSignature(secret, record) {
    return createHash("sha256").update(secret).update("\0").update(JSON.stringify(record)).digest("hex");
}

/**
 * Production gate children use this authenticated writer to declare resources
 * which can outlive their parent process.  A provider/container without a PID
 * must subsequently write its `released` event; process-like resources are
 * drained and audited by the controller itself.
 */
const locallyAcquiredResourceIdentities = new Map();

export function registerPc20OwnedResource({kind, resourceId, pid, processIdentity:declaredIdentity}, action = "acquired", environment = process.env) {
    const registry = environment.POKIE_PC20_RESOURCE_REGISTRY;
    const secret = environment.POKIE_PC20_RESOURCE_REGISTRY_SECRET;
    if (!registry || !secret) return false;
    if (!resourceKinds.has(kind) || !resourceActions.has(action) || typeof resourceId !== "string" || !resourceId) throw new Error("PC-20 owned resource requires a supported kind, action, and resourceId");
    if (pid !== undefined && (!Number.isInteger(pid) || pid <= 0)) throw new Error("PC-20 owned resource PID must be a positive integer");
    const identityKey = `${kind}:${resourceId}`;
    const identity = pid === undefined ? undefined : (declaredIdentity || locallyAcquiredResourceIdentities.get(identityKey) || processIdentity(pid));
    if (pid !== undefined && (typeof identity !== "string" || !identity)) throw new Error(`PC-20 could not record process identity for PID ${pid}`);
    const record = {schemaVersion:1, action, kind, resourceId, ...(pid === undefined ? {} : {pid, processIdentity:identity})};
    appendFileSync(registry, `${JSON.stringify({...record, signature:resourceSignature(secret, record)})}\n`, {encoding:"utf8", mode:0o600});
    if (action === "acquired" && identity) locallyAcquiredResourceIdentities.set(identityKey, identity);
    return true;
}

function signedResourceRecord(value, secret) {
    if (!value || value.schemaVersion !== 1 || typeof value.resourceId !== "string" || !value.resourceId || typeof value.signature !== "string") return undefined;
    if (value.action === registryAction && value.kind !== "registry") return undefined;
    if (value.action !== registryAction && (!resourceActions.has(value.action) || !resourceKinds.has(value.kind))) return undefined;
    if (value.pid !== undefined && (!Number.isInteger(value.pid) || value.pid <= 0)) return undefined;
    if (value.pid !== undefined && (typeof value.processIdentity !== "string" || !value.processIdentity)) return undefined;
    if (value.pid === undefined && value.processIdentity !== undefined) return undefined;
    const {signature, ...record} = value;
    const expected = resourceSignature(secret, record);
    const actualBytes = Buffer.from(signature, "hex"), expectedBytes = Buffer.from(expected, "hex");
    if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) return undefined;
    return record;
}

function readOwnedResources(resourceRegistryPath, resourceRegistrySecret) {
    if (!resourceRegistryPath || !resourceRegistrySecret) fail("release gate ownership registry credentials are required");
    if (!existsSync(resourceRegistryPath)) fail("release gate ownership registry is missing");
    let contents;
    try { contents = readFileSync(resourceRegistryPath, "utf8"); } catch { fail("release gate ownership registry is unreadable"); }
    const records = [];
    let registryReady = false;
    for (const line of contents.split("\n")) {
        if (!line.trim()) continue;
        try {
            const record = signedResourceRecord(JSON.parse(line), resourceRegistrySecret);
            if (!record) fail("release gate ownership registry contains an invalid or unsigned record");
            if (record.action === registryAction) registryReady = true;
            else records.push(record);
        } catch (error) {
            if (error instanceof Error && error.message.startsWith("PC-20 release completion is invalid:")) throw error;
            fail("release gate ownership registry is malformed or unauthenticated");
        }
    }
    if (!registryReady) fail("release gate ownership registry lacks its authenticated readiness record");
    return records;
}

function createOwnershipTracker(pid, resourceRegistryPath, resourceRegistrySecret) {
    const ownedProcesses = new Map();
    const ownedResources = new Map();
    let captureFailure;
    const rememberProcess = (processId, identity = processIdentity(processId)) => {
        if (!Number.isInteger(processId) || processId <= 0) return;
        if (typeof identity !== "string" || !identity) {
            captureFailure = new Error(`release gate could not retain an identity for PID ${processId}`);
            return;
        }
        const previous = ownedProcesses.get(processId);
        if (previous && previous !== identity) {
            captureFailure = new Error(`release gate observed PID ${processId} with conflicting process identities`);
            return;
        }
        ownedProcesses.set(processId, identity);
    };
    rememberProcess(pid);
    const capture = ({final = false} = {}) => {
        const snapshot = processSnapshot();
        let changed = true;
        while (changed) {
            changed = false;
            for (const [childPid, details] of snapshot) {
                if (ownedProcesses.has(details.parentPid) && !ownedProcesses.has(childPid)) {
                    rememberProcess(childPid, details.identity);
                    changed = true;
                }
            }
        }
        let records;
        try { records = readOwnedResources(resourceRegistryPath, resourceRegistrySecret); }
        catch (error) {
            if (final) throw error;
            return;
        }
        for (const resource of records) {
            const key = `${resource.kind}:${resource.resourceId}`;
            const current = ownedResources.get(key);
            if (resource.action === "acquired") {
                if (current && (current.pid !== resource.pid || current.processIdentity !== resource.processIdentity)) {
                    captureFailure = new Error(`release gate resource ${key} was acquired with conflicting identities`);
                    continue;
                }
                ownedResources.set(key, {...resource, released:current?.released === true});
            } else if (!current) {
                captureFailure = new Error(`release gate resource ${key} was released before acquisition`);
            } else if (current.pid !== resource.pid || current.processIdentity !== resource.processIdentity) {
                captureFailure = new Error(`release gate resource ${key} was released with a different identity`);
            } else {
                ownedResources.set(key, {...current, released:true});
            }
            if (resource.pid !== undefined) rememberProcess(resource.pid, resource.processIdentity);
        }
        if (final && captureFailure) throw captureFailure;
    };
    const timer = setInterval(() => capture(), 10);
    return {ownedProcesses, ownedResources, capture, rememberProcess, stop:() => clearInterval(timer)};
}

function ownedProcessStatus(pid, identity) {
    const details = processSnapshot().get(pid);
    if (!details || details.zombie) return "gone";
    if (!identity || !details.identity) return "unverified";
    return details.identity === identity ? "alive" : "reused";
}

/** Terminate the root process group and every descendant observed while it ran. */
export async function drainProcessTree(child, graceMs = 1_000, ownedProcesses = new Map(), ownedResources = new Map()) {
    const pid = child?.pid;
    if (Number.isInteger(pid) && pid > 0 && !ownedProcesses.has(pid)) ownedProcesses.set(pid, processIdentity(pid));
    const ownedProcessIdentities = () => [...ownedProcesses].map(([processId, identity]) => ({pid:processId, processIdentity:identity}));
    const requiresExplicitRelease = (resource) => resource.pid === undefined || ["provider", "container", "browser"].includes(resource.kind);
    const resourcesReleased = () => [...ownedResources.values()].every((resource) => !requiresExplicitRelease(resource) || resource.released === true);
    if (ownedProcesses.size === 0) return {processGroupDrained:true, processTreeDrained:true, resourcesDrained:resourcesReleased(), ownedProcessIds:[], ownedProcessIdentities:[], ownedResources:[...ownedResources.values()], reusedProcessIds:[], termination:"not-started"};
    const terminate = (signal) => {
        for (const [processId, identity] of ownedProcesses) {
            // Never signal a PID (or a process group named for it) unless it is
            // still the exact process acquired by this gate.
            if (ownedProcessStatus(processId, identity) !== "alive") continue;
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
        if ([...ownedProcesses].some(([processId, identity]) => ownedProcessStatus(processId, identity) === "alive")) terminate("SIGKILL");
        await pause(25);
        const statuses = [...ownedProcesses].map(([processId, identity]) => [processId, ownedProcessStatus(processId, identity)]);
        const processTreeDrained = statuses.every(([, status]) => status === "gone" || status === "reused");
        return {processGroupDrained:processTreeDrained, processTreeDrained, resourcesDrained:processTreeDrained && resourcesReleased(), ownedProcessIds:[...ownedProcesses.keys()], ownedProcessIdentities:ownedProcessIdentities(), ownedResources:[...ownedResources.values()], reusedProcessIds:statuses.filter(([, status]) => status === "reused").map(([processId]) => processId), termination:"windows-owned-processes"};
    }
    if (Number.isInteger(pid) && pid > 0 && ownedProcessStatus(pid, ownedProcesses.get(pid)) === "alive" && processGroupAlive(pid)) terminate("SIGTERM");
    const deadline = Date.now() + graceMs;
    while ([...ownedProcesses].some(([processId, identity]) => ownedProcessStatus(processId, identity) === "alive") && Date.now() < deadline) await pause(25);
    if ([...ownedProcesses].some(([processId, identity]) => ownedProcessStatus(processId, identity) === "alive")) {
        terminate("SIGKILL");
        const killDeadline = Date.now() + graceMs;
        while ([...ownedProcesses].some(([processId, identity]) => ownedProcessStatus(processId, identity) === "alive") && Date.now() < killDeadline) await pause(25);
    }
    const statuses = [...ownedProcesses].map(([processId, identity]) => [processId, ownedProcessStatus(processId, identity)]);
    const processTreeDrained = statuses.every(([, status]) => status === "gone" || status === "reused");
    const rootAlive = Number.isInteger(pid) && pid > 0 && ownedProcessStatus(pid, ownedProcesses.get(pid)) === "alive";
    return {processGroupDrained:!rootAlive, processTreeDrained, resourcesDrained:processTreeDrained && resourcesReleased(), ownedProcessIds:[...ownedProcesses.keys()], ownedProcessIdentities:ownedProcessIdentities(), ownedResources:[...ownedResources.values()], reusedProcessIds:statuses.filter(([, status]) => status === "reused").map(([processId]) => processId), termination:"tracked-process-tree"};
}

/**
 * Run one bounded process group.  The finally block is intentional: process
 * ownership is a release invariant on every exit path, including spawn error,
 * AbortSignal cancellation and timer expiry.
 */
export async function runBoundedProcess(command, args, {cwd, timeoutMs = 60 * 60 * 1000, signal, env = process.env, spawnCommand = spawn, ownedProcessIds = [], resourceRegistryPath, resourceRegistrySecret = randomBytes(32).toString("hex")} = {}) {
    const startedAt = now();
    let child;
    let timedOut = false;
    let cancelled = false;
    let timeout;
    let abort;
    let output = "", errorOutput = "", exitCode = null, spawnError, tracker, drainage = {processGroupDrained:true, processTreeDrained:true, resourcesDrained:true, ownedProcessIds:[], ownedProcessIdentities:[], ownedResources:[]};
    let failure;
    try {
        if (signal?.aborted) { cancelled = true; throw new Error("release gate was cancelled before spawn"); }
        const ownershipHook = path.join(repositoryRoot, "scripts", "pc-20-resource-ownership-hook.cjs");
        const nodeOptions = [env.NODE_OPTIONS, resourceRegistryPath ? `--require=${ownershipHook}` : ""].filter(Boolean).join(" ");
        if (!resourceRegistryPath) fail("release gate ownership registry path is required");
        child = spawnCommand(command, args, {cwd:path.resolve(cwd), detached:process.platform !== "win32", stdio:["ignore", "pipe", "pipe"], env:{...env, POKIE_PC20_RESOURCE_REGISTRY:resourceRegistryPath, POKIE_PC20_RESOURCE_REGISTRY_SECRET:resourceRegistrySecret, NODE_OPTIONS:nodeOptions}});
        tracker = createOwnershipTracker(child.pid, resourceRegistryPath, resourceRegistrySecret);
        for (const processId of ownedProcessIds) if (Number.isInteger(processId) && processId > 0) tracker.rememberProcess(processId);
        child.stdout?.on("data", (chunk) => { output += chunk; });
        child.stderr?.on("data", (chunk) => { errorOutput += chunk; });
        const exited = new Promise((resolve) => {
            child.once("error", (error) => { spawnError = error; resolve(); });
            child.once("exit", (code) => { exitCode = code; resolve(); });
        });
        timeout = setTimeout(() => { timedOut = true; void drainProcessTree(child, 1_000, tracker.ownedProcesses, tracker.ownedResources); }, timeoutMs);
        abort = () => { cancelled = true; void drainProcessTree(child, 1_000, tracker.ownedProcesses, tracker.ownedResources); };
        signal?.addEventListener("abort", abort, {once:true});
        await exited;
        if (spawnError) throw spawnError;
    } catch (error) {
        failure = error;
    } finally {
        clearTimeout(timeout);
        if (abort) signal?.removeEventListener("abort", abort);
        try { tracker?.capture({final:true}); }
        catch (error) { failure = error; }
        tracker?.stop();
        drainage = await drainProcessTree(child, 1_000, tracker?.ownedProcesses, tracker?.ownedResources);
        if (!drainage.processGroupDrained || !drainage.processTreeDrained || !drainage.resourcesDrained) failure = new Error("release gate owned resources could not be drained");
    }
    const result = {command:`${command} ${args.join(" ")}`, startedAt, endedAt:now(), exitCode, timedOut, cancelled, processGroupDrained:drainage.processGroupDrained, processTreeDrained:drainage.processTreeDrained, resourcesDrained:drainage.resourcesDrained, ownedProcessIds:drainage.ownedProcessIds, ownedProcessIdentities:drainage.ownedProcessIdentities, ownedResources:drainage.ownedResources, stdout:output, stderr:errorOutput};
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
        spawnCommand:options.spawnCommand, resourceRegistryPath:paths.resources,
    });
    return result;
}

function validateSmokeReceipt(receipt, config, paths) {
    if (!receipt || receipt.schemaVersion !== PC20_SCHEMA_VERSION || receipt.kind !== "npm-pack-install-smoke" || receipt.complete !== true || receipt.suitePassed !== true || receipt.candidateId !== config.candidateId || receipt.candidatePackageSha256 !== config.candidatePackageSha256 || receipt.packageName !== config.packageName || receipt.packageVersion !== config.packageVersion || path.resolve(receipt.archivePath || "") !== paths.archive || !sha(receipt.archiveSha256) || receipt.archiveSha256 !== config.candidatePackageSha256 || !Number.isSafeInteger(receipt.archiveSizeBytes) || receipt.archiveSizeBytes <= 0 || !receipt.installed || receipt.installed.cli !== true || receipt.installed.studioApi !== true || receipt.installed.studioAssets !== true || receipt.installed.libraryWorker !== true || receipt.installed.processesDrained !== true || !receipt.cleanup || receipt.cleanup.temporaryInstallRemoved !== true || receipt.cleanup.temporaryPackDirectoryRemoved !== true || receipt.cleanup.processesDrained !== true) fail("npm-pack/install smoke receipt is incomplete or bound to a different package archive");
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

async function verifyGateArtifacts(gate, config, paths) {
    validateGate(gate, config);
    if (gate.archivePath !== path.basename(paths.archive) || gate.archiveSha256 !== config.candidatePackageSha256) fail("release gate record is not bound to the retained candidate archive");
    for (const [label, target, expectedDigest] of [["stdout", paths.stdout, gate.stdoutSha256], ["stderr", paths.stderr, gate.stderrSha256]]) {
        let contents;
        try { contents = await readFile(target); } catch { fail(`release gate ${label} artifact is missing`); }
        if (digest(contents) !== expectedDigest) fail(`release gate ${label} artifact digest differs from its retained record`);
    }
}

function validateGate(gate, config) {
    if (!gate || gate.schemaVersion !== PC20_SCHEMA_VERSION || gate.kind !== "release-gate" || gate.candidateId !== config.candidateId || gate.candidatePackageSha256 !== config.candidatePackageSha256 || gate.command !== "npm run check:release" || gate.exitCode !== 0 || gate.timedOut || gate.cancelled || gate.processGroupDrained !== true || gate.processTreeDrained !== true || gate.resourcesDrained !== true || !Array.isArray(gate.ownedResources) || !Array.isArray(gate.ownedProcessIdentities) || !gate.ownedProcessIdentities.every((owned) => Number.isInteger(owned?.pid) && owned.pid > 0 && typeof owned.processIdentity === "string" && owned.processIdentity) || gate.stdoutPath !== path.basename(outputPaths(config).stdout) || gate.stderrPath !== path.basename(outputPaths(config).stderr) || gate.packagingSmokePath !== path.basename(outputPaths(config).smoke) || gate.archivePath !== path.basename(outputPaths(config).archive) || !sha(gate.stdoutSha256) || !sha(gate.stderrSha256) || !sha(gate.packagingSmokeSha256) || gate.archiveSha256 !== config.candidatePackageSha256 || !utc(gate.startedAt) || !utc(gate.endedAt) || Date.parse(gate.startedAt) > Date.parse(gate.endedAt)) fail("release gate record is incomplete, failed, or bound to a different candidate");
}

function validateFailedGate(gate, config) {
    if (!gate || gate.schemaVersion !== PC20_SCHEMA_VERSION || gate.kind !== "release-gate-failed" || gate.candidateId !== config.candidateId || gate.candidatePackageSha256 !== config.candidatePackageSha256 || gate.command !== "npm run check:release" || gate.success !== false || typeof gate.failure !== "string" || !gate.failure || !utc(gate.failedAt) || gate.processGroupDrained !== true || gate.processTreeDrained !== true || gate.resourcesDrained !== true) fail("failed release gate record is incomplete or bound to a different candidate");
}

async function cleanPartialGateArtifacts(paths) {
    await Promise.all([paths.smoke, paths.archive, paths.resources, paths.stdout, paths.stderr].map((target) => rm(target, {force:true})));
}

async function retainFailedGate(config, paths, error) {
    const result = error?.pc20Result || {};
    const failed = {schemaVersion:PC20_SCHEMA_VERSION, kind:"release-gate-failed", candidateId:config.candidateId, candidatePackageSha256:config.candidatePackageSha256, command:"npm run check:release", success:false, failedAt:now(), failure:error instanceof Error ? error.message : String(error), exitCode:result.exitCode ?? null, timedOut:result.timedOut === true, cancelled:result.cancelled === true, processGroupDrained:result.processGroupDrained !== false, processTreeDrained:result.processTreeDrained !== false, resourcesDrained:result.resourcesDrained !== false, ownedProcessIds:Array.isArray(result.ownedProcessIds) ? result.ownedProcessIds : [], ownedProcessIdentities:Array.isArray(result.ownedProcessIdentities) ? result.ownedProcessIdentities : []};
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
        await verifyGateArtifacts(existing.value, config, paths);
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
        await verifyGateArtifacts(gate, config, paths);
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
    if (!git || git.mergedToDevelop !== true || git.cleanDevelop !== true || git.developSha !== config.candidateId || git.pushedSha !== config.candidateId || git.remoteDevelopSha !== config.candidateId || typeof git.remote !== "string" || !git.remote || !utc(git.pushedAt)) fail("external lifecycle receipt lacks the clean develop merge/push of the accepted SHA");
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
    assertExactCandidateCheckout(services.readRepositoryState(config.repositoryDirectory, pc20CandidateReceiptPaths(config.candidateId, {includeCompletion:false, includeFailed:false})), config.candidateId, "before the release gate");
    const gate = await obtainGate(config, services);
    assertExactCandidateCheckout(services.readRepositoryState(config.repositoryDirectory, pc20CandidateReceiptPaths(config.candidateId, {includeCompletion:false, includeFailed:false})), config.candidateId, "after the release gate");
    return {pc19, gate};
}

/**
 * The protected publisher receives a gate that the controller has already
 * validated.  It must never start (or repeat) that official composite; it
 * revalidates the retained, candidate-bound artifacts before advancing
 * develop.  Keeping this narrower than validatePc20ReleaseGate also makes the
 * handoff independently executable without reinterpreting mutable PC-19
 * review inputs.
 */
export async function validatePc20RetainedReleaseGate(config, dependencies = {}) {
    validateConfig(config);
    const services = {readRepositoryState, ...dependencies};
    const paths = outputPaths(config);
    assertExactCandidateCheckout(services.readRepositoryState(config.repositoryDirectory, pc20CandidateReceiptPaths(config.candidateId, {includeCompletion:false, includeFailed:false})), config.candidateId, "before the authorized lifecycle");
    if (!existsSync(paths.gate)) fail("the authorized lifecycle requires an existing immutable green release gate");
    const existing = await readJson(paths.gate, "release gate record");
    await verifyGateArtifacts(existing.value, config, paths);
    const smoke = await verifySmokeReceipt(config, paths);
    if (existing.value.packagingSmokeSha256 !== smoke.sha256) fail("release gate record is not bound to its retained packaging smoke receipt");
    return {gate:existing.value, sha256:digest(existing.contents), reused:true};
}

export async function validatePc20ReleaseCompletion(config, dependencies = {}) {
    const {pc19, gate} = await validatePc20ReleaseGate(config, dependencies);
    const lifecycle = await readTrustedLifecycleReceipt(config, gate.sha256);
    const paths = outputPaths(config);
    if (existsSync(paths.completion)) {
        const existing = await readJson(paths.completion, "completion record");
        validateCompletion(existing.value, config, pc19, gate.sha256, lifecycle.sha256);
        return {...existing.value, reused:true};
    }
    const completion = {schemaVersion:PC20_SCHEMA_VERSION, kind:"campaign-completion", campaign:"phase7-product-coherence", stepId:"PC-20", completedAt:now(), candidateId:config.candidateId, candidatePackageSha256:config.candidatePackageSha256, pc19:{frozenFindingsSha256:pc19.frozenFindingsSha256, freezeReceiptSha256:pc19.freezeReceiptSha256, coverageIds:pc19.coverageIds}, releaseGateSha256:gate.sha256, lifecycleReceiptSha256:lifecycle.sha256};
    const contents = `${JSON.stringify(completion, null, 2)}\n`;
    try { await writeFile(paths.completion, contents, {flag:"wx"}); } catch { fail("completion record was concurrently created; retry so its immutable contents can be validated"); }
    return completion;
}

function validateCompletion(completion, config, pc19, gateSha256, lifecycleSha256) {
    if (!completion || completion.schemaVersion !== PC20_SCHEMA_VERSION || completion.kind !== "campaign-completion" || completion.campaign !== "phase7-product-coherence" || completion.stepId !== "PC-20" || !utc(completion.completedAt) || completion.candidateId !== config.candidateId || completion.candidatePackageSha256 !== config.candidatePackageSha256 || completion.releaseGateSha256 !== gateSha256 || completion.lifecycleReceiptSha256 !== lifecycleSha256 || !completion.pc19 || completion.pc19.frozenFindingsSha256 !== pc19.frozenFindingsSha256 || completion.pc19.freezeReceiptSha256 !== pc19.freezeReceiptSha256 || !Array.isArray(completion.pc19.coverageIds) || completion.pc19.coverageIds.length !== pc19.coverageIds.length || completion.pc19.coverageIds.some((coverageId, index) => coverageId !== pc19.coverageIds[index])) fail("existing completion record is not the exact immutable completion being requested");
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
