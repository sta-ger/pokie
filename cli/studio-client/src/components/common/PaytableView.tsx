import {Table, Text} from "@mantine/core";

// Mirrors GameBlueprint.paytable's own shape (src/generated/GameBlueprint.ts) and Paytable.toJSON's own
// per-bet map (src/session/videoslot/paytable/Paytable.ts) collapsed to one bet's own payouts -- symbol id
// -> match count (as a string key, same convention the blueprint's own paytable and PaytableEditor use) ->
// payout.
export type PaytableData = Record<string, Record<string, number>>;

// The shared "symbol -> match count -> payout" presentation for any round-inspection surface that has
// runtime-provided paytable data to show. Nothing in this client derives or recomputes a payout table
// itself: a RoundArtifact (see api/types.ts) only ever records a round's own already-evaluated wins, never
// the payout table those wins were evaluated against, so every current caller (RoundArtifactInspector, and
// through it every surface that renders one) has no paytable to pass and gets this component's own honest
// "unavailable" state below -- never a table silently re-derived from the round's own wins, which would
// only ever show the handful of symbols/counts that happened to win this round, not the game's real
// paytable.
export function PaytableView({paytable}: {paytable?: PaytableData}) {
    const symbolIds = paytable ? Object.keys(paytable) : [];
    if (symbolIds.length === 0) {
        return (
            <Text size="sm" c="dimmed">
                Paytable unavailable — this round&apos;s own artifact records its already-evaluated wins, not the game&apos;s payout table itself.
            </Text>
        );
    }

    const matchCounts = Array.from(new Set(symbolIds.flatMap((symbolId) => Object.keys(paytable![symbolId])))).sort((a, b) => Number(a) - Number(b));

    return (
        <Table.ScrollContainer minWidth={400}>
            <Table withColumnBorders>
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Symbol</Table.Th>
                        {matchCounts.map((matchCount) => (
                            <Table.Th key={matchCount}>{matchCount}×</Table.Th>
                        ))}
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {symbolIds.map((symbolId) => (
                        <Table.Tr key={symbolId}>
                            <Table.Td>{symbolId}</Table.Td>
                            {matchCounts.map((matchCount) => (
                                <Table.Td key={matchCount}>{paytable![symbolId][matchCount] ?? "—"}</Table.Td>
                            ))}
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
        </Table.ScrollContainer>
    );
}
