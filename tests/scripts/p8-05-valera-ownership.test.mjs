import assert from "node:assert/strict";
import {createHash, randomBytes} from "node:crypto";
import {mkdtemp, readFile, readdir, rm} from "node:fs/promises";
import {spawn, execFileSync} from "node:child_process";
import os from "node:os";
import path from "node:path";
import {test} from "@jest/globals";
import {createP805OwnedProcessRecord, runP805ProcessIsolatedPackedProof} from "../../scripts/p8-05-valera-browser-audit.mjs";
import {processIdentity, registerPc20OwnedResource} from "../../scripts/pc-20-release-completion.mjs";

test("a packed browser owner retains its namespace through release", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "p805-owned-browser-"));
    const options = {
        resourceRegistryPath:path.join(directory, "resources.ndjson"),
        resourceRegistrySecret:randomBytes(32).toString("hex"),
        operationId:randomBytes(16).toString("hex"),
    };
    try {
        const owner = createP805OwnedProcessRecord("browser", {pid:process.pid}, options);
        assert.equal(owner.operationId, options.operationId);
        assert.equal(owner.ownedProcesses.has(process.ppid), false, "a shared process group is not child ownership");
        const resource = {
            kind:"browser", resourceId:`browser:${owner.pid}:browser`,
            pid:owner.pid, processIdentity:owner.identity,
        };
        const acquired = {
            POKIE_PC20_RESOURCE_REGISTRY:options.resourceRegistryPath,
            POKIE_PC20_RESOURCE_REGISTRY_SECRET:options.resourceRegistrySecret,
            POKIE_PC20_OPERATION_ID:options.operationId,
        };
        const released = {
            POKIE_PC20_RESOURCE_REGISTRY:owner.resourceRegistryPath,
            POKIE_PC20_RESOURCE_REGISTRY_SECRET:owner.resourceRegistrySecret,
            POKIE_PC20_OPERATION_ID:owner.operationId,
        };
        assert.equal(registerPc20OwnedResource(resource, "acquired", acquired), true);
        assert.equal(registerPc20OwnedResource(resource, "released", released), true);
        const records = (await readFile(options.resourceRegistryPath, "utf8"))
            .trim().split("\n").map((line) => JSON.parse(line));
        assert.deepEqual(records.map(({action, operationId}) => ({action, operationId})), [
            {action:"acquired", operationId:options.operationId},
            {action:"released", operationId:options.operationId},
        ]);
    } finally {
        await rm(directory, {recursive:true, force:true});
    }
});

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fixture = path.resolve("tests/scripts/p805-owned-tuple-fixture.mjs");
const tuples = ["wide", "compact"].map((viewport) => ({persona:"mathematician", observation:"blueprint", viewport}));
const stem = (tuple) => `initial-${tuple.persona}--${tuple.observation}--${tuple.viewport}`;

async function exerciseSupervisor(mode) {
    const output = await mkdtemp(path.join(os.tmpdir(), `p805-supervisor-${mode}-`));
    const options = {persona:"all", workflowPersonas:["all"], phase:"initial", candidateId:"1".repeat(40), candidatePackageSha256:"a".repeat(64), candidateExecutableSha256:"b".repeat(64), candidateExecutableReceipt:{path:path.join(output, "candidate-executable.json"), sha256:"c".repeat(64)}, packedPackage:path.join(output, "candidate.tgz"), output};
    const runtime = {root:path.join(output, "absent-test-runtime"), receipt:{path:path.join(output, "runtime-receipt.json"), sha256:"d".repeat(64)}};
    const abort = new AbortController(), auditReads = [], spawned = [];
    let failure, proof, launches = 0;
    try {
        try {
            proof = await runP805ProcessIsolatedPackedProof(options, {
                tuples, tupleTimeoutMs:2_000, signal:abort.signal,
                prepareRuntime:async () => runtime,
                validateSharedRuntime:async () => {},
                spawn:(_command, args, spawnOptions) => {
                    const index = launches++;
                    if (mode === "spawn-failure" && index === 1) {
                        const child = spawn(path.join(output, "missing-executable"), [], spawnOptions);
                        spawned.push(child);
                        return child;
                    }
                    const child = spawn(process.execPath, [fixture, ...args.slice(1)], {...spawnOptions, env:{...spawnOptions.env, P805_OWNERSHIP_FIXTURE_MODE:mode}});
                    spawned.push(child);
                    if (mode === "cancellation" && index === 1) child.stdout.on("data", (data) => { if (data.toString().includes("TUPLE_READY")) abort.abort(); });
                    return child;
                },
                // The fixture tests parent ownership, not rendered browser
                // semantics. It still persists and re-reads actual bytes,
                // while the production tuple receipt reader checks handoff.
                readChildAudit:async (_output, _phase, _persona, _candidate, _package, _pid, tuple) => {
                    auditReads.push(tuple.viewport);
                    const auditPath = `${stem(tuple)}-audit.json`, bytes = await readFile(path.join(output, auditPath)), audit = JSON.parse(bytes);
                    const checkpoint = audit.checkpointReceipts[0];
                    assert.equal(digest(await readFile(path.join(output, checkpoint.path))), checkpoint.sha256);
                    return {audit, auditPath, auditSha256:digest(bytes)};
                },
                ...(mode === "unauthenticated" ? {cleanupChild:async (child, kind, supervisor) => {
                    const cleanup = await supervisor.cleanup(child, kind);
                    return child === spawned[1] ? {...cleanup, authenticated:false} : cleanup;
                }} : {}),
                ...(mode === "restart" ? {exists:(target) => launches === 1 && target.endsWith("compact-tuple-receipt.json")} : {}),
            });
        } catch (error) { failure = error; }
        const names = await readdir(output);
        if (["success", "success-descendants"].includes(mode)) {
            assert.equal(failure, undefined);
            assert.equal(proof.ledger.status, "passed");
            assert.equal(proof.ledger.acceptedReceipts.length, 2);
            assert.deepEqual(auditReads, ["wide", "compact", "wide", "compact"]);
            const drain = proof.ledger.children[1].parentCleanup;
            assert.equal(drain.authenticated, true);
            assert.equal(drain.processTreeDrained, true);
            assert.equal(drain.resourcesDrained, true);
            if (mode === "success-descendants") assertOwnershipDrain(drain);
            return;
        }
        assert.match(String(failure), /after preserving 1 accepted tuple receipts/);
        assert.equal(names.includes("initial-process-isolated-packed-proof.json"), false);
        const failedName = names.find((name) => name.includes("process-isolated-packed-proof.failed-"));
        assert.ok(failedName);
        const ledger = JSON.parse(await readFile(path.join(output, failedName)));
        assert.equal(ledger.status, "failed");
        assert.deepEqual(ledger.failedTuple, tuples[1]);
        assert.equal(ledger.acceptedReceipts.length, 1);
        assert.equal(ledger.attemptedChild.failureKind, mode === "tamper" ? "timeout" : mode === "unauthenticated" ? "detached-descendant" : mode);
        assert.deepEqual(auditReads, ["wide", "wide", "wide"]);
        assert.equal(ledger.acceptedReceiptValidation.status, mode === "tamper" ? "rejected" : "verified");
        const predecessor = JSON.parse(await readFile(path.join(output, `${stem(tuples[0])}-tuple-receipt.json`)));
        assert.deepEqual(ledger.acceptedReceipts[0].receipt, predecessor);
        assert.equal(ledger.acceptedReceipts[0].receiptSha256 === digest(await readFile(path.join(output, `${stem(tuples[0])}-tuple-receipt.json`))), mode !== "tamper");
        const terminalBytes = await readFile(path.join(output, ledger.terminal.path)), terminal = JSON.parse(terminalBytes);
        assert.equal(digest(terminalBytes), ledger.terminal.sha256);
        assert.equal(terminal.status, mode === "unauthenticated" ? "cleanup-incomplete" : "failed-and-drained");
        assert.deepEqual(terminal.tuple, tuples[1]);
        assert.deepEqual(terminal.parent, ledger.parent);
        assert.equal(terminal.candidateId, options.candidateId);
        assert.deepEqual(terminal.acceptedReceiptValidation, ledger.acceptedReceiptValidation);
        assert.deepEqual(terminal.initialAcceptedReceiptValidation, ledger.initialAcceptedReceiptValidation);
        assert.equal(ledger.initialAcceptedReceiptValidation.status, mode === "tamper" ? "rejected" : "verified");
        assert.ok(Date.parse(ledger.initialAcceptedReceiptValidation.checkedAt) <= Date.parse(ledger.attemptedChild.endedAt));
        const cleanupBytes = await readFile(path.join(output, terminal.cleanupPath)), cleanup = JSON.parse(cleanupBytes);
        assert.equal(digest(cleanupBytes), terminal.cleanupSha256);
        assert.deepEqual(cleanup.cleanup, ledger.attemptedChild.cleanup);
        assert.equal(cleanup.cleanup.authenticated, mode !== "unauthenticated");
        assert.equal(cleanup.cleanup.processTreeDrained, true);
        assert.equal(cleanup.cleanup.resourcesDrained, true);
        if (!["restart", "spawn-failure", "unauthenticated"].includes(mode)) assertOwnershipDrain(cleanup.cleanup);
    } finally {
        // This is test isolation after the production supervisor has finished.
        // A failed assertion must not leave the fixture root running.
        for (const child of spawned) if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
        await rm(output, {recursive:true, force:true});
    }
}
function assertOwnershipDrain(drain) {
    assert.ok(drain.ownedProcessIdentities.length >= 4, "root, Studio, browser and detached grandchild retained");
    assert.ok(drain.ownedResources.some((resource) => resource.kind === "worker" && resource.pid));
    assert.ok(drain.ownedResources.some((resource) => resource.kind === "browser" && resource.pid));
    assert.ok(drain.forcedReleases.some((resource) => resource.kind === "browser"));
    assert.ok(drain.forcedReleases.some((resource) => resource.kind === "worker"));
    for (const {pid, processIdentity:identity} of drain.ownedProcessIdentities) {
        if (processIdentity(pid) !== identity) continue;
        // Zombies have ceased executing; a reused PID belongs to somebody
        // else. Check the exact identity, like the production drainer.
        try {
            const snapshot = execFileSync("ps", ["-p", String(pid), "-o", "stat="], {encoding:"utf8"}).trim();
            assert.ok(snapshot.startsWith("Z"), `${pid}/${identity} remains alive`);
        } catch (error) { if (error.code === "ERR_ASSERTION") throw error; assert.equal(error.status, 1); }
    }
}
test.each(["timeout", "tamper", "cancellation", "failure", "spawn-failure", "restart", "success", "success-descendants", "unauthenticated"])("tuple supervisor closes %s with persisted receipts and authenticated drainage", async (mode) => {
    await exerciseSupervisor(mode);
});

test("saved ledger regressions still reject receipt and runtime substitutions", () => {
    const result = JSON.parse(execFileSync(process.execPath, [path.resolve("tests/cli/studio-client/src/p805TupleLedgerNegative.mjs")], {encoding:"utf8"}));
    assert.equal(result.acceptedReceipts, 1);
    assert.equal(result.aggregatePublished, false);
    assert.deepEqual(result.cleanupKinds, ["success", "timeout"]);
    assert.deepEqual(Object.keys(result.retainedFailureKinds), ["failure", "cancellation", "spawn-failure", "restart", "detached-descendant", "cleanup-substitution"]);
    assert.ok(Object.values(result.rejectedReceiptSubstitutions).every(Boolean));
    assert.equal(result.runtimeSubstitutionRejected, true);
    assert.equal(result.retryTerminalSubstitutionRejected, true);
});

test("the shared ownership preload preserves its local protocol without a tuple supervisor", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "p805-legacy-ownership-"));
    const registry = path.join(directory, "resources.ndjson"), secret = randomBytes(32).toString("hex"), operationId = randomBytes(16).toString("hex");
    try {
        const env = {...process.env, POKIE_PC20_RESOURCE_REGISTRY:registry, POKIE_PC20_RESOURCE_REGISTRY_SECRET:secret, POKIE_PC20_OPERATION_ID:operationId, NODE_OPTIONS:`--require=${path.resolve("scripts/pc-20-resource-ownership-hook.cjs")}`};
        delete env.POKIE_P805_SUPERVISOR_REGISTRY;
        delete env.POKIE_P805_SUPERVISOR_SECRET;
        delete env.POKIE_P805_SUPERVISOR_OPERATION;
        execFileSync(process.execPath, ["-e", `
            const {spawn} = require('node:child_process');
            const {Worker} = require('node:worker_threads');
            const child = spawn(process.execPath, ['-e', '']);
            child.once('exit', () => {
                const worker = new Worker('setInterval(() => {}, 1000)', {eval:true});
                worker.once('online', () => worker.terminate());
            });
        `], {env, stdio:"pipe", timeout:5_000});
        const records = (await readFile(registry, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
        const acquisitions = records.filter(({action}) => action === "acquired");
        assert.deepEqual(acquisitions.map(({kind}) => kind), ["process", "worker"]);
        assert.equal(acquisitions[1].pid, undefined, "PC-20 worker protocol remains unchanged");
        for (const {signature, ...record} of records) {
            assert.equal(record.operationId, operationId);
            assert.equal(signature, createHash("sha256").update(secret).update("\0").update(JSON.stringify(record)).digest("hex"));
        }
        for (const acquired of acquisitions) assert.ok(records.some((record) => record.action === "released" && record.resourceId === acquired.resourceId));
    } finally { await rm(directory, {recursive:true, force:true}); }
});
