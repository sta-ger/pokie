import {Alert, List, Table, Text} from "@mantine/core";
import {IconAlertTriangle} from "@tabler/icons-react";
import {describeSimulationDiagnostics, describeSimulationPrecision} from "../../../../../src/reporting/describeSimulationDiagnostics";
import type {SingleSimulationReportView} from "../../domain/interpret/Simulation";
import {formatConfidenceInterval} from "../../domain/interpret/formatConfidenceInterval";
import {describeStudioSimulationRecommendation, formatRoundsEstimate, requestedPlaysForRtpHalfWidth, roundsForRtpHalfWidth} from "../../domain/simulationRecommendations";
import {MAX_STUDIO_SIMULATION_ROUNDS} from "../../domain/simulationRounds";
import {AdvancedDisclosure} from "./AdvancedDisclosure";

// Both result views read the same persisted assessment. Keep warnings and the
// precision verdict beside the intervals; supporting advice is an explicit read.
export function SimulationAssessment({view, compact = false}: {view: SingleSimulationReportView; compact?: boolean}) {
    const limitations = view.diagnostics?.coverageLimitations ?? [];
    const rtpInterval = view.rtpConfidenceInterval95;
    // A target-precision run uses one worker in Studio, so the persisted tolerance is the combined
    // sample's target. Older/CLI multi-worker reports keep a per-worker tolerance; fall back to the
    // generic ±1 pp advice for those instead of mislabeling their target.
    const requestedHalfWidth = view.workers === 1 ? view.convergence?.rtpTolerance : undefined;
    const requestedTargetPp = requestedHalfWidth === undefined ? undefined : requestedHalfWidth * 100;
    const observedHalfWidth = rtpInterval === undefined ? undefined : (rtpInterval.high - rtpInterval.low) / 2;
    const roughEstimate = observedHalfWidth !== undefined &&
        (requestedHalfWidth === undefined ? observedHalfWidth > 0.01 : observedHalfWidth > requestedHalfWidth);
    const targetHalfWidth = requestedHalfWidth ?? 0.01;
    const targetRounds = rtpInterval === undefined ? undefined : roundsForRtpHalfWidth(view.rounds, rtpInterval, targetHalfWidth);
    const halfPointRounds = rtpInterval === undefined ? undefined : roundsForRtpHalfWidth(view.rounds, rtpInterval, 0.005);
    const acceptedPlays = view.sampling?.acceptedSubrounds ?? view.rounds;
    const targetPlays = rtpInterval === undefined ? undefined : requestedPlaysForRtpHalfWidth(view.rounds, acceptedPlays, rtpInterval, targetHalfWidth);
    const halfPointPlays = rtpInterval === undefined ? undefined : requestedPlaysForRtpHalfWidth(view.rounds, acceptedPlays, rtpInterval, 0.005);
    const expandedByFeatures = view.sampling !== undefined && acceptedPlays !== view.rounds;
    const playsPerPaidRound = view.rounds > 0 ? acceptedPlays / view.rounds : undefined;
    const studioLimit = MAX_STUDIO_SIMULATION_ROUNDS.toLocaleString("en-US");
    const exceedsStudioLimit = requestedHalfWidth === undefined
        ? (targetPlays !== undefined && targetPlays > MAX_STUDIO_SIMULATION_ROUNDS) ||
            (halfPointPlays !== undefined && halfPointPlays > MAX_STUDIO_SIMULATION_ROUNDS)
        : targetPlays !== undefined && targetPlays > MAX_STUDIO_SIMULATION_ROUNDS;
    const sampleSummary = expandedByFeatures
        ? `${view.rounds.toLocaleString("en-US")} paid rounds completed from ${acceptedPlays.toLocaleString("en-US")} spins (paid + free)`
        : `${view.rounds.toLocaleString("en-US")} paid rounds completed`;
    return (
        <div className="studio-simulation-assessment">
            <section aria-label="Precision and convergence" className="studio-simulation-precision">
                <Text component="h3" size="sm" fw={600}>Precision and convergence</Text>
                <Text size="sm">
                    {sampleSummary} · {view.diagnostics ? describeSimulationPrecision(view.diagnostics.precision) : "precision unavailable (older report)"}
                    {view.diagnostics?.precision === "notRequested" ? " — Studio stops at the spin budget and reports the interval actually achieved." : ""}
                </Text>
                <Table withRowBorders={false} aria-label="Confidence intervals" className="studio-simulation-intervals">
                    <Table.Tbody>
                        <Table.Tr>
                            <Table.Th scope="row">RTP 95% confidence interval</Table.Th>
                            <Table.Td>{compact ? `RTP 95% CI: ${formatConfidenceInterval(view.rtpConfidenceInterval95)}` : formatConfidenceInterval(view.rtpConfidenceInterval95)}</Table.Td>
                        </Table.Tr>
                        {!compact && <Table.Tr>
                            <Table.Th scope="row">Average payout (× bet) 95% confidence interval</Table.Th>
                            <Table.Td>{formatConfidenceInterval(view.averagePayoutConfidenceInterval95, "payout")}</Table.Td>
                        </Table.Tr>}
                    </Table.Tbody>
                </Table>
                <Text size="xs" c="dimmed">95% intervals use a normal approximation: 1.96 × standard deviation ÷ √completed paid rounds.</Text>
                <Text size="sm" c="dimmed">Empirical estimates · exact RTP and unseen-event coverage are not established.</Text>
                {roughEstimate && (
                    <Alert color="yellow" icon={<IconAlertTriangle size={16} />} title="Rough RTP estimate" mt="sm">
                        <Text size="sm">
                            {requestedTargetPp === undefined
                                ? "This interval is wider than ±1 percentage point."
                                : `This interval is wider than the requested ±${requestedTargetPp.toFixed(2)} pp.`}{" "}
                            Use exact math for RTP when the design can be enumerated completely, or run more spins before
                            treating this sample as final.
                        </Text>
                        {targetRounds !== undefined && (
                            <>
                                <Text size="sm" mt={4}>
                                    At the observed spread, about {formatRoundsEstimate(targetRounds)} paid rounds are needed for a{" "}
                                    {requestedTargetPp === undefined ? "±1 pp" : `requested ±${requestedTargetPp.toFixed(2)} pp`} interval
                                    {!expandedByFeatures || targetPlays === undefined ? "" : ` (about ${formatRoundsEstimate(targetPlays)} spins)`}
                                    {requestedTargetPp !== undefined || halfPointRounds === undefined ? "" : `; about ${formatRoundsEstimate(halfPointRounds)} paid rounds for ±0.5 pp`}
                                    {requestedTargetPp !== undefined || !expandedByFeatures || halfPointPlays === undefined ? "" : ` (about ${formatRoundsEstimate(halfPointPlays)} spins)`}.
                                </Text>
                                {expandedByFeatures && playsPerPaidRound !== undefined && playsPerPaidRound !== 1 && (
                                    <Text size="xs" c="dimmed" mt={4}>
                                        This game expands one paid round into about {formatRoundsEstimate(playsPerPaidRound)} spins (paid + free)
                                        when free games are included. The spin budget counts paid and free spins; the interval counts completed paid rounds.
                                    </Text>
                                )}
                                {exceedsStudioLimit && (
                                    <Text size="xs" c="dimmed" mt={4}>
                                        Studio runs at most {studioLimit} spins per simulation. For a tighter interval, use exact math for RTP
                                        or run the larger simulation from the CLI.
                                    </Text>
                                )}
                            </>
                        )}
                    </Alert>
                )}
            </section>
            <section aria-label="Report notes" className="studio-simulation-notes" data-has-warnings={view.warnings.length > 0 || undefined}>
                <Text component="h3" size="sm" fw={600}>{view.warnings.length > 0 ? `Warnings (${view.warnings.length})` : "Report notes"}</Text>
                {view.warnings.length > 0 && <List size="sm" spacing={4}>
                    {view.warnings.map((warning, index) => <List.Item key={index}>{warning}</List.Item>)}
                </List>}
                <Text size="sm">Coverage limitations: {limitations.length} · Recommendations: {view.recommendations.length}</Text>
                <AdvancedDisclosure label="recommendations and limits">
                    {view.recommendations.length > 0 && <>
                        <Text size="sm" fw={600}>Recommendations</Text>
                        <List size="sm">{view.recommendations.map((line, index) => <List.Item key={index}>{describeStudioSimulationRecommendation(line)}</List.Item>)}</List>
                    </>}
                    <Text size="sm" fw={600} mt="sm">Interpretation and coverage</Text>
                    <Text size="sm">{describeSimulationDiagnostics(view, false)[2]}</Text>
                    {limitations.length > 0 && <List size="sm">{limitations.map((line, index) => <List.Item key={index}>{line}</List.Item>)}</List>}
                    {!view.diagnostics && <Text size="sm">Persisted precision/support diagnostics unavailable (legacy report).</Text>}
                </AdvancedDisclosure>
            </section>
        </div>
    );
}
