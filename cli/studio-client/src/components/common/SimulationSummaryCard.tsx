import {describeSimulationDiagnostics} from "../../../../../src/reporting/describeSimulationDiagnostics";
import {List, Table, Text} from "@mantine/core";
import {EmptyState} from "./EmptyState";
import {ErrorState} from "./ErrorState";
import {PageSection} from "./PageSection";
import {formatConfidenceInterval} from "./SimulationReportDisplay";
import type {SimulationReportView} from "../../domain/interpret/Simulation";

// Shared by the Run step's own live elapsed-time readout and this card's "Duration" row -- one
// formatting implementation for both, same reasoning SimulationReportDisplay's own
// formatConfidenceInterval already follows.
export function formatElapsedMs(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    if (totalSeconds < 60) {
        return `${(ms / 1000).toFixed(1)}s`;
    }
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

// A discriminated union rather than a raw SimulationProgressView -- the Review step shows this for
// both a just-completed live job AND a reopened historic report (which has no live "progress" object
// at all, only a persisted SimulationReportView), so this card's own contract deliberately doesn't
// require one.
export type SimulationOutcome =
    | {kind: "completed"; report: SimulationReportView}
    | {kind: "failed"; durationMs: number; error?: string}
    | {kind: "cancelled"; durationMs: number; roundsCompleted: number; rounds: number};

// The compact "did it work" readout the Review step auto-shows the instant a job goes terminal --
// before the user opts into SimulationReportDisplay's much longer full report. Deliberately headline
// numbers first, then warnings and a labelled sampling/precision section. Keep the
// diagnostic caveats visible without placing a prose wall before the result.
export function SimulationSummaryCard({outcome}: {outcome: SimulationOutcome}) {
    if (outcome.kind === "failed") {
        return <ErrorState message={`Simulation failed after ${formatElapsedMs(outcome.durationMs)}: ${outcome.error ?? "Unknown error."}`} />;
    }

    if (outcome.kind === "cancelled") {
        return (
            <EmptyState
                message={`Cancelled after ${formatElapsedMs(outcome.durationMs)} — ${outcome.roundsCompleted}/${outcome.rounds} rounds completed.`}
            />
        );
    }

    const {report} = outcome;
    if ("modes" in report) return <div><Text>All modes — independent results per mode</Text>{Object.entries(report.modes).map(([id, mode]) => <div key={id}><Text fw={600}>Mode: {id}</Text><SimulationSummaryCard outcome={{kind: "completed", report: mode}} /></div>)}</div>;
    const mainRecommendation = report.recommendations[0];
    return (
        <div className="studio-simulation-summary">
            {report.betMode !== undefined && <Text>Bet mode: {report.betMode}</Text>}
            <Table withRowBorders={false} aria-label="Simulation summary">
                <Table.Tbody>
                    <Table.Tr>
                        <Table.Th>RTP</Table.Th>
                        <Table.Td>{(report.rtp * 100).toFixed(2)}%</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Hit frequency</Table.Th>
                        <Table.Td>{(report.hitFrequency * 100).toFixed(2)}%</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Volatility</Table.Th>
                        <Table.Td>{report.volatility === undefined ? "—" : report.volatility.toFixed(2)}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Max win</Table.Th>
                        <Table.Td>{report.maxWin.toFixed(2)}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Duration</Table.Th>
                        <Table.Td>{formatElapsedMs(report.durationMs)}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Convergence</Table.Th>
                        <Table.Td>RTP 95% CI: {formatConfidenceInterval(report.rtpConfidenceInterval95)}</Table.Td>
                    </Table.Tr>
                </Table.Tbody>
            </Table>

            {report.warnings.length > 0 && (
                <div>
                    <Text size="sm" fw={600} mt="sm">
                        Warnings
                    </Text>
                    <List size="sm">
                        {report.warnings.map((warning, index) => (
                            <List.Item key={index}>{warning}</List.Item>
                        ))}
                    </List>
                </div>
            )}

            {mainRecommendation && (
                <Text size="sm" mt="sm">
                    <Text span fw={600}>
                        Recommendation:
                    </Text>{" "}
                    {mainRecommendation}
                </Text>
            )}

            <PageSection legend="Sampling and precision">
                <div className="studio-simulation-diagnostics">
                    {describeSimulationDiagnostics(report, false).slice(0, report.diagnostics ? 5 + report.diagnostics.coverageLimitations.length : 4).map((line, index) => <Text size="sm" key={index}>{line}</Text>)}
                </div>
            </PageSection>
        </div>
    );
}
