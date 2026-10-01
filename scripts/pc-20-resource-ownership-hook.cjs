/*
 * Loaded into the release composite through NODE_OPTIONS.  It is deliberately
 * fail-closed: a child is never handed to gate code unless its acquisition was
 * durably authenticated first.  That closes the detach/reparent window which
 * a later parent-PID poll cannot recover.
 */
const {closeSync, constants, openSync, readFileSync, writeSync} = require("node:fs");
const {createHash} = require("node:crypto");
const {syncBuiltinESMExports} = require("node:module");
const childProcess = require("node:child_process");
const workerThreads = require("node:worker_threads");

const registry = process.env.POKIE_PC20_RESOURCE_REGISTRY;
const secret = process.env.POKIE_PC20_RESOURCE_REGISTRY_SECRET;
const operationId = process.env.POKIE_PC20_OPERATION_ID;
if (!registry || !secret || !/^[a-f0-9]{32}$/i.test(operationId || "")) throw new Error("PC-20 resource ownership registry, secret, and operation namespace are required");
const signature = (record, signingSecret) => createHash("sha256").update(signingSecret).update("\0").update(JSON.stringify(record)).digest("hex");
const processIdentity = (pid) => {
    if (!Number.isInteger(pid) || pid <= 0) return undefined;
    try {
        // Field 22 remains after a parent exit and distinguishes a reused PID
        // without depending on locale-specific ps output.
        const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
        const end = stat.lastIndexOf(")");
        const fields = stat.slice(end + 2).trim().split(/\s+/);
        const startTicks = fields[19];
        return /^\d+$/.test(startTicks) ? `linux-start-ticks:${startTicks}` : undefined;
    } catch { return undefined; }
};
const append = (record, target, signingSecret) => {
    // Do not catch this.  An unauthenticated or unretained acquisition is a
    // release-gate failure, not an invitation for a later polling audit.
    // A tracker may read this append-only registry while a Studio child is
    // still starting or stopping.  Write each signed NDJSON record in one
    // O_APPEND syscall so that reader can see either the previous complete
    // ledger or this complete record, never an unsigned partial line.
    const contents = Buffer.from(`${JSON.stringify({...record, signature:signature(record, signingSecret)})}\n`, "utf8");
    const descriptor = openSync(target, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND, 0o600);
    try {
        if (writeSync(descriptor, contents) !== contents.length) throw new Error("PC-20 could not atomically append an ownership record");
    } finally {
        closeSync(descriptor);
    }
};
// Tuple-local owners may rotate their registries on Studio restart. Keep a
// second acquisition ledger outside the worker's disposable context so its
// parent can still drain detached grandchildren after an uncatchable exit.
const supervisorRegistry = process.env.POKIE_P805_SUPERVISOR_REGISTRY;
const supervisorSecret = process.env.POKIE_P805_SUPERVISOR_SECRET;
const supervisorOperation = process.env.POKIE_P805_SUPERVISOR_OPERATION;
if (supervisorRegistry && (!supervisorSecret || !/^[a-f0-9]{32}$/i.test(supervisorOperation || ""))) throw new Error("P8-05 supervisor namespace is incomplete");
const write = (record) => {
    append(record, registry, secret);
    if (supervisorRegistry && supervisorRegistry !== registry) {
        // A worker thread disappears with its owning process. Preserve that
        // process identity so the supervisor can prove forced thread release.
        const workerOwner = record.kind === "worker" ? {pid:process.pid, processIdentity:processIdentity(process.pid), resourceId:`${record.resourceId}:process:${process.pid}`} : {};
        append({...record, ...workerOwner, operationId:supervisorOperation}, supervisorRegistry, supervisorSecret);
    }
};
const terminateUnrecorded = (child) => {
    try { child.kill("SIGKILL"); } catch { /* the caller still fails closed */ }
};
const processRecord = (child, command) => {
    if (!Number.isInteger(child?.pid) || child.pid <= 0) {
        terminateUnrecorded(child);
        throw new Error("PC-20 could not acquire a child process identity");
    }
    const identity = processIdentity(child.pid);
    if (!identity) {
        terminateUnrecorded(child);
        throw new Error(`PC-20 could not record child process identity for PID ${child.pid}`);
    }
    const resourceId = `process:${child.pid}:${command}`;
    try {
        write({schemaVersion:1, operationId, action:"acquired", kind:"process", resourceId, pid:child.pid, processIdentity:identity});
    } catch (error) {
        terminateUnrecorded(child);
        throw error;
    }
    child.once?.("exit", () => write({schemaVersion:1, operationId, action:"released", kind:"process", resourceId, pid:child.pid, processIdentity:identity}));
};
const wrapAsync = (method) => {
    const original = childProcess[method];
    childProcess[method] = function pc20OwnedChild(...args) {
        const child = original.apply(this, args);
        processRecord(child, typeof args[0] === "string" ? args[0] : method);
        return child;
    };
};
for (const method of ["spawn", "execFile", "exec", "fork"]) wrapAsync(method);

// Synchronous APIs cannot register at acquisition because they return only
// after the child has exited. Detached use is therefore forbidden; ordinary
// synchronous commands are bounded by their caller and their NODE_OPTIONS
// descendants remain instrumented.
const wrapSync = (method) => {
    const original = childProcess[method];
    childProcess[method] = function pc20NoDetachedSyncChild(...args) {
        const options = args.find((value) => value && typeof value === "object" && !Array.isArray(value));
        if (options?.detached === true) throw new Error(`PC-20 forbids detached ${method} because it cannot be registered at acquisition`);
        return original.apply(this, args);
    };
};
for (const method of ["spawnSync", "execFileSync", "execSync"]) wrapSync(method);

class Pc20OwnedWorker extends workerThreads.Worker {
    constructor(...args) {
        super(...args);
        const resourceId = `worker:${this.threadId}`;
        try { write({schemaVersion:1, operationId, action:"acquired", kind:"worker", resourceId}); }
        catch (error) { void this.terminate(); throw error; }
        this.once("exit", () => write({schemaVersion:1, operationId, action:"released", kind:"worker", resourceId}));
    }
}
workerThreads.Worker = Pc20OwnedWorker;

// Built-in ESM named exports are snapshots of their CommonJS counterparts
// until explicitly synchronized.  The release composite itself includes ESM
// consumers, so without this call `import {spawn} from "node:child_process"`
// and `import {Worker} from "node:worker_threads"` could bypass the wrappers
// above and escape the acquisition registry.
syncBuiltinESMExports();

// A registry with no child resources still has an authenticated sentinel, so
// a missing, unreadable, malformed, or unsigned registry cannot mean "empty".
write({schemaVersion:1, operationId, action:"registry-ready", kind:"registry", resourceId:`registry:${process.pid}`});
