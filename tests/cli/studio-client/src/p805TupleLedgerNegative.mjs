import {EventEmitter} from "node:events";
import {createHash} from "node:crypto";
import {mkdtemp, readFile, readdir, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {runP805ProcessIsolatedPackedProof} from "../../../../scripts/p8-05-valera-browser-audit.mjs";

const output = await mkdtemp(path.join(tmpdir(), "p8-05-parent-ledger-negative-"));
const candidate = "1".repeat(40), candidatePackageSha256 = "a".repeat(64), candidateExecutableSha256 = "b".repeat(64);
const tuples = [
    {persona:"mathematician", observation:"blueprint", viewport:"wide"},
    {persona:"mathematician", observation:"blueprint", viewport:"compact"},
];
const sha = (value) => createHash("sha256").update(value).digest("hex");
let spawned = 0;
const cleanupKinds = [];
const receiptFor = (tuple, pid) => {
    const action = {persona:tuple.persona, observation:tuple.observation, viewport:tuple.viewport};
    const checkpoint = {receiptId:`checkpoint-${pid}`, candidateId:candidate, candidatePackageSha256, persona:tuple.persona, observation:tuple.observation, viewport:tuple.viewport, workerPid:pid, actionSha256:sha(JSON.stringify(action)), sha256:sha(`checkpoint-${pid}`)};
    const cleanup = {schemaVersion:1, kind:"p8-05-packed-tuple-cleanup", phase:"initial", candidateId:candidate, candidatePackageSha256, tuple, worker:{pid}, cleanup:{exit:"success", processTreeDrained:true, resourcesDrained:true, contextRemoved:true}, cleanupEvidenceId:`cleanup-${pid}`};
    const receipt = {schemaVersion:1, kind:"p8-05-packed-tuple-receipt", status:"passed", phase:"initial", candidateId:candidate, candidatePackageSha256, tuple, worker:{pid}, auditId:`audit-${pid}`, checkpointReceipt:checkpoint, action, cleanupEvidenceId:cleanup.cleanupEvidenceId, cleanupSha256:sha(`cleanup-${pid}`)};
    return {action, checkpoint, cleanup, receipt};
};
try {
    let failure;
    try {
        await runP805ProcessIsolatedPackedProof({persona:"all", workflowPersonas:["all"], phase:"initial", candidateId:candidate, candidatePackageSha256, candidateExecutableSha256, candidateExecutableReceipt:{path:path.join(output, "external-receipt.json"), sha256:"c".repeat(64)}, packedPackage:path.join(output, "candidate.tgz"), output}, {
            tuples,
            exists:() => false,
            spawn:() => Object.assign(new EventEmitter(), {pid:8100 + spawned++, exitCode:null, signalCode:null}),
            childResult:async () => spawned === 1 ? {exitCode:0, signal:null, stdout:"", stderr:""} : Promise.reject(new Error("worker timeout")),
            cleanupChild:async (_child, kind) => { cleanupKinds.push(kind); return {processTreeDrained:true, resourcesDrained:true}; },
            readChildTupleReceipt:async (_receiptPath, _cleanupPath, expected, pid) => {
                const value = receiptFor(expected.tuple, pid);
                return {receipt:value.receipt, cleanup:value.cleanup, receiptPath:`receipt-${pid}.json`, receiptSha256:sha(`receipt-${pid}`), cleanupPath:`cleanup-${pid}.json`, cleanupSha256:sha(`cleanup-${pid}`)};
            },
            readChildAudit:async (_output, _phase, _persona, _candidate, _package, pid, tuple) => {
                const value = receiptFor(tuple, pid);
                return {audit:{auditId:`audit-${pid}`, worker:{pid, nonce:`worker-${pid}`}, checkpointReceipts:[value.checkpoint], rendered:{actions:[value.action]}, cleanup:{evidenceId:value.cleanup.cleanupEvidenceId}}, auditPath:`audit-${pid}.json`, auditSha256:sha(`audit-${pid}`)};
            },
        });
    } catch (error) { failure = error; }
    if (!/after preserving 1 accepted tuple receipts/.test(String(failure)) || cleanupKinds.join(",") !== "success,timeout") throw new Error(`parent did not retain the first accepted tuple while draining the timed-out second child: ${failure}; ${cleanupKinds.join(",")}`);
    const failed = (await readdir(output)).find((name) => name.includes("process-isolated-packed-proof.failed-"));
    if (!failed || (await readdir(output)).includes("initial-process-isolated-packed-proof.json")) throw new Error("parent published an aggregate after a tuple failure");
    const ledger = JSON.parse(await readFile(path.join(output, failed), "utf8"));
    if (ledger.acceptedReceipts.length !== 1 || ledger.failedTuple.viewport !== "compact" || ledger.attemptedChild.failureKind !== "timeout" || !ledger.attemptedChild.cleanup.processTreeDrained || !ledger.attemptedChild.cleanup.resourcesDrained) throw new Error("failure ledger did not preserve the accepted receipt and timeout cleanup");
    process.stdout.write(`${JSON.stringify({acceptedReceipts:ledger.acceptedReceipts.length, aggregatePublished:false, failureKind:ledger.attemptedChild.failureKind, cleanupKinds})}\n`);
} finally {
    await rm(output, {recursive:true, force:true});
}
