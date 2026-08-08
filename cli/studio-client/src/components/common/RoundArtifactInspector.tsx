import {Alert, Badge, Button, Group, List, Table, Text} from "@mantine/core";
import {IconAlertTriangle, IconCircleCheck, IconInfoCircle} from "@tabler/icons-react";
import {useState, type ReactNode} from "react";
import type {ComparisonDimensionResult, ReplayComparisonDimensions, ReplayComparisonView, RoundArtifactDisplayView} from "../../domain/interpret/Replay";
import {AdvancedDisclosure} from "./AdvancedDisclosure";
import {CodeBlock} from "./CodeBlock";
import {FeatureStateView} from "./FeatureStateView";
import {GameScreenView} from "./GameScreenView";
import {PageSection} from "./PageSection";
import {type PaytableData, PaytableView} from "./PaytableView";
import {QuickActions} from "./QuickActions";
import {RoundDetailsTable} from "./RoundDetailsTable";
import {RoundWinsTable} from "./RoundWinsTable";

const DIMENSION_LABELS: Record<keyof ReplayComparisonDimensions, string> = {
    screen: "Visible screen",
    wins: "Wins",
    totalPayout: "Total payout",
    steps: "Round steps",
    featureEvents: "Feature events",
    state: "State transition",
    rngReelStops: "RNG / reel stops",
};

// Shown alongside every dimension's result, match or not -- a reader deciding how much weight to put on
// one dimension being unavailable (e.g. rngReelStops, which is only ever best-effort) needs to know what
// that dimension actually stands for, not just its label.
const DIMENSION_WHY_IT_MATTERS: Record<keyof ReplayComparisonDimensions, string> = {
    screen: "The visible symbols are what the player actually saw -- a difference means the recreated round landed a different outcome.",
    wins: "Wins are what turns the outcome into a payout -- a difference here means credits would be awarded differently.",
    totalPayout: "The round's bottom-line payout is the one number that reaches the player's balance.",
    steps: "Round steps capture cascades/re-spins/free-game progression -- a difference means the round played out differently even if the final screen and total payout happen to match.",
    featureEvents: "Feature events (free spins triggered, bonus entered, ...) drive what happens in later rounds -- a difference here can change downstream game state without changing this round's payout.",
    state: "The session state transition is what every subsequent round is computed from -- a difference here would silently affect every round that follows, not just this one.",
    rngReelStops: "The underlying RNG/reel-stop trace is the actual source of the outcome -- matching it, when it's recorded at all, is the strongest evidence the recreation is faithful rather than coincidentally similar.",
};

// Four distinct titles, one per describeReplayComparison outcome -- "incomplete" (some dimensions
// simply weren't recorded on one side) is deliberately never worded like a real result mismatch, and
// "exact comparison unavailable" (neither side has enough to compare on any dimension at all) is
// deliberately never worded like either a match or a difference actually being found.
const COMPARISON_BANNER: Record<ReplayComparisonView["status"], {color: string; icon: ReactNode; title: string}> = {
    match: {color: "green", icon: <IconCircleCheck size={16} />, title: "Match -- recorded and recreated results agree"},
    mismatch: {color: "red", icon: <IconAlertTriangle size={16} />, title: "Difference -- recorded and recreated results disagree"},
    partial: {
        color: "yellow",
        icon: <IconAlertTriangle size={16} />,
        title: "Incomplete comparison -- every available dimension agrees, but some couldn't be checked",
    },
    unavailable: {color: "blue", icon: <IconInfoCircle size={16} />, title: "Exact comparison unavailable"},
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
    credits,
    paytable,
}: {
    artifact: RoundArtifactDisplayView;
    comparison?: ReplayComparisonView;
    stateBefore?: unknown;
    stateAfter?: unknown;
    // Wallet credits immediately after this round -- a session-level concept, not part of RoundArtifact
    // itself (an artifact records one round's own outcome, never the wallet balance around it), so this
    // is only ever supplied by a caller that actually has a live session to read it from (Session Spin).
    // Undefined elsewhere, in which case the row is simply omitted rather than shown as "0" or "unknown".
    credits?: number;
    // The game's own payout table -- same story as `credits`: not part of RoundArtifact itself (see
    // PaytableView's own doc comment), only ever suppliable by a caller that has one independently. No
    // current caller does (Play/Replay/Outcome Source never fetch a blueprint alongside a round), so
    // this is always undefined today and PaytableView renders its own explicit "unavailable" state --
    // this prop exists so a future caller that does have one doesn't need RoundArtifactInspector itself
    // to change.
    paytable?: PaytableData;
}) {
    const [stepIndex, setStepIndex] = useState(0);

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
                    {/* What's actually being compared -- named and dated on both sides -- shown regardless of
                        `status`, including "unavailable", so a reader can see exactly what each side is before
                        being told why they couldn't be checked against each other. */}
                    <Table withRowBorders={false} mb="sm">
                        <Table.Tbody>
                            {[comparison.recorded, comparison.recreated].map((side) => (
                                <Table.Tr key={side.role}>
                                    <Table.Th>{side.label}</Table.Th>
                                    <Table.Td style={{overflowWrap: "anywhere"}}>
                                        {side.identities} · seed {side.seed} · {side.versionHash} · {side.timestamp} · {side.completeness}
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>

                    {comparison.status === "unavailable" ? (
                        <Text size="sm">{comparison.unavailableReason}</Text>
                    ) : (
                        <List size="sm" spacing={4}>
                            {(Object.keys(comparison.dimensions) as (keyof ReplayComparisonDimensions)[]).map((key) => (
                                <List.Item key={key}>
                                    <Text span fw={600}>
                                        {DIMENSION_LABELS[key]}:
                                    </Text>{" "}
                                    {describeDimensionResult(comparison.dimensions[key])}
                                    <Text size="xs" c="dimmed">
                                        {DIMENSION_WHY_IT_MATTERS[key]}
                                    </Text>
                                </List.Item>
                            ))}
                        </List>
                    )}
                </Alert>
            )}

            <RoundDetailsTable artifact={artifact} credits={credits} />

            <GameScreenView screen={artifact.screen} wins={artifact.wins} />

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

                {hasMultipleSteps && <GameScreenView screen={step.screen} wins={step.wins} />}

                <RoundWinsTable wins={step.wins} stake={artifact.stake} />

                <FeatureStateView events={step.featureEvents ?? []} />
            </PageSection>

            <PageSection legend="Paytable">
                <PaytableView paytable={paytable} />
            </PageSection>

            <PageSection legend="State before / after">
                {stateBefore === undefined && stateAfter === undefined ? (
                    <Text size="sm" c="dimmed">
                        State snapshot unavailable for this game/session type.
                    </Text>
                ) : (
                    <Text size="sm">Snapshot captured for this round — see Advanced details for the full before/after state.</Text>
                )}
            </PageSection>

            <AdvancedDisclosure detail="raw JSON, debug data">
                {(stateBefore !== undefined || stateAfter !== undefined) && (
                    <div>
                        {stateBefore !== undefined && (
                            <div>
                                <Text size="sm" fw={600} mb={4}>
                                    State before
                                </Text>
                                <CodeBlock>{JSON.stringify(stateBefore, null, 2)}</CodeBlock>
                            </div>
                        )}
                        {stateAfter !== undefined && (
                            <div>
                                <Text size="sm" fw={600} mt="sm" mb={4}>
                                    State after
                                </Text>
                                <CodeBlock>{JSON.stringify(stateAfter, null, 2)}</CodeBlock>
                            </div>
                        )}
                    </div>
                )}
                {artifact.debug && (
                    <div>
                        <Group gap="xs" mb={4} mt={stateBefore !== undefined || stateAfter !== undefined ? "sm" : undefined}>
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
            </AdvancedDisclosure>
        </div>
    );
}
