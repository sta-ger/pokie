import {Alert, Anchor, Badge, Button, Group, List, Table, Text} from "@mantine/core";
import {useDisclosure} from "@mantine/hooks";
import {IconAlertTriangle, IconCircleCheck, IconInfoCircle} from "@tabler/icons-react";
import {useState, type ReactNode} from "react";
import type {ComparisonDimensionResult, ReplayComparisonDimensions, ReplayComparisonView, RoundArtifactDisplayView} from "../../domain/interpret/Replay";
import {CodeBlock} from "./CodeBlock";
import {PageSection} from "./PageSection";
import {QuickActions} from "./QuickActions";
import {ScreenTable} from "./ScreenTable";

const DIMENSION_LABELS: Record<keyof ReplayComparisonDimensions, string> = {
    screen: "Visible screen",
    wins: "Wins",
    totalPayout: "Total payout",
    steps: "Round steps",
    featureEvents: "Feature events",
    state: "State transition",
    rngReelStops: "RNG / reel stops",
};

const COMPARISON_BANNER: Record<ReplayComparisonView["status"], {color: string; icon: ReactNode; title: string}> = {
    match: {color: "green", icon: <IconCircleCheck size={16} />, title: "Matches the expected result"},
    mismatch: {color: "red", icon: <IconAlertTriangle size={16} />, title: "Differs from the expected result"},
    partial: {color: "yellow", icon: <IconAlertTriangle size={16} />, title: "Partially compared against the expected result"},
    unavailable: {color: "blue", icon: <IconInfoCircle size={16} />, title: "Comparison unavailable"},
};

function describeDimensionResult(dimension: ComparisonDimensionResult): string {
    if (dimension.status === "match") {
        return "match";
    }
    if (dimension.status === "mismatch") {
        return dimension.detail;
    }
    return `unavailable — ${dimension.reason}`;
}

// The Inspect step's core view: provenance, screen, a step navigator (each step shows its own wins and
// feature events inline as you page through it -- satisfies "navigate between steps and related
// events" without a separate cross-reference index), a match/mismatch verdict when there's a known
// "expected" artifact to compare against, and Advanced details (raw JSON, closed by default) for
// anything technical -- including wherever a game chose to put RNG/reel-stop data, since RoundArtifact's
// own `debug` field is a free-form, per-game-opt-in bag, never a guaranteed structure.
export function RoundArtifactInspector({
    artifact,
    comparison,
    stateBefore,
    stateAfter,
}: {
    artifact: RoundArtifactDisplayView;
    comparison?: ReplayComparisonView;
    stateBefore?: unknown;
    stateAfter?: unknown;
}) {
    const [stepIndex, setStepIndex] = useState(0);
    const [advancedOpened, {toggle: toggleAdvanced}] = useDisclosure(false);

    const step = artifact.steps[stepIndex] ?? artifact.steps[0];
    const hasMultipleSteps = artifact.steps.length > 1;

    return (
        <div>
            {comparison && (
                <Alert
                    color={COMPARISON_BANNER[comparison.status].color}
                    variant="light"
                    icon={COMPARISON_BANNER[comparison.status].icon}
                    title={COMPARISON_BANNER[comparison.status].title}
                    mb="md"
                >
                    {comparison.status === "unavailable" ? (
                        <Text size="sm">{comparison.unavailableReason}</Text>
                    ) : (
                        <List size="sm" spacing={2}>
                            {(Object.keys(comparison.dimensions) as (keyof ReplayComparisonDimensions)[]).map((key) => (
                                <List.Item key={key}>
                                    <Text span fw={600}>
                                        {DIMENSION_LABELS[key]}:
                                    </Text>{" "}
                                    {describeDimensionResult(comparison.dimensions[key])}
                                </List.Item>
                            ))}
                        </List>
                    )}
                </Alert>
            )}

            <Table withRowBorders={false} mb="sm">
                <Table.Tbody>
                    <Table.Tr>
                        <Table.Th>Game</Table.Th>
                        <Table.Td style={{overflowWrap: "anywhere"}}>
                            {artifact.provenance.game.name} (id: &quot;{artifact.provenance.game.id}&quot;, v{artifact.provenance.game.version})
                        </Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Pokie version</Table.Th>
                        <Table.Td>{artifact.provenance.pokieVersion}</Table.Td>
                    </Table.Tr>
                    {artifact.provenance.configHash && (
                        <Table.Tr>
                            <Table.Th>Config hash</Table.Th>
                            <Table.Td style={{overflowWrap: "anywhere"}}>{artifact.provenance.configHash}</Table.Td>
                        </Table.Tr>
                    )}
                    <Table.Tr>
                        <Table.Th>Bet mode</Table.Th>
                        <Table.Td>{artifact.betMode}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Stake</Table.Th>
                        <Table.Td>{artifact.stake.toFixed(2)}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Total win</Table.Th>
                        <Table.Td>
                            {artifact.totalWin.toFixed(2)} ({artifact.payoutMultiplier.toFixed(2)}x)
                        </Table.Td>
                    </Table.Tr>
                </Table.Tbody>
            </Table>

            <ScreenTable screen={artifact.screen} />

            <PageSection legend={hasMultipleSteps ? `Step ${stepIndex + 1} of ${artifact.steps.length}` : "Round detail"}>
                {hasMultipleSteps && (
                    <QuickActions>
                        <Button variant="default" size="xs" disabled={stepIndex === 0} onClick={() => setStepIndex((index) => index - 1)}>
                            Previous step
                        </Button>
                        <Button
                            variant="default"
                            size="xs"
                            disabled={stepIndex === artifact.steps.length - 1}
                            onClick={() => setStepIndex((index) => index + 1)}
                        >
                            Next step
                        </Button>
                    </QuickActions>
                )}

                {hasMultipleSteps && <ScreenTable screen={step.screen} />}

                {step.wins.length === 0 ? (
                    <Text size="sm" c="dimmed" mt="sm">
                        No wins on this step.
                    </Text>
                ) : (
                    <Table.ScrollContainer minWidth={500} mt="sm">
                        <Table>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Type</Table.Th>
                                    <Table.Th>Symbol</Table.Th>
                                    <Table.Th>Amount</Table.Th>
                                    <Table.Th>Positions</Table.Th>
                                    <Table.Th>Multiplier</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {step.wins.map((win) => (
                                    <Table.Tr key={win.id}>
                                        <Table.Td>{win.type}</Table.Td>
                                        <Table.Td>{String(win.symbolId)}</Table.Td>
                                        <Table.Td>{win.winAmount.toFixed(2)}</Table.Td>
                                        <Table.Td>{win.winningPositions.length}</Table.Td>
                                        <Table.Td>
                                            {win.multiplierBreakdown.length === 0
                                                ? "—"
                                                : win.multiplierBreakdown.map((breakdown) => `${breakdown.source} ×${breakdown.combinedMultiplier}`).join(", ")}
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                )}

                {step.featureEvents && step.featureEvents.length > 0 && (
                    <div>
                        <Text size="sm" fw={600} mt="sm">
                            Feature events
                        </Text>
                        <List size="sm">
                            {step.featureEvents.map((event, index) => (
                                <List.Item key={index}>{event.type}</List.Item>
                            ))}
                        </List>
                    </div>
                )}
            </PageSection>

            <PageSection legend="State before / after">
                {stateBefore === undefined && stateAfter === undefined && (
                    <Text size="sm" c="dimmed">
                        State snapshot unavailable for this game/session type.
                    </Text>
                )}
                {stateBefore !== undefined && (
                    <div>
                        <Text size="sm" fw={600} mb={4}>
                            Before
                        </Text>
                        <CodeBlock>{JSON.stringify(stateBefore, null, 2)}</CodeBlock>
                    </div>
                )}
                {stateAfter !== undefined && (
                    <div>
                        <Text size="sm" fw={600} mt="sm" mb={4}>
                            After
                        </Text>
                        <CodeBlock>{JSON.stringify(stateAfter, null, 2)}</CodeBlock>
                    </div>
                )}
            </PageSection>

            <Text size="sm" mt="sm">
                <Anchor component="button" type="button" onClick={toggleAdvanced}>
                    {advancedOpened ? "Hide" : "Show"} advanced details (raw JSON, debug data)
                </Anchor>
            </Text>
            {advancedOpened && (
                <PageSection legend="Advanced details">
                    {artifact.debug && (
                        <div>
                            <Group gap="xs" mb={4}>
                                <Text size="sm" fw={600}>
                                    Debug data
                                </Text>
                                <Badge size="xs" variant="light">
                                    game-provided, may include RNG/reel-stop data
                                </Badge>
                            </Group>
                            <CodeBlock>{JSON.stringify(artifact.debug, null, 2)}</CodeBlock>
                        </div>
                    )}
                    <Text size="sm" fw={600} mt="sm" mb={4}>
                        Full artifact
                    </Text>
                    <CodeBlock>{JSON.stringify(artifact, null, 2)}</CodeBlock>
                </PageSection>
            )}
        </div>
    );
}
