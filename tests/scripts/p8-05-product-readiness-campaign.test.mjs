import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {test} from "@jest/globals";
import {
    P805_PERSONAS,
    P805_REQUIRED_EVIDENCE_KINDS,
    P805_REQUIRED_OBSERVATIONS,
    P805_SCREEN_CONTROL_STATES,
    P805_SCHEMA_VERSION,
    P805_WORKFLOW_CONTRACTS,
    validateP805ProductReadinessCampaign,
} from "../../scripts/p8-05-product-readiness-campaign.mjs";

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
};
const transaction = (operation, controlId, accessibleName, confirmed = false) => ({
    operation,
    control: {stableControlId: controlId, identityAttribute: "id", accessibleName, enabled: true, disabled: false, disabledExplanation: null},
    confirmation: confirmed
        ? {required: true, state: "confirmed", control: {stableControlId: "simulation-cancel-confirm", identityAttribute: "id", accessibleName: "Confirm", enabled: true, disabled: false, disabledExplanation: null}}
        : {required: false, state: "not-required", control: null},
    keyboardActivations: confirmed
        ? [{phase: "operation", controlId, count: 1}, {phase: "confirmation", controlId: "simulation-cancel-confirm", count: 1}]
        : [{phase: "operation", controlId, count: 1}],
    request: {browserRequestId: `runtime-${operation}`, method: "POST", path: `/api/project/${operation}`, status: 200, responseSha256: hash(`response-${operation}`)},
    terminal: {status: "completed", resultSha256: hash(`terminal-${operation}`), source: "rendered-poll", pollPath: `/api/project/${operation}/job`, browserRequestId: `terminal-${operation}`, causedByRequestId: `runtime-${operation}`},
});
const semantic = (persona, observation, contract, viewport) => {
    const bodySha256 = hash(contract.body ?? ""),
        jobId = `job-${observation}`,
        result = contract.terminal === "report-completed" ? [{id: jobId, status: "completed", observation, downloadPath: `/downloads/${jobId}.json`}] : {id: jobId, status: "completed", observation, ...(contract.artifact === undefined ? {} : {outputPath: `/outputs/${jobId}`})},
        responseSha256 = hash(JSON.stringify(result)),
        route = `/#/project/fixture/${contract.route}`,
        screen = P805_SCREEN_CONTROL_STATES[contract.route],
        actionControl = contract.actionControl ?? contract.control,
        matchedLabel = contract.actionControlMatch === "prefix" ? `${contract.actionControl} (base)` : actionControl,
        interaction = {
            control: actionControl,
            matchedLabel,
            keyboardFocused: true,
            keyboardActivated: true,
            activation: "keyboard",
            routeAfterActivation: route,
            stableControlId: contract.actionControlId ?? screen.navigationControlId,
            identityAttribute: "id",
            lifecycle: (contract.operation ?? contract.body) === undefined ? {kind: "navigation", value: contract.route} : {kind: "operation", value: contract.operation ?? contract.body},
        },
        transaction = {
            operation: contract.operation ?? contract.body ?? contract.route,
            control: {stableControlId: contract.actionControlId ?? screen.navigationControlId, identityAttribute: "id", accessibleName: matchedLabel, enabled: true, disabled: false, disabledExplanation: null},
            confirmation: {required: false, state: "not-required", control: null},
            keyboardActivations: [{phase: "operation", controlId: contract.actionControlId ?? screen.navigationControlId, count: 1}],
        };
    return {
        bodySha256,
        responseSha256,
        result,
        interaction,
        transaction,
        route,
        contextRevalidation: {
            browserRequestId: `context-${observation}`,
            method: "GET",
            path: "/api/project/context",
            status: 200,
            responseSha256: hash(JSON.stringify({status: "loaded"})),
            projectStatus: "loaded",
            completedBeforeSelection: true,
        },
        contents: JSON.stringify({
            kind: "p8-05-semantic-page-state",
            operation: observation,
            expectedOutcome: contract.terminal,
            route,
            viewport,
            screen: {name: contract.route, region: screen.region, navigationControl: screen.navigationControl, terminalText: screen.result},
            control: {id: contract.actionControlId ?? screen.navigationControlId, role: "button", accessibleName: matchedLabel, enabled: true},
            precondition: {enabled: true, disabled: false, disabledExplanation: null, accessibleName: matchedLabel, region: screen.region},
            interaction,
            transaction,
            contextRevalidation: {
                browserRequestId: `context-${observation}`,
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
                browserRequestId: `browser-${observation}`,
                initiator: "rendered-control",
            },
            terminal: {
                status: "completed",
                complete: true,
                resultSha256: responseSha256,
                artifact: contract.artifact ?? null,
                result,
                source: contract.poll ? "rendered-poll" : "response",
                ...(contract.poll ? {jobId, pollPath: contract.poll.replace("{id}", encodeURIComponent(jobId))} : {}),
            },
            renderedTerminal: {
                state: "rendered",
                observedAfterRequestId: `browser-${observation}`,
                text: `The rendered ${observation} result completed.`,
                textSha256: hash(`The rendered ${observation} result completed.`),
                resultSha256: responseSha256,
                observedAt: stamp(1),
                changedAfterRequest: true,
                lifecycle: {
                    role: "status",
                    terminal: "completed",
                    text: `The rendered ${observation} lifecycle result completed.`,
                    artifact: contract.artifact === undefined ? null : {name: contract.artifact, accessibleName: `Open ${contract.artifact}`},
                },
            },
            workflow: {
                persona,
                source: "rendered-control",
                expectedApi: contract.api,
                expectedMethod: contract.method,
                expectedBodyKind: contract.body ?? null,
                expectedArtifact: contract.artifact ?? null,
                terminal: contract.terminal,
            },
            state: {text: "Studio controls", controls: [], overflow: false},
        }),
    };
};

async function campaignFixture() {
    const directory = await mkdtemp(path.join(os.tmpdir(), "pokie-p8-05-campaign-"));
    let sequence = 0;
    const evidence = async (candidate, kind, at, observationIds = [], contents) => {
        sequence += 1;
        const defaults = {
            "cli-transcript": "PACKED_INSTALL\npacked CLI create\npacked CLI WASM run\npacked CLI serve\n",
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
        const body = contents ?? defaults[kind] ?? `P8-05 bounded ${kind} ${sequence}\n`,
            relativePath = `records/${sequence}.txt`;
        await mkdir(path.join(directory, "records"), {recursive: true});
        await writeFile(path.join(directory, relativePath), body);
        return {
            evidenceId: `e-${sequence}`,
            path: relativePath,
            sha256: hash(body),
            sizeBytes: Buffer.byteLength(body),
            capturedAt: at,
            kind,
            observationIds,
            ...candidate,
        };
    };
    const audit = async (persona, phase, candidate, offset) => {
        const observations = P805_REQUIRED_OBSERVATIONS[persona],
            artifacts = [];
        for (const [index, kind] of P805_REQUIRED_EVIDENCE_KINDS.filter(
            (kind) => !["page-state", "screenshot"].includes(kind),
        ).entries())
            artifacts.push(await evidence(candidate, kind, stamp(offset + 2 + index), observations));
        const actions = [],
            apiEntries = [{path: "/api/health"}], browserEvents = [];
        for (const [index, observation] of observations.entries()) {
            const contract = P805_WORKFLOW_CONTRACTS[persona][observation],
                viewport = ["wide", "compact", "narrow"][index % 3],
                source = semantic(persona, observation, contract, viewport),
                screenshot = await evidence(candidate, "screenshot", stamp(offset + 20), [observation]),
                page = await evidence(candidate, "page-state", stamp(offset + 21), [observation], source.contents);
            artifacts.push(screenshot, page);
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
                browserRequestId: `browser-${observation}`,
                initiator: "rendered-control",
            });
            browserEvents.push(
                {method: "Network.requestWillBeSent", params: {requestId: `browser-${observation}`, request: {url: `http://127.0.0.1${contract.api}`, method: contract.method, ...(contract.body === undefined ? {} : {postData: contract.body})}}},
                {method: "Network.responseReceived", params: {requestId: `browser-${observation}`, response: {status: 200}}},
            );
            if (contract.poll) apiEntries.push({
                observation,
                method: "GET",
                path: contract.poll.replace("{id}", encodeURIComponent(source.result.id)),
                status: 200,
                payload: source.result,
                browserRequestId: `poll-${observation}`,
                initiator: "rendered-poll",
            });
            if (contract.poll) browserEvents.push({method: "Network.requestWillBeSent", params: {requestId: `poll-${observation}`, request: {url: `http://127.0.0.1${contract.poll.replace("{id}", encodeURIComponent(source.result.id))}`, method: "GET"}}});
            for (const actionViewport of ["wide", "compact", "narrow"]) actions.push({
                observation,
                route: source.route,
                expectedControl: contract.control,
                expectedActionControl: contract.actionControl ?? contract.control,
                expectedMethod: contract.method,
                expectedBodyKind: contract.body ?? null,
                expectedApi: contract.api,
                expectedArtifact: contract.artifact ?? null,
                expectedTerminal: contract.terminal,
                terminal: {status: "completed", resultSha256: source.responseSha256},
                evidenceId: page.evidenceId,
                screenshotEvidenceId: screenshot.evidenceId,
                viewport: actionViewport,
                elapsedMs: 1,
                screenState: contract.route,
                screenNavigationControl: P805_SCREEN_CONTROL_STATES[contract.route].navigationControl,
                stableControlId: contract.actionControlId ?? P805_SCREEN_CONTROL_STATES[contract.route].navigationControlId,
                domControlId: contract.actionControlId ?? P805_SCREEN_CONTROL_STATES[contract.route].navigationControlId,
                identityAttribute: "id",
                browserRequestId: `browser-${observation}`,
                contextRevalidation: source.contextRevalidation,
                precondition: {enabled: true, disabled: false, disabledExplanation: null, accessibleName: source.interaction.matchedLabel, region: P805_SCREEN_CONTROL_STATES[contract.route].region},
                visibleTerminal: {state: "rendered", observedAfterRequestId: `browser-${observation}`, resultSha256: source.responseSha256, changedAfterRequest: true},
                accessibility: {namedRegions: [P805_SCREEN_CONTROL_STATES[contract.route].region], visibleFocus: true, unexplainedDisabledControls: 0},
                interaction: source.interaction,
                transaction: source.transaction,
            });
        }
        const runtime = await evidence(
            candidate,
            "page-state",
            stamp(offset + 30),
            [],
            JSON.stringify({
                kind: "p8-05-runtime-observation",
                transactions: {
                    activeReloadStart: transaction("simulation", "simulation-run", "Run Simulation"),
                    activeReloadCancellation: transaction("simulation-cancel", "simulation-cancel", "Cancel", true),
                    simulationFailure: transaction("simulation", "simulation-run", "Run Simulation"),
                    simulationSuccess: transaction("simulation", "simulation-run", "Run Simulation"),
                    replayFailure: transaction("replay", "replay-run", "Run again"),
                    replaySuccess: transaction("replay", "replay-run", "Run again"),
                    replayRecovery: transaction("replay", "replay-run", "Run again"),
                    cancellableSimulation: transaction("simulation", "simulation-run", "Run Simulation"),
                    cooperativeCancellation: transaction("simulation-cancel", "simulation-cancel", "Cancel", true),
                    simulationRetry: transaction("simulation-retry", "simulation-retry", "Retry"),
                    restartSimulation: transaction("simulation", "simulation-run", "Run Simulation"),
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
                unsavedWork: {
                    editedControl: "Game basics name",
                    protectionText: "You have unsaved changes to this game model section. Leave and lose them?",
                    preserved: true,
                },
                restart: {activeJobId: "simulation-restart", recovered: true},
                jobs: {
                    success: {id: "simulation-completed", status: "completed"},
                    actionableFailure: {error: "Rounds must be positive"},
                    cooperativeCancellation: {id: "simulation-cancelled", status: "cancelled"},
                    retryWithoutPartialArtifacts: {id: "simulation-retry", status: "completed"},
                },
                outcomes: {
                    cancelledSimulationId: "simulation-cancelled",
                    reports: [{id: "simulation-completed"}, {id: "simulation-retry"}],
                    cancelledReportAbsent: true,
                },
            }),
        );
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
        const measured = runtime.evidenceId;
        return {
            auditId: `${phase}-${persona}`,
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
            endedAt: stamp(offset + 40),
            cleanContext: {
                workspace: `/tmp/p8-05-${phase}-${persona}-work`,
                configurationRoot: `/tmp/p8-05-${phase}-${persona}-config`,
                browserProfile: `/tmp/p8-05-${phase}-${persona}-profile`,
                reused: false,
            },
            observations,
            observationEvidence: Object.fromEntries(actions.map((action) => [action.observation, action.evidenceId])),
            timings,
            performance: Object.fromEntries(
                Object.entries(timings).map(([name, elapsedMs]) => [
                    name,
                    {elapsedMs, budgetMs: 1_000, classification: "within-budget"},
                ]),
            ),
            cleanup: {
                processTreeDrained: true,
                resourcesDrained: true,
                contextRemoved: true,
                evidenceId: cleanup.evidenceId,
            },
            rendered: {
                ...rendered,
                defects: [],
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
                jobs: Object.fromEntries(
                    ["success", "actionableFailure", "cooperativeCancellation", "retryWithoutPartialArtifacts"].map(
                        (key) => [key, {observed: true, evidenceId: measured}],
                    ),
                ),
            },
            evidence: artifacts,
        };
    };
    const initialAudits = [];
    for (const [index, persona] of P805_PERSONAS.entries())
        initialAudits.push(await audit(persona, "initial", initial, 100 + index * 100));
    const retests = [];
    for (const [index, persona] of P805_PERSONAS.entries())
        retests.push(await audit(persona, "retest", retest, 1000 + index * 100));
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
        findings: [finding],
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
        cleanupEvidence: [...initialAudits, ...retests].map((audit) => audit.cleanup.evidenceId),
    };
    await write("manifest.json", manifest);
    const uiux = retests.find((entry) => entry.persona === "ui-ux"),
        manifestSha256 = hash(await readFile(path.join(directory, "manifest.json"))),
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
    await write("closeout.json", closeout);
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
test("requires every evidence kind, verifier anchors, semantic bindings, final-candidate regression and persona retest", async () => {
    const fixture = await campaignFixture();
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
test("fails closed on mutable chronology and context claims", async () => {
    const fixture = await campaignFixture();
    try {
        const file = path.join(fixture.directory, "retests.json"),
            value = JSON.parse(await readFile(file, "utf8"));
        value.audits[0].cleanContext.workspace = value.audits[1].cleanContext.workspace;
        await writeFile(file, `${JSON.stringify(value)}\n`);
        await assert.rejects(
            () => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}),
            /reuses a clean context/i,
        );
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
            /evidence digest or size differs/i,
        );
    } finally {
        await fixture.cleanup();
    }
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
        await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}), /rendered terminal result/i);
    } finally { await fixture.cleanup(); }
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
        await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}), /rendered terminal result/i);
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
        await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}), /rendered terminal result/i);
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
        await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}), /terminal outcome/i);
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
        await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}), /terminal outcome/i);
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
        await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}), /terminal outcome/i);
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
        await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}), /browser request and response/i);
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
        await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}), /screen-specific public control/i);
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
            /clean retest .* browser quality defect/i,
        );
    } finally {
        await fixture.cleanup();
    }
});

test("rejects a route-only reload claim without an active durable job and delayed stale response", async () => {
    const fixture = await campaignFixture();
    try {
        const audits = JSON.parse(await readFile(path.join(fixture.directory, "retests.json"), "utf8")), audit = audits.audits[0];
        const runtimeEntry = audit.evidence.find((item) => item.kind === "page-state" && !item.observationIds.length);
        const value = JSON.parse(await readFile(path.join(fixture.directory, runtimeEntry.path), "utf8"));
        value.reload.discoveredAfterReload = false;
        await writeFile(path.join(fixture.directory, runtimeEntry.path), JSON.stringify(value));
        const bytes = await readFile(path.join(fixture.directory, runtimeEntry.path));
        runtimeEntry.sha256 = hash(bytes);
        runtimeEntry.sizeBytes = bytes.length;
        await writeFile(path.join(fixture.directory, "retests.json"), `${JSON.stringify(audits)}\n`);
        await assert.rejects(() => validateP805ProductReadinessCampaign(fixture.directory, {...retest, ...fixture.anchors}), /captured recovery/i);
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
            /does not prove its installed archive executable contents/i,
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
            /does not prove its installed archive executable contents/i,
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
            /workflow evidence does not prove|installed archive executable contents/i,
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
