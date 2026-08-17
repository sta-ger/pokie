import {Table} from "@mantine/core";
import type {RoundArtifactDisplayView} from "../../domain/interpret/Replay";

// The shared round-level "what game, what was staked, what it paid out" summary -- game/pokie
// version/config hash provenance, bet mode, and stake, straight from the round's own
// RoundArtifactDisplayView. The canonical Player directly below owns the player-facing balance and
// total-win/multiple output, so every round-inspection surface keeps those values on the same path as
// its screen and individual wins.
export function RoundDetailsTable({
    artifact,
}: {
    artifact: RoundArtifactDisplayView;
}) {
    return (
        <Table withRowBorders={false} mb="sm">
            <Table.Tbody>
                <Table.Tr>
                    <Table.Th>Game</Table.Th>
                    <Table.Td style={{overflowWrap: "anywhere"}}>
                        {artifact.provenance.game
                            ? `${artifact.provenance.game.name} (id: "${artifact.provenance.game.id}", v${artifact.provenance.game.version})`
                            : "Unavailable -- this artifact has no recorded game id/version provenance."}
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
            </Table.Tbody>
        </Table>
    );
}
