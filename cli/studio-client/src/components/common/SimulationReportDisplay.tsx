import {describeSimulationDiagnostics, describeSimulationPrecision, describeSimulationStopReason} from "../../../../../src/reporting/describeSimulationDiagnostics";
import {payoutHistogramRows} from "../../../../../src/reporting/payoutHistogramPresentation";
import {describeWeightedBonusCoverage} from "../../../../../src/session/videoslot/authored/WeightedBonus";
import {describeSequenceVariantCoverage} from "../../../../../src/session/videoslot/combinations/WeightedSequenceVariant";
import {Table, Text} from "@mantine/core";
import {simulationScopeSuffix, type SimulationReportView} from "../../domain/interpret/Simulation";
import {AdvancedDisclosure} from "./AdvancedDisclosure";
import {PageSection} from "./PageSection";
import {SimulationAnalyticsDisplay} from "./SimulationAnalyticsDisplay";
import {SimulationAssessment} from "./SimulationAssessment";
import {PayoutHistogramChart} from "./PayoutHistogramChart";
import {formatConfidenceInterval} from "../../domain/interpret/formatConfidenceInterval";

export {formatConfidenceInterval};

// Used by both the Simulation tab's own inline "just completed" block and the Reports tab's detail
// view -- one formatting implementation, not duplicated, same reasoning as the old dom.ts's
// renderSimulationReport (which both call sites shared via SimulationReportElements/prefix).
export function SimulationReportDisplay({view}: {view: SimulationReportView}) {
    if ("modes" in view) return <div><Text>All modes — independent results per mode</Text>{Object.entries(view.modes).map(([id, mode]) => <PageSection key={id} legend={`Mode: ${id}`}><SimulationReportDisplay view={mode} /></PageSection>)}</div>;
    const scopeSuffix = simulationScopeSuffix(view);
    return (
        <div className="studio-simulation-report">
            {view.betMode !== undefined && <Text>Bet mode: {view.betMode} · selected before each available entry</Text>}
            {view.targetRtp !== undefined && <Text>Target RTP: {(view.targetRtp * 100).toFixed(2)}% · deviation: {((view.rtpDeviation ?? 0) * 100).toFixed(2)} pp</Text>}
            <section aria-label="Result metrics" className="studio-simulation-primary">
                <Text component="h3" size="sm" fw={600} mb="xs">Result metrics</Text>
                <Table withRowBorders={false} role="table" className="studio-simulation-metrics studio-simulation-primary-metrics" aria-label="Simulation result metrics">
                    <Table.Tbody>
                        <Table.Tr>
                            <Table.Th scope="row">RTP{scopeSuffix}</Table.Th>
                            <Table.Td>{(view.rtp * 100).toFixed(2)}%</Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                            <Table.Th scope="row">Hit frequency{scopeSuffix}</Table.Th>
                            <Table.Td>{(view.hitFrequency * 100).toFixed(2)}%</Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                            <Table.Th scope="row" title="Standard deviation of payout per paid round, in bet units.">Volatility (std. deviation, bet units){scopeSuffix}</Table.Th>
                            <Table.Td>{view.volatility === undefined ? "—" : view.volatility.toFixed(2)}</Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                            <Table.Th scope="row">Largest observed win (× bet){scopeSuffix}</Table.Th>
                            <Table.Td>{view.maxWin.toFixed(2)}</Table.Td>
                        </Table.Tr>
                    </Table.Tbody>
                </Table>
                <Table withRowBorders={false} aria-label="Additional result metrics" className="studio-simulation-facts">
                    <Table.Tbody>
                        <Table.Tr>
                            <Table.Th>Largest observed win frequency</Table.Th>
                            <Table.Td>{view.maxWinFrequency === undefined ? "—" : `${(view.maxWinFrequency * 100).toFixed(4)}%`}</Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                            <Table.Th>Average payout (× bet)</Table.Th>
                            <Table.Td>{view.averagePayout === undefined ? "—" : view.averagePayout.toFixed(2)}</Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                            <Table.Th>Stop reason</Table.Th>
                            <Table.Td>{view.stopReason === undefined ? "requested spins completed" : describeSimulationStopReason(view.stopReason)}</Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                            <Table.Th>Duration</Table.Th>
                            <Table.Td>
                                {view.durationMs}ms ({view.spinsPerSecond} spins/s)
                            </Table.Td>
                        </Table.Tr>
                    </Table.Tbody>
                </Table>
            </section>
            {scopeSuffix !== "" && <Text size="xs" c="dimmed">These metrics describe the whole paid round, including free games and other observed features. Exact math reports paid-spin figures separately.</Text>}
            {view.sampling && <Text size="xs" c="dimmed">The spin count includes every played spin, including free spins. RTP confidence intervals use completed paid rounds as their sample count.</Text>}

            <PayoutHistogramChart histogram={view.payoutHistogram} />

            <SimulationAssessment view={view} />
            <AdvancedDisclosure label="sampling and precision">
                {view.convergence && <Text size="sm">Adaptive stopping is separate from the combined 95% interval in the summary.</Text>}

                <Table aria-label="Sampling and precision" role="table" withRowBorders={false}>
                    <Table.Tbody>
                        <Table.Tr><Table.Th>Requested spins</Table.Th><Table.Td>{view.requestedRounds}</Table.Td></Table.Tr>
                        <Table.Tr><Table.Th>Completed paid rounds</Table.Th><Table.Td>{view.rounds.toLocaleString("en-US")}</Table.Td></Table.Tr>
                        {view.sampling && <>
                            <Table.Tr><Table.Th>Spins (paid + free)</Table.Th><Table.Td>{view.sampling.acceptedSubrounds}</Table.Td></Table.Tr>
                            <Table.Tr><Table.Th>Carried spins</Table.Th><Table.Td>{view.sampling.carriedSubrounds ?? 0}</Table.Td></Table.Tr>
                            <Table.Tr><Table.Th>Excluded unfinished/restored spins</Table.Th><Table.Td>{view.sampling.excludedSubrounds}</Table.Td></Table.Tr>
                        </>}
                        {view.convergence && (
                            <>
                                <Table.Tr><Table.Th>Minimum paid rounds before a convergence check</Table.Th><Table.Td>{view.convergence.minRounds}</Table.Td></Table.Tr>
                                <Table.Tr><Table.Th>RTP tolerance</Table.Th><Table.Td>{(view.convergence.rtpTolerance * 100).toFixed(2)} pp</Table.Td></Table.Tr>
                                <Table.Tr><Table.Th>Check interval (spins)</Table.Th><Table.Td>{view.convergence.checkIntervalRounds}</Table.Td></Table.Tr>
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
                        {view.diagnostics && <>
                            <Table.Tr><Table.Th>Precision</Table.Th><Table.Td>{describeSimulationPrecision(view.diagnostics.precision)}</Table.Td></Table.Tr>
                            <Table.Tr><Table.Th>Diagnostic sample</Table.Th><Table.Td>{view.diagnostics.samples} ({view.diagnostics.sampleUnit === "completed-logical-round" ? "completed paid rounds" : "accepted spins"})</Table.Td></Table.Tr>
                            <Table.Tr><Table.Th>Combined 95% interval half-width</Table.Th><Table.Td>{view.diagnostics.achievedRtpHalfWidth === null ? "unavailable" : `${(view.diagnostics.achievedRtpHalfWidth * 100).toFixed(2)} pp`}</Table.Td></Table.Tr>
                        </>}
                    </Table.Tbody>
                </Table>
                <div className="studio-simulation-diagnostics">
                    {describeSimulationDiagnostics(view, false).slice(1, 2).map(line => <Text size="sm" key={line}>{line}</Text>)}
                    {view.sampling && <Text size="sm">Independent session per worker. Monetary totals include every observed play, including free-game spins.</Text>}
                </div>
            </AdvancedDisclosure>

            <AdvancedDisclosure label="analytical tables and feature detail">
                <SimulationAnalyticsDisplay analytics={view.analytics} />

                {view.jackpot && <PageSection legend="Jackpots">
                    <Text>Awards: {view.jackpot.awardCount}; awarded: {view.jackpot.totalAwarded}; contributed: {view.jackpot.totalContributed}</Text>
                    <Text>Jackpot RTP contribution: {(view.jackpot.contribution * 100).toFixed(4)}% of actual stake {view.totalBet}</Text>
                    <Text size="sm">Authored accumulating pools are local to each simulation session/worker. Fixed-pool contributions are statistics, not balance growth.</Text>
                    <Table.ScrollContainer minWidth={560}><Table><Table.Thead><Table.Tr>{["Pool", "Awards", "Awarded", "Contributed", "RTP contribution"].map(label => <Table.Th key={label}>{label}</Table.Th>)}</Table.Tr></Table.Thead>
                        <Table.Tbody>{Object.entries(view.jackpot.pools).map(([id, pool]) => <Table.Tr key={id}><Table.Td>{id}</Table.Td><Table.Td>{pool.awardCount}</Table.Td><Table.Td>{pool.totalAwarded}</Table.Td><Table.Td>{pool.totalContributed}</Table.Td><Table.Td>{(pool.contribution * 100).toFixed(4)}%</Table.Td></Table.Tr>)}</Table.Tbody></Table></Table.ScrollContainer>
                </PageSection>}
                {view.workerSeedStrategy && <Text>Parallel seed strategy: {view.workerSeedStrategy}. Independent feature trajectory and session-local jackpot per worker.</Text>}
                {view.modifiers && <PageSection legend="Screen modifiers">Executed steps: {view.modifiers.steps}; rule applications: {view.modifiers.ruleApplications}; sticky steps: {view.modifiers.stickySteps}; multiplied components: {view.modifiers.multipliedComponents}</PageSection>}
                {view.weightedBonus && <PageSection legend={`Weighted bonus ${view.weightedBonus.tableId}`}>
                    <Text>{view.weightedBonus.selections} eligible selections; {view.weightedBonus.completed} completed; {view.weightedBonus.incomplete} incomplete net of carried tails. Actual frequency = count / eligible selections.</Text>
                    <Table.ScrollContainer minWidth={560}><Table><Table.Thead><Table.Tr>{["Outcome ID", "Weight", "Configured probability", "Count", "Actual frequency", "Coverage"].map(label => <Table.Th key={label}>{label}</Table.Th>)}</Table.Tr></Table.Thead>
                        <Table.Tbody>{view.weightedBonus.outcomes.map(o => <Table.Tr key={o.id}><Table.Td>{o.id}</Table.Td><Table.Td>{o.weight}</Table.Td><Table.Td>{o.probability}</Table.Td><Table.Td>{o.count}</Table.Td><Table.Td>{o.frequency}</Table.Td><Table.Td>{describeWeightedBonusCoverage(o.weight, o.uncovered)}</Table.Td></Table.Tr>)}</Table.Tbody>
                    </Table></Table.ScrollContainer>
                </PageSection>}
                {view.reelSequences?.map(reel => <PageSection key={reel.reelIndex} legend={`Weighted reel ${reel.reelIndex + 1}`}>
                    <Text>{reel.context}: {reel.selections} selections</Text>
                    <Text size="sm">Observed frequency = count / selections.</Text>
                    <Table.ScrollContainer minWidth={560}><Table><Table.Thead><Table.Tr>{["Variant ID", "Weight", "Probability", "Count", "Frequency", "Coverage"].map(label => <Table.Th key={label}>{label}</Table.Th>)}</Table.Tr></Table.Thead>
                        <Table.Tbody>{reel.variants.map(variant => <Table.Tr key={variant.id}>
                            <Table.Td>{variant.id}</Table.Td><Table.Td>{variant.weight}</Table.Td><Table.Td>{variant.probability === 0 && variant.weight > 0 ? `${variant.probabilityRatio?.numerator}/${variant.probabilityRatio?.denominator}` : variant.probability}</Table.Td><Table.Td>{variant.count}</Table.Td><Table.Td>{variant.frequency}</Table.Td><Table.Td>{describeSequenceVariantCoverage(variant.weight, variant.uncovered)}</Table.Td>
                        </Table.Tr>)}</Table.Tbody></Table></Table.ScrollContainer>
                </PageSection>)}

                {view.breakdown && view.breakdown.length > 0 && (
                    <PageSection legend="Breakdown">
                        <Table.ScrollContainer minWidth={500}>
                            <Table>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Category</Table.Th>
                                        <Table.Th>Samples</Table.Th>
                                        <Table.Th>RTP</Table.Th>
                                        <Table.Th>Contribution</Table.Th>
                                        <Table.Th>Hit freq.</Table.Th>
                                        <Table.Th>Largest observed win (× bet)</Table.Th>
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
                        <Text size="xs" c="dimmed">Base rows count paid rounds; feature rows count feature spins. These sample counts are not additive as rounds.</Text>
                    </PageSection>
                )}

                {view.payoutHistogram && Object.keys(view.payoutHistogram).length > 0 && (
                    <AdvancedDisclosure detail="payout histogram">
                        <Text size="sm">
                            Completed-paid-round sample population above. Payout multiples are relative to the bet; labels are half-open [a, b),
                            with (0, 1) for positive payouts below one and [1,000, ∞) for the top bucket. Legacy labels are marked (legacy).
                            Counts are paid rounds.
                        </Text>
                        <Table.ScrollContainer minWidth={300}>
                            <Table>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Payout bucket (× bet)</Table.Th>
                                        <Table.Th>Paid rounds</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {payoutHistogramRows(view.payoutHistogram).map((row) => (
                                        <Table.Tr key={row.bucket}>
                                            <Table.Td>{row.label}</Table.Td>
                                            <Table.Td>{row.rounds}</Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        </Table.ScrollContainer>
                    </AdvancedDisclosure>
                )}

            </AdvancedDisclosure>

            <AdvancedDisclosure label="run identity and accounting">
                <PageSection legend="Run identity and accounting">
                    <Table aria-label="Run identity and accounting"><Table.Tbody>
                        <Table.Tr>
                            <Table.Th>Game</Table.Th>
                            <Table.Td style={{overflowWrap: "anywhere"}}>
                                {view.game.name} (id: &quot;{view.game.id}&quot;, v{view.game.version})
                            </Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                            <Table.Th>Requested spins</Table.Th>
                            <Table.Td>{view.requestedRounds}</Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                            <Table.Th>Completed paid rounds</Table.Th>
                            <Table.Td>{view.rounds}</Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                            <Table.Th>Seed</Table.Th>
                            <Table.Td>{view.seed ?? "(none — not reproducible)"}</Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                            <Table.Th>Total bet</Table.Th>
                            <Table.Td>{view.totalBet.toFixed(2)}</Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                            <Table.Th>Total payout</Table.Th>
                            <Table.Td>{view.totalWin.toFixed(2)}</Table.Td>
                        </Table.Tr>
                        <Table.Tr><Table.Th>Parallel workers</Table.Th><Table.Td>{view.workers}</Table.Td></Table.Tr>
                    </Table.Tbody></Table>
                    {(view.reproducibilityCommand !== undefined || view.configHash !== undefined || view.pokieVersion !== undefined) && (
                        <details className="studio-run-reproduction">
                            <summary>Reproduce this run</summary>
                            <dl>
                                {view.reproducibilityCommand !== undefined && <><dt>Command</dt><dd><code>{view.reproducibilityCommand}</code></dd></>}
                                {view.configHash !== undefined && <><dt>Model/config hash</dt><dd><code>{view.configHash}</code></dd></>}
                                {view.pokieVersion !== undefined && <><dt>POKIE/runtime</dt><dd>{view.pokieVersion}</dd></>}
                            </dl>
                        </details>
                    )}
                </PageSection>
            </AdvancedDisclosure>
        </div>
    );
}
