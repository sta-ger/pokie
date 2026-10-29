import {List, Table, Text} from "@mantine/core";
import {describeSimulationDiagnostics} from "../../../../../src/reporting/describeSimulationDiagnostics";
import type {SingleSimulationReportView} from "../../domain/interpret/Simulation";
import {formatConfidenceInterval} from "../../domain/interpret/formatConfidenceInterval";
import {AdvancedDisclosure} from "./AdvancedDisclosure";

// Both result views read the same persisted assessment. Keep warnings and the
// precision verdict beside the intervals; supporting advice is an explicit read.
export function SimulationAssessment({view, compact = false}: {view: SingleSimulationReportView; compact?: boolean}) {
    const limitations = view.diagnostics?.coverageLimitations ?? [];
    return (
        <div className="studio-simulation-assessment">
            <section aria-label="Precision and convergence" className="studio-simulation-precision">
                <Text component="h3" size="sm" fw={600}>Precision and convergence</Text>
                <Text size="sm">{view.rounds} usable samples · {view.diagnostics?.precision ?? "Precision unavailable (legacy report)"}</Text>
                <Table withRowBorders={false} aria-label="Confidence intervals" className="studio-simulation-intervals">
                    <Table.Tbody>
                        <Table.Tr>
                            <Table.Th scope="row">RTP 95% confidence interval</Table.Th>
                            <Table.Td>{compact ? `RTP 95% CI: ${formatConfidenceInterval(view.rtpConfidenceInterval95)}` : formatConfidenceInterval(view.rtpConfidenceInterval95)}</Table.Td>
                        </Table.Tr>
                        {!compact && <Table.Tr>
                            <Table.Th scope="row">Average payout 95% confidence interval</Table.Th>
                            <Table.Td>{formatConfidenceInterval(view.averagePayoutConfidenceInterval95, "payout")}</Table.Td>
                        </Table.Tr>}
                    </Table.Tbody>
                </Table>
                <Text size="sm" c="dimmed">Empirical estimates · exact RTP and unseen-event coverage are not established.</Text>
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
                        <List size="sm">{view.recommendations.map((line, index) => <List.Item key={index}>{line}</List.Item>)}</List>
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
