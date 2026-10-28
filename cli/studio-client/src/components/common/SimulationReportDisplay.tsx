import {describeSimulationDiagnostics} from "../../../../../src/reporting/describeSimulationDiagnostics";
import {describeFeatureAnalytics} from "../../../../../src/simulation/describeFeatureAnalytics";
import {describeWeightedBonusCoverage} from "../../../../../src/session/videoslot/authored/WeightedBonus";
import {describeSequenceVariantCoverage} from "../../../../../src/session/videoslot/combinations/WeightedSequenceVariant";
import {List, Table, Text} from "@mantine/core";
import type {SimulationReportView} from "../../domain/interpret/Simulation";
import {AdvancedDisclosure} from "./AdvancedDisclosure";
import {PageSection} from "./PageSection";
import {formatConfidenceInterval} from "../../domain/interpret/formatConfidenceInterval";

export {formatConfidenceInterval};

// Used by both the Simulation tab's own inline "just completed" block and the Reports tab's detail
// view -- one formatting implementation, not duplicated, same reasoning as the old dom.ts's
// renderSimulationReport (which both call sites shared via SimulationReportElements/prefix).
export function SimulationReportDisplay({view}: {view: SimulationReportView}) {
    if ("modes" in view) return <div><Text>All modes — independent results per mode</Text>{Object.entries(view.modes).map(([id, mode]) => <PageSection key={id} legend={`Mode: ${id}`}><SimulationReportDisplay view={mode} /></PageSection>)}</div>;
    return (
        <div>
            {view.betMode !== undefined && <Text>Bet mode: {view.betMode} · selected before each available entry</Text>}
            {view.targetRtp !== undefined && <Text>Target RTP: {(view.targetRtp * 100).toFixed(2)}% · deviation: {((view.rtpDeviation ?? 0) * 100).toFixed(2)} pp</Text>}
            {view.jackpot && <PageSection legend="Jackpots">
                <Text>Awards: {view.jackpot.awardCount}; awarded: {view.jackpot.totalAwarded}; contributed: {view.jackpot.totalContributed}</Text>
                <Text>Jackpot RTP contribution: {(view.jackpot.contribution * 100).toFixed(4)}% of actual stake {view.totalBet}</Text>
                <Text size="sm">Authored accumulating pools are local to each simulation session/worker. Fixed-pool contributions are statistics, not balance growth.</Text>
                <Table><Table.Thead><Table.Tr>{["Pool", "Awards", "Awarded", "Contributed", "RTP contribution"].map(label => <Table.Th key={label}>{label}</Table.Th>)}</Table.Tr></Table.Thead>
                    <Table.Tbody>{Object.entries(view.jackpot.pools).map(([id, pool]) => <Table.Tr key={id}><Table.Td>{id}</Table.Td><Table.Td>{pool.awardCount}</Table.Td><Table.Td>{pool.totalAwarded}</Table.Td><Table.Td>{pool.totalContributed}</Table.Td><Table.Td>{(pool.contribution * 100).toFixed(4)}%</Table.Td></Table.Tr>)}</Table.Tbody></Table>
            </PageSection>}
            {view.workerSeedStrategy && <Text>Worker seed strategy: {view.workerSeedStrategy}. Independent feature trajectory and session-local jackpot per worker.</Text>}
            <PageSection legend="Sampling and precision diagnostics">{describeSimulationDiagnostics(view, false).map((line, index) => <Text key={index}>{line}</Text>)}</PageSection>
            <PageSection legend="Feature analytics">{describeFeatureAnalytics(view.analytics).map((line, index) => <Text key={index}>{line}</Text>)}</PageSection>
            {view.sampling && <PageSection legend="Logical round sampling">Completed logical rounds: {view.rounds}; accepted subrounds: {view.sampling.acceptedSubrounds}; carried subrounds: {view.sampling.carriedSubrounds ?? 0}; excluded unfinished/restored subrounds: {view.sampling.excludedSubrounds}. Independent session trajectory per worker. Monetary totals include every observed subround.</PageSection>}
            {view.modifiers && <PageSection legend="Screen modifiers">Executed steps: {view.modifiers.steps}; rule applications: {view.modifiers.ruleApplications}; sticky steps: {view.modifiers.stickySteps}; multiplied components: {view.modifiers.multipliedComponents}</PageSection>}
            {view.weightedBonus && <PageSection legend={`Weighted bonus ${view.weightedBonus.tableId}`}>
                <Text>{view.weightedBonus.selections} eligible selections; {view.weightedBonus.completed} completed; {view.weightedBonus.incomplete} incomplete net of carried tails. Actual frequency = count / eligible selections.</Text>
                <Table><Table.Thead><Table.Tr>{["Outcome ID", "Weight", "Configured probability", "Count", "Actual frequency", "Coverage"].map(label => <Table.Th key={label}>{label}</Table.Th>)}</Table.Tr></Table.Thead>
                    <Table.Tbody>{view.weightedBonus.outcomes.map(o => <Table.Tr key={o.id}><Table.Td>{o.id}</Table.Td><Table.Td>{o.weight}</Table.Td><Table.Td>{o.probability}</Table.Td><Table.Td>{o.count}</Table.Td><Table.Td>{o.frequency}</Table.Td><Table.Td>{describeWeightedBonusCoverage(o.weight, o.uncovered)}</Table.Td></Table.Tr>)}</Table.Tbody>
                </Table>
            </PageSection>}
            {view.reelSequences?.map(reel => <PageSection key={reel.reelIndex} legend={`Weighted reel ${reel.reelIndex + 1}`}>
                <Text>{reel.context}: {reel.selections} selections</Text>
                <Text size="sm">Observed frequency = count / selections.</Text>
                <Table><Table.Thead><Table.Tr>{["Variant ID", "Weight", "Probability", "Count", "Frequency", "Coverage"].map(label => <Table.Th key={label}>{label}</Table.Th>)}</Table.Tr></Table.Thead>
                    <Table.Tbody>{reel.variants.map(variant => <Table.Tr key={variant.id}>
                        <Table.Td>{variant.id}</Table.Td><Table.Td>{variant.weight}</Table.Td><Table.Td>{variant.probability === 0 && variant.weight > 0 ? `${variant.probabilityRatio?.numerator}/${variant.probabilityRatio?.denominator}` : variant.probability}</Table.Td><Table.Td>{variant.count}</Table.Td><Table.Td>{variant.frequency}</Table.Td><Table.Td>{describeSequenceVariantCoverage(variant.weight, variant.uncovered)}</Table.Td>
                    </Table.Tr>)}</Table.Tbody></Table>
            </PageSection>)}
            <Table withRowBorders={false}>
                <Table.Tbody>
                    <Table.Tr>
                        <Table.Th>Game</Table.Th>
                        <Table.Td style={{overflowWrap: "anywhere"}}>
                            {view.game.name} (id: &quot;{view.game.id}&quot;, v{view.game.version})
                        </Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Requested rounds</Table.Th>
                        <Table.Td>{view.requestedRounds}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Actual rounds</Table.Th>
                        <Table.Td>{view.rounds}</Table.Td>
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
                        <Table.Th>Max win</Table.Th>
                        <Table.Td>{view.maxWin.toFixed(2)}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Max win frequency</Table.Th>
                        <Table.Td>{view.maxWinFrequency === undefined ? "—" : `${(view.maxWinFrequency * 100).toFixed(4)}%`}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Average payout</Table.Th>
                        <Table.Td>{view.averagePayout === undefined ? "—" : view.averagePayout.toFixed(2)}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Stop reason</Table.Th>
                        <Table.Td>{view.stopReason ?? "Fixed requested rounds"}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Duration</Table.Th>
                        <Table.Td>
                            {view.durationMs}ms ({view.spinsPerSecond} spins/s)
                        </Table.Td>
                    </Table.Tr>
                </Table.Tbody>
            </Table>

            <PageSection legend="Convergence">
                <Table withRowBorders={false}>
                    <Table.Tbody>
                        <Table.Tr>
                            <Table.Th>RTP 95% confidence interval</Table.Th>
                            <Table.Td>{formatConfidenceInterval(view.rtpConfidenceInterval95)}</Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                            <Table.Th>Average payout 95% confidence interval</Table.Th>
                            <Table.Td>{formatConfidenceInterval(view.averagePayoutConfidenceInterval95, "payout")}</Table.Td>
                        </Table.Tr>
                        {view.convergence && (
                            <>
                                <Table.Tr>
                                    <Table.Th>Adaptive checks</Table.Th>
                                    <Table.Td>
                                        {view.convergence.checksPerformed} performed; {view.convergence.consecutiveStableChecks}/
                                        {view.convergence.stableChecks} stable
                                    </Table.Td>
                                </Table.Tr>
                                <Table.Tr>
                                    <Table.Th>Achieved RTP half-width</Table.Th>
                                    <Table.Td>{view.convergence.achievedRtpHalfWidth === null ? "unavailable" : (view.convergence.achievedRtpHalfWidth * 100).toFixed(3)} pp</Table.Td>
                                </Table.Tr>
                            </>
                        )}
                    </Table.Tbody>
                </Table>
                {view.recommendations.length > 0 && (
                    <List size="sm" mt="sm">
                        {view.recommendations.map((recommendation, index) => (
                            <List.Item key={index}>{recommendation}</List.Item>
                        ))}
                    </List>
                )}
            </PageSection>

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

            {view.payoutHistogram && Object.keys(view.payoutHistogram).length > 0 && (
                <AdvancedDisclosure detail="payout histogram">
                    <Table.ScrollContainer minWidth={300}>
                        <Table>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Payout bucket</Table.Th>
                                    <Table.Th>Rounds</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {Object.entries(view.payoutHistogram).map(([bucket, count]) => (
                                    <Table.Tr key={bucket}>
                                        <Table.Td>{bucket}</Table.Td>
                                        <Table.Td>{count}</Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                </AdvancedDisclosure>
            )}

            {view.reproducibilityCommand !== undefined && (
                <Text size="sm" c="dimmed" mt="sm" style={{overflowWrap: "anywhere"}}>
                    {view.reproducibilityCommand}
                </Text>
            )}
            {(view.configHash !== undefined || view.pokieVersion !== undefined) && (
                <Text size="sm" c="dimmed" style={{overflowWrap: "anywhere"}}>
                    {view.configHash !== undefined ? `Model/config hash: ${view.configHash}` : ""}
                    {view.configHash !== undefined && view.pokieVersion !== undefined ? " · " : ""}
                    {view.pokieVersion !== undefined ? `POKIE/runtime: ${view.pokieVersion}` : ""}
                </Text>
            )}
        </div>
    );
}
