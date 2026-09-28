import {EventEmitter} from "node:events";
import {createHash} from "node:crypto";
import {mkdtemp, readFile, readdir, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {runP805ProcessIsolatedPackedProof, validateP805RestartRecoveryTerminalReceipt, validateP805RetryTerminalReceipt} from "../../../../scripts/p8-05-valera-browser-audit.mjs";

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
    const result = {status:"completed", observation:tuple.observation};
    const action = {
        persona:tuple.persona, observation:tuple.observation, viewport:tuple.viewport,
        route:"/#/project/fixture/overview", stableControlId:"project-tab:overview", browserRequestId:`browser-${pid}`,
        expectedMethod:"GET", expectedBodyKind:null, expectedApi:"/api/project/context", expectedArtifact:null, expectedTerminal:"project-context",
        interaction:{keyboardFocused:true, keyboardActivated:true, activation:"keyboard", transactionState:"navigation", lifecycle:{kind:"navigation", value:"overview"}},
        transaction:{stateClass:"navigation", control:{stableControlId:"project-tab:overview"}, keyboardActivations:[{kind:"keyboard", controlId:"project-tab:overview", count:1, nativeFocus:true, preDispatchFocus:{controlId:"project-tab:overview", native:true}}], request:{browserRequestId:`browser-${pid}`, method:"GET", path:"/api/project/context"}},
        terminal:{status:"completed", resultSha256:sha(JSON.stringify(result))},
        visibleTerminal:{observedAfterRequestId:`browser-${pid}`, resultSha256:sha(JSON.stringify(result)), lifecycle:{controlId:"project-tab:overview", stateClass:"navigation"}},
    };
    const checkpoint = {receiptId:`checkpoint-${pid}`, candidateId:candidate, candidatePackageSha256, persona:tuple.persona, observation:tuple.observation, viewport:tuple.viewport, workerPid:pid, actionSha256:sha(JSON.stringify(action)), sha256:sha(`checkpoint-${pid}`)};
    const cleanup = {schemaVersion:1, kind:"p8-05-packed-tuple-cleanup", phase:"initial", candidateId:candidate, candidatePackageSha256, tuple, worker:{pid}, cleanup:{exit:"success", processTreeDrained:true, resourcesDrained:true, contextRemoved:true}, cleanupEvidenceId:`cleanup-${pid}`};
    const receipt = {schemaVersion:1, kind:"p8-05-packed-tuple-receipt", status:"passed", phase:"initial", candidateId:candidate, candidatePackageSha256, tuple, worker:{pid}, auditId:`audit-${pid}`, checkpointReceipt:checkpoint, action, cleanupEvidenceId:cleanup.cleanupEvidenceId, cleanupSha256:sha(`cleanup-${pid}`)};
    return {action, checkpoint, cleanup, receipt};
};
const pointerReceiptFor = (tuple, pid) => {
    const value = receiptFor(tuple, pid), {action} = value;
    action.interaction = {keyboardFocused:false, pointerActivated:true, activation:"pointer", transactionState:"navigation", lifecycle:{kind:"navigation", value:"overview"}};
    action.transaction.pointerActivations = [{kind:"pointer", controlId:"project-tab:overview", capturedControlId:"project-tab:overview", captureKey:`capture-${pid}`, count:1, preDispatchFocus:{controlId:"project-tab:overview", native:true}, hitTest:{capturedControlId:"project-tab:overview", matchesCapturedControl:true}, dispatch:{kind:"native-pointer", pressed:true, released:true, focus:{eventType:"pointerdown", controlId:"project-tab:overview", native:true, targetMatchesCapturedControl:true}}}];
    action.transaction.keyboardActivations = [];
    action.transaction.postTransitionRenderedState = {capturedControlId:"project-tab:overview", captureKey:`capture-${pid}`, controlState:"replaced", currentControlId:"project-tab:overview", capturedControlConnected:false, requestId:`browser-${pid}`, resultSha256:action.terminal.resultSha256, resultControlId:"project-tab:overview", renderedTerminal:true};
    value.checkpoint.actionSha256 = sha(JSON.stringify(action));
    value.receipt.checkpointReceipt = value.checkpoint;
    value.receipt.action = action;
    return value;
};
const stateSubstitutedReceiptFor = (tuple, pid) => {
    const value = receiptFor(tuple, pid), {action} = value;
    action.interaction.transactionState = "read-only-operation";
    action.transaction.stateClass = "read-only-operation";
    action.visibleTerminal.lifecycle.stateClass = "read-only-operation";
    value.checkpoint.actionSha256 = sha(JSON.stringify(action));
    value.receipt.checkpointReceipt = value.checkpoint;
    value.receipt.action = action;
    return value;
};
const runtime = () => ({root:"/tmp/p8-05-read-only-runtime", receipt:{path:"/tmp/p8-05-runtime-receipt.json", sha256:"d".repeat(64)}, value:{kind:"p8-05-immutable-packed-runtime", candidateId:candidate, candidatePackageSha256, candidateExecutableSha256, archiveSha256:candidatePackageSha256, installation:{count:1}, permissions:"read-only-before-any-tuple-child"}});
const auditFor = (tuple, pid) => {
    const value = receiptFor(tuple, pid);
    return {audit:{auditId:`audit-${pid}`, persona:tuple.persona, workflowPersonas:[tuple.persona], tuple, phase:"initial", candidateId:candidate, candidatePackageSha256, worker:{pid, nonce:`worker-${pid}`}, packageIdentity:{installedCli:"/tmp/p8-05-read-only-runtime/node_modules/.bin/pokie", sharedRuntimeReceiptSha256:"d".repeat(64), sharedRuntimeRoot:"/tmp/p8-05-read-only-runtime"}, checkpointReceipts:[value.checkpoint], rendered:{actions:[value.action]}, cleanup:{evidenceId:value.cleanup.cleanupEvidenceId}}, auditPath:`audit-${pid}.json`, auditSha256:sha(`audit-${pid}`)};
};
const pointerAuditFor = (tuple, pid) => {
    const value = pointerReceiptFor(tuple, pid);
    return {audit:{auditId:`audit-${pid}`, persona:tuple.persona, workflowPersonas:[tuple.persona], tuple, phase:"initial", candidateId:candidate, candidatePackageSha256, worker:{pid, nonce:`worker-${pid}`}, packageIdentity:{installedCli:"/tmp/p8-05-read-only-runtime/node_modules/.bin/pokie", sharedRuntimeReceiptSha256:"d".repeat(64), sharedRuntimeRoot:"/tmp/p8-05-read-only-runtime"}, checkpointReceipts:[value.checkpoint], rendered:{actions:[value.action]}, cleanup:{evidenceId:value.cleanup.cleanupEvidenceId}}, auditPath:`audit-${pid}.json`, auditSha256:sha(`pointer-audit-${pid}`)};
};
async function retainedFailure(kind, message, mutateReceipt, mutateAudit) {
    const directory = await mkdtemp(path.join(tmpdir(), `p8-05-parent-ledger-${kind}-`));
    let launches = 0;
    const cleanups = [];
    try {
        let failure;
        try {
            await runP805ProcessIsolatedPackedProof({persona:"all", workflowPersonas:["all"], phase:"initial", candidateId:candidate, candidatePackageSha256, candidateExecutableSha256, candidateExecutableReceipt:{path:path.join(directory, "external-receipt.json"), sha256:"c".repeat(64)}, packedPackage:path.join(directory, "candidate.tgz"), output:directory}, {
                tuples,
                prepareRuntime:async () => runtime(),
                validateSharedRuntime:async () => undefined,
                exists:(target) => kind === "restart" && launches === 1 && target.includes("tuple-"),
                spawn:() => {
                    if (kind === "spawn-failure" && launches === 1) throw new Error(message);
                    return Object.assign(new EventEmitter(), {pid:10_000 + launches++, exitCode:null, signalCode:null});
                },
                childResult:async (child) => child.pid === 10_000 || kind === "detached-descendant" ? {exitCode:0, signal:null, stdout:"", stderr:""} : Promise.reject(new Error(message)),
                cleanupChild:async (child, cleanupKind) => {
                    cleanups.push(cleanupKind);
                    if (kind === "detached-descendant" && child?.pid === 10_001 && cleanupKind === "success") return {processTreeDrained:false, resourcesDrained:false};
                    return {processTreeDrained:true, resourcesDrained:true};
                },
                readChildTupleReceipt:async (_receiptPath, _cleanupPath, expected, pid) => {
                    const value = receiptFor(expected.tuple, pid);
                    mutateReceipt?.(value, pid);
                    return {receipt:value.receipt, cleanup:value.cleanup, receiptPath:`receipt-${pid}.json`, receiptSha256:sha(`receipt-${pid}`), cleanupPath:`cleanup-${pid}.json`, cleanupSha256:sha(`cleanup-${pid}`)};
                },
                readChildAudit:async (_output, _phase, _persona, _candidate, _package, pid, tuple) => {
                    const value = auditFor(tuple, pid);
                    mutateAudit?.(value, pid);
                    return value;
                },
            });
        } catch (error) { failure = error; }
        if (!/after preserving 1 accepted tuple receipts/.test(String(failure))) throw new Error(`${kind} did not retain the accepted predecessor: ${failure}`);
        const names = await readdir(directory), failed = names.find((name) => name.includes("process-isolated-packed-proof.failed-"));
        if (!failed || names.includes("initial-process-isolated-packed-proof.json")) throw new Error(`${kind} published an aggregate after a tuple failure`);
        const ledger = JSON.parse(await readFile(path.join(directory, failed), "utf8"));
        if (ledger.acceptedReceipts.length !== 1 || ledger.failedTuple.viewport !== "compact" || ledger.attemptedChild.failureKind !== kind || !ledger.attemptedChild.cleanup.processTreeDrained || !ledger.attemptedChild.cleanup.resourcesDrained) throw new Error(`${kind} failure ledger did not retain the predecessor and owned cleanup`);
        return cleanups;
    } finally { await rm(directory, {recursive:true, force:true}); }
}
try {
    let failure;
    try {
        await runP805ProcessIsolatedPackedProof({persona:"all", workflowPersonas:["all"], phase:"initial", candidateId:candidate, candidatePackageSha256, candidateExecutableSha256, candidateExecutableReceipt:{path:path.join(output, "external-receipt.json"), sha256:"c".repeat(64)}, packedPackage:path.join(output, "candidate.tgz"), output}, {
            tuples,
            prepareRuntime:async () => ({root:"/tmp/p8-05-read-only-runtime", receipt:{path:"/tmp/p8-05-runtime-receipt.json", sha256:"d".repeat(64)}, value:{kind:"p8-05-immutable-packed-runtime", candidateId:candidate, candidatePackageSha256, candidateExecutableSha256, archiveSha256:candidatePackageSha256, installation:{count:1}, permissions:"read-only-before-any-tuple-child"}}),
            validateSharedRuntime:async () => undefined,
            exists:() => false,
            spawn:() => Object.assign(new EventEmitter(), {pid:8100 + spawned++, exitCode:null, signalCode:null}),
            childResult:async () => spawned === 1 ? {exitCode:0, signal:null, stdout:"", stderr:""} : Promise.reject(new Error("worker timeout")),
            cleanupChild:async (_child, kind) => { cleanupKinds.push(kind); return {processTreeDrained:true, resourcesDrained:true}; },
            readChildTupleReceipt:async (_receiptPath, _cleanupPath, expected, pid) => {
                const value = receiptFor(expected.tuple, pid);
                return {receipt:value.receipt, cleanup:value.cleanup, receiptPath:`receipt-${pid}.json`, receiptSha256:sha(`receipt-${pid}`), cleanupPath:`cleanup-${pid}.json`, cleanupSha256:sha(`cleanup-${pid}`)};
            },
            readChildAudit:async (_output, _phase, _persona, _candidate, _package, pid, tuple) => auditFor(tuple, pid),
        });
    } catch (error) { failure = error; }
    if (!/after preserving 1 accepted tuple receipts/.test(String(failure)) || cleanupKinds.join(",") !== "success,timeout") throw new Error(`parent did not retain the first accepted tuple while draining the timed-out second child: ${failure}; ${cleanupKinds.join(",")}`);
    const failed = (await readdir(output)).find((name) => name.includes("process-isolated-packed-proof.failed-"));
    if (!failed || (await readdir(output)).includes("initial-process-isolated-packed-proof.json")) throw new Error("parent published an aggregate after a tuple failure");
    const ledger = JSON.parse(await readFile(path.join(output, failed), "utf8"));
    if (ledger.acceptedReceipts.length !== 1 || ledger.failedTuple.viewport !== "compact" || ledger.attemptedChild.failureKind !== "timeout" || !ledger.attemptedChild.cleanup.processTreeDrained || !ledger.attemptedChild.cleanup.resourcesDrained) throw new Error("failure ledger did not preserve the accepted receipt and timeout cleanup");
    const retainedFailureKinds = {};
    for (const [kind, message] of [["failure", "injected worker failure"], ["cancellation", "injected cancellation"], ["spawn-failure", "injected spawn failure"], ["restart", "unused restart error"], ["detached-descendant", "unused detached descendant error"]]) retainedFailureKinds[kind] = await retainedFailure(kind, message);
    retainedFailureKinds["cleanup-substitution"] = await retainedFailure("failure", "cleanup substitution", (value, pid) => {
        if (pid === 10_001) value.cleanup.cleanupEvidenceId = "substituted-cleanup";
    });
    const rejectedReceiptSubstitutions = {};
    for (const [name, mutateReceipt, mutateAudit] of [
        ["missing", (value, pid) => { if (pid === 10_001) delete value.receipt.checkpointReceipt; }],
        ["stale", (value, pid) => { if (pid === 10_001) value.receipt.worker.pid = 10_000; }],
        ["cross-candidate", (value, pid) => { if (pid === 10_001) value.receipt.candidateId = "f".repeat(40); }],
        ["cross-persona", (value, pid) => { if (pid === 10_001) value.receipt.tuple = {...value.receipt.tuple, persona:"programmer"}; }],
        ["cross-viewport", (value, pid) => { if (pid === 10_001) value.cleanup.tuple = {...value.cleanup.tuple, viewport:"wide"}; }],
        ["duplicate", undefined, (value, pid) => { if (pid === 10_001) { value.audit.checkpointReceipts.push({...value.audit.checkpointReceipts[0], receiptId:"duplicate-checkpoint"}); value.audit.rendered.actions.push({...value.audit.rendered.actions[0]}); } }],
        ["content-equivalent", undefined, (value, pid) => { if (pid === 10_001) value.auditSha256 = sha("audit-10000"); }],
    ]) {
        await retainedFailure("failure", `injected ${name} tuple receipt`, mutateReceipt, mutateAudit);
        rejectedReceiptSubstitutions[name] = true;
    }
    const pointerSemanticOutput = await mkdtemp(path.join(tmpdir(), "p8-05-parent-ledger-pointer-semantic-negative-"));
    try {
        let pointerSemanticFailure, pointerLaunches = 0;
        try {
            await runP805ProcessIsolatedPackedProof({persona:"all", workflowPersonas:["all"], phase:"initial", candidateId:candidate, candidatePackageSha256, candidateExecutableSha256, candidateExecutableReceipt:{path:path.join(pointerSemanticOutput, "external-receipt.json"), sha256:"c".repeat(64)}, packedPackage:path.join(pointerSemanticOutput, "candidate.tgz"), output:pointerSemanticOutput}, {
                tuples,
                prepareRuntime:async () => runtime(),
                validateSharedRuntime:async () => undefined,
                exists:() => false,
                spawn:() => Object.assign(new EventEmitter(), {pid:9_100 + pointerLaunches++, exitCode:null, signalCode:null}),
                childResult:async () => ({exitCode:0, signal:null, stdout:"", stderr:""}),
                cleanupChild:async () => ({processTreeDrained:true, resourcesDrained:true}),
                readChildTupleReceipt:async (_receiptPath, _cleanupPath, expected, pid) => {
                    const value = pointerReceiptFor(expected.tuple, pid);
                    if (pid === 9_101) value.receipt.action.transaction.postTransitionRenderedState.captureKey = "substituted-capture-key";
                    return {receipt:value.receipt, cleanup:value.cleanup, receiptPath:`pointer-receipt-${pid}.json`, receiptSha256:sha(`pointer-receipt-${pid}`), cleanupPath:`pointer-cleanup-${pid}.json`, cleanupSha256:sha(`pointer-cleanup-${pid}`)};
                },
                readChildAudit:async (_output, _phase, _persona, _candidate, _package, pid, tuple) => {
                    const value = pointerAuditFor(tuple, pid);
                    if (pid === 9_101) value.audit.rendered.actions[0].transaction.postTransitionRenderedState.captureKey = "substituted-capture-key";
                    return value;
                },
            });
        } catch (error) { pointerSemanticFailure = error; }
        if (!/substitutes a state-class or rendered transaction boundary/.test(String(pointerSemanticFailure)) || (await readdir(pointerSemanticOutput)).includes("initial-process-isolated-packed-proof.json")) throw new Error(`parent accepted a pointer transaction without a correlated captured identity: ${pointerSemanticFailure}`);
    } finally { await rm(pointerSemanticOutput, {recursive:true, force:true}); }
    const stateClassOutput = await mkdtemp(path.join(tmpdir(), "p8-05-parent-ledger-state-class-negative-"));
    try {
        let stateClassFailure;
        try {
            await runP805ProcessIsolatedPackedProof({persona:"all", workflowPersonas:["all"], phase:"initial", candidateId:candidate, candidatePackageSha256, candidateExecutableSha256, candidateExecutableReceipt:{path:path.join(stateClassOutput, "external-receipt.json"), sha256:"c".repeat(64)}, packedPackage:path.join(stateClassOutput, "candidate.tgz"), output:stateClassOutput}, {
                tuples:[tuples[0]],
                prepareRuntime:async () => ({root:"/tmp/p8-05-read-only-runtime", receipt:{path:"/tmp/p8-05-runtime-receipt.json", sha256:"d".repeat(64)}, value:{kind:"p8-05-immutable-packed-runtime", candidateId:candidate, candidatePackageSha256, candidateExecutableSha256, archiveSha256:candidatePackageSha256, installation:{count:1}, permissions:"read-only-before-any-tuple-child"}}),
                validateSharedRuntime:async () => undefined,
                exists:() => false,
                spawn:() => Object.assign(new EventEmitter(), {pid:9200, exitCode:null, signalCode:null}),
                childResult:async () => ({exitCode:0, signal:null, stdout:"", stderr:""}),
                cleanupChild:async () => ({processTreeDrained:true, resourcesDrained:true}),
                readChildTupleReceipt:async (_receiptPath, _cleanupPath, expected, pid) => {
                    const value = stateSubstitutedReceiptFor(expected.tuple, pid);
                    return {receipt:value.receipt, cleanup:value.cleanup, receiptPath:`receipt-${pid}.json`, receiptSha256:sha(`receipt-${pid}`), cleanupPath:`cleanup-${pid}.json`, cleanupSha256:sha(`cleanup-${pid}`)};
                },
                readChildAudit:async (_output, _phase, _persona, _candidate, _package, pid, tuple) => {
                    const value = stateSubstitutedReceiptFor(tuple, pid);
                    const published = auditFor(tuple, pid);
                    published.audit.checkpointReceipts = [value.checkpoint];
                    published.audit.rendered.actions = [value.action];
                    return published;
                },
            });
        } catch (error) { stateClassFailure = error; }
        if (!/substitutes a state-class or rendered transaction boundary/.test(String(stateClassFailure)) || (await readdir(stateClassOutput)).includes("initial-process-isolated-packed-proof.json")) throw new Error(`parent accepted a state-class-substituted tuple receipt: ${stateClassFailure}`);
    } finally { await rm(stateClassOutput, {recursive:true, force:true}); }
    const runtimeSubstitutionOutput = await mkdtemp(path.join(tmpdir(), "p8-05-parent-ledger-runtime-substitution-negative-"));
    try {
        let runtimeSubstitutionFailure;
        try {
            await runP805ProcessIsolatedPackedProof({persona:"all", workflowPersonas:["all"], phase:"initial", candidateId:candidate, candidatePackageSha256, candidateExecutableSha256, candidateExecutableReceipt:{path:path.join(runtimeSubstitutionOutput, "external-receipt.json"), sha256:"c".repeat(64)}, packedPackage:path.join(runtimeSubstitutionOutput, "candidate.tgz"), output:runtimeSubstitutionOutput}, {
                tuples:[tuples[0]],
                prepareRuntime:async () => ({root:"/tmp/p8-05-read-only-runtime", receipt:{path:"/tmp/p8-05-runtime-receipt.json", sha256:"d".repeat(64)}, value:{kind:"p8-05-immutable-packed-runtime", candidateId:candidate, candidatePackageSha256, candidateExecutableSha256, archiveSha256:candidatePackageSha256, installation:{count:1}, permissions:"read-only-before-any-tuple-child"}}),
                validateSharedRuntime:async () => undefined,
                exists:() => false,
                spawn:() => Object.assign(new EventEmitter(), {pid:9300, exitCode:null, signalCode:null}),
                childResult:async () => ({exitCode:0, signal:null, stdout:"", stderr:""}),
                cleanupChild:async () => ({processTreeDrained:true, resourcesDrained:true}),
                readChildTupleReceipt:async (_receiptPath, _cleanupPath, expected, pid) => {
                    const value = receiptFor(expected.tuple, pid);
                    return {receipt:value.receipt, cleanup:value.cleanup, receiptPath:`receipt-${pid}.json`, receiptSha256:sha(`receipt-${pid}`), cleanupPath:`cleanup-${pid}.json`, cleanupSha256:sha(`cleanup-${pid}`)};
                },
                readChildAudit:async (_output, _phase, _persona, _candidate, _package, pid, tuple) => {
                    const published = auditFor(tuple, pid);
                    published.audit.packageIdentity.sharedRuntimeReceiptSha256 = "e".repeat(64);
                    published.audit.packageIdentity.sharedRuntimeRoot = "/tmp/p8-05-substituted-runtime";
                    return published;
                },
            });
        } catch (error) { runtimeSubstitutionFailure = error; }
        if (!/substituted the parent immutable runtime identity/.test(String(runtimeSubstitutionFailure)) || (await readdir(runtimeSubstitutionOutput)).includes("initial-process-isolated-packed-proof.json")) throw new Error(`parent accepted a runtime-substituted tuple receipt: ${runtimeSubstitutionFailure}`);
    } finally { await rm(runtimeSubstitutionOutput, {recursive:true, force:true}); }
    const runtimeOmissionOutput = await mkdtemp(path.join(tmpdir(), "p8-05-parent-ledger-runtime-omission-negative-"));
    try {
        let runtimeOmissionFailure;
        try {
            await runP805ProcessIsolatedPackedProof({persona:"all", workflowPersonas:["all"], phase:"initial", candidateId:candidate, candidatePackageSha256, candidateExecutableSha256, candidateExecutableReceipt:{path:path.join(runtimeOmissionOutput, "external-receipt.json"), sha256:"c".repeat(64)}, packedPackage:path.join(runtimeOmissionOutput, "candidate.tgz"), output:runtimeOmissionOutput}, {
                tuples:[tuples[0]],
                prepareRuntime:async () => ({root:"/tmp/p8-05-read-only-runtime", receipt:{path:"/tmp/p8-05-runtime-receipt.json", sha256:"d".repeat(64)}, value:{kind:"p8-05-immutable-packed-runtime", candidateId:candidate, candidatePackageSha256, candidateExecutableSha256, archiveSha256:candidatePackageSha256, installation:{count:1}, permissions:"read-only-before-any-tuple-child"}}),
                validateSharedRuntime:async () => undefined,
                exists:() => false,
                spawn:() => Object.assign(new EventEmitter(), {pid:9400, exitCode:null, signalCode:null}),
                childResult:async () => ({exitCode:0, signal:null, stdout:"", stderr:""}),
                cleanupChild:async () => ({processTreeDrained:true, resourcesDrained:true}),
                readChildTupleReceipt:async (_receiptPath, _cleanupPath, expected, pid) => {
                    const value = receiptFor(expected.tuple, pid);
                    return {receipt:value.receipt, cleanup:value.cleanup, receiptPath:`receipt-${pid}.json`, receiptSha256:sha(`receipt-${pid}`), cleanupPath:`cleanup-${pid}.json`, cleanupSha256:sha(`cleanup-${pid}`)};
                },
                readChildAudit:async (_output, _phase, _persona, _candidate, _package, pid, tuple) => {
                    const published = auditFor(tuple, pid);
                    delete published.audit.packageIdentity.sharedRuntimeReceiptSha256;
                    delete published.audit.packageIdentity.sharedRuntimeRoot;
                    return published;
                },
            });
        } catch (error) { runtimeOmissionFailure = error; }
        if (!/substituted the parent immutable runtime identity/.test(String(runtimeOmissionFailure)) || (await readdir(runtimeOmissionOutput)).includes("initial-process-isolated-packed-proof.json")) throw new Error(`parent accepted a child that omitted its shared runtime proof: ${runtimeOmissionFailure}`);
    } finally { await rm(runtimeOmissionOutput, {recursive:true, force:true}); }
    const retryResult = {id:"retry-job", status:"completed"}, retryReceipt = {operation:"simulation-retry", controlId:"simulation-retry", stateClass:"recovery-operation", transaction:{operation:"simulation-retry", stateClass:"recovery-operation", control:{stableControlId:"simulation-retry"}, pointerActivations:[{kind:"pointer", controlId:"simulation-retry", capturedControlId:"simulation-retry", captureKey:"retry-capture", count:1, preDispatchFocus:{controlId:"simulation-retry", native:true}, hitTest:{capturedControlId:"simulation-retry", matchesCapturedControl:true}, dispatch:{kind:"native-pointer", pressed:true, released:true, focus:{controlId:"simulation-retry", native:true, targetMatchesCapturedControl:true}}}], requestCount:1, request:{browserRequestId:"retry-request", method:"POST", path:"/api/project/simulations"}, terminal:{status:"completed", jobId:"retry-job", resultSha256:sha(JSON.stringify(retryResult)), causedByRequestId:"retry-request"}, postTransitionRenderedState:{capturedControlId:"simulation-retry", captureKey:"retry-capture", controlState:"replaced", currentControlId:"simulation-retry", capturedControlConnected:false, requestId:"retry-request", resultSha256:sha(JSON.stringify(retryResult)), resultControlId:"simulation-retry", resultOperation:"simulation-retry", resultStateClass:"recovery-operation", resultReceipt:"durable-terminal", resultJobId:"retry-job", resultTerminal:"completed", renderedTerminal:true}}};
    validateP805RetryTerminalReceipt(retryReceipt);
    let retryTerminalSubstitutionRejected = false;
    try { validateP805RetryTerminalReceipt({...retryReceipt, transaction:{...retryReceipt.transaction, postTransitionRenderedState:{...retryReceipt.transaction.postTransitionRenderedState, resultControlId:"simulation-run"}}}); }
    catch (error) { retryTerminalSubstitutionRejected = /status\/job-equivalent/.test(String(error)); }
    if (!retryTerminalSubstitutionRejected) throw new Error("collector accepted a simulation-run terminal receipt for Retry");
    let retryTerminalJobSubstitutionRejected = false;
    try { validateP805RetryTerminalReceipt({...retryReceipt, transaction:{...retryReceipt.transaction, postTransitionRenderedState:{...retryReceipt.transaction.postTransitionRenderedState, resultJobId:"simulation-run-job"}}}); }
    catch (error) { retryTerminalJobSubstitutionRejected = /status\/job-equivalent/.test(String(error)); }
    if (!retryTerminalJobSubstitutionRejected) throw new Error("collector accepted a Retry terminal receipt bound to another durable job");
    const restartResult = {id:"restart-job", status:"recovery-required"}, restartRequest = {rounds:1, workers:1}, restartReceipt = {operation:"simulation", controlId:"simulation-run", stateClass:"editable-submission", capturedJobId:"restart-job", transaction:{operation:"simulation", stateClass:"editable-submission", control:{stableControlId:"simulation-run"}, requestCount:1, request:{browserRequestId:"restart-request", method:"POST", path:"/api/project/simulations"}, pointerActivations:[{controlId:"simulation-run", capturedControlId:"simulation-run", captureKey:"restart-capture", preDispatchFocus:{controlId:"simulation-run", native:true}, hitTest:{capturedControlId:"simulation-run", matchesCapturedControl:true}, dispatch:{kind:"native-pointer", pressed:true, released:true, focus:{controlId:"simulation-run", native:true, targetMatchesCapturedControl:true}}}]}, terminal:{status:"recovery-required", jobId:"restart-job", operation:"simulation", request:restartRequest, resultSha256:sha(JSON.stringify(restartResult)), causedByRequestId:"restart-request"}, rendered:{resultControlId:"simulation-run", resultOperation:"simulation", resultStateClass:"editable-submission", resultReceipt:"durable-terminal", resultJobId:"restart-job", resultRequestId:"restart-job", resultTerminal:"recovery-required", resultRecovery:"restart-reconciled", resultExecutor:"unavailable-after-restart", renderedTerminal:true, postRestartReplacementState:{capturedControlId:"simulation-run", captureKey:"restart-capture", controlState:"replaced-after-restart", currentControlId:"simulation-run", capturedControlConnected:false}}, timing:{elapsedMs:1}, evidence:{screenshotEvidenceId:"restart-screenshot", cleanupEvidenceId:"restart-cleanup"}, ownedProcessDrain:{processTreeDrained:true, resourcesDrained:true, priorStudioShutdown:{shutdown:{kind:"abrupt-service-loss", gracefulShutdownReceived:false, requestedSignal:"SIGKILL", observedSignal:"SIGKILL"}, processStateBeforeLoss:{status:"running", updatedAt:1}, durableJob:{id:"restart-job", operation:"simulation", status:"running", terminal:false, request:restartRequest, causedByRequestId:"restart-request"}}}};
    restartReceipt.ownedProcessDrain.priorStudioShutdown.durableJobBeforeLoss = structuredClone(restartReceipt.ownedProcessDrain.priorStudioShutdown.durableJob);
    validateP805RestartRecoveryTerminalReceipt(restartReceipt);
    const rejectsRestartReceipt = (mutate) => {
        try { validateP805RestartRecoveryTerminalReceipt(mutate(structuredClone(restartReceipt))); return false; }
        catch (error) { return /restart recovery receipt|generic result|request\/job correlation|vanished executor|owned-process drainage/.test(String(error)); }
    };
    if (!rejectsRestartReceipt((receipt) => { receipt.capturedJobId = "uncorrelated-job"; }) || !rejectsRestartReceipt((receipt) => { delete receipt.ownedProcessDrain.priorStudioShutdown.durableJobBeforeLoss; }) || !rejectsRestartReceipt((receipt) => { receipt.ownedProcessDrain.priorStudioShutdown.durableJob.status = "cancelled"; }) || !rejectsRestartReceipt((receipt) => { receipt.rendered.resultJobId = "uncorrelated-job"; }) || !rejectsRestartReceipt((receipt) => { receipt.rendered.resultTerminal = "completed"; }) || !rejectsRestartReceipt((receipt) => { delete receipt.rendered; }) || !rejectsRestartReceipt((receipt) => { delete receipt.timing; }) || !rejectsRestartReceipt((receipt) => { delete receipt.evidence.screenshotEvidenceId; }) || !rejectsRestartReceipt((receipt) => { delete receipt.evidence.cleanupEvidenceId; }) || !rejectsRestartReceipt((receipt) => { delete receipt.ownedProcessDrain; })) {
        throw new Error("collector accepted an uncorrelated, generic, unrendered, unmeasured, or uncleared restart recovery terminal");
    }
    process.stdout.write(`${JSON.stringify({acceptedReceipts:ledger.acceptedReceipts.length, aggregatePublished:false, failureKind:ledger.attemptedChild.failureKind, cleanupKinds, retainedFailureKinds, rejectedReceiptSubstitutions, pointerSemanticSubstitutionRejected:true, stateClassSubstitutionRejected:true, runtimeSubstitutionRejected:true, retryTerminalSubstitutionRejected, retryTerminalJobSubstitutionRejected})}\n`);
} finally {
    await rm(output, {recursive:true, force:true});
}
