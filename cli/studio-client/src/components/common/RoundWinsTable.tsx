import {Badge, Table, Text} from "@mantine/core";
import type {RoundArtifactWin} from "../../api/types";

// Mirrors src/stakeengine/internal/StakeEngineImportSyntheticWinComponent.ts's own constant (documented in
// docs/stake-engine-import.md) — the one field this whole client can key off to tell a reconstructed win
// apart from a real one, since it's part of RoundArtifact's own public JSON contract, not an internal type.
const STAKE_ENGINE_IMPORT_SYNTHETIC_METADATA_KEY = "stakeEngineImportSynthetic";

// A win is only ever "aggregate" (LegacyWinComponent/JackpotWinComponent/the Stake Engine import's own
// synthetic placeholder) when it carries no winningPositions at all -- every real line/scatter/cluster/ways/
// value win always attributes its amount to at least one screen position. Never a type-string check: "value"
// alone can't tell a real ValueWinComponent win apart from an imported placeholder that reuses the same type.
export function isAggregateWin(win: RoundArtifactWin): boolean {
    return win.winningPositions.length === 0;
}

// Mirrors the "x stake" convention artifact.payoutMultiplier already uses for the round-level Total win
// row (and the one src/artifact/RoundArtifactValidator.ts itself applies when deriving
// expectedPayoutMultiplier: stake > 0 ? totalWin / stake : 0) -- a per-win amount alone doesn't say
// whether 5.00 is a big or small win relative to what was staked, so every known amount also states its
// own multiple of stake. When stake is 0 (a validator-legal value -- RoundArtifactValidator only requires
// stake >= 0) a stake-relative unit can't be computed at all, so that's stated explicitly rather than
// silently showing a misleading "0.00x".
function describeWinAmount(win: RoundArtifactWin, stake: number): string {
    if (stake <= 0) {
        return `${win.winAmount.toFixed(2)} (payout unit unavailable — stake is 0)`;
    }
    return `${win.winAmount.toFixed(2)} (${(win.winAmount / stake).toFixed(2)}x stake)`;
}

function describeWinSymbol(win: RoundArtifactWin): string {
    return win.symbolId === undefined || win.symbolId === null ? "no symbol (aggregate win)" : String(win.symbolId);
}

function describeWinPositions(win: RoundArtifactWin): string {
    if (!isAggregateWin(win)) {
        return String(win.winningPositions.length);
    }
    return win.metadata?.[STAKE_ENGINE_IMPORT_SYNTHETIC_METADATA_KEY] === true
        ? "unavailable — reconstructed from an imported round, per-position detail wasn't preserved"
        : "not applicable — an aggregate win, not attributed to specific positions";
}

// The shared "what won, and by how much" presentation every round-inspection surface renders a step's
// wins through -- type/symbol/amount/positions/multiplier, straight from RoundArtifactWin, covering every
// win shape the win-evaluation pipeline actually produces (a real line/scatter/ways/cluster win with real
// positions, a reconstructed Stake Engine import aggregate, a symbol-less jackpot/legacy aggregate) without
// ever falling back to an anonymous placeholder ("0", the literal string "undefined", a bare "—").
export function RoundWinsTable({wins, stake}: {wins: readonly RoundArtifactWin[]; stake: number}) {
    if (wins.length === 0) {
        return (
            <Text size="sm" c="dimmed" mt="sm">
                No wins on this step.
            </Text>
        );
    }

    return (
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
                    {wins.map((win) => (
                        <Table.Tr key={win.id}>
                            <Table.Td>
                                {win.type}
                                {isAggregateWin(win) && (
                                    <Badge ml={4} size="xs" variant="light" color="gray">
                                        aggregate
                                    </Badge>
                                )}
                            </Table.Td>
                            <Table.Td>{describeWinSymbol(win)}</Table.Td>
                            <Table.Td>{describeWinAmount(win, stake)}</Table.Td>
                            <Table.Td>{describeWinPositions(win)}</Table.Td>
                            <Table.Td>
                                {win.multiplierBreakdown.length === 0
                                    ? "not applicable — no multiplier applied to this win"
                                    : win.multiplierBreakdown.map((breakdown) => `${breakdown.source} ×${breakdown.combinedMultiplier}`).join(", ")}
                            </Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
        </Table.ScrollContainer>
    );
}
