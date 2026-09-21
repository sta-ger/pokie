#!/usr/bin/env node
/** Execute one isolated, packed-CLI and rendered-Studio P8-05 persona audit. */
import {createHash, randomBytes} from "node:crypto";
import {spawn, spawnSync} from "node:child_process";
import {mkdir, mkdtemp, readFile, readdir, rm, writeFile} from "node:fs/promises";
import {existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {createServer} from "node:net";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";
import WebSocket from "ws";
import {P805_PERSONAS, P805_REQUIRED_OBSERVATIONS, P805_SCREEN_CONTROL_STATES, P805_WORKFLOW_CONTRACTS} from "./p8-05-product-readiness-campaign.mjs";
import {createPc20OwnershipTracker, drainProcessTree, processIdentity, registerPc20OwnedResource} from "./pc-20-release-completion.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const digest = (value) => createHash("sha256").update(value).digest("hex");
const now = () => new Date().toISOString();
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const fail = (message) => { throw new Error(`P8-05 Valera browser audit is invalid: ${message}`); };
async function freeLoopbackPort() {
    const server = createServer();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (!address || typeof address === "string") fail("could not reserve a loopback port");
    return address.port;
}

export function validateP805RenderedPersonaAudit(audit) {
    const rendered = audit?.rendered, workflowPersonas = audit?.workflowPersonas ?? [audit?.persona], expected = P805_REQUIRED_OBSERVATIONS[audit?.persona] ?? [];
    if (!P805_PERSONAS.includes(audit?.persona) || !rendered || rendered.execution !== "packed-public-cli-built-studio-rendered-controls" || !["wide", "compact", "narrow"].every((viewport) => rendered.viewports?.includes(viewport)) || !rendered.measurements || !["consoleExceptions", "unhandledRequestFailures", "inaccessiblePrimaryActions", "unexplainedDisabledControls", "namedRegions"].every((name) => Number.isSafeInteger(rendered.measurements[name]) && rendered.measurements[name] >= 0) || rendered.measurements.namedRegions < 1 || rendered.measurements.visibleFocus !== true || typeof rendered.measurements.documentOverflow !== "boolean" || !Array.isArray(rendered.actions) || rendered.actions.length < expected.length) fail(`rendered ${audit?.persona ?? "persona"} audit lacks measured public-browser observations`);
    if (!Array.isArray(workflowPersonas) || workflowPersonas.length === 0 || workflowPersonas.some((persona) => !P805_PERSONAS.includes(persona)) || new Set(workflowPersonas).size !== workflowPersonas.length || !workflowPersonas.includes(audit.persona)) fail(`rendered ${audit.persona} audit has an invalid packed workflow persona registry`);
    if (!audit.packageIdentity || audit.packageIdentity.archiveSha256 !== audit.candidatePackageSha256 || !/^[a-f0-9]{64}$/i.test(audit.packageIdentity.candidatePackageJsonSha256 ?? "") || !/^[a-f0-9]{64}$/i.test(audit.packageIdentity.declaredCandidateExecutableSha256 ?? "") || audit.packageIdentity.candidateExecutableSha256 !== audit.packageIdentity.declaredCandidateExecutableSha256 || !/^[a-f0-9]{64}$/i.test(audit.packageIdentity.candidateExecutableReceiptSha256 ?? "") || typeof audit.packageIdentity.candidateExecutableReceiptId !== "string" || !audit.packageIdentity.candidateExecutableReceiptId || typeof audit.packageIdentity.candidateExecutableReceiptIssuer !== "string" || !audit.packageIdentity.candidateExecutableReceiptIssuer || !/^[a-f0-9]{64}$/i.test(audit.packageIdentity.candidateTreeManifestSha256 ?? "") || !/^[a-f0-9]{40}$/i.test(audit.packageIdentity.candidateTreeObjectId ?? "") || audit.packageIdentity.candidateTreeManifestCandidateId !== audit.candidateId || !Number.isSafeInteger(audit.packageIdentity.candidateExecutableFiles) || audit.packageIdentity.candidateExecutableFiles < 1 || audit.packageIdentity.archiveGitHead !== audit.candidateId || typeof audit.packageIdentity.installedCli !== "string" || !audit.packageIdentity.installedCli || !audit.packageIdentity.installedPackageJsonSha256) fail(`rendered ${audit.persona} audit does not prove its installed archive executable contents are this candidate`);
    if (!Array.isArray(rendered.responsive) || !["wide", "compact", "narrow"].every((viewport) => rendered.responsive.some((measurement) => measurement?.viewport === viewport && measurement?.overflow === false && measurement?.visibleFocus === true && measurement?.screenshotEvidenceId))) fail(`rendered ${audit.persona} audit lacks measured wide, compact, and narrow responsive states`);
    for (const persona of workflowPersonas) for (const observation of P805_REQUIRED_OBSERVATIONS[persona]) for (const viewport of ["wide", "compact", "narrow"]) { const contract = P805_WORKFLOW_CONTRACTS[persona][observation], action = rendered.actions.find((value) => (value?.persona ?? audit.persona) === persona && value?.observation === observation && value?.viewport === viewport), state = contract && P805_SCREEN_CONTROL_STATES[contract.route], expectedLifecycle = contract?.body ? {kind:"operation", value:contract.body} : {kind:"navigation", value:contract?.route}; if (!contract || !state || !action || typeof action.route !== "string" || !action.route.endsWith(`/project/${contract.route}`) && !action.route.endsWith(`/${contract.route}`) || action.screenState !== contract.route || action.screenNavigationControl !== state.navigationControl || typeof action.stableControlId !== "string" || !action.stableControlId || action.domControlId !== action.stableControlId || action.identityAttribute !== "id" || action.interaction?.stableControlId !== action.stableControlId || action.interaction?.identityAttribute !== "id" || action.interaction?.lifecycle?.kind !== expectedLifecycle.kind || action.interaction?.lifecycle?.value !== expectedLifecycle.value || action.precondition?.enabled !== true || action.precondition?.disabled !== false || action.precondition?.disabledExplanation !== null || action.precondition?.accessibleName !== action.interaction?.matchedLabel || typeof action.browserRequestId !== "string" || !action.browserRequestId || action.visibleTerminal?.state !== "rendered" || action.visibleTerminal?.changedAfterRequest !== true || action.visibleTerminal?.observedAfterRequestId !== action.browserRequestId || action.visibleTerminal?.resultSha256 !== action.terminal?.resultSha256 || action.expectedControl !== contract.control || (action.expectedMethod !== undefined && (action.expectedMethod !== contract.method || action.expectedBodyKind !== (contract.body ?? null))) || action.expectedApi !== contract.api || action.expectedArtifact !== (contract.artifact ?? null) || action.expectedTerminal !== contract.terminal || !action.terminal || !["completed", "success", "ok", "valid", "partial"].includes(action.terminal.status) || !/^[a-f0-9]{64}$/i.test(action.terminal.resultSha256 ?? "") || !action.evidenceId || !action.screenshotEvidenceId || !Number.isSafeInteger(action.elapsedMs) || action.elapsedMs <= 0 || !action.interaction || action.interaction.keyboardFocused !== true || action.interaction.keyboardActivated !== true || action.interaction.activation !== "keyboard" || !Array.isArray(action.accessibility?.namedRegions) || action.accessibility.namedRegions.length === 0 || action.accessibility.visibleFocus !== true || !Number.isSafeInteger(action.accessibility.unexplainedDisabledControls) || action.accessibility.unexplainedDisabledControls < 0) fail(`rendered ${persona} audit lacks a DOM-bound three-viewport action for ${observation}`); }
    for (const name of ["reloadReconnect", "projectSwitch", "staleResponseIsolation", "unsavedWorkProtection", "serverRestart"]) if (rendered.recovery?.[name]?.observed !== true || !rendered.recovery[name].evidenceId) fail(`rendered ${audit.persona} audit lacks measured recovery observations`);
    for (const name of ["success", "actionableFailure", "cooperativeCancellation", "retryWithoutPartialArtifacts"]) if (rendered.jobs?.[name]?.observed !== true || !rendered.jobs[name].evidenceId) fail(`rendered ${audit.persona} audit lacks measured success/failure/cancellation/retry observations`);
    if (!audit.cleanup || audit.cleanup.processTreeDrained !== true || audit.cleanup.resourcesDrained !== true || audit.cleanup.contextRemoved !== true || !audit.cleanup.evidenceId) fail(`rendered ${audit.persona} audit lacks machine-measured cleanup`);
}

/** Polling is a value-returning boundary.  Job callers need the final durable
 * record, not merely proof that a predicate was eventually truthy. */
// A public screen control must either surface its state promptly or provide a
// visible failure.  Keeping the rendered boundary short also means the packed
// proof reports the particular stuck control instead of letting a synchronous
// test runner consume its entire outer timeout.
async function waitFor(predicate, label, timeout = 30000) {
    const until = Date.now() + timeout;
    for (;;) {
        const value = await predicate();
        if (value) return value;
        if (Date.now() > until) throw new Error(`Timed out waiting for ${label}`);
        await wait(125);
    }
}
function descendants(pid) { const listing = process.platform === "win32" ? "" : (spawnSync("ps", ["-eo", "pid=,ppid=,pgid="], {encoding:"utf8"}).stdout || ""), processes = new Map(); let rootGroup; for (const line of listing.split("\n")) { const match = /^\s*(\d+)\s+(\d+)\s+(\d+)/.exec(line); if (match) { const details = {parent:Number(match[2]), group:Number(match[3])}; processes.set(Number(match[1]), details); if (Number(match[1]) === pid) rootGroup = details.group; } } const owned = new Map(); if (Number.isInteger(pid) && pid > 0) owned.set(pid, processIdentity(pid)); let changed = true; while (changed) { changed = false; for (const [child, details] of processes) if ((owned.has(details.parent) || (rootGroup !== undefined && details.group === rootGroup)) && !owned.has(child)) { owned.set(child, processIdentity(child)); changed = true; } } return owned; }
async function terminate(child) { if (!child?.pid) return {processTreeDrained:true, resourcesDrained:true, ownedProcessIds:[]}; const result = await drainProcessTree(child, 5_000, descendants(child.pid)); if (!result.processTreeDrained || !result.resourcesDrained) fail("owned Studio/browser process tree could not be drained"); return result; }
async function responseJson(url, options) { const response = await fetch(url, options); if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`); return response.json(); }
async function connect(devtools) {
    const target = await responseJson(`${devtools}/json/new?${encodeURIComponent("about:blank")}`, {method:"PUT"}), socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
    let id = 0;
    const pending = new Map(), events = [];
    // Chromium emits a high-volume stream of data/loading notifications for
    // every Studio bundle.  Retaining all of them makes each later
    // `slice(cursor).find(...)` progressively more expensive and can turn the
    // packed whole-file workflow into the very performance regression it is
    // intended to detect.  Keep the machine-observable events that bind a
    // browser action to its request/result and those needed for diagnostics.
    const retainedEvents = new Set([
        "Network.requestWillBeSent",
        "Network.responseReceived",
        "Network.loadingFailed",
        "Runtime.exceptionThrown",
        "Log.entryAdded",
    ]);
    socket.on("message", (raw) => {
        const value = JSON.parse(raw.toString());
        if (value.id === undefined) {
            if (retainedEvents.has(value.method)) events.push(value);
            return;
        }
        const job = pending.get(value.id);
        if (!job) return;
        pending.delete(value.id);
        value.error ? job.reject(new Error(JSON.stringify(value.error))) : job.resolve(value.result);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const messageId = ++id;
        pending.set(messageId, {resolve, reject});
        socket.send(JSON.stringify({id:messageId, method, params}));
    });
    // Enable domains in order.  Chromium can emit domain events while a
    // simultaneous enable burst is still being negotiated; serial enabling
    // keeps every response associated with this freshly opened rendered page.
    for (const method of ["Page.enable", "Runtime.enable", "Log.enable", "Network.enable"]) await send(method);
    const close = async () => {
        if (socket.readyState === WebSocket.CLOSED) return;
        await new Promise((resolve) => { socket.once("close", resolve); socket.close(); });
    };
    return {send, events, close};
}
function optionsFrom(argv) { const args = argv.slice(2), values = {}; for (let index = 0; index < args.length; index += 2) { if (!args[index]?.startsWith("--") || values[args[index]] || args[index + 1] === undefined) fail("usage: --persona <persona> --phase <initial|retest> --candidate <sha> --package-sha256 <sha> --candidate-executable-sha256 <sha> --candidate-executable-receipt <absolute-json> --candidate-executable-receipt-sha256 <sha256> --packed-package <absolute-tgz> --output <absolute-path> [--packed-cli <absolute-path>] [--workflow-personas <comma-separated-personas>]"); values[args[index]] = args[index + 1]; } const persona = values["--persona"]; return {persona, workflowPersonas:(values["--workflow-personas"] ?? persona ?? "").split(",").filter(Boolean), phase:values["--phase"], candidateId:values["--candidate"], candidatePackageSha256:values["--package-sha256"], candidateExecutableSha256:values["--candidate-executable-sha256"], candidateExecutableReceipt:{path:values["--candidate-executable-receipt"], sha256:values["--candidate-executable-receipt-sha256"]}, packedPackage:values["--packed-package"], output:values["--output"], packedCli:values["--packed-cli"] ?? path.join(root, "dist/cli/pokie.js")}; }
function validOptions(value) { return P805_PERSONAS.includes(value?.persona) && Array.isArray(value?.workflowPersonas) && value.workflowPersonas.length > 0 && value.workflowPersonas.every((persona) => P805_PERSONAS.includes(persona)) && new Set(value.workflowPersonas).size === value.workflowPersonas.length && ["initial", "retest"].includes(value.phase) && /^[a-f0-9]{40}$/i.test(value.candidateId ?? "") && /^[a-f0-9]{64}$/i.test(value.candidatePackageSha256 ?? "") && /^[a-f0-9]{64}$/i.test(value.candidateExecutableSha256 ?? "") && path.isAbsolute(value?.candidateExecutableReceipt?.path ?? "") && /^[a-f0-9]{64}$/i.test(value?.candidateExecutableReceipt?.sha256 ?? "") && ["output", "packedPackage"].every((key) => path.isAbsolute(value[key] ?? "")); }

function childResult(child, label, expectedExitCode = 0, timeoutMs = 120_000) {
    return new Promise((resolve, reject) => {
        let stdout = "", stderr = "";
        let settled = false;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            child.kill("SIGTERM");
            reject(new Error(`${label} exceeded its ${timeoutMs}ms public-command budget`));
        }, timeoutMs);
        const complete = (code, signal) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            const result = {label, exitCode:code, signal, stdout, stderr};
            if (expectedExitCode !== undefined && code !== expectedExitCode) reject(new Error(`${label} exited ${code ?? "null"}: ${stderr || stdout}`));
            else resolve(result);
        };
        child.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
        child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
        child.once("error", (error) => { if (!settled) { settled = true; clearTimeout(timer); reject(error); } });
        child.once("exit", complete);
        // A few wrapped launchers close their handles before Node delivers an
        // exit notification.  The close status is still the public command's
        // terminal status, so retain it as an equivalent bounded completion.
        child.once("close", complete);
    });
}

/** Bind every installed executable to the package's immutable gitHead and
 * retain a digest of that exact executable manifest.  package.json bytes
 * alone are not an executable provenance claim. */
async function candidateExecutableManifest(installedRoot, candidateId, services) {
    const files = [];
    const collect = async (directory, relative = "") => {
        for (const entry of await readdir(directory, {withFileTypes:true})) {
            const next = path.join(relative, entry.name), target = path.join(directory, entry.name);
            if (entry.isDirectory()) await collect(target, next);
            else if (entry.isFile() && (next === "package.json" || next.startsWith(`dist${path.sep}`))) files.push(next.replaceAll(path.sep, "/"));
        }
    };
    await collect(installedRoot);
    if (!files.some((value) => value === "package.json") || !files.some((value) => value.startsWith("dist/"))) fail("packed archive has no installed executable package contents");
    const entries = [];
    for (const file of files.sort()) {
        const installed = await services.readFile(path.join(installedRoot, file));
        entries.push({path:file, sha256:digest(installed)});
    }
    const packageJson = JSON.parse((await services.readFile(path.join(installedRoot, "package.json"))).toString("utf8"));
    if (packageJson.gitHead !== candidateId) fail("packed archive gitHead is not the declared candidate");
    return {sha256:digest(JSON.stringify(entries)), files:entries.length};
}

/**
 * Calculate the same executable projection from the declared git tree before
 * accepting an archive.  The candidate commit is the authority here: a
 * campaign argument cannot turn an arbitrary archive into that commit merely
 * by repeating a digest supplied by the campaign itself.
 */
function candidateTreeExecutableManifest(candidateId) {
    // `dist` is deliberately not committed.  Bind a receipt to the complete
    // *source projection* that produces the packed executable instead of
    // pretending package.json alone identifies the JavaScript in an archive.
    // The external pack verifier then binds its independently calculated dist
    // projection to this immutable candidate source manifest.
    const listing = spawnSync("git", ["ls-tree", "-r", "--name-only", candidateId, "--", "package.json", "package-lock.json", "tsconfig.json", "cli", "src", "scripts", "generate-barrels.js"], {cwd:root, encoding:"utf8"});
    if (listing.status !== 0) fail("declared candidate executable tree cannot be read");
    const files = listing.stdout.split("\n").filter(Boolean).filter((file) => file === "package.json" || file === "package-lock.json" || file === "tsconfig.json" || file === "generate-barrels.js" || file.startsWith("cli/") || file.startsWith("src/") || file.startsWith("scripts/"));
    if (!files.includes("package.json")) fail("declared candidate has no package declaration");
    const entries = files.sort().map((file) => {
        const object = spawnSync("git", ["rev-parse", `${candidateId}:${file}`], {cwd:root, encoding:"utf8"});
        if (object.status !== 0 || !/^[a-f0-9]{40}$/i.test(object.stdout.trim())) fail(`declared candidate cannot resolve executable ${file}`);
        return {path:file, gitBlob:object.stdout.trim()};
    });
    const tree = spawnSync("git", ["rev-parse", `${candidateId}^{tree}`], {cwd:root, encoding:"utf8"}).stdout.trim();
    if (!/^[a-f0-9]{40}$/i.test(tree)) fail("declared candidate tree cannot be resolved");
    return {candidateId, tree, files:entries, sha256:digest(JSON.stringify({tree, entries}))};
}

/** A pack-producing verifier, not the campaign, attests to the candidate's
 * executable projection.  `gitHead` is useful corroboration but cannot prove
 * that an arbitrary tarball's dist files were packed from that commit. */
async function trustedCandidateExecutableReceipt(receipt, candidateId, packageSha256, executableSha256, services, output) {
    if (!receipt || !path.isAbsolute(receipt.path ?? "") || path.resolve(receipt.path).startsWith(`${path.resolve(output)}${path.sep}`) || !/^[a-f0-9]{64}$/i.test(receipt.sha256 ?? "")) fail("candidate executable receipt must be an external verifier-owned digest");
    let bytes, value;
    try { bytes = await services.readFile(receipt.path); value = JSON.parse(bytes.toString("utf8")); } catch { fail("candidate executable receipt is unreadable JSON"); }
    const authentication = value?.authentication;
    if (digest(bytes) !== receipt.sha256 || value?.kind !== "p8-05-candidate-executable-receipt" || typeof value?.issuer !== "string" || !value.issuer || typeof value?.receiptId !== "string" || !value.receiptId || value?.candidateId !== candidateId || value?.candidatePackageSha256 !== packageSha256 || value?.candidateExecutableSha256 !== executableSha256 || !/^[a-f0-9]{64}$/i.test(value?.candidateTreeManifestSha256 ?? "") || !/^[a-f0-9]{40}$/i.test(value?.candidateTreeObjectId ?? "") || !value?.candidateTreeManifestCandidateId || value.candidateTreeManifestCandidateId !== candidateId || authentication?.scheme !== "verifier-owned-candidate-tree" || typeof authentication?.verifierId !== "string" || !authentication.verifierId || authentication.attestedCandidateId !== candidateId || authentication.attestedCandidateTreeManifestSha256 !== value.candidateTreeManifestSha256 || authentication.attestedExecutableSha256 !== executableSha256) fail("candidate executable receipt is not a trusted candidate-derived manifest");
    return value;
}


/** Runs one persona in a fresh workspace, configuration root, and browser profile. */
export async function runP805ValeraBrowserAudit(options, dependencies = {}) {
    if (!validOptions(options)) fail("runner configuration is incomplete");
    const services = {spawn, mkdir, mkdtemp, readFile, rm, writeFile, exists:existsSync, chromium:process.env.P805_CHROMIUM_BINARY ?? "chromium-browser", npm:process.env.npm_execpath ? process.execPath : "npm", npmArgs:process.env.npm_execpath ? [process.env.npm_execpath] : [], now, ...dependencies}, startedAt = services.now(), nonce = digest(`${startedAt}:${options.phase}:${options.persona}:${Math.random()}`).slice(0, 16), base = await services.mkdtemp(path.join(tmpdir(), `p8-05-${options.phase}-${options.persona}-`)), context = {workspace:path.join(base, "workspace"), configurationRoot:path.join(base, "configuration"), browserProfile:path.join(base, "browser-profile"), reused:false}, installationRoot = path.join(base, "packed-install"), port = await freeLoopbackPort(), devtoolsPort = await freeLoopbackPort(), origin = `http://127.0.0.1:${port}`, devtools = `http://127.0.0.1:${devtoolsPort}`, evidence = [], transcript = [], api = [], errors = [], observationEvidence = {}, timings = {startupMs:0, projectCreationMs:0, validationMs:0, buildMs:0, simulationMs:0, replayMs:0, cancellationMs:0};
    const save = async (kind, name, content, observationIds = []) => { const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content), relativePath = path.join(options.phase, options.persona, nonce, name), target = path.join(options.output, relativePath); await services.mkdir(path.dirname(target), {recursive:true}); await services.writeFile(target, bytes, {flag:"wx"}); const evidenceId = `${options.phase}-${options.persona}-${nonce}-${kind}-${evidence.length + 1}`; evidence.push({evidenceId, kind, path:relativePath, sha256:digest(bytes), sizeBytes:bytes.length, capturedAt:services.now(), candidateId:options.candidateId, candidatePackageSha256:options.candidatePackageSha256, observationIds}); for (const observation of observationIds) if (!observationEvidence[observation]) observationEvidence[observation] = evidenceId; return evidenceId; };
    const ownership = [], childOwners = new WeakMap();
    const ownershipEnvironment = (label, browserResource = false) => {
        const resourceRegistryPath = path.join(base, `${label.replaceAll(/[^a-z0-9]+/gi, "-")}-owned-resources.ndjson`), resourceRegistrySecret = randomBytes(32).toString("hex"), ownershipHook = path.join(root, "scripts", "pc-20-resource-ownership-hook.cjs");
        const env = {...process.env, POKIE_PC20_RESOURCE_REGISTRY:resourceRegistryPath, POKIE_PC20_RESOURCE_REGISTRY_SECRET:resourceRegistrySecret, NODE_OPTIONS:[process.env.NODE_OPTIONS, `--require=${ownershipHook}`].filter(Boolean).join(" ")};
        // Chromium cannot load NODE_OPTIONS.  Start the authenticated registry
        // before its spawn, then register its PID synchronously below; this
        // closes the detach/reparent window instead of relying on a final ps.
        if (browserResource) {
            const ready = spawnSync(process.execPath, ["-e", ""], {env, stdio:"ignore"});
            if (ready.status !== 0 || !existsSync(resourceRegistryPath)) fail(`could not initialize browser ownership registry for ${label}`);
        }
        return {resourceRegistryPath, resourceRegistrySecret, env, browserResource};
    };
    // Node-owned commands receive the authenticated PC-20 preload before they
    // can spawn children.  Browser descendants cannot load NODE_OPTIONS, so
    // their direct browser PID is recorded synchronously and its process tree
    // is continuously retained for the whole browser lifetime.
    const own = (label, child, ownerOptions = {}) => {
        const spawned = descendants(child?.pid), record = {label, pid:child?.pid, processGroupId:child?.pid, spawnedAt:services.now(), identity:processIdentity(child?.pid), spawnTimeProcessIdentities:[...spawned].map(([pid, identity]) => ({pid, identity})), ownedProcesses:spawned, child, resourceRegistryPath:ownerOptions.resourceRegistryPath, resourceRegistrySecret:ownerOptions.resourceRegistrySecret};
        if (ownerOptions.browserResource) {
            record.resourceId = `browser:${child?.pid}:${label}`;
            if (!registerPc20OwnedResource({kind:"browser", resourceId:record.resourceId, pid:child?.pid, processIdentity:record.identity}, "acquired", ownerOptions.env)) fail(`could not synchronously register browser ownership for ${label}`);
        }
        // The authenticated preload writes every Node child at acquisition;
        // this sampler is the complementary fallback for a native detached
        // descendant.  A 10ms full process-table scan can starve the CDP
        // event loop itself on a busy verifier host, so use a bounded cadence
        // while retaining spawn-time records and final drainage validation.
        if (ownerOptions.resourceRegistryPath) record.tracker = createPc20OwnershipTracker(child?.pid, ownerOptions.resourceRegistryPath, ownerOptions.resourceRegistrySecret, {captureIntervalMs:250});
        // Sample continuously enough to retain short-lived descendants, while
        // leaving the packed workflow enough CPU to measure its own behavior.
        // A 10ms synchronous `ps` loop made the observer itself a material
        // performance regression in the whole-file runner.
        record.descendantSampler = setInterval(() => { for (const [pid, identity] of descendants(record.pid)) record.ownedProcesses.set(pid, identity); record.tracker?.capture(); }, 1_000);
        ownership.push(record); childOwners.set(child, record); return child;
    };
    // Drain completed commands promptly.  Retaining every finished command's
    // 10ms process sampler until the final persona teardown creates enough
    // process-table traffic to hide the real user workflow behind the audit.
    const settleOwner = async (owner) => {
        if (!owner || owner.settled) return owner?.drain;
        clearInterval(owner.descendantSampler);
        if (owner.resourceId) registerPc20OwnedResource({kind:"browser", resourceId:owner.resourceId, pid:owner.pid, processIdentity:owner.identity}, "released", {POKIE_PC20_RESOURCE_REGISTRY:owner.resourceRegistryPath, POKIE_PC20_RESOURCE_REGISTRY_SECRET:owner.resourceRegistrySecret});
        owner.tracker?.capture({final:true});
        for (const [pid, identity] of descendants(owner.pid)) owner.ownedProcesses.set(pid, identity);
        // `childResult` has already observed a normal command exit.  Its
        // descendants still need ownership drainage, but holding each exited
        // command for the full server/browser grace period makes the packed
        // public workflow itself exceed its measured budget.
        const graceMs = owner.child.exitCode === null && owner.child.signalCode === null ? 5_000 : 250;
        owner.drain = await drainProcessTree(owner.child, graceMs, owner.tracker?.ownedProcesses ?? owner.ownedProcesses, owner.tracker?.ownedResources);
        if (!owner.drain.processTreeDrained || !owner.drain.resourcesDrained) fail(`owned ${owner.label} resources could not be drained`);
        owner.tracker?.stop(); owner.settled = true;
        return owner.drain;
    };
    const settleChild = (child) => settleOwner(childOwners.get(child));
    let studio, browser, cdp, audit, thrown, installedPackageBytes, candidatePackageJsonBytes, candidateExecutable;
    try {
        await services.mkdir(options.output, {recursive:true}); await Promise.all([context.workspace, context.configurationRoot, context.browserProfile, installationRoot].map((directory) => services.mkdir(directory, {recursive:true}))); const packageBytes = await services.readFile(options.packedPackage); if (digest(packageBytes) !== options.candidatePackageSha256) fail("packed package archive digest differs from declared candidate package identity");
        const installOwnership = ownershipEnvironment("packed-package-install"), installChild = own("packed-package-install", services.spawn(services.npm, [...services.npmArgs, "install", "--ignore-scripts", "--no-audit", "--no-fund", "--prefix", installationRoot, options.packedPackage], {cwd:context.workspace, env:{...installOwnership.env, HOME:context.configurationRoot, XDG_CONFIG_HOME:context.configurationRoot}, stdio:"pipe"}), installOwnership), install = await childResult(installChild, "packed package installation"); await settleChild(installChild); transcript.push(`[${services.now()}] PACKED_INSTALL\n${install.stdout}${install.stderr}`);
        const installedCli = path.join(installationRoot, "node_modules", ".bin", process.platform === "win32" ? "pokie.cmd" : "pokie"), installedPackageJson = path.join(installationRoot, "node_modules", "pokie", "package.json"); if (!services.exists(installedCli) || !services.exists(installedPackageJson)) fail("packed package installation did not expose its pokie launcher and package metadata"); installedPackageBytes = await services.readFile(installedPackageJson); const candidatePackage = spawnSync("git", ["show", `${options.candidateId}:package.json`], {cwd:root, encoding:"buffer"}); if (candidatePackage.status !== 0 || !candidatePackage.stdout?.length) fail("declared candidate does not expose package.json for archive binding"); candidatePackageJsonBytes = Buffer.from(candidatePackage.stdout); let installedPackage, candidateManifest; try { installedPackage = JSON.parse(installedPackageBytes.toString("utf8")); candidateManifest = JSON.parse(candidatePackageJsonBytes.toString("utf8")); } catch { fail("installed packed package metadata is not JSON"); } if (installedPackage?.name !== candidateManifest?.name || installedPackage?.version !== candidateManifest?.version || installedPackage?.gitHead !== options.candidateId) fail("installed archive package metadata is not bound to the declared candidate");
        const candidateTreeManifest = candidateTreeExecutableManifest(options.candidateId), candidateReceipt = await trustedCandidateExecutableReceipt(options.candidateExecutableReceipt, options.candidateId, options.candidatePackageSha256, options.candidateExecutableSha256, services, options.output);
        if (candidateReceipt.candidateTreeManifestSha256 !== candidateTreeManifest.sha256 || candidateReceipt.candidateTreeObjectId !== candidateTreeManifest.tree) fail("candidate executable receipt does not bind the declared candidate tree manifest");
        candidateExecutable = await candidateExecutableManifest(path.join(installationRoot, "node_modules", "pokie"), options.candidateId, services); if (candidateExecutable.sha256 !== options.candidateExecutableSha256) fail("packed archive executable manifest differs from the verifier-supplied declared candidate manifest"); const packedEnvironment = {...process.env, HOME:context.configurationRoot, XDG_CONFIG_HOME:context.configurationRoot, PATH:`${path.dirname(installedCli)}${path.delimiter}${process.env.PATH ?? ""}`}; const runPackedCli = async (label, args, expectedExitCode = 0) => { process.stderr.write(`P805_CLI command=${label} phase=start\n`); const commandOwnership = ownershipEnvironment(label), child = own(label, services.spawn(installedCli, args, {cwd:context.workspace, env:{...packedEnvironment, ...commandOwnership.env}, stdio:"pipe"}), commandOwnership); let result; try { result = await childResult(child, label, expectedExitCode); } finally { await settleChild(child); } transcript.push(`[${services.now()}] ${label} ${args.join(" ")}\n${result.stdout}${result.stderr}`); process.stderr.write(`P805_CLI command=${label} phase=complete\n`); return result; };
        const blueprint = path.join(context.workspace, "Valera audit blueprint.json"), workbook = path.join(context.workspace, "Valera audit.xlsx"), importedBlueprint = path.join(context.workspace, "Valera imported blueprint.json"), wasm = path.join(context.workspace, "Valera audit.wasm"), packageRoot = path.join(context.workspace, "Valera audit package"), simulationReport = path.join(context.workspace, "Valera simulation report.json"), renderedReport = path.join(context.workspace, "Valera simulation report.md"), diffReport = path.join(context.workspace, "Valera simulation diff.json"), replayArtifact = path.join(context.workspace, "Valera replay.json"), outcomeBundle = path.join(context.workspace, "Valera outcomes"), certificationConfig = path.join(context.workspace, "Valera certification config.json"), certificationBundle = path.join(context.workspace, "Valera certification"), serverSeed = path.join(context.workspace, "Valera server seed.txt"), seedCommitment = path.join(context.workspace, "Valera seed commitment.json"), roundCommitment = path.join(context.workspace, "Valera round commitment.json"), fairnessProof = path.join(context.workspace, "Valera fairness proof.json");
        const requireOutput = async (label, target) => { if (!services.exists(target)) fail(`${label} did not create its declared output ${target}`); };
        await runPackedCli("packed CLI create", ["create", "Valera audit", "--random", "--seed", "805", "--out", blueprint]); await requireOutput("packed CLI create", blueprint);
        await runPackedCli("packed CLI validate", ["validate", blueprint]); await runPackedCli("packed CLI reels", ["reel", "generate", blueprint, "--format", "json"]);
        const buildStart = Date.now();
        await runPackedCli("packed CLI PAR build", ["build", blueprint, "--target", "parWorkbook", "--out", workbook]); await requireOutput("packed CLI PAR build", workbook);
        await runPackedCli("packed CLI PAR export", ["par", "export", blueprint, "--out", path.join(context.workspace, "Valera direct.xlsx")]);
        await runPackedCli("packed CLI PAR import", ["par", "import", workbook, "--out", importedBlueprint]); await requireOutput("packed CLI PAR import", importedBlueprint);
        await runPackedCli("packed CLI package build", ["build", blueprint, "--target", "tsPackage", "--out", packageRoot]); await requireOutput("packed CLI package build", packageRoot);
        await runPackedCli("packed CLI WASM build", ["build", blueprint, "--target", "wasm", "--out", wasm]); await requireOutput("packed CLI WASM build", wasm);
        timings.buildMs = Date.now() - buildStart;
        await runPackedCli("packed CLI inspect", ["inspect", packageRoot]);
        await runPackedCli("packed CLI WASM inspect", ["inspect", wasm]);
        await runPackedCli("packed CLI WASM validate", ["validate", wasm]);
        await runPackedCli("packed CLI WASM run", ["run", wasm, "--seed", "p8-05-wasm"]);
        await runPackedCli("packed CLI sim", ["sim", packageRoot, "--rounds", "10", "--seed", "p8-05", "--out", simulationReport]); await requireOutput("packed CLI sim", simulationReport);
        await runPackedCli("packed CLI report", ["report", simulationReport, "--format", "markdown", "--out", renderedReport]); await requireOutput("packed CLI report", renderedReport);
        await runPackedCli("packed CLI diff", ["diff", simulationReport, simulationReport, "--out", diffReport]); await requireOutput("packed CLI diff", diffReport);
        await runPackedCli("packed CLI replay", ["replay", packageRoot, "--seed", "p8-05", "--round", "1", "--out", replayArtifact]); await requireOutput("packed CLI replay", replayArtifact);
        await runPackedCli("packed CLI Outcome Library export", ["export", blueprint, "--to", "outcomes", "--out", outcomeBundle]); await requireOutput("packed CLI Outcome Library export", outcomeBundle);
        await services.writeFile(certificationConfig, JSON.stringify({modes:[{modeName:"base", seed:"p8-05-certification", sampleCount:1}]}));
        await runPackedCli("packed CLI certification build", ["certification", "build", outcomeBundle, certificationConfig, "--out", certificationBundle]); await requireOutput("packed CLI certification build", certificationBundle);
        await runPackedCli("packed CLI certification verify", ["certification", "verify", certificationBundle, "--source", outcomeBundle]);
        await services.writeFile(serverSeed, "p8-05-server-seed\n");
        await runPackedCli("packed CLI fairness seed commit", ["fairness", "seed-commit", serverSeed, "--out", seedCommitment]); await requireOutput("packed CLI fairness seed commit", seedCommitment);
        await runPackedCli("packed CLI fairness commit", ["fairness", "commit", seedCommitment, "--client-seed", "p8-05-client-seed", "--nonce", "0", "--source", outcomeBundle, "--mode", "base", "--out", roundCommitment]); await requireOutput("packed CLI fairness commit", roundCommitment);
        await runPackedCli("packed CLI fairness reveal", ["fairness", "reveal", roundCommitment, "--server-seed", serverSeed, "--source", outcomeBundle, "--out", fairnessProof]); await requireOutput("packed CLI fairness reveal", fairnessProof);
        await runPackedCli("packed CLI fairness verify", ["fairness", "verify", fairnessProof, "--commitment", roundCommitment, "--source", outcomeBundle]);
        const servePort = await freeLoopbackPort(), serveOwnership = ownershipEnvironment("packed-cli-serve"), serveChild = own("packed CLI serve", services.spawn(installedCli, ["serve", packageRoot, "--host", "127.0.0.1", "--port", String(servePort)], {cwd:context.workspace, env:{...packedEnvironment, ...serveOwnership.env}, stdio:"pipe"}), serveOwnership);
        let serveOutput = "";
        serveChild.stdout?.on("data", (chunk) => { serveOutput += chunk.toString(); });
        serveChild.stderr?.on("data", (chunk) => { serveOutput += chunk.toString(); });
        // `serve` is a package development server, not a web-site generator:
        // a package without an index page correctly answers 404 at `/`.  Its
        // listener transcript plus any non-5xx loopback response proves the
        // installed public command is serving instead of mistaking that 404
        // for a semantic command failure.
        await waitFor(async () => { try { const response = await fetch(`http://127.0.0.1:${servePort}`); return response.status < 500 && /POKIE dev server listening/.test(serveOutput); } catch { return false; } }, "packed CLI serve");
        transcript.push(`[${services.now()}] packed CLI serve ${packageRoot} --port ${servePort}`);
        await settleChild(serveChild);
        await runPackedCli("packed CLI CI validate", ["validate", blueprint, "--format", "json"]);
        await runPackedCli("packed CLI invalid-input recovery", ["validate", path.join(context.workspace, "missing blueprint.json")], 1);
        const publicHelp = ["build", "certification", "client", "create", "dev", "diff", "edit", "export", "fairness", "generate", "import", "init", "inspect", "par", "reel", "run", "replay", "report", "sample", "serve", "sim", "validate"];
        for (const args of [["--help"], ...publicHelp.map((command) => [command, "--help"]), ["certification", "build", "--help"], ["certification", "verify", "--help"], ["fairness", "seed-commit", "--help"], ["fairness", "commit", "--help"], ["fairness", "reveal", "--help"], ["fairness", "verify", "--help"], ["par", "import", "--help"], ["par", "export", "--help"], ["reel", "generate", "--help"]]) await runPackedCli(`packed CLI help ${args.join("-")}`, args);
        const npxOwnership = ownershipEnvironment("packed-npx-help"), npxCli = path.join(path.dirname(path.dirname(process.execPath)), "lib", "node_modules", "npm", "bin", "npx-cli.js"); if (!services.exists(npxCli)) fail("the installed Node npx launcher is unavailable"); const npxChild = own("packed npx help", services.spawn(process.execPath, [npxCli, "--no-install", "--prefix", installationRoot, "pokie", "--help"], {cwd:installationRoot, env:{...packedEnvironment, ...npxOwnership.env}, stdio:"pipe"}), npxOwnership), npx = await childResult(npxChild, "packed npx help"); await settleChild(npxChild); transcript.push(`[${services.now()}] PACKED_NPX_HELP\n${npx.stdout}${npx.stderr}`);
        const startStudio = () => { const studioOwnership = ownershipEnvironment("studio"), child = own("studio", services.spawn(installedCli, ["--no-open", "--host", "127.0.0.1", "--port", String(port)], {cwd:context.workspace, detached:process.platform !== "win32", env:{...packedEnvironment, ...studioOwnership.env}, stdio:"pipe"}), studioOwnership); child.stdout?.on("data", (chunk) => transcript.push(chunk.toString())); child.stderr?.on("data", (chunk) => { errors.push(chunk.toString()); transcript.push(chunk.toString()); }); return child; }; const started = Date.now(); transcript.push(`[${services.now()}] START installed packed public CLI ${installedCli}`); studio = startStudio(); await waitFor(async () => { try { const response = await fetch(`${origin}/api/health`); api.push({path:"/api/health", status:response.status}); return response.ok; } catch { return false; } }, "built Studio API"); timings.startupMs = Date.now() - started;
        const browserOwnership = ownershipEnvironment("browser", true); browser = own("browser", services.spawn(services.chromium, ["--headless=new", "--no-sandbox", "--no-first-run", `--user-data-dir=${context.browserProfile}`, `--remote-debugging-address=127.0.0.1`, `--remote-debugging-port=${devtoolsPort}`, "about:blank"], {detached:process.platform !== "win32", env:browserOwnership.env, stdio:"pipe"}), browserOwnership); await waitFor(async () => { try { return Array.isArray(await responseJson(`${devtools}/json/list`)); } catch { return false; } }, "fresh browser profile"); cdp = await connect(devtools); const evaluate = async (source) => { const result = await cdp.send("Runtime.evaluate", {expression:source, returnByValue:true, awaitPromise:true}); if (result.exceptionDetails) fail(`rendered browser evaluation failed: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "unknown exception"}`); return result.result.value; };
        // Chromium's headless DevTools target needs the native virtual-key
        // code as well as the DOM key name to perform a button's default
        // keyboard activation.  Without it, focus evidence was recorded but
        // React's actual public action owner was never invoked.
        const pressEnter = async () => {
            await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:"Enter", code:"Enter", text:"\r", unmodifiedText:"\r", windowsVirtualKeyCode:13, nativeVirtualKeyCode:13});
            await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:"Enter", code:"Enter", windowsVirtualKeyCode:13, nativeVirtualKeyCode:13});
        };
        const pressSpace = async () => {
            await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:" ", code:"Space", text:" ", unmodifiedText:" ", windowsVirtualKeyCode:32, nativeVirtualKeyCode:32});
            await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:" ", code:"Space", windowsVirtualKeyCode:32, nativeVirtualKeyCode:32});
        };
        // A semantic observation is only valid when the browser itself issued
        // the declared request after the rendered control was activated.  Do
        // not "complete" a page click by making an unrelated Node-side fetch:
        // that was a convenient audit shortcut, but it hid broken forms and
        // disabled controls from the campaign.
        const browserRequest = async (contract, observation, cursor) => {
            const requestEvent = await waitFor(() => cdp.events.slice(cursor).find((event) => event.method === "Network.requestWillBeSent" && new URL(event.params.request.url).pathname === contract.api) || false, `${observation} rendered request`);
            const responseEvent = await waitFor(() => cdp.events.slice(cursor).find((event) => event.method === "Network.responseReceived" && event.params.requestId === requestEvent.params.requestId) || false, `${observation} rendered response`);
            const response = await cdp.send("Network.getResponseBody", {requestId:requestEvent.params.requestId}), body = response.body ?? "", payload = JSON.parse(body || "{}"), serialized = requestEvent.params.request.postData ?? "", entry = {observation, method:requestEvent.params.request.method, path:contract.api, bodyKind:contract.body ?? null, bodySha256:digest(serialized), status:responseEvent.params.response.status, responseSha256:digest(JSON.stringify(payload)), payload, browserRequestId:requestEvent.params.requestId, initiator:"rendered-control"};
            api.push(entry);
            if (entry.method !== contract.method || entry.status < 200 || entry.status >= 400 || payload?.ok === false || payload?.success === false || payload?.valid === false || payload?.error !== undefined || (Array.isArray(payload) && payload.length === 0) || ["failed", "error", "cancelled", "incomplete", "load-error", "invalid"].includes(payload?.status)) fail(`${observation} rendered control did not produce a successful semantic response`);
            const started = payload?.job ?? payload, jobId = started?.id;
            // Only contracts with an explicit durable-job route may be
            // polled.  Several public Studio operations (PAR export,
            // certification validation and fairness configuration) return a
            // completed semantic result directly; treating any response that
            // happens to contain an id as a job made those controls wait for a
            // request the page never performs.
            if (!contract.poll) return {...entry, terminal:{status:started?.status ?? "success", result:started, resultSha256:digest(JSON.stringify(started)), jobId:undefined, source:"response"}};
            if (typeof jobId !== "string" || !jobId) fail(`${observation} rendered control did not return the durable job required by its contract`);
            // Retain the *first terminal durable record*, including a failed
            // or cancelled one.  Polling only for a success used to turn a
            // useful terminal result into a timeout and let callers lose the
            // actual diagnostic that a persona saw.
            const terminalEvent = await waitFor(async () => {
                const expectedPath = contract.poll.replace("{id}", encodeURIComponent(jobId));
                // Polling receives queued/running snapshots before the
                // terminal record.  Select the newest browser response so an
                // earlier active snapshot cannot permanently mask the
                // completed public state.
                const event = cdp.events.slice(cursor).findLast((value) => value.method === "Network.responseReceived" && new URL(value.params.response.url).pathname === expectedPath);
                if (!event) return false;
                try {
                    const body = await cdp.send("Network.getResponseBody", {requestId:event.params.requestId}), result = JSON.parse(body.body || "{}");
                    return !["queued", "running", "cancelling", "pending"].includes(result?.status) ? {event, result} : false;
                } catch { return false; }
            }, `${observation} rendered terminal job`);
            api.push({observation, method:"GET", path:new URL(terminalEvent.event.params.response.url).pathname, status:terminalEvent.event.params.response.status, payload:terminalEvent.result, browserRequestId:terminalEvent.event.params.requestId, initiator:"rendered-poll"});
            if (!["completed", "success", "ok", "valid", "partial"].includes(terminalEvent.result?.status) || ["failed", "error", "cancelled", "incomplete", "load-error", "invalid"].includes(terminalEvent.result?.result?.status)) fail(`${observation} rendered control reached terminal ${terminalEvent.result?.status ?? "unknown"}`);
            return {...entry, terminal:{status:terminalEvent.result.status, result:terminalEvent.result, resultSha256:digest(JSON.stringify(terminalEvent.result)), jobId, pollPath:contract.poll.replace("{id}", encodeURIComponent(jobId)), source:"rendered-poll"}};
        };
        // Recovery probes must start work through the same rendered form as a
        // user.  Unlike browserRequest this deliberately stops at the 202 so
        // that the reload can happen while the durable job is still active.
        const browserStartRequest = async (contract, observation, cursor, expectedStatuses = [202]) => {
            const requestEvent = await waitFor(() => cdp.events.slice(cursor).find((event) => event.method === "Network.requestWillBeSent" && new URL(event.params.request.url).pathname === contract.api) || false, `${observation} rendered start request`);
            const responseEvent = await waitFor(() => cdp.events.slice(cursor).find((event) => event.method === "Network.responseReceived" && event.params.requestId === requestEvent.params.requestId) || false, `${observation} rendered start response`);
            const response = await cdp.send("Network.getResponseBody", {requestId:requestEvent.params.requestId}), payload = JSON.parse(response.body || "{}"), serialized = requestEvent.params.request.postData ?? "", entry = {observation, method:requestEvent.params.request.method, path:contract.api, bodyKind:contract.body ?? null, bodySha256:digest(serialized), status:responseEvent.params.response.status, responseSha256:digest(JSON.stringify(payload)), payload, browserRequestId:requestEvent.params.requestId, initiator:"rendered-control"};
            api.push(entry);
            if (entry.method !== contract.method || !expectedStatuses.includes(entry.status) || (expectedStatuses.includes(202) && (typeof payload?.id !== "string" || !payload.id))) fail(`${observation} rendered workflow did not produce its expected public response`);
            return {response:{status:entry.status, ok:entry.status >= 200 && entry.status < 300}, payload, entry, cursor};
        };
        const browserTerminal = async (pathname, observation, cursor, statuses) => {
            const terminal = await waitFor(async () => {
                // As above, retain the most recent durable state rather than
                // pinning this recovery path to its first queued response.
                const event = cdp.events.slice(cursor).findLast((value) => value.method === "Network.responseReceived" && new URL(value.params.response.url).pathname === pathname);
                if (!event) return false;
                try { const response = await cdp.send("Network.getResponseBody", {requestId:event.params.requestId}), payload = JSON.parse(response.body || "{}"); return statuses.includes(payload?.status) ? {event, payload} : false; } catch { return false; }
            }, `${observation} rendered terminal result`);
            api.push({observation, method:"GET", path:pathname, status:terminal.event.params.response.status, payload:terminal.payload, browserRequestId:terminal.event.params.requestId, initiator:"rendered-poll"});
            return terminal.payload;
        };
        // Recovery controls are a screen-owned public state machine, rather
        // than the historical "find a label and press Enter" adapter.  The
        // IDs are product contracts rendered by SimulationTab, including the
        // confirmation transition.  This keeps the browser receipt tied to
        // the exact control that owns the request even when other job cards
        // render controls with the same labels.
        const activateSimulationControl = async ({controlId, label, observation, cursor, method, confirmationId = undefined}) => {
            const focusButton = () => evaluate(`(() => { const button = document.getElementById(${JSON.stringify(controlId)}); const visible = (item) => !!(item.offsetWidth || item.offsetHeight || item.getClientRects().length); if (!(button instanceof HTMLButtonElement) || button.disabled || !visible(button) || button.textContent?.trim() !== ${JSON.stringify(label)}) return false; button.focus(); return document.activeElement === button; })()`);
            // Recovery is asynchronous after a reload: the page first reads
            // its server-owned job list, then restores the Simulation tab's
            // local poll state.  Wait for that public state transition rather
            // than racing it with a synthetic cancellation request.
            const focused = await waitFor(focusButton, `${observation} rendered ${label} control`);
            if (!focused) fail(`Studio did not expose an enabled rendered ${label} control for ${observation}`);
            if (confirmationId !== undefined) {
                const focusConfirmation = () => evaluate(`(() => { const button = document.getElementById(${JSON.stringify(confirmationId)}); if (!(button instanceof HTMLButtonElement) || button.disabled) return false; button.focus(); return document.activeElement === button; })()`);
                const cancellationOutcome = async (timeout) => waitFor(async () => {
                    if (await focusConfirmation()) return {kind:"confirm"};
                    return cdp.events.slice(cursor).find((value) => value.method === "Network.requestWillBeSent" && value.params.request.method === method) ? {kind:"request"} : false;
                }, `${observation} rendered cancellation outcome`, timeout).catch(() => false);
                // Try both native keyboard activations immediately.  A
                // portal-backed Mantine modal can consume either Enter or
                // Space on different Chromium versions; waiting a full poll
                // interval between them let a short-lived public Cancel
                // control disappear before its confirmation could be opened.
                await pressEnter();
                let outcome = await cancellationOutcome(250);
                if (!outcome) {
                    const retried = await focusButton();
                    if (!retried) fail(`Studio lost its rendered ${label} control before keyboard cancellation for ${observation}`);
                    await pressSpace();
                    outcome = await cancellationOutcome(1_500);
                }
                if (!outcome) fail(`Studio did not expose a keyboard cancellation outcome for ${observation}`);
                if (outcome.kind === "confirm") await pressEnter();
            } else await pressEnter();
            const event = await waitFor(() => cdp.events.slice(cursor).find((value) => value.method === "Network.requestWillBeSent" && value.params.request.method === method) || false, `${observation} rendered ${label} request`);
            const responseEvent = await waitFor(() => cdp.events.slice(cursor).find((value) => value.method === "Network.responseReceived" && value.params.requestId === event.params.requestId) || false, `${observation} rendered ${label} response`);
            const response = await cdp.send("Network.getResponseBody", {requestId:event.params.requestId}), payload = JSON.parse(response.body || "{}"), entry = {observation, method:event.params.request.method, path:new URL(event.params.request.url).pathname, bodySha256:digest(event.params.request.postData ?? ""), status:responseEvent.params.response.status, responseSha256:digest(JSON.stringify(payload)), payload, browserRequestId:event.params.requestId, initiator:"rendered-control"};
            api.push(entry); return {response:{status:entry.status, ok:entry.status >= 200 && entry.status < 300}, payload, entry, cursor};
        };
        const startRenderedSimulation = async (projectBaseRoute, observation, rounds, expectedStatuses = [202]) => {
            await cdp.send("Page.navigate", {url:`${origin}/${projectBaseRoute}/simulation`});
            await waitFor(() => evaluate("document.readyState === 'complete' && document.body.innerText.includes('Run Simulation')"), `${observation} rendered simulation form`);
            const cursor = cdp.events.length;
            const control = await evaluate(`(() => { const label = [...document.querySelectorAll('label')].find((item) => item.textContent?.trim() === 'Rounds'); const input = label?.htmlFor ? document.getElementById(label.htmlFor) : [...document.querySelectorAll('input')].find((item) => !item.disabled); const button = document.getElementById('simulation-run'); if (!(input instanceof HTMLInputElement) || !(button instanceof HTMLButtonElement) || button.disabled || button.textContent?.trim() !== 'Run Simulation') return false; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set; setter?.call(input, ${JSON.stringify(String(rounds))}); input.dispatchEvent(new Event('input', {bubbles:true})); input.dispatchEvent(new Event('change', {bubbles:true})); button.focus(); return document.activeElement === button; })()`);
            if (!control) fail(`Studio did not expose an enabled rendered simulation control for ${observation}`);
            await pressEnter();
            return browserStartRequest({method:"POST", api:"/api/project/simulations", body:"simulation"}, observation, cursor, expectedStatuses);
        };
        const startRenderedReplay = async (projectBaseRoute, observation, round = 1, expectedStatuses = [202]) => {
            await cdp.send("Page.navigate", {url:`${origin}/${projectBaseRoute}/replay`});
            await waitFor(() => evaluate("document.readyState === 'complete' && document.body.innerText.includes('Load')"), `${observation} rendered replay form`);
            const cursor = cdp.events.length;
            const control = await evaluate(`(() => { const input = [...document.querySelectorAll('input')].find((item) => !item.disabled); const button = document.getElementById('replay-load'); if (!(input instanceof HTMLInputElement) || !(button instanceof HTMLButtonElement) || button.disabled || button.textContent?.trim() !== 'Load') return false; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set; setter?.call(input, ${JSON.stringify(String(round))}); input.dispatchEvent(new Event('input', {bubbles:true})); input.dispatchEvent(new Event('change', {bubbles:true})); button.focus(); return document.activeElement === button; })()`);
            if (!control) fail(`Studio did not expose an enabled rendered replay control for ${observation}`);
            await pressEnter();
            return browserStartRequest({method:"POST", api:"/api/project/replays", body:"replay"}, observation, cursor, expectedStatuses);
        };
        // Each state owns its route, navigation control, and terminal screen
        // predicate.  The runner therefore cannot turn an operation into a
        // route visit plus an unrelated request: a missing or disabled public
        // control fails before any network receipt can be written.
        const viewportDimensions = {
            wide: {width:1440, height:900, mobile:false},
            compact: {width:960, height:800, mobile:false},
            narrow: {width:390, height:844, mobile:true},
        };
        // Product controls declare their lifecycle role.  The collector only
        // selects that public role and reads the identity, accessible name and
        // current precondition back from the rendered element; it never gives
        // an id or label to the DOM lookup.
        const focusLifecycleControl = async (lifecycle, value, selector) => evaluate(`(() => {
            const lifecycle = ${JSON.stringify(lifecycle)}, value = ${JSON.stringify(value)};
            const visible = (item) => !!(item.offsetWidth || item.offsetHeight || item.getClientRects().length);
            const accessibleName = (item) => (item.getAttribute('aria-label') || item.innerText || item.textContent || '').trim();
            const item = [...document.querySelectorAll(${JSON.stringify(selector)})].find((control) => visible(control) && control.getAttribute('data-pokie-lifecycle') === lifecycle && (lifecycle === 'navigation' ? control.getAttribute('data-pokie-lifecycle-route') === value : control.getAttribute('data-pokie-lifecycle-operation') === value));
            if (!(item instanceof HTMLElement)) return null;
            const disabled = 'disabled' in item && Boolean(item.disabled);
            const descriptionIds = (item.getAttribute('aria-describedby') || '').split(/\\s+/).filter(Boolean);
            const disabledExplanation = item.getAttribute('title') || descriptionIds.map((id) => document.getElementById(id)?.textContent?.trim()).find(Boolean) || null;
            item.focus();
            return {control:accessibleName(item), matchedLabel:accessibleName(item), keyboardFocused:document.activeElement === item,
                enabled:!disabled, disabled, disabledExplanation, accessibleName:accessibleName(item), role:item.getAttribute('role') || item.tagName.toLowerCase(),
                stableControlId:item.id, identityAttribute:'id', lifecycle:{kind:lifecycle, value}};
        })()`);
        const setScreenField = async (label, value) => evaluate(`(() => {
            const label = [...document.querySelectorAll('label')].find((item) => item.textContent?.trim() === ${JSON.stringify(label)});
            const input = label?.htmlFor ? document.getElementById(label.htmlFor) : [...document.querySelectorAll('input,textarea')].find((item) => item.getAttribute('aria-label') === ${JSON.stringify(label)});
            if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) || input.disabled) return false;
            const prototype = input instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
            Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(input, ${JSON.stringify(value)});
            input.dispatchEvent(new Event('input', {bubbles:true}));
            input.dispatchEvent(new Event('change', {bubbles:true}));
            return input.value === ${JSON.stringify(value)};
        })()`);
        const setLifecycleField = async (field, value) => evaluate(`(() => {
            const field = ${JSON.stringify(field)}, value = ${JSON.stringify(value)};
            const input = [...document.querySelectorAll('input,textarea')].find((item) => item.getAttribute('data-pokie-lifecycle-field') === field);
            if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) || input.disabled) return false;
            const prototype = input instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
            Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(input, value);
            input.dispatchEvent(new Event('input', {bubbles:true}));
            input.dispatchEvent(new Event('change', {bubbles:true}));
            return input.value === value;
        })()`);
        const prepareScreenOperation = async (body, viewport, observation) => {
            if (body === "artifact-build") return setLifecycleField("artifact-build-destination", path.join(context.workspace, `P8-05 ${observation} ${viewport}.xlsx`));
            if (body === "simulation") return setScreenField("Rounds", "1");
            if (body === "replay") return setScreenField("Target round number in a new replay session", "1");
            if (body === "certification") return setScreenField("Source outcome-library bundle directory", outcomeBundle);
            if (body === "fairness") {
                const source = await setScreenField("Source outcome-library bundle directory", outcomeBundle);
                const mode = await setScreenField("Mode name", "base");
                const server = await setScreenField("Server seed", "p8-05-server-seed");
                const client = await setScreenField("Client seed", "p8-05-client-seed");
                return source && mode && server && client;
            }
            return true;
        };
        const screenControlStates = Object.fromEntries(Object.entries(P805_SCREEN_CONTROL_STATES).map(([screen, state]) => [screen, {
            ...state,
            async enter(projectBaseRoute, viewport, observation, contract) {
                const route = `${projectBaseRoute}/${screen}`;
                if (contract.control !== state.navigationControl) fail(`${screen} contract navigation does not match its public control state`);
                await cdp.send("Emulation.setDeviceMetricsOverride", {...viewportDimensions[viewport], deviceScaleFactor:1});
                // Overview is the dashboard's default route.  Starting an
                // Overview observation there would turn keyboard activation
                // into a no-op and let its context request predate the
                // interaction.  Enter it from a different rendered screen so
                // the recorded request is caused by the public control.
                const shellRoute = screen === "overview" ? `${projectBaseRoute}/gameModel` : projectBaseRoute;
                await cdp.send("Page.navigate", {url:`${origin}/${shellRoute}`});
                await waitFor(() => evaluate("document.readyState === 'complete' && !!document.querySelector('main, [role=main], nav') && document.body.innerText.trim().length > 40"), `${screen} public shell`);
                // Capability-driven tabs mount after the project context has
                // rendered.  The collector observes that public transition
                // instead of assuming that a document-ready shell has already
                // enabled every navigation control.
                const navigation = await waitFor(async () => {
                    const control = await focusLifecycleControl("navigation", screen, "button,a");
                    return control?.keyboardFocused && control.enabled ? control : false;
                }, `${screen} enabled public ${state.navigationControl} navigation for ${observation}`);
                const navigationCursor = cdp.events.length;
                await pressEnter();
                await waitFor(() => evaluate(`location.hash === ${JSON.stringify(route)}`), `${screen} public navigation for ${observation}`);
                return {route, navigation, navigationCursor};
            },
        }]));
        const runScreenControlState = async (projectBaseRoute, viewport, observation, contract) => {
            const screen = contract.route, stateMachine = screenControlStates[screen];
            if (!stateMachine) fail(`${observation} has no declared public screen state`);
            process.stderr.write(`P805_SCREEN_STATE observation=${observation} screen=${screen} phase=enter\n`);
            const entered = await stateMachine.enter(projectBaseRoute, viewport, observation, contract);
            let interaction = entered.navigation, entry;
            if (contract.body) {
                if (!await prepareScreenOperation(contract.body, viewport, observation)) fail(`${screen} did not accept required ${contract.body} values for ${observation}`);
                const cursor = cdp.events.length;
                // Preflights are product-owned asynchronous state.  Wait for
                // the rendered, declared operation to become enabled rather
                // than racing its loading state or falling back to another
                // card with a similarly-labelled Build button.
                interaction = await waitFor(async () => {
                    const control = await focusLifecycleControl("operation", contract.body, "button");
                    return control?.keyboardFocused && control.enabled ? control : false;
                }, `${screen} enabled product-owned operation control for ${observation}`);
                await pressEnter();
                entry = await browserRequest(contract, observation, cursor);
            } else entry = await browserRequest(contract, observation, entered.navigationCursor);
            process.stderr.write(`P805_SCREEN_STATE observation=${observation} screen=${screen} phase=terminal\n`);
            interaction.keyboardActivated = true;
            interaction.activation = "keyboard";
            interaction.routeAfterActivation = await evaluate("location.hash");
            const beforeActionText = await evaluate("document.body.innerText.slice(0,1600)");
            const terminalText = await waitFor(async () => {
                return evaluate(`(() => {
                    const text = document.body.innerText;
                    const live = [...document.querySelectorAll('[role=status],[role=alert],[aria-live]')]
                        .filter((item) => !!(item.offsetWidth || item.offsetHeight || item.getClientRects().length))
                        .map((item) => item.textContent?.trim() || '').filter(Boolean).join('\\n');
                    // A route title exists before activation.  A terminal receipt
                    // must be a post-request rendered change or a live status.
                    return typeof text === "string" && text.trim().length > 2 && (text.slice(0, 1600) !== ${JSON.stringify(beforeActionText)} || live.length > 0)
                        ? {text:text.slice(0, 1600), live} : false;
                })()`);
            }, `${observation} rendered terminal state`);
            // A text delta alone is not an operation receipt: unrelated page
            // activity can change it. The product publishes a lifecycle result
            // beside the control's own screen, including any visible artifact
            // affordance. Read this contract after the correlated browser
            // request has completed; the collector never creates it.
            const lifecycle = contract.body ? "operation" : "navigation", lifecycleValue = contract.body ?? contract.route;
            const lifecycleResult = await waitFor(async () => evaluate(`(() => {
                const lifecycle = ${JSON.stringify(lifecycle)}, value = ${JSON.stringify(lifecycleValue)};
                const visible = (item) => !!(item.offsetWidth || item.offsetHeight || item.getClientRects().length);
                const accessibleName = (item) => (item.getAttribute('aria-label') || item.innerText || item.textContent || '').trim();
                const result = [...document.querySelectorAll('[data-pokie-lifecycle-result]')].find((item) => visible(item) && item.getAttribute('data-pokie-lifecycle-result') === (lifecycle === 'operation' ? value : 'navigation') && (lifecycle === 'operation' || item.getAttribute('data-pokie-lifecycle-route') === value));
                if (!(result instanceof HTMLElement)) return false;
                const terminal = result.getAttribute('data-pokie-lifecycle-terminal');
                if (!terminal || ['idle', 'queued', 'running', 'loading', 'cancelling'].includes(terminal)) return false;
                const artifact = [...result.querySelectorAll('[data-pokie-lifecycle-artifact]')].find((item) => visible(item));
                return {role:result.getAttribute('role') || result.tagName.toLowerCase(), terminal, text:accessibleName(result), artifact:artifact ? {name:artifact.getAttribute('data-pokie-lifecycle-artifact'), accessibleName:accessibleName(artifact)} : null};
            })()`), `${observation} product-owned lifecycle result`);
            if (contract.body && contract.artifact && (!lifecycleResult.artifact?.name || !lifecycleResult.artifact.accessibleName)) fail(`${observation} did not render a visible product-owned ${contract.artifact} artifact affordance`);
            const productState = await evaluate(`(() => {
                const visible = (item) => !!(item.offsetWidth || item.offsetHeight || item.getClientRects().length);
                const controls = [...document.querySelectorAll("button,a,input,select,textarea")].filter(visible);
                const disabled = controls.filter((item) => item.disabled);
                const hasDisabledExplanation = (item) => {
                    if (item.getAttribute("title")) return true;
                    const ids = (item.getAttribute("aria-describedby") || "").split(/\\s+/).filter(Boolean);
                    return ids.length > 0 && ids.every((id) => {
                        const description = document.getElementById(id);
                        return description && visible(description) && Boolean(description.textContent?.trim());
                    });
                };
                const explainedDisabledControls = disabled.filter(hasDisabledExplanation).length;
                const focus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
                const style = focus ? getComputedStyle(focus) : undefined;
                return {
                    title: document.title,
                    text: document.body.innerText.slice(0, 1600),
                    controls: controls.map((item) => ({
                        id: item.id,
                        label: (item.innerText || item.getAttribute("aria-label") || item.name || "").trim(),
                        disabled: Boolean(item.disabled),
                        accessible: Boolean(item.innerText || item.getAttribute("aria-label") || item.getAttribute("aria-labelledby") || item.name),
                    })).filter((item) => item.label),
                    overflow: document.documentElement.scrollWidth > window.innerWidth,
                    accessibility: {
                        namedRegions: [...document.querySelectorAll("main,[role=main],[role=region],nav")].filter(visible).map((item) => item.getAttribute("aria-label") || item.getAttribute("aria-labelledby") || item.id).filter(Boolean),
                        visibleFocus: Boolean(focus) && document.activeElement === focus && Boolean(style) && (style.outlineStyle !== "none" || style.boxShadow !== "none"),
                        disabledControls: disabled.length,
                        explainedDisabledControls,
                        unexplainedDisabledControls: disabled.length - explainedDisabledControls,
                    },
                };
            })()`);
            const screenshot = await cdp.send("Page.captureScreenshot", {format:"png", captureBeyondViewport:true});
            const screenshotEvidenceId = await save("screenshot", `${viewport}-${observation}.png`, Buffer.from(screenshot.data, "base64"), [observation]);
            const semantic = {kind:"p8-05-semantic-page-state", operation:observation, expectedOutcome:contract.terminal, route:entered.route, viewport,
                screen:{name:screen, region:stateMachine.region, navigationControl:stateMachine.navigationControl, terminalText:stateMachine.result},
                control:{id:interaction.stableControlId, role:interaction.role, accessibleName:interaction.accessibleName, enabled:interaction.enabled},
                precondition:{enabled:interaction.enabled, disabled:interaction.disabled, disabledExplanation:interaction.disabledExplanation, accessibleName:interaction.accessibleName, region:stateMachine.region}, interaction,
                request:{path:contract.api, method:contract.method, bodyKind:contract.body ?? null, bodySha256:entry.bodySha256, responseSha256:entry.responseSha256, status:entry.status, browserRequestId:entry.browserRequestId, initiator:entry.initiator},
                terminal:{...entry.terminal, complete:true, artifact:contract.artifact ?? null},
                renderedTerminal:{state:"rendered", observedAfterRequestId:entry.browserRequestId, text:terminalText.text, liveText:terminalText.live, textSha256:digest(terminalText.text), resultSha256:entry.terminal.resultSha256, observedAt:services.now(), changedAfterRequest:terminalText.text !== beforeActionText || terminalText.live.length > 0, lifecycle:lifecycleResult},
                workflow:{persona:options.persona, source:"rendered-control", expectedApi:contract.api, expectedMethod:contract.method, expectedBodyKind:contract.body ?? null, expectedArtifact:contract.artifact ?? null, terminal:contract.terminal}, state:productState};
            const evidenceId = await save("page-state", `${viewport}-${observation}.json`, JSON.stringify(semantic), [observation]);
            return {evidenceId, screenshotEvidenceId, state:productState, interaction, terminal:entry.terminal, browserRequestId:entry.browserRequestId, screen, screenNavigationControl:stateMachine.navigationControl, precondition:semantic.precondition, visibleTerminal:semantic.renderedTerminal};
        };
        const creation = Date.now();
        await cdp.send("Page.navigate", {url:`${origin}/#/home/design`});
        await waitFor(() => evaluate("document.readyState === 'complete' && document.body.innerText.includes('Create game')"), "Studio create-game control");
        const created = await evaluate("(() => { const item=document.getElementById('blueprint-create-game'); if (!(item instanceof HTMLButtonElement) || item.disabled || item.textContent?.trim() !== 'Create game') return false; item.focus(); return document.activeElement === item; })()");
        if (!created) fail("rendered Studio did not expose an enabled keyboard-focusable Create game control");
        await pressEnter();
        await waitFor(() => evaluate("location.hash.includes('/project/')"), "rendered keyboard project creation");
        timings.projectCreationMs = Date.now() - creation;
        const validationStart = Date.now(), validationResponse = await fetch(`${origin}/api/project/validate`); api.push({path:"/api/project/validate", status:validationResponse.status}); if (!validationResponse.ok) fail(`project validation failed: HTTP ${validationResponse.status}`); await validationResponse.json(); timings.validationMs = Date.now() - validationStart;
        const createdProjectRoute = await evaluate("location.hash");
        if (typeof createdProjectRoute !== "string" || !/^#\/project(?:\/[^/]+){1,2}$/.test(createdProjectRoute)) fail("created Studio project did not retain a project-scoped route");
        const createdProjectBaseRoute = createdProjectRoute.replace(/\/[^/]+$/, "");
        // Reload only while a durable job exists.  A route-only reload says
        // nothing about reconnecting to active work, so retain the job id and
        // its post-reload repository discovery in the runtime evidence.
        // A one-million-round run keeps the durable job observable without
        // letting a cleanup probe monopolize the packaged public workflow.
        // Keep the job active across a full browser reload.  The probe is
        // cancelled through the rendered workflow immediately afterwards, so
        // this value is a durability window rather than work the audit waits
        // to complete.
        // This must remain inside Studio's public request boundary.  A value
        // above the server limit merely records a 400 validation failure and
        // never creates the durable job that the reload/cancel state machine
        // is meant to exercise.  The maximum accepted request gives the
        // browser a reliable active-work window while still proving the
        // rendered form and API's real validation contract.
        const durableProbeRounds = 2_000_000;
        const activeReload = await startRenderedSimulation(createdProjectBaseRoute, "active-job reload", durableProbeRounds), reloadCursor = cdp.events.length;
        await cdp.send("Page.reload", {ignoreCache:true}); await waitFor(() => evaluate("document.readyState === 'complete' && location.hash.includes('/project/')"), "active project reload/reconnect"); const reloadJobs = await waitFor(async () => { const event = cdp.events.slice(reloadCursor).find((value) => value.method === "Network.responseReceived" && new URL(value.params.response.url).pathname === "/api/project/jobs"); if (!event) return false; try { const body = await cdp.send("Network.getResponseBody", {requestId:event.params.requestId}), payload = JSON.parse(body.body || "{}"); return {event, payload}; } catch { return false; } }, "rendered active-job reload discovery"), jobs = Array.isArray(reloadJobs.payload) ? reloadJobs.payload : reloadJobs.payload?.jobs; api.push({path:"/api/project/jobs", method:"GET", status:reloadJobs.event.params.response.status, payload:reloadJobs.payload, browserRequestId:reloadJobs.event.params.requestId, initiator:"rendered-reload", recovery:"reload"}); if (!Array.isArray(jobs) || !jobs.some((job) => job?.id === activeReload.payload.id)) fail("Studio reload did not discover the active durable job through its rendered recovery path");
        // A running job intentionally disables sibling tab navigation, so
        // the real recovery state is the public, reloadable Simulation route
        // itself.  This is a browser route transition, not an API shortcut;
        // the subsequent Cancel remains the stable rendered keyboard control
        // that owns the cancellation request.
        await cdp.send("Page.navigate", {url:`${origin}/${createdProjectBaseRoute}/simulation`});
        // An active job deliberately replaces the Configure form, including
        // its "Run Simulation" label, with the Run-step progress surface.
        // The recovery contract is therefore the route followed by its own
        // stable Cancel control below; waiting for the hidden configure text
        // would turn a successful restored job into a false timeout.
        await waitFor(() => evaluate("document.readyState === 'complete' && location.hash.endsWith('/simulation')"), "active-job reload Simulation recovery navigation");
        const activeReloadCancellation = await activateSimulationControl({controlId:"simulation-cancel", label:"Cancel", observation:"active-job reload", cursor:cdp.events.length, method:"DELETE", confirmationId:"simulation-cancel-confirm"}); if (activeReloadCancellation.response.status !== 200 || activeReloadCancellation.entry.path !== `/api/project/simulations/${encodeURIComponent(activeReload.payload.id)}`) fail("Studio did not clean up the active reload job through its rendered control"); const activeReloadTerminal = await browserTerminal(`/api/project/simulations/${encodeURIComponent(activeReload.payload.id)}`, "active-job reload", activeReload.cursor, ["cancelled"]);
        const projectBaseRoute = createdProjectBaseRoute, viewports = ["wide", "compact", "narrow"], actions = [], workflows = options.workflowPersonas.flatMap((persona) => P805_REQUIRED_OBSERVATIONS[persona].flatMap((observation) => viewports.map((viewport) => ({persona, observation, viewport}))));
        for (const {persona, observation, viewport} of workflows) {
            const contract = P805_WORKFLOW_CONTRACTS[persona][observation], actionStart = Date.now(), primaryPersona = options.persona;
            options.persona = persona;
            let page;
            try { page = await runScreenControlState(projectBaseRoute, viewport, observation, contract); } finally { options.persona = primaryPersona; }
            actions.push({persona, observation, route:`${projectBaseRoute}/${contract.route}`, viewport, elapsedMs:Date.now() - actionStart,
                pageTextLength:page.state.text.length, controlCount:page.state.controls.length, overflow:page.state.overflow,
                screenState:page.screen, screenNavigationControl:page.screenNavigationControl, stableControlId:page.interaction.stableControlId, domControlId:page.interaction.stableControlId, identityAttribute:page.interaction.identityAttribute, browserRequestId:page.browserRequestId, precondition:page.precondition, visibleTerminal:page.visibleTerminal, accessibility:page.state.accessibility,
                expectedControl:contract.control, expectedMethod:contract.method,
                expectedBodyKind:contract.body ?? null, expectedApi:contract.api, expectedArtifact:contract.artifact ?? null,
                expectedTerminal:contract.terminal, terminal:page.terminal, interaction:page.interaction,
                evidenceId:page.evidenceId, screenshotEvidenceId:page.screenshotEvidenceId});
        }
        // Capture all three breakpoints even for personas with fewer than
        // three workflow observations.  This is rendered Studio evidence,
        // not a declared viewport list.
        const responsive = [];
        for (const [viewport, dimensions] of [["wide", {width:1440, height:900, mobile:false}], ["compact", {width:960, height:800, mobile:false}], ["narrow", {width:390, height:844, mobile:true}]]) {
            await cdp.send("Emulation.setDeviceMetricsOverride", {...dimensions, deviceScaleFactor:1});
            await cdp.send("Page.navigate", {url:`${origin}/${projectBaseRoute}`});
            await waitFor(() => evaluate("document.readyState === 'complete' && document.body.innerText.trim().length > 40"), `${viewport} responsive Studio state`);
            const state = await evaluate("(()=>{const item=[...document.querySelectorAll('button,a,input,select,textarea')].find((value)=>!value.disabled&&!!(value.offsetWidth||value.offsetHeight||value.getClientRects().length)); item?.focus(); const style=item?getComputedStyle(item):undefined; return {overflow:document.documentElement.scrollWidth>window.innerWidth,visibleFocus:!!item&&document.activeElement===item&&!!style&&(style.outlineStyle!=='none'||style.boxShadow!=='none')};})()"), screenshot = await cdp.send("Page.captureScreenshot", {format:"png", captureBeyondViewport:true}), screenshotEvidenceId = await save("screenshot", `responsive-${viewport}.png`, Buffer.from(screenshot.data, "base64"));
            responsive.push({viewport, ...state, screenshotEvidenceId});
        }
        const failure = await startRenderedSimulation(projectBaseRoute, "actionable simulation failure", 0, [400]), simulationStart = Date.now(), simulation = await startRenderedSimulation(projectBaseRoute, "successful simulation", 1); if (failure.response.status !== 400 || simulation.response.status !== 202 || typeof simulation.payload?.id !== "string") fail("Studio did not demonstrate an actionable rendered simulation failure and successful rendered job creation"); const simulationId = simulation.payload.id, simulationTerminal = await browserTerminal(`/api/project/simulations/${encodeURIComponent(simulationId)}`, "successful simulation", simulation.cursor, ["completed"]); timings.simulationMs = Date.now() - simulationStart; const replayStart = Date.now(), replayFailure = await startRenderedReplay(projectBaseRoute, "replay artifact failure", 0, [400]), replay = await startRenderedReplay(projectBaseRoute, "successful replay"); if (replayFailure.response.status !== 400 || replay.response.status !== 202 || typeof replay.payload?.id !== "string") fail("Studio did not demonstrate rendered replay artifact failure and rendered replay creation"); const replayTerminal = await browserTerminal(`/api/project/replays/${encodeURIComponent(replay.payload.id)}`, "successful replay", replay.cursor, ["completed"]); const replayArtifactInspection = await startRenderedReplay(projectBaseRoute, "replay artifact recovery"); if (!replayArtifactInspection.response.ok) fail("Studio did not recover from replay artifact failure through its rendered control"); timings.replayMs = Date.now() - replayStart;
        const cancellationStart = Date.now(), cancellable = await startRenderedSimulation(projectBaseRoute, "cooperative cancellation", durableProbeRounds); if (cancellable.response.status !== 202 || typeof cancellable.payload?.id !== "string") fail("Studio did not start a cancellable rendered simulation"); const cancelled = await activateSimulationControl({controlId:"simulation-cancel", label:"Cancel", observation:"cooperative cancellation", cursor:cdp.events.length, method:"DELETE", confirmationId:"simulation-cancel-confirm"}); if (cancelled.response.status !== 200 || cancelled.entry.path !== `/api/project/simulations/${encodeURIComponent(cancellable.payload.id)}` || !["cancelling", "cancelled"].includes(cancelled.payload?.status)) fail("Studio did not acknowledge cooperative simulation cancellation through its rendered control"); const cancelledTerminal = await browserTerminal(`/api/project/simulations/${encodeURIComponent(cancellable.payload.id)}`, "cooperative cancellation", cancellable.cursor, ["cancelled"]); const retryCursor = cdp.events.length, retry = await activateSimulationControl({controlId:"simulation-retry", label:"Retry", observation:"simulation retry", cursor:retryCursor, method:"POST"}); if (retry.response.status !== 202 || typeof retry.payload?.id !== "string") fail("Studio did not start a fresh rendered retry through its recovery control"); const retryTerminal = await browserTerminal(`/api/project/simulations/${encodeURIComponent(retry.payload.id)}`, "simulation retry", retryCursor, ["completed"]); const reportsEvent = await waitFor(async () => { const event = cdp.events.slice(retryCursor).find((value) => value.method === "Network.responseReceived" && new URL(value.params.response.url).pathname === "/api/project/reports"); if (!event) return false; try { const response = await cdp.send("Network.getResponseBody", {requestId:event.params.requestId}), payload = JSON.parse(response.body || "[]"); return Array.isArray(payload) ? {event, payload} : false; } catch { return false; } }, "rendered simulation reports"); const reports = {response:{status:reportsEvent.event.params.response.status, ok:true}, payload:reports.payload}; api.push({observation:"simulation retry", method:"GET", path:"/api/project/reports", status:reports.response.status, payload:reports.payload, browserRequestId:reportsEvent.event.params.requestId, initiator:"rendered-poll"}); timings.cancellationMs = Date.now() - cancellationStart;
        await cdp.send("Page.navigate", {url:`${origin}/${projectBaseRoute}/gameModel`}); await waitFor(() => evaluate("document.readyState === 'complete' && document.body.innerText.includes('Game Model')"), "rendered unsaved-work editor");
        const editedControl = await evaluate("(() => { const edit = document.getElementById('game-model-basics-edit'); if (!(edit instanceof HTMLButtonElement) || edit.disabled || edit.textContent?.trim() !== 'Edit') return null; edit.focus(); return document.activeElement === edit ? edit.id : null; })()");
        if (!editedControl) fail("Studio did not expose a keyboard-operable Game Model edit control");
        await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:"Enter", code:"Enter", windowsVirtualKeyCode:13}); await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:"Enter", code:"Enter", windowsVirtualKeyCode:13});
        const dirtyInput = await waitFor(() => evaluate("(() => { const input = [...document.querySelectorAll('input,textarea')].find((item) => !item.disabled); if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return null; const setter = Object.getOwnPropertyDescriptor(input instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype, 'value')?.set; setter?.call(input, `${input.value} P8-05 unsaved`); input.dispatchEvent(new Event('input', {bubbles:true})); input.dispatchEvent(new Event('change', {bubbles:true})); return input.getAttribute('aria-label') || input.name || 'Game Model field'; })()") || false, "rendered unsaved edit");
        const recoveryBefore = await evaluate("location.hash");
        const overview = await evaluate("(() => { const item=document.getElementById('project-tab:overview'); if (!(item instanceof HTMLElement) || ('disabled' in item && item.disabled) || item.textContent?.trim() !== 'Overview') return false; item.focus(); return document.activeElement === item; })()");
        if (!overview) fail("Studio did not expose an Overview navigation control for unsaved-work protection");
        await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:"Enter", code:"Enter", windowsVirtualKeyCode:13}); await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:"Enter", code:"Enter", windowsVirtualKeyCode:13});
        const protectionText = await waitFor(() => evaluate("document.body.innerText.match(/You have unsaved[^\\n]*/i)?.[0] || false"), "rendered unsaved-work protection");
        const cancelUnsaved = await evaluate("(() => { const item=document.getElementById('game-model-unsaved-stay'); if (!(item instanceof HTMLButtonElement) || item.disabled || item.textContent?.trim() !== 'Stay') return false; item.focus(); return document.activeElement === item; })()");
        if (!cancelUnsaved) fail("Studio did not expose an unsaved-work cancel control");
        await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:"Enter", code:"Enter", windowsVirtualKeyCode:13}); await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:"Enter", code:"Enter", windowsVirtualKeyCode:13});
        const unsavedWork = {editedControl:dirtyInput, protectionText, preserved:await evaluate(`location.hash === ${JSON.stringify(recoveryBefore)}`)};
        const staleCursor = cdp.events.length;
        await cdp.send("Page.navigate", {url:`${origin}/#/home/design`});
        await waitFor(() => evaluate("document.body.innerText.includes('Create game')"), "project-switch source");
        const switched = await evaluate("(() => { const item=document.getElementById('blueprint-create-game'); if (!(item instanceof HTMLButtonElement) || item.disabled || item.textContent?.trim() !== 'Create game') return false; item.focus(); return document.activeElement === item; })()");
        if (!switched) fail("Studio did not expose a Create game control for keyboard project switching");
        await cdp.send("Input.dispatchKeyEvent", {type:"keyDown", key:"Enter", code:"Enter", windowsVirtualKeyCode:13});
        await cdp.send("Input.dispatchKeyEvent", {type:"keyUp", key:"Enter", code:"Enter", windowsVirtualKeyCode:13});
        await waitFor(() => evaluate(`location.hash !== ${JSON.stringify(recoveryBefore)} && location.hash.includes('/project/')`), "keyboard project switch");
        const recoveryAfter = await evaluate("location.hash"), staleResponses = cdp.events.slice(staleCursor).filter((event) => event.method === "Network.responseReceived"), delayedResponse = staleResponses.at(-1);
        await cdp.send("Page.navigate", {url:`${origin}${recoveryAfter}`});
        await waitFor(() => evaluate("document.readyState === 'complete' && location.hash === " + JSON.stringify(recoveryAfter)), "stale-response isolation navigation");
        const restartProjectBaseRoute = recoveryAfter.replace(/\/[^/]+$/, ""); await cdp.send("Page.navigate", {url:`${origin}/${restartProjectBaseRoute}/simulation`}); await waitFor(() => evaluate("document.body.innerText.includes('Run Simulation')"), "rendered restart-recovery simulation form"); const restartCursor = cdp.events.length, restartControl = await evaluate("(() => { const label = [...document.querySelectorAll('label')].find((item) => item.textContent?.trim() === 'Rounds'); const input = label?.htmlFor ? document.getElementById(label.htmlFor) : [...document.querySelectorAll('input')].find((item) => !item.disabled); const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === 'Run Simulation' && !item.disabled); if (!(input instanceof HTMLInputElement) || !(button instanceof HTMLElement)) return false; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set; setter?.call(input, '1000000'); input.dispatchEvent(new Event('input', {bubbles:true})); input.dispatchEvent(new Event('change', {bubbles:true})); button.focus(); return document.activeElement === button; })()"); if (!restartControl) fail("Studio did not expose a rendered active job before restart"); await pressEnter(); const restartJob = await browserStartRequest({method:"POST", api:"/api/project/simulations", body:"simulation"}, "restart recovery", restartCursor);
        const priorStudio = studio, restartDrain = await terminate(priorStudio); studio = startStudio(); await waitFor(async () => { try { return (await fetch(`${origin}/api/health`)).ok; } catch { return false; } }, "Studio server restart"); const restartRecoveryCursor = cdp.events.length; await cdp.send("Page.navigate", {url:`${origin}${recoveryAfter}`}); await waitFor(() => evaluate("document.readyState === 'complete' && location.hash === " + JSON.stringify(recoveryAfter)), "Studio server restart recovery"); const restartJobs = await waitFor(async () => { const event = cdp.events.slice(restartRecoveryCursor).find((value) => value.method === "Network.responseReceived" && new URL(value.params.response.url).pathname === "/api/project/jobs"); if (!event) return false; try { const body = await cdp.send("Network.getResponseBody", {requestId:event.params.requestId}), payload = JSON.parse(body.body || "{}"); return {event, payload}; } catch { return false; } }, "rendered restart job recovery"), restartList = Array.isArray(restartJobs.payload) ? restartJobs.payload : restartJobs.payload?.jobs ?? [], restartRecovered = restartList.some((job) => job?.id === restartJob.payload.id && !["queued", "running", "cancelling"].includes(job?.status)); api.push({path:"/api/project/jobs", method:"GET", status:restartJobs.event.params.response.status, payload:restartJobs.payload, browserRequestId:restartJobs.event.params.requestId, initiator:"rendered-restart", recovery:"restart"}); const recovery = {reloadReconnect:activeReloadTerminal.status === "cancelled" && jobs.some((job) => job?.id === activeReload.payload.id), projectSwitch:recoveryBefore !== recoveryAfter, staleResponseIsolation:typeof delayedResponse?.params?.requestId === "string" && await evaluate("location.hash === " + JSON.stringify(recoveryAfter)), unsavedWorkProtection:unsavedWork.preserved === true, serverRestart:restartDrain.processTreeDrained && restartDrain.resourcesDrained && restartRecovered}; if (!Object.values(recovery).every(Boolean)) fail("Studio recovery controls did not produce measured results");
        const observations = P805_REQUIRED_OBSERVATIONS[options.persona]; const recoveryEvidenceId = await save("page-state", "recovery-and-jobs.json", JSON.stringify({kind:"p8-05-runtime-observation", recovery, reload:{activeJobId:activeReload.payload.id, terminal:activeReloadTerminal, discoveredAfterReload:jobs.some((job) => job?.id === activeReload.payload.id)}, staleResponse:{responseCount:staleResponses.length, delayedRequestId:delayedResponse?.params?.requestId, completedAfterSwitch:typeof delayedResponse?.params?.requestId === "string", sourceRoute:recoveryBefore, destinationRoute:recoveryAfter}, unsavedWork, restart:{activeJobId:restartJob.payload.id, recovered:restartRecovered}, jobs:{success:simulationTerminal, actionableFailure:failure.payload, cooperativeCancellation:cancelledTerminal, retryWithoutPartialArtifacts:retryTerminal, replayTerminal}, outcomes:{failureStatus:failure.response.status, cancellationStatus:cancelledTerminal.status, retryStatus:retryTerminal.status, cancelledSimulationId:cancellable.payload.id, reports:reports.payload, cancelledReportAbsent:!reports.payload.some((report) => report?.id === cancellable.payload.id)}})); await save("cli-transcript", "packed-cli.txt", transcript.join("\n"), observations); await save("browser-log", "browser.json", JSON.stringify(cdp.events), observations); await save("api-log", "api.json", JSON.stringify(api), observations); await save("error", "errors.txt", errors.join("\n") || "no browser/API/CLI errors observed\n", observations); await save("timing", "timings.json", JSON.stringify(timings), observations); await save("reproduction", "reproduction.md", `Installed packed CLI: ${installedCli}\nPacked package: ${options.packedPackage}\nPersona: ${options.persona}\n`, observations); await save("artifact", "candidate.json", JSON.stringify({candidateId:options.candidateId, candidatePackageSha256:options.candidatePackageSha256, archiveGitHead:installedPackage.gitHead, installedCli, candidatePackageJsonSha256:digest(candidatePackageJsonBytes), installedPackageJsonSha256:digest(installedPackageBytes), declaredCandidateExecutableSha256:options.candidateExecutableSha256, candidateExecutableSha256:candidateExecutable.sha256, candidateExecutableReceiptSha256:options.candidateExecutableReceipt.sha256, candidateExecutableReceiptId:candidateReceipt.receiptId, candidateExecutableReceiptIssuer:candidateReceipt.issuer, candidateExecutableFiles:candidateExecutable.files, candidateTreeManifestCandidateId:candidateTreeManifest.candidateId, candidateTreeManifestSha256:candidateTreeManifest.sha256, candidateTreeObjectId:candidateTreeManifest.tree, candidateTreeManifestFiles:candidateTreeManifest.files.length, packedPackage:options.packedPackage, packedPackageSha256:digest(packageBytes)}), observations);
        const performanceBudgetMs = {startupMs:60_000, projectCreationMs:60_000, validationMs:60_000, buildMs:300_000, simulationMs:300_000, replayMs:300_000, cancellationMs:120_000}, performance = Object.fromEntries(Object.entries(performanceBudgetMs).map(([name, budgetMs]) => [name, {elapsedMs:timings[name], budgetMs, classification:timings[name] <= budgetMs ? "within-budget" : "regression"}]));
        const controls = await evaluate("(()=>{const visible=(item)=>!!(item.offsetWidth||item.offsetHeight||item.getClientRects().length), controls=[...document.querySelectorAll('button,a,input,select,textarea')].filter(visible); const focusable=controls.find((item)=>!item.disabled); focusable?.focus(); const style=focusable?getComputedStyle(focusable):undefined, visibleFocus=!!focusable && document.activeElement===focusable && style && (style.outlineStyle!==\"none\"||style.boxShadow!==\"none\"); return {controls:controls.map((item)=>({disabled:!!item.disabled,accessible:!!(item.innerText||item.getAttribute('aria-label')||item.getAttribute('aria-labelledby')||item.name),explained:!!item.getAttribute('title')||!!item.getAttribute('aria-describedby')})),namedRegions:[...document.querySelectorAll('[role=region],[role=main],main,nav')].filter(visible).length,visibleFocus};})()"), measurements = {consoleExceptions:cdp.events.filter((event) => event.method === "Runtime.exceptionThrown").length, unhandledRequestFailures:cdp.events.filter((event) => event.method === "Network.loadingFailed").length, documentOverflow:actions.some((action) => action.overflow) || responsive.some((entry) => entry.overflow), inaccessiblePrimaryActions:controls.controls.filter((control) => !control.disabled && !control.accessible).length, unexplainedDisabledControls:controls.controls.filter((control) => control.disabled && !control.explained).length, namedRegions:controls.namedRegions, visibleFocus:controls.visibleFocus}, defects = [["console", measurements.consoleExceptions], ["request", measurements.unhandledRequestFailures], ["accessibility", measurements.inaccessiblePrimaryActions], ["disabled-control", measurements.unexplainedDisabledControls], ["overflow", measurements.documentOverflow ? 1 : 0], ["named-region", measurements.namedRegions < 1 ? 1 : 0], ["focus", measurements.visibleFocus ? 0 : 1], ["performance", Object.values(performance).some((item) => item.classification === "regression") ? 1 : 0]].filter(([, count]) => count > 0).map(([kind]) => ({kind, evidenceId:recoveryEvidenceId})); audit = {auditId:`${options.phase}-${options.persona}-${nonce}`, persona:options.persona, workflowPersonas:options.workflowPersonas, phase:options.phase, candidateId:options.candidateId, candidatePackageSha256:options.candidatePackageSha256, packageIdentity:{archiveSha256:digest(packageBytes), archiveGitHead:installedPackage.gitHead, declaredPackedCli:options.packedCli, installedCli, candidatePackageJsonSha256:digest(candidatePackageJsonBytes), installedPackageJsonSha256:digest(installedPackageBytes), declaredCandidateExecutableSha256:options.candidateExecutableSha256, candidateExecutableSha256:candidateExecutable.sha256, candidateExecutableReceiptSha256:options.candidateExecutableReceipt.sha256, candidateExecutableReceiptId:candidateReceipt.receiptId, candidateExecutableReceiptIssuer:candidateReceipt.issuer, candidateExecutableFiles:candidateExecutable.files, candidateTreeManifestCandidateId:candidateTreeManifest.candidateId, candidateTreeManifestSha256:candidateTreeManifest.sha256, candidateTreeObjectId:candidateTreeManifest.tree}, startedAt, endedAt:undefined, cleanContext:context, observations, observationEvidence, evidence, timings, performance, rendered:{execution:"packed-public-cli-built-studio-rendered-controls", viewports:["wide", "compact", "narrow"], responsive, measurements, defects, actions, recovery:Object.fromEntries(Object.entries(recovery).map(([name, observed]) => [name, {observed, evidenceId:recoveryEvidenceId}])), jobs:{success:{observed:simulationTerminal.status === "completed", evidenceId:recoveryEvidenceId}, actionableFailure:{observed:failure.response.status === 400, evidenceId:recoveryEvidenceId}, cooperativeCancellation:{observed:cancelledTerminal.status === "cancelled", evidenceId:recoveryEvidenceId}, retryWithoutPartialArtifacts:{observed:retryTerminal.status === "completed" && cancelledTerminal.status === "cancelled" && !reports.payload.some((report) => report?.id === cancellable.payload.id), evidenceId:recoveryEvidenceId}}}};
    } catch (error) { thrown = error; } finally { cdp?.close(); const drains = []; for (const owner of ownership.slice().reverse()) { try { if (!owner.settled) { clearInterval(owner.descendantSampler); if (owner.resourceId) registerPc20OwnedResource({kind:"browser", resourceId:owner.resourceId, pid:owner.pid, processIdentity:owner.identity}, "released", {POKIE_PC20_RESOURCE_REGISTRY:owner.resourceRegistryPath, POKIE_PC20_RESOURCE_REGISTRY_SECRET:owner.resourceRegistrySecret}); owner.tracker?.capture({final:true}); for (const [pid, identity] of descendants(owner.pid)) owner.ownedProcesses.set(pid, identity); owner.drain = await drainProcessTree(owner.child, 5_000, owner.tracker?.ownedProcesses ?? owner.ownedProcesses, owner.tracker?.ownedResources); if (!owner.drain.processTreeDrained || !owner.drain.resourcesDrained) fail(`owned ${owner.label} resources could not be drained`); } } catch (error) { owner.drain = {processTreeDrained:false, resourcesDrained:false, error:String(error)}; thrown ??= error; } finally { owner.tracker?.stop(); } delete owner.child; delete owner.ownedProcesses; delete owner.tracker; delete owner.descendantSampler; delete owner.resourceRegistrySecret; drains.push(owner.drain); } await services.rm(base, {recursive:true, force:true}); const cleanup = {kind:"p8-05-cleanup", exit:thrown ? "error" : "success", processTreeDrained:drains.every((drain) => drain.processTreeDrained === true), resourcesDrained:drains.every((drain) => drain.resourcesDrained === true), contextRemoved:!services.exists(base), ownership}; const cleanupEvidenceId = await save("cleanup", "cleanup.json", JSON.stringify(cleanup), audit?.observations ?? []); if (audit) { audit.cleanup = {...cleanup, evidenceId:cleanupEvidenceId}; audit.endedAt = services.now(); } else if (thrown && typeof thrown === "object") { thrown.cleanupEvidenceId = cleanupEvidenceId; thrown.cleanup = cleanup; } }
    if (thrown) throw thrown; validateP805RenderedPersonaAudit(audit); return audit;
}
async function main(argv = process.argv) { const options = optionsFrom(argv); const audit = await runP805ValeraBrowserAudit(options); await writeFile(path.join(options.output, `${options.phase}-${options.persona}-audit.json`), `${JSON.stringify(audit, null, 2)}\n`, {flag:"wx"}); process.stdout.write(`P805_VALERA_AUDIT_PASS persona=${audit.persona} phase=${audit.phase}\n`); }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().then(() => process.exit(0)).catch((error) => { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1; });
