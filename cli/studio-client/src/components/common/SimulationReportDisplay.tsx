import {List, Table, Text} from "@mantine/core";
import type {SimulationReportView} from "../../domain/interpret/Simulation";
import {PageSection} from "./PageSection";

function formatConfidenceInterval(interval: {low: number; high: number} | undefined): string {
    if (!interval) {
        return "—";
    }
    return `${(interval.low * 100).toFixed(2)}% – ${(interval.high * 100).toFixed(2)}%`;
}

// Used by both the Simulation tab's own inline "just completed" block and the Reports tab's detail
// view -- one formatting implementation, not duplicated, same reasoning as the old dom.ts's
// renderSimulationReport (which both call sites shared via SimulationReportElements/prefix).
export function SimulationReportDisplay({view}: {view: SimulationReportView}) {
    return (
        <div>
            <Table withRowBorders={false}>
                <Table.Tbody>
                    <Table.Tr>
                        <Table.Th>Game</Table.Th>
                        <Table.Td>
                            {view.game.name} (id: &quot;{view.game.id}&quot;, v{view.game.version})
                        </Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Rounds</Table.Th>
                        <Table.Td>{view.rounds === view.requestedRounds ? view.rounds : `${view.rounds} (requested ${view.requestedRounds})`}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Seed</Table.Th>
                        <Table.Td>{view.seed ?? "(none)"}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Total bet</Table.Th>
                        <Table.Td>{view.totalBet.toFixed(2)}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Total payout</Table.Th>
                        <Table.Td>{view.totalWin.toFixed(2)}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>RTP</Table.Th>
                        <Table.Td>{(view.rtp * 100).toFixed(2)}%</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Hit frequency</Table.Th>
                        <Table.Td>{(view.hitFrequency * 100).toFixed(2)}%</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Volatility (std. deviation)</Table.Th>
                        <Table.Td>{view.volatility === undefined ? "—" : view.volatility.toFixed(2)}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>RTP 95% confidence interval</Table.Th>
                        <Table.Td>{formatConfidenceInterval(view.rtpConfidenceInterval95)}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Max win</Table.Th>
                        <Table.Td>{view.maxWin.toFixed(2)}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Duration</Table.Th>
                        <Table.Td>
                            {view.durationMs}ms ({view.spinsPerSecond} spins/s)
                        </Table.Td>
                    </Table.Tr>
                </Table.Tbody>
            </Table>

            {view.breakdown && view.breakdown.length > 0 && (
                <PageSection legend="Breakdown">
                    <Table.ScrollContainer minWidth={500}>
                        <Table>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Category</Table.Th>
                                    <Table.Th>Rounds</Table.Th>
                                    <Table.Th>RTP</Table.Th>
                                    <Table.Th>Contribution</Table.Th>
                                    <Table.Th>Hit freq.</Table.Th>
                                    <Table.Th>Max win</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {view.breakdown.map((row) => (
                                    <Table.Tr key={row.category}>
                                        <Table.Td>{row.category}</Table.Td>
                                        <Table.Td>{row.rounds}</Table.Td>
                                        <Table.Td>{(row.rtp * 100).toFixed(2)}%</Table.Td>
                                        <Table.Td>{(row.contribution * 100).toFixed(2)} pp</Table.Td>
                                        <Table.Td>{(row.hitFrequency * 100).toFixed(2)}%</Table.Td>
                                        <Table.Td>{row.maxWin.toFixed(2)}</Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                </PageSection>
            )}

            {view.warnings.length > 0 && (
                <PageSection legend="Warnings">
                    <List size="sm">
                        {view.warnings.map((warning, index) => (
                            <List.Item key={index}>{warning}</List.Item>
                        ))}
                    </List>
                </PageSection>
            )}

            {view.reproducibilityCommand !== undefined && (
                <Text size="sm" c="dimmed" mt="sm">
                    {view.reproducibilityCommand}
                </Text>
            )}
        </div>
    );
}
