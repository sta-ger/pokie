import {describeSimulationDiagnostics} from "../../../../../src/reporting/describeSimulationDiagnostics";
import {describeRtpSanityWarning} from "../../../../../src/reporting/describeRtpSanityWarning";
import {Alert, Table, Text} from "@mantine/core";
import {EmptyState} from "./EmptyState";
import {ErrorState} from "./ErrorState";
import {AdvancedDisclosure} from "./AdvancedDisclosure";
import {SimulationAssessment} from "./SimulationAssessment";
import {simulationScopeSuffix, type SimulationReportView} from "../../domain/interpret/Simulation";

// Shared by the Run step's live elapsed-time readout and this card's duration readout -- one
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
// precision verdict and warnings visible, with supporting explanations disclosed.
export function SimulationSummaryCard({outcome}: {outcome: SimulationOutcome}) {
    if (outcome.kind === "failed") {
        return <ErrorState message={`Simulation failed after ${formatElapsedMs(outcome.durationMs)}: ${outcome.error ?? "Unknown error."}`} />;
    }

    if (outcome.kind === "cancelled") {
        return (
            <EmptyState
                message={`Cancelled after ${formatElapsedMs(outcome.durationMs)} — ${outcome.roundsCompleted.toLocaleString("en-US")}/${outcome.rounds.toLocaleString("en-US")} spins completed.`}
            />
        );
    }

    const {report} = outcome;
    if ("modes" in report) return <div><Text>All modes — independent results per mode</Text>{Object.entries(report.modes).map(([id, mode]) => <div key={id}><Text fw={600}>Mode: {id}</Text><SimulationSummaryCard outcome={{kind: "completed", report: mode}} /></div>)}</div>;
    const scopeSuffix = simulationScopeSuffix(report);
    const rtpWarning = describeRtpSanityWarning(report.rtp, {
        rounds: report.rounds,
        confidenceInterval95: report.rtpConfidenceInterval95,
    });
    return (
        <div className="studio-simulation-summary">
            {report.betMode !== undefined && <Text>Bet mode: {report.betMode}</Text>}
            <Table withRowBorders={false} role="table" className="studio-simulation-metrics studio-simulation-primary-metrics" aria-label="Simulation summary">
                <Table.Tbody>
                    <Table.Tr>
                        <Table.Th scope="row">RTP{scopeSuffix}</Table.Th>
                        <Table.Td>{(report.rtp * 100).toFixed(2)}%</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th scope="row">Hit frequency{scopeSuffix}</Table.Th>
                        <Table.Td>{(report.hitFrequency * 100).toFixed(2)}%</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th scope="row" title="Standard deviation of payout per paid round, in bet units.">Volatility (std. deviation, bet units){scopeSuffix}</Table.Th>
                        <Table.Td>{report.volatility === undefined ? "—" : report.volatility.toFixed(2)}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th scope="row" title="Largest whole-paid-round payout observed in this sample, not the theoretical maximum; it can exceed the top paytable entry when several lines or a feature win together. The technical report's single-spin maximum is a smaller unit.">Largest observed whole-round win (× bet){scopeSuffix}</Table.Th>
                        <Table.Td>{report.maxWin.toFixed(2)}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th scope="row">Seed</Table.Th>
                        <Table.Td style={{overflowWrap: "anywhere"}}>{report.seed ?? "— (not set; this run is not reproducible)"}</Table.Td>
                    </Table.Tr>
                </Table.Tbody>
            </Table>

            <Text size="sm" className="studio-simulation-run-facts">Duration: {formatElapsedMs(report.durationMs)}</Text>
            <Text size="xs" c="dimmed">Volatility is the standard deviation of payout per completed paid round, in bet units. The largest observed win is a sample maximum, not the theoretical game maximum.{scopeSuffix === "" ? "" : " These metrics include free games and other observed features; exact math reports paid-spin figures separately."}</Text>
            {rtpWarning !== undefined && (
                <Alert color="red" variant="light" title="RTP looks unusual" mt="sm">
                    <Text size="sm">{rtpWarning}</Text>
                </Alert>
            )}
            <SimulationAssessment view={report} compact />

            <AdvancedDisclosure label="sampling and precision">
                <div className="studio-simulation-diagnostics">
                    {describeSimulationDiagnostics(report, false).slice(0, 5).filter((_, index) => index !== 2).map((line, index) => <Text size="sm" key={index}>{line}</Text>)}
                </div>
            </AdvancedDisclosure>
        </div>
    );
}
