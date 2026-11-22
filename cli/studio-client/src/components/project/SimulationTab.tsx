import {Alert, Anchor, Button, Collapse, Group, List, NumberInput, Progress, Select, SimpleGrid, Stepper, Table, Text, TextInput} from "@mantine/core";
import {useForm} from "@mantine/form";
import {useDisclosure} from "@mantine/hooks";
import {useEffect, useLayoutEffect, useRef, useState} from "react";
import type {StudioSimulationReportListEntry} from "../../api/types";
import {describeDesignCompatibility, describeReportListEntry, shortSourceRevision, type ReportListView} from "../../domain/interpret/Reports";
import type {SimulationProgressView, SimulationReportView} from "../../domain/interpret/Simulation";
import {describeProjectActionError} from "../../domain/projectActionError";
import {getSimulationRoundsError, MAX_STUDIO_SIMULATION_ROUNDS} from "../../domain/simulationRounds";
import {generateSimulationSeed} from "../../domain/simulationSeed";
import {useConfirm} from "../../hooks/useConfirm";
import type {SimulationTerminalReceipt} from "../../hooks/useSimulationPoll";
import {AdvancedDisclosure} from "../common/AdvancedDisclosure";
import {BoundedListPager} from "../common/BoundedListPager";
import {EmptyState} from "../common/EmptyState";
import {ErrorState} from "../common/ErrorState";
import {LoadingState} from "../common/LoadingState";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";
import {SimulationReportDisplay} from "../common/SimulationReportDisplay";
import {formatElapsedMs, SimulationSummaryCard, type SimulationOutcome} from "../common/SimulationSummaryCard";
import {WarningState} from "../common/WarningState";

export type ReportDetailState =
    | {status: "empty"}
    | {status: "loading"}
    | {status: "error"; message: string}
    | {status: "loaded"; report: SimulationReportView; sourceRevision?: string};

// Matches SimulationReportBuilder.LOW_ROUNDS_WARNING_THRESHOLD (src/reporting/SimulationReportBuilder.ts)
// so the out-of-the-box default never itself trips the "requested rounds is low" warning/recommendation.
const DEFAULT_ROUNDS = 10000;
const RECENT_RUNS_PAGE_SIZE = 50;

function defaultWorkers(): number {
    const cores = typeof navigator === "undefined" ? 2 : navigator.hardwareConcurrency;
    return Number.isFinite(cores) ? Math.max(1, Math.min(4, Math.floor(cores) - 1 || 1)) : 1;
}

type FormValues = {rounds: number; seed: string; workers: number; modeName: string};

function signed(value: number, digits: number, suffix: string): string {
    return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}${suffix}`;
}

/**
 * A compact side-by-side delta table above the two full reports. Comparing two full report bodies
 * makes the reader do the subtraction; a design change makes that subtraction meaningless, so the
 * caller renders the compatibility warning separately and this table only reports the numbers it can
 * honestly pair.
 */
function SimulationComparisonSummary({current, comparison}: {current: SimulationReportView; comparison: SimulationReportView}) {
    if ("modes" in current || "modes" in comparison) {
        return <Text size="sm" c="dimmed">Mode-set reports are compared per mode below.</Text>;
    }
    const rows = [
        {label: "RTP", current: current.rtp * 100, comparison: comparison.rtp * 100, digits: 2, suffix: "%", unit: "pp", deltaDigits: 2},
        {label: "Hit frequency", current: current.hitFrequency * 100, comparison: comparison.hitFrequency * 100, digits: 2, suffix: "%", unit: "pp", deltaDigits: 2},
        ...(current.volatility === undefined || comparison.volatility === undefined ? [] : [
            {label: "Volatility (std. deviation)", current: current.volatility, comparison: comparison.volatility, digits: 2, suffix: "", unit: "", deltaDigits: 2},
        ]),
        {label: "Max win (× bet)", current: current.maxWin, comparison: comparison.maxWin, digits: 2, suffix: "×", unit: "×", deltaDigits: 2},
        {label: "Rounds", current: current.rounds, comparison: comparison.rounds, digits: 0, suffix: "", unit: " rounds", deltaDigits: 0},
    ];
    return (
        <Table withRowBorders={false} mt="sm" aria-label="Simulation comparison metrics">
            <Table.Thead>
                <Table.Tr>
                    <Table.Th>Metric</Table.Th>
                    <Table.Th>This run</Table.Th>
                    <Table.Th>Comparison</Table.Th>
                    <Table.Th>Δ</Table.Th>
                </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
                {rows.map((row) => (
                    <Table.Tr key={row.label}>
                        <Table.Th scope="row">{row.label}</Table.Th>
                        <Table.Td>{row.current.toLocaleString("en-US", {minimumFractionDigits: row.digits, maximumFractionDigits: row.digits})}{row.suffix}</Table.Td>
                        <Table.Td>{row.comparison.toLocaleString("en-US", {minimumFractionDigits: row.digits, maximumFractionDigits: row.digits})}{row.suffix}</Table.Td>
                        <Table.Td>{signed(row.current - row.comparison, row.deltaDigits, row.unit)}</Table.Td>
                    </Table.Tr>
                ))}
            </Table.Tbody>
        </Table>
    );
}

// The single Configure -> Run -> Review -> Export workflow, replacing the old separate Simulation and
// Reports tabs. All data-fetching is still owned by ProjectDashboardPage (useSimulationPoll, the
// recent-runs list, the report-detail-by-id fetch) -- this component only owns which step is showing
// and small transient UI toggles (advanced settings, full-report/compare disclosures).
export function SimulationTab({
    progress,
    error,
    connectionError,
    restorationMessage,
    cancellationRequested,
    operation,
    terminalReceipt,
    historicalResult = false,
    onRun,
    onCancel,
    onRetry,
    recentRuns,
    recentRunsError,
    onRefreshRecentRuns,
    reviewedDetail,
    currentReportId,
    onOpenHistoric,
    onRunAgain,
    runAgainNotice,
    compareDetail,
    onCompare,
    onClearCompare,
    downloadUrls,
    availableModes,
    packageModes = false,
    modeDiscoveryError,
    recoveryRequest,
}: {
    progress: SimulationProgressView | undefined;
    error: string | undefined;
    connectionError?: string;
    /** Discovery and first-detail restoration must settle before explicit Run. */
    restorationMessage?: string;
    /** A cancel request accepted locally before the next durable poll catches up. */
    cancellationRequested: boolean;
    /** The rendered public control that started the current durable job. */
    operation: "simulation" | "simulation-retry";
    /** A terminal durable job receipt, retained across the control's React replacement. */
    terminalReceipt: SimulationTerminalReceipt | undefined;
    /** A retained report cannot establish freshness for the current saved source. */
    historicalResult?: boolean;
    onRun: (rounds: number, seed: string | undefined, workers: number, modeName?: string, convergence?: StudioSimulationReportListEntry["convergence"]) => void;
    onCancel: () => void;
    onRetry: () => void;
    recentRuns: ReportListView;
    recentRunsError: string | undefined;
    onRefreshRecentRuns: () => void;
    reviewedDetail: ReportDetailState;
    currentReportId: string | undefined;
    onOpenHistoric: (entry: StudioSimulationReportListEntry) => void;
    onRunAgain: (entry: StudioSimulationReportListEntry) => void;
    runAgainNotice: string | undefined;
    compareDetail: ReportDetailState;
    onCompare: (entry: StudioSimulationReportListEntry) => void;
    onClearCompare: () => void;
    downloadUrls: {json: string; markdown: string; html: string} | undefined;
    // Authored executable package modes or native library modes, discovered by the dashboard.
    availableModes?: string[];
    packageModes?: boolean;
    modeDiscoveryError?: string;
    /** Captured terminal-job or report settings, restored for an explicit Run. */
    recoveryRequest?: Readonly<Record<string, unknown>>;
}) {
    const confirm = useConfirm();
    const [capturedConvergence, setCapturedConvergence] = useState<StudioSimulationReportListEntry["convergence"]>();
    // A fresh tab starts with a real seed instead of an empty field: the ordinary default run is
    // then reproducible, and the seed is visible without opening the advanced section.
    const [initialSeed] = useState(() => generateSimulationSeed());
    const form = useForm<FormValues>({
        mode: "uncontrolled",
        initialValues: {rounds: DEFAULT_ROUNDS, seed: initialSeed, workers: defaultWorkers(), modeName: ""},
        validate: {rounds: getSimulationRoundsError},
        validateInputOnChange: ["rounds"],
        validateInputOnBlur: ["rounds"],
    });
    const formRef = useRef(form);
    useEffect(() => {
        formRef.current = form;
    }, [form]);

    // Defaults the picker to the first real mode the moment the list becomes available -- SimulationTab
    // can mount before the project header's own outcome-source report necessarily has (see PlayTab's own
    // identical effect for why).
    useEffect(() => {
        if (formRef.current.getValues().modeName === "" && availableModes !== undefined && availableModes.length > 0) {
            formRef.current.setFieldValue("modeName", availableModes[0]);
        }
    }, [availableModes]);
    const [fullReportOpened, {toggle: toggleFullReport, close: closeFullReport, open: openFullReport}] = useDisclosure(false);
    const [compareOpened, setCompareOpened] = useState(false);
    const comparisonVisible = compareOpened && compareDetail.status === "loaded";
    const [recentRunsPage, setRecentRunsPage] = useState(0);
    const recentRunEntries = recentRuns.status === "loaded" ? recentRuns.entries : [];
    const visibleRecentRunEntries = recentRunEntries.slice(recentRunsPage * RECENT_RUNS_PAGE_SIZE, (recentRunsPage + 1) * RECENT_RUNS_PAGE_SIZE);

    useEffect(() => setRecentRunsPage(0), [recentRuns]);

    // ProjectDashboardPage only ever mounts the tab whose data it's currently showing (see its own doc
    // comment -- data hooks stay at page level, but each tab *component*, including this one's own
    // activeStep, unmounts on every tab switch) -- so navigating away and back (e.g. via Overview's
    // "View report" next-action) remounts this component from scratch. The initial step must therefore
    // be computed from whatever progress/reviewedDetail already are at mount time, not hardcoded to
    // Configure, or a remount after a run has already finished would silently drop the user back at
    // the beginning instead of where the already-resolved data says they should be.
    const [activeStep, setActiveStep] = useState<number>(() => {
        if (reviewedDetail.status !== "empty") {
            return 2;
        }
        if (progress !== undefined && progress.status !== "recovery-required") {
            return progress.status === "queued" || progress.status === "running" || progress.status === "cancelling" ? 1 : 2;
        }
        return 0;
    });

    useEffect(() => {
        if (recoveryRequest === undefined) return;
        const rounds = typeof recoveryRequest.rounds === "number" ? recoveryRequest.rounds : undefined;
        const seed = typeof recoveryRequest.seed === "string" ? recoveryRequest.seed : undefined;
        const workers = typeof recoveryRequest.workers === "number" ? recoveryRequest.workers : undefined;
        const modeName = typeof recoveryRequest.modeName === "string" ? recoveryRequest.modeName : undefined;
        formRef.current.setValues({
            rounds: rounds ?? DEFAULT_ROUNDS,
            seed: seed ?? "",
            workers: workers ?? defaultWorkers(),
            modeName: modeName ?? "",
        });
        setCapturedConvergence(recoveryRequest.convergence as StudioSimulationReportListEntry["convergence"]);
        formRef.current.validateField("rounds");
        // A retained-job action can arrive while this tab is still on Review.
        // Reconstructing hidden fields leaves that visible Retry without an
        // outcome. Show its explicit submission step instead of replaying work.
        setActiveStep(0);
    }, [recoveryRequest]);


    const active = progress !== undefined && (progress.status === "queued" || progress.status === "running" || progress.status === "cancelling");
    const cancellationPending = cancellationRequested || progress?.status === "cancelling";
    const isTerminal = progress !== undefined && !active;
    const canRetry = progress !== undefined && (progress.status === "failed" || progress.status === "cancelled");
    const receiptOperation = terminalReceipt?.operation ?? operation;
    const resultControlId = receiptOperation === "simulation-retry" ? "simulation-retry" : "simulation-run";
    const resultState = receiptOperation === "simulation-retry" ? "recovery-operation" : "editable-submission";
    const resultJobId = terminalReceipt?.jobId ?? progress?.jobId;
    const resultStatus = terminalReceipt?.status ?? progress?.status;

    // Auto-advances to Run the moment an explicit submission starts (progress.status transitions
    // to "queued"), and to Review the moment a run
    // that was actually active goes terminal -- requirement 5's "auto-open summary". Keyed only on
    // the status *value*, not the progress object identity, so re-renders while already terminal
    // (e.g. the user manually flips back to Configure to look at defaults) never yank them back.
    const prevStatusRef = useRef<string | undefined>(undefined);
    const recoveryRequestRef = useRef(recoveryRequest);
    useEffect(() => {
        recoveryRequestRef.current = recoveryRequest;
    }, [recoveryRequest]);
    const workflowRef = useRef<HTMLDivElement>(null);
    const focusedControlRef = useRef<HTMLElement | undefined>(undefined);
    useLayoutEffect(() => {
        // A Run/Cancel control can be replaced by the next step. Restore a
        // reading position only when that exact focused node disappeared;
        // completion must never take focus from another live task or dialog.
        const previous = focusedControlRef.current;
        if (previous !== undefined && !previous.isConnected && document.activeElement === document.body) {
            workflowRef.current?.focus({preventScroll: true});
        }
    });
    useEffect(() => {
        const status = progress?.status;
        if (status === "queued" || status === "running" || status === "cancelling") {
            setActiveStep(1);
        }
        const wasActive = prevStatusRef.current === "queued" || prevStatusRef.current === "running" || prevStatusRef.current === "cancelling";
        // A rejected submission has no durable progress. Keep the attempted
        // configuration visible and editable beside its actionable error.
        if (status === undefined && wasActive) setActiveStep(0);
        const nowTerminal = status === "completed" || status === "failed" || status === "cancelled" || status === "recovery-required";
        // On a tab remount an explicit card handoff takes precedence over
        // the previously completed job; a new execution's terminal still wins.
        if (nowTerminal && (wasActive || (prevStatusRef.current === undefined && status === "completed" && recoveryRequestRef.current === undefined))) {
            setActiveStep(2);
            closeFullReport();
            setCompareOpened(false);
        }
        prevStatusRef.current = status;
    }, [closeFullReport, progress?.status]);

    // Closes the full-report/compare disclosures when the *reviewed report itself* changes -- e.g.
    // clicking "Open" on a different Recent Runs entry while already on Review, which isn't a
    // progress-status transition so the effect above never fires for it. The comparison *data* is
    // already cleared page-side (ProjectDashboardPage's selectReport resets compareDetail whenever a
    // different report is opened) -- this only resets these two local UI toggles so the user doesn't
    // land on the new report with a stale panel still expanded.
    const prevReportIdRef = useRef(currentReportId);
    useEffect(() => {
        if (currentReportId !== prevReportIdRef.current) {
            prevReportIdRef.current = currentReportId;
            closeFullReport();
            setCompareOpened(false);
        }
    }, [currentReportId, closeFullReport]);

    const reviewReachable = reviewedDetail.status !== "empty" || isTerminal;
    const exportReachable = downloadUrls !== undefined;
    const latestTimedRun = recentRuns.status === "loaded"
        ? recentRuns.entries.find((entry) => entry.durationMs > 0 && (entry.actualRounds ?? entry.requestedRounds) > 0)
        : undefined;
    const currentRounds = form.getValues().rounds;
    const estimatedCurrentRunMs = latestTimedRun !== undefined && Number.isFinite(currentRounds) && currentRounds > 0
        ? (latestTimedRun.durationMs / (latestTimedRun.actualRounds ?? latestTimedRun.requestedRounds)) * currentRounds
        : undefined;
    const estimatedCurrentRun = estimatedCurrentRunMs === undefined ? undefined : formatElapsedMs(estimatedCurrentRunMs);
    const longEstimatedRun = estimatedCurrentRunMs !== undefined && estimatedCurrentRunMs > 30 * 60 * 1000;
    const lastRunHint = latestTimedRun === undefined
        ? ""
        : ` Last local run: ${(latestTimedRun.actualRounds ?? latestTimedRun.requestedRounds).toLocaleString("en-US")} rounds in ${formatElapsedMs(latestTimedRun.durationMs)} (${Math.round((latestTimedRun.actualRounds ?? latestTimedRun.requestedRounds) / (latestTimedRun.durationMs / 1000)).toLocaleString("en-US")} rounds/s).${estimatedCurrentRun === undefined ? "" : ` At that rate, ${currentRounds.toLocaleString("en-US")} rounds ≈ ${estimatedCurrentRun}.`}`;
    // A report can never be meaningfully compared against itself (requirement 7).
    const comparableEntries = recentRuns.status === "loaded" ? recentRuns.entries.filter((entry) => entry.id !== currentReportId) : [];

    const outcome: SimulationOutcome | undefined = (() => {
        if (reviewedDetail.status === "loaded") {
            return {kind: "completed", report: reviewedDetail.report};
        }
        if (reviewedDetail.status === "empty" && progress?.status === "failed") {
            return {kind: "failed", durationMs: progress.durationMs, error: progress.error};
        }
        if (reviewedDetail.status === "empty" && progress?.status === "cancelled") {
            return {kind: "cancelled", durationMs: progress.durationMs, roundsCompleted: progress.roundsCompleted, rounds: progress.rounds};
        }
        return undefined;
    })();

    // Changing settings after inspecting a report should show that report's own seed/rounds, not a
    // fresh tab-local seed that makes the next run look like an unrelated sample.
    const showSettingsForReviewedReport = (): void => {
        if (reviewedDetail.status === "loaded" && !("modes" in reviewedDetail.report)) {
            const report = reviewedDetail.report;
            formRef.current.setValues({
                rounds: report.requestedRounds > 0 ? report.requestedRounds : report.rounds,
                seed: report.seed ?? "",
                workers: report.workers,
                modeName: report.betMode ?? "",
            });
            formRef.current.validateField("rounds");
        }
        setActiveStep(0);
    };

    return (
        <div ref={workflowRef} tabIndex={-1} role="region" aria-label="Simulation workflow" onFocusCapture={(event) => {
            focusedControlRef.current = event.target;
        }} onBlurCapture={(event) => {
            if (event.relatedTarget instanceof HTMLElement && !event.currentTarget.contains(event.relatedTarget) && event.relatedTarget.closest('[role="dialog"]') === null) {
                focusedControlRef.current = undefined;
            }
        }}>
            {restorationMessage !== undefined && <Text role="status" aria-live="polite">{restorationMessage}</Text>}
            {connectionError !== undefined && <ErrorState message={connectionError} />}
            {error !== undefined && <ErrorState message={describeProjectActionError("This simulation request", error)} />}
            {historicalResult && <WarningState message="Historical simulation result — this report is not validated against the current saved design. Run a new simulation before using results for the current design. Downloads retain the original run's data." />}
            {!exportReachable && (
                <Text id="simulation-export-unavailable" size="xs" c="dimmed" mb={4}>
                    Export becomes available after a completed simulation report is ready.
                </Text>
            )}
            <Stepper className="studio-simulation-stepper" active={activeStep} onStepClick={setActiveStep} mb="md" size="sm">
                <Stepper.Step
                    id="simulation-configure"
                    data-pokie-lifecycle-step="simulation-configure"
                    label="Configure"
                    description="Set rounds"
                    aria-current={activeStep === 0 ? "step" : undefined}
                />
                <Stepper.Step
                    label="Run"
                    description="Watch progress"
                    disabled={progress === undefined}
                    aria-current={activeStep === 1 ? "step" : undefined}
                />
                <Stepper.Step
                    label="Review"
                    description="See results"
                    disabled={!reviewReachable}
                    aria-current={activeStep === 2 ? "step" : undefined}
                />
                <Stepper.Step
                    label="Export"
                    description="Download report"
                    disabled={!exportReachable}
                    aria-describedby={exportReachable ? undefined : "simulation-export-unavailable"}
                    title={exportReachable ? undefined : "Export becomes available after a completed simulation report is ready."}
                    aria-current={activeStep === 3 ? "step" : undefined}
                />
            </Stepper>

            {activeStep === 0 && (
                <form
                    data-pokie-lifecycle-form="simulation"
                    onSubmit={form.onSubmit((values) => {
                        if (restorationMessage === undefined) onRun(values.rounds, values.seed.trim() || undefined, values.workers, values.modeName || undefined, capturedConvergence);
                    })}
                >
                    {recoveryRequest !== undefined && (
                        <Text role="status" aria-live="polite" size="sm" mb="sm">
                            Captured simulation settings restored. Review them and choose Run Simulation to retry.
                        </Text>
                    )}
                    <Text size="sm" c="dimmed" mb="sm">
                        Simulation plays many rounds of this game to estimate RTP, win frequency, and the largest win.
                        When it finishes, review the summary here or export the full report.
                    </Text>
                    <QuickActions>
                        <NumberInput
                            label="Rounds"
                            description={`1–${MAX_STUDIO_SIMULATION_ROUNDS.toLocaleString("en-US")} rounds per simulation. Whole numbers only.${lastRunHint}`}
                            min={1}
                            max={MAX_STUDIO_SIMULATION_ROUNDS}
                            clampBehavior="none"
                            step={1}
                            allowDecimal={false}
                            thousandSeparator=","
                            required
                            data-pokie-lifecycle-field="simulation-rounds"
                            {...form.getInputProps("rounds")}
                            key={form.key("rounds")}
                            style={{width: 230}}
                        />
                        <TextInput
                            label="Seed"
                            description="Same seed and game reproduce the same run. The report keeps this seed."
                            placeholder="Leave empty for an unseeded run"
                            data-pokie-lifecycle-field="simulation-seed"
                            {...form.getInputProps("seed")}
                            key={form.key("seed")}
                            rightSection={(
                                <Button
                                    type="button"
                                    size="compact-xs"
                                    variant="subtle"
                                    aria-label="Generate a new seed"
                                    onClick={() => form.setFieldValue("seed", generateSimulationSeed())}
                                >
                                    New seed
                                </Button>
                            )}
                            rightSectionWidth={78}
                            style={{flex: "1 1 300px", minWidth: 260}}
                        />
                        <Button id="simulation-run" type="submit" data-pokie-lifecycle="operation" data-pokie-transaction-state="editable-submission" data-pokie-lifecycle-operation="simulation" loading={progress?.status === "queued"} disabled={restorationMessage !== undefined || active || !form.isValid()}>
                            Run Simulation
                        </Button>
                    </QuickActions>
                    {longEstimatedRun && (
                        <Text size="xs" c="orange" mb="sm">
                            This run is estimated at about {estimatedCurrentRun}. It can be cancelled while it runs; Studio keeps the progress and terminal state.
                        </Text>
                    )}
                    {modeDiscoveryError && <ErrorState message={`Cannot discover bet modes: ${modeDiscoveryError}`} />}
                    {availableModes !== undefined && availableModes.length > 0 && (
                        <Select
                            label={packageModes ? "Bet mode" : "Outcome library mode"}
                            description={packageModes ? "Select a mode for every available entry, or run each mode independently." : "Which real mode of this outcome library this run samples."}
                            data={packageModes ? [...availableModes.map(value => ({value, label: value})), {value: "all", label: "All modes"}] : availableModes}
                            allowDeselect={false}
                            mb="sm"
                            style={{maxWidth: 320}}
                            {...form.getInputProps("modeName")}
                            key={form.key("modeName")}
                        />
                    )}
                    {capturedConvergence && <Text size="sm">Captured adaptive stopping: minimum {capturedConvergence?.minRounds} usable samples per worker; tolerance {capturedConvergence?.rtpTolerance} RTP units; check every {capturedConvergence?.checkIntervalRounds} accepted plays; stable checks {capturedConvergence?.stableChecks ?? 3}. These settings will be saved for retry. <Button variant="subtle" size="xs" onClick={() => setCapturedConvergence(undefined)}>Use fixed limit</Button></Text>}
                    <AdvancedDisclosure detail="workers">
                        <QuickActions>
                            <NumberInput label="Workers" description="Defaults to up to 4, based on this browser's CPU count." min={1} step={1} required {...form.getInputProps("workers")} key={form.key("workers")} />
                        </QuickActions>
                    </AdvancedDisclosure>
                </form>
            )}

            {activeStep === 1 && (
                <div>
                    {progress === undefined && <EmptyState message="No simulation has been run yet." />}
                    {progress !== undefined && (
                        <div>
                            <Text role="status">Phase: {progress.phase ?? progress.status}{progress.percent === 100 && active ? " — accepted-play limit reached; awaiting cleanup and report publication." : ""}</Text>
                            <Progress value={progress.percent} mb="sm" />
                            <QuickActions>
                                {active && !cancellationPending && (
                                    <Button id="simulation-cancel" data-pokie-lifecycle="recovery" data-pokie-transaction-state="recovery-operation" data-pokie-lifecycle-operation="simulation-cancel" color="red" variant="light" onClick={() => confirm("Cancel the running simulation?", onCancel, undefined, {confirm: "simulation-cancel-confirm", cancel: "simulation-cancel-dismiss", operation: "simulation-cancel"})}>
                                        Cancel
                                    </Button>
                                )}
                                {cancellationPending && <Text role="status" aria-live="polite" data-pokie-lifecycle-result="simulation" size="sm">Cancellation requested; waiting for safe cleanup.</Text>}
                                {canRetry && (
                                    <Button id="simulation-retry" data-pokie-lifecycle="recovery" data-pokie-transaction-state="recovery-operation" data-pokie-lifecycle-operation="simulation-retry" variant="default" onClick={onRetry}>
                                        Retry
                                    </Button>
                                )}
                                {isTerminal && (
                                    <Button variant="default" onClick={() => setActiveStep(2)}>
                                        View results
                                    </Button>
                                )}
                            </QuickActions>
                        </div>
                    )}
                </div>
            )}

            {activeStep === 2 && (
                <div>
                    {reviewedDetail.status === "loading" && <LoadingState label="Loading report…" />}
                    {reviewedDetail.status === "error" && (
                        <ErrorState message={describeProjectActionError("This report", reviewedDetail.message)} />
                    )}
                    {outcome === undefined && reviewedDetail.status === "empty" && progress === undefined && (
                        <EmptyState message="Run a simulation to see results here." />
                    )}
                    {outcome !== undefined && (
                        <div>
                            {(outcome.kind !== "completed" || (!fullReportOpened && !comparisonVisible)) && <SimulationSummaryCard outcome={outcome} />}
                            <QuickActions>
                                {outcome.kind === "completed" && (
                                    <Button data-pokie-lifecycle-artifact="simulation-report" variant="default" onClick={() => {
                                        if (comparisonVisible) openFullReport();
                                        else toggleFullReport();
                                        setCompareOpened(false);
                                    }}>
                                        {fullReportOpened && !comparisonVisible ? "Hide full report" : "Open full report"}
                                    </Button>
                                )}
                                {outcome.kind === "completed" && (
                                    <Button variant="default" onClick={() => setCompareOpened((opened) => !opened)}>
                                        Compare with another run
                                    </Button>
                                )}
                                {outcome.kind !== "completed" && (
                                    <Button variant="default" onClick={() => setActiveStep(0)}>
                                        Back to configuration
                                    </Button>
                                )}
                                <Button variant="default" onClick={showSettingsForReviewedReport}>
                                    Change settings
                                </Button>
                                <Button
                                    id="simulation-retry"
                                    data-pokie-lifecycle="recovery"
                                    data-pokie-transaction-state="recovery-operation"
                                    data-pokie-lifecycle-operation="simulation-retry"
                                    variant="default"
                                    onClick={() => {
                                        confirm("Run this simulation again with the same settings? The current report stays in Recent runs.", onRetry, undefined, {
                                            confirm: "simulation-repeat-confirm",
                                            cancel: "simulation-repeat-dismiss",
                                            operation: "simulation-retry",
                                        });
                                    }}
                                >
                                    Run again with same settings
                                </Button>
                            </QuickActions>

                            {outcome.kind === "completed" && (
                                <Collapse expanded={fullReportOpened && !comparisonVisible}>
                                    <SimulationReportDisplay view={outcome.report} />
                                </Collapse>
                            )}

                            {compareOpened && outcome.kind === "completed" && (
                                <PageSection legend="Compare with another run">
                                    <Text size="sm" c="dimmed">Comparison reports retain the design used for each original run. A design revision identifies the saved authored source, not merely the game id/version.</Text>
                                    {comparableEntries.length === 0 && <EmptyState message="No other completed runs yet to compare against." />}
                                    {comparableEntries.length > 0 && (
                                        <List listStyleType="none" spacing={4} mb="sm">
                                            {comparableEntries.map((entry) => (
                                                <List.Item key={entry.id}>
                                                    <Anchor
                                                        component="button"
                                                        type="button"
                                                        onClick={() => onCompare(entry)}
                                                        style={{overflowWrap: "anywhere", whiteSpace: "normal", textAlign: "left"}}
                                                    >
                                                        {describeReportListEntry(entry)}
                                                    </Anchor>
                                                </List.Item>
                                            ))}
                                        </List>
                                    )}
                                    {compareDetail.status === "loading" && <LoadingState label="Loading comparison…" />}
                                    {compareDetail.status === "error" && (
                                        <ErrorState message={describeProjectActionError("The comparison report", compareDetail.message)} />
                                    )}
                                    {compareDetail.status === "loaded" && (() => {
                                        const currentRevision = reviewedDetail.status === "loaded" ? reviewedDetail.sourceRevision : undefined;
                                        const comparisonRevision = compareDetail.sourceRevision;
                                        const compatibility = describeDesignCompatibility(currentRevision, comparisonRevision);
                                        const currentDesign = shortSourceRevision(currentRevision);
                                        const comparisonDesign = shortSourceRevision(comparisonRevision);
                                        let compatibilityMessage: string;
                                        if (compatibility === "same") {
                                            compatibilityMessage = `Both runs sampled the same saved design${currentDesign === undefined ? "" : ` (${currentDesign})`}.`;
                                        } else if (compatibility === "different") {
                                            compatibilityMessage = `These runs sampled different saved designs (${currentDesign ?? "unknown"} vs ${comparisonDesign ?? "unknown"}). RTP and other metric deltas describe different games and must not be read as a like-for-like change.`;
                                        } else {
                                            compatibilityMessage = "One or both reports predate design-revision tracking. Confirm that both runs used the same saved design before comparing their math.";
                                        }
                                        return (
                                            <>
                                                <Alert color={compatibility === "same" ? "blue" : "yellow"} mt="sm" mb="sm">
                                                    {compatibilityMessage}
                                                </Alert>
                                                <SimulationComparisonSummary current={outcome.report} comparison={compareDetail.report} />
                                                <SimpleGrid cols={{base: 1, md: 2}} mt="md">
                                                    <div>
                                                        <Text fw={600} size="sm" mb="xs">
                                                            This run{currentDesign === undefined ? "" : ` · design ${currentDesign}`}
                                                        </Text>
                                                        <SimulationReportDisplay view={outcome.report} />
                                                    </div>
                                                    <div>
                                                        <Text fw={600} size="sm" mb="xs">
                                                            Comparison{comparisonDesign === undefined ? "" : ` · design ${comparisonDesign}`}
                                                        </Text>
                                                        <SimulationReportDisplay view={compareDetail.report} />
                                                    </div>
                                                </SimpleGrid>
                                            </>
                                        );
                                    })()}
                                    {compareDetail.status !== "empty" && (
                                        <Button variant="subtle" size="xs" mt="sm" onClick={onClearCompare}>
                                            Clear comparison
                                        </Button>
                                    )}
                                </PageSection>
                            )}
                        </div>
                    )}
                </div>
            )}

            {activeStep === 3 && (
                <div>
                    {downloadUrls === undefined && <EmptyState message="Complete a simulation to export its report." />}
                    {downloadUrls && (
                        <QuickActions>
                            <Anchor href={downloadUrls.json} download>
                                Download JSON
                            </Anchor>
                            <Anchor href={downloadUrls.markdown} download>
                                Download Markdown
                            </Anchor>
                            <Anchor href={downloadUrls.html} download>
                                Download HTML
                            </Anchor>
                        </QuickActions>
                    )}
                </div>
            )}

            {/*
             * This status stays outside the Run step and below its controls.  A completed
             * simulation advances straight to Review, but its operation
             * receipt must remain rendered there so assistive technology (and
             * users returning to the result) can still tell which request
             * reached which terminal state.  The stable lifecycle attributes
             * are product UI, not audit-only data: they bind the visible
             * progress/result to the Run Simulation control's operation.
             * Polling counters may wrap on phones; keeping them below the
             * workflow prevents them from moving Cancel beneath a pointer.
             */}
            {(progress !== undefined || terminalReceipt !== undefined) && (
                <div
                    tabIndex={-1}
                    data-pokie-lifecycle-result="simulation"
                    data-pokie-lifecycle-result-control={resultControlId}
                    data-pokie-lifecycle-result-operation={receiptOperation}
                    data-pokie-lifecycle-result-state={resultState}
                    data-pokie-lifecycle-result-job={resultJobId}
                    data-pokie-lifecycle-terminal={resultStatus}
                    data-pokie-lifecycle-result-receipt={terminalReceipt === undefined ? "progress" : "durable-terminal"}
                    data-pokie-lifecycle-result-durable-job={terminalReceipt?.jobId}
                    data-pokie-lifecycle-result-captured-job={terminalReceipt?.capturedJobId}
                    data-pokie-lifecycle-result-durable-status={terminalReceipt?.status}
                    data-pokie-lifecycle-result-request-id={terminalReceipt?.requestId}
                    data-pokie-lifecycle-result-recovery={terminalReceipt?.recoveredAfterRestart === true ? "restart-reconciled" : undefined}
                    data-pokie-lifecycle-result-executor={terminalReceipt?.recoveredAfterRestart === true ? "unavailable-after-restart" : undefined}
                >
                    <Text role="status" aria-live="polite" tabIndex={-1} size="sm" mb={4}>
                        {receiptOperation === "simulation-retry" ? "Simulation retry" : "Simulation"} {cancellationPending ? "cancelling" : resultStatus}
                        {progress !== undefined && <> — {progress.roundsCompleted}/{progress.rounds} rounds — elapsed {formatElapsedMs(progress.durationMs)}</>}
                        {terminalReceipt?.recoveredAfterRestart === true && <> — the prior executor is unavailable after restart; submit the captured settings to run a replacement simulation.</>}
                    </Text>
                    {resultStatus === "completed" && (!historicalResult || reviewedDetail.status === "loaded") && (
                        <Button data-pokie-lifecycle-artifact="simulation-report" variant="subtle" size="xs" onClick={() => setActiveStep(2)}>
                            Open completed simulation report
                        </Button>
                    )}
                </div>
            )}

            <PageSection legend="Recent runs">
                <QuickActions>
                    <Button id="simulation-refresh-reports" data-pokie-lifecycle="operation" data-pokie-transaction-state="read-only-operation" data-pokie-lifecycle-operation="simulation-reports" variant="default" size="xs" onClick={onRefreshRecentRuns}>
                        Refresh
                    </Button>
                </QuickActions>
                {recentRunsError && <ErrorState message={describeProjectActionError("The recent runs list", recentRunsError)} />}
                {runAgainNotice && <WarningState message={runAgainNotice} />}
                {recentRuns.status === "empty" && <EmptyState message="No completed simulations yet." />}
                {recentRuns.status === "loaded" && (
                    <>
                        <div tabIndex={-1} data-pokie-lifecycle-result="simulation-reports" data-pokie-lifecycle-result-control="simulation-refresh-reports" data-pokie-lifecycle-result-state="read-only-operation" data-pokie-lifecycle-terminal="completed">
                            <Text role="status" aria-live="polite" size="xs" c="dimmed">
                                Loaded {recentRunEntries.length} simulation report{recentRunEntries.length === 1 ? "" : "s"}.
                            </Text>
                            {recentRunEntries.length > 0 && (
                                <Button
                                    data-pokie-lifecycle-artifact="simulation-report"
                                    size="xs"
                                    variant="subtle"
                                    onClick={() => {
                                        onOpenHistoric(recentRunEntries[0]);
                                        setActiveStep(2);
                                    }}
                                >
                                    Open latest report
                                </Button>
                            )}
                        </div>
                        <BoundedListPager
                            itemLabel="runs"
                            itemCount={recentRunEntries.length}
                            page={recentRunsPage}
                            pageSize={RECENT_RUNS_PAGE_SIZE}
                            onPageChange={setRecentRunsPage}
                        />
                        <List listStyleType="none" spacing={4}>
                            {visibleRecentRunEntries.map((entry) => {
                                const isSelected = entry.id === currentReportId;
                                return (
                                    <List.Item key={entry.id}>
                                        <Group gap="xs" wrap="wrap" align="baseline">
                                            <Text size="sm" style={{overflowWrap: "anywhere"}}>
                                                {entry.game.id} v{entry.game.version} — {entry.modeName ? `mode ${entry.modeName}, ` : ""}{entry.actualRounds ?? "per-mode"}/{entry.requestedRounds} rounds, RTP{" "}
                                                {entry.rtp === undefined ? "per-mode" : `${(entry.rtp * 100).toFixed(2)}%`}, seed {entry.seed ?? "none"}, {new Date(entry.startedAt).toLocaleString()}
                                                {shortSourceRevision(entry.sourceRevision) === undefined ? "" : `, design ${shortSourceRevision(entry.sourceRevision)}`}
                                                {entry.hasWarnings ? " (has warnings)" : ""}
                                            </Text>
                                            <Button
                                                size="xs"
                                                variant={isSelected ? "filled" : "default"}
                                                onClick={() => {
                                                    onOpenHistoric(entry);
                                                    setActiveStep(2);
                                                }}
                                            >
                                                Open
                                            </Button>
                                            <Anchor component="button" type="button" onClick={() => onRunAgain(entry)}>
                                                Run again
                                            </Anchor>
                                        </Group>
                                    </List.Item>
                                );
                            })}
                        </List>
                    </>
                )}
            </PageSection>
        </div>
    );
}
