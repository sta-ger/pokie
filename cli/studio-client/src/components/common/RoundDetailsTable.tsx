import {Table} from "@mantine/core";
import type {RoundRecordDisplayView} from "../../domain/interpret/Replay";

// The shared round-level "what game, what was staked, what it paid out" summary -- game/pokie
// version/config hash provenance, bet mode, and stake, straight from the round's own
// RoundRecordDisplayView. The canonical Player directly below owns the player-facing balance and
// total-win/multiple output, so every round-inspection surface keeps those values on the same path as
// its screen and individual wins.
export function RoundDetailsTable({
    artifact,
}: {
    artifact: RoundRecordDisplayView;
}) {
    return (
        <Table withRowBorders={false} mb="sm">
            <Table.Tbody>
                <Table.Tr>
                    <Table.Th>Game</Table.Th>
                    <Table.Td style={{overflowWrap: "anywhere"}}>
                        {artifact.origin.game
                            ? `${artifact.origin.game.name} (id: "${artifact.origin.game.id}", v${artifact.origin.game.version})`
                            : "Unavailable -- this round record has no recorded game id/version origin."}
                    </Table.Td>
                </Table.Tr>
                <Table.Tr>
                    <Table.Th>Pokie version</Table.Th>
                    <Table.Td>{artifact.origin.pokieVersion}</Table.Td>
                </Table.Tr>
                {artifact.origin.configHash && (
                    <Table.Tr>
                        <Table.Th>Config hash</Table.Th>
                        <Table.Td style={{overflowWrap: "anywhere"}}>{artifact.origin.configHash}</Table.Td>
                    </Table.Tr>
                )}
                <Table.Tr>
                    <Table.Th>Bet mode</Table.Th>
                    <Table.Td>{artifact.betMode}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                    <Table.Th>Stake</Table.Th>
                    {/* Stakes are game denominations, which can include fractions of a cent. */}
                    <Table.Td>{artifact.stake}</Table.Td>
                </Table.Tr>
            </Table.Tbody>
        </Table>
    );
}
