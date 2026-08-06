import {Table} from "@mantine/core";
import type {RoundArtifactDisplayView} from "../../domain/interpret/Replay";

// The shared round-level "what game, what was staked, what it paid out" summary -- game/pokie
// version/config hash provenance, bet mode, stake, and total win/payout multiplier, straight from the
// round's own RoundArtifactDisplayView, plus wallet credits when a live session actually has a balance to
// show alongside it (see the `credits` doc comment below). Every round-inspection surface's own header
// table, extracted so no consumer hand-rolls its own copy of the same rows.
export function RoundDetailsTable({
    artifact,
    credits,
}: {
    artifact: RoundArtifactDisplayView;
    // Wallet credits immediately after this round -- a session-level concept, not part of RoundArtifact
    // itself (an artifact records one round's own outcome, never the wallet balance around it), so this
    // is only ever supplied by a caller that actually has a live session to read it from (Session Spin).
    // Undefined elsewhere, in which case the row is simply omitted rather than shown as "0" or "unknown".
    credits?: number;
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
                <Table.Tr>
                    <Table.Th>Total win</Table.Th>
                    <Table.Td>
                        {artifact.totalWin.toFixed(2)} ({artifact.payoutMultiplier.toFixed(2)}x)
                    </Table.Td>
                </Table.Tr>
                {credits !== undefined && (
                    <Table.Tr>
                        <Table.Th>Credits</Table.Th>
                        <Table.Td>{credits}</Table.Td>
                    </Table.Tr>
                )}
            </Table.Tbody>
        </Table>
    );
}
