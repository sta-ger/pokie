import assert from "node:assert/strict";
import {createHash, randomBytes} from "node:crypto";
import {mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {execFileSync, spawn} from "node:child_process";
import os from "node:os";
import path from "node:path";
import {test} from "@jest/globals";
import {exerciseP805TupleSupervisor} from "./p805-tuple-supervisor-contract.mjs";
import {createP805OwnedProcessRecord, installP805PackedRuntime, p805CandidatePackageRoot} from "../../scripts/p8-05-valera-browser-audit.mjs";
import {projectP805RenderedTupleEvidence} from "../../scripts/p8-05-product-readiness-controller.mjs";
import {P805_PERSONAS, P805_REQUIRED_OBSERVATIONS} from "../../scripts/p8-05-product-readiness-campaign.mjs";
import {registerPc20OwnedResource} from "../../scripts/pc-20-release-completion.mjs";

test.each(["success", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "persistent-network", "integrity", "diagnostic-only", "signal", "spawn-failure", "timeout"])("packed installer closes %s without changing candidate or exceeding its retry boundary", async (mode) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "p805-install-boundary-"));
    const installationRoot = path.join(directory, "runtime"), archive = path.join(directory, "candidate.tgz"), children = [], invocations = [];
    const recoverable = ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN"].includes(mode);
    const archiveBytes = Buffer.from("immutable candidate archive");
    try {
        await mkdir(installationRoot);
        await writeFile(archive, archiveBytes);
        const services = {npm:process.execPath, npmArgs:[], mkdir, rm, spawn:(_command, args, options) => {
            invocations.push([...args]);
            const attempt = invocations.length;
            if (attempt === 2) assert.equal(children[0].exitCode, 1, "retry follows the failed installer's terminal exit");
            const failed = mode === "persistent-network" || mode === "integrity" || mode === "diagnostic-only" || recoverable && attempt === 1;
            const errorCode = mode === "integrity" ? "EINTEGRITY" : mode === "persistent-network" ? "ECONNRESET" : mode;
            const source = `
                const fs = require('node:fs');
                const root = ${JSON.stringify(installationRoot)};
                if (${attempt} === 2 && fs.existsSync(root + '/partial')) throw new Error('partial installation survived retry');
                fs.writeFileSync(root + '/partial', 'attempt');
                if (${JSON.stringify(mode)} === 'timeout') setInterval(() => {}, 1000);
                else if (${JSON.stringify(mode)} === 'signal') process.kill(process.pid, 'SIGTERM');
                else if (${failed}) { console.error(${JSON.stringify(mode === "diagnostic-only" ? "package diagnostic mentioned ECONNRESET" : `npm error code ${errorCode}`)}); process.exitCode = 1; }
                else { fs.renameSync(root + '/partial', root + '/installed'); console.log('installed exact candidate'); }
            `;
            const child = mode === "spawn-failure" ? spawn(path.join(directory, "missing-npm"), [], options) : spawn(process.execPath, ["-e", source, "--", ...args], options);
            children.push(child);
            return child;
        }};
        const run = () => installP805PackedRuntime(services, installationRoot, archive, {cwd:directory, stdio:"pipe"}, "packed install regression", mode === "timeout" ? 100 : 5_000);
        if (mode === "success" || recoverable) {
            const result = await run();
            assert.equal(result.exitCode, 0);
            assert.equal(result.attempts.length, recoverable ? 2 : 1);
            assert.deepEqual(result.attempts.map(({exitCode}) => exitCode), recoverable ? [1, 0] : [0]);
            assert.match(result.stdout, /installed exact candidate/);
            if (recoverable) assert.match(result.stderr, new RegExp(`npm error code ${mode}`));
            assert.equal(await readFile(path.join(installationRoot, "installed"), "utf8"), "attempt");
        } else {
            await assert.rejects(run(), mode === "spawn-failure" ? /ENOENT/ : mode === "timeout" ? /public-command budget/ : /packed install regression exited/);
        }
        assert.equal(invocations.length, recoverable || mode === "persistent-network" ? 2 : 1);
        for (const args of invocations) assert.deepEqual(args, ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--prefix", installationRoot, archive]);
        assert.deepEqual(await readFile(archive), archiveBytes, "transport recovery preserves the candidate archive");
        for (const child of children) assert.ok(child.exitCode !== null || child.signalCode !== null || child.pid === undefined, "every installer is terminal before the helper returns");
    } finally {
        await rm(directory, {recursive:true, force:true});
    }
});

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

test("the shared ownership preload authenticates worker process ownership without a tuple supervisor", async () => {
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
        const owner = records.find(({action, kind}) => action === "registry-ready" && kind === "registry");
        const ownerPid = Number(owner.resourceId.split(":")[1]);
        assert.ok(Number.isInteger(ownerPid) && ownerPid > 0);
        assert.equal(acquisitions[1].pid, ownerPid, "worker ownership names the process which loaded the hook");
        assert.match(acquisitions[1].processIdentity, /^linux-start-ticks:\d+$/);
        assert.match(acquisitions[1].resourceId, new RegExp(`^worker:\\d+:process:${ownerPid}$`));
        for (const {signature, ...record} of records) {
            assert.equal(record.operationId, operationId);
            assert.equal(signature, createHash("sha256").update(secret).update("\0").update(JSON.stringify(record)).digest("hex"));
        }
        for (const acquired of acquisitions) {
            const releases = records.filter((record) => record.action === "released" && record.resourceId === acquired.resourceId);
            assert.equal(releases.length, 1);
            const {signature, ...released} = releases[0];
            assert.deepEqual({...released, action:"acquired", signature:acquired.signature}, acquired);
        }
    } finally { await rm(directory, {recursive:true, force:true}); }
});

test("bounded gate descendant preserves both candidate readers, selectors and protected inputs", () => {
    // Native resolution is required by the installed-package selector. This is
    // synthetic handoff regression data, never a new acceptance collection.
    execFileSync(process.execPath, ["--input-type=module", "-e", `
        import assert from 'node:assert/strict';
        import {execFileSync} from 'node:child_process';
        import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
        import os from 'node:os';import path from 'node:path';
        import {authenticateP805ProductTree} from './scripts/p8-05-release-handoff.mjs';
        import {authenticateP911Tree,readP911CandidateFromEnvironment,readP911SmokeCandidateFromEnvironment,validateP911SmokeCandidateIdentity} from './scripts/p9-11-candidate.mjs';
        import {candidateFixture,commitP911ToolingDescendant,P911_TOOLING_DESCENDANT_PATHS} from './tests/testUtils/createP911CandidateFixture.mjs';
        const directory=await mkdtemp(path.join(os.tmpdir(),'v2c37-gate-handoff-'));
        try {
            const fixture=await candidateFixture(directory);
            const git=(...args)=>execFileSync('git',args,{cwd:fixture.repository,encoding:'utf8',stdio:'pipe'}).trim();
            const commit=()=>{git('add','.');git('-c','user.name=sta-ger','-c','user.email=pascaldelger@gmail.com','commit','--quiet','-m','bounded gate fixture');return git('rev-parse','HEAD');};
            const delta=[
                'tests/cli/studio-client/src/components/project/ProjectDashboardPage.replayWorkflow.test.tsx',
                'tests/scripts/p8-05-valera-devtools-events.test.mjs',
                'tests/scripts/p8-05-valera-ownership.test.mjs',
                'scripts/p8-05-release-handoff.mjs','scripts/p9-11-candidate.mjs',
                'tests/testUtils/createP911CandidateFixture.mjs',
            ];
            for(const file of delta){
                assert.ok(P911_TOOLING_DESCENDANT_PATHS.includes(file),file+' missing from independent regression fixture');
                await writeFile(path.join(fixture.repository,file),'// Bounded correction fixture.\\n');
            }
            const corrected=commit(),{candidateId,candidateTreeId}=fixture.handoff;
            assert.deepEqual(authenticateP805ProductTree(candidateId,corrected,fixture.repository).changedToolingAndEvidencePaths,delta.slice().sort());
            assert.deepEqual(authenticateP911Tree(candidateId,candidateTreeId,fixture.repository).changedEvidenceAndTooling,delta.slice().sort());
            const environment={POKIE_P911_CANDIDATE_HANDOFF:fixture.reference.path,POKIE_P911_CANDIDATE_HANDOFF_SHA256:fixture.reference.sha256};
            const read=()=>readP911CandidateFromEnvironment(environment,{repository:fixture.repository});
            const selected=await read(),smoke=await readP911SmokeCandidateFromEnvironment(environment,{repository:fixture.repository});
            assert.deepEqual(smoke,selected);
            assert.deepEqual(selected.archive,await readFile(fixture.handoff.archivePath));
            assert.equal(selected.equivalence.reviewedId,corrected);
            validateP911SmokeCandidateIdentity(smoke,{...environment,POKIE_PACK_SMOKE_CANDIDATE_ID:corrected,POKIE_PACK_SMOKE_CANDIDATE_PACKAGE_SHA256:selected.archiveSha256},{repository:fixture.repository});
            assert.throws(()=>validateP911SmokeCandidateIdentity(smoke,{POKIE_PACK_SMOKE_CANDIDATE_ID:candidateId},{repository:fixture.repository}),/reviewed candidate identity mismatch/);
            for(const file of ['src/index.ts','cli/pokie.ts','package-lock.json','tsconfig.prod.json','tests/scripts/unnamed.test.mjs']){
                await mkdir(path.dirname(path.join(fixture.repository,file)),{recursive:true});
                await writeFile(path.join(fixture.repository,file),'changed protected input');
                const changed=commit();
                assert.throws(()=>authenticateP805ProductTree(candidateId,changed,fixture.repository),/product or build inputs/);
                await assert.rejects(read(),/product\\/build inputs changed/);
                git('reset','--hard',corrected);
            }
            for(const reference of [fixture.handoff.buildReceipt,fixture.handoff.installReceipt,fixture.handoff.browserDriver]){
                const original=await readFile(reference.path);
                await writeFile(reference.path,'changed pinned bytes');
                await assert.rejects(read(),/receipt digest mismatch|authenticated controller browser driver/);
                await writeFile(reference.path,original);
            }
            const reviewed=await commitP911ToolingDescendant(fixture);
            const complete=await readP911SmokeCandidateFromEnvironment(environment,{repository:fixture.repository});
            assert.equal(complete.equivalence.reviewedId,reviewed);
            assert.deepEqual(complete.equivalence.changedEvidenceAndTooling,[...P911_TOOLING_DESCENDANT_PATHS].sort());
            assert.deepEqual(complete.archive,selected.archive);
        } finally {await rm(directory,{recursive:true,force:true});}
    `], {encoding:"utf8", stdio:"pipe", timeout:20_000});
});


test("controller projects every accepted tuple action instead of a persona aggregate or reused PID", () => {
    // This is the controller's projection contract, not packed browser proof.
    // Distinct requests/actions at all viewports must survive the five-persona
    // aggregation, including when sequential workers reuse a PID.
    const tuples = P805_PERSONAS.flatMap((persona) => P805_REQUIRED_OBSERVATIONS[persona].flatMap((observation) => ["wide", "compact", "narrow"].map((viewport) => ({persona, observation, viewport}))));
    const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
    const tupleAudits = tuples.map((tuple, index) => {
        const controlId = `control-${index}`, browserRequestId = `request-${index}`, resultSha256 = digest({terminal:index});
        const keyboard = tuple.viewport === "compact", kind = keyboard ? "keyboard" : "pointer";
        const activation = {count:1, kind, controlId, capturedControlId:controlId, captureKey:`capture-${index}`, preDispatchFocus:{controlId, native:true}, nativeFocus:true, hitTest:{capturedControlId:controlId, matchesCapturedControl:true}, dispatch:{kind:"native-pointer", pointerDownCount:1, pointerUpCount:1, clickCount:1, eventsTrusted:true, targetsMatchCapturedControl:true, pressed:true, released:true, focus:{observedAt:"pre-dispatch", atDispatchNative:true, controlId, native:true, trusted:true, targetMatchesCapturedControl:true}}};
        if (keyboard) activation.dispatch = {kind:"native-keyboard", key:"Enter", pressed:true, released:true, keyDownCount:1, keyUpCount:1, focus:{controlId, native:true, trusted:true, targetMatchesCapturedControl:true}};
        const action = {...tuple, stableControlId:controlId, interaction:{activation:kind}, transaction:{control:{stableControlId:controlId}, confirmation:{required:false, state:"not-required"}, pointerActivations:keyboard ? [] : [activation], keyboardActivations:keyboard ? [activation] : [], request:{browserRequestId, method:"GET", path:"/api/project/context", responseSha256:digest({response:index})}, postTransitionRenderedState:keyboard ? undefined : {capturedControlId:controlId, captureKey:activation.captureKey, controlState:"replaced", currentControlId:controlId, capturedControlConnected:false, requestId:browserRequestId, resultSha256, renderedTerminal:true}}, terminal:{status:"completed", resultSha256}, visibleTerminal:{state:"rendered", observedAfterRequestId:browserRequestId, resultSha256, lifecycle:{artifact:null}}, elapsedMs:index + 1, accessibility:{visibleFocus:true, namedRegions:["main"], unexplainedDisabledControls:0}, evidenceId:`action-${index}`, screenshotEvidenceId:`screenshot-${index}`};
        return {auditId:`audit-${index}`, persona:tuple.persona, tuple, worker:{pid:100}, rendered:{actions:[action]}, packageIdentity:{archiveGitHead:"1".repeat(40), candidateTreeObjectId:"2".repeat(40), candidateExecutableReceiptSha256:"3".repeat(64)}, cleanup:{evidenceId:`cleanup-${index}`}};
    });
    const ledger = {
        children:tupleAudits.map((audit, index) => ({tuple:audit.tuple, worker:audit.worker, auditSha256:digest({audit:index}), checkpointReceiptSha256s:[digest({checkpoint:index})], cleanupEvidenceId:audit.cleanup.evidenceId})),
        acceptedReceipts:tupleAudits.map((audit) => ({receipt:{auditId:audit.auditId, checkpointReceipt:{actionSha256:digest(audit.rendered.actions[0])}}})),
    };
    // A digest-bound action with a different label/id cannot repair its native
    // activation by having the projection overwrite the captured control id.
    const substitutedAudits = structuredClone(tupleAudits), substitutedLedger = structuredClone(ledger);
    substitutedAudits[0].rendered.actions[0].stableControlId = "substituted-action-control";
    substitutedLedger.acceptedReceipts[0].receipt.checkpointReceipt.actionSha256 = digest(substitutedAudits[0].rendered.actions[0]);
    assert.throws(() => projectP805RenderedTupleEvidence(substitutedLedger, substitutedAudits), /cannot project rendered evidence/);
    const original = JSON.stringify({ledger, tupleAudits});
    const projected = projectP805RenderedTupleEvidence(ledger, [...tupleAudits].reverse());
    assert.equal(projected.length, 75);
    assert.deepEqual(projected.map(({tuple}) => tuple), tuples);
    assert.deepEqual(projected.map(({activation}) => activation.kind), tuples.map(({viewport}) => viewport === "compact" ? "keyboard" : "pointer"));
    for (const [index, entry] of projected.entries()) {
        const audit = tupleAudits[index], action = audit.rendered.actions[0];
        assert.equal(entry.activation.controlId, action.stableControlId);
        const originalActivation = action.transaction.pointerActivations[0] ?? action.transaction.keyboardActivations[0];
        assert.equal(JSON.stringify(entry.activation), JSON.stringify(originalActivation));
        assert.notEqual(entry.activation, originalActivation);
        assert.equal(entry.actionSha256, ledger.acceptedReceipts[index].receipt.checkpointReceipt.actionSha256);
        assert.deepEqual(entry.request, action.transaction.request);
        assert.deepEqual(entry.terminal, action.terminal);
        assert.equal(entry.rendered.observedAfterRequestId, entry.request.browserRequestId);
        assert.equal(entry.rendered.resultSha256, entry.terminal.resultSha256);
        assert.equal(entry.evidence.actionEvidenceId, action.evidenceId);
        assert.equal(entry.evidence.screenshotEvidenceId, action.screenshotEvidenceId);
        assert.equal(entry.evidence.cleanupEvidenceId, audit.cleanup.evidenceId);
        if (entry.activation.kind === "pointer") {
            assert.deepEqual(entry.activation.dispatch, action.transaction.pointerActivations[0].dispatch);
            assert.deepEqual(entry.rendered.postTransitionRenderedState, action.transaction.postTransitionRenderedState);
        } else assert.deepEqual(entry.activation.dispatch, action.transaction.keyboardActivations[0].dispatch);
    }
    const aggregates = P805_PERSONAS.map((persona) => {
        const audits = tupleAudits.filter((audit) => audit.persona === persona);
        return {...audits[0], auditId:`aggregate-${persona}`, tuple:undefined, rendered:{actions:audits.flatMap((audit) => audit.rendered.actions)}};
    });
    assert.equal(aggregates.length, 5);
    assert.throws(() => projectP805RenderedTupleEvidence(ledger, aggregates), /one accepted immutable audit/);
    for (const mutate of [
        (audits) => { audits.splice(1, 1); },
        (audits) => { audits.push(structuredClone(audits[1])); },
        (audits) => { audits[1].auditId = audits[0].auditId; },
        (audits) => { audits[1].worker.nonce = "another-process-incarnation"; },
        (audits) => { audits[1].cleanup.evidenceId = "another-tuple-cleanup"; },
        (audits) => { audits[1].tuple.viewport = "wide"; },
        (audits) => { audits[1].rendered.actions[0] = audits[0].rendered.actions[0]; },
        (audits) => { audits[1].rendered.actions[0].transaction.request.browserRequestId = "unbound-request"; },
    ]) {
        const invalid = structuredClone(tupleAudits);
        mutate(invalid);
        assert.throws(() => projectP805RenderedTupleEvidence(ledger, invalid), /accepted immutable audit|substitute another rendered action/);
    }
    assert.equal(JSON.stringify({ledger, tupleAudits}), original, "projection preserves accepted receipts and cleanup evidence");
    projected[0].tuple.viewport = "compact";
    projected[0].request.browserRequestId = "mutated-by-consumer";
    projected[0].rendered.postTransitionRenderedState.captureKey = "mutated-by-consumer";
    projected[0].accessibility.namedRegions.push("mutated-by-consumer");
    assert.equal(JSON.stringify({ledger, tupleAudits}), original, "handoff consumers cannot mutate accepted tuple data through aliases");
});

for (const name of ["@fromstan/pokie", "pokie"]) {
    test(`P8-05 installed paths follow the authenticated ${name} manifest`, () => {
        const installation = path.join(os.tmpdir(), "owned-runtime");
        assert.equal(p805CandidatePackageRoot(installation, {name}), path.join(installation, "node_modules", name));
        assert.throws(() => p805CandidatePackageRoot(installation, {name: "../borrowed"}), /authenticated candidate package identity/);
    });
}
