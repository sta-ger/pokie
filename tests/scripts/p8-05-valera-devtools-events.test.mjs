import assert from "node:assert/strict";
import {execFileSync, spawn} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdir, mkdtemp, readFile, readdir, rm, writeFile} from "node:fs/promises";
import {createServer} from "node:http";
import {tmpdir} from "node:os";
import path from "node:path";
import {test} from "@jest/globals";
import {WebSocketServer} from "ws";
import {verifyP805CandidatePackage} from "../../scripts/p8-05-candidate-package-verifier.mjs";
import {P805_WORKFLOW_CONTRACTS, P805_SCREEN_CONTROL_STATES, hasP805SharedNavigationContext, p805TerminalResponseStatus, p805WorkflowActionLabel, validateP805LiveDomTransaction, validateP805RuntimeRecoveryEvidence} from "../../scripts/p8-05-product-readiness-campaign.mjs";
import {projectP805PersonaAudit} from "../../scripts/p8-05-persona-projection.mjs";
import {captureP805RestartRecoveryResponse, recordP805RenderedApiResponse} from "../../scripts/p8-05-valera-browser-audit.mjs";
import {navigateP805RenderedControl, openP805ImportedProject, validateP805ImportedProjectOpen, activateP805FocusedControl, activateP805KeyboardControl, setP805ReplayArtifactInput, validateP805ReplayArtifactInspection, clickP805CapturedControl, hasP805NativeActivation, connectP805Devtools, createP805RenderedGame, observeP805CreatorValidation, observeP805NavigationReadiness, observeP805PointerTerminal, pressP805Enter, validateP805BlueprintMutationResponse, validateP805RetryTerminalReceipt} from "../../scripts/p8-05-valera-browser-audit.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const nativeButtonStyles = await readFile(new URL("../../node_modules/@mantine/core/styles/global.css", import.meta.url), "utf8");


test("retained cancellation, Retry and interrupted restart sequence reaches campaign recovery validation", async () => {
    const captured = JSON.parse(await readFile(new URL("./fixtures/p805-retained-restart-recovery.json", import.meta.url), "utf8"));
    const {runtime, audit, api, browser} = captured;
    audit.rendered.jobs.retryWithoutPartialArtifacts.receipt.transaction = runtime.value.transactions.simulationRetry;
    audit.rendered.jobs.restartRecovery.receipt.transaction = runtime.value.transactions.restartSimulation;
    const restartReceipt = audit.rendered.jobs.restartRecovery.receipt;
    const restartApi = api.find((entry) => entry.initiator === "rendered-restart");
    const response = browser.find((event) => event.method === "Network.responseReceived" && event.params.requestId === restartApi.browserRequestId);
    // Run the production producer on the retained, real post-restart response.
    restartReceipt.recoveryResponse = captureP805RestartRecoveryResponse({event:response, payload:restartApi.payload}, runtime.value.restart.activeJobId);
    runtime.value.restart.receipt = {...restartReceipt, evidence:{screenshotEvidenceId:restartReceipt.evidence.screenshotEvidenceId}};
    const evidence = new Map(captured.screenshots.map((evidenceId) => [evidenceId, {item:{kind:"screenshot"}}]));
    assert.equal(runtime.value.transactions.restartSimulation.terminal, undefined, "the lost executor never returned a simulation poll terminal");
    assert.equal(runtime.value.restart.terminal.status, "recovery-required");
    assert.equal(runtime.value.jobs.cooperativeCancellation.status, "cancelled");
    assert.equal(runtime.value.jobs.retryWithoutPartialArtifacts.status, "completed");
    assert.doesNotThrow(() => validateP805RuntimeRecoveryEvidence(runtime, audit, api, browser, evidence, captured.origin.auditId));
    const before = JSON.stringify({runtime, audit, api, browser});
    for (const mutate of [
        value => {value.runtime.value.transactions.simulationRetry.pointerActivations[0].dispatch.clickCount = 2;},
        value => {value.runtime.value.transactions.cooperativeCancellation.confirmation.activation.dispatch.eventsTrusted = false;},
        value => {delete value.runtime.value.transactions.activeReloadStart.terminal;},
        value => {value.runtime.value.restart.terminal.status = "completed";},
        value => {value.runtime.value.restart.activeJobId = "foreign-job";},
        value => {value.audit.rendered.jobs.restartRecovery.receipt.terminal.causedByRequestId = "foreign-submission";},
        value => {value.audit.rendered.jobs.restartRecovery.receipt.ownedProcessDrain.priorStudioShutdown.durableJob.terminal = true;},
        value => {value.audit.rendered.jobs.restartRecovery.receipt.rendered.resultExecutor = "available";},
        value => {value.audit.rendered.jobs.restartRecovery.receipt.recoveryResponse.browserRequestId = "foreign-list";},
        value => {value.api.find(entry => entry.initiator === "rendered-restart").payload = [];},
        value => {value.browser.find(event => event.method === "Network.responseReceived" && event.params.requestId === restartApi.browserRequestId).params.response.status = 500;},
        value => {value.runtime.value.outcomes.reports.push({id:value.runtime.value.outcomes.cancelledSimulationId});},
        value => {value.runtime.value.transactions.restartSimulation.viewport.width = 390;},
        value => {value.runtime.value.replayArtifacts.recovered.transaction.formState.fields.find(field => field.stableControlId === "replay-artifact-json").value = "{}";},
        value => {value.runtime.value.projectSwitchReceipt.cancelledProjectOpen.projectOpenRequestCount = 1;},
    ]) {
        const invalid = JSON.parse(before);
        mutate(invalid);
        assert.throws(() => validateP805RuntimeRecoveryEvidence(invalid.runtime, invalid.audit, invalid.api, invalid.browser, evidence, "substitution"));
    }
    const children = ["mathematician", "ui-ux"].map((persona) => ({...audit, persona, timings:{restartRecoveryMs:restartReceipt.timing.elapsedMs}, performance:{restartRecoveryMs:{budgetMs:120000}}, observations:[audit.tuple.observation], evidence:[], observationEvidence:{}, checkpointReceipts:[], startedAt:"2026-10-03T21:10:00.000Z", endedAt:"2026-10-03T21:12:00.000Z", cleanup:{evidenceId:"retained-cleanup"}, rendered:{...audit.rendered, responsive:[], actions:[], defects:[], measurements:{}}}));
    for (const child of children) {
        const projection = projectP805PersonaAudit([child], [{auditSha256:hash(JSON.stringify(child))}], "initial", child.persona);
        assert.equal(JSON.stringify(projection.rendered.jobs), JSON.stringify(child.rendered.jobs));
        // Both aggregation and prospective closeout recurse into this same
        // child-evidence consumer; they must keep the recovered list terminal.
        assert.doesNotThrow(() => validateP805RuntimeRecoveryEvidence(runtime, {...child, rendered:projection.rendered}, api, browser, evidence, child.persona));
    }
    assert.equal(JSON.stringify({runtime, audit, api, browser}), before, "validation never rewrites accepted native receipts");

});

test("retained blueprint native receipt survives resource-response collection, persona projection and strict campaign consumption", () => {
    // Bounded extract of the saved d2e0a946 blueprint transaction: Chromium's
    // original coordinates, request identity, status and three native events.
    // This is regression data, not a new persona or whole-campaign receipt.
    const controlId = "project-tab:overview", captureKey = "7c33f226e55b0675c35c72f874b303fe", requestId = "114021.57";
    const region = {left:16, top:76, width:227, height:40.796875};
    const visualViewport = {offsetLeft:0, offsetTop:0, width:1425, height:900, scale:1};
    const pointer = {kind:"pointer", count:1, controlId, capturedControlId:controlId, captureKey, x:129.5, y:96.3984375,
        dispatchPoint:{x:129.5, y:96.3984375}, preDispatchFocus:{controlId, native:true},
        hitTest:{capturedControlId:controlId, x:129.5, y:96.3984375, visualViewport, region, matchesCapturedControl:true},
        dispatch:{kind:"native-pointer", pressed:true, released:true, bindingVersion:2, pointerDownCount:1, pointerUpCount:1, clickCount:1, eventsTrusted:true, targetsMatchCapturedControl:true,
            focus:{observedAt:"pre-dispatch", atDispatchNative:true, controlId, native:true, trusted:true, targetMatchesCapturedControl:true},
            eventBindings:["pointerdown", "pointerup", "click"].map((eventType, index) => ({eventType, trusted:true, capturedControlId:controlId, captureKey,
                x:index === 2 ? 129 : 129.5, y:index === 2 ? 96 : 96.3984375, visualViewport, viewportMatchesMeasured:true,
                directTargetMatchesCapturedControl:true, pathContainsCapturedControl:true, dispatchRegionAncestor:false,
                pointMatchesMeasured:true, regionMatchesMeasured:true, regionMatchesCapturedPress:false, region,
                hitMatchesCapturedControl:true, capturedControlConnected:true, identityPreserved:true, enabled:true, relationship:"captured-control"}))}};
    const result = {status:"loaded", projectRoot:"/fixture/starter-slot/blueprint.json", game:{id:"starter-slot", name:"Starter Slot", version:"0.1.0"}, type:"blueprint", capabilities:["blueprint.build"], origin:"managed"};
    const resultSha256 = hash(JSON.stringify(result)), contract = P805_WORKFLOW_CONTRACTS.mathematician.blueprint;
    const interaction = {control:"Overview", matchedLabel:"Overview", stableControlId:controlId, identityAttribute:"id", accessibleName:"Overview", enabled:true, disabled:false, disabledExplanation:null,
        transactionState:"navigation", lifecycle:{kind:"navigation", value:"overview"}, activation:"pointer", pointerActivated:true};
    const request = {browserRequestId:requestId, method:"GET", path:contract.api, status:200, bodyKind:null, bodySha256:hash(""), responseSha256:resultSha256, initiator:"rendered-control"};
    const page = {kind:"p8-05-live-dom-transaction", operation:"blueprint", expectedOutcome:contract.terminal, route:"#/project/fixture/overview", viewport:"wide", elapsedMs:456,
        screen:{name:"overview", ...P805_SCREEN_CONTROL_STATES.overview, terminalText:"Overview"},
        control:{id:controlId, role:"button", accessibleName:"Overview", enabled:true}, precondition:{...interaction, region:"project-dashboard-heading"}, interaction, request,
        contextRevalidation:{browserRequestId:requestId, method:"GET", path:contract.api, status:200, responseSha256:resultSha256, projectStatus:"loaded", completedBeforeSelection:true},
        transaction:{operation:"overview", stateClass:"navigation", control:interaction, confirmation:{required:false, state:"not-required", control:null}, pointerActivations:[pointer], keyboardActivations:[], request,
            postTransitionRenderedState:{capturedControlId:controlId, captureKey, controlState:"retained", currentControlId:controlId, capturedControlConnected:true, requestId, resultSha256, renderedTerminal:true}},
        terminal:{status:"success", result, resultSha256, source:"response", complete:true},
        renderedTerminal:{state:"rendered", changedAfterRequest:true, observedAfterRequestId:requestId, resultSha256, beforeTextSha256:hash("Play ready"), textSha256:hash("Overview ready"), text:"Overview ready", observedAt:"2026-10-03T17:57:14.956Z", lifecycle:{role:"status", terminal:"rendered", text:"Overview ready", controlId, stateClass:"navigation"}},
        workflow:{persona:"mathematician", source:"rendered-control", transactionState:"navigation", expectedApi:contract.api, expectedMethod:"GET", expectedBodyKind:null, expectedArtifact:null, terminal:contract.terminal},
        state:{text:"Overview ready", controls:[], overflow:false, accessibility:{visibleFocus:true, namedRegions:["project-dashboard-heading"], unexplainedDisabledControls:0}}};
    const before = JSON.stringify(page), context = {...page.contextRevalidation, observation:"blueprint", payload:result, initiator:"rendered-navigation-context"};
    const api = [context], response = {...request, observation:"blueprint", payload:result};
    recordP805RenderedApiResponse(api, response);
    assert.equal(api.length, 1, "one Chromium request cannot become two API records");
    assert.deepEqual(api[0], {...context, ...response});
    assert.equal(hasP805SharedNavigationContext(page), true);
    assert.equal(hasP805NativeActivation(pointer, controlId), true);
    assert.deepEqual(validateP805LiveDomTransaction(Buffer.from(before), "blueprint", "mathematician", "retained blueprint"), page);
    assert.equal(JSON.stringify(page), before);
    // All context consumers use the same resource contract, across personas.
    for (const [persona, contracts] of Object.entries(P805_WORKFLOW_CONTRACTS)) for (const [observation, next] of Object.entries(contracts)) {
        if (next.api !== contract.api) continue;
        const captured = structuredClone(page);
        captured.operation = observation; captured.expectedOutcome = next.terminal; captured.route = `#/project/fixture/${next.route}`;
        captured.screen = {name:next.route, ...P805_SCREEN_CONTROL_STATES[next.route], terminalText:P805_SCREEN_CONTROL_STATES[next.route].result};
        captured.workflow.persona = persona; captured.workflow.terminal = next.terminal;
        if (next.route !== "overview") {
            const id = P805_SCREEN_CONTROL_STATES[next.route].navigationControlId, name = next.control;
            captured.control.id = id; captured.control.accessibleName = name;
            captured.precondition.accessibleName = name;
            for (const control of [captured.interaction, captured.transaction.control]) Object.assign(control, {control:name, matchedLabel:name, accessibleName:name, stableControlId:id, lifecycle:{kind:"navigation",value:next.route}});
            const activation = captured.transaction.pointerActivations[0];
            activation.controlId = id; activation.capturedControlId = id; activation.preDispatchFocus.controlId = id;
            activation.hitTest.capturedControlId = id; activation.dispatch.focus.controlId = id;
            activation.dispatch.eventBindings.forEach(event=>{event.capturedControlId=id;});
            Object.assign(captured.transaction.postTransitionRenderedState,{capturedControlId:id,currentControlId:id});
            captured.renderedTerminal.lifecycle.controlId = id;
        }
        assert.doesNotThrow(() => validateP805LiveDomTransaction(Buffer.from(JSON.stringify(captured)), observation, persona, `${persona}/${observation}`));
    }
    const child = {timings:{validationMs:page.elapsedMs}, performance:{validationMs:{budgetMs:60000}}, observations:["blueprint"], evidence:[], observationEvidence:{}, checkpointReceipts:[{sha256:hash(before)}],
        startedAt:"2026-10-03T17:57:14.000Z", endedAt:page.renderedTerminal.observedAt, cleanup:{evidenceId:"bounded-cleanup"}, tuple:{viewport:"wide"},
        rendered:{responsive:[], measurements:{consoleExceptions:0,unhandledRequestFailures:0,documentOverflow:false,inaccessiblePrimaryActions:0,unexplainedDisabledControls:0,namedRegions:1,visibleFocus:true}, defects:[], actions:[page], recovery:{},jobs:{}}};
    const projection = projectP805PersonaAudit([child], [{auditSha256:hash(JSON.stringify(child))}], "initial", "mathematician");
    assert.equal(JSON.stringify(projection.rendered.actions[0]), before);
    assert.equal(projection.timings.validationMs, 456);
    for (const mutate of [
        value => {value.contextRevalidation.responseSha256 = hash("foreign-context");},
        value => {value.transaction.stateClass = "editable-submission";},
        value => {value.transaction.pointerActivations[0].dispatch.clickCount = 2;},
        value => {value.transaction.pointerActivations[0].dispatch.eventBindings[1].pathContainsCapturedControl = false;},
        value => {value.terminal.result.status = "loading"; value.terminal.resultSha256 = hash(JSON.stringify(value.terminal.result));},
    ]) {const invalid = structuredClone(page); mutate(invalid); assert.throws(() => validateP805LiveDomTransaction(Buffer.from(JSON.stringify(invalid)), "blueprint", "mathematician", "substitution"));}
    for (const mutate of [value=>{value.status=201;},value=>{value.responseSha256=hash("foreign-response");},value=>{value.observation="another-tuple";},value=>{value.payload={status:"empty"};}]) {
        const invalid=structuredClone(response);mutate(invalid);assert.throws(()=>recordP805RenderedApiResponse([context],invalid),/substitutes a captured browser request identity/);
    }
    assert.throws(() => recordP805RenderedApiResponse(api, response), /substitutes a captured browser request identity/, "a second operation cannot reuse the accepted identity");
});

test("later model, reports, sampled Outcome Library and UI/UX simulation consume their actual public response contracts", () => {
    const contracts = P805_WORKFLOW_CONTRACTS.mathematician;
    assert.equal(p805TerminalResponseStatus(contracts["reels-paytable-modes-mechanics"], {basics:{status:"available"},layout:{status:"available"}}), "success");
    assert.equal(p805TerminalResponseStatus(contracts["reels-paytable-modes-mechanics"], {}), undefined);
    assert.equal(p805TerminalResponseStatus(contracts["simulation-rtp-volatility-features"], [{id:"report-1",status:"completed"}]), "success");
    for (const result of [[], [{id:"running",status:"running"}], {status:"unsupported"}]) assert.equal(p805TerminalResponseStatus(contracts["simulation-rtp-volatility-features"], result), undefined);
    const library = contracts["outcome-library-report-diff-replay"];
    for (const generation of ["default", "sampled", "bounded"]) {
        const body = JSON.stringify({mode:"base", generation}), transaction = {request:{body, bodySha256:hash(body)}};
        const result = {status:"completed",result:{mode:{modeName:"base"},generator:{strategy:generation === "default" ? "exact" : "bounded-coverage"}}};
        assert.equal(p805WorkflowActionLabel(library, transaction, result), `Generate ${generation === "default" ? "exact" : generation} outcome library (base)`);
        assert.equal(p805WorkflowActionLabel(library, transaction, {...result,result:{...result.result,mode:{modeName:"foreign-mode"}}}), undefined);
        assert.equal(p805WorkflowActionLabel(library, {request:{...transaction.request,bodySha256:hash("foreign-body")}}, result), undefined);
        const substituted = {transaction, request:{bodySha256:hash("another-browser-request")}, terminal:{status:"completed",result}};
        assert.throws(() => validateP805LiveDomTransaction(Buffer.from(JSON.stringify(substituted)), "outcome-library-report-diff-replay", "mathematician", "body substitution"), /submitted-body diagnostic differs from its browser request/);
    }
    const recovery = P805_WORKFLOW_CONTRACTS["ui-ux"]["reload-reconnect-recovery-cancellation-project-switch"];
    assert.equal(recovery.poll, "/api/project/simulations/{id}");
    for (const result of [{status:"queued"},{status:"running"},{status:"cancelled"},{status:"failed"},{status:"recovery-required"},{status:"completed",error:"cleanup failed"},{status:"completed",ok:false}]) assert.equal(p805TerminalResponseStatus(recovery,result), undefined);
    assert.equal(p805TerminalResponseStatus(recovery,{status:"completed"}), "completed");
    for (const contract of Object.values(P805_WORKFLOW_CONTRACTS).flatMap(Object.values)) {
        if (contract.api === "/api/project/simulations") assert.equal(contract.poll, "/api/project/simulations/{id}");
        for (const result of [{status:"queued"},{status:"loading"},{status:"unsupported"},{status:"failed"},{status:"success",error:"cleanup failed"}]) assert.equal(p805TerminalResponseStatus(contract,result), undefined);
    }
});

test("Replay Artifact inspection binds valid, invalid and recovered receipts to the exact pasted descriptor", () => {
    for (const [descriptor, expectedStatus, payload] of [
        [{round:1, seed:null}, 200, {round:1, artifactWarnings:[]}],
        [{round:1, seed:"recorded-seed"}, 200, {round:1, seed:"recorded-seed", artifactWarnings:[]}],
        [{round:0, seed:"invalid-artifact"}, 400, {error:'"round" must be a positive integer.'}],
        [{round:1, seed:null}, 200, {round:1, artifactWarnings:[]}],
    ]) {
        const text = JSON.stringify(descriptor);
        const receipt = {response:{status:expectedStatus}, payload, entry:{bodySha256:hash(text)}, transaction:{formState:{fields:[{stableControlId:"replay-artifact-json", value:text}]}}};
        assert.doesNotThrow(() => validateP805ReplayArtifactInspection("artifact", descriptor, expectedStatus, receipt));
        const staleField = structuredClone(receipt);
        staleField.transaction.formState.fields[0].value = '{}';
        assert.throws(() => validateP805ReplayArtifactInspection("artifact", descriptor, expectedStatus, staleField), /did not submit the actual pasted/);
        const staleRequest = structuredClone(receipt);
        staleRequest.entry.bodySha256 = hash('{}');
        assert.throws(() => validateP805ReplayArtifactInspection("artifact", descriptor, expectedStatus, staleRequest), /did not submit the actual pasted/);
        const rejected = structuredClone(receipt);
        rejected.response.status = 500;
        rejected.payload = {error:"inspection failed"};
        assert.throws(() => validateP805ReplayArtifactInspection("artifact", descriptor, expectedStatus, rejected), /HTTP 500, inspection failed/);
        if (expectedStatus === 200) {
            for (const changed of [{...payload, round:2}, {...payload, seed:"other-seed"}]) {
                assert.throws(() => validateP805ReplayArtifactInspection("artifact", descriptor, expectedStatus, {...receipt, payload:changed}), /differs from the pasted/);
            }
        }
    }
});

test.each(["npm wrapper", "direct Jest"])("candidate verification isolates %s context and retains canonical archive bytes", async (launcher) => {
    // This bounded fixture exercises the verifier's real build/receipt path;
    // it does not launch the controller-owned full package or release gates.
    const repository = await mkdtemp(path.join(process.cwd(), ".p8-05-canonical-context-test-"));
    const git = (...args) => execFileSync("git", args, {cwd:repository, encoding:"utf8"});
    const callerContext = {NODE_ENV:"test", INIT_CWD:repository, PWD:repository, npm_lifecycle_event:"test:targeted", npm_lifecycle_script:"caller test script", npm_lifecycle_caller:"caller-only lifecycle field", npm_package_json:path.join(repository, "caller-package.json"), npm_package_name:"caller-package", npm_package_version:"0.0.0", npm_package_scripts_build:"caller build script", npm_package_config_output:"caller output"};
    const environmentKeys = new Set([...Object.keys(process.env).filter((name) => name.startsWith("npm_package_") || name.startsWith("npm_lifecycle_")), ...Object.keys(callerContext)]);
    const savedEnvironment = new Map([...environmentKeys].map((name) => [name, process.env[name]]));
    try {
        const declaration = {name:"pokie", version:"1.3.0", type:"module", scripts:{prebuild:"node -e \"throw new Error('unrelated prebuild gate must not run')\"", build:"node build.cjs"}};
        const executable = "export const candidate = 805;\n";
        await writeFile(path.join(repository, "package.json"), JSON.stringify(declaration));
        await writeFile(path.join(repository, "package-lock.json"), "{}\n");
        await writeFile(path.join(repository, "source.js"), executable);
        await writeFile(path.join(repository, "build.cjs"), `
            const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
            assert.equal(process.env.NODE_ENV, 'production');
            assert.equal(process.env.npm_lifecycle_event, 'build');
            assert.equal(process.env.npm_lifecycle_script, 'node build.cjs');
            assert.equal(process.env.npm_package_json, path.join(process.cwd(), 'package.json'));
            assert.equal(process.env.npm_package_name, 'pokie');
            assert.equal(process.env.npm_package_version, '1.3.0');
            assert.deepEqual(Object.keys(process.env).filter((name) => name.startsWith('npm_package_') || name.startsWith('npm_lifecycle_')).sort(), ['npm_lifecycle_event', 'npm_lifecycle_script', 'npm_package_json', 'npm_package_name', 'npm_package_version']);
            assert.equal(process.env.INIT_CWD, process.cwd());
            assert.equal(process.env.PWD, process.cwd());
            fs.mkdirSync('dist');
            fs.copyFileSync(path.join(path.dirname(process.env.npm_package_json), 'source.js'), 'dist/index.js');
        `);
        git("init", "--quiet");
        git("add", "package.json", "package-lock.json", "source.js", "build.cjs");
        git("-c", "user.name=sta-ger", "-c", "user.email=pascaldelger@gmail.com", "commit", "--quiet", "-m", "[P8-05] canonical build context fixture");
        const candidateId = git("rev-parse", "HEAD").trim();
        await mkdir(path.join(repository, "node_modules"));
        await mkdir(path.join(repository, "package", "dist"), {recursive:true});
        await writeFile(path.join(repository, "package", "package.json"), JSON.stringify(declaration));
        await writeFile(path.join(repository, "package", "dist", "index.js"), executable);
        const sourceArchive = path.join(repository, "canonical.tgz"), candidateArchive = path.join(repository, "handoff.tgz"), receipt = path.join(repository, "receipt.json");
        const pack = () => execFileSync("tar", ["-czf", sourceArchive, "-C", repository, "package"]);
        pack();
        const canonicalBytes = await readFile(sourceArchive);
        // Exercise both supported launchers regardless of how this test itself
        // was launched. Caller context is fixture data, not npm-only authority.
        for (const name of environmentKeys) delete process.env[name];
        if (launcher === "npm wrapper") Object.assign(process.env, callerContext);
        else process.env.NODE_ENV = "test";
        const inheritedContext = [...environmentKeys].map((name) => [name, process.env[name]]);
        const verified = await verifyP805CandidatePackage({sourceArchive, candidateArchive, receipt, candidateId, repositoryRoot:repository});
        assert.deepEqual([...environmentKeys].map((name) => [name, process.env[name]]), inheritedContext, "verification must not mutate its caller's environment");
        assert.deepEqual(await readFile(sourceArchive), canonicalBytes);
        assert.deepEqual(await readFile(candidateArchive), canonicalBytes);
        assert.equal(verified.candidateId, candidateId);
        assert.equal(verified.candidatePackageSha256, hash(canonicalBytes));
        assert.deepEqual(verified.verifiedBuild.environment, {NODE_ENV:"production"});
        assert.deepEqual(verified.verifiedBuild.lifecycle, {event:"build", packageName:"pokie", packageVersion:"1.3.0"});
        assert.equal(verified.authentication.attestedBuildSha256, hash(JSON.stringify(verified.verifiedBuild)));
        assert.deepEqual(JSON.parse(await readFile(receipt, "utf8")), verified);
        assert.equal((await readdir(repository)).some((entry) => entry.startsWith(".p8-05-candidate-build-")), false);

        await writeFile(path.join(repository, "package", "dist", "index.js"), "export const candidate = 804;\n");
        pack();
        const staleArchive = await readFile(sourceArchive);
        const rejectedReceipt = path.join(repository, "rejected-receipt.json"), rejectedArchive = path.join(repository, "rejected-handoff.tgz");
        await assert.rejects(verifyP805CandidatePackage({sourceArchive, candidateArchive:rejectedArchive, receipt:rejectedReceipt, candidateId, repositoryRoot:repository}), /changed.*dist\/index.js/);
        assert.deepEqual(await readFile(sourceArchive), staleArchive);
        await assert.rejects(readFile(rejectedReceipt), {code:"ENOENT"});
        await assert.rejects(readFile(rejectedArchive), {code:"ENOENT"});
        assert.deepEqual(await readFile(candidateArchive), canonicalBytes, "a rejected archive must preserve the prior handoff");
        assert.equal((await readdir(repository)).some((entry) => entry.startsWith(".p8-05-candidate-build-")), false);
        assert.deepEqual([...environmentKeys].map((name) => [name, process.env[name]]), inheritedContext);
    } finally {
        for (const [name, value] of savedEnvironment) {
            if (value === undefined) delete process.env[name];
            else process.env[name] = value;
        }
        await rm(repository, {recursive:true, force:true});
    }
});

test("saved simulation-cancel boundary accepts only authenticated delivery reflow without rewriting its measured rectangle", () => {
    // Exact numeric boundary retained by candidate ee4690d3 after nine accepted
    // tuples. The press includes Mantine's 1px feedback atop a 16.796875px reflow.
    const controlId = "simulation-cancel", captureKey = "67d77ce6136e376211ce2a956b4c8cea";
    const region = {left:276, top:704.890625, width:90.28125, height:36};
    const visualViewport = {offsetLeft:0, offsetTop:0, width:1425, height:900, scale:1};
    const hitTest = {capturedControlId:controlId, x:321.140625, y:722.890625, region, visualViewport, pressFeedback:{kind:"mantine-active-translation", translateY:1}, matchesCapturedControl:true};
    const eventBindings = ["pointerdown", "pointerup", "click"].map((eventType, index) => ({
        eventType, trusted:true, capturedControlId:controlId, captureKey,
        x:index === 2 ? 321 : hitTest.x, y:index === 2 ? 722 : hitTest.y,
        visualViewport, viewportMatchesMeasured:true, directTargetMatchesCapturedControl:true,
        pathContainsCapturedControl:true, dispatchRegionAncestor:false, pointMatchesMeasured:true,
        regionMatchesMeasured:false, regionMatchesCapturedPress:false,
        region:{...region, top:index === 0 ? 722.6875 : 721.6875},
        pressFeedback:{active:index === 0, classRetained:true, inlineTransformUnchanged:true, is2D:true, matrix:[1,0,0,1,0,index === 0 ? 1 : 0]},
        hitMatchesCapturedControl:true, capturedControlConnected:true, identityPreserved:true, enabled:true, relationship:"unbound",
    }));
    const activation = {kind:"pointer", count:1, controlId, capturedControlId:controlId, captureKey,
        x:hitTest.x, y:hitTest.y, dispatchPoint:{x:hitTest.x, y:hitTest.y}, preDispatchFocus:{controlId, native:true}, hitTest,
        dispatch:{kind:"native-pointer", pressed:true, released:true, bindingVersion:2, eventBindings,
            pointerDownCount:1, pointerUpCount:1, clickCount:1, eventsTrusted:true, targetsMatchCapturedControl:false,
            focus:{observedAt:"pre-dispatch", atDispatchNative:true, controlId, native:true, trusted:true, targetMatchesCapturedControl:false}}};
    const preserved = JSON.stringify(activation);
    assert.equal(hasP805NativeActivation(activation, controlId), false, "the retained unbound finding must reproduce its rejection");
    const repaired = structuredClone(activation);
    for (const event of repaired.dispatch.eventBindings) {
        event.reflow = {kind:"same-node-delivery-reflow", measuredRegion:structuredClone(region), deliveredRegion:structuredClone(event.region)};
        event.relationship = "captured-control";
    }
    repaired.dispatch.targetsMatchCapturedControl = true;
    repaired.dispatch.focus.targetMatchesCapturedControl = true;
    assert.equal(hasP805NativeActivation(repaired, controlId), true);
    assert.equal(JSON.stringify(activation), preserved, "the original retained finding remains immutable");
    assert.equal(JSON.stringify(repaired.hitTest), JSON.stringify(hitTest), "delivery diagnostics must not alter the measured receipt");
    const geometryOnly = structuredClone(repaired);
    geometryOnly.dispatch.eventBindings[0].pathContainsCapturedControl = false;
    geometryOnly.dispatch.eventBindings[0].dispatchRegionAncestor = true;
    geometryOnly.dispatch.eventBindings[0].relationship = "captured-dispatch-region";
    assert.equal(hasP805NativeActivation(geometryOnly, controlId), false);
});

const poll = async (predicate, timeoutMs = 10_000, diagnostic = () => "focused DevTools boundary timed out") => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const result = await predicate();
        if (result) return result;
        assert.ok(Date.now() < deadline, diagnostic());
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
};

function launchFocusedBrowser(profile) {
    const browser = spawn(process.env.P805_CHROMIUM_BINARY ?? "chromium-browser", ["--headless=new", "--no-sandbox", "--no-first-run", "--disable-background-networking", "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], {stdio:["ignore", "ignore", "pipe"]});
    let terminal;
    let stderr = "";
    browser.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-4096); });
    // Observe early exit/spawn failure immediately and leave one settled
    // promise for the fixture's finally block to await on every path.
    const exited = new Promise((resolve) => {
        browser.once("error", (error) => { terminal = {error:error.message}; resolve(terminal); });
        browser.once("exit", (code, signal) => { terminal = {code, signal}; resolve(terminal); });
    });
    // A fresh Chromium profile starts under the controller's concurrent
    // changed-test load. Give only process startup its own bounded budget;
    // request completion, rendered readiness and native actions retain 10s.
    const waitForPort = () => poll(async () => {
        assert.equal(terminal, undefined, `focused Chromium stopped before DevTools startup: ${JSON.stringify(terminal)}\n${stderr}`);
        try {
            const port = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0];
            return /^\d+$/.test(port) && Number(port) > 0 && Number(port) <= 65535 ? port : false;
        } catch (error) {
            if (error.code !== "ENOENT") throw error;
            return false;
        }
    }, 30_000, () => `focused Chromium DevTools startup timed out\n${stderr}`);
    return {browser, exited, waitForPort};
}

async function runProductionDrawerRecovery() {
    const {createServer:createViteServer}=await import("vite");
    const profile = await mkdtemp(path.join(tmpdir(), "p805-devtools-drawer-recovery-"));
    const fixtureId = "/p805-drawer-recovery.js";
    const source = `
        import React, {useState} from 'react';
        import {createRoot} from 'react-dom/client';
        import {MantineProvider} from '@mantine/core';
        import '@mantine/core/styles.css';
        import '/cli/studio-client/src/global.css';
        import {AppShellLayout} from '/cli/studio-client/src/components/layout/AppShellLayout.tsx';
        import {NavTabs} from '/cli/studio-client/src/components/layout/NavTabs.tsx';
        import {ReplayTab} from '/cli/studio-client/src/components/project/ReplayTab.tsx';
        import {HomePage} from '/cli/studio-client/src/components/home/HomePage.tsx';
        import {StudioApiProvider} from '/cli/studio-client/src/context/StudioApiProvider.tsx';
        import {ModalsProvider} from '@mantine/modals';
        import {createHashRouter,RouterProvider} from 'react-router-dom';
        const h=React.createElement;
        const noop=()=>{};
        window.fixtureRequests=[];
        const fetchImpl=async(url)=>{window.fixtureRequests.push(url);return new Response(JSON.stringify(
            url.startsWith('/api/home/projects/registry')?[{location:'/games/source',name:'Source game',type:'tsPackage',capabilities:[],origin:'managed',lastOpenedAt:'2026-01-01T00:00:00.000Z',status:'ok'}]:
            url.startsWith('/api/home/jobs')?{jobs:[]}:
            url==='/api/home/blueprints/validate'?{status:'ok',warnings:[]}:
            {status:'unavailable',reason:'Focused drawer fixture'}
        ),{headers:{'Content-Type':'application/json'}});};
        function HomeReturn(){
            const [router]=useState(()=>createHashRouter([{path:'/home/:tab',element:h(HomePage)}]));
            return h(StudioApiProvider,{fetchImpl},h(ModalsProvider,null,h(RouterProvider,{router})));
        }
        function Fixture(){
            const [route,setRoute]=useState('simulation'),[expected,setExpected]=useState({status:'empty'}),[home,setHome]=useState(false);
            if(home)return h(MantineProvider,null,h(HomeReturn));
            const items=['overview','gameModel','play','simulation','replay','exportDeploy','certification','provablyFair'].map(value=>({value,label:value,auditControlId:'project-tab:'+value}));
            return h(MantineProvider,null,h(AppShellLayout,{breadcrumbs:[{label:'Your projects',id:'close-project',onClick:()=>{location.hash='#/home/projects';setHome(true);}}],navbar:h(NavTabs,{items,active:route,onSelect:value=>{location.hash='#/project/source/'+value;setRoute(value);}})},
                h('section',{className:'studio-page','data-pokie-lifecycle-result':'navigation','data-pokie-lifecycle-route':route,'data-pokie-lifecycle-result-control':'project-tab:'+route,'data-pokie-lifecycle-terminal':'rendered'},
                    route==='replay'?h(ReplayTab,{listView:{status:'empty'},recentSpins:{status:'empty'},recentRuns:{status:'empty'},expected,
                        onLoadExpectedFromPaste:raw=>{const value=JSON.parse(raw);setExpected(value.round>0?{status:'loaded',...value,artifactWarnings:[]}:{status:'error',message:'Round must be positive'});},
                        onRun:noop,onCancel:noop,onRetry:noop,onRefreshList:noop,onInspectStored:async()=>{},onCompareStored:noop,onClearExpected:()=>setExpected({status:'empty'}),onRefreshRecentSpins:noop,onRefreshRecentRuns:noop
                    }):h('p',null,'Simulation terminal result'))));
        }
        location.hash='#/project/source/simulation';
        window.activations=[];
        document.addEventListener('click',event=>{const control=event.target.closest('button');if(control)window.activations.push({id:control.id,trusted:event.isTrusted});},true);
        createRoot(document.getElementById('root')).render(h(Fixture));
    `;
    const server = await createViteServer({configFile:false, root:process.cwd(), cacheDir:path.join(profile,"vite"),
        server:{host:"127.0.0.1",port:0}, plugins:[{name:"p805-drawer-fixture",resolveId:id=>id===fixtureId?id:undefined,load:id=>id===fixtureId?source:undefined,
            configureServer(vite){vite.middlewares.use((request,response,next)=>{
                if(request.url!=="/drawer-recovery")return next();
                response.setHeader("Content-Type","text/html");
                response.end(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module" src="${fixtureId}"></script>`);
            });}
        }]});
    let browser, exited, cdp;
    try {
        await server.listen();
        const launched=launchFocusedBrowser(profile);({browser,exited}=launched);
        cdp=await connectP805Devtools(`http://127.0.0.1:${await launched.waitForPort()}`);
        const evaluate=async(expression)=>{
            const result=await cdp.send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
            assert.equal(result.exceptionDetails,undefined);return result.result.value;
        };
        const workflowEvidence = [];
        const save = async (kind, name, contents, observationIds) => {
            const target = path.join(profile, name);
            await writeFile(target, contents, {flag:'wx'});
            const evidence = {evidenceId:name, kind, path:target, sha256:hash(contents), observationIds};
            workflowEvidence.push(evidence);
            return evidence.evidenceId;
        };
        const recordNavigation = async (receipt, observation) => {
            const state = await poll(()=>evaluate(`(()=>({route:location.hash,text:document.body.innerText,
                controls:[...document.querySelectorAll('button,input,textarea')].filter(item=>item.getClientRects().length).map(item=>({id:item.id,disabled:item.disabled})),
                viewport:{width:visualViewport.width,height:visualViewport.height},layout:{width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth},draft:window.dirtyGameName?.value}))()`));
            assert.equal(state.route, receipt.routeAfter);
            const transaction = {route:state.route, state, interaction:receipt.control, activation:receipt.activation};
            const evidenceId = await saveP805RenderedWorkflowEvidence(save, 'narrow', observation, transaction);
            assert.deepEqual(JSON.parse(await readFile(path.join(profile, evidenceId), 'utf8')), transaction);
            const page = JSON.parse(await readFile(path.join(profile, `narrow-${observation}-page-state.json`), 'utf8'));
            assert.deepEqual(page, {kind:'p8-05-rendered-page-state', operation:observation, route:state.route, viewport:'narrow', state});
            assert.deepEqual(state.viewport, {width:390,height:844}, JSON.stringify(state.layout));
            return workflowEvidence.slice(-2);
        };
        const recorded = [];
        await cdp.send("Emulation.setDeviceMetricsOverride",{width:390,height:844,mobile:true,deviceScaleFactor:1});
        await cdp.send("Page.navigate",{url:`http://127.0.0.1:${server.httpServer.address().port}/drawer-recovery`});
        await poll(()=>evaluate("document.getElementById('project-tab:simulation')?.isConnected"),30_000);
        const replay=await navigateP805RenderedControl(cdp,evaluate,'replay','#/project/source/replay','successful replay');
        recorded.push(await recordNavigation(replay, 'replay'));
        assert.equal(hasP805NativeActivation(replay.control.navigationDisclosure,'studio-navigation-toggle'),true);
        const artifact=await evaluate("(()=>{const item=document.querySelector('input[type=radio][value=artifact]');item.focus();return {stableControlId:item.id};})()");
        await activateP805FocusedControl(cdp,evaluate,'precondition',artifact,'keyboard');
        for(const round of [1,0,1]){
            await setP805ReplayArtifactInput(cdp,evaluate,JSON.stringify({round,seed:'recovery-seed'}));
            const load=await activateP805FocusedControl(cdp,evaluate,'operation',{stableControlId:'replay-artifact-load'});
            assert.equal(hasP805NativeActivation(load,'replay-artifact-load'),true);
            await poll(()=>evaluate(`document.querySelector('[data-pokie-lifecycle-result="replay-artifact"]')?.getAttribute('data-pokie-lifecycle-terminal')===${JSON.stringify(round?'loaded':'error')}`));
            await evaluate("document.querySelector('[data-pokie-lifecycle-result=replay-artifact]').scrollIntoView({block:'center',inline:'nearest'})");
        }
        const navigationBoundary=()=>evaluate(`(()=>{
            const panel=document.getElementById('studio-navigation-panel'),tab=document.getElementById('project-tab:simulation'),box=tab.getBoundingClientRect();
            return {scrollY,layoutWidth:innerWidth,documentWidth:document.documentElement.scrollWidth,
                viewport:{left:visualViewport.offsetLeft,top:visualViewport.offsetTop,width:visualViewport.width,height:visualViewport.height,scale:visualViewport.scale},
                panel:panel.getBoundingClientRect().toJSON(),tab:box.toJSON(),
                hit:document.elementFromPoint(box.left+box.width/2,box.top+box.height/2)?.outerHTML,
                animations:document.getAnimations().map(animation=>({target:animation.effect.target.tagName,playState:animation.playState}))};
        })()`);
        const before=await navigationBoundary();
        let cancellation;
        try {
            cancellation=await navigateP805RenderedControl(cdp,evaluate,'simulation','#/project/source/simulation','cooperative cancellation');
        } catch(error) {
            throw new Error(`${error.message}; before: ${JSON.stringify(before)}; after: ${JSON.stringify(await navigationBoundary())}`,{cause:error});
        }
        assert.deepEqual(before.viewport,{left:0,top:0,width:390,height:844,scale:1},'Artifact scrolling must retain the assigned mobile viewport');
        assert.equal(before.layoutWidth,390);
        assert.equal(before.documentWidth,390,'the source picker must not overflow the real Replay workspace');
        assert.equal(before.panel.width,390,'the production drawer must fit the assigned mobile viewport');
        assert.equal(cancellation.activation.hitTest.visualViewport.width,390);
        assert.ok(cancellation.activation.hitTest.region.left>=0);
        assert.ok(cancellation.activation.hitTest.region.left+cancellation.activation.hitTest.region.width<=390);
        assert.equal(hasP805NativeActivation(cancellation.control.navigationDisclosure,'studio-navigation-toggle'),true,JSON.stringify(before));
        assert.equal(hasP805NativeActivation(cancellation.activation,'project-tab:simulation'),true);
        assert.equal(cancellation.routeBefore,'#/project/source/replay');
        assert.equal(cancellation.routeAfter,'#/project/source/simulation');
        recorded.push(await recordNavigation(cancellation, 'simulation'));
        assert.equal(await evaluate("document.getElementById('studio-navigation-toggle').getAttribute('aria-expanded')"),'false');
        assert.equal(await evaluate("window.activations.filter(value=>value.id==='project-tab:simulation').length"),1);
        const close=await evaluate("(()=>{const item=document.getElementById('close-project');item.focus({preventScroll:true});return {stableControlId:item.id};})()");
        await activateP805FocusedControl(cdp,evaluate,'navigation',close,'keyboard');
        await poll(()=>evaluate("location.hash==='#/home/projects' && document.getElementById('home-tab:design')?.isConnected"));
        // The native Home route still has to commit its selected tab and
        // visible retained body; the address bar cannot stand in for either.
        assert.deepEqual(await observeP805NavigationReadiness(evaluate,'design'),{controlId:'home-tab:design',currentRoute:'#/home/projects',terminal:'rendered'});
        await evaluate("document.getElementById('home-tab:projects').removeAttribute('aria-current')");
        assert.equal(await observeP805NavigationReadiness(evaluate,'design'),false);
        await evaluate("document.getElementById('home-tab:projects').setAttribute('aria-current','page');document.getElementById('home-projects-panel').hidden=true");
        assert.equal(await observeP805NavigationReadiness(evaluate,'design'),false);
        await evaluate("document.getElementById('home-projects-panel').hidden=false");
        const design=await navigateP805RenderedControl(cdp,evaluate,'design','#/home/design','unsaved-work source');
        assert.equal(hasP805NativeActivation(design.activation,'home-tab:design'),true);
        assert.equal(design.routeBefore,'#/home/projects');
        assert.equal(design.routeAfter,'#/home/design');
        recorded.push(await recordNavigation(design, 'design'));
        assert.equal(await evaluate("window.activations.filter(value=>value.id==='home-tab:design').length"),1);
        const proof=design.control.navigationDisclosureState;
        assert.equal(hasP805NativeActivation(design.control.navigationDisclosure,'studio-navigation-toggle'),true);
        assert.equal(proof.before.closed,true);
        assert.equal(proof.before.expanded,'false');
        assert.equal(proof.before.panelInert,true);
        assert.equal(proof.settled.expanded,'true');
        assert.equal(proof.settled.panelInert,false);
        assert.equal(proof.settled.settled,true);
        assert.equal(proof.settled.moving,false);
        assert.equal(proof.settled.panelVisible,true);
        assert.equal(proof.settled.panelRegion.width,390,'the actual Home drawer, including its border, fits the assigned phone viewport');
        assert.deepEqual(proof.settled.visualViewport,{offsetLeft:0,offsetTop:0,width:390,height:844,scale:1});
        assert.equal(await evaluate("document.getElementById('home-projects-panel')?.isConnected && document.getElementById('home-design-panel')?.isConnected"),true,'the regression must retain both production Home panels');
        assert.equal(proof.settled.controlId,'studio-navigation-toggle');
        assert.equal(proof.settled.accessibleName,'Toggle navigation');
        assert.equal(proof.settled.panelId,'studio-navigation-panel');
        assert.equal(proof.settled.connected && proof.settled.enabled && proof.settled.identityPreserved && proof.settled.toggleVisible && proof.settled.toggleHit,true);
        assert.equal(proof.target.controlId,'home-tab:design');
        assert.equal(proof.target.connected && proof.target.enabled && proof.target.viewportVisible && proof.target.hit,true);
        assert.deepEqual(proof.target.visualViewport,design.activation.hitTest.visualViewport);
        assert.deepEqual(proof.target.region,design.activation.hitTest.region);
        const draft=await poll(()=>evaluate(`(()=>{
            const item=[...document.querySelectorAll('input')].find(candidate=>candidate.labels&&[...candidate.labels].some(label=>label.textContent.trim()==='Game name'));
            if(!item || item.getClientRects().length===0 || item.disabled)return false;
            item.scrollIntoView({block:'center',inline:'nearest'});item.focus({preventScroll:true});
            window.dirtyGameName=item;
            return document.activeElement===item?{id:item.id,value:item.value}:false;
        })()`));
        await cdp.send('Input.insertText',{text:' P805 unsaved'});
        const dirtyValue=draft.value+' P805 unsaved';
        await poll(()=>evaluate(`window.dirtyGameName.value===${JSON.stringify(dirtyValue)}`));
        // Reproduce the retained machine finding: Design closes the drawer,
        // so its DOM-present Projects button cannot receive native focus.
        assert.equal(await evaluate("document.getElementById('studio-navigation-panel').inert"),true);
        assert.equal(await evaluate("(()=>{const item=document.getElementById('home-tab:projects');item.focus({preventScroll:true});return document.activeElement===item;})()"),false);
        const projectCommands=[];
        const projectDispatcher={send:async(method,params)=>{projectCommands.push({method,...params});return cdp.send(method,params);}};
        const projects=await navigateP805RenderedControl(projectDispatcher,evaluate,'projects','#/home/projects','unsaved-work Projects');
        assert.equal(projects.routeBefore,'#/home/design');
        assert.equal(projects.routeAfter,'#/home/projects');
        recorded.push(await recordNavigation(projects, 'projects'));
        assert.equal(projects.control.stableControlId,'home-tab:projects');
        assert.equal(projects.control.accessibleName,'Projects');
        assert.equal(hasP805NativeActivation(projects.control.navigationDisclosure,'studio-navigation-toggle'),true);
        assert.equal(projects.control.navigationDisclosureState.before.closed,true);
        assert.equal(projects.control.navigationDisclosureState.settled.settled,true);
        assert.equal(projects.control.navigationDisclosureState.target.controlId,'home-tab:projects');
        assert.equal(projects.control.navigationDisclosureState.target.viewportVisible && projects.control.navigationDisclosureState.target.hit,true);
        assert.equal(hasP805NativeActivation(projects.activation,'home-tab:projects'),true);
        assert.deepEqual(projectCommands.filter(({method})=>method==='Input.dispatchKeyEvent').map(({type})=>type),['keyDown','keyUp']);
        assert.deepEqual(projectCommands.filter(({method,type})=>method==='Input.dispatchMouseEvent' && ['mousePressed','mouseReleased'].includes(type)).map(({type})=>type),['mousePressed','mouseReleased']);
        assert.equal(await evaluate("window.activations.filter(value=>value.id==='home-tab:projects').length"),1);
        assert.equal(await evaluate("document.getElementById('home-tab:projects').getAttribute('aria-current')"),'page');
        assert.equal(await evaluate("document.getElementById('studio-navigation-toggle').getAttribute('aria-expanded')"),'false');
        assert.equal(await evaluate(`document.getElementById(${JSON.stringify(draft.id)})===window.dirtyGameName && window.dirtyGameName.value===${JSON.stringify(dirtyValue)}`),true);
        assert.equal(await evaluate("document.getElementById('home-design-panel').getClientRects().length"),0);
        assert.equal(await evaluate("document.getElementById('home-projects-panel').getClientRects().length>0"),true);
        const open=await poll(()=>evaluate("(()=>{const item=document.querySelector('[data-pokie-project-location=\"/games/source\"]');if(!item||item.disabled)return false;item.scrollIntoView({block:'center',inline:'nearest'});item.focus({preventScroll:true});return document.activeElement===item?{stableControlId:item.id}:false;})()"));
        const openActivation=await activateP805FocusedControl(cdp,evaluate,'navigation',open);
        assert.equal(hasP805NativeActivation(openActivation,open.stableControlId),true);
        await poll(()=>evaluate("document.body.innerText.includes('You have unsaved changes in Design Game. Leave and lose them?')"));
        const stay=await poll(()=>evaluate("(()=>{const item=document.getElementById('design-navigation-guard-stay');return item&&!item.disabled&&item.textContent.trim()==='Stay'?{stableControlId:item.id}:false;})()"));
        const stayActivation=await activateP805FocusedControl(cdp,evaluate,'recovery',stay);
        assert.equal(hasP805NativeActivation(stayActivation,'design-navigation-guard-stay'),true);
        await poll(()=>evaluate("!document.getElementById('design-navigation-guard-stay')"));
        assert.equal(await evaluate('location.hash'),'#/home/projects');
        assert.equal(await evaluate("window.fixtureRequests.filter(url=>url==='/api/home/projects/open').length"),0);
        // Expansion is a requested product state, not completed execution.
        // Start a real panel transition after native opening and observe it
        // without toggling the already expanded drawer a second time.
        await evaluate("document.getElementById('studio-navigation-toggle').focus({preventScroll:true})");
        await activateP805FocusedControl(cdp,evaluate,'navigation-drawer',{stableControlId:'studio-navigation-toggle'});
        await evaluate("window.openingPanelAnimation=document.getElementById('studio-navigation-panel').animate([{transform:'translateX(-100%)'},{transform:'translateX(0px)'}],{duration:450})");
        assert.equal(await evaluate("document.getElementById('studio-navigation-toggle').getAttribute('aria-expanded')"),'true');
        assert.equal(await evaluate("window.openingPanelAnimation.playState"),'running');
        const commands=[];
        const dispatcher={send:async(method,params)=>{commands.push({method,...params});return cdp.send(method,params);}};
        const expandedDesign=await navigateP805RenderedControl(dispatcher,evaluate,'design','#/home/design','settling unsaved-work source');
        assert.equal(expandedDesign.control.navigationDisclosure,undefined);
        assert.equal(expandedDesign.control.navigationDisclosureState.before.expanded,'true');
        assert.equal(expandedDesign.control.navigationDisclosureState.before.closed,false);
        assert.equal(expandedDesign.control.navigationDisclosureState.settled.moving,false);
        assert.equal(expandedDesign.control.navigationDisclosureState.target.controlId,'home-tab:design');
        assert.equal(expandedDesign.routeAfter,'#/home/design');
        recorded.push(await recordNavigation(expandedDesign, 'design-after-stay'));
        assert.equal(await evaluate(`document.getElementById(${JSON.stringify(draft.id)})===window.dirtyGameName && window.dirtyGameName.value===${JSON.stringify(dirtyValue)}`),true,'Stay and the native Home tab return preserve the same edited draft');
        assert.equal(hasP805NativeActivation(expandedDesign.activation,'home-tab:design'),true);
        assert.equal(commands.filter(({method})=>method==='Input.dispatchKeyEvent').length,0);
        assert.deepEqual(commands.filter(({method,type})=>method==='Input.dispatchMouseEvent' && ['mousePressed','mouseReleased'].includes(type)).map(({type})=>type),['mousePressed','mouseReleased']);
        assert.equal(await evaluate("window.activations.filter(value=>value.id==='home-tab:design').length"),2);
        assert.equal(await evaluate("window.__p805NavigationDisclosures.size"),0);
        // Reproduce the retained producer/consumer failure, rather than
        // assuming a persona aggregate can lend evidence to a scoped child.
        // Only the two relevant kinds come from this real bounded browser
        // workflow; other kinds below are schema fixtures, not campaign proof.
        const otherKinds = P805_REQUIRED_EVIDENCE_KINDS.filter(kind=>!['live-dom-transaction','page-state'].includes(kind)).map(kind=>({kind}));
        assert.deepEqual(recorded.map(pair=>pair.map(item=>item.observationIds[0])),
            ['replay','simulation','design','projects','design-after-stay'].map(name=>[name,name]));
        for (const [index, pair] of recorded.entries()) {
            const evidence = [...otherKinds, ...pair];
            assert.throws(()=>validateP805AuditEvidenceKinds(evidence.filter(item=>item.kind!=='page-state'), 'initial audit for mathematician'), /missing page-state evidence/);
            assert.doesNotThrow(()=>validateP805AuditEvidenceKinds(evidence, 'initial audit for mathematician'));
            const page = JSON.parse(await readFile(pair[1].path, 'utf8'));
            assert.equal(page.kind, 'p8-05-rendered-page-state');
            assert.equal(Object.hasOwn(page, 'recovery'), false, 'a scoped page cannot fabricate compound recovery');
            if(index>=3) assert.equal(page.state.draft, dirtyValue);
        }
        const children = recorded.map((evidence, index)=>({
            auditId:`bounded-${index}`, tuple:{viewport:'narrow'}, timings:{startupMs:1}, performance:{},
            observations:evidence[0].observationIds, evidence, observationEvidence:{[evidence[0].observationIds[0]]:evidence[0].evidenceId},
            checkpointReceipts:[], startedAt:'2026-10-03T00:00:00.000Z', endedAt:'2026-10-03T00:00:01.000Z', cleanup:{evidenceId:`cleanup-${index}`},
            rendered:{responsive:[],measurements:{consoleExceptions:0,unhandledRequestFailures:0,documentOverflow:false,inaccessiblePrimaryActions:0,unexplainedDisabledControls:0,namedRegions:1,visibleFocus:true},defects:[],actions:[],recovery:{},jobs:{}},
        }));
        const beforeProjection = JSON.stringify(children);
        const projection = projectP805PersonaAudit(children, children.map(child=>({auditSha256:hash(JSON.stringify(child))})), 'initial', 'mathematician');
        assert.equal(JSON.stringify(children), beforeProjection);
        assert.deepEqual(projection.evidence, workflowEvidence);
        assert.deepEqual(projection.observations, ['replay','simulation','design','projects','design-after-stay']);
        assert.equal(projection.evidence.filter(item=>item.kind==='page-state').length, children.length);
    } finally {
        cdp?.close();
        browser?.kill("SIGTERM");if(exited)await exited;
        await server.close();
        await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100});
    }
}

async function runProductionPointerReflow() {
    const {createServer:createViteServer} = await import('vite');
    const profile = await mkdtemp(path.join(tmpdir(), 'p805-production-pointer-reflow-'));
    const requests = [], jobs = new Map();
    let dashboardJob, dashboardNextStatus, advanced = false;
    const source = `
        import React,{useEffect,useState} from 'react';
        import {createRoot} from 'react-dom/client';
        import {MantineProvider,Button} from '@mantine/core';
        import {ModalsProvider} from '@mantine/modals';
        import '@mantine/core/styles.css';
        import '/cli/studio-client/src/global.css';
        import {ProjectDashboardPage} from '/cli/studio-client/src/components/project/ProjectDashboardPage.tsx';
        import {createHashRouter,RouterProvider} from 'react-router-dom';
        import {SimulationTab} from '/cli/studio-client/src/components/project/SimulationTab.tsx';
        import {ReplayTab} from '/cli/studio-client/src/components/project/ReplayTab.tsx';
        import {StudioApiProvider} from '/cli/studio-client/src/context/StudioApiProvider.tsx';
        import {useSimulationPoll} from '/cli/studio-client/src/hooks/useSimulationPoll.ts';
        import {inspectReplayArtifact} from '/cli/studio-client/src/api/apiClient.ts';
        const h=React.createElement,noop=()=>{};
        function Fixture(){
            const sim=useSimulationPoll(),[route,setRoute]=useState('simulation'),[expected,setExpected]=useState({status:'empty'});
            useEffect(()=>{const id=sessionStorage.getItem('job');if(id)sim.restore(id);},[]);
            useEffect(()=>{if(sim.currentJobId)sessionStorage.setItem('job',sim.currentJobId);},[sim.currentJobId]);
            const load=async raw=>{try{setExpected({status:'loaded',...await inspectReplayArtifact(fetch,JSON.parse(raw))});}catch(error){setExpected({status:'error',message:error.message});}};
            return h('main',null,h(Button,{id:'project-tab:replay',onClick:()=>setRoute('replay')},'Replay'),
                route==='simulation'?h(SimulationTab,{
                    progress:sim.progress,error:sim.error,cancellationRequested:sim.cancellationRequested,operation:sim.operation,terminalReceipt:sim.terminalReceipt,
                    onRun:sim.run,onCancel:sim.cancel,onRetry:sim.retry,recentRuns:{status:'empty'},onRefreshRecentRuns:noop,
                    reviewedDetail:{status:'empty'},compareDetail:{status:'empty'},onOpenHistoric:noop,onRunAgain:noop,onCompare:noop,onClearCompare:noop
                }):h(ReplayTab,{listView:{status:'empty'},recentSpins:{status:'empty'},recentRuns:{status:'empty'},expected,
                    onLoadExpectedFromPaste:load,onRun:noop,onCancel:noop,onRetry:noop,onRefreshList:noop,onInspectStored:async()=>{},onCompareStored:noop,
                    onClearExpected:()=>setExpected({status:'empty'}),onRefreshRecentSpins:noop,onRefreshRecentRuns:noop}));
        }
        window.activations=[];
        document.addEventListener('click',event=>{const item=event.target.closest('button');if(item)window.activations.push({id:item.id,trusted:event.isTrusted});},true);
        const surface=location.pathname==='/dashboard'
            ?h(RouterProvider,{router:createHashRouter([{path:'/project/:tab',element:h(ProjectDashboardPage)}])}):h(Fixture);
        createRoot(document.getElementById('root')).render(h(MantineProvider,null,h(ModalsProvider,null,h(StudioApiProvider,{fetchImpl:fetch},surface))));
    `;
    const server = await createViteServer({configFile:false,root:process.cwd(),cacheDir:path.join(profile,'vite'),server:{host:'127.0.0.1',port:0},plugins:[{
        name:'p805-production-pointer-reflow',resolveId:id=>id==='/reflow.js'?id:undefined,load:id=>id==='/reflow.js'?source:undefined,
        configureServer(vite){vite.middlewares.use((request,response,next)=>{
            if(request.url==='/reflow'||request.url==='/dashboard'){
                response.setHeader('Content-Type','text/html');
                response.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/reflow.js"></script>');return;
            }
            if(request.url==='/api/fixture/advance'){advanced=true;response.end('{}');return;}
            if(!request.url.startsWith('/api/project/'))return next();
            let body='';request.on('data',chunk=>{body+=chunk;});request.on('end',()=>{
                requests.push({method:request.method,path:request.url,body});
                response.setHeader('Content-Type','application/json');
                if(dashboardJob){
                    const common={id:dashboardJob.id,projectId:'/games/a',operation:'simulation',request:{rounds:500000,workers:1},conflictKey:'simulation:/games/a',status:dashboardJob.status,createdAt:1,startedAt:Date.now()-1000,
                        progress:{stage:'Sampling rounds',current:advanced?123456:0,total:500000,unit:'rounds',...(advanced?{message:'Sampling the next batch of rounds; elapsed time and throughput update while this simulation runs.'}:{})}};
                    if(request.url==='/api/project/simulations'&&request.method==='POST'){
                        dashboardJob={...JSON.parse(body),id:'dashboard-'+dashboardNextStatus,status:dashboardNextStatus,startedAt:new Date().toISOString(),roundsCompleted:500000,durationMs:123456,...(dashboardNextStatus==='failed'?{error:'Focused dashboard failure'}:{})};
                        response.writeHead(202);response.end(JSON.stringify(dashboardJob));
                    }else if(request.url==='/api/project/context')response.end(JSON.stringify({status:'loaded',projectRoot:'/games/a',game:{id:'a',name:'A',version:'1.0.0'},type:'blueprint',capabilities:['blueprint.build']}));
                    else if(request.url==='/api/project/jobs')response.end(JSON.stringify({jobs:[common]}));
                    else if(request.url.startsWith('/api/project/jobs/'))response.end(JSON.stringify(common));
                    else if(request.url.startsWith('/api/project/simulations/')){
                        if(request.method==='DELETE')dashboardJob.status='cancelled';
                        response.end(JSON.stringify({...dashboardJob,roundsCompleted:advanced?123456:0,durationMs:advanced?123456:20}));
                    }else if(request.url==='/api/project/inspect')response.end(JSON.stringify({packageRoot:'/games/a',valid:true,generated:false}));
                    else response.end('[]');
                }else if(request.url==='/api/project/simulations'&&request.method==='POST'){
                    const id=`job-${jobs.size+1}`,status=jobs.size===0?'running':jobs.size===1?'failed':'completed';
                    const job={...JSON.parse(body),id,status,startedAt:new Date().toISOString(),roundsCompleted:0,durationMs:20,...(status==='failed'?{error:'Focused failed run'}:{})};
                    jobs.set(id,job);response.writeHead(202);response.end(JSON.stringify(job));
                }else if(request.url.startsWith('/api/project/simulations/')){
                    const job=jobs.get(request.url.split('/').at(-1));
                    if(request.method==='DELETE')job.status='cancelled';
                    response.end(JSON.stringify(job));
                }else if(request.url==='/api/project/replays/inspect-artifact'){
                    const descriptor=JSON.parse(body);response.writeHead(descriptor.round>0?200:400);
                    response.end(JSON.stringify(descriptor.round>0?{...descriptor,artifactWarnings:[]}:{error:'"round" must be a positive integer.'}));
                }else{response.writeHead(404);response.end('{}');}
            });
        });}
    }]});
    let browser,exited,cdp;
    try {
        await server.listen();const launched=launchFocusedBrowser(profile);({browser,exited}=launched);
        cdp=await connectP805Devtools(`http://127.0.0.1:${await launched.waitForPort()}`);
        const evaluate=async expression=>{const result=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert.equal(result.exceptionDetails,undefined);return result.result.value;};
        await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,mobile:false,deviceScaleFactor:1});
        // CDP can reject a readiness read while navigation destroys the old
        // execution context. Retry only that read, never a native activation.
        const navigationReady = async expression => {
            try { return await evaluate(expression); }
            catch (error) {
                if (/"code":-32000/.test(String(error)) && /Inspected target navigated or closed|Execution context was destroyed|Cannot find context with specified id/.test(String(error))) return false;
                throw error;
            }
        };
        await cdp.send('Page.navigate',{url:`http://127.0.0.1:${server.httpServer.address().port}/reflow`});
        await poll(()=>navigationReady("!!document.getElementById('simulation-run')"),30_000);
        const accepted=[],snapshots=[],pages=[];
        const activate=async(id,lifecycle='recovery',reflow=false,retain=false)=>{
            if(['simulation-cancel-dismiss','simulation-cancel-confirm'].includes(id)){
                await poll(()=>evaluate(`!!document.getElementById(${JSON.stringify(id)})`));
                // Match beginRenderedTransaction: let the production portal
                // install its focus trap before capturing the native control.
                await new Promise(resolve=>setTimeout(resolve,250));
            }
            const dispatcher={send:async(method,params)=>{
                // Deliver the native gesture once, at its original point, after
                // a progress render moves the exact public control. No remeasure
                // or second click can hide this delivery-time race.
                if(reflow&&method==='Input.dispatchMouseEvent'&&params.type==='mousePressed')await evaluate(`(()=>{const item=document.getElementById(${JSON.stringify(id)});item.style.marginTop=(parseFloat(getComputedStyle(item).marginTop)+12)+'px';})()`);
                return cdp.send(method,params);
            }};
            const activation=await activateP805FocusedControl(dispatcher,evaluate,lifecycle,{stableControlId:id},'pointer',retain);
            assert.equal(hasP805NativeActivation(activation,id),true);
            if(reflow){
                assert.equal(activation.dispatch.eventBindings.length,3);
                for(const event of activation.dispatch.eventBindings){
                    assert.equal(event.reflow.kind,'same-node-delivery-reflow');
                    assert.equal(event.pathContainsCapturedControl,true);
                    assert.equal(event.regionMatchesMeasured,false);
                    assert.deepEqual(event.reflow.measuredRegion,activation.hitTest.region);
                    assert.deepEqual(event.reflow.deliveredRegion,event.region);
                }
                for(const corrupt of [
                    value=>{value.preDispatchFocus.native=false;},
                    value=>{value.hitTest.matchesCapturedControl=false;},
                    value=>{value.dispatch.clickCount=2;},
                    value=>{value.dispatch.eventBindings.pop();},
                    ...['trusted','pathContainsCapturedControl','capturedControlConnected','identityPreserved','hitMatchesCapturedControl','enabled'].flatMap(field=>[0,1,2].map(index=>value=>{value.dispatch.eventBindings[index][field]=false;})),
                    value=>{value.dispatch.eventBindings[0].relationship='overlay';},
                    value=>{value.dispatch.eventBindings[0].x+=100;},
                    value=>{value.dispatch.eventBindings[0].visualViewport.width+=15;},
                    value=>{value.dispatchPoint.x+=1;},
                    value=>{value.dispatch.eventBindings[0].region.top+=100;},
                    value=>{delete value.dispatch.eventBindings[0].reflow;},
                    value=>{value.dispatch.eventBindings[0].reflow.kind='geometry-only';},
                    value=>{value.dispatch.eventBindings[1].pathContainsCapturedControl=false;value.dispatch.eventBindings[1].dispatchRegionAncestor=true;value.dispatch.eventBindings[1].relationship='captured-dispatch-region';value.dispatch.eventBindings[1].regionMatchesMeasured=true;delete value.dispatch.eventBindings[1].reflow;},
                ]){const invalid=structuredClone(activation);corrupt(invalid);assert.equal(hasP805NativeActivation(invalid,id),false);}
            }
            accepted.forEach((receipt,index)=>assert.equal(JSON.stringify(receipt),snapshots[index],'later workflow cannot rewrite an accepted native receipt'));
            accepted.push(activation);snapshots.push(JSON.stringify(activation));return activation;
        };
        await activate('simulation-run','operation');
        await poll(()=>evaluate("document.querySelector('[data-pokie-lifecycle-result=simulation]')?.getAttribute('data-pokie-lifecycle-terminal')==='running'"));
        const reloadCursor = cdp.events.length;
        await cdp.send('Page.reload',{ignoreCache:true});
        const reloadRequest = await poll(()=>cdp.events.slice(reloadCursor).find(event=>event.method==='Network.requestWillBeSent'&&event.params.type==='Document'));
        await poll(()=>cdp.events.slice(reloadCursor).find(event=>event.method==='Network.loadingFinished'&&event.params.requestId===reloadRequest.params.requestId));
        await poll(()=>navigationReady("document.getElementById('simulation-cancel')?.isConnected && document.querySelector('[data-pokie-lifecycle-result=simulation]')?.getAttribute('data-pokie-lifecycle-result-job')==='job-1'"));
        await activate('simulation-cancel','recovery',true);
        await activate('simulation-cancel-dismiss','precondition');
        assert.equal(requests.filter(item=>item.method==='DELETE').length,0,'dismissal must leave the restored job active');
        await activate('simulation-cancel','recovery',true);
        await activate('simulation-cancel-confirm','precondition');
        await poll(()=>evaluate("document.querySelector('[data-pokie-lifecycle-result=simulation]')?.getAttribute('data-pokie-lifecycle-terminal')==='cancelled' && !!document.getElementById('simulation-retry')"));
        assert.equal(requests.filter(item=>item.method==='DELETE').length,1);
        for(const [status,jobId] of [['failed','job-2'],['completed','job-3']]){
            const cursor=cdp.events.length,start=Date.now(),pointer=await activate('simulation-retry','recovery',true,true);
            await poll(()=>evaluate(`document.querySelector('[data-pokie-lifecycle-result=simulation]')?.getAttribute('data-pokie-lifecycle-terminal')===${JSON.stringify(status)}`));
            const request=await poll(()=>cdp.events.slice(cursor).find(event=>event.method==='Network.requestWillBeSent'&&event.params.request.method==='POST'&&event.params.request.url.endsWith('/api/project/simulations')));
            const terminal={status,jobId,result:jobs.get(jobId),resultSha256:hash(JSON.stringify(jobs.get(jobId)))};
            const transaction={operation:'simulation-retry',stateClass:'recovery-operation',control:{stableControlId:'simulation-retry'},confirmation:{required:false,state:'not-required'},pointerActivations:[pointer],keyboardActivations:[],requestCount:1,request:{browserRequestId:request.params.requestId,method:'POST',path:'/api/project/simulations'},terminal:{...terminal,causedByRequestId:request.params.requestId}};
            transaction.postTransitionRenderedState=await poll(()=>observeP805PointerTerminal(evaluate,transaction,terminal));
            const retry={operation:'simulation-retry',controlId:'simulation-retry',stateClass:'recovery-operation',transaction};
            if(status==='completed')assert.equal(validateP805RetryTerminalReceipt(retry).transaction,transaction);
            else assert.throws(()=>validateP805RetryTerminalReceipt(retry),/not bound to its captured Retry control/,'a failed Retry must not substitute for the required completed retry');
            const page={control:{id:'simulation-retry'},interaction:{activation:'pointer',pointerActivated:true},transaction,request:transaction.request,terminal,elapsedMs:Date.now()-start};
            assert.equal(hasP805LiveDomActivation(page),true,'aggregate and closeout consume the original native retry');
            const stale=structuredClone(page);delete stale.transaction.postTransitionRenderedState.preDispatchEvidence.dispatch.eventBindings[0].reflow;
            assert.equal(hasP805LiveDomActivation(stale),false,'terminal evidence must preserve the exact reflow receipt');
            const substituted=structuredClone(page);substituted.transaction.pointerActivations=[];substituted.transaction.keyboardActivations=[{kind:'keyboard',count:1,controlId:'simulation-retry',nativeFocus:true}];
            assert.equal(hasP805LiveDomActivation(substituted),false);
            pages.push(page);
        }
        await activate('project-tab:replay','navigation');
        const artifact=await evaluate("(()=>{const item=document.querySelector('input[type=radio][value=artifact]');item.focus();return {stableControlId:item.id};})()");
        await activateP805FocusedControl(cdp,evaluate,'precondition',artifact,'keyboard');
        for(const round of [1,0,1]){
            await setP805ReplayArtifactInput(cdp,evaluate,JSON.stringify({round,seed:'recovery-seed'}));
            await activate('replay-artifact-load','operation',true);
            await poll(()=>evaluate(`document.querySelector('[data-pokie-lifecycle-result=replay-artifact]')?.getAttribute('data-pokie-lifecycle-terminal')===${JSON.stringify(round?'loaded':'error')}`));
        }
        assert.deepEqual(requests.filter(item=>item.path==='/api/project/replays/inspect-artifact').map(item=>JSON.parse(item.body).round),[1,0,1]);
        assert.equal(requests.filter(item=>item.method==='POST'&&item.path==='/api/project/simulations').length,3);
        assert.deepEqual(accepted.map(item=>item.controlId),['simulation-run','simulation-cancel','simulation-cancel-dismiss','simulation-cancel','simulation-cancel-confirm','simulation-retry','simulation-retry','project-tab:replay','replay-artifact-load','replay-artifact-load','replay-artifact-load']);
        const children=pages.map((page,index)=>({timings:{retryMs:page.elapsedMs},performance:{retryMs:{budgetMs:180000}},observations:['simulation-retry'],evidence:[],observationEvidence:{},checkpointReceipts:[{sha256:hash(JSON.stringify(page))}],startedAt:new Date().toISOString(),endedAt:new Date().toISOString(),cleanup:{evidenceId:'focused-cleanup'},tuple:{viewport:index?'compact':'wide'},rendered:{responsive:[{viewport:index?'compact':'wide'}],measurements:{consoleExceptions:0,unhandledRequestFailures:0,documentOverflow:false,inaccessiblePrimaryActions:0,unexplainedDisabledControls:0,namedRegions:1,visibleFocus:true},actions:[page],recovery:{},jobs:{},defects:[]}}));
        const bytes=JSON.stringify(children),projection=projectP805PersonaAudit(children,children.map(child=>({auditSha256:hash(JSON.stringify(child))})),'initial','mathematician');
        assert.equal(JSON.stringify(children),bytes);
        assert.deepEqual(projection.rendered.actions,pages);
        assert.equal(projection.timings.retryMs,Math.max(...pages.map(page=>page.elapsedMs)));
        assert.ok(projection.rendered.actions.every(hasP805LiveDomActivation));
        accepted.forEach((receipt,index)=>assert.equal(JSON.stringify(receipt),snapshots[index]));
        // The retained d73e1756 miss happened in the full dashboard, whose
        // common job cards poll independently of SimulationTab. Exercise both
        // real polling hooks at the exact narrow pointer-delivery boundary.
        dashboardJob={id:'dashboard-job',status:'running',rounds:500000,workers:1,startedAt:new Date().toISOString(),roundsCompleted:0,durationMs:20};
        await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,mobile:true,deviceScaleFactor:1});
        await cdp.send('Page.navigate',{url:`http://127.0.0.1:${server.httpServer.address().port}/dashboard#/project/simulation`});
        await poll(()=>navigationReady("!!document.getElementById('simulation-cancel') && !!document.querySelector('.studio-job-card')"),30_000);
        const before=await evaluate("({cardHeight:document.querySelector('.studio-job-card').getBoundingClientRect().height})");
        let measured,delivered;
        const dispatcher={send:async(method,params)=>{
            if(method==='Input.dispatchMouseEvent'&&params.type==='mousePressed'){
                measured=await evaluate("document.getElementById('simulation-cancel').getBoundingClientRect().top");
                await evaluate("fetch('/api/fixture/advance').then(response=>response.text())");
                await poll(()=>evaluate("document.querySelector('.studio-job-card').innerText.includes('123456') && document.querySelector('[data-pokie-lifecycle-result=simulation]').innerText.includes('123456')"));
                delivered=await evaluate("document.getElementById('simulation-cancel').getBoundingClientRect().top");
            }
            return cdp.send(method,params);
        }};
        const cancel=await activateP805FocusedControl(dispatcher,evaluate,'recovery',{stableControlId:'simulation-cancel'});
        assert.equal(delivered,measured,'live polling must not move the captured feature action before the native press');
        assert.equal(hasP805NativeActivation(cancel,'simulation-cancel'),true);
        assert.ok(await evaluate('document.querySelector(".studio-job-card").getBoundingClientRect().height')>before.cardHeight,'the real common progress card must actually grow');
        await activate('simulation-cancel-dismiss','precondition');
        assert.equal(dashboardJob.status,'running','dismissal preserves the active simulation');
        await activate('simulation-cancel','recovery');
        await activate('simulation-cancel-confirm','precondition');
        await poll(()=>evaluate("!!document.getElementById('simulation-retry') && document.querySelector('[data-pokie-lifecycle-result=simulation]').getAttribute('data-pokie-lifecycle-terminal')==='cancelled'"));
        for(const status of ['failed','completed']){
            dashboardNextStatus=status;
            const cursor=cdp.events.length,start=Date.now(),pointer=await activate('simulation-retry','recovery',false,true);
            await poll(()=>evaluate(`document.querySelector('[data-pokie-lifecycle-result=simulation]').getAttribute('data-pokie-lifecycle-terminal')===${JSON.stringify(status)}`));
            const request=await poll(()=>cdp.events.slice(cursor).find(event=>event.method==='Network.requestWillBeSent'&&event.params.request.method==='POST'&&event.params.request.url.endsWith('/api/project/simulations')));
            const terminal={status,jobId:dashboardJob.id,result:dashboardJob,resultSha256:hash(JSON.stringify(dashboardJob))};
            const transaction={operation:'simulation-retry',stateClass:'recovery-operation',control:{stableControlId:'simulation-retry'},confirmation:{required:false,state:'not-required'},pointerActivations:[pointer],keyboardActivations:[],requestCount:1,request:{browserRequestId:request.params.requestId,method:'POST',path:'/api/project/simulations'},terminal:{...terminal,causedByRequestId:request.params.requestId}};
            transaction.postTransitionRenderedState=await poll(()=>observeP805PointerTerminal(evaluate,transaction,terminal));
            assert.equal(hasP805LiveDomActivation({control:{id:'simulation-retry'},interaction:{activation:'pointer',pointerActivated:true},transaction,request:transaction.request,terminal,elapsedMs:Date.now()-start}),true);
            if(status==='completed')validateP805RetryTerminalReceipt({operation:'simulation-retry',controlId:'simulation-retry',stateClass:'recovery-operation',transaction});
        }
        accepted.forEach((receipt,index)=>assert.equal(JSON.stringify(receipt),snapshots[index]));
    } finally {
        cdp?.close();browser?.kill('SIGTERM');if(exited)await exited;
        await server.close();await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100});
    }
}

test('native delivery reflow survives restored Simulation cancellation, dismissal, failed Retry, completed Retry and Replay Artifact recovery',()=>{
    try{execFileSync(process.execPath,['--input-type=module','-e',`
        import assert from 'node:assert/strict';import {spawn} from 'node:child_process';
        import {mkdtemp,readFile,rm} from 'node:fs/promises';import {createHash} from 'node:crypto';
        import {tmpdir} from 'node:os';import path from 'node:path';
        import {activateP805FocusedControl,setP805ReplayArtifactInput,hasP805NativeActivation,connectP805Devtools,observeP805PointerTerminal,validateP805RetryTerminalReceipt} from './scripts/p8-05-valera-browser-audit.mjs';
        import {hasP805LiveDomActivation} from './scripts/p8-05-product-readiness-campaign.mjs';
        import {projectP805PersonaAudit} from './scripts/p8-05-persona-projection.mjs';
        const hash=${hash.toString()};const poll=${poll.toString()};${launchFocusedBrowser.toString()}
        await (${runProductionPointerReflow.toString()})();
    `],{cwd:process.cwd(),encoding:'utf8',stdio:'pipe',timeout:60_000});}
    catch(error){throw new Error(`Production pointer reflow failed: ${error.stderr||error.message}`);}
},65_000);

test("the production phone drawer returns from Replay recovery through Design, dirty-draft Projects and Stay", () => {
    // Vite's native resolver needs Node's own RegExp realm, rather than Jest's
    // VM realm. The child owns and drains this one focused browser/server.
    try {execFileSync(process.execPath,["--input-type=module","-e",`
        import assert from 'node:assert/strict';
        import {spawn} from 'node:child_process';
        import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
        import {createHash} from 'node:crypto';
        import {tmpdir} from 'node:os';
        import path from 'node:path';
        import {navigateP805RenderedControl,activateP805FocusedControl,setP805ReplayArtifactInput,hasP805NativeActivation,connectP805Devtools,observeP805NavigationReadiness,saveP805RenderedWorkflowEvidence} from './scripts/p8-05-valera-browser-audit.mjs';
        import {P805_REQUIRED_EVIDENCE_KINDS,validateP805AuditEvidenceKinds} from './scripts/p8-05-product-readiness-campaign.mjs';
        import {projectP805PersonaAudit} from './scripts/p8-05-persona-projection.mjs';
        const hash=${hash.toString()};
        const poll=${poll.toString()};
        ${launchFocusedBrowser.toString()}
        await (${runProductionDrawerRecovery.toString()})();
    `],{cwd:process.cwd(),encoding:"utf8",stdio:"pipe",timeout:60_000});}
    catch(error){throw new Error(`Production drawer recovery failed: ${error.stderr || error.message}`);}
},65_000);

test("the live DevTools collector retains exact request completion without retaining data notifications", async () => {
    const targetUrls = [], commands = [];
    const initialUrl = "http://localhost/#/home/design";
    const server = createServer((request, response) => {
        targetUrls.push(decodeURIComponent(request.url.split("?")[1]));
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({webSocketDebuggerUrl:`ws://127.0.0.1:${server.address().port}`}));
    });
    const sockets = new WebSocketServer({server});
    const lifecycle = [
        {method:"Network.requestWillBeSent", params:{requestId:"validation-1", request:{method:"POST", url:"http://localhost/api/home/blueprints/validate"}}},
        {method:"Network.responseReceived", params:{requestId:"validation-1", response:{status:200, url:"http://localhost/api/home/blueprints/validate"}}},
        {method:"Network.loadingFinished", params:{requestId:"unrelated", encodedDataLength:10}},
        {method:"Network.loadingFinished", params:{requestId:"validation-1", encodedDataLength:29}},
        {method:"Network.loadingFailed", params:{requestId:"failed-validation", errorText:"net::ERR_ABORTED"}},
        {method:"Runtime.exceptionThrown", params:{exceptionDetails:{text:"diagnostic"}}},
        {method:"Log.entryAdded", params:{entry:{text:"diagnostic"}}},
    ];
    sockets.on("connection", (socket) => socket.on("message", (raw) => {
        const command = JSON.parse(raw.toString());
        commands.push(command.method);
        if (command.method === "Page.navigate") {
            assert.equal(command.params.url, initialUrl);
            assert.deepEqual(commands, ["Page.enable", "Runtime.enable", "Log.enable", "Network.enable", "Runtime.evaluate", "Page.navigate"]);
            for (let index = 0; index < 100; index += 1) socket.send(JSON.stringify({method:"Network.dataReceived", params:{requestId:"validation-1", dataLength:1}}));
            for (const event of lifecycle) socket.send(JSON.stringify(event));
        }
        socket.send(JSON.stringify({id:command.id, result:command.method === "Runtime.evaluate" ? {result:{value:true}} : {}}));
    }));
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    let cdp;
    try {
        cdp = await connectP805Devtools(`http://127.0.0.1:${server.address().port}`, initialUrl);
        assert.deepEqual(targetUrls, ["about:blank"], "the production initialUrl path must instrument a blank target first");
        assert.equal(commands.at(-1), "Page.navigate");
        assert.deepEqual(cdp.events, lifecycle);
    } finally {
        await cdp?.close();
        await new Promise((resolve) => sockets.close(resolve));
        await new Promise((resolve) => server.close(resolve));
    }
});

const validationRequest = (requestId) => ({method:"Network.requestWillBeSent", params:{requestId, request:{method:"POST", url:"http://localhost/api/home/blueprints/validate"}}});
const validationResponse = (requestId, status = 200) => ({method:"Network.responseReceived", params:{requestId, response:{status, url:"http://localhost/api/home/blueprints/validate"}}});
const completion = (requestId) => ({method:"Network.loadingFinished", params:{requestId}});

test("unrelated completion and an older late response cannot authorize the latest validation", async () => {
    const cdp = {events:[validationRequest("older"), validationResponse("older"), completion("older"), validationRequest("latest"), validationResponse("latest"), validationResponse("older"), completion("unrelated")]};
    const unexpectedRead = () => assert.fail("pending validation must not read a body or focus a control");
    assert.equal(await observeP805CreatorValidation(cdp, unexpectedRead, unexpectedRead), false);
});

test("failed and invalid validation cannot authorize Create game", async () => {
    const unexpectedFocus = () => assert.fail("rejected validation must not focus Create game");
    const cdp = {events:[validationRequest("failed"), {method:"Network.loadingFailed", params:{requestId:"failed", errorText:"net::ERR_ABORTED"}}]};
    await assert.rejects(observeP805CreatorValidation(cdp, unexpectedFocus, unexpectedFocus), /failed to complete/);
    for (const [status, payload] of [[500, {status:"ok"}], [200, {status:"invalid", errors:["invalid starter"]}]]) {
        cdp.events = [validationRequest("invalid"), validationResponse("invalid", status), completion("invalid")];
        await assert.rejects(observeP805CreatorValidation(cdp, unexpectedFocus, async (requestId) => {
            assert.equal(requestId, "invalid");
            return {body:JSON.stringify(payload)};
        }), /did not accept the starter game/);
    }
});

test("body decoding preserves exact bytes and rejects a validation superseded during observation", async () => {
    const cdp = {events:[validationRequest("selected"), validationResponse("selected"), completion("selected")]};
    const bytes = '{ "status": "ok", "warnings": [] }';
    const control = {stableControlId:"blueprint-create-game", validationState:"ok"};
    const readBody = async (requestId) => {
        assert.equal(requestId, "selected");
        return {body:Buffer.from(bytes).toString("base64"), base64Encoded:true};
    };
    const ready = await observeP805CreatorValidation(cdp, async () => control, readBody);
    assert.equal(ready.validation.bodySha256, hash(bytes));
    assert.equal(ready.validation.responseSha256, hash(JSON.stringify(JSON.parse(bytes))));
    assert.notEqual(ready.validation.bodySha256, ready.validation.responseSha256);
    assert.equal(await observeP805CreatorValidation(cdp, async () => {
        cdp.events.push(validationRequest("superseding"));
        return control;
    }, readBody), false);
});

test("production initialUrl captures immediate automatic validation before one native pointer and Overview, including project switching", async () => {
    const requests = [];
    const body = JSON.stringify({status:"ok", warnings:[]});
    const server = createServer((request, response) => {
        requests.push({method:request.method, path:request.url});
        if (request.url === "/api/home/blueprints/validate") {
            response.writeHead(200, {"Content-Type":"application/json"});
            response.end(body);
        } else if (request.url === "/api/home/blueprints/save-managed") {
            response.writeHead(201, {"Content-Type":"application/json"});
            response.end(JSON.stringify({status:"ok", path:"starter.json"}));
        } else {
            response.setHeader("Content-Type", "text/html");
            response.end(`<!doctype html><style>:root { --mantine-scale: 1; }${nativeButtonStyles}</style><button class="mantine-active" id="blueprint-create-game" data-pokie-validation-state="loading" aria-busy="true" disabled><span>Create game</span></button><div role="status" data-pokie-lifecycle-result="navigation" data-pokie-lifecycle-route="overview" data-pokie-lifecycle-result-control="project-tab:overview" data-pokie-lifecycle-terminal="loading"></div><script>
                const button = document.getElementById('blueprint-create-game');
                window.activations = [];
                button.addEventListener('click', async (event) => {
                    window.activations.push({trusted:event.isTrusted, controlId:event.currentTarget.id});
                    button.disabled = true;
                    button.setAttribute('aria-busy', 'true');
                    const response = await fetch('/api/home/blueprints/save-managed', {method:'POST', body:'{}'});
                    if (response.status === 201) {
                        location.hash = '/project/starter/overview';
                        button.remove();
                        document.querySelector('[role=status]').textContent = 'Overview';
                        if (location.pathname !== '/withheld/') document.querySelector('[role=status]').dataset.pokieLifecycleTerminal = 'rendered';
                    }
                });
                fetch('/api/home/blueprints/validate', {method:'POST', body:'{"game":"starter"}'})
                    .then((response) => response.json()).then((payload) => {
                        button.dataset.pokieValidationState = payload.status;
                        button.removeAttribute('aria-busy');
                        button.disabled = false;
                    });
            </script>`);
        }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const profile = await mkdtemp(path.join(tmpdir(), "p805-devtools-initial-url-"));
    const {browser, exited, waitForPort} = launchFocusedBrowser(profile);
    let cdp;
    try {
        const initialUrl = `http://127.0.0.1:${server.address().port}/#/home/design`;
        cdp = await connectP805Devtools(`http://127.0.0.1:${await waitForPort()}`, initialUrl);
        const evaluate = async (expression) => {
            const result = await cdp.send("Runtime.evaluate", {expression, returnByValue:true, awaitPromise:true});
            assert.equal(result.exceptionDetails, undefined);
            return result.result.value;
        };
        const validationIds = [];
        for (const phase of ["startup", "project-switch"]) {
            const cursor = phase === "startup" ? 0 : cdp.events.length;
            if (phase === "project-switch") await cdp.send("Page.navigate", {url:initialUrl.replace("/#/", "/switch/#/")});
            const observations = [];
            const created = await createP805RenderedGame(cdp, evaluate, observations, 10_000,
                (requestId) => cdp.send("Network.getResponseBody", {requestId}), 10_000);
            const requestId = created.validation.browserRequestId;
            validationIds.push(requestId);
            const events = cdp.events.slice(cursor);
            const validationEvents = events.filter((event) => event.params.requestId === requestId);
            assert.deepEqual(validationEvents.map((event) => event.method), ["Network.requestWillBeSent", "Network.responseReceived", "Network.loadingFinished"]);
            assert.equal(created.validation.completed, true);
            assert.equal(created.validation.bodySha256, hash(body));
            assert.deepEqual(observations.map((observation) => observation.kind), ["validation-ready", "pointer-dispatch", "dashboard-transition"]);
            assert.equal(observations[1].count, 1);
            assert.equal(observations[1].pressed && observations[1].released, true);
            assert.equal(observations[1].hitTest.matchesCapturedControl, true);
            assert.equal(observations[1].nativeDispatch.focus.trusted, true);
            assert.equal(observations[1].nativeDispatch.focus.validationState, "ok");
            assert.equal(observations[1].nativeDispatch.focus.enabled, true);
            assert.equal(observations[1].nativeDispatch.focus.ariaBusy, null);
            assert.equal(hasP805NativeActivation(created.activation, "blueprint-create-game"), true);
            const pressed = created.activation.dispatch.eventBindings[0];
            assert.equal(pressed.regionMatchesMeasured, false, "the receipt retains the observed pressed rectangle");
            assert.equal(pressed.regionMatchesCapturedPress, true);
            assert.equal(pressed.pressFeedback.active, true);
            assert.deepEqual(pressed.pressFeedback.matrix, [1, 0, 0, 1, 0, 1]);
            assert.equal(pressed.region.top, created.activation.hitTest.region.top + 1);
            assert.deepEqual(await evaluate("window.activations"), [{trusted:true, controlId:"blueprint-create-game"}]);
            assert.equal(created.dashboard.route, "#/project/starter/overview");
            assert.equal(created.dashboard.overview, true);
            assert.equal(created.dashboard.terminal, "rendered");
            assert.equal(created.dashboard.visible, true);
            assert.equal(events.filter((event) => event.method === "Network.requestWillBeSent" && new URL(event.params.request.url).pathname === "/api/home/blueprints/save-managed").length, 1);
        }
        assert.notEqual(validationIds[0], validationIds[1], "a project switch must obtain its own validation proof");
        assert.equal(requests.filter(({path}) => path === "/api/home/blueprints/validate").length, 2);
        assert.equal(requests.filter(({path}) => path === "/api/home/blueprints/save-managed").length, 2);
        // A route and tab label can appear before the dashboard is ready.
        // Withhold that rendered terminal after a real native Create click:
        // failure must retain its dispatch receipt and never click again.
        await cdp.send("Page.navigate", {url:initialUrl.replace("/#/", "/withheld/#/")});
        const observations = [];
        await assert.rejects(createP805RenderedGame(cdp, evaluate, observations, 10_000,
            (requestId) => cdp.send("Network.getResponseBody", {requestId}), 100),
        /Failed post-click Create game Overview\/dashboard transition/);
        assert.deepEqual(observations.map((observation) => observation.kind), ["validation-ready", "pointer-dispatch"]);
        assert.equal(observations[1].nativeDispatch.focus.trusted, true);
        assert.equal(observations[1].count, 1);
        assert.deepEqual(await evaluate("window.activations"), [{trusted:true, controlId:"blueprint-create-game"}]);
        assert.equal(requests.filter(({path}) => path === "/api/home/blueprints/save-managed").length, 3);
    } finally {
        await cdp?.close();
        browser.kill("SIGTERM");
        await exited;
        await new Promise((resolve) => server.close(resolve));
        await rm(profile, {recursive:true, force:true, maxRetries:10, retryDelay:100});
    }
}, 60_000);

test("completed browser validation binds rendered readiness before one native Create game activation", async () => {
    // This small protocol fixture exercises Chromium's real body completion,
    // DOM state, and trusted native activation. It does not build or run the
    // controller-owned packed Studio persona proof.
    const body = JSON.stringify({status:"ok", warnings:[]});
    const requests = [];
    let pendingBody;
    const server = createServer((request, response) => {
        requests.push({method:request.method, path:request.url});
        if (request.url === "/api/home/blueprints/validate") {
            response.setHeader("Content-Type", "application/json");
            response.write(body.slice(0, 12));
            pendingBody = response;
        } else if (request.url === "/api/home/blueprints/save-managed") {
            response.writeHead(201, {"Content-Type":"application/json"});
            response.end(JSON.stringify({status:"ok", path:"starter.json"}));
        } else {
            response.setHeader("Content-Type", "text/html");
            response.end(`<!doctype html><button id="blueprint-create-game" data-pokie-validation-state="idle">Create game</button><div role="status"></div><script>
                const button = document.getElementById('blueprint-create-game');
                const status = document.querySelector('[role=status]');
                window.activations = [];
                button.addEventListener('click', async (event) => {
                    window.activations.push({trusted:event.isTrusted, controlId:event.currentTarget.id});
                    button.disabled = true;
                    const response = await fetch('/api/home/blueprints/save-managed', {method:'POST', body:'{}'});
                    if (response.status === 201) location.hash = '/project/starter/overview';
                });
                window.beginValidation = async () => {
                    button.disabled = true;
                    button.dataset.pokieValidationState = 'loading';
                    const response = await fetch('/api/home/blueprints/validate', {method:'POST', body:'{"game":"starter"}'});
                    window.validationPayload = await response.json();
                };
                window.renderValidation = () => {
                    button.dataset.pokieValidationState = window.validationPayload.status;
                    status.textContent = 'Valid — no issues found.';
                    button.disabled = false;
                };
            </script>`);
        }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const profile = await mkdtemp(path.join(tmpdir(), "p805-devtools-validation-"));
    const {browser, exited, waitForPort} = launchFocusedBrowser(profile);
    let cdp;
    try {
        const port = await waitForPort();
        cdp = await connectP805Devtools(`http://127.0.0.1:${port}`);
        const evaluate = async (expression) => {
            const result = await cdp.send("Runtime.evaluate", {expression, returnByValue:true, awaitPromise:true});
            assert.equal(result.exceptionDetails, undefined);
            return result.result.value;
        };
        const bodyReads = [];
        const readBody = async (requestId) => {
            bodyReads.push(requestId);
            return cdp.send("Network.getResponseBody", {requestId});
        };
        const observe = () => observeP805CreatorValidation(cdp, evaluate, readBody);
        await cdp.send("Page.navigate", {url:`http://127.0.0.1:${server.address().port}/#/home/design`});
        await poll(() => evaluate("document.readyState === 'complete' && typeof window.beginValidation === 'function'"));
        assert.equal(await observe(), false, "the enabled idle debounce window is not validated readiness");
        await evaluate("void window.beginValidation()");
        const request = await poll(() => cdp.events.find((event) => event.method === "Network.requestWillBeSent" && event.params.request.url.endsWith("/api/home/blueprints/validate")));
        const requestId = request.params.requestId;
        const response = await poll(() => cdp.events.find((event) => event.method === "Network.responseReceived" && event.params.requestId === requestId));
        assert.equal(response.params.response.status, 200);
        assert.equal(await observe(), false, "headers cannot stand in for completed response bytes");
        assert.deepEqual(bodyReads, []);
        pendingBody.end(body.slice(12));
        const completed = await poll(() => cdp.events.find((event) => event.method === "Network.loadingFinished" && event.params.requestId === requestId));
        assert.equal(completed.params.requestId, requestId);
        await poll(() => evaluate("window.validationPayload?.status === 'ok'"));
        assert.equal(await observe(), false, "a completed body cannot stand in for its rendered state");
        await evaluate("window.renderValidation()");
        await evaluate("document.getElementById('blueprint-create-game').disabled = true");
        assert.equal(await observe(), false, "a disabled rendered action cannot be activated");
        await evaluate("document.getElementById('blueprint-create-game').disabled = false");
        const ready = await observe();
        assert.deepEqual(ready, {
            control:{stableControlId:"blueprint-create-game", validationState:"ok"},
            validation:{browserRequestId:requestId, payload:JSON.parse(body), status:200, completed:true, bodySha256:hash(body), responseSha256:hash(body), renderedValidation:{controlId:"blueprint-create-game", status:"ok"}},
        });
        assert.ok(bodyReads.length > 0 && bodyReads.every((id) => id === requestId));
        assert.equal(request.params.request.method, "POST");
        assert.equal(request.params.request.postData, '{"game":"starter"}');
        const activationCursor = cdp.events.length;
        await pressP805Enter(cdp);
        await poll(() => evaluate("location.hash === '#/project/starter/overview'"));
        const saved = await poll(() => cdp.events.slice(activationCursor).find((event) => event.method === "Network.responseReceived" && event.params.response.url.endsWith("/api/home/blueprints/save-managed")));
        assert.equal(saved.params.response.status, 201);
        assert.deepEqual(await evaluate("window.activations"), [{trusted:true, controlId:ready.control.stableControlId}]);
        assert.equal(requests.filter(({path}) => path === "/api/home/blueprints/validate").length, 1);
        assert.equal(requests.filter(({method, path}) => method === "POST" && path === "/api/home/blueprints/save-managed").length, 1);
        assert.equal(cdp.events.slice(activationCursor).filter((event) => event.method === "Network.requestWillBeSent" && event.params.request.url.endsWith("/api/home/blueprints/save-managed")).length, 1);
    } finally {
        pendingBody?.end();
        await cdp?.close();
        browser.kill("SIGTERM");
        await exited;
        await new Promise((resolve) => server.close(resolve));
        await rm(profile, {recursive:true, force:true, maxRetries:10, retryDelay:100});
    }
});


test("Blueprint mutation receipts follow each public endpoint's HTTP and domain terminal contract", () => {
    for (const [pathname, status] of [["/api/home/blueprints/validate", 200], ["/api/home/blueprints/save", 201]]) {
        const payload = {status:"ok"};
        assert.equal(validateP805BlueprintMutationResponse(pathname, status, payload), payload);
        for (const rejectedStatus of [200, 201, 409, 500].filter((value) => value !== status)) {
            assert.throws(() => validateP805BlueprintMutationResponse(pathname, rejectedStatus, payload), /did not reach a successful terminal/);
        }
        for (const rejected of ["conflict", "error", "invalid"]) {
            assert.throws(() => validateP805BlueprintMutationResponse(pathname, status, {status:rejected}), /did not reach a successful terminal/);
        }
    }
    assert.throws(() => validateP805BlueprintMutationResponse("/unrelated", 201, {status:"ok"}), /did not reach a successful terminal/);
});

test("native navigation waits for rendered context and Retry retains captured identity through deferred layout and terminal replacement", async () => {
    const requests = [];
    const importedRuntimeRoot = "/games/Generated imported runtime";
    let pendingContext;
    const server = createServer((request, response) => {
        requests.push({method:request.method, path:request.url});
        if (request.url === "/api/project/context") {
            pendingContext = response;
            response.writeHead(200, {"Content-Type":"application/json"});
            response.write('{"status":');
        } else if (request.url === "/overview-validation") {
            response.setHeader("Content-Type", "text/html");
            response.end(`<!doctype html><style>body{margin:0}#project-tab\\:gameModel{position:fixed;left:16px;top:116.796875px;width:227px;height:40.796875px}</style>
                <button type="button" id="project-tab:gameModel" data-pokie-lifecycle="navigation" data-pokie-lifecycle-route="gameModel"><div>Game Model</div></button>
                <p data-pokie-lifecycle-result="navigation" data-pokie-lifecycle-route="overview" data-pokie-lifecycle-result-control="project-tab:overview" data-pokie-lifecycle-terminal="rendered">Overview ready</p>
                <div id="validation" data-pokie-lifecycle-result="project-validation" data-pokie-lifecycle-result-control="project-validation-run" data-pokie-lifecycle-terminal="idle">Checking project…</div>
                <script>
                    location.hash='#/project/source/overview';
                    window.navigationActivations=[];
                    window.finishValidation=(status='completed')=>{
                        const validation=document.getElementById('validation');
                        validation.style.height='1200px';
                        validation.textContent=status==='error'?'Could not check project. Re-check project.':'Valid, with warnings. Integrity information.';
                        validation.setAttribute('data-pokie-lifecycle-terminal',status);
                    };
                    document.getElementById('project-tab:gameModel').addEventListener('click',(event)=>{
                        window.navigationActivations.push({trusted:event.isTrusted,controlId:event.currentTarget.id});
                        location.hash='#/project/source/gameModel';
                    });
                </script>`);
        } else if (request.url === "/navigation-readiness") {
            response.setHeader("Content-Type", "text/html");
            response.end(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><button type="button" id="studio-navigation-toggle" aria-label="Toggle navigation" aria-controls="studio-navigation-panel" aria-expanded="false" style="position:fixed;top:8px;left:8px">Toggle navigation</button><button id="other-target" style="position:fixed;top:8px;right:8px">Other</button><div id="studio-navigation-panel" style="position:fixed;top:60px;transform:translateX(-260px)"></div><script>
                location.hash = '#/project/source/overview';
                window.navigationActivations = [];
                window.drawerActivations = [];
                window.initialBurger = document.getElementById('studio-navigation-toggle');
                window.mountTarget = () => {
                    document.getElementById('studio-navigation-panel').innerHTML = '<button id="project-tab:gameModel" data-pokie-lifecycle="navigation" data-pokie-lifecycle-route="gameModel">Game Model</button><button id="project-tab:simulation" data-pokie-lifecycle="navigation" data-pokie-lifecycle-route="simulation">Simulation</button>';
                    for (const tab of document.querySelectorAll('[data-pokie-lifecycle="navigation"]')) tab.addEventListener('click', (event) => {
                        window.navigationActivations.push({trusted:event.isTrusted,controlId:event.currentTarget.id});
                        const route = tab.getAttribute('data-pokie-lifecycle-route');
                        location.hash = '#/project/source/' + route;
                        const result = document.getElementById('navigation-result');
                        result.setAttribute('data-pokie-lifecycle-route', route);
                        result.setAttribute('data-pokie-lifecycle-result-control', 'project-tab:' + route);
                        document.getElementById('studio-navigation-panel').style.transform = 'translateX(-260px)';
                        const burger = document.getElementById('studio-navigation-toggle');
                        burger.setAttribute('aria-expanded', 'false');burger.focus({preventScroll:true});
                    });
                    document.body.insertAdjacentHTML('beforeend', '<p id="navigation-result" data-pokie-lifecycle-result="navigation" data-pokie-lifecycle-route="overview" data-pokie-lifecycle-result-control="project-tab:overview" data-pokie-lifecycle-terminal="loading">Opening game</p>');
                };
                window.beginContext = async () => { window.context = await (await fetch('/api/project/context')).json(); };
                window.renderContext = () => {
                    const burger = window.initialBurger.cloneNode(true);
                    window.initialBurger.replaceWith(burger);
                    burger.addEventListener('click', (event) => {
                        window.drawerActivation = {trusted:event.isTrusted, controlId:event.currentTarget.id};
                        window.drawerActivations.push(window.drawerActivation);
                        burger.setAttribute('aria-expanded', 'true');
                        document.getElementById('studio-navigation-panel').style.transform = 'none';
                    });
                    const result = document.getElementById('navigation-result');
                    result.textContent = 'Overview ready';
                    result.setAttribute('data-pokie-lifecycle-terminal', 'rendered');
                };
            </script>`);
        } else if (request.url === "/api/home/projects/open") {
            response.writeHead(200, {"Content-Type":"application/json"});
            response.end(JSON.stringify({context:{projectRoot:importedRuntimeRoot}}));
        } else if (request.url === "/api/project/simulations") {
            response.writeHead(202, {"Content-Type":"application/json"});
            response.end(JSON.stringify({id:"retry-job", status:"queued"}));
        } else if (request.url === "/api/project/simulations/retry-job") {
            response.setHeader("Content-Type", "application/json");
            response.end(JSON.stringify({id:"retry-job", status:"completed", reportPath:"report.json"}));
        } else {
            response.setHeader("Content-Type", "text/html");
            response.end(`<!doctype html><style>:root { --mantine-scale: 1; }${nativeButtonStyles}</style><div style="display:inline-block"><button id="simulation-retry">Repeat simulation</button></div><div id="simulation-results" tabindex="-1"></div><script>
                const button = document.getElementById('simulation-retry');
                const result = document.getElementById('simulation-results');
                const mode = new URL(location.href).searchParams.get('mode');
                window.activations = [];
                if (['active-press', 'active-scaled-press', 'late-layout-shift', 'late-transform-shift', 'late-feedback-scale'].includes(mode)) {
                    button.classList.add('mantine-active');
                    button.innerHTML = '<span id="retry-label">Repeat simulation</span>';
                }
                if (mode === 'active-scaled-press') {
                    document.documentElement.style.fontSize = '20px';
                    document.documentElement.style.setProperty('--mantine-scale', '1.5');
                }
                if (mode === 'detached-dispatch-label') {
                    button.style.cssText = 'width:125px;height:24px';
                    button.innerHTML = '<span id="retry-label">Repeat simulation</span>';
                    // The browser retains the button in its native event path
                    // after an earlier public handler detaches the hit label.
                    document.addEventListener('click', (event) => {
                        if (event.target !== button && button.contains(event.target)) event.target.remove();
                    }, true);
                }
                if (mode === 'retargeted-dispatch-region') button.addEventListener('pointerdown', (event) => button.parentElement.setPointerCapture(event.pointerId));
                if (mode === 'dispatch-focus-transfer') document.addEventListener('pointerdown', () => result.focus(), true);
                button.addEventListener('mouseover', () => {
                    if (mode === 'transient-hit' && !window.overlayShown) {
                        window.overlayShown = true;
                        const overlay = document.createElement('div');
                        overlay.style.cssText = 'position:fixed;inset:0;z-index:1000';
                        document.body.append(overlay);
                        setTimeout(() => overlay.remove(), 180);
                    } else if (mode === 'lost-focus') result.focus();
                    else if (mode === 'changed-hit') {
                        const overlay = document.createElement('div');
                        overlay.style.cssText = 'position:fixed;inset:0;z-index:1000';
                        document.body.append(overlay);
                    } else if (mode === 'changed-node') {
                        button.replaceWith(button.cloneNode(true));
                    } else if (mode === 'disabled') button.disabled = true;
                    else if (mode.startsWith('moving')) {
                        // A portal/terminal transition can move the same live
                        // control between its initial capture and native press.
                        const animated = ['moving-parent', 'moving-deferred-parent'].includes(mode) ? button.parentElement : button;
                        if (mode === 'moving-deferred-parent') {
                            // Layout can commit on the next frame after hover;
                            // capture must settle that frame before native press.
                            requestAnimationFrame(() => requestAnimationFrame(() => { animated.style.transform = 'translateX(260px)'; }));
                            return;
                        }
                        animated.style.transform = 'translateX(260px)';
                        const animation = animated.animate([{transform:'translateX(180px)'}, {transform:'translateX(260px)'}], {duration:180});
                        if (mode === 'moving-obstructed') animation.finished.then(() => {
                            const overlay = document.createElement('div');
                            overlay.style.cssText = 'position:fixed;inset:0;z-index:1000';
                            document.body.append(overlay);
                        });
                    }
                });
                const activationRegion = mode === 'retargeted-dispatch-region' ? button.parentElement : button;
                activationRegion.addEventListener('click', async (event) => {
                    if (!event.isTrusted) return;
                    window.activations.push({trusted:event.isTrusted, controlId:button.id});
                    if (mode === 'replaced' || mode === 'moving-replaced') button.replaceWith(button.cloneNode(true));
                    if (mode === 'removed') button.remove();
                    result.focus();
                    const response = await fetch('/api/project/simulations', {method:'POST', body:'{}'});
                    const started = await response.json();
                    window.terminal = await (await fetch('/api/project/simulations/' + started.id)).json();
                });
                window.renderTerminal = (jobId = window.terminal.id) => {
                    result.textContent = 'Simulation completed. Open report.json';
                    for (const [name, value] of Object.entries({
                        'data-pokie-lifecycle-result':'simulation',
                        'data-pokie-lifecycle-result-control':'simulation-retry',
                        'data-pokie-lifecycle-result-operation':'simulation-retry',
                        'data-pokie-lifecycle-result-state':'recovery-operation',
                        'data-pokie-lifecycle-terminal':window.terminal.status,
                        'data-pokie-lifecycle-result-receipt':'durable-terminal',
                        'data-pokie-lifecycle-result-durable-status':window.terminal.status,
                        'data-pokie-lifecycle-result-job':jobId,
                        'data-pokie-lifecycle-result-durable-job':jobId,
                    })) result.setAttribute(name, value);
                };
            </script>`);
        }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const profile = await mkdtemp(path.join(tmpdir(), "p805-devtools-retry-"));
    const {browser, exited, waitForPort} = launchFocusedBrowser(profile);
    let cdp;
    try {
        const port = await waitForPort();
        cdp = await connectP805Devtools(`http://127.0.0.1:${port}`);
        const evaluate = async (expression) => {
            const result = await cdp.send("Runtime.evaluate", {expression, returnByValue:true, awaitPromise:true});
            assert.equal(result.exceptionDetails, undefined);
            return result.result.value;
        };
        await cdp.send("Emulation.setDeviceMetricsOverride", {width:1440,height:900,mobile:false,deviceScaleFactor:1});
        const overviewUrl=`http://127.0.0.1:${server.address().port}/overview-validation`;
        const loadOverview=async()=>{
            await cdp.send("Page.navigate",{url:overviewUrl});
            await poll(()=>evaluate("document.readyState==='complete' && typeof window.finishValidation==='function' && location.hash==='#/project/source/overview'"));
        };
        await loadOverview();
        // Reproduce the saved native boundary: Overview's shell is terminal,
        // but its validation can add a scrollbar after the final measurement.
        let failedBoundary;
        await assert.rejects(()=>activateP805FocusedControl({send:async(method,params)=>{
            if(method==='Input.dispatchMouseEvent'&&params.type==='mousePressed'){
                await evaluate("window.finishValidation()");
                await poll(()=>evaluate("visualViewport.width===1425"));
            }
            return cdp.send(method,params);
        }},evaluate,"navigation",{stableControlId:"project-tab:gameModel"}), (error)=>{
            assert.match(error.message,/lost native focus or its captured hit target at pointer dispatch/);
            failedBoundary=JSON.parse(error.message.split('; captured boundary: ')[1]);
            return true;
        });
        assert.equal(failedBoundary.hitTest.visualViewport.width,1440);
        assert.equal(failedBoundary.dispatch.eventBindings[0].visualViewport.width,1425);
        assert.equal(failedBoundary.dispatch.eventBindings[0].regionMatchesMeasured,true);
        assert.equal(failedBoundary.dispatch.eventBindings[0].hitMatchesCapturedControl,true);
        assert.equal(failedBoundary.preDispatchFocus.native,true);
        assert.deepEqual(await evaluate("[window.__p805CapturedControls.size,window.__p805PointerDispatchReceipts.size]"),[0,0]);
        // The public navigation path must hold capture until this independent
        // rendered validation is terminal, including a recoverable error.
        for(const status of ['completed','error']){
            await loadOverview();
            assert.equal(await observeP805NavigationReadiness(evaluate,'gameModel'),false,'idle Overview validation cannot authorize pointer capture');
            await evaluate("document.getElementById('validation').setAttribute('data-pokie-lifecycle-terminal','loading')");
            assert.equal(await observeP805NavigationReadiness(evaluate,'gameModel'),false,'a rendered shell cannot substitute for pending validation');
            assert.deepEqual(await evaluate('window.navigationActivations'),[]);
            await evaluate(`window.finishValidation(${JSON.stringify(status)})`);
            await poll(()=>evaluate("visualViewport.width===1425"));
            const ready=await observeP805NavigationReadiness(evaluate,'gameModel');
            assert.deepEqual(ready,{controlId:'project-tab:gameModel',currentRoute:'#/project/source/overview',terminal:'rendered'});
            const activation=await activateP805FocusedControl(cdp,evaluate,'navigation',{stableControlId:ready.controlId});
            assert.equal(hasP805NativeActivation(activation,'project-tab:gameModel'),true);
            assert.equal(activation.hitTest.visualViewport.width,1425);
            for(const binding of activation.dispatch.eventBindings){
                assert.equal(binding.viewportMatchesMeasured,true);
                assert.deepEqual(binding.visualViewport,activation.hitTest.visualViewport);
            }
            assert.deepEqual(await evaluate('window.navigationActivations'),[{trusted:true,controlId:'project-tab:gameModel'}]);
            assert.equal(await evaluate('location.hash'),'#/project/source/gameModel');
            const staleViewport=structuredClone(activation);
            staleViewport.hitTest.visualViewport.width=1440;
            assert.equal(hasP805NativeActivation(staleViewport,'project-tab:gameModel'),false,'the repair must preserve exact viewport binding');
        }
        await cdp.send("Emulation.setDeviceMetricsOverride", {width:390, height:844, mobile:true, deviceScaleFactor:1});
        await cdp.send("Page.navigate", {url:`http://127.0.0.1:${server.address().port}/navigation-readiness`});
        await poll(() => evaluate("typeof window.renderContext === 'function' && document.readyState === 'complete'"));
        const navigationReady = () => observeP805NavigationReadiness(evaluate, "gameModel");
        assert.equal(await navigationReady(), false, "the imported route and shell cannot authorize drawer capture");
        await evaluate("window.mountTarget(); void window.beginContext()");
        await poll(() => pendingContext);
        assert.equal(await navigationReady(), false, "an off-canvas target cannot replace terminal context");
        pendingContext.end('"loaded","projectRoot":"source"}');
        await poll(() => evaluate("window.context?.status === 'loaded'"));
        assert.equal(await navigationReady(), false, "completed context bytes cannot replace their rendered terminal state");
        await evaluate("window.renderContext()");
        assert.deepEqual(await navigationReady(), {controlId:"project-tab:gameModel", currentRoute:"#/project/source/overview", terminal:"rendered"});
        await evaluate("document.getElementById('project-tab:gameModel').disabled = true");
        assert.equal(await navigationReady(), false, "a disabled dependent tab cannot authorize capture");
        await evaluate("document.getElementById('project-tab:gameModel').disabled = false; document.getElementById('navigation-result').hidden = true");
        assert.equal(await navigationReady(), false, "a hidden terminal cannot authorize capture");
        await evaluate("document.getElementById('navigation-result').hidden = false");
        assert.equal(await evaluate("window.initialBurger.isConnected"), false);
        const navigationCommands = [];
        const navigationDispatcher = {send:async(method, params) => {navigationCommands.push({method,...params});return cdp.send(method,params);}};
        const navigation = await navigateP805RenderedControl(navigationDispatcher, evaluate, 'gameModel', '#/project/source/gameModel', 'simulation-success-failure-cancellation');
        const disclosure = navigation.control.navigationDisclosure;
        assert.equal(disclosure.kind, "keyboard");
        assert.equal(hasP805NativeActivation(disclosure, "studio-navigation-toggle"), true);
        assert.equal(disclosure.preDispatchFocus.native, true);
        assert.equal(disclosure.dispatch.clickCount, 1);
        assert.equal(disclosure.dispatch.focus.targetMatchesCapturedControl, true);
        assert.deepEqual(disclosure.dispatch.disclosure, {expandedBefore:'false',expandedAfter:'true',panelId:'studio-navigation-panel',routeBefore:'#/project/source/overview',routeAfter:'#/project/source/overview',identityPreserved:true,enabled:true,panelConnected:true});
        assert.deepEqual(navigationCommands.filter(({method})=>method==='Input.dispatchKeyEvent').map(({type,key})=>[type,key]),[['keyDown',' '],['keyUp',' ']]);
        assert.equal(navigation.activation.kind, 'pointer');
        assert.equal(hasP805NativeActivation(navigation.activation, 'project-tab:gameModel'), true);
        assert.equal(navigation.routeBefore, '#/project/source/overview');
        assert.equal(navigation.routeAfter, '#/project/source/gameModel');
        assert.deepEqual(await evaluate('window.navigationActivations'), [{trusted:true,controlId:'project-tab:gameModel'}]);
        assert.equal(await evaluate("document.getElementById('studio-navigation-toggle').getAttribute('aria-expanded')"), 'false');
        assert.deepEqual(await evaluate("window.drawerActivation"), {trusted:true, controlId:"studio-navigation-toggle"});
        // The retained finding occurred after the first terminal workflow,
        // when a closed drawer had to be opened again for the next simulation.
        const nextNavigation = await navigateP805RenderedControl(navigationDispatcher, evaluate, 'simulation', '#/project/source/simulation', 'simulation-success-failure-cancellation');
        assert.equal(hasP805NativeActivation(nextNavigation.control.navigationDisclosure,'studio-navigation-toggle'),true);
        assert.equal(hasP805NativeActivation(nextNavigation.activation,'project-tab:simulation'),true);
        assert.equal(nextNavigation.activation.kind,'pointer');
        assert.equal(nextNavigation.routeAfter,'#/project/source/simulation');
        assert.equal(await evaluate('window.drawerActivations.length'),2);
        assert.deepEqual(await evaluate('window.navigationActivations'),[{trusted:true,controlId:'project-tab:gameModel'},{trusted:true,controlId:'project-tab:simulation'}]);
        // A closing Mantine drawer still has visible, hit-testable tabs for
        // part of its transition. Reproduce the terminal-to-next-run boundary
        // with a delayed capture: DOM visibility must not authorize a tab
        // whose live disclosure already says closed.
        await evaluate(`(()=>{
            location.hash='#/project/source/gameModel';
            const result=document.getElementById('navigation-result');
            result.setAttribute('data-pokie-lifecycle-route','gameModel');
            result.setAttribute('data-pokie-lifecycle-result-control','project-tab:gameModel');
            const panel=document.getElementById('studio-navigation-panel');
            panel.style.transform='none';
            panel.getBoundingClientRect();
            panel.style.transition='transform 200ms linear';
            panel.style.transform='translateX(-260px)';
            document.getElementById('studio-navigation-toggle').setAttribute('aria-expanded','false');
        })()`);
        let delayedCapture=false;
        const delayedEvaluate=async(expression)=>{
            if(!delayedCapture&&expression.includes('window.__p805CapturedControls??=')){
                delayedCapture=true;
                await new Promise((resolve)=>setTimeout(resolve,250));
            }
            return evaluate(expression);
        };
        const returnToSimulation=await navigateP805RenderedControl(navigationDispatcher,delayedEvaluate,'simulation','#/project/source/simulation','simulation-success-failure-cancellation');
        assert.equal(delayedCapture,true);
        assert.equal(hasP805NativeActivation(returnToSimulation.control.navigationDisclosure,'studio-navigation-toggle'),true);
        assert.equal(hasP805NativeActivation(returnToSimulation.activation,'project-tab:simulation'),true);
        assert.equal(returnToSimulation.routeBefore,'#/project/source/gameModel');
        assert.equal(returnToSimulation.routeAfter,'#/project/source/simulation');
        assert.equal(await evaluate('window.drawerActivations.length'),3);
        assert.deepEqual(await evaluate('window.navigationActivations'),[{trusted:true,controlId:'project-tab:gameModel'},{trusted:true,controlId:'project-tab:simulation'},{trusted:true,controlId:'project-tab:simulation'}]);
        // Replay Artifact leaves the page scrolled to its terminal diagnostic.
        // The full-width phone drawer retains its own scroll position too.
        await cdp.send("Emulation.setDeviceMetricsOverride", {width:390,height:844,mobile:true,deviceScaleFactor:1});
        await evaluate(`(async()=>{
            location.hash='#/project/source/replay';
            const result=document.getElementById('navigation-result');
            result.setAttribute('data-pokie-lifecycle-route','replay');
            result.setAttribute('data-pokie-lifecycle-result-control','project-tab:replay');
            result.style.marginTop='1800px';result.scrollIntoView({block:'center'});
            const panel=document.getElementById('studio-navigation-panel');
            panel.style.cssText='position:fixed;top:60px;left:0;width:100%;height:calc(100dvh - 60px);overflow-y:auto;overscroll-behavior:contain;transform:translateX(-100%)';
            for(const tab of panel.querySelectorAll('button'))tab.style.cssText='display:block;width:100%;height:40px';
            panel.insertAdjacentHTML('afterbegin','<div style="height:900px;flex-shrink:0"></div>');
            panel.scrollTop=80;
            document.getElementById('studio-navigation-toggle').setAttribute('aria-expanded','false');
            await new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
            window.drawerScrollEvents=[];
            panel.addEventListener('scroll',()=>{
                window.drawerScrollEvents.push({moving:panel.getAnimations().some((animation)=>animation.playState==='running'),scrollTop:panel.scrollTop});
            });
            // A viewport pan/reflow can leave an opening drawer partly in
            // view before its native disclosure transition has finished.
            // Even measurable tabs must not scroll that moving container.
            document.getElementById('studio-navigation-toggle').addEventListener('click',()=>{
                panel.animate([{transform:'translateX(120px)'},{transform:'translateX(0px)'}],{duration:350});
            });
        })()`);
        const replayScroll = await evaluate('scrollY');
        const cancellationNavigation=await navigateP805RenderedControl(navigationDispatcher,evaluate,'simulation','#/project/source/simulation','cooperative cancellation');
        assert.equal(hasP805NativeActivation(cancellationNavigation.control.navigationDisclosure,'studio-navigation-toggle'),true);
        assert.equal(hasP805NativeActivation(cancellationNavigation.activation,'project-tab:simulation'),true);
        assert.equal(cancellationNavigation.routeBefore,'#/project/source/replay');
        assert.equal(cancellationNavigation.routeAfter,'#/project/source/simulation');
        assert.equal(await evaluate('scrollY'),replayScroll,'revealing a fixed drawer tab must scroll its own panel, preserving the terminal page viewport');
        const drawerScrollEvents=await evaluate('window.drawerScrollEvents');
        assert.ok(drawerScrollEvents.length>0 && drawerScrollEvents.at(-1).scrollTop>80,'the clipped tab is revealed through the actual drawer scrollport');
        assert.ok(drawerScrollEvents.every(({moving})=>moving===false),'disclosure geometry settles before scrolling its retained tab');
        await evaluate("document.getElementById('studio-navigation-panel').style.cssText='position:fixed;top:60px;transform:translateX(-260px)';document.getElementById('navigation-result').style.marginTop='';document.getElementById('studio-navigation-panel').firstElementChild.remove()");
        await cdp.send("Emulation.setDeviceMetricsOverride", {width:1440,height:900,mobile:false,deviceScaleFactor:1});
        for (const corrupt of [
            (value)=>{delete value.capturedControlId;},
            (value)=>{delete value.captureKey;},
            (value)=>{delete value.dispatch.eventBindings;},
            (value)=>{delete value.dispatch.bindingVersion;},
            (value)=>{value.dispatch.clickCount=2;},
            (value)=>{value.dispatch.key='Enter';},
            ...['trusted','targetMatchesCapturedControl','nativeFocus','capturedControlConnected','identityPreserved','enabled'].flatMap((field)=>[0,1,2].map((index)=>(value)=>{value.dispatch.eventBindings[index][field]=false;})),
            (value)=>{value.dispatch.eventBindings[0].repeat=true;},
            (value)=>{value.dispatch.eventBindings[1].targetId='other-target';},
            (value)=>{value.dispatch.eventBindings[2].detail=1;},
            ...['accessibleName','panelId','expanded'].map((field)=>(value)=>{value.dispatch.eventBindings[2][field]='wrong';}),
            ...['expandedBefore','expandedAfter','panelId','routeAfter','identityPreserved','enabled','panelConnected'].map((field)=>(value)=>{value.dispatch.disclosure[field]='wrong';}),
        ]) {
            const invalid=structuredClone(disclosure);corrupt(invalid);
            assert.equal(hasP805NativeActivation(invalid,'studio-navigation-toggle'),false,'disclosure receipts must retain the exact focused native activation and expanded panel');
        }
        for (const mode of ['disabled','unfocused','nonmatching-label','nonmatching-panel','already-expanded','replacement','late-disabled','late-unfocused','keyup-replacement','keyup-disabled','keyup-unfocused','synthetic-events','duplicate-keydown','duplicate-click','dispatch-failed','no-expansion','substitute-disclosure','route-mutation']) {
            await evaluate(`(()=>{
                const old=document.getElementById('studio-navigation-toggle'),item=old.cloneNode(true);old.replaceWith(item);
                item.disabled=false;item.setAttribute('aria-label','Toggle navigation');item.setAttribute('aria-controls','studio-navigation-panel');item.setAttribute('aria-expanded','false');item.focus({preventScroll:true});
                window.drawerActivations=[];location.hash='#/project/source/overview';
                item.addEventListener('click',(event)=>{
                    window.drawerActivations.push({trusted:event.isTrusted,controlId:event.currentTarget.id});
                    if(${JSON.stringify(mode)}==='substitute-disclosure'){const replacement=item.cloneNode(true);item.replaceWith(replacement);replacement.setAttribute('aria-expanded','true');}
                    else if(${JSON.stringify(mode)}!=='no-expansion')item.setAttribute('aria-expanded','true');
                    if(${JSON.stringify(mode)}==='route-mutation')location.hash='#/project/other/simulation';
                });
            })()`);
            const mutation = ['disabled','late-disabled','keyup-disabled'].includes(mode) ? 'item.disabled=true'
                : mode==='nonmatching-label' ? "item.setAttribute('aria-label','Other navigation')"
                : mode==='nonmatching-panel' ? "item.setAttribute('aria-controls','other-panel')"
                : mode==='already-expanded' ? "item.setAttribute('aria-expanded','true')"
                : ['replacement','keyup-replacement'].includes(mode) ? 'const replacement=item.cloneNode(true);item.replaceWith(replacement);replacement.focus()'
                : "document.getElementById('other-target').focus()";
            if(['disabled','unfocused','nonmatching-label','nonmatching-panel','already-expanded'].includes(mode))await evaluate(`(()=>{const item=document.getElementById('studio-navigation-toggle');${mutation};})()`);
            const commands=[];
            const dispatcher={send:async(method,params)=>{
                commands.push(params);
                if(mode==='dispatch-failed')throw new Error('native keyboard dispatch rejected');
                if(params.type==='keyDown'&&['replacement','late-disabled','late-unfocused'].includes(mode)||params.type==='keyUp'&&['keyup-replacement','keyup-disabled','keyup-unfocused'].includes(mode))await evaluate(`(()=>{const item=document.getElementById('studio-navigation-toggle');${mutation};})()`);
                if(mode==='synthetic-events')return evaluate(`document.getElementById('studio-navigation-toggle').dispatchEvent(new KeyboardEvent('${params.type==='keyDown'?'keydown':'keyup'}',{key:' ',bubbles:true,cancelable:true}))`);
                const result=await cdp.send(method,params);
                if(mode==='duplicate-keydown'&&params.type==='keyDown')await cdp.send(method,params);
                if(mode==='duplicate-click'&&params.type==='keyUp')await evaluate("document.getElementById('studio-navigation-toggle').click()");
                return result;
            }};
            await assert.rejects(()=>activateP805FocusedControl(dispatcher,evaluate,'navigation-drawer',{stableControlId:'studio-navigation-toggle'}),/lost native keyboard focus|did not receive one native keyboard activation|native keyboard dispatch rejected/);
            assert.ok(commands.length<=2,'failure never retries the disclosure or falls back to pointer activation');
            assert.equal(await evaluate('window.__p805KeyboardReceipts?.size ?? 0'),0);
            assert.equal(await evaluate('window.drawerActivations.length'),['duplicate-click','no-expansion','substitute-disclosure','route-mutation'].includes(mode)?1:0,mode);
        }
        await evaluate("location.hash='#/project/source/overview';document.getElementById('navigation-result').setAttribute('data-pokie-lifecycle-route', 'simulation')");
        assert.equal(await navigationReady(), false, "another route's terminal cannot release capture");
        // Exercise the shared native input/activation boundary at each
        // assigned viewport, including the narrow drawer's bottom control.
        await evaluate(`(()=>{
            document.body.insertAdjacentHTML('beforeend','<textarea id="replay-artifact-json"></textarea><button id="replay-artifact-load" disabled>Validate &amp; load</button>');
            const field=document.getElementById('replay-artifact-json'),load=document.getElementById('replay-artifact-load');
            field.addEventListener('input',(event)=>{window.artifactInputTrusted=event.isTrusted;load.disabled=!field.value.trim();});
            load.addEventListener('click',(event)=>{window.artifactActivation={trusted:event.isTrusted,body:field.value};});
        })()`);
        for (const [width,height] of [[1440,900],[960,800],[390,844]]) {
            await cdp.send("Emulation.setDeviceMetricsOverride", {width,height,mobile:width===390,deviceScaleFactor:1});
            // Preserve exported unseeded bytes as well as invalid input and
            // recovery while replacing the textarea through native entry.
            const text=JSON.stringify({round:width===960?0:1,seed:width===960?'invalid-artifact':null},null,2);
            await setP805ReplayArtifactInput(cdp,evaluate,text);
            const activation=await activateP805FocusedControl(cdp,evaluate,"operation",{stableControlId:"replay-artifact-load"});
            assert.equal(activation.kind,"pointer");
            assert.equal(hasP805NativeActivation(activation,"replay-artifact-load"),true);
            assert.equal(activation.hitTest.matchesCapturedControl,true);
            assert.equal(await evaluate("window.artifactInputTrusted"),true);
            assert.deepEqual(await evaluate("window.artifactActivation"),{trusted:true,body:text});
            await evaluate("document.getElementById('replay-artifact-load').focus({preventScroll:true})");
            const keyboard=await activateP805FocusedControl(cdp,evaluate,"operation",{stableControlId:"replay-artifact-load"},"keyboard");
            assert.equal(keyboard.kind,"keyboard");
            assert.equal(hasP805NativeActivation(keyboard,"replay-artifact-load"),true);
            assert.equal(keyboard.dispatch.focus.trusted,true);
            assert.equal(keyboard.dispatch.keyDownCount,1);
            assert.equal(keyboard.dispatch.keyUpCount,1);
            assert.deepEqual(await evaluate("({width:innerWidth,height:innerHeight})"),{width,height});
        }
        // Trace the retained finding's actual Open control shape at the
        // assigned narrow viewport, with smooth page scrolling, a table reflow
        // outside the button's ancestors and native focus transfer at press.
        const importedLocation = '/games/Bounded reel editor.json';
        const importedControlId = 'project-open:' + importedLocation;
        await evaluate(`(()=>{
            const panel=document.createElement('section');panel.tabIndex=-1;
            const button=document.createElement('button');button.id=${JSON.stringify(importedControlId)};
            button.dataset.pokieProjectLocation=${JSON.stringify(importedLocation)};
            button.innerHTML='<span>Open</span>';
            const spacer=document.createElement('div');spacer.style.height='1800px';
            const table=document.createElement('table'),cell=table.insertRow().insertCell();cell.append(button);
            table.style.marginLeft='220px';
            panel.append(spacer,table);document.body.append(panel);
            document.documentElement.style.scrollBehavior='smooth';
            button.addEventListener('mouseover',()=>{
                // This layout change has no Web Animation on the button or
                // its ancestors. It must settle before the captured press.
                let frames=3;
                const reflow=()=>{if(--frames===0)spacer.style.height='1720px';else requestAnimationFrame(reflow);};
                requestAnimationFrame(reflow);
            },{once:true});
            window.importedOpenActivations=[];
            document.addEventListener('pointerdown',(event)=>{if(button.contains(event.target))panel.focus({preventScroll:true});},true);
            button.addEventListener('click',(event)=>{
                window.importedOpenActivations.push({trusted:event.isTrusted,controlId:event.currentTarget.id});
                location.hash='#/project/imported/overview';button.remove();
            });
        })()`);
        // Mobile focus/scroll can pan the visual viewport independently of
        // the layout viewport. CDP consumes visual coordinates, while native
        // event.clientY and getBoundingClientRect retain layout coordinates.
        await cdp.send("Emulation.setPageScaleFactor", {pageScaleFactor:2});
        const importedMouseCommands = [];
        const importedOpen = await clickP805CapturedControl({send:async (method, params) => {
            if (method === "Input.dispatchMouseEvent") importedMouseCommands.push(params);
            return cdp.send(method, params);
        }}, evaluate, importedControlId, true, true, true, true);
        const acceptedOpenBytes = JSON.stringify(importedOpen);
        const importedActivation = {kind:"pointer", count:1, controlId:importedControlId, ...importedOpen};
        assert.equal(hasP805NativeActivation(importedActivation, importedControlId), true);
        assert.equal(importedOpen.dispatch.bindingVersion, 2);
        assert.equal(importedOpen.hitTest.visualViewport.scale, 2);
        assert.ok(importedOpen.hitTest.visualViewport.offsetLeft > 0);
        assert.ok(importedOpen.hitTest.visualViewport.offsetTop > 0);
        assert.equal(importedOpen.dispatchPoint.x, importedOpen.x - importedOpen.hitTest.visualViewport.offsetLeft);
        assert.equal(importedOpen.dispatchPoint.y, importedOpen.y - importedOpen.hitTest.visualViewport.offsetTop);
        for (const command of importedMouseCommands.slice(-3)) {
            assert.equal(command.x, importedOpen.dispatchPoint.x);
            assert.equal(command.y, importedOpen.dispatchPoint.y);
        }
        assert.deepEqual(importedMouseCommands.slice(-3).map((command) => command.type), ["mouseMoved", "mousePressed", "mouseReleased"]);
        for (const binding of importedOpen.dispatch.eventBindings) {
            assert.equal(binding.pointMatchesMeasured, true);
            assert.equal(binding.viewportMatchesMeasured, true);
            assert.deepEqual(binding.visualViewport, importedOpen.hitTest.visualViewport);
            assert.ok(Math.abs(binding.x - importedOpen.x) < 1);
            assert.ok(Math.abs(binding.y - importedOpen.y) < 1);
        }
        for (const corrupt of [
            (value) => { value.dispatchPoint.y += 1; },
            (value) => { delete value.dispatchPoint; },
            (value) => { value.hitTest.visualViewport.offsetLeft += 1; },
            (value) => { value.dispatch.eventBindings[0].visualViewport.offsetTop += 1; },
            (value) => { value.dispatch.eventBindings[1].visualViewport.scale += 1; },
            (value) => { value.dispatch.eventBindings[2].viewportMatchesMeasured = false; },
            (value) => { delete value.dispatch.eventBindings[0].visualViewport; },
            (value) => { delete value.dispatchPoint; delete value.hitTest.visualViewport; },
        ]) {
            const invalid = structuredClone(importedActivation);
            corrupt(invalid);
            assert.equal(hasP805NativeActivation(invalid, importedControlId), false, "visual coordinate receipts require the measured origin and native event bindings");
        }
        const legacyActivation = structuredClone(importedActivation);
        legacyActivation.dispatch.bindingVersion = 1;
        delete legacyActivation.dispatchPoint;
        delete legacyActivation.hitTest.visualViewport;
        for (const binding of legacyActivation.dispatch.eventBindings) {
            delete binding.visualViewport;
            delete binding.viewportMatchesMeasured;
        }
        assert.equal(hasP805NativeActivation(legacyActivation, importedControlId), true, "accepted layout-coordinate receipts remain readable without rewriting history");
        assert.equal(importedOpen.capturedControlId, importedControlId);
        assert.equal(importedOpen.preDispatchFocus.native, true);
        assert.equal(importedOpen.hitTest.matchesCapturedControl, true);
        assert.equal(importedOpen.dispatch.focus.atDispatchNative, false);
        assert.equal(importedOpen.dispatch.targetsMatchCapturedControl, true);
        assert.deepEqual([importedOpen.dispatch.pointerDownCount, importedOpen.dispatch.pointerUpCount, importedOpen.dispatch.clickCount], [1,1,1]);
        assert.deepEqual(await evaluate("window.importedOpenActivations"), [{trusted:true, controlId:importedControlId}]);
        assert.equal(await evaluate("location.hash"), '#/project/imported/overview');
        // The product import path uses a focused native Button, rather than
        // retrying the failed compact pointer transition. Exercise its shared
        // production boundary with a browser-owned request and route terminal.
        const mountImportedOpen = async () => evaluate(`(()=>{
            document.body.innerHTML='<input id="other-target"><section style="padding-top:1800px"><button type="button" id="${importedControlId}" data-pokie-project-location="${importedLocation}"><span>Open</span></button></section>';
            location.hash='#/home/projects';window.keyboardOpenActivations=[];
            const button=document.getElementById(${JSON.stringify(importedControlId)});
            button.addEventListener('click',async(event)=>{
                window.keyboardOpenActivations.push({trusted:event.isTrusted,controlId:event.currentTarget.id});
                button.disabled=true;
                const context=await(await fetch('/api/home/projects/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectRoot:button.dataset.pokieProjectLocation})})).json();
                location.hash='#/project/'+encodeURIComponent(context.context.projectRoot)+'/overview';button.remove();
            });
        })()`);
        let validKeyboardOpen, validImportedOpen;
        for (const [width,height] of [[1440,900],[960,800],[390,844]]) {
            await cdp.send("Emulation.setDeviceMetricsOverride", {width,height,mobile:width===390,deviceScaleFactor:1});
            await mountImportedOpen();
            const beforeRequests=requests.filter((request)=>request.path==='/api/home/projects/open').length;
            const commands=[];
            const opened=await openP805ImportedProject({events:cdp.events,send:async(method,params)=>{
                if(method==='Input.dispatchKeyEvent')commands.push(params);
                else assert.equal(method,'Network.getResponseBody','only response observation may accompany the native keyboard interaction');
                return cdp.send(method,params);
            }},evaluate,importedLocation);
            validImportedOpen=opened;
            validKeyboardOpen=opened.activation;
            assert.deepEqual(commands.map((command)=>[command.type,command.key]),[['keyDown',' '],['keyUp',' ']]);
            assert.equal(hasP805NativeActivation(opened.activation,importedControlId),true);
            assert.deepEqual(opened.activation.dispatch.eventBindings.map((event)=>event.eventType),['keydown','keyup','click']);
            assert.equal(opened.activation.dispatch.clickCount,1);
            assert.equal(opened.activation.capturedControlId,importedControlId);
            assert.equal(opened.priorRoute,'#/home/projects');
            assert.equal(opened.route,'#/project/'+encodeURIComponent(importedRuntimeRoot)+'/overview');
            assert.equal(opened.request.body,JSON.stringify({projectRoot:importedLocation}));
            assert.equal(opened.response.projectRoot,importedRuntimeRoot);
            assert.equal(opened.response.browserRequestId,opened.request.browserRequestId);
            assert.equal(opened.response.status,200);
            assert.deepEqual(await evaluate('window.keyboardOpenActivations'),[{trusted:true,controlId:importedControlId}]);
            assert.equal(requests.filter((request)=>request.path==='/api/home/projects/open').length,beforeRequests+1);
        }
        // Mutate the actual native receipt: neither a stale request nor an
        // unrelated dashboard can stand in for the imported Open result.
        for(const corrupt of [
            (value)=>{value.request.body=JSON.stringify({projectRoot:'/another'});},
            (value)=>{value.request.method='GET';},
            (value)=>{value.request.path='/api/project/context';},
            (value)=>{value.response.browserRequestId='another-request';},
            (value)=>{value.response.status=500;},
            (value)=>{value.response.projectRoot='/another';},
            (value)=>{value.route='#/project/another/overview';},
            (value)=>{value.priorRoute=value.route;},
            (value)=>{value.controlId='project-open:/another';},
            (value)=>{value.activation.dispatch.clickCount=2;},
        ]) {
            const invalid=structuredClone(validImportedOpen);corrupt(invalid);
            assert.throws(()=>validateP805ImportedProjectOpen(invalid),/not bound to its native activation and server context/);
        }
        // The unsaved-work audit uses the generic navigation boundary with
        // its default transport. It must choose the same retained keyboard
        // Open even when the Projects card lies outside the pointer viewport.
        // Stay is a distinct public action: no Open request or route change
        // may have happened before it completes.
        for (const [width,height] of [[1440,900],[960,800],[390,844]]) {
            await cdp.send("Emulation.setDeviceMetricsOverride", {width,height,mobile:width===390,deviceScaleFactor:1});
            await mountImportedOpen();
            await evaluate(`(()=>{
                const original=document.getElementById(${JSON.stringify(importedControlId)});
                const button=original.cloneNode(true);original.replaceWith(button);
                window.draft='P805 unsaved';
                button.addEventListener('click',()=>{
                    button.disabled=true;
                    const dialog=document.createElement('dialog');
                    dialog.innerHTML='<p>You have unsaved changes in Design Game.</p><button type="button" id="design-navigation-guard-stay">Stay</button>';
                    document.body.append(dialog);dialog.showModal();
                    dialog.querySelector('button').addEventListener('click',()=>{dialog.close();dialog.remove();button.disabled=false;});
                });
                scrollTo(0,0);button.focus({preventScroll:true});
            })()`);
            const beforeRequests=requests.filter((request)=>request.path==='/api/home/projects/open').length;
            const commands=[];
            const dispatcher={send:async(method,params)=>{commands.push({method,...params});return cdp.send(method,params);}};
            const openActivation=await activateP805FocusedControl(dispatcher,evaluate,'navigation',{stableControlId:importedControlId});
            assert.equal(openActivation.kind,'keyboard');
            assert.equal(hasP805NativeActivation(openActivation,importedControlId),true);
            assert.deepEqual(commands.map(({method,type,key})=>[method,type,key]),[['Input.dispatchKeyEvent','keyDown',' '],['Input.dispatchKeyEvent','keyUp',' ']]);
            assert.equal(await evaluate("!!document.querySelector('dialog[open]')"),true);
            const stayActivation=await activateP805FocusedControl(dispatcher,evaluate,'recovery',{stableControlId:'design-navigation-guard-stay'});
            assert.equal(stayActivation.kind,'pointer','Stay keeps the generic recovery pointer contract');
            assert.equal(hasP805NativeActivation(stayActivation,'design-navigation-guard-stay'),true);
            assert.equal(await evaluate("!!document.querySelector('dialog[open]')"),false);
            assert.equal(await evaluate('window.draft'),'P805 unsaved');
            assert.equal(await evaluate('location.hash'),'#/home/projects');
            assert.equal(await evaluate(`document.getElementById(${JSON.stringify(importedControlId)}).disabled`),false);
            assert.equal(requests.filter((request)=>request.path==='/api/home/projects/open').length,beforeRequests);
            assert.equal(await evaluate('window.__p805KeyboardReceipts.size'),0);
        }
        for (const corrupt of [
            (value)=>{value.capturedControlId='project-open:another';},
            (value)=>{delete value.captureKey;},
            (value)=>{delete value.dispatch.eventBindings;},
            (value)=>{delete value.dispatch.bindingVersion;},
            (value)=>{value.dispatch.clickCount=2;},
            (value)=>{value.dispatch.key='Enter';},
            ...['trusted','targetMatchesCapturedControl','nativeFocus','capturedControlConnected','identityPreserved','enabled'].flatMap((field)=>[0,1,2].map((index)=>(value)=>{value.dispatch.eventBindings[index][field]=false;})),
            (value)=>{value.dispatch.eventBindings[1].targetId='other-target';},
            (value)=>{value.dispatch.eventBindings[2].projectLocation='/another';},
            (value)=>{value.dispatch.eventBindings[0].repeat=true;},
            (value)=>{value.dispatch.eventBindings[2].detail=1;},
        ]) {
            const invalid=structuredClone(validKeyboardOpen);corrupt(invalid);
            assert.equal(hasP805NativeActivation(invalid,importedControlId),false,'Open requires exact retained identity and all trusted focused events');
        }
        for (const mode of ['disabled','unfocused','nonmatching-location','replacement','late-disabled','late-unfocused','keyup-replacement','keyup-disabled','keyup-unfocused','nonmatching-event-target','synthetic-events','duplicate-keydown','dispatch-failed']) {
            await mountImportedOpen();
            await evaluate(`document.getElementById(${JSON.stringify(importedControlId)}).focus({preventScroll:true})`);
            const beforeRequests=requests.filter((request)=>request.path==='/api/home/projects/open').length;
            const mutation=['disabled','late-disabled','keyup-disabled'].includes(mode)?'item.disabled=true'
                :mode==='nonmatching-location'?"item.dataset.pokieProjectLocation='/another'"
                :['replacement','keyup-replacement'].includes(mode)?'const replacement=item.cloneNode(true);item.replaceWith(replacement);replacement.focus()'
                :"document.getElementById('other-target').focus()";
            if(['disabled','unfocused','nonmatching-location'].includes(mode))await evaluate(`(()=>{const item=document.getElementById(${JSON.stringify(importedControlId)});${mutation};})()`);
            const commands=[];
            const dispatcher={send:async(method,params)=>{
                commands.push(params);
                if(mode==='dispatch-failed')throw new Error('native keyboard dispatch rejected');
                if(params.type==='keyDown'&&['replacement','late-disabled','late-unfocused','nonmatching-event-target'].includes(mode))await evaluate(`(()=>{const item=document.getElementById(${JSON.stringify(importedControlId)});${mutation};})()`);
                if(params.type==='keyUp'&&['keyup-replacement','keyup-disabled','keyup-unfocused'].includes(mode))await evaluate(`(()=>{const item=document.getElementById(${JSON.stringify(importedControlId)});${mutation};})()`);
                if(mode==='synthetic-events')return evaluate(`document.getElementById(${JSON.stringify(importedControlId)}).dispatchEvent(new KeyboardEvent('${params.type==='keyDown'?'keydown':'keyup'}',{key:' ',bubbles:true,cancelable:true}))`);
                const result=await cdp.send(method,params);
                if(mode==='duplicate-keydown'&&params.type==='keyDown')await cdp.send(method,params);
                return result;
            }};
            await assert.rejects(()=>activateP805KeyboardControl(dispatcher,evaluate,importedControlId),/lost native keyboard focus|did not receive one native keyboard activation|native keyboard dispatch rejected/);
            assert.ok(commands.length<=2,'failure never retries or adds a second activation');
            assert.deepEqual(await evaluate('window.keyboardOpenActivations'),[]);
            assert.equal(await evaluate('location.hash'),'#/home/projects');
            assert.equal(await evaluate('window.__p805KeyboardReceipts?.size ?? 0'),0,'failure removes its observers');
            assert.equal(requests.filter((request)=>request.path==='/api/home/projects/open').length,beforeRequests);
        }
        await evaluate("document.documentElement.style.scrollBehavior='auto'");
        await cdp.send("Emulation.setPageScaleFactor", {pageScaleFactor:1});
        await cdp.send("Emulation.clearDeviceMetricsOverride");
        for (const mode of ["retained", "replaced", "removed", "moving", "moving-parent", "moving-deferred-parent", "moving-replaced", "transient-hit", "confirmation-pointer", "dispatch-focus-transfer", "detached-dispatch-label", "retargeted-dispatch-region", "active-press", "active-scaled-press", "moving-obstructed", "changed-hit", "changed-node", "disabled", "lost-focus", "late-overlay", "late-replacement", "late-layout-shift", "late-missed-reflow", "late-transform-shift", "late-feedback-scale", "stale-coordinate", "duplicate-activation", "synthetic-events", "dispatch-failed"]) {
            const url = `http://127.0.0.1:${server.address().port}/?mode=${mode}`;
            await cdp.send("Page.navigate", {url});
            await poll(() => evaluate(`location.href === ${JSON.stringify(url)} && document.readyState === 'complete' && typeof window.renderTerminal === 'function'`));
            // Move off the control before capture, so its hover handler executes
            // only at the production helper's capture-to-dispatch boundary.
            await cdp.send("Input.dispatchMouseEvent", {type:"mouseMoved", x:400, y:300, pointerType:"mouse"});
            const cursor = cdp.events.length;
            const dispatcher = {
                send: async (method, params) => {
                    if (method === "Input.dispatchMouseEvent" && params.type === "mousePressed") {
                        if (mode === "dispatch-failed") throw new Error("native pointer dispatch rejected");
                        // Mutate after the last measured boundary, so a stale
                        // snapshot or a same-id replacement cannot be accepted.
                        if (mode === "late-overlay") await evaluate("document.body.insertAdjacentHTML('beforeend','<div style=\"position:fixed;inset:0;z-index:1000\"></div>')");
                        if (mode === "late-replacement") await evaluate("document.getElementById('simulation-retry').replaceWith(document.getElementById('simulation-retry').cloneNode(true))");
                        if (mode === "late-missed-reflow") await evaluate("document.getElementById('simulation-retry').style.marginTop='34px'");
                        if (mode === "late-layout-shift") await evaluate("document.getElementById('simulation-retry').style.marginTop='2px'");
                        if (mode === "late-transform-shift") await evaluate("document.getElementById('simulation-retry').style.transform='translateY(2px)'");
                        if (mode === "late-feedback-scale") await evaluate("document.documentElement.style.setProperty('--mantine-scale','2')");
                        if (mode === "synthetic-events") await evaluate(`(()=>{
                            const item=document.getElementById('simulation-retry');
                            for(const type of ['pointerdown','pointerup','click'])item.dispatchEvent(new PointerEvent(type,{bubbles:true,composed:true,clientX:${params.x},clientY:${params.y}}));
                        })()`);
                        if (mode === "stale-coordinate") return cdp.send(method, {...params, x:400, y:300});
                    }
                    const result = await cdp.send(method, params);
                    if (mode === "duplicate-activation" && method === "Input.dispatchMouseEvent" && params.type === "mouseReleased") {
                        await cdp.send(method, {...params, type:"mousePressed", buttons:1});
                        await cdp.send(method, params);
                    }
                    return result;
                },
            };
            // Confirmations use the helper's simpler native pointer options;
            // preserve that sibling caller as well as the Retry configuration.
            const fullPointerState = mode !== "confirmation-pointer";
            const click = () => clickP805CapturedControl(dispatcher, evaluate, "simulation-retry", fullPointerState, fullPointerState, fullPointerState, true);
            if (["moving-obstructed", "changed-hit", "changed-node", "disabled", "lost-focus", "late-overlay", "late-replacement", "late-missed-reflow", "late-transform-shift", "late-feedback-scale", "stale-coordinate", "duplicate-activation", "synthetic-events", "dispatch-failed"].includes(mode)) {
                const afterMeasurement = ["late-overlay", "late-replacement", "late-missed-reflow", "late-transform-shift", "late-feedback-scale", "stale-coordinate", "duplicate-activation", "synthetic-events"].includes(mode);
                await assert.rejects(click(), mode === "late-missed-reflow" ? (error) => {
                    const receipt=JSON.parse(error.message.split('; captured boundary: ')[1]);
                    assert.equal(receipt.preDispatchFocus.native,true);
                    assert.equal(hasP805NativeActivation(receipt,'simulation-retry'),false);
                    for(const event of receipt.dispatch.eventBindings){
                        assert.equal(event.reflow.kind,'same-node-delivery-reflow');
                        assert.equal(event.capturedControlConnected,true);
                        assert.equal(event.identityPreserved,true);
                        assert.equal(event.pathContainsCapturedControl,false);
                        assert.equal(event.hitMatchesCapturedControl,false);
                        assert.equal(event.relationship,'unbound');
                    }
                    return true;
                } : mode === "dispatch-failed" ? /native pointer dispatch rejected/ : afterMeasurement ? /lost native focus or its captured hit target at pointer dispatch/ : /changed its captured identity, native focus, or hit target/);
                const expectedActivations = mode === "duplicate-activation" ? 2 : ["synthetic-events", "late-transform-shift", "late-feedback-scale"].includes(mode) ? 1 : 0;
                assert.deepEqual(await evaluate("window.activations"), Array.from({length:expectedActivations}, () => ({trusted:true, controlId:"simulation-retry"})));
                assert.equal(JSON.stringify(importedOpen), acceptedOpenBytes, "a later rejected tuple cannot alter an accepted capture");
                assert.equal(cdp.events.slice(cursor).filter((event) => event.method === "Network.requestWillBeSent" && event.params.request.method === "POST").length, expectedActivations);
                assert.deepEqual(await evaluate("[window.__p805CapturedControls.size,window.__p805PointerDispatchReceipts.size]"), [0, 0]);
                continue;
            }
            const pointer = {kind:"pointer", count:1, controlId:"simulation-retry", ...await click()};
            assert.equal(hasP805NativeActivation(pointer, "simulation-retry"), true);
            assert.deepEqual(pointer.dispatch.eventBindings.map((event) => event.eventType), ["pointerdown", "pointerup", "click"]);
            for (const binding of pointer.dispatch.eventBindings) {
                assert.equal(binding.captureKey, pointer.captureKey);
                assert.equal(binding.capturedControlId, pointer.capturedControlId);
                assert.equal(binding.pointMatchesMeasured, true);
                const activePress = mode.startsWith("active-") && binding.eventType === "pointerdown";
                assert.equal(binding.regionMatchesMeasured, !activePress && mode !== "late-layout-shift");
                assert.equal(binding.regionMatchesCapturedPress, activePress);
                assert.equal(binding.hitMatchesCapturedControl, true);
                assert.ok(binding.pathContainsCapturedControl || binding.dispatchRegionAncestor);
                if (!binding.pathContainsCapturedControl) assert.equal(binding.relationship, "captured-dispatch-region");
            }
            if (mode.startsWith("active-")) {
                const translateY = mode === "active-scaled-press" ? 1.875 : 1;
                assert.deepEqual(pointer.hitTest.pressFeedback, {kind:"mantine-active-translation", translateY});
                const binding = pointer.dispatch.eventBindings[0];
                assert.equal(binding.pressFeedback.active, true);
                assert.deepEqual(binding.pressFeedback.matrix, [1, 0, 0, 1, 0, translateY]);
                assert.equal(binding.region.top, pointer.hitTest.region.top + translateY);
                for (const corrupt of [
                    (value) => { value.dispatch.eventBindings[0].regionMatchesCapturedPress = false; },
                    (value) => { delete value.dispatch.eventBindings[0].pressFeedback; },
                    (value) => { value.dispatch.eventBindings[0].pressFeedback.active = false; },
                    (value) => { value.dispatch.eventBindings[0].pressFeedback.classRetained = false; },
                    (value) => { value.dispatch.eventBindings[0].pressFeedback.inlineTransformUnchanged = false; },
                    (value) => { value.dispatch.eventBindings[0].pressFeedback.is2D = false; },
                    (value) => { value.dispatch.eventBindings[0].pressFeedback.matrix[5] += 1; },
                    (value) => { value.dispatch.eventBindings[0].region.top += 1; },
                    (value) => { value.dispatch.eventBindings[0].region.width += 1; },
                    (value) => { value.hitTest.pressFeedback.translateY += 1; },
                    (value) => { delete value.hitTest.pressFeedback; },
                ]) {
                    const invalid = structuredClone(pointer);
                    corrupt(invalid);
                    assert.equal(hasP805NativeActivation(invalid, "simulation-retry"), false, "press feedback requires its captured style and live region proof");
                }
            }
            if (mode === "detached-dispatch-label") {
                assert.equal(pointer.dispatch.eventBindings[2].targetId, "retry-label");
                assert.equal(pointer.dispatch.eventBindings[2].directTargetMatchesCapturedControl, false);
                assert.equal(pointer.dispatch.eventBindings[2].relationship, "captured-dispatch-path");
                assert.equal(pointer.dispatch.eventBindings[0].capturedControlConnected, true);
                assert.equal(pointer.dispatch.eventBindings[0].enabled, true);
                assert.equal(pointer.hitTest.targetId, "retry-label");
            }
            if (mode === "retargeted-dispatch-region") {
                assert.deepEqual(pointer.dispatch.eventBindings.map((event) => event.relationship), ["captured-control", "captured-dispatch-region", "captured-dispatch-region"]);
                assert.equal(pointer.dispatch.eventBindings[1].directTargetMatchesCapturedControl, false);
                assert.equal(pointer.dispatch.eventBindings[1].dispatchRegionAncestor, true);
            }
            assert.equal(pointer.hitTest.x, pointer.x);
            assert.equal(pointer.hitTest.y, pointer.y);
            assert.equal(pointer.preDispatchFocus.native, true);
            assert.equal(pointer.hitTest.matchesCapturedControl, true);
            assert.equal(pointer.dispatch.focus.native, true);
            assert.equal(pointer.dispatch.focus.observedAt, "pre-dispatch");
            assert.equal(pointer.dispatch.focus.atDispatchNative, mode !== "dispatch-focus-transfer");
            assert.equal(pointer.dispatch.pointerDownCount, 1);
            assert.equal(pointer.dispatch.pointerUpCount, 1);
            assert.equal(pointer.dispatch.clickCount, 1);
            assert.equal(pointer.dispatch.eventsTrusted, true);
            assert.equal(pointer.dispatch.targetsMatchCapturedControl, true);
            assert.equal(pointer.dispatch.focus.targetMatchesCapturedControl, true);
            assert.equal(pointer.dispatch.pressed, true);
            assert.equal(pointer.dispatch.released, true);
            assert.equal(pointer.dispatch.focus.hitTest.matchesCapturedControl, true);
            assert.equal(pointer.dispatch.buttons, fullPointerState ? 1 : 0);
            assert.equal(pointer.dispatch.pointerType, fullPointerState ? "mouse" : null);
            if (mode.startsWith("moving")) assert.ok(pointer.x > 180, "dispatch follows the settled captured node's live hit target");
            await poll(() => evaluate("window.terminal?.status === 'completed'"));
            const events = cdp.events.slice(cursor);
            const submitted = events.filter((event) => event.method === "Network.requestWillBeSent" && event.params.request.url.endsWith("/api/project/simulations") && event.params.request.method === "POST");
            assert.equal(submitted.length, 1);
            const browserRequestId = submitted[0].params.requestId;
            assert.equal(submitted[0].params.request.postData, "{}");
            const terminalEvent = await poll(() => cdp.events.slice(cursor).find((event) => event.method === "Network.responseReceived" && event.params.response.url.endsWith("/api/project/simulations/retry-job")));
            await poll(() => cdp.events.some((event) => event.method === "Network.loadingFinished" && event.params.requestId === terminalEvent.params.requestId));
            const terminal = JSON.parse((await cdp.send("Network.getResponseBody", {requestId:terminalEvent.params.requestId})).body);
            const receipt = {status:terminal.status, jobId:terminal.id, result:terminal, resultSha256:hash(JSON.stringify(terminal)), browserRequestId:terminalEvent.params.requestId};
            const transaction = {confirmation:{required:false, state:"not-required"}, operation:"simulation-retry", stateClass:"recovery-operation", control:{stableControlId:"simulation-retry"}, pointerActivations:[pointer], keyboardActivations:[], requestCount:1, request:{browserRequestId, method:"POST", path:"/api/project/simulations"}, terminal:{...receipt, causedByRequestId:browserRequestId}};
            assert.equal(await observeP805PointerTerminal(evaluate, transaction, receipt), false, "the network terminal cannot replace a rendered result");
            await evaluate("window.renderTerminal('unrelated-job')");
            assert.equal(await observeP805PointerTerminal(evaluate, transaction, receipt), false, "an unrelated rendered job cannot release this receipt");
            await evaluate("window.renderTerminal(); document.getElementById('simulation-results').hidden = true");
            assert.equal(await observeP805PointerTerminal(evaluate, transaction, receipt), false, "a hidden terminal cannot replace the visible result");
            await evaluate("document.getElementById('simulation-results').hidden = false; document.getElementById('simulation-results').focus()");
            transaction.postTransitionRenderedState = await observeP805PointerTerminal(evaluate, transaction, receipt);
            const expectedControlState = ["moving", "moving-parent", "moving-deferred-parent", "transient-hit", "confirmation-pointer", "dispatch-focus-transfer", "detached-dispatch-label", "retargeted-dispatch-region", "active-press", "active-scaled-press", "late-layout-shift"].includes(mode) ? "retained" : mode === "moving-replaced" ? "replaced" : mode;
            assert.equal(transaction.postTransitionRenderedState.controlState, expectedControlState);
            assert.equal(transaction.postTransitionRenderedState.capturedControlConnected, expectedControlState === "retained");
            assert.equal(transaction.postTransitionRenderedState.activeElementId, "simulation-results");
            assert.deepEqual(transaction.postTransitionRenderedState.preDispatchEvidence, {capturedControlId:pointer.capturedControlId, focus:pointer.preDispatchFocus, hitTest:pointer.hitTest, dispatch:pointer.dispatch});
            const retry = {operation:"simulation-retry", controlId:"simulation-retry", stateClass:"recovery-operation", transaction};
            assert.equal(validateP805RetryTerminalReceipt(retry), retry);
            for (const corrupt of [
                (value) => { value.transaction.pointerActivations[0].preDispatchFocus.native = false; },
                (value) => { value.transaction.pointerActivations[0].hitTest.matchesCapturedControl = false; },
                (value) => { value.transaction.pointerActivations[0].dispatch.focus.targetMatchesCapturedControl = false; },
                ...["pointMatchesMeasured", "hitMatchesCapturedControl", "capturedControlConnected", "identityPreserved", "enabled", "pathContainsCapturedControl", "trusted"].map((field) => (value) => { value.transaction.pointerActivations[0].dispatch.eventBindings[0][field] = false; }),
                (value) => { value.transaction.pointerActivations[0].dispatch.eventBindings[0].regionMatchesMeasured = false; value.transaction.pointerActivations[0].dispatch.eventBindings[0].regionMatchesCapturedPress = false; delete value.transaction.pointerActivations[0].dispatch.eventBindings[0].reflow; },
                (value) => { value.transaction.pointerActivations[0].dispatch.eventBindings[0].captureKey = "another-capture"; },
                (value) => { value.transaction.pointerActivations[0].dispatch.eventBindings[0].relationship = "overlay"; },
                (value) => { value.transaction.pointerActivations[0].dispatch.clickCount = 2; },
                (value) => { value.transaction.pointerActivations[0].dispatch.eventBindings = null; },
                (value) => { delete value.transaction.pointerActivations[0].dispatch.eventBindings; },
                (value) => { value.transaction.pointerActivations[0].dispatch.eventBindings[0].x += 100; },
                (value) => { value.transaction.pointerActivations[0].hitTest.x += 100; },
                (value) => { value.transaction.pointerActivations = []; value.transaction.keyboardActivations = [{kind:"keyboard", controlId:"simulation-retry", count:1, nativeFocus:true}]; },
                (value) => { value.transaction.postTransitionRenderedState.requestId = "unrelated-request"; },
                (value) => { value.transaction.postTransitionRenderedState.resultJobId = "unrelated-job"; },
                (value) => { value.transaction.postTransitionRenderedState.resultSha256 = "0".repeat(64); },
            ]) {
                const invalid = structuredClone(retry);
                corrupt(invalid);
                assert.throws(() => validateP805RetryTerminalReceipt(invalid), /not bound to its captured Retry control/);
            }
            assert.deepEqual(await evaluate("window.activations"), [{trusted:true, controlId:"simulation-retry"}]);
            assert.deepEqual(await evaluate("[window.__p805CapturedControls.size,window.__p805PointerDispatchReceipts.size]"), [0, 0]);
            assert.equal(events.filter((event) => event.method === "Network.requestWillBeSent" && event.params.request.url.endsWith("/api/project/simulations/retry-job") && event.params.request.method === "GET").length, 1);
        }
        // Fifteen accepted paths plus five clicks from deliberately rejected
        // duplicate, synthetic, transform and feedback dispatches.
        assert.equal(requests.filter(({method, path}) => method === "POST" && path === "/api/project/simulations").length, 20);
    } finally {
        pendingContext?.end();
        await cdp?.close();
        browser.kill("SIGTERM");
        await exited;
        await new Promise((resolve) => server.close(resolve));
        await rm(profile, {recursive:true, force:true, maxRetries:10, retryDelay:100});
    }
});
