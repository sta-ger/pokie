// Process-backed ownership contract shared by the bounded test and the
// controller-owned whole-file proof. This does not claim rendered workflows.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdtemp, readFile, readdir, rm} from "node:fs/promises";
import {spawn, execFileSync} from "node:child_process";
import os from "node:os";
import path from "node:path";
import {runP805ProcessIsolatedPackedProof} from "../../scripts/p8-05-valera-browser-audit.mjs";
import {processIdentity} from "../../scripts/pc-20-release-completion.mjs";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fixture = path.resolve("tests/scripts/p805-owned-tuple-fixture.mjs");
const tuples = ["wide", "compact"].map((viewport) => ({persona:"mathematician", observation:"blueprint", viewport}));
const stem = (tuple) => `initial-${tuple.persona}--${tuple.observation}--${tuple.viewport}`;

export async function exerciseP805TupleSupervisor(mode) {
    const output = await mkdtemp(path.join(os.tmpdir(), `p805-supervisor-${mode}-`));
    const options = {persona:"all", workflowPersonas:["all"], phase:"initial", candidateId:"1".repeat(40), candidatePackageSha256:"a".repeat(64), candidateExecutableSha256:"b".repeat(64), candidateExecutableReceipt:{path:path.join(output, "candidate-executable.json"), sha256:"c".repeat(64)}, packedPackage:path.join(output, "candidate.tgz"), output};
    const runtime = {root:path.join(output, "absent-test-runtime"), receipt:{path:path.join(output, "runtime-receipt.json"), sha256:"d".repeat(64)}};
    const abort = new AbortController(), auditReads = [], spawned = [];
    let failure, proof, launches = 0;
    try {
        try {
            proof = await runP805ProcessIsolatedPackedProof(options, {
                tuples, tupleTimeoutMs:["timeout", "tamper"].includes(mode) ? 5_000 : 15_000, signal:abort.signal,
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
                    if (mode === "timeout" && launches === 2 && auditReads.length === 1) {
                        assert.equal(spawned[1].exitCode, null);
                        assert.equal(spawned[1].signalCode, null);
                        assert.equal((await readdir(output)).includes("timeout-worker-signalled.txt"), false, "the parent revalidates accepted receipts before signalling the timed-out worker");
                    }
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
        if (mode === "timeout") {
            assert.equal(await readFile(path.join(output, "timeout-worker-signalled.txt"), "utf8"), "SIGTERM");
            assert.equal(ledger.attemptedChild.signal, "SIGKILL");
            return {
                acceptedReceipts:ledger.acceptedReceipts.length,
                failedTuple:ledger.failedTuple,
                aggregatePublished:false,
                failureKind:ledger.attemptedChild.failureKind,
                terminalStatus:terminal.status,
                initialAcceptedReceiptValidation:ledger.initialAcceptedReceiptValidation.status,
                finalAcceptedReceiptValidation:ledger.acceptedReceiptValidation.status,
                revalidatedBeforeTermination:true,
                terminalAndCleanupHashesVerified:true,
                authenticated:cleanup.cleanup.authenticated,
                processTreeDrained:cleanup.cleanup.processTreeDrained,
                resourcesDrained:cleanup.cleanup.resourcesDrained,
                ownedKinds:[...new Set(cleanup.cleanup.ownedResources.map(({kind}) => kind))].sort(),
                forcedReleaseKinds:[...new Set(cleanup.cleanup.forcedReleases.map(({kind}) => kind))].sort(),
                ownedProcessCount:cleanup.cleanup.ownedProcessIdentities.length,
                ownedProcessesVerifiedAbsent:true,
            };
        }
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
