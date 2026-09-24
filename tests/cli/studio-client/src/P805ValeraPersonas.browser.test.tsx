import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdtemp, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";

describe("P8-05 rendered Valera persona evidence", () => {
    const runner = path.join(process.cwd(), "scripts/p8-05-valera-browser-audit.mjs");
    const verifier = path.join(process.cwd(), "scripts/p8-05-candidate-package-verifier.mjs");

    it("exposes a fail-closed public runner command instead of accepting claim objects", () => {
        expect(() => execFileSync(process.execPath, [runner], {encoding: "utf8", stdio: "pipe"})).toThrow(/runner configuration is incomplete/i);
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
                execFileSync("npm", ["run", "build"], {cwd: process.cwd(), encoding: "utf8", stdio: "pipe", maxBuffer: 64 * 1024 * 1024});
            } catch (error) {
                const output = error as {stdout?: Buffer | string; stderr?: Buffer | string};
                const asText = (value: Buffer | string | undefined): string => Buffer.isBuffer(value) ? value.toString("utf8") : value ?? "";
                throw new Error(`candidate build failed:\n${asText(output.stdout)}${asText(output.stderr)}`);
            }
            const packed = JSON.parse(execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", candidateDirectory], {cwd: process.cwd(), encoding: "utf8", stdio: "pipe", maxBuffer: 64 * 1024 * 1024})) as Array<{filename: string}>;
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
            // The exact-candidate parent is a real process too.  It spawns
            // one fresh child for every persona/observation/viewport tuple,
            // validates that child's immutable receipt and cleanup before the
            // next tuple, and publishes a passing aggregate only after the
            // complete packed CLI/Studio matrix has exited cleanly.
            execFileSync(process.execPath, [runner, "--persona", "all", "--phase", "initial", "--candidate", candidate, "--package-sha256", packageSha256, "--candidate-executable-sha256", receipt.candidateExecutableSha256, "--candidate-executable-receipt", receiptPath, "--candidate-executable-receipt-sha256", receiptSha256, "--packed-package", archivePath, "--output", output], {encoding: "utf8", stdio: "inherit", timeout: 22_500_000});
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
                    ["context", action.contextRevalidation.browserRequestId],
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
                const actions = audit.rendered.actions.filter((action: {persona: string}) => action.persona === auditedPersona);
                expect(actions.length).toBeGreaterThan(0);
                for (const action of actions as Array<{observation: string; viewport: string; expectedControl: string; expectedMethod: string; expectedApi: string; expectedBodyKind: string | null; expectedArtifact: string | null; screenState: string; screenNavigationControl: string; stableControlId: string; domControlId: string; identityAttribute: string; browserRequestId: string; contextRevalidation: {browserRequestId: string; method: string; path: string; status: number; responseSha256: string; projectStatus: string; completedBeforeSelection: boolean}; interaction: {matchedLabel: string; stableControlId: string; identityAttribute: string; transactionState: string; lifecycle: {kind: string; value: string}}; transaction: {operation: string; stateClass: string; control: {stableControlId: string; accessibleName: string; enabled: boolean; disabled: boolean; disabledExplanation: null}; formState?: {operation: string; capturedBeforeSubmission: boolean; scope: {identityAttribute: string; value: string; tagName: string}; actionControl: {stableControlId: string; identityAttribute: string; visible: boolean; accessibleName: string; validation: {valid: boolean; message: string}}; fields: Array<{stableControlId: string; identityAttribute: string; visible: boolean; accessibleName: string; value: string; disabled: boolean; required: boolean; validation: {valid: boolean; message: string}}>}; confirmation: {required: boolean; state: string; control: null}; keyboardActivations: Array<{phase: string; controlId: string; count: number}>; request: {browserRequestId: string; method: string; path: string; status: number; responseSha256: string}; terminal: {resultSha256: string; source: string}}; precondition: {enabled: boolean; disabled: boolean; disabledExplanation: null; accessibleName: string}; accessibility: {namedRegions: string[]; visibleFocus: boolean; unexplainedDisabledControls: number}; visibleTerminal: {state: string; changedAfterRequest: boolean; observedAfterRequestId: string; beforeTextSha256: string; textSha256: string; resultSha256: string; lifecycle: {role: string; terminal: string; text: string; artifact: {name: string; accessibleName: string} | null}}; terminal: {resultSha256: string}; evidenceId: string; screenshotEvidenceId: string; elapsedMs: number}>) {
                    expect(actions.filter((candidate: {observation: string; viewport: string}) => candidate.observation === action.observation && candidate.viewport === action.viewport)).toHaveLength(1);
                    let expectedTransactionState = "editable-submission";
                    if (action.interaction.lifecycle.kind === "navigation") expectedTransactionState = "navigation";
                    else if (action.expectedMethod === "GET") expectedTransactionState = "read-only-operation";
                    const formState = action.transaction.formState;
                    const requiresEditableForm = expectedTransactionState === "editable-submission";
                    if (formState !== undefined) {
                        expect(formState.scope).toEqual({identityAttribute: "data-pokie-lifecycle-form", value: action.transaction.operation, tagName: expect.any(String)});
                        expect(formState.actionControl).toEqual(expect.objectContaining({visible: true, validation: {valid: true, message: expect.any(String)}}));
                        for (const field of formState.fields) expect(field).toEqual(expect.objectContaining({visible: true, validation: {valid: true, message: expect.any(String)}}));
                    }
                    expect(Boolean(action.expectedControl) && (/^\/api\//).test(action.expectedApi) && action.screenState.length > 0 && action.screenNavigationControl === action.expectedControl && Boolean(action.stableControlId) && action.domControlId === action.stableControlId && action.identityAttribute === "id" && action.contextRevalidation.method === "GET" && action.contextRevalidation.path === "/api/project/context" && action.contextRevalidation.status >= 200 && action.contextRevalidation.status < 400 && (/^[a-f0-9]{64}$/i).test(action.contextRevalidation.responseSha256) && ["loaded", "outcome-source", "artifact"].includes(action.contextRevalidation.projectStatus) && action.contextRevalidation.completedBeforeSelection && Boolean(action.contextRevalidation.browserRequestId) && action.interaction.stableControlId === action.stableControlId && action.interaction.identityAttribute === "id" && action.interaction.transactionState === expectedTransactionState && Boolean(action.interaction.lifecycle.kind) && Boolean(action.interaction.lifecycle.value) && Boolean(action.browserRequestId) && action.precondition.enabled && !action.precondition.disabled && action.precondition.disabledExplanation === null && action.precondition.accessibleName === action.interaction.matchedLabel && action.transaction.operation === action.interaction.lifecycle.value && action.transaction.stateClass === expectedTransactionState && action.transaction.control.stableControlId === action.stableControlId && action.transaction.control.accessibleName === action.interaction.matchedLabel && action.transaction.control.enabled && !action.transaction.control.disabled && action.transaction.control.disabledExplanation === null && (requiresEditableForm ? formState !== undefined && formState.operation === action.transaction.operation && formState.capturedBeforeSubmission && formState.actionControl.stableControlId === action.transaction.control.stableControlId && formState.actionControl.identityAttribute === "id" && formState.actionControl.accessibleName === action.transaction.control.accessibleName && formState.fields.length > 0 && formState.fields.every((field) => field.identityAttribute === "id" && Boolean(field.stableControlId) && Boolean(field.accessibleName) && !field.disabled && field.validation.valid && typeof field.validation.message === "string") : formState === undefined) && !action.transaction.confirmation.required && action.transaction.confirmation.state === "not-required" && action.transaction.confirmation.control === null && action.transaction.keyboardActivations.length === 1 && action.transaction.keyboardActivations[0].phase === "operation" && action.transaction.keyboardActivations[0].controlId === action.stableControlId && action.transaction.keyboardActivations[0].count === 1 && action.transaction.request.browserRequestId === action.browserRequestId && action.transaction.request.method === action.expectedMethod && action.transaction.request.path === action.expectedApi && action.transaction.request.status >= 200 && action.transaction.request.status < 400 && (/^[a-f0-9]{64}$/i).test(action.transaction.request.responseSha256) && action.transaction.terminal.resultSha256 === action.terminal.resultSha256 && ["response", "rendered-poll"].includes(action.transaction.terminal.source) && action.visibleTerminal.state === "rendered" && action.visibleTerminal.changedAfterRequest && action.visibleTerminal.observedAfterRequestId === action.browserRequestId && (/^[a-f0-9]{64}$/i).test(action.visibleTerminal.beforeTextSha256) && (/^[a-f0-9]{64}$/i).test(action.visibleTerminal.textSha256) && action.visibleTerminal.beforeTextSha256 !== action.visibleTerminal.textSha256 && action.visibleTerminal.resultSha256 === action.terminal.resultSha256 && Boolean(action.visibleTerminal.lifecycle.role) && Boolean(action.visibleTerminal.lifecycle.terminal) && Boolean(action.visibleTerminal.lifecycle.text) && (action.expectedBodyKind === null || action.expectedArtifact === null || (action.visibleTerminal.lifecycle.artifact?.name === action.expectedArtifact && Boolean(action.visibleTerminal.lifecycle.artifact.accessibleName))) && (/^[a-f0-9]{64}$/i).test(action.terminal.resultSha256) && action.accessibility.namedRegions.length > 0 && action.accessibility.visibleFocus && action.accessibility.unexplainedDisabledControls === 0 && Boolean(action.evidenceId) && Boolean(action.screenshotEvidenceId) && action.elapsedMs > 0).toBe(true);
                }
            }
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
            expect(audit.cleanup).toEqual(expect.objectContaining({processTreeDrained: true, resourcesDrained: true, contextRemoved: true}));
            expect(audit.evidence.some((item: {kind: string}) => item.kind === "screenshot")).toBe(true);
            const aggregatePath = path.join(output, "initial-process-isolated-packed-proof.json");
            const aggregate = JSON.parse(await readFile(aggregatePath, "utf8"));
            const requiredObservations: Record<string, string[]> = {
                mathematician: ["blueprint", "par-xlsx-round-trip", "reels-paytable-modes-mechanics", "simulation-success-failure-cancellation", "simulation-rtp-volatility-features", "outcome-library-report-diff-replay", "replay-artifact-success-failure-recovery", "certification-conditional", "fairness-conditional", "build-export-output-folder", "import-export-defaults"],
                programmer: ["packed-install", "npx-pokie", "recursive-help", "create-build-inspect", "validate-sim-report-diff-replay-serve-wasm", "spaces-invalid-inputs-exit-codes-ci-recovery", "build-export-output-folder"],
                producer: ["product-framing", "end-to-end-navigation", "trust"],
                "ui-ux": ["onboarding-terminology-forms-progress", "reload-reconnect-recovery-cancellation-project-switch", "keyboard-responsive-accessibility"],
                "graphic-designer": ["hierarchy-typography-spacing-density-controls-finish"],
            };
            const expectedTuples = personas.flatMap((persona) => requiredObservations[persona].flatMap((observation) => ["wide", "compact", "narrow"].map((viewport) => `${persona}/${observation}/${viewport}`)));
            expect(aggregate).toEqual(expect.objectContaining({schemaVersion: 1, kind: "p8-05-process-isolated-packed-proof", candidateId: candidate, candidatePackageSha256: packageSha256, status: "passed", parent: expect.objectContaining({pid: expect.any(Number), processIdentity: expect.any(String), nonce: expect.any(String)}), finalResult: expect.objectContaining({status: "passed", children: expectedTuples.length, checkpointReceipts: expectedTuples.length, aggregation: "independently-verified-immutable-tuple-child-receipts-only"})}));
            expect(aggregate.children).toHaveLength(expectedTuples.length);
            expect(aggregate.acceptedReceipts).toHaveLength(expectedTuples.length);
            expect(aggregate.children.map((child) => `${child.tuple.persona}/${child.tuple.observation}/${child.tuple.viewport}`)).toEqual(expectedTuples);
            expect(new Set(aggregate.children.map((child) => child.auditSha256)).size).toBe(expectedTuples.length);
            expect(new Set(aggregate.children.map((child) => child.worker.nonce)).size).toBe(expectedTuples.length);
            expect(new Set(aggregate.children.flatMap((child) => child.checkpointReceiptSha256s)).size).toBe(aggregate.children.reduce((count, child) => count + child.checkpointReceiptSha256s.length, 0));
            expect(aggregate.children.every((child) => child.exitCode === 0 && child.signal === null && child.worker.pid !== aggregate.parent.pid && child.tupleReceiptPath && child.tupleReceiptSha256 && child.cleanupPath && child.cleanupSha256)).toBe(true);
        } finally {
            await rm(output, {recursive: true, force: true});
            await rm(candidateDirectory, {recursive: true, force: true});
        }
    }, 40_000_000);
});
