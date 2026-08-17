import {Alert, Table, Text} from "@mantine/core";
import {IconCircleCheck} from "@tabler/icons-react";
import {useState} from "react";
import type {StudioRuntimeSessionView} from "../../api/types";
import {describeRoundArtifact} from "../../domain/interpret/Replay";
import {describeRuntimeScreen, extractAdditionalRoundFields} from "../../domain/interpret/Runtime";
import {AdvancedDisclosure} from "./AdvancedDisclosure";
import {CodeBlock} from "./CodeBlock";
import {GameScreenView} from "./GameScreenView";
import {PageSection} from "./PageSection";
import {RoundArtifactInspector} from "./RoundArtifactInspector";
import {RoundWinsTable} from "./RoundWinsTable";
import {FeatureStateView} from "./FeatureStateView";
import {describeRoundPresentation} from "./roundPresentation";

function formatFieldValue(value: unknown): string {
    if (typeof value === "string") {
        return value;
    }
    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    if (value === null || value === undefined) {
        return "—";
    }
    return JSON.stringify(value);
}

// The shared "readable round" view for any surface that has a live StudioRuntimeSessionView to show --
// currently the Play tab, but common (not page-local) so any other surface that gains one renders the
// same balance/bet/win/screen breakdown. Whenever this exact round's session captured a full
// RoundArtifact (`debug.artifact` -- only present once debug mode is on and the session supports
// building one, see StudioRuntimeSessionView's own doc comment), this delegates entirely to
// RoundArtifactInspector -- the same screen/wins/positions/feature-event/state-snapshot presentation
// Replay's own recorded/recreated/simulation-sampled rounds already render through, rather than a
// bespoke, less detailed view of the same round. Falls back to a flat balance/bet/win/screen table (with
// a generic "Additional round data" table for whatever extra public fields the game's own serializer
// returned -- see extractAdditionalRoundFields's own doc comment) only when no artifact was captured
// (debug mode off, or a non-video-slot session that never builds one).
export function RoundSummary({session}: {session: StudioRuntimeSessionView}) {
    const [artifactInspectorOpen, setArtifactInspectorOpen] = useState(false);
    if (session.debug?.artifact) {
        const artifact = describeRoundArtifact(session.debug.artifact);
        const presentation = describeRoundPresentation(session.debug.stateBefore, session.debug.stateAfter, artifact.betMode);
        return (
            <div>
                {artifact.totalWin > 0 ? (
                    <Alert color="green" variant="light" icon={<IconCircleCheck size={16} />} title="Round complete" mb="md">
                        You won {artifact.totalWin.toFixed(2)}.
                    </Alert>
                ) : (
                    <Text size="sm" c="dimmed" mb="md">
                        Round complete — no win this round.
                    </Text>
                )}

                {/* The player-facing result is first: static configuration comes from the captured
                    session/Game Model, balance from the session, and this round's screen/wins/mode from
                    the immutable RoundArtifact.  The full inspector remains available below without
                    displacing normal play behind provenance or JSON. */}
                <GameScreenView
                    screen={artifact.screen}
                    wins={artifact.wins}
                    credits={session.credits}
                    totalWin={artifact.totalWin}
                    payoutMultiplier={artifact.payoutMultiplier}
                    paytable={presentation.paytable}
                    featureCounters={presentation.featureCounters}
                    lines={presentation.lines}
                    availableBets={presentation.availableBets}
                    currentBet={presentation.currentBet ?? artifact.stake}
                    availableModeIds={presentation.availableModeIds}
                    currentModeId={presentation.currentModeId}
                />
                <FeatureStateView events={artifact.featureEvents ?? []} />
                <RoundWinsTable wins={artifact.wins} stake={artifact.stake} />

                <details onToggle={(event) => setArtifactInspectorOpen(event.currentTarget.open)}>
                    <summary>Inspect round artifact</summary>
                    {artifactInspectorOpen && (
                        <RoundArtifactInspector
                            artifact={artifact}
                            credits={session.credits}
                            stateBefore={session.debug.stateBefore}
                            stateAfter={session.debug.stateAfter}
                        />
                    )}
                </details>
            </div>
        );
    }

    // studioRequestId/studioRound/studioRecordedAt/studioSource/studioOperation/studioProjectRoot/
    // studioSeed are all Studio's own bookkeeping (see StudioRuntimeSessionView's own doc comment), never
    // part of the game's actual public response -- excluded here alongside `debug` so "Public response"
    // stays an honest dump of what the game server itself returned.
    const {
        debug,
        studioRequestId: _studioRequestId,
        studioRound: _studioRound,
        studioRecordedAt: _studioRecordedAt,
        studioSource: _studioSource,
        studioOperation: _studioOperation,
        studioProjectRoot: _studioProjectRoot,
        studioSeed: _studioSeed,
        ...publicFields
    } = session;
    const additional = extractAdditionalRoundFields(session);
    const hasAdditional = Object.keys(additional).length > 0;

    return (
        <div>
            {session.win !== undefined && session.win > 0 ? (
                <Alert color="green" variant="light" icon={<IconCircleCheck size={16} />} title="Round complete" mb="md">
                    You won {session.win.toFixed(2)}.
                </Alert>
            ) : (
                <Text size="sm" c="dimmed" mb="md">
                    Round complete — no win this round.
                </Text>
            )}

            <Table withRowBorders={false} mb="sm">
                <Table.Tbody>
                    <Table.Tr>
                        <Table.Th>Session id</Table.Th>
                        <Table.Td style={{overflowWrap: "anywhere"}}>{session.sessionId}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Round</Table.Th>
                        <Table.Td>{session.studioRound ?? "—"}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Bet</Table.Th>
                        <Table.Td>{session.bet !== undefined ? session.bet.toFixed(2) : "—"}</Table.Td>
                    </Table.Tr>
                </Table.Tbody>
            </Table>

            {session.screen && (
                <GameScreenView
                    screen={describeRuntimeScreen(session.screen) ?? []}
                    credits={session.credits}
                    totalWin={session.win}
                    payoutMultiplier={session.win !== undefined && session.bet !== undefined && session.bet !== 0 ? session.win / session.bet : undefined}
                />
            )}

            {hasAdditional && (
                <PageSection legend="Additional round data">
                    <Table withRowBorders={false}>
                        <Table.Tbody>
                            {Object.entries(additional).map(([key, value]) => (
                                <Table.Tr key={key}>
                                    <Table.Th>{key}</Table.Th>
                                    <Table.Td style={{overflowWrap: "anywhere"}}>{formatFieldValue(value)}</Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </PageSection>
            )}

            <AdvancedDisclosure detail="raw JSON, debug data">
                <Text size="sm" fw={600} mb={4}>
                    Public response
                </Text>
                <CodeBlock>{JSON.stringify(publicFields, null, 2)}</CodeBlock>
                <Text size="sm" fw={600} mt="sm" mb={4}>
                    Debug response
                </Text>
                {debug === undefined ? (
                    <Text size="sm" c="dimmed">
                        No internal/debug data was captured for this round.
                    </Text>
                ) : (
                    <CodeBlock>{JSON.stringify(debug, null, 2)}</CodeBlock>
                )}
            </AdvancedDisclosure>
        </div>
    );
}
