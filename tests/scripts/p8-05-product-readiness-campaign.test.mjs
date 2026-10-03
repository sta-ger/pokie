import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdir, mkdtemp, readFile, rename, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {test} from "@jest/globals";
import {P805_PUBLIC_HELP_ARGUMENTS, hasP805TransactionActivations, tupleBootstrapContract, validateP805RetryTerminalReceipt} from "../../scripts/p8-05-valera-browser-audit.mjs";
import {
    matchesP805ReplayArtifactInput,
    P805_PERSONAS,
    P805_REQUIRED_EVIDENCE_KINDS,
    P805_REQUIRED_OBSERVATIONS,
    P805_SCREEN_CONTROL_STATES,
    P805_SCHEMA_VERSION,
    P805_WORKFLOW_CONTRACTS,
    p805TransactionStateClass,
    validateP805AuditMatrix,
    validateP805CollectedAudits,
    validateP805TupleProofLedger,
    validateP805ProductReadinessCampaign,
} from "../../scripts/p8-05-product-readiness-campaign.mjs";

import {p805OperationPerformance} from "../../scripts/p8-05-persona-projection.mjs";
import {aggregateP805PersonaAudits, prepareP805Closeout, runP805Closeout} from "../../scripts/p8-05-product-readiness-controller.mjs";

const initial = {
        candidateId: "1".repeat(40),
        candidatePackageSha256: "a".repeat(64),
        candidateExecutableSha256: "c".repeat(64),
        candidateExecutableReceipt: {path: "/tmp/p8-05-initial-executable-receipt.json", sha256: "e".repeat(64)},
    },
    retest = {
        candidateId: "2".repeat(40),
        candidatePackageSha256: "b".repeat(64),
        candidateExecutableSha256: "d".repeat(64),
        candidateExecutableReceipt: {path: "/tmp/p8-05-retest-executable-receipt.json", sha256: "f".repeat(64)},
    };
const hash = (value) => createHash("sha256").update(value).digest("hex");
const stamp = (offset) => new Date(Date.parse("2026-09-19T20:00:00.000Z") + offset).toISOString();
const rendered = {
    execution: "packed-public-cli-built-studio-rendered-controls",
    viewports: ["wide", "compact", "narrow"],
    responsive: ["wide", "compact", "narrow"].map((viewport) => ({viewport, overflow: false, visibleFocus: true, screenshotEvidenceId: `responsive-${viewport}`})),
    measurements: {
        consoleExceptions: 0,
        unhandledRequestFailures: 0,
        documentOverflow: false,
        inaccessiblePrimaryActions: 0,
        unexplainedDisabledControls: 0,
        namedRegions: 1,
        visibleFocus: true,
    },
};
const timings = {
    startupMs: 1,
    projectCreationMs: 1,
    validationMs: 1,
    buildMs: 1,
    simulationMs: 1,
    replayMs: 1,
    cancellationMs: 1,
    restartRecoveryMs: 1,
    retryMs: 1,
    replayArtifactMs: 1,
    screenshotMs: 1,
    recursiveHelpMs: 1,
};
const nativeKeyboardActivation = (controlId) => ({kind:"keyboard", controlId, count:1, nativeFocus:true, preDispatchFocus:{controlId, native:true}, dispatch:{kind:"native-keyboard", key:"Enter", pressed:true, released:true, keyDownCount:1, keyUpCount:1, focus:{controlId, native:true, trusted:true, targetMatchesCapturedControl:true}}});
let recoveryTransactionSequence = 0;
const transaction = (operation, controlId, accessibleName, confirmed = false) => ({
    operation,
    sequence: ++recoveryTransactionSequence,
    control: {stableControlId: controlId, identityAttribute: "id", accessibleName, enabled: true, disabled: false, disabledExplanation: null},
    confirmation: confirmed
        ? {required: true, state: "confirmed", control: {stableControlId: "simulation-cancel-confirm", identityAttribute: "id", accessibleName: "Confirm", enabled: true, disabled: false, disabledExplanation: null}, activation: nativePointerActivation("simulation-cancel-confirm")}
        : {required: false, state: "not-required", control: null},
    pointerActivations: operation === "replay" ? [] : [{phase: "operation", ...nativePointerActivation(controlId)}],
    keyboardActivations: operation === "replay" ? [{phase:"operation", ...nativeKeyboardActivation(controlId)}] : [],
    request: {browserRequestId: `runtime-${operation}-${recoveryTransactionSequence}`, method: "POST", path: `/api/project/${operation}`, status: 200, responseSha256: hash(`response-${operation}`)},
    terminal: {status: "completed", resultSha256: hash(`terminal-${operation}`), source: "rendered-poll", pollPath: `/api/project/${operation}/job`, browserRequestId: `terminal-${operation}`, causedByRequestId: `runtime-${operation}-${recoveryTransactionSequence}`},
});
const pointerTransaction = (operation, controlId, stateClass, terminalStatus, jobId) => {
    const requestId = `runtime-${operation}-${jobId}`,
        resultSha256 = hash(`terminal-${operation}-${jobId}`),
        captureKey = `capture-${operation}-${jobId}`;
    return {
        operation,
        stateClass,
        control: {stableControlId: controlId, identityAttribute: "id", accessibleName: operation === "simulation-retry" ? "Repeat simulation" : "Run Simulation", enabled: true, disabled: false, disabledExplanation: null},
        confirmation: {required: false, state: "not-required", control: null},
        keyboardActivations: [],
        pointerActivations: [{
            kind: "pointer", count: 1, controlId, capturedControlId: controlId, captureKey,
            preDispatchFocus: {controlId, native: true},
            hitTest: {capturedControlId: controlId, targetId: controlId, targetRole: "button", matchesCapturedControl: true},
            dispatch: {kind: "native-pointer", pointerDownCount: 1, pointerUpCount: 1, clickCount: 1, eventsTrusted: true, targetsMatchCapturedControl: true, pressed: true, released: true, buttons: 1, pointerType: "mouse", focus: {observedAt: "pre-dispatch", atDispatchNative: true, eventType: "pointerdown", controlId, native: true, trusted: true, hitTest: {capturedControlId: controlId, matchesCapturedControl: true}, targetId: controlId, targetRole: "button", targetMatchesCapturedControl: true}},
        }],
        requestCount: 1,
        request: {browserRequestId: requestId, method: "POST", path: "/api/project/simulations", status: 202, responseSha256: hash(`response-${operation}-${jobId}`)},
        terminal: {status: terminalStatus, jobId, resultSha256, source: "rendered-poll", pollPath: `/api/project/simulations/${jobId}`, browserRequestId: `terminal-${operation}-${jobId}`, causedByRequestId: requestId},
        postTransitionRenderedState: {capturedControlId: controlId, captureKey, preDispatchEvidence: {capturedControlId: controlId, focus: {controlId, native: true}, hitTest: {capturedControlId: controlId, matchesCapturedControl: true}, dispatch: {kind: "native-pointer", pointerDownCount: 1, pointerUpCount: 1, clickCount: 1, eventsTrusted: true, targetsMatchCapturedControl: true, pressed: true, released: true, focus: {observedAt: "pre-dispatch", atDispatchNative: true, controlId, native: true, targetMatchesCapturedControl: true}}}, controlState: "replaced", currentControlId: controlId, capturedControlConnected: false, requestId, resultSha256, renderedTerminal: true, resultControlId: controlId, resultOperation: operation, resultStateClass: stateClass, resultReceipt: "durable-terminal", resultJobId: jobId, resultTerminal: terminalStatus},
    };
};
test.each(["retained", "replaced", "removed"])("accepts Retry's captured native pointer evidence with a %s post-transition control", (controlState) => {
    const transaction = pointerTransaction("simulation-retry", "simulation-retry", "recovery-operation", "completed", "retry-job");
    transaction.keyboardActivations = [];
    Object.assign(transaction.postTransitionRenderedState, {
        controlState,
        currentControlId: controlState === "removed" ? null : "simulation-retry",
        capturedControlConnected: controlState === "retained",
        activeElementId: "simulation-results",
    });
    const receipt = {operation: "simulation-retry", controlId: "simulation-retry", stateClass: "recovery-operation", transaction};
    assert.equal(validateP805RetryTerminalReceipt(receipt), receipt);
});
test.each([
    ["native pre-dispatch focus", (transaction) => { transaction.pointerActivations[0].preDispatchFocus.native = false; }],
    ["native dispatch focus", (transaction) => { transaction.pointerActivations[0].dispatch.focus.native = false; }],
    ["captured hit test", (transaction) => { transaction.pointerActivations[0].hitTest.matchesCapturedControl = false; }],
    ["captured dispatch target", (transaction) => { transaction.pointerActivations[0].dispatch.focus.targetMatchesCapturedControl = false; }],
    ["preserved dispatch evidence", (transaction) => { transaction.postTransitionRenderedState.preDispatchEvidence.dispatch.focus.native = false; }],
    ["correlated request", (transaction) => { transaction.terminal.causedByRequestId = "unrelated-request"; }],
    ["correlated job", (transaction) => { transaction.postTransitionRenderedState.resultJobId = "unrelated-job"; }],
    ["valid replacement", (transaction) => { transaction.postTransitionRenderedState.capturedControlConnected = true; }],
    ["pointer transport", (transaction) => { transaction.pointerActivations = []; transaction.keyboardActivations = [{kind: "keyboard", count: 1, controlId: "simulation-retry", nativeFocus: true}]; }],
])("rejects Retry without its %s", (_label, mutate) => {
    const transaction = pointerTransaction("simulation-retry", "simulation-retry", "recovery-operation", "completed", "retry-job");
    mutate(transaction);
    assert.throws(() => validateP805RetryTerminalReceipt({operation: "simulation-retry", controlId: "simulation-retry", stateClass: "recovery-operation", transaction}), /captured Retry control/);
});
const nativePointerActivation = (controlId) => ({
    kind: "pointer",
    count: 1,
    controlId,
    capturedControlId: controlId,
    captureKey: `capture-${controlId}`,
    preDispatchFocus: {controlId, native: true},
    hitTest: {capturedControlId: controlId, targetId: controlId, targetRole: "button", matchesCapturedControl: true},
    dispatch: {kind: "native-pointer", pointerDownCount: 1, pointerUpCount: 1, clickCount: 1, eventsTrusted: true, targetsMatchCapturedControl: true, pressed: true, released: true, buttons: 1, pointerType: "mouse", focus: {observedAt: "pre-dispatch", atDispatchNative: true, eventType: "pointerdown", controlId, native: true, trusted: true, hitTest: {capturedControlId: controlId, matchesCapturedControl: true}, targetId: controlId, targetRole: "button", targetMatchesCapturedControl: true}},
});
test("unexecuted operations retain null timing and cannot borrow tuple duration", () => {
    const measured = {...timings, validationMs:null, simulationMs:null, replayMs:null, cancellationMs:null};
    const performance = p805OperationPerformance(measured);
    for (const name of ["validationMs", "simulationMs", "replayMs", "cancellationMs"]) assert.deepEqual(performance[name], {elapsedMs:null, budgetMs:name === "validationMs" ? 60_000 : name === "cancellationMs" ? 120_000 : 300_000, classification:"not-executed"});
});
test("recovery consumes pointer and keyboard receipts without extra activations", () => {
    const pointer = transaction("simulation", "simulation-run", "Run Simulation", true);
    assert.equal(pointer.keyboardActivations.length, 0);
    assert.equal(hasP805TransactionActivations(pointer), true);
    const keyboard = transaction("replay", "replay-run", "Run again");
    assert.equal(keyboard.pointerActivations.length, 0);
    assert.equal(hasP805TransactionActivations(keyboard), true);
    for (const mutate of [
        (value) => { value.keyboardActivations.push(keyboard.keyboardActivations[0]); },
        (value) => { value.pointerActivations.push(value.pointerActivations[0]); },
        (value) => { value.pointerActivations[0].controlId = "substituted"; },
        (value) => { value.pointerActivations[0].dispatch.pointerDownCount = 2; },
        (value) => { value.pointerActivations[0].dispatch.pointerUpCount = 0; },
        (value) => { value.pointerActivations[0].dispatch.clickCount = 2; },
        (value) => { value.pointerActivations[0].dispatch.eventsTrusted = false; },
        (value) => { value.pointerActivations[0].dispatch.targetsMatchCapturedControl = false; },
        (value) => { value.pointerActivations[0].dispatch.focus.observedAt = "post-transition"; },
        (value) => { value.confirmation.activation.controlId = "substituted"; },
        (value) => { value.confirmation.activation.dispatch.focus.targetMatchesCapturedControl = false; },
    ]) {
        const invalid = structuredClone(pointer); mutate(invalid);
        assert.equal(hasP805TransactionActivations(invalid), false);
    }
});
test("Replay Artifact binds parsed input to transmitted bytes without accepting another descriptor", () => {
    assert.equal(matchesP805ReplayArtifactInput('{\n  "round": 1, "seed": "valid"\n}', '{"round":1,"seed":"valid"}'), true);
    assert.equal(matchesP805ReplayArtifactInput('{"round":0}', '{"round":1}'), false);
    assert.equal(matchesP805ReplayArtifactInput('invalid JSON', '{}'), false);
});
test("keyboard evidence requires one trusted dispatch on the captured control", () => {
    const captured = transaction("replay", "replay-run", "Run again");
    for (const mutate of [
        (activation) => { delete activation.dispatch; },
        (activation) => { activation.dispatch.focus.trusted = false; },
        (activation) => { activation.dispatch.focus.controlId = "substituted"; },
        (activation) => { activation.dispatch.keyDownCount = 2; },
        (activation) => { activation.dispatch.keyUpCount = 0; },
    ]) {
        const invalid = structuredClone(captured); mutate(invalid.keyboardActivations[0]);
        assert.equal(hasP805TransactionActivations(invalid), false);
    }
});
const liveDomTransaction = (persona, observation, contract, viewport) => {
    const bodySha256 = hash(contract.body ?? ""),
        jobId = `job-${persona}-${observation}-${viewport}`,
        actionRequestId = `browser-${persona}-${observation}-${viewport}`,
        contextRequestId = `context-${persona}-${observation}-${viewport}`,
        pollRequestId = `poll-${persona}-${observation}-${viewport}`,
        artifactResult = {target: "parWorkbook", outputPath: `/outputs/${jobId}`},
        result = contract.actionControlId === "artifact-build-parWorkbook"
            ? {id: jobId, status: "completed", result: artifactResult}
            : contract.terminal === "report-completed" ? [{id: jobId, status: "completed", observation, downloadPath: `/downloads/${jobId}.json`}] : {id: jobId, status: "completed", observation, ...(contract.artifact === undefined ? {} : {outputPath: `/outputs/${jobId}`})},
        responseSha256 = hash(JSON.stringify(result)),
        route = `/#/project/fixture/${contract.route}`,
        screen = P805_SCREEN_CONTROL_STATES[contract.route],
        actionControl = contract.actionControl ?? contract.control,
        matchedLabel = contract.actionControlMatch === "prefix" ? `${contract.actionControl} (base)` : actionControl,
        declaredTransactionState = contract.operation === undefined && contract.body === undefined
            ? "navigation"
            : contract.method === "GET" ? "read-only-operation" : "editable-submission",
        transactionState = p805TransactionStateClass(declaredTransactionState),
        interaction = {
            control: actionControl,
            matchedLabel,
            keyboardFocused: true,
            keyboardActivated: true,
            activation: "keyboard",
            routeAfterActivation: route,
            stableControlId: contract.actionControlId ?? screen.navigationControlId,
            identityAttribute: "id",
            transactionState,
            lifecycle: (contract.operation ?? contract.body) === undefined ? {kind: "navigation", value: contract.route} : {kind: "operation", value: contract.operation ?? contract.body},
        },
        transaction = {
            operation: contract.operation ?? contract.body ?? contract.route,
            stateClass: transactionState,
            control: {stableControlId: contract.actionControlId ?? screen.navigationControlId, identityAttribute: "id", accessibleName: matchedLabel, enabled: true, disabled: false, disabledExplanation: null},
            ...(transactionState === "editable-submission" ? {formState: {
                operation: contract.operation ?? contract.body,
                capturedBeforeSubmission: true,
                scope: {identityAttribute: "data-pokie-lifecycle-form", value: contract.operation ?? contract.body, tagName: "form"},
                actionControl: {stableControlId: contract.actionControlId ?? screen.navigationControlId, identityAttribute: "id", visible: true, accessibleName: matchedLabel, validation: {valid: true, message: ""}},
                fields: [{stableControlId: `field-${observation}`, identityAttribute: "id", visible: true, accessibleName: "Configured value", value: "configured", disabled: false, required: true, validation: {valid: true, message: ""}}],
            }} : {}),
            ...(contract.body === "outcome-library" ? {preflight: {state: "ready", status: "ok", controlId: "outcome-library-generate", cardLabel: "Outcome library generator", enabled: true, disabled: false}} : {}),
            confirmation: {required: false, state: "not-required", control: null},
            pointerActivations: [],
            keyboardActivations: [{phase:"operation", ...nativeKeyboardActivation(contract.actionControlId ?? screen.navigationControlId)}],
        };
    return {
        bodySha256,
        responseSha256,
        result,
        interaction,
        transaction,
        route,
        contextRevalidation: {
            browserRequestId: contextRequestId,
            method: "GET",
            path: "/api/project/context",
            status: 200,
            responseSha256: hash(JSON.stringify({status: "loaded"})),
            projectStatus: "loaded",
            completedBeforeSelection: true,
        },
        contents: JSON.stringify({
            kind: "p8-05-live-dom-transaction",
            operation: observation,
            expectedOutcome: contract.terminal,
            route,
            viewport,
            elapsedMs: 1,
            screen: {name: contract.route, region: screen.region, navigationControl: screen.navigationControl, terminalText: screen.result},
            control: {id: contract.actionControlId ?? screen.navigationControlId, role: "button", accessibleName: matchedLabel, enabled: true},
            precondition: {enabled: true, disabled: false, disabledExplanation: null, accessibleName: matchedLabel, region: screen.region},
            interaction,
            transaction,
            contextRevalidation: {
                browserRequestId: contextRequestId,
                method: "GET",
                path: "/api/project/context",
                status: 200,
                responseSha256: hash(JSON.stringify({status: "loaded"})),
                projectStatus: "loaded",
                completedBeforeSelection: true,
            },
            request: {
                path: contract.api,
                method: contract.method,
                bodyKind: contract.body ?? null,
                bodySha256,
                responseSha256,
                status: 200,
                browserRequestId: actionRequestId,
                initiator: "rendered-control",
            },
            terminal: {
                status: "completed",
                complete: true,
                resultSha256: responseSha256,
                artifact: contract.artifact ?? null,
                result,
                source: contract.poll ? "rendered-poll" : "response",
                ...(contract.poll ? {jobId, pollPath: contract.poll.replace("{id}", encodeURIComponent(jobId)), browserRequestId: pollRequestId} : {}),
            },
            renderedTerminal: {
                state: "rendered",
                observedAfterRequestId: actionRequestId,
                beforeTextSha256: hash(`Before ${observation} request.`),
                text: `The rendered ${observation} result completed.`,
                textSha256: hash(`The rendered ${observation} result completed.`),
                resultSha256: responseSha256,
                observedAt: stamp(1),
                changedAfterRequest: true,
                lifecycle: {
                    role: "status",
                    terminal: "completed",
                    text: `The rendered ${observation} lifecycle result completed.`,
                    controlId: contract.actionControlId ?? screen.navigationControlId,
                    stateClass: transactionState,
                    ...(contract.poll ? {jobId} : {}),
                    ...(contract.body === "outcome-library" ? {operation: "outcome-library", receipt: "durable-terminal", durableJobId: jobId, durableStatus: "completed"} : {}),
                    artifact: contract.artifact === undefined ? null : {name: contract.artifact, accessibleName: `Open ${contract.artifact}`,
                        ...(contract.actionControlId === "artifact-build-parWorkbook" ? {target: artifactResult.target, outputPath: artifactResult.outputPath} : {}),
                        ...(contract.body === "outcome-library" ? {outputPath: `/outputs/${jobId}`} : {})},
                },
            },
            workflow: {
                persona,
                source: "rendered-control",
                transactionState,
                expectedApi: contract.api,
                expectedMethod: contract.method,
                expectedBodyKind: contract.body ?? null,
                expectedArtifact: contract.artifact ?? null,
                terminal: contract.terminal,
            },
            state: {
                text: "Studio controls",
                controls: [],
                overflow: false,
                accessibility: {namedRegions: [screen.region], visibleFocus: true, unexplainedDisabledControls: 0},
            },
        }),
    };
};

test("transaction state classes are accepted only from rendered control or result receipts", () => {
    assert.equal(p805TransactionStateClass("navigation"), "navigation");
    assert.equal(p805TransactionStateClass({transactionState: "read-only-operation"}), "read-only-operation");
    assert.equal(p805TransactionStateClass({stateClass: "editable-submission"}), "editable-submission");
    assert.equal(p805TransactionStateClass({method: "GET", body: "audit-only-inference"}), undefined);
    assert.equal(p805TransactionStateClass("unsupported"), undefined);
});

async function campaignFixture({initialOverflow = false, throughController = false} = {}) {
    const directory = await mkdtemp(path.join(os.tmpdir(), "pokie-p8-05-campaign-"));
    let sequence = 0;
    const evidence = async (candidate, kind, at, observationIds = [], contents) => {
        const evidenceSequence = ++sequence;
        const defaults = {
            "cli-transcript": `PACKED_INSTALL\npacked CLI create\npacked CLI WASM run\npacked CLI serve\n${P805_PUBLIC_HELP_ARGUMENTS.map((args) => `packed CLI help ${args.join("-")} ${args.join(" ")}`).join("\n")}\n${Object.values(P805_WORKFLOW_CONTRACTS).flatMap((contracts) => Object.values(contracts).map((contract) => contract.cli ?? "")).join("\n")}\n`,
            "browser-log": "[]",
            "api-log": JSON.stringify([{path: "/api/health"}, {path: "/api/project/simulations"}]),
            error: "no errors\n",
            timing: JSON.stringify(timings),
            reproduction: "Persona: ui-ux\n",
            artifact: JSON.stringify({
                candidateId: candidate.candidateId,
                candidatePackageSha256: candidate.candidatePackageSha256,
                packedPackageSha256: candidate.candidatePackageSha256,
            }),
        };
        let body = contents ?? defaults[kind] ?? `P8-05 bounded ${kind} ${evidenceSequence}\n`;
        if (kind === "page-state" && JSON.parse(body).kind === "p8-05-runtime-observation") {
            const runtime = JSON.parse(body), viewport = {width:{wide:1440, compact:960, narrow:390}[runtime.viewport], height:{wide:900, compact:800, narrow:844}[runtime.viewport]};
            for (const captured of Object.values(runtime.transactions)) captured.viewport = viewport;
            body = JSON.stringify(runtime);
        }
        const relativePath = `records/${evidenceSequence}.txt`;
        await mkdir(path.join(directory, "records"), {recursive: true});
        await writeFile(path.join(directory, relativePath), body);
        return {
            evidenceId: `e-${evidenceSequence}`,
            path: relativePath,
            sha256: hash(body),
            sizeBytes: Buffer.byteLength(body),
            capturedAt: at,
            kind,
            observationIds,
            ...candidate,
        };
    };
    const audit = async (persona, phase, candidate, offset, tuple) => {
        const observations = tuple ? [tuple.observation] : P805_REQUIRED_OBSERVATIONS[persona],
            artifacts = [];
        for (const [index, kind] of P805_REQUIRED_EVIDENCE_KINDS.filter(
            (kind) => !["live-dom-transaction", "page-state", "screenshot"].includes(kind),
        ).entries())
            artifacts.push(await evidence(candidate, kind, stamp(offset + 2 + index), observations));
        const actions = [],
            apiEntries = [{path: "/api/health"}], browserEvents = [];
        for (const [index, observation] of observations.entries()) {
            const contract = P805_WORKFLOW_CONTRACTS[persona][observation],
                source = liveDomTransaction(persona, observation, contract, "wide");
            apiEntries.push({
                observation,
                method: "GET",
                path: "/api/project/context",
                status: 200,
                payload: {status: "loaded"},
                browserRequestId: source.contextRevalidation.browserRequestId,
                responseSha256: source.contextRevalidation.responseSha256,
                initiator: "rendered-navigation-context",
            });
            browserEvents.push(
                {method: "Network.requestWillBeSent", params: {requestId: source.contextRevalidation.browserRequestId, request: {url: "http://127.0.0.1/api/project/context", method: "GET"}}},
                {method: "Network.responseReceived", params: {requestId: source.contextRevalidation.browserRequestId, response: {status: 200}}},
            );
            apiEntries.push({
                observation,
                method: contract.method,
                path: contract.api,
                bodyKind: contract.body ?? null,
                bodySha256: source.bodySha256,
                responseSha256: source.responseSha256,
                status: 200,
                payload: source.result,
                browserRequestId: source.actionRequestId ?? `browser-${persona}-${observation}-wide`,
                initiator: "rendered-control",
            });
            browserEvents.push(
                {method: "Network.requestWillBeSent", params: {requestId: source.actionRequestId ?? `browser-${persona}-${observation}-wide`, request: {url: `http://127.0.0.1${contract.api}`, method: contract.method, ...(contract.body === undefined ? {} : {postData: contract.body})}}},
                {method: "Network.responseReceived", params: {requestId: source.actionRequestId ?? `browser-${persona}-${observation}-wide`, response: {status: 200}}},
            );
            if (contract.poll) apiEntries.push({
                observation,
                method: "GET",
                path: contract.poll.replace("{id}", encodeURIComponent(source.result.id)),
                status: 200,
                payload: source.result,
                browserRequestId: source.pollRequestId ?? `poll-${persona}-${observation}-wide`,
                initiator: "rendered-poll",
            });
            if (contract.poll) browserEvents.push({method: "Network.requestWillBeSent", params: {requestId: source.pollRequestId ?? `poll-${persona}-${observation}-wide`, request: {url: `http://127.0.0.1${contract.poll.replace("{id}", encodeURIComponent(source.result.id))}`, method: "GET"}}});
            for (const actionViewport of (tuple ? [tuple.viewport] : ["wide", "compact", "narrow"])) {
                // A responsive record must contain the actual state captured
                // at that viewport.  Reusing a wide JSON/screenshot under a
                // compact action is precisely the drift the campaign rejects.
                const viewportSource = liveDomTransaction(persona, observation, contract, actionViewport),
                    screenshot = await evidence(candidate, "screenshot", stamp(offset + 20 + index), [observation]),
                    page = await evidence(candidate, "live-dom-transaction", stamp(offset + 21 + index), [observation], viewportSource.contents);
                if (actionViewport !== "wide") {
                    apiEntries.push(
                        {observation, method: "GET", path: "/api/project/context", status: 200, payload: {status: "loaded"}, browserRequestId: viewportSource.contextRevalidation.browserRequestId, responseSha256: viewportSource.contextRevalidation.responseSha256, initiator: "rendered-navigation-context"},
                        {observation, method: contract.method, path: contract.api, bodyKind: contract.body ?? null, bodySha256: viewportSource.bodySha256, responseSha256: viewportSource.responseSha256, status: 200, payload: viewportSource.result, browserRequestId: `browser-${persona}-${observation}-${actionViewport}`, initiator: "rendered-control"},
                    );
                    browserEvents.push(
                        {method: "Network.requestWillBeSent", params: {requestId: viewportSource.contextRevalidation.browserRequestId, request: {url: "http://127.0.0.1/api/project/context", method: "GET"}}},
                        {method: "Network.responseReceived", params: {requestId: viewportSource.contextRevalidation.browserRequestId, response: {status: 200}}},
                        {method: "Network.requestWillBeSent", params: {requestId: `browser-${persona}-${observation}-${actionViewport}`, request: {url: `http://127.0.0.1${contract.api}`, method: contract.method, ...(contract.body === undefined ? {} : {postData: contract.body})}}},
                        {method: "Network.responseReceived", params: {requestId: `browser-${persona}-${observation}-${actionViewport}`, response: {status: 200}}},
                    );
                    if (contract.poll) {
                        apiEntries.push({observation, method: "GET", path: contract.poll.replace("{id}", encodeURIComponent(viewportSource.result.id)), status: 200, payload: viewportSource.result, browserRequestId: `poll-${persona}-${observation}-${actionViewport}`, initiator: "rendered-poll"});
                        browserEvents.push({method: "Network.requestWillBeSent", params: {requestId: `poll-${persona}-${observation}-${actionViewport}`, request: {url: `http://127.0.0.1${contract.poll.replace("{id}", encodeURIComponent(viewportSource.result.id))}`, method: "GET"}}});
                    }
                }
                artifacts.push(screenshot, page);
                actions.push({
                persona,
                observation,
                route: viewportSource.route,
                expectedControl: contract.control,
                expectedActionControl: contract.actionControl ?? contract.control,
                expectedMethod: contract.method,
                expectedBodyKind: contract.body ?? null,
                expectedApi: contract.api,
                expectedArtifact: contract.artifact ?? null,
                expectedTerminal: contract.terminal,
                terminal: {status: "completed", resultSha256: viewportSource.responseSha256, result: viewportSource.result, ...(contract.poll ? {jobId: viewportSource.result.id} : {})},
                evidenceId: page.evidenceId,
                screenshotEvidenceId: screenshot.evidenceId,
                viewport: actionViewport,
                elapsedMs: 1,
                overflow: false,
                screenState: contract.route,
                screenNavigationControl: P805_SCREEN_CONTROL_STATES[contract.route].navigationControl,
                stableControlId: contract.actionControlId ?? P805_SCREEN_CONTROL_STATES[contract.route].navigationControlId,
                domControlId: contract.actionControlId ?? P805_SCREEN_CONTROL_STATES[contract.route].navigationControlId,
                identityAttribute: "id",
                browserRequestId: `browser-${persona}-${observation}-${actionViewport}`,
                contextRevalidation: viewportSource.contextRevalidation,
                precondition: {enabled: true, disabled: false, disabledExplanation: null, accessibleName: viewportSource.interaction.matchedLabel, region: P805_SCREEN_CONTROL_STATES[contract.route].region},
                visibleTerminal: {state: "rendered", observedAfterRequestId: `browser-${persona}-${observation}-${actionViewport}`, resultSha256: viewportSource.responseSha256, changedAfterRequest: true, lifecycle: {controlId: contract.actionControlId ?? P805_SCREEN_CONTROL_STATES[contract.route].navigationControlId, stateClass: viewportSource.transaction.stateClass, ...(contract.poll ? {jobId: viewportSource.result.id} : {}), artifact: contract.artifact === undefined ? null : {name: contract.artifact, accessibleName: `Open ${contract.artifact}`,...(contract.actionControlId === "artifact-build-parWorkbook" ? {target: viewportSource.result.result.target, outputPath: viewportSource.result.result.outputPath} : {})}}},
                accessibility: {namedRegions: [P805_SCREEN_CONTROL_STATES[contract.route].region], visibleFocus: true, unexplainedDisabledControls: 0},
                interaction: viewportSource.interaction,
                transaction: viewportSource.transaction,
                });
            }
        }
        const replayArtifacts = Object.fromEntries(["valid", "invalid", "recovered"].map((name) => {
            const status = name === "invalid" ? 400 : 200, payload = status === 400 ? {error:"round must be positive"} : {round:1, seed:"p8-05", artifactWarnings:[]};
            const captured = transaction("replay-artifact", "replay-artifact-load", "Validate & load");
            captured.request = {browserRequestId:`artifact-${phase}-${persona}-${tuple.observation}-${tuple.viewport}-${name}`, method:"POST", path:"/api/project/replays/inspect-artifact", status, responseSha256:hash(JSON.stringify(payload))};
            captured.terminal = {status:status === 200 ? "loaded" : "error", source:"response", browserRequestId:captured.request.browserRequestId, causedByRequestId:captured.request.browserRequestId, resultSha256:hash(JSON.stringify(payload))};
            const submitted = JSON.stringify(status === 400 ? {round:0, seed:"invalid-artifact"} : {round:1, seed:"p8-05"});
            captured.viewport = {width:{wide:1440, compact:960, narrow:390}[tuple.viewport], height:{wide:900, compact:800, narrow:844}[tuple.viewport]};
            captured.request.bodySha256 = hash(submitted);
            captured.formState = {operation:"replay-artifact", fields:[{stableControlId:"replay-artifact-json", value:JSON.stringify(JSON.parse(submitted), null, 2)}]};
            browserEvents.push({method:"Network.requestWillBeSent", params:{requestId:captured.request.browserRequestId, request:{method:"POST", url:"http://localhost/api/project/replays/inspect-artifact", postData:submitted}}}, {method:"Network.responseReceived", params:{requestId:captured.request.browserRequestId, response:{url:"http://localhost/api/project/replays/inspect-artifact", status}}});
            apiEntries.push({...captured.request, payload, initiator:"rendered-control"});
            return [name, {payload, transaction:captured, screenshotEvidenceId:artifacts.find((item) => item.kind === "screenshot").evidenceId, rendered:{controlId:"replay-artifact-load", status:status === 200 ? "loaded" : "error", text:status === 200 ? "Round 1, seed p8-05." : "round must be positive", ...(status === 200 ? {round:"1", seed:"p8-05"} : {})}}];
        }));
        const retryTransaction = pointerTransaction("simulation-retry", "simulation-retry", "recovery-operation", "completed", "simulation-retry"),
            restartTransaction = pointerTransaction("simulation", "simulation-run", "editable-submission", "recovery-required", "simulation-restart"),
            runtime = await evidence(
            candidate,
            "page-state",
            stamp(offset + 30),
            [],
            JSON.stringify({
                kind: "p8-05-runtime-observation",
                viewport: tuple.viewport,
                replayArtifacts,
                transactions: {
                    activeReloadStart: transaction("simulation", "simulation-run", "Run Simulation"),
                    activeReloadCancellation: transaction("simulation-cancel", "simulation-cancel", "Cancel", true),
                    simulationFailure: transaction("simulation", "simulation-run", "Run Simulation"),
                    simulationSuccess: transaction("simulation", "simulation-run", "Run Simulation"),
                    replayFailure: replayArtifacts.invalid.transaction,
                    replaySuccess: transaction("replay", "replay-run", "Run again"),
                    replayRecovery: replayArtifacts.recovered.transaction,
                    cancellableSimulation: transaction("simulation", "simulation-run", "Run Simulation"),
                    cooperativeCancellation: transaction("simulation-cancel", "simulation-cancel", "Cancel", true),
                    simulationRetry: retryTransaction,
                    restartSimulation: restartTransaction,
                },
                recovery: {
                    reloadReconnect: true,
                    projectSwitch: true,
                    staleResponseIsolation: true,
                    unsavedWorkProtection: true,
                    serverRestart: true,
                },
                reload: {
                    activeJobId: "simulation-active-reload",
                    terminal: {id: "simulation-active-reload", status: "cancelled"},
                    discoveredAfterReload: true,
                },
                staleResponse: {
                    responseCount: 1,
                    delayedRequestId: "delayed-project-context",
                    completedAfterSwitch: true,
                    sourceRoute: "#/project/first/overview",
                    destinationRoute: "#/project/second/overview",
                },
                projectSwitchReceipt: {
                    cancelledProjectOpen: {
                        routeBefore: "#/home/projects",
                        routeAfter: "#/home/projects",
                        projectOpenRequestCount: 0,
                        stayControl: {stableControlId: "design-navigation-guard-stay", identityAttribute: "id", accessibleName: "Stay", keyboardFocused: true, enabled: true, disabled: false},
                        stayActivation: nativePointerActivation("design-navigation-guard-stay"),
                    },
                    startGameNavigation: {
                        routeBefore: "#/home/projects",
                        routeAfter: "#/home/design",
                        control: {stableControlId: "home-tab:design", identityAttribute: "id", accessibleName: "Start a game", keyboardFocused: true, enabled: true, disabled: false, lifecycle: {kind: "navigation", value: "design"}},
                        activation: nativePointerActivation("home-tab:design"),
                    },
                    createdProject: {
                        route: "#/project/second/overview",
                        control: {stableControlId: "blueprint-create-game", identityAttribute: "id", accessibleName: "Create game", keyboardFocused: true, enabled: true, disabled: false},
                        activation: nativePointerActivation("blueprint-create-game"),
                    },
                    staleResponse: {responseCount: 1, delayedRequestId: "delayed-project-context", completedAfterSwitch: true, sourceRoute: "#/home/projects", destinationRoute: "#/project/second/overview"},
                    destinationRoute: "#/project/second/overview",
                },
                unsavedWork: {
                    editedControl: "Game basics name",
                    editControl: {stableControlId: "game-model-basics-edit", identityAttribute: "id", accessibleName: "Edit", keyboardFocused: true, input:{kind:"native-text", text:" P805 unsaved", value:"Game P805 unsaved"}},
                    navigationControl: {stableControlId: "project-tab:overview", identityAttribute: "id", accessibleName:"Overview", keyboardFocused:true, activation:nativePointerActivation("project-tab:overview")},
                    cancelControl: {stableControlId: "game-model-unsaved-stay", identityAttribute: "id", accessibleName:"Stay", keyboardFocused:true, activation:nativePointerActivation("game-model-unsaved-stay")},
                    protectionText: "You have unsaved changes to this game model section. Leave and lose them?",
                    preserved: true,
                },
                restart: {activeJobId: "simulation-restart", recovered: true},
                jobs: {
                    success: {id: "simulation-completed", status: "completed"},
                    actionableFailure: {error: "Rounds must be positive"},
                    cooperativeCancellation: {id: "simulation-cancelled", status: "cancelled"},
                    retryWithoutPartialArtifacts: {id: "simulation-retry", status: "completed"},
                    restartRecovery: {id: "simulation-restart", status: "recovery-required"},
                },
                outcomes: {
                    cancelledSimulationId: "simulation-cancelled",
                    reports: [{id: "simulation-completed"}, {id: "simulation-retry"}],
                    cancelledReportAbsent: true,
                },
            }),
        );
        const runtimeValue = JSON.parse(await readFile(path.join(directory, runtime.path), "utf8"));
        for (const captured of Object.values(runtimeValue.transactions)) captured.viewport = {width:{wide:1440, compact:960, narrow:390}[tuple.viewport], height:{wide:900, compact:800, narrow:844}[tuple.viewport]};
        Object.assign(retryTransaction, runtimeValue.transactions.simulationRetry);
        Object.assign(restartTransaction, runtimeValue.transactions.restartSimulation);
        const runtimeContents = JSON.stringify(runtimeValue);
        await writeFile(path.join(directory, runtime.path), runtimeContents);
        runtime.sha256 = hash(runtimeContents); runtime.sizeBytes = Buffer.byteLength(runtimeContents);
        artifacts.push(runtime);
        const apiEvidence = artifacts.find((item) => item.kind === "api-log");
        await writeFile(path.join(directory, apiEvidence.path), JSON.stringify(apiEntries));
        const apiBytes = await readFile(path.join(directory, apiEvidence.path));
        apiEvidence.sha256 = hash(apiBytes);
        apiEvidence.sizeBytes = apiBytes.length;
        const browserEvidence = artifacts.find((item) => item.kind === "browser-log");
        await writeFile(path.join(directory, browserEvidence.path), JSON.stringify(browserEvents));
        const browserBytes = await readFile(path.join(directory, browserEvidence.path));
        browserEvidence.sha256 = hash(browserBytes);
        browserEvidence.sizeBytes = browserBytes.length;
        const cleanup = artifacts.find((item) => item.kind === "cleanup");
        await writeFile(
            path.join(directory, cleanup.path),
            JSON.stringify({
                kind: "p8-05-cleanup",
                exit:"success",
                processTreeDrained: true,
                resourcesDrained: true,
                contextRemoved: true,
                ownership: [
                    {pid: 1, spawnedAt: stamp(offset), drain: {processTreeDrained: true, resourcesDrained: true}},
                ],
            }),
        );
        const cleanupBytes = await readFile(path.join(directory, cleanup.path));
        cleanup.sha256 = hash(cleanupBytes);
        cleanup.sizeBytes = cleanupBytes.length;
        const artifact = artifacts.find((item) => item.kind === "artifact");
        await writeFile(
            path.join(directory, artifact.path),
            JSON.stringify({
                candidateId: candidate.candidateId,
                candidatePackageSha256: candidate.candidatePackageSha256,
                packedPackageSha256: candidate.candidatePackageSha256,
                archiveGitHead: candidate.candidateId,
                candidatePackageJsonSha256: "f".repeat(64),
                installedPackageJsonSha256: "f".repeat(64),
                declaredCandidateExecutableSha256: candidate.candidateExecutableSha256,
                candidateExecutableSha256: candidate.candidateExecutableSha256,
                candidateExecutableReceiptSha256: candidate.candidateExecutableReceipt.sha256,
                candidateExecutableReceiptId: "pack-verifier-receipt",
                candidateExecutableReceiptIssuer: "pack-verifier",
                candidateTreeManifestCandidateId: candidate.candidateId,
                candidateTreeManifestSha256: "e".repeat(64),
                candidateTreeObjectId: "9".repeat(40),
            }),
        );
        const artifactBytes = await readFile(path.join(directory, artifact.path));
        artifact.sha256 = hash(artifactBytes);
        artifact.sizeBytes = artifactBytes.length;
        const overflow = initialOverflow && phase === "initial" && tuple.persona === "ui-ux" && tuple.observation === "onboarding-terminology-forms-progress" && tuple.viewport === "wide";
        if (overflow) {
            actions[0].overflow = true;
            const page = artifacts.find((item) => item.evidenceId === actions[0].evidenceId), value = JSON.parse(await readFile(path.join(directory, page.path), "utf8"));
            value.state.overflow = true;
            const bytes = JSON.stringify(value);
            await writeFile(path.join(directory, page.path), bytes);
            page.sha256 = hash(bytes); page.sizeBytes = Buffer.byteLength(bytes);
        }
        const measured = runtime.evidenceId, restartScreenshot = artifacts.find((item) => item.kind === "screenshot"), auditId = `${phase}-${persona}-${tuple.observation}-${tuple.viewport}`;
        await mkdir(path.join(directory, "checkpoints"), {recursive: true});
        const checkpointReceipts = await Promise.all(actions.map(async (action, index) => {
            const sequence = index + 1, receiptId = `${auditId}-checkpoint-${sequence}`,
                capturedAt = stamp(offset + 50 + sequence), relativePath = `checkpoints/${auditId}-${sequence}.json`,
                contents = `${JSON.stringify({schemaVersion: 1, kind: "p8-05-packed-workflow-checkpoint", receiptId, auditId, worker:{pid:offset + 2, nonce:`${phase}-${persona}-${offset}`}, runNonce: `${phase}-${persona}-${offset}`, sequence, status: "passed", capturedAt, candidateId: candidate.candidateId, candidatePackageSha256: candidate.candidatePackageSha256, phase, persona: action.persona ?? persona, observation: action.observation, viewport: action.viewport, action})}\n`;
            await writeFile(path.join(directory, relativePath), contents);
            return {receiptId, path: relativePath, sha256: hash(contents), sizeBytes: Buffer.byteLength(contents), capturedAt, candidateId: candidate.candidateId, candidatePackageSha256: candidate.candidatePackageSha256, persona: action.persona ?? persona, observation: action.observation, viewport: action.viewport, actionSha256: hash(JSON.stringify(action))};
        }));
        return {
            auditId,
            tuple,
            worker:{pid:offset + 2, nonce:`${phase}-${persona}-${offset}`},
            workflowPersonas:[persona],
            persona,
            phase,
            ...candidate,
            packageIdentity: {
                archiveSha256: candidate.candidatePackageSha256,
                archiveGitHead: candidate.candidateId,
                candidatePackageJsonSha256: "f".repeat(64),
                installedCli: "/packed/node_modules/.bin/pokie",
                installedPackageJsonSha256: "f".repeat(64),
                declaredCandidateExecutableSha256: candidate.candidateExecutableSha256,
                candidateExecutableSha256: candidate.candidateExecutableSha256,
                candidateExecutableReceiptSha256: candidate.candidateExecutableReceipt.sha256,
                candidateExecutableReceiptId: "pack-verifier-receipt",
                candidateExecutableReceiptIssuer: "pack-verifier",
                candidateExecutableFiles: 1,
                candidateTreeManifestCandidateId: candidate.candidateId,
                candidateTreeManifestSha256: "e".repeat(64),
                candidateTreeObjectId: "9".repeat(40),
            },
            startedAt: stamp(offset),
            endedAt: stamp(offset + 100),
            cleanContext: {
                workspace: `/tmp/p8-05-${auditId}-work`,
                configurationRoot: `/tmp/p8-05-${auditId}-config`,
                browserProfile: `/tmp/p8-05-${auditId}-profile`,
                reused: false,
            },
            observations,
            observationEvidence: Object.fromEntries(actions.map((action) => [action.observation, action.evidenceId])),
            timings,
            performance: p805OperationPerformance(timings),
            cleanup: {
                processTreeDrained: true,
                resourcesDrained: true,
                contextRemoved: true,
                evidenceId: cleanup.evidenceId,
            },
            checkpointReceipts,

            finalResult: {status: "passed", aggregation: "verified-checkpoint-receipts-only", chunks: checkpointReceipts.length, checkpointReceiptSha256s: checkpointReceipts.map((receipt) => receipt.sha256), cleanupEvidenceId: cleanup.evidenceId},
            rendered: {
                ...rendered,
                viewports:[tuple.viewport],
                responsive:rendered.responsive.filter((item) => item.viewport === tuple.viewport).map((item) => ({...item, overflow})),
                measurements:{...rendered.measurements, documentOverflow:overflow},
                defects: overflow ? [{kind:"overflow", evidenceId:actions[0].evidenceId}] : [],
                actions,
                recovery: Object.fromEntries(
                    [
                        "reloadReconnect",
                        "projectSwitch",
                        "staleResponseIsolation",
                        "unsavedWorkProtection",
                        "serverRestart",
                    ].map((key) => [key, {observed: true, evidenceId: measured}]),
                ),
                jobs: {
                    success: {observed: true, evidenceId: measured},
                    actionableFailure: {observed: true, evidenceId: measured},
                    cooperativeCancellation: {observed: true, evidenceId: measured},
                    retryWithoutPartialArtifacts: {observed: true, evidenceId: measured, receipt: {operation: "simulation-retry", controlId: "simulation-retry", stateClass: "recovery-operation", transaction: retryTransaction}},
                    restartRecovery: {observed: true, evidenceId: measured, receipt: {
                        operation: "simulation", controlId: "simulation-run", stateClass: "editable-submission", capturedJobId: "simulation-restart", transaction: restartTransaction,
                        terminal: {status: "recovery-required", jobId: "simulation-restart", operation: "simulation", request: {rounds: 1, workers: 1}, resultSha256: restartTransaction.terminal.resultSha256, causedByRequestId: restartTransaction.request.browserRequestId},
                        rendered: {
                            resultControlId: "simulation-run", resultOperation: "simulation", resultStateClass: "editable-submission", resultReceipt: "durable-terminal", resultJobId: "simulation-restart", resultRequestId: "simulation-restart", resultTerminal: "recovery-required", resultRecovery: "restart-reconciled", resultExecutor: "unavailable-after-restart", renderedTerminal: true,
                            postRestartReplacementState: {capturedControlId: "simulation-run", captureKey: restartTransaction.pointerActivations[0].captureKey, controlState: "replaced-after-restart", currentControlId: "simulation-run", capturedControlConnected: false},
                        },
                        timing: {elapsedMs: 1},
                        evidence: {screenshotEvidenceId: restartScreenshot.evidenceId, cleanupEvidenceId: cleanup.evidenceId},
                        ownedProcessDrain: {
                            processTreeDrained: true,
                            resourcesDrained: true,
                            priorStudioShutdown: {
                                shutdown: {kind: "abrupt-service-loss", gracefulShutdownReceived: false, requestedSignal: "SIGKILL", observedSignal: "SIGKILL"},
                                processStateBeforeLoss: {status: "running", updatedAt: 1},
                                durableJobBeforeLoss: {
                                    id: "simulation-restart",
                                    operation: "simulation",
                                    status: "running",
                                    terminal: false,
                                    request: {rounds: 1, workers: 1},
                                    causedByRequestId: restartTransaction.request.browserRequestId,
                                },
                                durableJob: {
                                    id: "simulation-restart",
                                    operation: "simulation",
                                    status: "running",
                                    terminal: false,
                                    request: {rounds: 1, workers: 1},
                                    causedByRequestId: restartTransaction.request.browserRequestId,
                                },
                            },
                        },
                    }},
                },
            },
            evidence: artifacts,
        };
    };
    const collect = async (phase, candidate, baseOffset) => {
        const tuples = P805_PERSONAS.flatMap((persona) => P805_REQUIRED_OBSERVATIONS[persona].flatMap((observation) => ["wide", "compact", "narrow"].map((viewport) => ({persona, observation, viewport}))));
        const children = [], acceptedReceipts = [], audits = [];
        await Promise.all(tuples.map(async (tuple, index) => {
            const value = await audit(tuple.persona, phase, candidate, baseOffset + index, tuple);
            if (!["simulation-success-failure-cancellation", "outcome-library-report-diff-replay", "replay-artifact-success-failure-recovery", "reload-reconnect-recovery-cancellation-project-switch"].includes(tuple.observation)) {
                value.timings = {...value.timings, validationMs:null, simulationMs:null, replayMs:null, cancellationMs:null};
                value.performance = p805OperationPerformance(value.timings);
            }
            value.timings = {...value.timings, startupMs:index + 1};
            value.performance.startupMs.elapsedMs = index + 1;
            const timingEvidence = value.evidence.find((item) => item.kind === "timing"), timingContents = JSON.stringify(value.timings);
            await writeFile(path.join(directory, timingEvidence.path), timingContents);
            timingEvidence.sha256 = hash(timingContents); timingEvidence.sizeBytes = Buffer.byteLength(timingContents);
            const namespace = `${phase}/${tuple.persona}/${value.worker.nonce}`;
            await mkdir(path.join(directory, namespace), {recursive:true});
            for (const item of [...value.evidence, ...value.checkpointReceipts]) {
                const nextPath = `${namespace}/${path.basename(item.path)}`;
                await rename(path.join(directory, item.path), path.join(directory, nextPath));
                item.path = nextPath;
            }
            const recoveryRequired = ["simulation-success-failure-cancellation", "outcome-library-report-diff-replay", "replay-artifact-success-failure-recovery", "reload-reconnect-recovery-cancellation-project-switch"].includes(tuple.observation);
            value.workflowScope = {kind:"p8-05-single-tuple-workflow-scope", tuple, bootstrap:tupleBootstrapContract(tuple).map((item) => ({...item, evidenceId:value.evidence[0].evidenceId})), scopeEvidenceId:value.evidence[0].evidenceId, recoveryRequired};
            if (!recoveryRequired) { value.rendered.recovery = {}; value.rendered.jobs = {}; }
            if (tuple.observation === "outcome-library-report-diff-replay") {
                value.workflowScope.compoundCliOutputs = tupleBootstrapContract(tuple).filter((item) => item.kind === "packed-cli-output").map(({output, command}) => {
                    const contents = Buffer.from(`fixture-${phase}-${output}`), files = [{path:output, sha256:hash(contents), sizeBytes:contents.length, contentsBase64:contents.toString("base64")}];
                    return {kind:"p8-05-packed-cli-output", output, command, ...candidate, evidenceId:value.evidence[0].evidenceId, files, sha256:hash(JSON.stringify(files))};
                });
            }
            const save = async (name, record) => { const contents = `${JSON.stringify(record)}\n`; await writeFile(path.join(directory, name), contents); return hash(contents); };
            const cleanupEvidence = value.evidence.find((item) => item.evidenceId === value.cleanup.evidenceId), cleanupRecord = JSON.parse(await readFile(path.join(directory, cleanupEvidence.path), "utf8"));
            value.cleanup = {...cleanupRecord, evidenceId:cleanupEvidence.evidenceId};
            const cleanup = {schemaVersion:1, kind:"p8-05-packed-tuple-cleanup", phase, ...candidate, tuple, worker:value.worker, cleanup:cleanupRecord, cleanupEvidenceId:value.cleanup.evidenceId};
            const cleanupPath = `${value.auditId}-cleanup.json`, cleanupSha256 = await save(cleanupPath, cleanup);
            const receipt = {schemaVersion:1, kind:"p8-05-packed-tuple-receipt", status:"passed", phase, ...candidate, tuple, worker:value.worker, auditId:value.auditId, action:value.rendered.actions[0], checkpointReceipt:value.checkpointReceipts[0], cleanupEvidenceId:value.cleanup.evidenceId, cleanupSha256};
            const auditPath = `${value.auditId}-audit.json`, auditSha256 = await save(auditPath, value), tupleReceiptPath = `${value.auditId}-receipt.json`, tupleReceiptSha256 = await save(tupleReceiptPath, receipt);
            children[index] = {tuple, worker:value.worker, auditPath, auditSha256, tupleReceiptPath, tupleReceiptSha256, cleanupPath, cleanupSha256, checkpointReceiptSha256s:[value.checkpointReceipts[0].sha256], cleanupEvidenceId:value.cleanup.evidenceId, exitCode:0, signal:null, parentCleanup:{processTreeDrained:true, resourcesDrained:true}};
            acceptedReceipts[index] = {tuple, receiptPath:tupleReceiptPath, receiptSha256:tupleReceiptSha256, cleanupPath, cleanupSha256, receipt, cleanup};
            audits[index] = value;
        }));
        const ledger = {kind:"p8-05-process-isolated-packed-proof", status:"passed", ...candidate, parent:{pid:1}, runtime:{kind:"p8-05-immutable-packed-runtime", root:directory, receiptPath:"runtime.json", receiptSha256:"a".repeat(64), ...candidate, archiveSha256:candidate.candidatePackageSha256, installationCount:1, permissions:"read-only-before-any-tuple-child"}, children, acceptedReceipts, finalResult:{status:"passed", children:tuples.length, checkpointReceipts:tuples.length, aggregation:"independently-verified-immutable-tuple-child-receipts-only"}};
        const aggregated = aggregateP805PersonaAudits(audits, ledger, phase, candidate);
        // Exercise the collector boundary in the controller-to-closeout cases.
        // Other cases already authenticate these children in final validation.
        if (throughController) await validateP805CollectedAudits(directory, aggregated, phase, candidate);
        return aggregated;
    };
    const initialAudits = await collect("initial", initial, 100);
    const retests = await collect("retest", retest, 1000);
    const finding = {
        id: "F-1",
        severity: "P2",
        material: true,
        persona: "ui-ux",
        publicSurface: "Studio Simulation",
        reproducer: "Run then cancel",
        owner: "cli/studio",
        status: "resolved",
        evidence: await evidence(initial, "finding", stamp(700)),
    };
    if (initialOverflow) {
        const source = initialAudits.find((audit) => audit.persona === "ui-ux"), measured = source.rendered.defects[0];
        finding.evidence = source.evidence.find((item) => item.evidenceId === measured.evidenceId);
        finding.measurement = {kind:"overflow", evidenceId:finding.evidence.evidenceId, sha256:finding.evidence.sha256};
    }
    const write = async (name, value) => writeFile(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`);
    const initialRecord = {schemaVersion: P805_SCHEMA_VERSION, campaignId: "p8-05-fixture", audits: initialAudits};
    await write("PROVENANCE.json", {
        schemaVersion: P805_SCHEMA_VERSION,
        campaignId: "p8-05-fixture",
        startedAt: stamp(1),
        cleanRoomAttestation:
            "I recorded each initial persona audit before reading prior findings, source, fixes, or prior campaign evidence.",
        initialCandidate: initial,
    });
    await write("initial-audits.json", initialRecord);
    const frozen = {
        schemaVersion: P805_SCHEMA_VERSION,
        campaignId: "p8-05-fixture",
        ...initial,
        frozenAt: stamp(800),
        findings: [{...finding, status:"open"}],
    };
    const anchor = path.join(path.dirname(directory), `${path.basename(directory)}-freeze.json`);
    frozen.externalAnchor = {path: anchor, sha256: "0".repeat(64), anchoredAt: stamp(850)};
    const {externalAnchor, ...frozenPayload} = frozen;
    const frozenContents = `${JSON.stringify(frozenPayload, null, 2)}\n`;
    const anchorContents = `${JSON.stringify({
        kind: "p8-05-freeze-anchor",
        receiptId: "freeze-1",
        campaignId: "p8-05-fixture",
        ...initial,
        initialAuditsSha256: hash(`${JSON.stringify(initialRecord, null, 2)}\n`),
        frozenFindingsSha256: hash(frozenContents),
        anchoredAt: stamp(850),
    })}\n`;
    await writeFile(anchor, anchorContents);
    frozen.externalAnchor.sha256 = hash(anchorContents);
    await write("frozen-findings.json", frozen);
    const regressionEvidence = await evidence(retest, "regression-result", stamp(901)),
        regressionReceipt = path.join(path.dirname(directory), `${path.basename(directory)}-machine-receipt.json`),
        regressionResult = {
            kind: "p8-05-regression-result",
            testPath: "tests/cli/studio-client/src/P805ValeraPersonas.browser.test.tsx",
            candidateId: retest.candidateId,
            candidatePackageSha256: retest.candidatePackageSha256,
            passed: true,
            completedAt: stamp(902),
        };
    const receiptContents = `${JSON.stringify({
        kind: "p8-05-machine-receipt",
        receiptId: "independent-test-controller-1",
        issuer: "independent-test-controller",
        testPath: regressionResult.testPath,
        candidateId: retest.candidateId,
        candidatePackageSha256: retest.candidatePackageSha256,
        passed: true,
        resultSha256: hash(`${JSON.stringify(regressionResult)}\n`),
        authentication: {scheme: "verifier-owned-digest", verifierId: "independent-test-controller", attestedResultSha256: hash(`${JSON.stringify(regressionResult)}\n`)},
        completedAt: stamp(903),
    })}\n`;
    await writeFile(regressionReceipt, receiptContents);
    regressionResult.receipt = {path: regressionReceipt, sha256: hash(receiptContents)};
    await writeFile(path.join(directory, regressionEvidence.path), `${JSON.stringify(regressionResult)}\n`);
    const bytes = await readFile(path.join(directory, regressionEvidence.path));
    regressionEvidence.sha256 = hash(bytes);
    regressionEvidence.sizeBytes = bytes.length;
    await write("finding-register.json", {
        schemaVersion: P805_SCHEMA_VERSION,
        campaignId: "p8-05-fixture",
        findings: [finding],
    });
    await write("regressions.json", {
        schemaVersion: P805_SCHEMA_VERSION,
        campaignId: "p8-05-fixture",
        regressions: [
            {
                findingId: "F-1",
                testPath: "tests/cli/studio-client/src/P805ValeraPersonas.browser.test.tsx",
                commitId: retest.candidateId,
                candidatePackageSha256: retest.candidatePackageSha256,
                result: "passed",
                verifiedAt: stamp(900),
                assertions: ["cancelled job has no report"],
                machineResultEvidence: regressionEvidence,
            },
        ],
    });
    await write("retests.json", {
        schemaVersion: P805_SCHEMA_VERSION,
        campaignId: "p8-05-fixture",
        startedAt: stamp(950),
        audits: retests,
    });
    const manifestNames = [
            "PROVENANCE.json",
            "initial-audits.json",
            "frozen-findings.json",
            "finding-register.json",
            "regressions.json",
            "retests.json",
        ],
        manifestEvidence = new Map();
    for (const audit of [...initialAudits, ...retests])
        for (const item of audit.evidence) manifestEvidence.set(item.evidenceId, item.sha256);
    manifestEvidence.set(finding.evidence.evidenceId, finding.evidence.sha256);
    manifestEvidence.set(regressionEvidence.evidenceId, regressionEvidence.sha256);
    const manifest = {
        schemaVersion: P805_SCHEMA_VERSION,
        kind: "p8-05-immutable-manifest",
        campaignId: "p8-05-fixture",
        records: Object.fromEntries(
            await Promise.all(
                manifestNames.map(async (name) => [name, hash(await readFile(path.join(directory, name)))]),
            ),
        ),
        evidence: [...manifestEvidence].map(([evidenceId, sha256]) => ({evidenceId, sha256})),
        cleanupEvidence: [...initialAudits, ...retests].flatMap((audit) => audit.tupleReceipts.map((receipt) => receipt.cleanupEvidenceId)),
    };
    if (!throughController) await write("manifest.json", manifest);
    const uiux = retests.find((entry) => entry.persona === "ui-ux"),
        manifestSha256 = hash(`${JSON.stringify(manifest, null, 2)}\n`),
        closeout = {
            schemaVersion: P805_SCHEMA_VERSION,
            campaignId: "p8-05-fixture",
            ...retest,
            manifestSha256,
            closedAt: stamp(1700),
            releaseReady: true,
            cleanup: {noOwnedProcessesRemain: true, failedOrCancelledArtifactsRemoved: true},
            dispositions: [
                {
                    findingId: "F-1",
                    status: "resolved",
                    retestAuditId: uiux.auditId,
                    retestEvidenceId: uiux.evidence[0].evidenceId,
                },
            ],
        };
    if (throughController) {
        const prepared = await prepareP805Closeout({directory, retestCandidate:retest, closeout});
        closeout.manifestSha256 = prepared.manifestSha256;
    }
    const closeoutAnchor = path.join(path.dirname(directory), `${path.basename(directory)}-closeout.json`);
    closeout.externalAnchor = {path: closeoutAnchor, sha256: "0".repeat(64)};
    const {externalAnchor: ignored, ...closeoutPayload} = closeout;
    const closeoutAnchorContents = `${JSON.stringify({
        kind: "p8-05-closeout-anchor",
        campaignId: "p8-05-fixture",
        closeoutSha256: hash(`${JSON.stringify(closeoutPayload, null, 2)}\n`),
        manifestSha256,
        anchoredAt: stamp(1800),
    })}\n`;
    await writeFile(closeoutAnchor, closeoutAnchorContents);
    closeout.externalAnchor.sha256 = hash(closeoutAnchorContents);
    if (throughController) await runP805Closeout({directory, retestCandidate:retest, closeoutAnchor:closeout.externalAnchor});
    else await write("closeout.json", closeout);
    return {
        directory,
        anchors: {
            freezeAnchorSha256: frozen.externalAnchor.sha256,
            closeoutAnchorSha256: closeout.externalAnchor.sha256,
        },
        async cleanup() {
            await rm(directory, {recursive: true, force: true});
            await rm(anchor, {force: true});
            await rm(closeoutAnchor, {force: true});
            await rm(regressionReceipt, {force: true});
        },
    };
}
// Semantic-negative fixtures deliberately rebind their altered evidence to
// the child audit, so rejection reaches the semantic consumer rather than
// stopping solely at the immutable digest check.
async function rebindFixtureChildEvidence(directory, recordPath) {
    const records = JSON.parse(await readFile(recordPath, "utf8"));
    for (const aggregate of records.audits) {
        const evidence = new Map(aggregate.evidence.map((item) => [item.evidenceId, item]));
        for (const reference of aggregate.tupleReceipts) {
            const target = path.join(directory, reference.auditPath), contents = await readFile(target, "utf8"), child = JSON.parse(contents);
            child.evidence = child.evidence.map((item) => evidence.get(item.evidenceId) ?? item);
            const rebound = `${JSON.stringify(child)}\n`;
            if (rebound !== contents) {
                await writeFile(target, rebound);
                reference.auditSha256 = hash(rebound);
            }
        }
    }
    await writeFile(recordPath, `${JSON.stringify(records)}\n`);
}

test("requires every evidence kind, verifier anchors, live-DOM bindings, final-candidate regression and persona retest", async () => {
    const fixture = await campaignFixture({throughController:true});
    try {
        assert.equal(
            (await validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}))
                .candidateId,
            retest.candidateId,
        );
    } finally {
        await fixture.cleanup();
    }
});
test("rejects missing, duplicate, stale, and cross-candidate packed checkpoint receipts", async () => {
    for (const mutate of [
        (audit) => audit.checkpointReceipts.pop(),
        (audit) => audit.checkpointReceipts.push({...audit.checkpointReceipts[0]}),
        (audit) => { audit.checkpointReceipts[0].capturedAt = "2000-01-01T00:00:00.000Z"; },
        (audit) => { audit.checkpointReceipts[0].candidateId = initial.candidateId; },
    ]) {
        const fixture = await campaignFixture();
        try {
            const record = path.join(fixture.directory, "retests.json"), audits = JSON.parse(await readFile(record, "utf8"));
            mutate(audits.audits[0]);
            await writeFile(record, `${JSON.stringify(audits)}\n`);
            await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}), /checkpoint|aggregate differs|immutable child/i);
        } finally { await fixture.cleanup(); }
    }
});
test("rejects a content-equivalent packed checkpoint substituted into another viewport slot", async () => {
    const fixture = await campaignFixture();
    try {
        const record = path.join(fixture.directory, "retests.json"), audits = JSON.parse(await readFile(record, "utf8")), audit = audits.audits[0], [wide, compact] = audit.checkpointReceipts.filter((receipt) => receipt.observation === audit.rendered.actions[0].observation).slice(0, 2), copied = await readFile(path.join(fixture.directory, wide.path));
        await writeFile(path.join(fixture.directory, compact.path), copied);
        compact.sha256 = hash(copied);
        compact.sizeBytes = copied.length;
        await writeFile(record, `${JSON.stringify(audits)}\n`);
        await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}), /checkpoint|aggregate differs|immutable child/i);
    } finally { await fixture.cleanup(); }
});
test("rejects a checkpoint receipt substituted across persona slots", async () => {
    const fixture = await campaignFixture();
    try {
        const record = path.join(fixture.directory, "retests.json"), audits = JSON.parse(await readFile(record, "utf8")), [mathematician, programmer] = audits.audits, source = mathematician.checkpointReceipts[0], target = programmer.checkpointReceipts[0];
        target.persona = source.persona;
        await writeFile(record, `${JSON.stringify(audits)}\n`);
        await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}), /checkpoint|aggregate differs|immutable child/i);
    } finally { await fixture.cleanup(); }
});
test("rejects a checkpoint receipt relabelled to an undeclared workflow slot", async () => {
    const fixture = await campaignFixture();
    try {
        const record = path.join(fixture.directory, "retests.json"), audits = JSON.parse(await readFile(record, "utf8"));
        audits.audits[0].checkpointReceipts[0].observation = "substituted-workflow";
        await writeFile(record, `${JSON.stringify(audits)}\n`);
        await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}), /checkpoint|aggregate differs|immutable child/i);
    } finally { await fixture.cleanup(); }
});
test("rejects a final result whose receipt aggregate drifts from verified chunks", async () => {
    const fixture = await campaignFixture();
    try {
        const record = path.join(fixture.directory, "retests.json"), audits = JSON.parse(await readFile(record, "utf8"));
        audits.audits[0].finalResult.checkpointReceiptSha256s.reverse();
        await writeFile(record, `${JSON.stringify(audits)}\n`);
        await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}), /checkpoint receipt|final result|aggregate differs|immutable child/i);
    } finally { await fixture.cleanup(); }
});
test("fails closed on mutable chronology and context claims", async () => {
    const fixture = await campaignFixture();
    try {
        const file = path.join(fixture.directory, "retests.json"),
            value = JSON.parse(await readFile(file, "utf8"));
        value.audits[0].cleanContext.workspace = value.audits[1].cleanContext.workspace;
        await writeFile(file, `${JSON.stringify(value)}\n`);
        await assert.rejects(
            () => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}),
            /reuses a clean context|aggregate differs|immutable child/i,
        );
    } finally {
        await fixture.cleanup();
    }
});
test("rejects inflated operation budgets before accepting a persona aggregate", async () => {
    const fixture = await campaignFixture();
    try {
        const recordPath = path.join(fixture.directory, "retests.json");
        const {audits} = JSON.parse(await readFile(recordPath, "utf8"));
        audits[0].performance.simulationMs.budgetMs += 1;
        await assert.rejects(validateP805CollectedAudits(fixture.directory, audits, "retest", retest), /audit is incomplete/);
    } finally {
        await fixture.cleanup();
    }
});

test("rejects relabelled rendered workflow evidence and unmeasured timings", async () => {
    const fixture = await campaignFixture();
    try {
        const audits = JSON.parse(await readFile(path.join(fixture.directory, "retests.json"), "utf8")),
            audit = audits.audits[0],
            action = audit.rendered.actions[0],
            page = audit.evidence.find((item) => item.evidenceId === action.evidenceId),
            evidencePath = path.join(fixture.directory, page.path),
            semantic = JSON.parse(await readFile(evidencePath, "utf8"));
        semantic.workflow.expectedApi = "/api/project/not-the-operation";
        await writeFile(evidencePath, JSON.stringify(semantic));
        await assert.rejects(
            () => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}),
            /evidence digest or size differs|aggregate differs|immutable child/i,
        );
    } finally {
        await fixture.cleanup();
    }
});

test("rejects a compact workflow action that reuses a wide live-DOM transaction", async () => {
    const fixture = await campaignFixture();
    try {
        const record = path.join(fixture.directory, "retests.json"), audits = JSON.parse(await readFile(record, "utf8")), audit = audits.audits[0], action = audit.rendered.actions.find((item) => item.viewport === "compact"), evidence = audit.evidence.find((item) => item.evidenceId === action.evidenceId), target = path.join(fixture.directory, evidence.path), semantic = JSON.parse(await readFile(target, "utf8"));
        semantic.viewport = "wide";
        const contents = JSON.stringify(semantic);
        await writeFile(target, contents);
        evidence.sha256 = hash(contents);
        evidence.sizeBytes = Buffer.byteLength(contents);
        await writeFile(record, `${JSON.stringify(audits)}\n`);
        await rebindFixtureChildEvidence(fixture.directory, record);
        await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}), /reuses wide live-DOM transaction for compact|aggregate differs|immutable child/i);
    } finally { await fixture.cleanup(); }
});

test("rejects the legacy semantic page-state format as a tuple interaction substitute", async () => {
    const fixture = await campaignFixture();
    try {
        const record = path.join(fixture.directory, "retests.json"), audits = JSON.parse(await readFile(record, "utf8")), audit = audits.audits[0], action = audit.rendered.actions[0], evidence = audit.evidence.find((item) => item.evidenceId === action.evidenceId), target = path.join(fixture.directory, evidence.path), transaction = JSON.parse(await readFile(target, "utf8"));
        transaction.kind = "p8-05-semantic-page-state";
        const contents = JSON.stringify(transaction);
        await writeFile(target, contents);
        evidence.sha256 = hash(contents);
        evidence.sizeBytes = Buffer.byteLength(contents);
        await writeFile(record, `${JSON.stringify(audits)}\n`);
        await rebindFixtureChildEvidence(fixture.directory, record);
        await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}), /state-class transaction|aggregate differs|immutable child/i);
    } finally { await fixture.cleanup(); }
});

test("rejects cross-viewport substitution of an otherwise content-equivalent browser request", async () => {
    const fixture = await campaignFixture();
    try {
        const record = path.join(fixture.directory, "retests.json"), audits = JSON.parse(await readFile(record, "utf8")), audit = audits.audits[0], wide = audit.rendered.actions.find((item) => item.viewport === "wide"), compact = audit.rendered.actions.find((item) => item.viewport === "compact"), wideEvidence = audit.evidence.find((item) => item.evidenceId === wide.evidenceId), compactEvidence = audit.evidence.find((item) => item.evidenceId === compact.evidenceId), widePage = JSON.parse(await readFile(path.join(fixture.directory, wideEvidence.path), "utf8")), compactPath = path.join(fixture.directory, compactEvidence.path), compactPage = JSON.parse(await readFile(compactPath, "utf8"));
        compactPage.request.browserRequestId = widePage.request.browserRequestId;
        compactPage.renderedTerminal.observedAfterRequestId = widePage.request.browserRequestId;
        const contents = JSON.stringify(compactPage);
        await writeFile(compactPath, contents);
        compactEvidence.sha256 = hash(contents);
        compactEvidence.sizeBytes = Buffer.byteLength(contents);
        await writeFile(record, `${JSON.stringify(audits)}\n`);
        await rebindFixtureChildEvidence(fixture.directory, record);
        await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}), /captured transaction disagree|live-DOM terminal result is not correlated|does not resolve exactly one|reuses browser request|aggregate differs|immutable child/i);
    } finally { await fixture.cleanup(); }
});

test("rejects cross-viewport substitution of a context request identity", async () => {
    const fixture = await campaignFixture();
    try {
        const record = path.join(fixture.directory, "retests.json"), audits = JSON.parse(await readFile(record, "utf8")), audit = audits.audits[0], wide = audit.rendered.actions.find((item) => item.viewport === "wide"), compact = audit.rendered.actions.find((item) => item.viewport === "compact"), wideEvidence = audit.evidence.find((item) => item.evidenceId === wide.evidenceId), compactEvidence = audit.evidence.find((item) => item.evidenceId === compact.evidenceId), widePage = JSON.parse(await readFile(path.join(fixture.directory, wideEvidence.path), "utf8")), compactPath = path.join(fixture.directory, compactEvidence.path), compactPage = JSON.parse(await readFile(compactPath, "utf8"));
        compactPage.contextRevalidation.browserRequestId = widePage.contextRevalidation.browserRequestId;
        const contents = JSON.stringify(compactPage);
        await writeFile(compactPath, contents);
        compactEvidence.sha256 = hash(contents);
        compactEvidence.sizeBytes = Buffer.byteLength(contents);
        await writeFile(record, `${JSON.stringify(audits)}\n`);
        await rebindFixtureChildEvidence(fixture.directory, record);
        await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}), /captured transaction disagree|live-DOM terminal result is not correlated|does not resolve exactly one|reuses browser request|aggregate differs|immutable child/i);
    } finally { await fixture.cleanup(); }
});

test("rejects cross-viewport substitution of a terminal poll identity", async () => {
    const fixture = await campaignFixture();
    try {
        const record = path.join(fixture.directory, "retests.json"), audits = JSON.parse(await readFile(record, "utf8")), audit = audits.audits[0], wide = audit.rendered.actions.find((item) => item.viewport === "wide" && P805_WORKFLOW_CONTRACTS[audit.persona][item.observation].poll !== undefined), compact = audit.rendered.actions.find((item) => item.observation === wide.observation && item.viewport === "compact"), wideEvidence = audit.evidence.find((item) => item.evidenceId === wide.evidenceId), compactEvidence = audit.evidence.find((item) => item.evidenceId === compact.evidenceId), widePage = JSON.parse(await readFile(path.join(fixture.directory, wideEvidence.path), "utf8")), compactPath = path.join(fixture.directory, compactEvidence.path), compactPage = JSON.parse(await readFile(compactPath, "utf8"));
        if (widePage.terminal.source !== "rendered-poll" || compactPage.terminal.source !== "rendered-poll") throw new Error("fixture requires durable workflow pages");
        compactPage.terminal.browserRequestId = widePage.terminal.browserRequestId;
        const contents = JSON.stringify(compactPage);
        await writeFile(compactPath, contents);
        compactEvidence.sha256 = hash(contents);
        compactEvidence.sizeBytes = Buffer.byteLength(contents);
        await writeFile(record, `${JSON.stringify(audits)}\n`);
        await rebindFixtureChildEvidence(fixture.directory, record);
        await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}), /captured transaction disagree|live-DOM terminal result is not correlated|does not resolve exactly one|reuses browser request|aggregate differs|immutable child/i);
    } finally { await fixture.cleanup(); }
});

test("rejects a combined audit whose non-primary persona lacks its own workflow records", async () => {
    const fixture = await campaignFixture();
    try {
        const record = path.join(fixture.directory, "retests.json"), audits = JSON.parse(await readFile(record, "utf8"));
        audits.audits[0].workflowPersonas = ["mathematician", "producer"];
        await writeFile(record, `${JSON.stringify(audits)}\n`);
        await rebindFixtureChildEvidence(fixture.directory, record);
        await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}), /producer audit lacks a DOM-bound (three-viewport |tuple )action|aggregate differs|immutable child/i);
    } finally { await fixture.cleanup(); }
});

test("rejects semantic drift when a rewritten record no longer binds its rendered terminal result", async () => {
    const fixture = await campaignFixture();
    try {
        const record = path.join(fixture.directory, "retests.json"), audits = JSON.parse(await readFile(record, "utf8")), audit = audits.audits[0], action = audit.rendered.actions[0], evidence = audit.evidence.find((item) => item.evidenceId === action.evidenceId), target = path.join(fixture.directory, evidence.path), semantic = JSON.parse(await readFile(target, "utf8"));
        semantic.renderedTerminal.resultSha256 = "0".repeat(64);
        const contents = JSON.stringify(semantic);
        await writeFile(target, contents);
        evidence.sha256 = hash(contents);
        evidence.sizeBytes = Buffer.byteLength(contents);
        await writeFile(record, `${JSON.stringify(audits)}\n`);
        await rebindFixtureChildEvidence(fixture.directory, record);
        await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}), /rendered terminal result|aggregate differs|immutable child/i);
    } finally { await fixture.cleanup(); }
});

test("rejects a non-PAR durable terminal whose rendered result belongs to a different job", async () => {
    const fixture = await campaignFixture();
    try {
        const record = path.join(fixture.directory, "retests.json"), audits = JSON.parse(await readFile(record, "utf8")), audit = audits.audits.find((item) => item.persona === "mathematician"), action = audit.rendered.actions.find((item) => item.observation === "outcome-library-report-diff-replay"), evidence = audit.evidence.find((item) => item.evidenceId === action.evidenceId), target = path.join(fixture.directory, evidence.path), semantic = JSON.parse(await readFile(target, "utf8"));
        semantic.renderedTerminal.lifecycle.jobId = "job-from-a-different-tuple";
        const contents = JSON.stringify(semantic);
        await writeFile(target, contents);
        evidence.sha256 = hash(contents);
        evidence.sizeBytes = Buffer.byteLength(contents);
        await writeFile(record, `${JSON.stringify(audits)}\n`);
        await rebindFixtureChildEvidence(fixture.directory, record);
        await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}), /rendered terminal result|aggregate differs|immutable child/i);
    } finally { await fixture.cleanup(); }
});

test("rejects missing, loading, unsupported, disabled, or stale Outcome Library card receipts before generic route evidence", async () => {
    const corruptions = [
        (page) => { delete page.transaction.preflight; },
        (page) => { page.transaction.preflight.state = "loading"; },
        (page) => { page.transaction.preflight.status = "error"; },
        (page) => { page.transaction.preflight.enabled = false; page.transaction.preflight.disabled = true; },
        (page) => { page.transaction.preflight.controlId = "outcome-library-generate-stale"; },
        (page) => { page.renderedTerminal.lifecycle.durableJobId = "job-from-a-stale-result"; },
    ];
    for (const corrupt of corruptions) {
        const fixture = await campaignFixture();
        try {
            const record = path.join(fixture.directory, "retests.json"), audits = JSON.parse(await readFile(record, "utf8")), audit = audits.audits.find((item) => item.persona === "mathematician"), action = audit.rendered.actions.find((item) => item.observation === "outcome-library-report-diff-replay" && item.viewport === "wide"), evidence = audit.evidence.find((item) => item.evidenceId === action.evidenceId), target = path.join(fixture.directory, evidence.path), page = JSON.parse(await readFile(target, "utf8"));
            corrupt(page);
            const contents = JSON.stringify(page);
            await writeFile(target, contents);
            evidence.sha256 = hash(contents);
            evidence.sizeBytes = Buffer.byteLength(contents);
            await writeFile(record, `${JSON.stringify(audits)}\n`);
        await rebindFixtureChildEvidence(fixture.directory, record);
            await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}), /Outcome Library control, preflight, or durable result|aggregate differs|immutable child/i);
        } finally { await fixture.cleanup(); }
    }
});

test("rejects a rendered terminal captured without the browser request that produced it", async () => {
    const fixture = await campaignFixture();
    try {
        const record = path.join(fixture.directory, "retests.json"), audits = JSON.parse(await readFile(record, "utf8")), audit = audits.audits[0], action = audit.rendered.actions[0], evidence = audit.evidence.find((item) => item.evidenceId === action.evidenceId), target = path.join(fixture.directory, evidence.path), semantic = JSON.parse(await readFile(target, "utf8"));
        semantic.renderedTerminal.observedAfterRequestId = "unrelated-browser-request";
        const contents = JSON.stringify(semantic);
        await writeFile(target, contents);
        evidence.sha256 = hash(contents);
        evidence.sizeBytes = Buffer.byteLength(contents);
        await writeFile(record, `${JSON.stringify(audits)}\n`);
        await rebindFixtureChildEvidence(fixture.directory, record);
        await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}), /rendered terminal result|aggregate differs|immutable child/i);
    } finally { await fixture.cleanup(); }
});

test("rejects a rendered terminal without its product-owned lifecycle receipt", async () => {
    const fixture = await campaignFixture();
    try {
        const record = path.join(fixture.directory, "retests.json"), audits = JSON.parse(await readFile(record, "utf8")), audit = audits.audits[0], action = audit.rendered.actions[0], evidence = audit.evidence.find((item) => item.evidenceId === action.evidenceId), target = path.join(fixture.directory, evidence.path), semantic = JSON.parse(await readFile(target, "utf8"));
        delete semantic.renderedTerminal.lifecycle;
        const contents = JSON.stringify(semantic);
        await writeFile(target, contents);
        evidence.sha256 = hash(contents);
        evidence.sizeBytes = Buffer.byteLength(contents);
        await writeFile(record, `${JSON.stringify(audits)}\n`);
        await rebindFixtureChildEvidence(fixture.directory, record);
        await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}), /rendered terminal result|aggregate differs|immutable child/i);
    } finally { await fixture.cleanup(); }
});

test("rejects an HTTP-success semantic record whose completed terminal result actually failed", async () => {
    const fixture = await campaignFixture();
    try {
        const record = path.join(fixture.directory, "retests.json"), audits = JSON.parse(await readFile(record, "utf8")), audit = audits.audits[0], action = audit.rendered.actions[0], evidence = audit.evidence.find((item) => item.evidenceId === action.evidenceId), target = path.join(fixture.directory, evidence.path), semantic = JSON.parse(await readFile(target, "utf8"));
        semantic.terminal.result.status = "failed";
        await writeFile(target, JSON.stringify(semantic));
        const bytes = await readFile(target);
        evidence.sha256 = hash(bytes);
        evidence.sizeBytes = bytes.length;
        await writeFile(record, `${JSON.stringify(audits)}\n`);
        await rebindFixtureChildEvidence(fixture.directory, record);
        await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}), /terminal outcome|aggregate differs|immutable child/i);
    } finally {
        await fixture.cleanup();
    }
});

test("rejects a durable result whose browser poll is from a different public job workflow", async () => {
    const fixture = await campaignFixture();
    try {
        const record = path.join(fixture.directory, "retests.json"), audits = JSON.parse(await readFile(record, "utf8")), audit = audits.audits.find((item) => item.persona === "mathematician"), action = audit.rendered.actions.find((item) => item.observation === "simulation-success-failure-cancellation"), evidence = audit.evidence.find((item) => item.evidenceId === action.evidenceId), target = path.join(fixture.directory, evidence.path), semantic = JSON.parse(await readFile(target, "utf8"));
        semantic.terminal.pollPath = `/api/project/replays/${semantic.terminal.jobId}`;
        const contents = JSON.stringify(semantic);
        await writeFile(target, contents);
        evidence.sha256 = hash(contents);
        evidence.sizeBytes = Buffer.byteLength(contents);
        await writeFile(record, `${JSON.stringify(audits)}\n`);
        await rebindFixtureChildEvidence(fixture.directory, record);
        await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}), /terminal outcome|aggregate differs|immutable child/i);
    } finally { await fixture.cleanup(); }
});

test("rejects an HTTP-success report observation with no completed report or browser request provenance", async () => {
    const fixture = await campaignFixture();
    try {
        const record = path.join(fixture.directory, "retests.json"), audits = JSON.parse(await readFile(record, "utf8")), audit = audits.audits.find((item) => item.persona === "mathematician"), action = audit.rendered.actions.find((item) => item.observation === "simulation-rtp-volatility-features"), evidence = audit.evidence.find((item) => item.evidenceId === action.evidenceId), target = path.join(fixture.directory, evidence.path), semantic = JSON.parse(await readFile(target, "utf8"));
        semantic.terminal.result = [];
        semantic.terminal.resultSha256 = hash(JSON.stringify(semantic.terminal.result));
        const contents = JSON.stringify(semantic);
        await writeFile(target, contents);
        evidence.sha256 = hash(contents);
        evidence.sizeBytes = Buffer.byteLength(contents);
        await writeFile(record, `${JSON.stringify(audits)}\n`);
        await rebindFixtureChildEvidence(fixture.directory, record);
        await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}), /terminal outcome|aggregate differs|immutable child/i);
    } finally { await fixture.cleanup(); }
});

test("rejects a semantic record that is not present in the captured browser network log", async () => {
    const fixture = await campaignFixture();
    try {
        const record = path.join(fixture.directory, "retests.json"), audits = JSON.parse(await readFile(record, "utf8")), audit = audits.audits[0], browserEvidence = audit.evidence.find((item) => item.kind === "browser-log"), target = path.join(fixture.directory, browserEvidence.path);
        await writeFile(target, "[]");
        browserEvidence.sha256 = hash("[]");
        browserEvidence.sizeBytes = 2;
        await writeFile(record, `${JSON.stringify(audits)}\n`);
        await rebindFixtureChildEvidence(fixture.directory, record);
        await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}), /browser request and response|aggregate differs|immutable child/i);
    } finally { await fixture.cleanup(); }
});

test("rejects a semantic record without its one-activation rendered transaction receipt", async () => {
    const fixture = await campaignFixture();
    try {
        const record = path.join(fixture.directory, "retests.json"), audits = JSON.parse(await readFile(record, "utf8")), audit = audits.audits[0], action = audit.rendered.actions[0], evidence = audit.evidence.find((item) => item.evidenceId === action.evidenceId), target = path.join(fixture.directory, evidence.path), value = JSON.parse(await readFile(target, "utf8"));
        delete value.transaction;
        const contents = JSON.stringify(value);
        await writeFile(target, contents);
        evidence.sha256 = hash(contents);
        evidence.sizeBytes = Buffer.byteLength(contents);
        await writeFile(record, `${JSON.stringify(audits)}\n`);
        await rebindFixtureChildEvidence(fixture.directory, record);
        await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}), /screen-specific public control|aggregate differs|immutable child/i);
    } finally { await fixture.cleanup(); }
});
test("rejects an empty Configure form receipt for a read-only rendered report refresh", async () => {
    const fixture = await campaignFixture();
    try {
        const record = path.join(fixture.directory, "retests.json"), audits = JSON.parse(await readFile(record, "utf8")), audit = audits.audits.find((item) => item.persona === "mathematician"), action = audit.rendered.actions.find((item) => item.observation === "simulation-rtp-volatility-features"), evidence = audit.evidence.find((item) => item.evidenceId === action.evidenceId), target = path.join(fixture.directory, evidence.path), value = JSON.parse(await readFile(target, "utf8"));
        value.transaction.formState = {operation: "simulation-reports", capturedBeforeSubmission: true, actionControl: {stableControlId: value.transaction.control.stableControlId, identityAttribute: "id", visible: true, accessibleName: value.transaction.control.accessibleName, validation: {valid: true, message: ""}}, fields: []};
        const contents = JSON.stringify(value);
        await writeFile(target, contents);
        evidence.sha256 = hash(contents);
        evidence.sizeBytes = Buffer.byteLength(contents);
        await writeFile(record, `${JSON.stringify(audits)}\n`);
        await rebindFixtureChildEvidence(fixture.directory, record);
        await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}), /state-class transaction|aggregate differs|immutable child/i);
    } finally { await fixture.cleanup(); }
});
test("rejects editable submission fields without their rendered operation form scope", async () => {
    const fixture = await campaignFixture();
    try {
        const record = path.join(fixture.directory, "retests.json"), audits = JSON.parse(await readFile(record, "utf8")), audit = audits.audits.find((item) => item.persona === "mathematician"), action = audit.rendered.actions.find((item) => item.observation === "simulation-success-failure-cancellation"), evidence = audit.evidence.find((item) => item.evidenceId === action.evidenceId), target = path.join(fixture.directory, evidence.path), value = JSON.parse(await readFile(target, "utf8"));
        delete value.transaction.formState.scope;
        const contents = JSON.stringify(value);
        await writeFile(target, contents);
        evidence.sha256 = hash(contents);
        evidence.sizeBytes = Buffer.byteLength(contents);
        await writeFile(record, `${JSON.stringify(audits)}\n`);
        await rebindFixtureChildEvidence(fixture.directory, record);
        await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}), /state-class transaction|aggregate differs|immutable child/i);
    } finally { await fixture.cleanup(); }
});
test("requires browser defects to be frozen initially and absent after retest", async () => {
    const fixture = await campaignFixture();
    try {
        const file = path.join(fixture.directory, "retests.json"),
            value = JSON.parse(await readFile(file, "utf8"));
        value.audits[0].rendered.measurements.consoleExceptions = 1;
        value.audits[0].rendered.defects = [
            {kind: "console", evidenceId: value.audits[0].rendered.actions[0].evidenceId},
        ];
        await writeFile(file, `${JSON.stringify(value)}\n`);
        await assert.rejects(
            () => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}),
            /clean retest .* browser quality defect|aggregate differs|immutable child/i,
        );
    } finally {
        await fixture.cleanup();
    }
});

test("rejects action timing inflated beyond the saved rendered transaction", async () => {
    const fixture = await campaignFixture();
    try {
        const file = path.join(fixture.directory, "retests.json");
        const audits = JSON.parse(await readFile(file, "utf8"));
        const action = audits.audits[0].rendered.actions[0];
        const entry = audits.audits[0].evidence.find((item) => item.evidenceId === action.evidenceId);
        const value = JSON.parse(await readFile(path.join(fixture.directory, entry.path), "utf8"));
        value.elapsedMs = action.elapsedMs + 1000;
        const contents = JSON.stringify(value);
        await writeFile(path.join(fixture.directory, entry.path), contents);
        entry.sha256 = hash(contents);
        entry.sizeBytes = Buffer.byteLength(contents);
        await writeFile(file, JSON.stringify(audits));
        await rebindFixtureChildEvidence(fixture.directory, file);
        await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}), /checkpoint action timing differs/);
    } finally {
        await fixture.cleanup();
    }
});

test.each(["simulationRetry", "restartSimulation"])("rejects %s runtime recovery differing from the accepted native receipt", async (operation) => {
    const fixture = await campaignFixture();
    try {
        const file = path.join(fixture.directory, "retests.json");
        const audits = JSON.parse(await readFile(file, "utf8"));
        const audit = audits.audits[3];
        const reference = audit.tupleReceipts.find((item) => item.tuple.observation === "reload-reconnect-recovery-cancellation-project-switch" && item.tuple.viewport === "narrow");
        assert.ok(reference, "the declared narrow recovery tuple must be present");
        const child = JSON.parse(await readFile(path.join(fixture.directory, reference.auditPath), "utf8"));
        assert.equal(child.workflowScope.recoveryRequired, true);
        const receipt = child.rendered.jobs[operation === "simulationRetry" ? "retryWithoutPartialArtifacts" : "restartRecovery"];
        const entry = audit.evidence.find((item) => item.evidenceId === receipt.evidenceId);
        assert.equal(entry.kind, "page-state");
        const value = JSON.parse(await readFile(path.join(fixture.directory, entry.path), "utf8"));
        assert.equal(value.transactions[operation].control.stableControlId, operation === "simulationRetry" ? "simulation-retry" : "simulation-run");
        value.transactions[operation].terminal.resultSha256 = "f".repeat(64);
        const contents = JSON.stringify(value);
        await writeFile(path.join(fixture.directory, entry.path), contents);
        entry.sha256 = hash(contents);
        entry.sizeBytes = Buffer.byteLength(contents);
        await writeFile(file, JSON.stringify(audits));
        await rebindFixtureChildEvidence(fixture.directory, file);
        await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}), new RegExp(`captured recovery receipts disagree for ${operation}`));
    } finally {
        await fixture.cleanup();
    }
});

test("rejects a route-only reload claim without an active durable job and delayed stale response", async () => {
    const fixture = await campaignFixture();
    try {
        const audits = JSON.parse(await readFile(path.join(fixture.directory, "retests.json"), "utf8")), audit = audits.audits[3];
        const runtimeEntry = audit.evidence.find((item) => item.kind === "page-state" && !item.observationIds.length);
        const value = JSON.parse(await readFile(path.join(fixture.directory, runtimeEntry.path), "utf8"));
        value.reload.discoveredAfterReload = false;
        await writeFile(path.join(fixture.directory, runtimeEntry.path), JSON.stringify(value));
        const bytes = await readFile(path.join(fixture.directory, runtimeEntry.path));
        runtimeEntry.sha256 = hash(bytes);
        runtimeEntry.sizeBytes = bytes.length;
        await writeFile(path.join(fixture.directory, "retests.json"), `${JSON.stringify(audits)}\n`);
        await rebindFixtureChildEvidence(fixture.directory, path.join(fixture.directory, "retests.json"));
        await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}), /captured recovery|aggregate differs|immutable child/i);
    } finally {
        await fixture.cleanup();
    }
});
test("rejects a Home project-switch receipt whose Start a game control was not its visible native pointer target", async () => {
    const fixture = await campaignFixture();
    try {
        const audits = JSON.parse(await readFile(path.join(fixture.directory, "retests.json"), "utf8")), audit = audits.audits[3];
        const runtimeEntry = audit.evidence.find((item) => item.kind === "page-state" && !item.observationIds.length);
        const value = JSON.parse(await readFile(path.join(fixture.directory, runtimeEntry.path), "utf8"));
        value.projectSwitchReceipt.startGameNavigation.activation.hitTest.matchesCapturedControl = false;
        await writeFile(path.join(fixture.directory, runtimeEntry.path), JSON.stringify(value));
        const bytes = await readFile(path.join(fixture.directory, runtimeEntry.path));
        runtimeEntry.sha256 = hash(bytes);
        runtimeEntry.sizeBytes = bytes.length;
        await writeFile(path.join(fixture.directory, "retests.json"), `${JSON.stringify(audits)}\n`);
        await rebindFixtureChildEvidence(fixture.directory, path.join(fixture.directory, "retests.json"));
        await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}), /Home project-switch recovery receipt|aggregate differs|immutable child/i);
    } finally {
        await fixture.cleanup();
    }
});
test("rejects an archive whose executable manifest no longer matches the verifier-supplied candidate manifest", async () => {
    const fixture = await campaignFixture();
    try {
        const file = path.join(fixture.directory, "retests.json"),
            value = JSON.parse(await readFile(file, "utf8"));
        value.audits[0].packageIdentity.candidateExecutableSha256 = "0".repeat(64);
        await writeFile(file, `${JSON.stringify(value)}\n`);
        await assert.rejects(
            () => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}),
            /does not prove its installed archive executable contents|aggregate differs|immutable child/i,
        );
    } finally {
        await fixture.cleanup();
    }
});

test("rejects campaign-authored executable provenance without its external verifier receipt", async () => {
    const fixture = await campaignFixture();
    try {
        const file = path.join(fixture.directory, "retests.json"), value = JSON.parse(await readFile(file, "utf8"));
        delete value.audits[0].packageIdentity.candidateExecutableReceiptSha256;
        await writeFile(file, `${JSON.stringify(value)}\n`);
        await assert.rejects(
            () => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}),
            /does not prove its installed archive executable contents|aggregate differs|immutable child/i,
        );
    } finally {
        await fixture.cleanup();
    }
});

test("rejects provenance drift when the verifier receipt is paired with a different candidate tree", async () => {
    const fixture = await campaignFixture();
    try {
        const file = path.join(fixture.directory, "retests.json"), value = JSON.parse(await readFile(file, "utf8"));
        value.audits[0].packageIdentity.candidateTreeObjectId = "0".repeat(40);
        await writeFile(file, `${JSON.stringify(value)}\n`);
        await assert.rejects(
            () => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}),
            /workflow evidence does not prove|installed archive executable contents|aggregate differs|immutable child/i,
        );
    } finally {
        await fixture.cleanup();
    }
});

test("rejects a regression receipt that lacks verifier-owned authentication", async () => {
    const fixture = await campaignFixture();
    try {
        const regressions = JSON.parse(await readFile(path.join(fixture.directory, "regressions.json"), "utf8")),
            evidence = regressions.regressions[0].machineResultEvidence,
            result = JSON.parse(await readFile(path.join(fixture.directory, evidence.path), "utf8")),
            receipt = JSON.parse(await readFile(result.receipt.path, "utf8"));
        delete receipt.authentication;
        const receiptContents = `${JSON.stringify(receipt)}\n`;
        await writeFile(result.receipt.path, receiptContents);
        result.receipt.sha256 = hash(receiptContents);
        const resultContents = `${JSON.stringify(result)}\n`;
        await writeFile(path.join(fixture.directory, evidence.path), resultContents);
        evidence.sha256 = hash(resultContents);
        evidence.sizeBytes = Buffer.byteLength(resultContents);
        await writeFile(path.join(fixture.directory, "regressions.json"), `${JSON.stringify(regressions)}\n`);
        await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}));
    } finally { await fixture.cleanup(); }
});

test("campaign records expose exactly five persona aggregates while retaining every tuple receipt", () => {
    const tuples = P805_PERSONAS.flatMap((persona) => P805_REQUIRED_OBSERVATIONS[persona].flatMap((observation) => ["wide", "compact", "narrow"].map((viewport) => ({persona, observation, viewport}))));
    const audits = P805_PERSONAS.map((persona) => ({auditId:`aggregate-${persona}`, persona, tupleReceipts:tuples.filter((tuple) => tuple.persona === persona).map((tuple, index) => ({tuple, auditId:`tuple-${persona}-${index}`, auditPath:`audit-${persona}-${index}.json`, auditSha256:"a".repeat(64), tupleReceiptPath:`receipt-${persona}-${index}.json`, tupleReceiptSha256:"b".repeat(64), cleanupPath:`cleanup-${persona}-${index}.json`, cleanupSha256:"c".repeat(64), checkpointReceiptSha256s:["d".repeat(64)]}))}));
    assert.equal(validateP805AuditMatrix(audits, "initial"), false);
    assert.throws(() => validateP805AuditMatrix(audits.slice(1), "initial"), /exactly five persona aggregates|aggregate differs|immutable child/ );
    assert.throws(() => validateP805AuditMatrix([...audits.slice(0, -1), {...audits.at(-1), persona:audits[0].persona}], "initial"), /duplicate or missing persona/);
    assert.throws(() => validateP805AuditMatrix([{auditId:"tuple", tuple:tuples[0]}, ...audits.slice(1)], "initial"), /exactly five persona aggregates/);
});

test("tuple proof ledger rejects missing, duplicate, cross-candidate, cross-persona, cross-viewport, and unclean child substitutions", () => {
    const tuples = P805_PERSONAS.flatMap((persona) => P805_REQUIRED_OBSERVATIONS[persona].flatMap((observation) => ["wide", "compact", "narrow"].map((viewport) => ({persona, observation, viewport}))));
    const digestAt = (prefix, index) => `${prefix}${index.toString(16).padStart(63, "0")}`;
    const ledger = {kind:"p8-05-process-isolated-packed-proof", status:"passed", candidateId:initial.candidateId, candidatePackageSha256:initial.candidatePackageSha256, parent:{pid:1}, runtime:{kind:"p8-05-immutable-packed-runtime", root:"/tmp/p8-05-runtime", receiptPath:"runtime.json", receiptSha256:"f".repeat(64), candidateId:initial.candidateId, candidatePackageSha256:initial.candidatePackageSha256, candidateExecutableSha256:initial.candidateExecutableSha256, archiveSha256:initial.candidatePackageSha256, installationCount:1, permissions:"read-only-before-any-tuple-child"}, children:tuples.map((tuple, index) => ({tuple, worker:{pid:index + 2}, auditPath:`audit-${index}.json`, auditSha256:digestAt("a", index), tupleReceiptPath:`receipt-${index}.json`, tupleReceiptSha256:digestAt("b", index), cleanupPath:`cleanup-${index}.json`, cleanupSha256:digestAt("c", index), checkpointReceiptSha256s:[digestAt("d", index)], cleanupEvidenceId:`cleanup-${index}`, parentCleanup:{processTreeDrained:true, resourcesDrained:true}, exitCode:0, signal:null})), acceptedReceipts:tuples.map((tuple, index) => ({tuple, receiptPath:`receipt-${index}.json`, receiptSha256:digestAt("b", index), cleanupPath:`cleanup-${index}.json`, cleanupSha256:digestAt("c", index), receipt:{schemaVersion:1, kind:"p8-05-packed-tuple-receipt", status:"passed", candidateId:initial.candidateId, candidatePackageSha256:initial.candidatePackageSha256, tuple, worker:{pid:index + 2}, auditId:`audit-${index}`, cleanupEvidenceId:`cleanup-${index}`, cleanupSha256:digestAt("c", index), checkpointReceipt:{candidateId:initial.candidateId, candidatePackageSha256:initial.candidatePackageSha256, persona:tuple.persona, observation:tuple.observation, viewport:tuple.viewport, actionSha256:digestAt("e", index)}}, cleanup:{schemaVersion:1, kind:"p8-05-packed-tuple-cleanup", candidateId:initial.candidateId, candidatePackageSha256:initial.candidatePackageSha256, tuple, worker:{pid:index + 2}, cleanup:{exit:"success", processTreeDrained:true, resourcesDrained:true, contextRemoved:true}, cleanupEvidenceId:`cleanup-${index}`}})), finalResult:{status:"passed", children:tuples.length, checkpointReceipts:tuples.length, aggregation:"independently-verified-immutable-tuple-child-receipts-only"}};
    validateP805TupleProofLedger(ledger, initial);
    for (const mutate of [
        (value) => value.children.pop(),
        (value) => { value.children[1].tuple = value.children[0].tuple; },
        (value) => { value.children.at(-1).tuple = {...value.children.at(-1).tuple, persona:value.children[0].tuple.persona}; },
        (value) => { value.children.at(-1).tuple = {...value.children.at(-1).tuple, viewport:value.children[0].tuple.viewport}; },
        (value) => { value.candidateId = retest.candidateId; },
        (value) => { value.children[0].cleanupSha256 = "not-a-digest"; },
        (value) => { value.acceptedReceipts[0].receipt.candidateId = retest.candidateId; },
        (value) => { value.acceptedReceipts[0].cleanup.cleanup.exit = "error"; },
        (value) => { value.children[1].tupleReceiptSha256 = value.children[0].tupleReceiptSha256; value.acceptedReceipts[1].receiptSha256 = value.acceptedReceipts[0].receiptSha256; },
        (value) => { value.acceptedReceipts[0].receipt.cleanupSha256 = "0".repeat(64); },
        (value) => { value.runtime.candidateExecutableSha256 = retest.candidateExecutableSha256; },
    ]) {
        const candidate = structuredClone(ledger);
        mutate(candidate);
        assert.throws(() => validateP805TupleProofLedger(candidate, initial), /tuple proof ledger/i);
    }
});


test("freezes an initial measured overflow by reference and accepts its clean persona retest", async () => {
    const fixture = await campaignFixture({initialOverflow:true, throughController:true});
    try {
        const result = await validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors});
        assert.equal(result.manifestSha256, hash(await readFile(path.join(fixture.directory, "manifest.json"))));
        assert.deepEqual(result.personas, P805_PERSONAS);
        const initial = JSON.parse(await readFile(path.join(fixture.directory, "initial-audits.json"), "utf8"));
        const frozen = JSON.parse(await readFile(path.join(fixture.directory, "frozen-findings.json"), "utf8"));
        assert.deepEqual(frozen.findings[0].evidence, initial.audits[3].evidence.find((item) => item.evidenceId === frozen.findings[0].evidence.evidenceId));
    } finally { await fixture.cleanup(); }
});

test("authenticates every child log and cleanup before accepting its persona closeout", async () => {
    const fixture = await campaignFixture();
    try {
        const records = JSON.parse(await readFile(path.join(fixture.directory, "retests.json"), "utf8"));
        const reference = records.audits[0].tupleReceipts.at(-1);
        const child = JSON.parse(await readFile(path.join(fixture.directory, reference.auditPath), "utf8"));
        const api = child.evidence.find((item) => item.kind === "api-log");
        const original = await readFile(path.join(fixture.directory, api.path));
        await writeFile(path.join(fixture.directory, api.path), "[]");
        await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}), /evidence digest or size differs/);
        await writeFile(path.join(fixture.directory, api.path), original);
        const cleanup = path.join(fixture.directory, reference.cleanupPath);
        await writeFile(cleanup, "{}");
        await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}), /immutable child cleanup digest differs/);
    } finally { await fixture.cleanup(); }
});

test("controller leaves no canonical closeout when a material finding is still open", async () => {
    const fixture = await campaignFixture();
    try {
        const closeoutFile = path.join(fixture.directory, "closeout.json"), closeout = JSON.parse(await readFile(closeoutFile, "utf8"));
        const {externalAnchor, ...payload} = closeout;
        await rm(closeoutFile);
        await writeFile(path.join(fixture.directory, "closeout-payload.json"), `${JSON.stringify(payload, null, 2)}\n`);
        const findingFile = path.join(fixture.directory, "finding-register.json"), findings = JSON.parse(await readFile(findingFile, "utf8"));
        findings.findings[0].status = "open";
        await writeFile(findingFile, `${JSON.stringify(findings)}\n`);
        await assert.rejects(() => runP805Closeout({directory:fixture.directory, retestCandidate:retest, closeoutAnchor:externalAnchor}), /release-blocking finding remains open/);
        await assert.rejects(() => readFile(closeoutFile), /ENOENT/);
    } finally { await fixture.cleanup(); }
});
