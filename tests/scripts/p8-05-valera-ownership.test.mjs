import assert from "node:assert/strict";
import {createHash, randomBytes} from "node:crypto";
import {mkdtemp, readFile, rm} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import os from "node:os";
import path from "node:path";
import {test} from "@jest/globals";
import {exerciseP805TupleSupervisor} from "./p805-tuple-supervisor-contract.mjs";
import {createP805OwnedProcessRecord} from "../../scripts/p8-05-valera-browser-audit.mjs";
import {registerPc20OwnedResource} from "../../scripts/pc-20-release-completion.mjs";

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

test.each(["timeout", "tamper", "cancellation", "failure", "spawn-failure", "restart", "success", "success-descendants", "unauthenticated"])("tuple supervisor closes %s with persisted receipts and authenticated drainage", async (mode) => {
    await exerciseP805TupleSupervisor(mode);
});

test("saved ledger regressions still reject receipt and runtime substitutions", () => {
    const result = JSON.parse(execFileSync(process.execPath, [path.resolve("tests/cli/studio-client/src/p805TupleLedgerNegative.mjs")], {encoding:"utf8"}));
    assert.deepEqual(result.controlledTimeout, {
        acceptedReceipts:1,
        failedTuple:{persona:"mathematician", observation:"blueprint", viewport:"compact"},
        aggregatePublished:false,
        failureKind:"timeout",
        terminalStatus:"failed-and-drained",
        initialAcceptedReceiptValidation:"verified",
        finalAcceptedReceiptValidation:"verified",
        revalidatedBeforeTermination:true,
        terminalAndCleanupHashesVerified:true,
        authenticated:true,
        processTreeDrained:true,
        resourcesDrained:true,
        ownedKinds:["browser", "process", "worker"],
        forcedReleaseKinds:["browser", "process", "worker"],
        ownedProcessCount:result.controlledTimeout.ownedProcessCount,
        ownedProcessesVerifiedAbsent:true,
    });
    assert.ok(result.controlledTimeout.ownedProcessCount >= 4);
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
