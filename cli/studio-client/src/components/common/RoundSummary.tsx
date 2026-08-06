import {Alert, Table, Text} from "@mantine/core";
import {IconCircleCheck} from "@tabler/icons-react";
import type {StudioRuntimeSessionView} from "../../api/types";
import {describeRuntimeScreen, extractAdditionalRoundFields} from "../../domain/interpret/Runtime";
import {AdvancedDisclosure} from "./AdvancedDisclosure";
import {CodeBlock} from "./CodeBlock";
import {PageSection} from "./PageSection";
import {ScreenTable} from "./ScreenTable";

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
// currently Runtime's own Inspect panel, but common (not page-local) so any other surface that gains one
// renders the same balance/bet/win/screen breakdown, the same generic "Additional round data" table for
// whatever extra public fields the game's own serializer returned (see extractAdditionalRoundFields's own
// doc comment for why that's the entire "feature progress" story for a live session), and the same raw
// public/internal JSON tucked behind Advanced details -- the same convention RoundArtifactInspector uses
// for a RoundArtifact, the other "round" shape this client renders.
export function RoundSummary({session}: {session: StudioRuntimeSessionView}) {
    // studioRequestId/studioRound/studioRecordedAt/studioSource are all Studio's own bookkeeping (see
    // StudioRuntimeSessionView's own doc comment), never part of the game's actual public response --
    // excluded here alongside `debug` so "Public response" stays an honest dump of what the game server
    // itself returned.
    const {
        debug,
        studioRequestId: _studioRequestId,
        studioRound: _studioRound,
        studioRecordedAt: _studioRecordedAt,
        studioSource: _studioSource,
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
                        <Table.Th>Credits</Table.Th>
                        <Table.Td>{session.credits.toFixed(2)}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Bet</Table.Th>
                        <Table.Td>{session.bet !== undefined ? session.bet.toFixed(2) : "—"}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                        <Table.Th>Win</Table.Th>
                        <Table.Td>{session.win !== undefined ? session.win.toFixed(2) : "—"}</Table.Td>
                    </Table.Tr>
                </Table.Tbody>
            </Table>

            {session.screen && <ScreenTable screen={describeRuntimeScreen(session.screen) ?? []} />}

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
                        Debug mode is disabled for this runtime — restart it with debug mode on to see internal/debug data.
                    </Text>
                ) : (
                    <CodeBlock>{JSON.stringify(debug, null, 2)}</CodeBlock>
                )}
            </AdvancedDisclosure>
        </div>
    );
}
