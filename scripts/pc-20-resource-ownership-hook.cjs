/*
 * Loaded into the release composite through NODE_OPTIONS.  This is deliberately
 * a small CommonJS preload because npm, Jest and their Node children all honour
 * it before application code starts.  It gives the controller an authenticated
 * ownership record at the point a child/worker is acquired, rather than asking
 * a later polling pass to infer a short-lived parent relationship.
 */
const {appendFileSync} = require("node:fs");
const {createHash} = require("node:crypto");
const childProcess = require("node:child_process");
const {Worker} = require("node:worker_threads");

const registry = process.env.POKIE_PC20_RESOURCE_REGISTRY;
const secret = process.env.POKIE_PC20_RESOURCE_REGISTRY_SECRET;
const signature = (record) => createHash("sha256").update(secret).update("\0").update(JSON.stringify(record)).digest("hex");
const write = (record) => {
    if (!registry || !secret) return;
    try { appendFileSync(registry, `${JSON.stringify({...record, signature:signature(record)})}\n`, {encoding:"utf8", mode:0o600}); } catch { /* the post-drain audit will fail closed if ownership cannot be retained */ }
};
const processRecord = (child, command) => {
    if (!Number.isInteger(child?.pid) || child.pid <= 0) return;
    const resourceId = `process:${child.pid}:${command}`;
    write({schemaVersion:1, action:"acquired", kind:"process", resourceId, pid:child.pid});
    child.once?.("exit", () => write({schemaVersion:1, action:"released", kind:"process", resourceId, pid:child.pid}));
};
for (const method of ["spawn", "execFile", "exec"]) {
    const original = childProcess[method];
    childProcess[method] = function pc20OwnedChild(...args) {
        const child = original.apply(this, args);
        processRecord(child, typeof args[0] === "string" ? args[0] : method);
        return child;
    };
}
class Pc20OwnedWorker extends Worker {
    constructor(...args) {
        super(...args);
        const resourceId = `worker:${this.threadId}`;
        write({schemaVersion:1, action:"acquired", kind:"worker", resourceId});
        this.once("exit", () => write({schemaVersion:1, action:"released", kind:"worker", resourceId}));
    }
}
require("node:worker_threads").Worker = Pc20OwnedWorker;
