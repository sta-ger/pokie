import {Anchor, Button, Collapse, Group, List, NumberInput, Progress, SimpleGrid, Stepper, Text, TextInput} from "@mantine/core";
import {useForm} from "@mantine/form";
import {useDisclosure} from "@mantine/hooks";
import {useEffect, useRef, useState} from "react";
import type {StudioSimulationReportListEntry} from "../../api/types";
import type {ReportListView} from "../../domain/interpret/Reports";
import type {SimulationProgressView, SimulationReportView} from "../../domain/interpret/Simulation";
import {useConfirm} from "../../hooks/useConfirm";
import {EmptyState} from "../common/EmptyState";
import {ErrorState} from "../common/ErrorState";
import {LoadingState} from "../common/LoadingState";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";
import {SimulationReportDisplay} from "../common/SimulationReportDisplay";
import {formatElapsedMs, SimulationSummaryCard, type SimulationOutcome} from "../common/SimulationSummaryCard";

export type ReportDetailState =
    | {status: "empty"}
    | {status: "loading"}
    | {status: "error"; message: string}
    | {status: "loaded"; report: SimulationReportView};

// Matches SimulationReportBuilder.LOW_ROUNDS_WARNING_THRESHOLD (src/reporting/SimulationReportBuilder.ts)
// so the out-of-the-box default never itself trips the "requested rounds is low" warning/recommendation.
const DEFAULT_ROUNDS = 10000;

type FormValues = {rounds: number; seed: string; workers: number};

// The single Configure -> Run -> Review -> Export workflow, replacing the old separate Simulation and
// Reports tabs. All data-fetching is still owned by ProjectDashboardPage (useSimulationPoll, the
// recent-runs list, the report-detail-by-id fetch) -- this component only owns which step is showing
// and small transient UI toggles (advanced settings, full-report/compare disclosures).
export function SimulationTab({
    progress,
    error,
    onRun,
    onCancel,
    onRetry,
    recentRuns,
    recentRunsError,
    onRefreshRecentRuns,
    reviewedDetail,
    onOpenHistoric,
    onRunAgain,
    compareDetail,
    onCompare,
    onClearCompare,
    downloadUrls,
}: {
    progress: SimulationProgressView | undefined;
    error: string | undefined;
    onRun: (rounds: number, seed: string | undefined, workers: number) => void;
    onCancel: () => void;
    onRetry: () => void;
    recentRuns: ReportListView;
    recentRunsError: string | undefined;
    onRefreshRecentRuns: () => void;
    reviewedDetail: ReportDetailState;
    onOpenHistoric: (entry: StudioSimulationReportListEntry) => void;
    onRunAgain: (entry: StudioSimulationReportListEntry) => void;
    compareDetail: ReportDetailState;
    onCompare: (entry: StudioSimulationReportListEntry) => void;
    onClearCompare: () => void;
    downloadUrls: {json: string; markdown: string; html: string} | undefined;
}) {
    const confirm = useConfirm();
    const form = useForm<FormValues>({mode: "uncontrolled", initialValues: {rounds: DEFAULT_ROUNDS, seed: "", workers: 1}});
    const [advancedOpened, {toggle: toggleAdvanced}] = useDisclosure(false);
    const [fullReportOpened, {toggle: toggleFullReport, close: closeFullReport}] = useDisclosure(false);
    const [compareOpened, setCompareOpened] = useState(false);

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
        if (progress !== undefined) {
            return 1;
        }
        return 0;
    });

    const active = progress !== undefined && (progress.status === "queued" || progress.status === "running");
    const isTerminal = progress !== undefined && !active;
    const canRetry = progress !== undefined && (progress.status === "failed" || progress.status === "cancelled");

    // Auto-advances to Run the moment a fresh run starts (Configure submit or a Recent Runs "Run
    // again", either way progress.status transitions to "queued"), and to Review the moment a run
    // that was actually active goes terminal -- requirement 5's "auto-open summary". Keyed only on
    // the status *value*, not the progress object identity, so re-renders while already terminal
    // (e.g. the user manually flips back to Configure to look at defaults) never yank them back.
    const prevStatusRef = useRef<string | undefined>(undefined);
    useEffect(() => {
        const status = progress?.status;
        if (status === "queued") {
            setActiveStep(1);
        }
        const wasActive = prevStatusRef.current === "queued" || prevStatusRef.current === "running";
        const nowTerminal = status === "completed" || status === "failed" || status === "cancelled";
        if (wasActive && nowTerminal) {
            setActiveStep(2);
            closeFullReport();
            setCompareOpened(false);
        }
        prevStatusRef.current = status;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [progress?.status]);

    const reviewReachable = reviewedDetail.status !== "empty" || isTerminal;
    const exportReachable = downloadUrls !== undefined;

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

    return (
        <div>
            <Stepper active={activeStep} onStepClick={setActiveStep} mb="md" size="sm">
                <Stepper.Step label="Configure" description="Set rounds" />
                <Stepper.Step label="Run" description="Watch progress" disabled={progress === undefined} />
                <Stepper.Step label="Review" description="See results" disabled={!reviewReachable} />
                <Stepper.Step label="Export" description="Download report" disabled={!exportReachable} />
            </Stepper>

            {activeStep === 0 && (
                <form onSubmit={form.onSubmit((values) => onRun(values.rounds, values.seed.trim() || undefined, values.workers))}>
                    <QuickActions>
                        <NumberInput label="Rounds" min={1} step={1} required {...form.getInputProps("rounds")} key={form.key("rounds")} />
                        <Button type="submit" loading={progress?.status === "queued"} disabled={active}>
                            Run Simulation
                        </Button>
                    </QuickActions>
                    <Text size="sm" mb="sm">
                        <Anchor component="button" type="button" onClick={toggleAdvanced}>
                            {advancedOpened ? "Hide" : "Show"} advanced settings (seed, workers)
                        </Anchor>
                    </Text>
                    <Collapse expanded={advancedOpened}>
                        <QuickActions>
                            <TextInput label="Seed (optional)" {...form.getInputProps("seed")} key={form.key("seed")} />
                            <NumberInput label="Workers" min={1} step={1} required {...form.getInputProps("workers")} key={form.key("workers")} />
                        </QuickActions>
                    </Collapse>
                </form>
            )}

            {activeStep === 1 && (
                <div>
                    {progress === undefined && <EmptyState message="No simulation has been run yet." />}
                    {error && <ErrorState message={error} />}
                    {progress !== undefined && (
                        <div>
                            <Text size="sm" mb={4}>
                                {progress.status} — {progress.roundsCompleted}/{progress.rounds} rounds — elapsed {formatElapsedMs(progress.durationMs)}
                            </Text>
                            <Progress value={progress.percent} mb="sm" />
                            <QuickActions>
                                {active && (
                                    <Button color="red" variant="light" onClick={() => confirm("Cancel the running simulation?", onCancel)}>
                                        Cancel
                                    </Button>
                                )}
                                {canRetry && (
                                    <Button variant="default" onClick={onRetry}>
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
                    {reviewedDetail.status === "error" && <ErrorState message={reviewedDetail.message} />}
                    {outcome === undefined && reviewedDetail.status === "empty" && progress === undefined && (
                        <EmptyState message="Run a simulation to see results here." />
                    )}
                    {outcome !== undefined && (
                        <div>
                            <SimulationSummaryCard outcome={outcome} />
                            <QuickActions>
                                {outcome.kind === "completed" && (
                                    <Button variant="default" onClick={toggleFullReport}>
                                        {fullReportOpened ? "Hide full report" : "Open full report"}
                                    </Button>
                                )}
                                {outcome.kind === "completed" && (
                                    <Button variant="default" onClick={() => setCompareOpened((opened) => !opened)}>
                                        Compare with another run
                                    </Button>
                                )}
                                <Button variant="default" onClick={onRetry}>
                                    Repeat simulation
                                </Button>
                            </QuickActions>

                            {outcome.kind === "completed" && (
                                <Collapse expanded={fullReportOpened}>
                                    <SimulationReportDisplay view={outcome.report} />
                                </Collapse>
                            )}

                            {compareOpened && outcome.kind === "completed" && (
                                <PageSection legend="Compare with another run">
                                    {recentRuns.status === "empty" && <EmptyState message="No other completed runs yet to compare against." />}
                                    {recentRuns.status === "loaded" && (
                                        <List listStyleType="none" spacing={4} mb="sm">
                                            {recentRuns.entries.map((entry) => (
                                                <List.Item key={entry.id}>
                                                    <Anchor
                                                        component="button"
                                                        type="button"
                                                        onClick={() => onCompare(entry)}
                                                        style={{overflowWrap: "anywhere", whiteSpace: "normal", textAlign: "left"}}
                                                    >
                                                        {entry.game.id} v{entry.game.version} — {new Date(entry.startedAt).toLocaleString()}
                                                    </Anchor>
                                                </List.Item>
                                            ))}
                                        </List>
                                    )}
                                    {compareDetail.status === "loading" && <LoadingState label="Loading comparison…" />}
                                    {compareDetail.status === "error" && <ErrorState message={compareDetail.message} />}
                                    {compareDetail.status === "loaded" && (
                                        <SimpleGrid cols={{base: 1, md: 2}}>
                                            <div>
                                                <Text fw={600} size="sm" mb="xs">
                                                    This run
                                                </Text>
                                                <SimulationReportDisplay view={outcome.report} />
                                            </div>
                                            <div>
                                                <Text fw={600} size="sm" mb="xs">
                                                    Comparison
                                                </Text>
                                                <SimulationReportDisplay view={compareDetail.report} />
                                            </div>
                                        </SimpleGrid>
                                    )}
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

            <PageSection legend="Recent runs">
                <QuickActions>
                    <Button variant="default" onClick={onRefreshRecentRuns}>
                        Refresh
                    </Button>
                </QuickActions>
                {recentRunsError && <ErrorState message={recentRunsError} />}
                {recentRuns.status === "empty" && <EmptyState message="No completed simulations yet." />}
                {recentRuns.status === "loaded" && (
                    <List listStyleType="none" spacing={4}>
                        {recentRuns.entries.map((entry) => (
                            <List.Item key={entry.id}>
                                <Group gap="xs" wrap="wrap" align="baseline">
                                    <Text size="sm" style={{overflowWrap: "anywhere"}}>
                                        {entry.game.id} v{entry.game.version} — {entry.actualRounds}/{entry.requestedRounds} rounds, RTP{" "}
                                        {(entry.rtp * 100).toFixed(2)}%, {new Date(entry.startedAt).toLocaleString()}
                                        {entry.hasWarnings ? " (has warnings)" : ""}
                                    </Text>
                                    <Anchor
                                        component="button"
                                        type="button"
                                        onClick={() => {
                                            onOpenHistoric(entry);
                                            setActiveStep(2);
                                        }}
                                    >
                                        Open
                                    </Anchor>
                                    <Anchor component="button" type="button" onClick={() => onRunAgain(entry)}>
                                        Run again
                                    </Anchor>
                                </Group>
                            </List.Item>
                        ))}
                    </List>
                )}
            </PageSection>
        </div>
    );
}
