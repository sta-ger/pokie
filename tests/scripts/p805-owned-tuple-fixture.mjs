// Small real-process fixture for the tuple supervisor, never a browser proof.
import {spawn} from "node:child_process";
import {Worker} from "node:worker_threads";
import {createHash, randomBytes} from "node:crypto";
import {writeFileSync} from "node:fs";
import {readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import {processIdentity, registerPc20OwnedResource} from "../../scripts/pc-20-release-completion.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => index % 2 ? pairs : [...pairs, [value, all[index + 1]]], []));
const tuple = {persona:args["--persona"], observation:args["--observation"], viewport:args["--viewport"]};
const phase = args["--phase"], candidateId = args["--candidate"], candidatePackageSha256 = args["--package-sha256"], worker = {pid:process.pid, nonce:`worker-${process.pid}`, processIdentity:processIdentity(process.pid)};
const output = args["--output"], stem = `${phase}-${tuple.persona}--${tuple.observation}--${tuple.viewport}`;
const second = tuple.viewport === "compact", mode = process.env.P805_OWNERSHIP_FIXTURE_MODE;

if (second && ["timeout", "tamper", "cancellation", "failure", "success-descendants"].includes(mode)) {
    process.on("SIGTERM", () => {
        if (mode === "timeout") writeFileSync(path.join(output, "timeout-worker-signalled.txt"), "SIGTERM");
    });
    const grandchildCode = 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);';
    // Studio rotates its local ownership namespace just like a restarted
    // installed CLI. The tuple supervisor must still see its grandchildren.
    const studioEnvironment = {...process.env, POKIE_PC20_RESOURCE_REGISTRY:path.join(output, "studio-resources.ndjson"), POKIE_PC20_RESOURCE_REGISTRY_SECRET:randomBytes(32).toString("hex"), POKIE_PC20_OPERATION_ID:randomBytes(16).toString("hex")};
    const studioCode = `const {spawn} = require('node:child_process'); process.on('SIGTERM', () => {}); const child = spawn(process.execPath, ['-e', ${JSON.stringify(grandchildCode)}], {detached:true, stdio:'ignore'}); child.unref(); process.stdout.write('STUDIO_READY\\n'); setInterval(() => {}, 1000);`;
    const studio = spawn(process.execPath, ["-e", studioCode], {env:studioEnvironment, detached:true, stdio:["ignore", "pipe", "pipe"]});
    await new Promise((resolve, reject) => { studio.stdout.once("data", resolve); studio.once("error", reject); });
    const browser = spawn(process.execPath, ["-e", grandchildCode], {detached:true, stdio:"ignore"});
    const environment = {POKIE_PC20_RESOURCE_REGISTRY:process.env.POKIE_P805_SUPERVISOR_REGISTRY, POKIE_PC20_RESOURCE_REGISTRY_SECRET:process.env.POKIE_P805_SUPERVISOR_SECRET, POKIE_PC20_OPERATION_ID:process.env.POKIE_P805_SUPERVISOR_OPERATION};
    registerPc20OwnedResource({kind:"browser", resourceId:`browser:${browser.pid}`, pid:browser.pid, processIdentity:processIdentity(browser.pid)}, "acquired", environment);
    const thread = new Worker(grandchildCode, {eval:true});
    await new Promise((resolve) => thread.once("online", resolve));
    if (mode === "tamper") {
        const predecessor = path.join(output, `${phase}-${tuple.persona}--${tuple.observation}--wide-tuple-receipt.json`);
        await writeFile(predecessor, `${await readFile(predecessor, "utf8")} `);
    }
    process.stdout.write("TUPLE_READY\n");
    if (mode === "failure") process.exit(1);
    if (mode !== "success-descendants") await new Promise(() => {});
}

const result = {status:"completed", observation:tuple.observation};
const action = {
    ...tuple, route:"/#/project/fixture/overview", stableControlId:"project-tab:overview", browserRequestId:`browser-${process.pid}`,
    expectedMethod:"GET", expectedBodyKind:null, expectedApi:"/api/project/context", expectedArtifact:null, expectedTerminal:"project-context",
    interaction:{keyboardFocused:true, keyboardActivated:true, activation:"keyboard", transactionState:"navigation", lifecycle:{kind:"navigation", value:"overview"}},
    transaction:{stateClass:"navigation", control:{stableControlId:"project-tab:overview"}, pointerActivations:[], keyboardActivations:[{kind:"keyboard", controlId:"project-tab:overview", count:1, nativeFocus:true, preDispatchFocus:{controlId:"project-tab:overview", native:true}}], request:{browserRequestId:`browser-${process.pid}`, method:"GET", path:"/api/project/context"}},
    terminal:{status:"completed", resultSha256:sha(JSON.stringify(result))},
    visibleTerminal:{observedAfterRequestId:`browser-${process.pid}`, resultSha256:sha(JSON.stringify(result)), lifecycle:{controlId:"project-tab:overview", stateClass:"navigation"}},
};
const checkpointValue = {kind:"p8-05-packed-workflow-checkpoint", auditId:`audit-${process.pid}`, worker, candidateId, candidatePackageSha256, ...tuple, action};
const checkpointBytes = JSON.stringify(checkpointValue), checkpoint = {receiptId:`checkpoint-${process.pid}`, candidateId, candidatePackageSha256, ...tuple, workerPid:process.pid, actionSha256:sha(JSON.stringify(action)), path:`${stem}-checkpoint.json`, sha256:sha(checkpointBytes)};
const cleanup = {schemaVersion:1, kind:"p8-05-packed-tuple-cleanup", phase, candidateId, candidatePackageSha256, tuple, worker, cleanup:{exit:"success", processTreeDrained:true, resourcesDrained:true, contextRemoved:true}, cleanupEvidenceId:`cleanup-${process.pid}`};
const cleanupBytes = JSON.stringify(cleanup), receipt = {schemaVersion:1, kind:"p8-05-packed-tuple-receipt", status:"passed", phase, candidateId, candidatePackageSha256, tuple, worker, auditId:`audit-${process.pid}`, checkpointReceipt:checkpoint, action, cleanupEvidenceId:cleanup.cleanupEvidenceId, cleanupSha256:sha(cleanupBytes)};
const audit = {auditId:receipt.auditId, persona:tuple.persona, workflowPersonas:[tuple.persona], tuple, phase, candidateId, candidatePackageSha256, worker, packageIdentity:{installedCli:path.join(args["--runtime-root"], "node_modules/.bin/pokie"), sharedRuntimeReceiptSha256:args["--runtime-identity-receipt-sha256"], sharedRuntimeRoot:args["--runtime-root"]}, checkpointReceipts:[checkpoint], rendered:{actions:[action]}, cleanup:{evidenceId:cleanup.cleanupEvidenceId}};
await writeFile(path.join(output, checkpoint.path), checkpointBytes, {flag:"wx"});
await writeFile(args["--tuple-cleanup"], cleanupBytes, {flag:"wx"});
await writeFile(args["--tuple-receipt"], JSON.stringify(receipt), {flag:"wx"});
await writeFile(path.join(output, `${stem}-audit.json`), JSON.stringify(audit), {flag:"wx"});
process.exit(0);
