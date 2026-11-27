import {Alert, Badge, Button, Group, Paper, SimpleGrid, Text, Title} from "@mantine/core";
import {useEffect, useRef, useState, type ReactNode} from "react";
import {getGameModel, getReport, listReports} from "../../api/apiClient";
import type {StudioSimulationReportListEntry} from "../../api/types";
import {useStudioApi} from "../../context/StudioApiProvider";
import {errorMessage} from "../../domain/errorMessage";
import type {ExactMathSummary} from "../../domain/exactMathSummary";
import {formatConfidenceInterval} from "../../domain/interpret/formatConfidenceInterval";
import {describeSimulationReport, type SingleSimulationReportView} from "../../domain/interpret/Simulation";
import {formatAnalysisNumber} from "../../../../../src/internal/formatAnalysisNumber";
import type {SimulationReport} from "../../../../../src/reporting/SimulationReport.js";
import type {SimulationReportSet} from "../../../../../src/reporting/SimulationReportSet.js";
import {LoadingState} from "../common/LoadingState";
import {MathTermHelp} from "../common/MathTermHelp";
import {VolatilityBandBadge} from "../common/VolatilityBandsControl";

type ProducerSummaryState =
    | {status: "loading"}
    | {status: "ready"; entry: StudioSimulationReportListEntry; report: SingleSimulationReportView; modeName?: string}
    | {status: "empty"; earlierRuns: number}
    | {status: "error"; message: string};

function reportStart(entry: StudioSimulationReportListEntry): number {
    const parsed = Date.parse(entry.completedAt);
    if (Number.isFinite(parsed)) return parsed;
    const started = Date.parse(entry.startedAt);
    return Number.isFinite(started) ? started : 0;
}

function sampledRounds(entry: StudioSimulationReportListEntry): number {
    return entry.actualRounds ?? entry.requestedRounds;
}

// A 95% interval wider than two percentage points cannot support a one-point decision. Keep the
// sample useful for whole-round behaviour, but never let the headline look like a signed-off RTP.
function isRoughRtpSample(interval: {low: number; high: number} | undefined): boolean {
    return interval !== undefined && Number.isFinite(interval.low) && Number.isFinite(interval.high)
        && (interval.high - interval.low) / 2 > 0.01;
}

// A producer should not see a noisy 1,000-spin check-out replace a 100,000-spin run just because it
// finished later. Prefer the largest current sample, then the most recent one as a tie-breaker.
function mostRepresentativeFirst(entries: readonly StudioSimulationReportListEntry[]): StudioSimulationReportListEntry[] {
    return [...entries].sort((left, right) =>
        sampledRounds(right) - sampledRounds(left) || reportStart(right) - reportStart(left)
    );
}

function chooseSingleReport(
    entry: StudioSimulationReportListEntry,
    report: SimulationReport | SimulationReportSet,
): {report: SingleSimulationReportView; modeName?: string} | undefined {
    const view = describeSimulationReport(report);
    if (!("modes" in view)) return {report: view};
    const modeName = entry.modeName ?? Object.keys(view.modes)[0];
    if (modeName === undefined) return undefined;
    const mode = view.modes[modeName];
    return mode === undefined ? undefined : {report: mode, modeName};
}

/**
 * The producer-facing default summary: whole paid rounds, including features. Exact math in the next
 * card is deliberately paid-spin only for hit frequency/volatility/max, so that card cannot answer the
 * question a producer actually asks ("what happens across the whole round?"). This card reads the most
 * recent completed simulation that belongs to the *current* design and shows its whole-round sample.
 *
 * A report from an earlier design is never presented as current: the empty state says how many earlier
 * runs exist and sends the reader to Simulation instead, where the exact-vs-sample context lives.
 */
export function ProducerSummary({
    projectRoot,
    refreshKey,
    onOpenSimulation,
    exact,
}: {
    projectRoot: string;
    /** Bumped by every save/apply so a new report or design is picked up without a reload. */
    refreshKey?: number;
    onOpenSimulation: () => void;
    /** Lifted from ExactMathPanel so the exact reference, when it covers the whole round, is the first number. */
    exact?: ExactMathSummary;
}) {
    const fetchImpl = useStudioApi();
    const [state, setState] = useState<ProducerSummaryState>({status: "loading"});
    const requestId = useRef(0);

    useEffect(() => {
        const id = ++requestId.current;
        const controller = new AbortController();
        setState({status: "loading"});
        const current = async (): Promise<void> => {
            // Use the same authored-source identity the Simulation tab uses to label reports. The
            // advanced validation report carries a different canonical-model hash, so it cannot be
            // compared with a simulation's sourceRevision directly.
            const model = await getGameModel(fetchImpl, undefined, controller.signal);
            const revision = model.sourceRevision;
            if (controller.signal.aborted || id !== requestId.current) return;
            const entries = await listReports(fetchImpl);
            if (controller.signal.aborted || id !== requestId.current) return;
            const completed = entries.filter((entry) => entry.status === "completed");
            const currentEntries = revision === undefined
                ? []
                : mostRepresentativeFirst(completed.filter((entry) => entry.sourceRevision === revision));
            if (currentEntries.length === 0) {
                setState({status: "empty", earlierRuns: completed.length});
                return;
            }
            const entry = currentEntries[0]!;
            const detail = await getReport(fetchImpl, entry.id);
            if (controller.signal.aborted || id !== requestId.current) return;
            const chosen = chooseSingleReport(entry, detail.report);
            if (chosen === undefined) {
                setState({status: "empty", earlierRuns: completed.length});
                return;
            }
            setState({status: "ready", entry, ...chosen});
        };
        current().catch((failure: unknown) => {
            if (!controller.signal.aborted && id === requestId.current) {
                setState({status: "error", message: errorMessage(failure)});
            }
        });
        return () => {
            controller.abort();
        };
    }, [fetchImpl, projectRoot, refreshKey]);

    const exactWholeRound = exact?.wholeRound === true;
    const sampleBody = (
        <>
            {state.status === "loading" && <LoadingState label="Reading the latest whole-round simulation…" />}

            {state.status === "ready" && (
                <>
                    <Group align="baseline" gap="xs" mt="sm" wrap="wrap">
                        <Text fw={700} fz={exactWholeRound ? 24 : 34} lh={1.05}>
                            {(state.report.rtp * 100).toFixed(2)}%
                        </Text>
                        <Text size="sm" c="dimmed">
                            RTP — sampled whole-round estimate (incl. free games)
                            <MathTermHelp term="RTP">The long-run share of wagers returned to players. This sampled estimate is not a sign-off number.</MathTermHelp>
                        </Text>
                        <Badge color="blue" variant="light" tt="none">
                            Sampled
                        </Badge>
                        {isRoughRtpSample(state.report.rtpConfidenceInterval95) && (
                            <Badge
                                color="yellow"
                                variant="light"
                                tt="none"
                                data-pokie-rough-sample="true"
                                title="The 95% RTP interval is wider than ±1 percentage point. Use exact math or more spins before treating this as a sign-off number."
                            >
                                Rough sample
                            </Badge>
                        )}
                        {state.modeName !== undefined && (
                            <Badge color="gray" variant="light" tt="none">
                                Mode {state.modeName}
                            </Badge>
                        )}
                    </Group>
                    <Text size="sm" c="dimmed" mt={2}>
                        A whole round starts with one paid spin and includes any free games it triggers. Most
                        representative completed simulation for this saved design ·{" "}
                        {state.report.rounds.toLocaleString("en-US")} paid rounds
                        {state.report.rtpConfidenceInterval95 === undefined
                            ? ""
                            : ` · 95% RTP interval ${formatConfidenceInterval(state.report.rtpConfidenceInterval95)}`}
                        {state.report.seed === null ? "" : ` · seed ${state.report.seed}`}
                    </Text>
                    <SimpleGrid cols={{base: 1, sm: 3}} spacing="md" mt="sm">
                        <ProducerMetric
                            label={<>Hit frequency (whole round)<MathTermHelp term="Hit frequency">The share of completed paid rounds that return any win, including wins settled in free games.</MathTermHelp></>}
                            value={`${(state.report.hitFrequency * 100).toFixed(2)}%`}
                        />
                        <ProducerMetric
                            label={<>Volatility (whole round)<MathTermHelp term="Volatility">The standard deviation of payout per completed paid round, in bet units. Higher means a bumpier ride; it is not an industry low/medium/high class.</MathTermHelp></>}
                            value={state.report.volatility === undefined ? "—" : state.report.volatility.toFixed(2)}
                            accessory={state.report.volatility === undefined ? undefined : <VolatilityBandBadge value={state.report.volatility} size="xs" basis="whole-round volatility" />}
                        />
                        <ProducerMetric
                            label={<>Largest observed whole-round win<MathTermHelp term="Max win">The largest payout seen in this sample, not the theoretical maximum the game can produce.</MathTermHelp></>}
                            value={`${state.report.maxWin.toFixed(2)}× bet`}
                        />
                    </SimpleGrid>
                    <Text size="xs" c="dimmed" mt="sm">
                        Simulation estimates whole-round behaviour including free games. The exact card below is
                        the sign-off reference when its badge says &quot;Whole-round exact&quot;; this sample is
                        the behavioural estimate, not a second exact result.
                    </Text>
                </>
            )}

            {state.status === "empty" && (
                <Alert color="blue" variant="light" title="No whole-round simulation sample for this design yet" mt="sm">
                    <Text size="sm">
                        Run Simulation to estimate whole-round hit frequency, volatility and the largest observed
                        win including free games. The exact card below states whether its RTP is a whole-round or a
                        paid-spin reference.
                        {state.earlierRuns === 0
                            ? ""
                            : ` ${state.earlierRuns.toLocaleString("en-US")} earlier simulation report${state.earlierRuns === 1 ? "" : "s"} belong${state.earlierRuns === 1 ? "s" : ""} to an earlier design and ${state.earlierRuns === 1 ? "is" : "are"} not used here.`}
                    </Text>
                </Alert>
            )}

            {state.status === "error" && (
                <Alert color="yellow" variant="light" title="Whole-round summary unavailable" mt="sm">
                    <Text size="sm">{state.message}</Text>
                </Alert>
            )}
        </>
    );

    return (
        <Paper
            withBorder
            p="md"
            radius="md"
            mb="md"
            data-pokie-producer-summary="whole-round"
            data-pokie-producer-summary-state={state.status}
        >
            <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
                <div>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                        Producer summary
                    </Text>
                    <Title order={3}>Whole round (incl. free games)</Title>
                </div>
                <Button size="sm" variant="default" onClick={onOpenSimulation}>
                    Open Simulation
                </Button>
            </Group>

            {exact !== undefined && (
                <div data-pokie-exact-headline="true">
                    <Group align="baseline" gap="xs" mt="sm" wrap="wrap">
                        <Text fw={700} fz={34} lh={1.05}>
                            {formatAnalysisNumber((exactWholeRound ? exact.rtp : exact.paidRtp) * 100, 4)}%
                        </Text>
                        <Badge color="teal" variant="light" tt="none">
                            Exact
                        </Badge>
                        <Text size="sm" c="dimmed">
                            {exactWholeRound ? "Whole-round exact RTP" : "Paid-spin exact RTP (not whole-round)"}
                            <MathTermHelp term="Exact math">
                                A complete enumeration of every possible paid-spin outcome and its weight; exact for the model it covers, not a sample or a certification.
                            </MathTermHelp>
                        </Text>
                    </Group>
                    <Text size="xs" c="dimmed" mt={2}>
                        {exactWholeRound
                            ? `Exact reference for the saved design from ${exact.outcomes.toLocaleString("en-US")} paid-spin outcomes. The sampled whole-round estimate is below; it is not a second exact number.`
                            : "The exact table covers paid spins only. Use the sampled whole-round estimate below for player experience, and the exact card for the paid-spin reference."}
                    </Text>
                </div>
            )}

            {exactWholeRound ? (
                <details style={{marginTop: "var(--mantine-spacing-sm)"}}>
                    <summary>Latest whole-round sample — behavioural estimate, not the exact reference</summary>
                    {sampleBody}
                </details>
            ) : (
                <>
                    {sampleBody}
                    {exact !== undefined && (
                        <Text size="xs" c="dimmed" mt="sm" data-pokie-exact-paid-spin-reference="true">
                            Exact paid-spin reference: {formatAnalysisNumber(exact.paidRtp * 100, 4)}% from{" "}
                            {exact.outcomes.toLocaleString("en-US")} outcomes. This is not the whole-round RTP.
                        </Text>
                    )}
                </>
            )}
        </Paper>
    );
}

function ProducerMetric({label, value, accessory}: {label: ReactNode; value: string; accessory?: ReactNode}) {
    return (
        <div>
            <Text size="xs" c="dimmed">
                {label}
            </Text>
            <Group gap={6} align="center" wrap="nowrap">
                <Text fw={700} size="lg">
                    {value}
                </Text>
                {accessory}
            </Group>
        </div>
    );
}
