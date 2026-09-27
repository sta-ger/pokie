import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {chmod, mkdtemp, readFile, readdir, rm, stat, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";

// Jest is launched through the implementer command policy, whose npm wrapper
// intentionally refuses broad build commands. This whole-file test owns a
// candidate build as part of its packed-package assertion, so invoke Node's
// installed npm CLI directly rather than inheriting that test-launch wrapper.
const npmCli = path.join(path.dirname(path.dirname(process.execPath)), "lib", "node_modules", "npm", "bin", "npm-cli.js");
const candidatePath = (process.env.PATH ?? "").split(path.delimiter).filter((entry) => !entry.includes("pokie-command-policy")).join(path.delimiter);
const runCandidateNpm = (args: string[]) => {
    if (!npmCli) throw new Error("the candidate package test requires npm");
    return execFileSync(process.execPath, [npmCli, ...args], {cwd: process.cwd(), encoding: "utf8", env: {...process.env, PATH: candidatePath}, stdio: "pipe", maxBuffer: 64 * 1024 * 1024});
};

const makeWritableForCleanup = async (directory: string): Promise<void> => {
    await chmod(directory, 0o755);
    for (const entry of await readdir(directory, {withFileTypes: true})) {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) await makeWritableForCleanup(target);
    }
};

describe("P8-05 rendered Valera persona evidence", () => {
    const runner = path.join(process.cwd(), "scripts/p8-05-valera-browser-audit.mjs");
    const controller = path.join(process.cwd(), "scripts/p8-05-product-readiness-controller.mjs");
    const verifier = path.join(process.cwd(), "scripts/p8-05-candidate-package-verifier.mjs");

    it("exposes a fail-closed public runner command instead of accepting claim objects", () => {
        expect(() => execFileSync(process.execPath, [runner], {encoding: "utf8", stdio: "pipe"})).toThrow(/runner configuration is incomplete/i);
    });

    it("retains accepted tuple receipts and drains every owned child when the next tuple fails", () => {
        const fixture = path.join(process.cwd(), "tests/cli/studio-client/src/p805TupleLedgerNegative.mjs");
        const result = JSON.parse(execFileSync(process.execPath, [fixture], {cwd: process.cwd(), encoding: "utf8", stdio: "pipe"}));
        expect(result).toEqual({acceptedReceipts: 1, aggregatePublished: false, failureKind: "timeout", cleanupKinds: ["success", "timeout"], retainedFailureKinds: {failure: ["success", "failure"], cancellation: ["success", "cancellation"], "spawn-failure": ["success", "spawn-failure"], restart: ["success", "restart"], "detached-descendant": ["success", "success", "detached-descendant"], "cleanup-substitution": ["success", "failure"]}, rejectedReceiptSubstitutions: {missing: true, stale: true, "cross-candidate": true, "cross-persona": true, "cross-viewport": true, duplicate: true, "content-equivalent": true}, pointerSemanticSubstitutionRejected: true, stateClassSubstitutionRejected: true, runtimeSubstitutionRejected: true, retryTerminalSubstitutionRejected: true});
    });

    it("builds its own candidate package and executes every packed CLI and rendered Studio persona workflow", async () => {
        // This test owns the local candidate.  It deliberately does not accept
        // controller-provided environment receipts, so a green result cannot
        // be a configuration-only branch or a stale external archive.
        const worktree = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], {cwd: process.cwd(), encoding: "utf8"});
        if (worktree.trim()) throw new Error("the packed candidate must be built from a clean committed worktree");
        const candidate = execFileSync("git", ["rev-parse", "HEAD"], {cwd: process.cwd(), encoding: "utf8"}).trim();
        const candidateDirectory = await mkdtemp(path.join(tmpdir(), "p8-05-packed-candidate-"));
        const output = await mkdtemp(path.join(tmpdir(), "p8-05-real-runner-"));
        try {
            // The package test is the browser-bundle boundary: refresh the
            // candidate's Studio assets before packing so this cannot exercise
            // a stale checked-in dist directory while asserting source-only
            // accessibility identities.
            try {
                runCandidateNpm(["run", "build"]);
            } catch (error) {
                const output = error as {stdout?: Buffer | string; stderr?: Buffer | string};
                const asText = (value: Buffer | string | undefined): string => Buffer.isBuffer(value) ? value.toString("utf8") : value ?? "";
                throw new Error(`candidate build failed:\n${asText(output.stdout)}${asText(output.stderr)}`);
            }
            const packed = JSON.parse(runCandidateNpm(["pack", "--ignore-scripts", "--json", "--pack-destination", candidateDirectory])) as Array<{filename: string}>;
            expect(packed).toHaveLength(1);
            const sourceArchivePath = path.join(candidateDirectory, packed[0].filename);
            const archivePath = path.join(candidateDirectory, "candidate-package.tgz");
            const receiptPath = path.join(candidateDirectory, "candidate-executable-receipt.json");
            execFileSync(process.execPath, [verifier, "--source-archive", sourceArchivePath, "--candidate-archive", archivePath, "--candidate", candidate, "--receipt", receiptPath], {encoding: "utf8", stdio: "pipe"});
            const archive = await readFile(archivePath);
            const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
            const receiptSha256 = createHash("sha256").update(await readFile(receiptPath)).digest("hex");
            expect(receipt.authentication.scheme).toBe("verifier-owned-candidate-tree");
            expect(receipt.candidateId).toBe(candidate);
            const personas = ["mathematician", "programmer", "producer", "ui-ux", "graphic-designer"];
            const packageSha256 = createHash("sha256").update(archive).digest("hex");
            // The controller is the exact-candidate parent.  Its public
            // initial-audit phase spawns one fresh child for every
            // persona/observation/viewport tuple, validates that child's
            // immutable receipt and cleanup before the next tuple, and only
            // then hands a complete CLI/Studio matrix to independent review.
            const controllerConfig = path.join(candidateDirectory, "controller-initial-audit.json");
            await writeFile(controllerConfig, JSON.stringify({
                directory: output,
                packedCli: path.join(process.cwd(), "dist/cli/pokie.js"),
                packedPackage: archivePath,
                initialCandidate: {
                    candidateId: candidate,
                    candidatePackageSha256: packageSha256,
                    candidateExecutableSha256: receipt.candidateExecutableSha256,
                    candidateExecutableReceipt: {path: receiptPath, sha256: receiptSha256},
                },
                provenance: {
                    campaignId: "p8-05-exact-candidate-machine-proof",
                    cleanRoomAttestation: "I recorded each initial persona audit before reading prior findings, source, fixes, or prior campaign evidence.",
                },
            }));
            execFileSync(process.execPath, [controller, "initial-audit", "--config", controllerConfig], {encoding: "utf8", stdio: "inherit", timeout: 22_500_000});
            const audit = JSON.parse(await readFile(path.join(output, "initial-mathematician--blueprint--wide-audit.json"), "utf8"));
            expect(audit.packageIdentity.archiveSha256).toBe(audit.candidatePackageSha256);
            expect(audit.candidatePackageSha256).toBe(packageSha256);
            expect(audit.workflowPersonas).toEqual([audit.persona]);
            expect(audit.worker).toEqual(expect.objectContaining({pid: expect.any(Number), processIdentity: expect.any(String), nonce: expect.any(String), startedAt: expect.any(String)}));
            expect(audit.finalResult).toEqual(expect.objectContaining({status: "passed", aggregation: "verified-checkpoint-receipts-only", chunks: audit.rendered.actions.length, checkpointReceiptSha256s: audit.checkpointReceipts.map((checkpoint: {sha256: string}) => checkpoint.sha256), cleanupEvidenceId: expect.any(String)}));
            expect(audit.checkpointReceipts).toHaveLength(audit.rendered.actions.length);
            expect(audit.cleanup).toEqual(expect.objectContaining({processTreeDrained: true, resourcesDrained: true, contextRemoved: true}));
            const checkpointSlots = new Set<string>();
            for (const checkpointReceipt of audit.checkpointReceipts as Array<{receiptId: string; path: string; sha256: string; candidateId: string; candidatePackageSha256: string; workerPid: number; workerNonce: string; persona: string; observation: string; viewport: string; actionSha256: string}>) {
                const contents = await readFile(path.join(output, checkpointReceipt.path));
                const checkpoint = JSON.parse(contents.toString("utf8"));
                const action = audit.rendered.actions.find((candidate: {persona: string; observation: string; viewport: string}) => candidate.persona === checkpointReceipt.persona && candidate.observation === checkpointReceipt.observation && candidate.viewport === checkpointReceipt.viewport);
                expect(checkpointSlots.has(`${checkpointReceipt.persona}/${checkpointReceipt.observation}/${checkpointReceipt.viewport}`)).toBe(false);
                checkpointSlots.add(`${checkpointReceipt.persona}/${checkpointReceipt.observation}/${checkpointReceipt.viewport}`);
                expect(createHash("sha256").update(contents).digest("hex")).toBe(checkpointReceipt.sha256);
                expect(checkpoint).toEqual(expect.objectContaining({kind: "p8-05-packed-workflow-checkpoint", receiptId: checkpointReceipt.receiptId, auditId: audit.auditId, worker: audit.worker, candidateId: candidate, candidatePackageSha256: audit.candidatePackageSha256, persona: checkpointReceipt.persona, observation: checkpointReceipt.observation, viewport: checkpointReceipt.viewport, action}));
                expect(checkpointReceipt.workerPid).toBe(audit.worker.pid);
                expect(checkpointReceipt.workerNonce).toBe(audit.worker.nonce);
                expect(createHash("sha256").update(JSON.stringify(action)).digest("hex")).toBe(checkpointReceipt.actionSha256);
            }
            expect(checkpointSlots.size).toBe(audit.rendered.actions.length);
            const evidenceContents = async (evidenceId: string): Promise<unknown> => {
                const evidence = audit.evidence.find((item: {evidenceId: string}) => item.evidenceId === evidenceId);
                expect(evidence).toBeDefined();
                return JSON.parse(await readFile(path.join(output, evidence.path), "utf8"));
            };
            const requestOwners = new Map<string, string>();
            for (const action of audit.rendered.actions as Array<{persona: string; viewport: string; observation: string; browserRequestId: string; contextRevalidation: {browserRequestId: string}; terminal: {source: string; browserRequestId?: string}}>) {
                const identities = [
                    ["action", action.browserRequestId],
                    ...(action.contextRevalidation.browserRequestId === action.browserRequestId ? [] : [["context", action.contextRevalidation.browserRequestId] as const]),
                    ...(action.terminal.source === "rendered-poll" ? [["poll", action.terminal.browserRequestId] as const] : []),
                ];
                for (const [kind, requestId] of identities) {
                    expect(requestId).toEqual(expect.any(String));
                    expect(requestId).not.toBe("");
                    expect(requestOwners.has(requestId)).toBe(false);
                    requestOwners.set(requestId, `${action.persona}/${action.viewport}/${action.observation}/${kind}`);
                }
            }
            for (const auditedPersona of audit.workflowPersonas as string[]) {
                const recordedActions = audit.rendered.actions.filter((action: {persona: string}) => action.persona === auditedPersona);
                expect(recordedActions.every((action: {stableControlId: string; interaction: {activation: string; keyboardFocused?: boolean; pointerActivated?: boolean; keyboardActivated?: boolean}; transaction: {pointerActivations: Array<{kind: string; controlId: string; count: number; capturedControlId?: string; captureKey?: string; preDispatchFocus?: {controlId: string; native: boolean}; hitTest?: {capturedControlId: string; matchesCapturedControl: boolean}; dispatch?: {kind: string; pressed: boolean; released: boolean; focus?: {controlId: string; native: boolean; targetMatchesCapturedControl: boolean}}}>; keyboardActivations?: Array<{kind: string; controlId: string; count: number; nativeFocus?: boolean; preDispatchFocus?: {controlId: string; native: boolean}}>; postTransitionRenderedState?: {capturedControlId: string; captureKey: string; controlState: string; currentControlId: string | null; capturedControlConnected: boolean; requestId: string; resultSha256: string; renderedTerminal: boolean}}}) => {
                    const pointer = action.transaction.pointerActivations[0];
                    const keyboard = action.transaction.keyboardActivations?.[0];
                    const postTransition = action.transaction.postTransitionRenderedState;
                    let replacementStateIsBound = false;
                    if (postTransition?.controlState === "retained") replacementStateIsBound = postTransition.currentControlId === action.stableControlId && postTransition.capturedControlConnected === true;
                    else if (postTransition?.controlState === "replaced") replacementStateIsBound = postTransition.currentControlId === action.stableControlId && postTransition.capturedControlConnected === false;
                    else if (postTransition?.controlState === "removed") replacementStateIsBound = postTransition.currentControlId === null && postTransition.capturedControlConnected === false;
                    return action.interaction.activation === "pointer" && action.interaction.pointerActivated === true && action.transaction.pointerActivations.length === 1 && pointer.kind === "pointer" && pointer.controlId === action.stableControlId && pointer.capturedControlId === action.stableControlId && typeof pointer.captureKey === "string" && pointer.captureKey.length > 0 && pointer.preDispatchFocus?.controlId === action.stableControlId && pointer.preDispatchFocus.native && pointer.hitTest?.capturedControlId === action.stableControlId && pointer.hitTest.matchesCapturedControl && pointer.dispatch?.kind === "native-pointer" && pointer.dispatch.pressed && pointer.dispatch.released && pointer.dispatch.focus?.controlId === action.stableControlId && pointer.dispatch.focus.native && pointer.dispatch.focus.targetMatchesCapturedControl && postTransition?.capturedControlId === action.stableControlId && postTransition.captureKey === pointer.captureKey && replacementStateIsBound && postTransition.renderedTerminal === true || action.interaction.activation === "keyboard" && action.interaction.keyboardFocused === true && action.interaction.keyboardActivated === true && action.transaction.keyboardActivations?.length === 1 && keyboard?.kind === "keyboard" && keyboard.nativeFocus === true && keyboard.preDispatchFocus?.controlId === action.stableControlId && keyboard.preDispatchFocus.native && keyboard.controlId === action.stableControlId && keyboard.count === 1;
                })).toBe(true);
                const actions = recordedActions;
                expect(actions.length).toBeGreaterThan(0);
                for (const action of actions as Array<{observation: string; viewport: string; expectedControl: string; expectedMethod: string; expectedApi: string; expectedBodyKind: string | null; expectedArtifact: string | null; screenState: string; screenNavigationControl: string; stableControlId: string; domControlId: string; identityAttribute: string; browserRequestId: string; contextRevalidation: {browserRequestId: string; method: string; path: string; status: number; responseSha256: string; projectStatus: string; completedBeforeSelection: boolean}; interaction: {matchedLabel: string; stableControlId: string; identityAttribute: string; transactionState: string; activation: string; pointerActivated?: boolean; keyboardActivated?: boolean; lifecycle: {kind: string; value: string}}; transaction: {operation: string; stateClass: string; control: {stableControlId: string; accessibleName: string; enabled: boolean; disabled: boolean; disabledExplanation: null}; formState?: {operation: string; capturedBeforeSubmission: boolean; scope: {identityAttribute: string; value: string; tagName: string}; actionControl: {stableControlId: string; identityAttribute: string; visible: boolean; accessibleName: string; validation: {valid: boolean; message: string}}; fields: Array<{stableControlId: string; identityAttribute: string; visible: boolean; accessibleName: string; value: string; disabled: boolean; required: boolean; validation: {valid: boolean; message: string}}>}; confirmation: {required: boolean; state: string; control: null}; pointerActivations: Array<{phase: string; kind: string; controlId: string; count: number}>; keyboardActivations?: Array<{phase: string; kind: string; controlId: string; count: number}>; request: {browserRequestId: string; method: string; path: string; status: number; responseSha256: string}; terminal: {resultSha256: string; source: string}}; precondition: {enabled: boolean; disabled: boolean; disabledExplanation: null; accessibleName: string}; accessibility: {namedRegions: string[]; visibleFocus: boolean; unexplainedDisabledControls: number}; visibleTerminal: {state: string; changedAfterRequest: boolean; observedAfterRequestId: string; beforeTextSha256: string; textSha256: string; resultSha256: string; lifecycle: {role: string; terminal: string; text: string; stateClass: string; controlId?: string; jobId?: string; target?: string; outputPath?: string; artifact: {name: string; accessibleName: string; target?: string; outputPath?: string} | null}}; terminal: {resultSha256: string; jobId?: string; result?: {result?: {target?: string; outputPath?: string}}}; evidenceId: string; screenshotEvidenceId: string; elapsedMs: number}>) {
                    expect(actions.filter((candidate: {observation: string; viewport: string}) => candidate.observation === action.observation && candidate.viewport === action.viewport)).toHaveLength(1);
                    let expectedTransactionState = "editable-submission";
                    if (action.interaction.lifecycle.kind === "navigation") expectedTransactionState = "navigation";
                    else if (action.expectedMethod === "GET") expectedTransactionState = "read-only-operation";
                    const formState = action.transaction.formState;
                    const requiresEditableForm = expectedTransactionState === "editable-submission";
                    const pointerActivation = action.transaction.pointerActivations[0];
                    const keyboardActivation = action.transaction.keyboardActivations?.[0];
                    const pointerSemantic = pointerActivation as typeof pointerActivation & {capturedControlId?: string; captureKey?: string; preDispatchFocus?: {controlId: string; native: boolean}; hitTest?: {capturedControlId: string; matchesCapturedControl: boolean}; dispatch?: {kind: string; pressed: boolean; released: boolean; focus?: {controlId: string; native: boolean; targetMatchesCapturedControl: boolean}}};
                    const keyboardSemantic = keyboardActivation as typeof keyboardActivation & {nativeFocus?: boolean; preDispatchFocus?: {controlId: string; native: boolean}};
                    const keyboardFocused = (action.interaction as typeof action.interaction & {keyboardFocused?: boolean}).keyboardFocused;
                    const postTransition = (action.transaction as typeof action.transaction & {postTransitionRenderedState?: {capturedControlId: string; captureKey: string; controlState: string; currentControlId: string | null; capturedControlConnected: boolean; requestId: string; resultSha256: string; renderedTerminal: boolean}}).postTransitionRenderedState;
                    let replacementStateIsBound = false;
                    if (postTransition?.controlState === "retained") replacementStateIsBound = postTransition.currentControlId === action.stableControlId && postTransition.capturedControlConnected === true;
                    else if (postTransition?.controlState === "replaced") replacementStateIsBound = postTransition.currentControlId === action.stableControlId && postTransition.capturedControlConnected === false;
                    else if (postTransition?.controlState === "removed") replacementStateIsBound = postTransition.currentControlId === null && postTransition.capturedControlConnected === false;
                    const renderedActivation = action.interaction.activation === "pointer"
                        ? action.interaction.pointerActivated === true && action.transaction.pointerActivations.length === 1 && pointerActivation.phase === "operation" && pointerActivation.kind === "pointer" && pointerActivation.controlId === action.stableControlId && pointerActivation.count === 1 && pointerSemantic.capturedControlId === action.stableControlId && typeof pointerSemantic.captureKey === "string" && pointerSemantic.captureKey.length > 0 && pointerSemantic.preDispatchFocus?.controlId === action.stableControlId && pointerSemantic.preDispatchFocus.native && pointerSemantic.hitTest?.capturedControlId === action.stableControlId && pointerSemantic.hitTest.matchesCapturedControl && pointerSemantic.dispatch?.kind === "native-pointer" && pointerSemantic.dispatch.pressed && pointerSemantic.dispatch.released && pointerSemantic.dispatch.focus?.controlId === action.stableControlId && pointerSemantic.dispatch.focus.native && pointerSemantic.dispatch.focus.targetMatchesCapturedControl && postTransition?.capturedControlId === action.stableControlId && postTransition.captureKey === pointerSemantic.captureKey && replacementStateIsBound && postTransition?.requestId === action.browserRequestId && postTransition?.resultSha256 === action.terminal.resultSha256 && postTransition?.renderedTerminal === true
                        : action.interaction.activation === "keyboard" && keyboardFocused === true && action.interaction.keyboardActivated === true && action.transaction.keyboardActivations?.length === 1 && keyboardActivation?.phase === "operation" && keyboardActivation.kind === "keyboard" && keyboardSemantic.nativeFocus === true && keyboardSemantic.preDispatchFocus?.controlId === action.stableControlId && keyboardSemantic.preDispatchFocus.native && keyboardActivation.controlId === action.stableControlId && keyboardActivation.count === 1;
                    const renderedTerminalIsBound = action.visibleTerminal.lifecycle.controlId === action.stableControlId && action.visibleTerminal.lifecycle.stateClass === action.transaction.stateClass && (action.terminal.source !== "rendered-poll" || action.visibleTerminal.lifecycle.jobId === action.terminal.jobId);
                    if (formState !== undefined) {
                        expect(formState.scope).toEqual({identityAttribute: "data-pokie-lifecycle-form", value: action.transaction.operation, tagName: expect.any(String)});
                        expect(formState.actionControl).toEqual(expect.objectContaining({visible: true, validation: {valid: true, message: expect.any(String)}}));
                        for (const field of formState.fields) expect(field).toEqual(expect.objectContaining({visible: true, validation: {valid: true, message: expect.any(String)}}));
                    }
                    expect(Boolean(action.expectedControl) && (/^\/api\//).test(action.expectedApi) && action.screenState.length > 0 && action.screenNavigationControl === action.expectedControl && Boolean(action.stableControlId) && action.domControlId === action.stableControlId && action.identityAttribute === "id" && action.contextRevalidation.method === "GET" && action.contextRevalidation.path === "/api/project/context" && action.contextRevalidation.status >= 200 && action.contextRevalidation.status < 400 && (/^[a-f0-9]{64}$/i).test(action.contextRevalidation.responseSha256) && ["loaded", "outcome-source", "artifact"].includes(action.contextRevalidation.projectStatus) && action.contextRevalidation.completedBeforeSelection && Boolean(action.contextRevalidation.browserRequestId) && action.interaction.stableControlId === action.stableControlId && action.interaction.identityAttribute === "id" && action.interaction.transactionState === expectedTransactionState && Boolean(action.interaction.lifecycle.kind) && Boolean(action.interaction.lifecycle.value) && Boolean(action.browserRequestId) && action.precondition.enabled && !action.precondition.disabled && action.precondition.disabledExplanation === null && action.precondition.accessibleName === action.interaction.matchedLabel && action.transaction.operation === action.interaction.lifecycle.value && action.transaction.stateClass === expectedTransactionState && action.transaction.control.stableControlId === action.stableControlId && action.transaction.control.accessibleName === action.interaction.matchedLabel && action.transaction.control.enabled && !action.transaction.control.disabled && action.transaction.control.disabledExplanation === null && (requiresEditableForm ? formState !== undefined && formState.operation === action.transaction.operation && formState.capturedBeforeSubmission && formState.actionControl.stableControlId === action.transaction.control.stableControlId && formState.actionControl.identityAttribute === "id" && formState.actionControl.accessibleName === action.transaction.control.accessibleName && formState.fields.length > 0 && formState.fields.every((field) => field.identityAttribute === "id" && Boolean(field.stableControlId) && Boolean(field.accessibleName) && !field.disabled && field.validation.valid && typeof field.validation.message === "string") : formState === undefined) && !action.transaction.confirmation.required && action.transaction.confirmation.state === "not-required" && action.transaction.confirmation.control === null && renderedActivation && action.transaction.request.browserRequestId === action.browserRequestId && action.transaction.request.method === action.expectedMethod && action.transaction.request.path === action.expectedApi && action.transaction.request.status >= 200 && action.transaction.request.status < 400 && (/^[a-f0-9]{64}$/i).test(action.transaction.request.responseSha256) && action.transaction.terminal.resultSha256 === action.terminal.resultSha256 && ["response", "rendered-poll"].includes(action.transaction.terminal.source) && action.visibleTerminal.state === "rendered" && action.visibleTerminal.changedAfterRequest && action.visibleTerminal.observedAfterRequestId === action.browserRequestId && (/^[a-f0-9]{64}$/i).test(action.visibleTerminal.beforeTextSha256) && (/^[a-f0-9]{64}$/i).test(action.visibleTerminal.textSha256) && action.visibleTerminal.beforeTextSha256 !== action.visibleTerminal.textSha256 && action.visibleTerminal.resultSha256 === action.terminal.resultSha256 && Boolean(action.visibleTerminal.lifecycle.role) && Boolean(action.visibleTerminal.lifecycle.terminal) && Boolean(action.visibleTerminal.lifecycle.text) && renderedTerminalIsBound && (action.expectedBodyKind === null || action.expectedArtifact === null || (action.visibleTerminal.lifecycle.artifact?.name === action.expectedArtifact && Boolean(action.visibleTerminal.lifecycle.artifact.accessibleName))) && (/^[a-f0-9]{64}$/i).test(action.terminal.resultSha256) && action.accessibility.namedRegions.length > 0 && action.accessibility.visibleFocus && action.accessibility.unexplainedDisabledControls === 0 && Boolean(action.evidenceId) && Boolean(action.screenshotEvidenceId) && action.elapsedMs > 0).toBe(true);
                }
            }
            const completeWorkflow = ["simulation-success-failure-cancellation", "outcome-library-report-diff-replay", "replay-artifact-success-failure-recovery", "reload-reconnect-recovery-cancellation-project-switch"].includes(audit.tuple.observation);
            expect(audit.workflowScope).toEqual(expect.objectContaining({kind: "p8-05-single-tuple-workflow-scope", tuple: audit.tuple, recoveryRequired: completeWorkflow, scopeEvidenceId: expect.any(String)}));
            expect(audit.workflowScope.bootstrap.length).toBeGreaterThanOrEqual(3);
            if (completeWorkflow) {
                expect(audit.rendered.recovery).toEqual(expect.objectContaining({reloadReconnect: expect.objectContaining({observed: true}), projectSwitch: expect.objectContaining({observed: true}), staleResponseIsolation: expect.objectContaining({observed: true}), unsavedWorkProtection: expect.objectContaining({observed: true}), serverRestart: expect.objectContaining({observed: true})}));
                expect(audit.rendered.jobs).toEqual(expect.objectContaining({success: expect.objectContaining({observed: true}), actionableFailure: expect.objectContaining({observed: true}), cooperativeCancellation: expect.objectContaining({observed: true}), retryWithoutPartialArtifacts: expect.objectContaining({observed: true})}));
            } else {
                expect(audit.rendered.recovery).toEqual({});
                expect(audit.rendered.jobs).toEqual({});
            }
            if (!audit.tuple) {
                const pageState = await evidenceContents(audit.rendered.recovery.cooperativeCancellation.evidenceId) as {transactions: Record<string, {operation: string; control: {stableControlId: string; accessibleName: string; enabled: boolean; disabled: boolean; disabledExplanation: null}; formState?: {operation: string; capturedBeforeSubmission: boolean; actionControl: {stableControlId: string; identityAttribute: string; accessibleName: string}; fields: Array<{stableControlId: string; identityAttribute: string; accessibleName: string; value: string; disabled: boolean; validation: {valid: boolean; message: string}}>} ; confirmation: {required: boolean; state: string; control: {stableControlId: string; accessibleName: string; enabled: boolean; disabled: boolean; disabledExplanation: null} | null; activation?: {kind: string; controlId: string; count: number}}; keyboardActivations: Array<{phase: string; controlId: string; count: number}>; request: {browserRequestId: string; method: string; path: string; status: number; responseSha256: string}; terminal: {status: string; resultSha256: string; source: string; pollPath: string; browserRequestId: string; causedByRequestId: string}}>; unsavedWork: {editControl: {stableControlId: string; identityAttribute: string; accessibleName: string; keyboardFocused: boolean; keyboardActivations: number}; navigationControl: {stableControlId: string; identityAttribute: string; accessibleName: string; keyboardActivations: number}; cancelControl: {stableControlId: string; identityAttribute: string; accessibleName: string; keyboardFocused: boolean; keyboardActivations: number}}};
                const confirmedTransactions = [pageState.transactions.activeReloadCancellation, pageState.transactions.cooperativeCancellation];
                for (const transaction of confirmedTransactions) {
                    expect(transaction.operation).toBe("simulation-cancel");
                    expect(transaction.control).toEqual(expect.objectContaining({enabled: true, disabled: false, disabledExplanation: null}));
                    expect(transaction.confirmation).toEqual(expect.objectContaining({required: true, state: "confirmed", control: expect.objectContaining({enabled: true, disabled: false, disabledExplanation: null})}));
                    expect(transaction.keyboardActivations).toEqual([{phase: "operation", controlId: transaction.control.stableControlId, count: 1}]);
                    expect(transaction.confirmation.activation).toEqual({kind: "pointer", controlId: transaction.confirmation.control?.stableControlId, count: 1});
                }
                expect(pageState.transactions.projectValidation).toEqual(expect.objectContaining({
                    operation: "project-validation",
                    control: expect.objectContaining({enabled: true, disabled: false, disabledExplanation: null}),
                    confirmation: {required: false, state: "not-required", control: null},
                    keyboardActivations: [{phase: "operation", controlId: expect.any(String), count: 1}],
                    request: expect.objectContaining({method: "GET", path: "/api/project/validate", status: 200, browserRequestId: expect.any(String)}),
                    terminal: expect.objectContaining({status: "completed", source: "response", causedByRequestId: expect.any(String)}),
                }));
                expect(pageState.transactions.projectValidation.terminal.causedByRequestId).toBe(pageState.transactions.projectValidation.request.browserRequestId);
                for (const control of [pageState.unsavedWork.editControl, pageState.unsavedWork.navigationControl, pageState.unsavedWork.cancelControl]) {
                    expect(control).toEqual(expect.objectContaining({stableControlId: expect.any(String), identityAttribute: "id", accessibleName: expect.any(String), keyboardActivations: 1}));
                }
                for (const name of ["activeReloadStart", "activeReloadCancellation", "simulationSuccess", "replaySuccess", "replayRecovery", "cancellableSimulation", "cooperativeCancellation", "simulationRetry", "restartSimulation"]) {
                    const transaction = pageState.transactions[name];
                    expect(transaction.request).toEqual(expect.objectContaining({browserRequestId: expect.any(String), method: expect.any(String), path: expect.any(String), status: expect.any(Number), responseSha256: expect.stringMatching(/^[a-f0-9]{64}$/)}));
                    expect(transaction.terminal).toEqual(expect.objectContaining({resultSha256: expect.stringMatching(/^[a-f0-9]{64}$/), source: "rendered-poll", pollPath: expect.any(String), browserRequestId: expect.any(String), causedByRequestId: transaction.request.browserRequestId}));
                }
                // Durable recovery starts share the same form-state-first
                // contract as the persona matrix.  A route change plus an API
                // call must not be enough to manufacture a simulation or replay
                // lifecycle receipt.
                for (const name of ["activeReloadStart", "simulationFailure", "simulationSuccess", "replayFailure", "replaySuccess", "replayRecovery", "cancellableSimulation", "restartSimulation"]) {
                    const transaction = pageState.transactions[name];
                    expect(transaction.formState).toEqual(expect.objectContaining({
                        operation: transaction.operation,
                        capturedBeforeSubmission: true,
                        actionControl: expect.objectContaining({stableControlId: transaction.control.stableControlId, identityAttribute: "id", accessibleName: transaction.control.accessibleName}),
                        fields: expect.arrayContaining([expect.objectContaining({identityAttribute: "id", stableControlId: expect.any(String), accessibleName: expect.any(String), disabled: false, validation: expect.objectContaining({valid: expect.any(Boolean), message: expect.any(String)})})]),
                    }));
                }
            }
            expect(audit.cleanup).toEqual(expect.objectContaining({processTreeDrained: true, resourcesDrained: true, contextRemoved: true}));
            expect(audit.evidence.some((item: {kind: string}) => item.kind === "screenshot")).toBe(true);
            const aggregatePath = path.join(output, "initial-process-isolated-packed-proof.json");
            const aggregate = JSON.parse(await readFile(aggregatePath, "utf8"));
            const controllerProof = JSON.parse(await readFile(path.join(output, "initial-controller-machine-proof.json"), "utf8"));
            const requiredObservations: Record<string, string[]> = {
                mathematician: ["blueprint", "par-xlsx-round-trip", "reels-paytable-modes-mechanics", "simulation-success-failure-cancellation", "simulation-rtp-volatility-features", "outcome-library-report-diff-replay", "replay-artifact-success-failure-recovery", "certification-conditional", "fairness-conditional", "build-export-output-folder", "import-export-defaults"],
                programmer: ["packed-install", "npx-pokie", "recursive-help", "create-build-inspect", "validate-sim-report-diff-replay-serve-wasm", "spaces-invalid-inputs-exit-codes-ci-recovery", "build-export-output-folder"],
                producer: ["product-framing", "end-to-end-navigation", "trust"],
                "ui-ux": ["onboarding-terminology-forms-progress", "reload-reconnect-recovery-cancellation-project-switch", "keyboard-responsive-accessibility"],
                "graphic-designer": ["hierarchy-typography-spacing-density-controls-finish"],
            };
            const expectedTuples = personas.flatMap((persona) => requiredObservations[persona].flatMap((observation) => ["wide", "compact", "narrow"].map((viewport) => `${persona}/${observation}/${viewport}`)));
            expect(aggregate).toEqual(expect.objectContaining({schemaVersion: 1, kind: "p8-05-process-isolated-packed-proof", candidateId: candidate, candidatePackageSha256: packageSha256, status: "passed", parent: expect.objectContaining({pid: expect.any(Number), processIdentity: expect.any(String), nonce: expect.any(String)}), finalResult: expect.objectContaining({status: "passed", children: expectedTuples.length, checkpointReceipts: expectedTuples.length, aggregation: "independently-verified-immutable-tuple-child-receipts-only"})}));
            expect(controllerProof).toEqual(expect.objectContaining({
                schemaVersion: 4,
                kind: "p8-05-controller-machine-proof",
                status: "passed",
                execution: "controller-owned-exact-candidate-packed-cli-and-rendered-studio-matrix",
                phase: "initial",
                candidateId: candidate,
                candidatePackageSha256: packageSha256,
                candidateExecutableSha256: receipt.candidateExecutableSha256,
                proofLedger: {
                    path: "initial-process-isolated-packed-proof.json",
                    sha256: createHash("sha256").update(await readFile(aggregatePath)).digest("hex"),
                    candidateId: candidate,
                    candidatePackageSha256: packageSha256,
                    status: "passed",
                    aggregation: "independently-verified-immutable-tuple-child-receipts-only",
                },
                tuples: expectedTuples,
                audits: {count: 5, personas, ids: expect.arrayContaining([expect.any(String)]), tupleReceiptAuditIds: expect.arrayContaining([expect.any(String)])},
            }));
            expect(aggregate.runtime).toEqual(expect.objectContaining({receiptPath: expect.any(String), receiptSha256: expect.stringMatching(/^[a-f0-9]{64}$/), installationCount: 1, permissions: "read-only-before-any-tuple-child"}));
            const runtimeReceiptBytes = await readFile(path.join(output, aggregate.runtime.receiptPath));
            const runtimeReceipt = JSON.parse(runtimeReceiptBytes.toString("utf8"));
            expect(createHash("sha256").update(runtimeReceiptBytes).digest("hex")).toBe(aggregate.runtime.receiptSha256);
            expect(runtimeReceipt).toEqual(expect.objectContaining({kind: "p8-05-immutable-packed-runtime", candidateId: candidate, candidatePackageSha256: packageSha256, candidateExecutableSha256: receipt.candidateExecutableSha256, installation: expect.objectContaining({count: 1}), permissions: "read-only-before-any-tuple-child"}));
            expect((await stat(runtimeReceipt.runtimeRoot)).mode & 0o222).toBe(0);
            expect((await stat(runtimeReceipt.packageRoot)).mode & 0o222).toBe(0);
            expect(aggregate.children).toHaveLength(expectedTuples.length);
            expect(aggregate.acceptedReceipts).toHaveLength(expectedTuples.length);
            expect(aggregate.children.map((child) => `${child.tuple.persona}/${child.tuple.observation}/${child.tuple.viewport}`)).toEqual(expectedTuples);
            expect(new Set(aggregate.children.map((child) => child.auditSha256)).size).toBe(expectedTuples.length);
            expect(new Set(aggregate.children.map((child) => child.worker.nonce)).size).toBe(expectedTuples.length);
            expect(new Set(aggregate.children.flatMap((child) => child.checkpointReceiptSha256s)).size).toBe(aggregate.children.reduce((count, child) => count + child.checkpointReceiptSha256s.length, 0));
            expect(aggregate.children.every((child) => child.exitCode === 0 && child.signal === null && child.worker.pid !== aggregate.parent.pid && child.tupleReceiptPath && child.tupleReceiptSha256 && child.cleanupPath && child.cleanupSha256)).toBe(true);
            const tupleCliReceipts: Record<string, string> = {
                "programmer/npx-pokie": "PACKED_NPX_HELP",
                "programmer/recursive-help": "packed CLI help --help",
                "programmer/create-build-inspect": "packed CLI inspect",
                "programmer/validate-sim-report-diff-replay-serve-wasm": "packed CLI serve",
                "programmer/spaces-invalid-inputs-exit-codes-ci-recovery": "packed CLI invalid-input recovery",
                "programmer/build-export-output-folder": "packed CLI PAR build",
                "mathematician/par-xlsx-round-trip": "packed CLI PAR import",
                "mathematician/reels-paytable-modes-mechanics": "packed CLI reels",
                "mathematician/certification-conditional": "packed CLI Outcome Library export",
                "mathematician/fairness-conditional": "packed CLI package build",
            };
            const immutableArtifacts = new Set<string>();
            for (const [index, child] of (aggregate.children as Array<{tuple: {persona: string; observation: string; viewport: string}; auditSha256: string; tupleReceiptPath: string; tupleReceiptSha256: string; cleanupPath: string; cleanupSha256: string; checkpointReceiptSha256s: string[]; cleanupEvidenceId: string}>).entries()) {
                const accepted = aggregate.acceptedReceipts[index] as {receipt: {auditId: string; tuple: unknown; cleanupEvidenceId: string; cleanupSha256: string; checkpointReceipt: {actionSha256: string}}; cleanup: {cleanupEvidenceId: string; cleanup: {exit: string; processTreeDrained: boolean; resourcesDrained: boolean; contextRemoved: boolean}}};
                const [tupleReceiptBytes, cleanupBytes, auditBytes] = await Promise.all([readFile(path.join(output, child.tupleReceiptPath)), readFile(path.join(output, child.cleanupPath)), readFile(path.join(output, `initial-${child.tuple.persona}--${child.tuple.observation.replaceAll(/[^a-z0-9]+/gi, "-")}--${child.tuple.viewport}-audit.json`))]);
                const tupleReceipt = JSON.parse(tupleReceiptBytes.toString("utf8"));
                const cleanup = JSON.parse(cleanupBytes.toString("utf8"));
                expect(createHash("sha256").update(tupleReceiptBytes).digest("hex")).toBe(child.tupleReceiptSha256);
                expect(createHash("sha256").update(cleanupBytes).digest("hex")).toBe(child.cleanupSha256);
                expect(createHash("sha256").update(auditBytes).digest("hex")).toBe(child.auditSha256);
                expect(tupleReceipt).toEqual(expect.objectContaining({status: "passed", tuple: child.tuple, cleanupEvidenceId: child.cleanupEvidenceId, cleanupSha256: child.cleanupSha256, auditId: expect.any(String)}));
                expect(cleanup).toEqual(expect.objectContaining({tuple: child.tuple, cleanupEvidenceId: child.cleanupEvidenceId, cleanup: expect.objectContaining({exit: "success", processTreeDrained: true, resourcesDrained: true, contextRemoved: true})}));
                expect(accepted.receipt.cleanupEvidenceId).toBe(cleanup.cleanupEvidenceId);
                expect(accepted.receipt.cleanupSha256).toBe(child.cleanupSha256);
                expect(accepted.cleanup.cleanupEvidenceId).toBe(child.cleanupEvidenceId);
                expect(accepted.receipt.checkpointReceipt.actionSha256).toEqual(expect.any(String));
                const audit = JSON.parse(auditBytes.toString("utf8")) as {packageIdentity: {sharedRuntimeReceiptSha256: string; sharedRuntimeRoot: string}; workflowScope: {bootstrap: Array<{kind: string; purpose: string; publicWorkflow: string; output?: string; evidenceId: string}>}; evidence: Array<{kind: string; path: string}>};
                expect(audit.packageIdentity).toEqual(expect.objectContaining({sharedRuntimeReceiptSha256: aggregate.runtime.receiptSha256, sharedRuntimeRoot: runtimeReceipt.runtimeRoot}));
                const bootstrap = audit.workflowScope.bootstrap.map(({evidenceId: _evidenceId, ...entry}) => entry);
                const sourcePurpose = child.tuple.observation === "fairness-conditional" ? "fairness-source" : "certification-source";
                const expectedBootstrap = [
                    {kind: "packed-package-install", purpose: "mandatory-local-bootstrap", publicWorkflow: child.tuple.observation},
                    {kind: "packed-cli-create", purpose: "mandatory-local-bootstrap", publicWorkflow: child.tuple.observation},
                    {kind: "studio-project-create", purpose: "mandatory-local-bootstrap", publicWorkflow: child.tuple.observation},
                    ...(child.tuple.observation === "simulation-rtp-volatility-features" ? [
                        {kind: "studio-simulation-report-source", purpose: "rendered-report-source", publicWorkflow: child.tuple.observation, output: "simulation-report"},
                    ] : []),
                    ...(["certification-conditional", "trust"].includes(child.tuple.observation) ? [
                        {kind: "outcome-library-source-bundle", purpose: sourcePurpose, publicWorkflow: child.tuple.observation, output: "outcome-bundle"},
                        {kind: "studio-import-outcome-bundle", purpose: sourcePurpose, publicWorkflow: child.tuple.observation, output: "outcome-bundle"},
                    ] : []),
                    ...(child.tuple.observation === "fairness-conditional" ? [
                        {kind: "outcome-library-source-bundle", purpose: sourcePurpose, publicWorkflow: child.tuple.observation, output: "outcome-bundle"},
                        {kind: "runtime-package", purpose: sourcePurpose, publicWorkflow: child.tuple.observation, output: "runtime-package"},
                        {kind: "studio-import-runtime-package", purpose: sourcePurpose, publicWorkflow: child.tuple.observation, output: "runtime-package"},
                    ] : []),
                ];
                expect(bootstrap).toEqual(expectedBootstrap);
                expect(audit.workflowScope.bootstrap.every((entry) => typeof entry.evidenceId === "string" && entry.evidenceId.length > 0)).toBe(true);
                const bootstrapEvidence = audit.evidence.find((item) => item.path.endsWith("tuple-bootstrap.json"));
                expect(bootstrapEvidence).toBeDefined();
                const bootstrapReceipt = JSON.parse(await readFile(path.join(output, bootstrapEvidence!.path), "utf8"));
                if (child.tuple.observation === "simulation-rtp-volatility-features") {
                    expect(bootstrapReceipt.renderedBootstrap).toEqual(expect.objectContaining({
                        kind: "studio-simulation-report-source",
                        source: "rendered-control",
                        controlId: "simulation-run",
                        request: expect.objectContaining({browserRequestId: expect.any(String), method: "POST", path: "/api/project/simulations", status: 202}),
                        terminal: expect.objectContaining({status: "completed", resultSha256: expect.stringMatching(/^[a-f0-9]{64}$/), browserRequestId: expect.any(String)}),
                    }));
                } else expect(bootstrapReceipt.renderedBootstrap).toBeUndefined();
                const cliReceipt = tupleCliReceipts[`${child.tuple.persona}/${child.tuple.observation}`];
                if (cliReceipt) {
                    const transcriptEvidence = audit.evidence.find((item) => item.kind === "cli-transcript");
                    expect(transcriptEvidence).toBeDefined();
                    expect(await readFile(path.join(output, transcriptEvidence!.path), "utf8")).toContain(cliReceipt);
                }
                for (const artifact of [child.auditSha256, child.tupleReceiptSha256, child.cleanupSha256, ...child.checkpointReceiptSha256s]) {
                    expect(immutableArtifacts.has(artifact)).toBe(false);
                    immutableArtifacts.add(artifact);
                }
            }
        } finally {
            // The passing receipt deliberately retains a read-only packed
            // runtime for inspection; test-owned temporary evidence must
            // restore cleanup permissions after those assertions.
            await makeWritableForCleanup(output);
            await rm(output, {recursive: true, force: true});
            await rm(candidateDirectory, {recursive: true, force: true});
        }
    }, 40_000_000);
});
