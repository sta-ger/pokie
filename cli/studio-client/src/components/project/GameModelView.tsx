import {Badge, Group, Table, Text} from "@mantine/core";
import {asStringList} from "../../domain/asStringList";
import {asBetModesList, getFreeGames, getReelGenerationMode, getWinModelMinimumClusterSize, getWinModelType, hasFreeGames, type ReelGenerationMode} from "../../domain/blueprintFormOps";
import {PageSection} from "../common/PageSection";

// Read-only projections over the same loosely-typed GameBlueprint record shape the guided editor
// components (LayoutFieldset, SymbolsTable, PaytableEditor, BetModesEditor, FreeGamesFieldset, ...)
// already read/mutate -- deliberately not a new interpretation of the model, just a display-only slice
// of it, same spirit as asStringList's own doc comment. Reuses blueprintFormOps' own exported read
// accessors (asBetModesList, getWinModelType, getReelGenerationMode, hasFreeGames/getFreeGames) rather
// than re-deriving any of that logic.

function readManifestField(blueprint: Record<string, unknown>, field: string): string | undefined {
    const manifest = blueprint.manifest;
    if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
        return undefined;
    }
    const value = (manifest as Record<string, unknown>)[field];
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

type PaytableRow = {symbolId: string; matchCount: number; payout: number};

// Same flattening as PaytableEditor's own flattenPaytable -- kept as its own tiny copy here rather than
// shared, same convention blueprintFormOps' private asPaytable and PaytableEditor's flattenPaytable
// already follow for a read vs. mutate variant of the same shape.
function flattenPaytable(value: unknown): PaytableRow[] {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return [];
    }
    const rows: PaytableRow[] = [];
    for (const [symbolId, payouts] of Object.entries(value as Record<string, unknown>)) {
        if (typeof payouts !== "object" || payouts === null || Array.isArray(payouts)) {
            continue;
        }
        for (const [times, multiplier] of Object.entries(payouts as Record<string, unknown>)) {
            if (typeof multiplier === "number") {
                rows.push({symbolId, matchCount: Number(times), payout: multiplier});
            }
        }
    }
    return rows.sort((a, b) => (a.symbolId === b.symbolId ? a.matchCount - b.matchCount : a.symbolId.localeCompare(b.symbolId)));
}

function describeReelGenerationMode(mode: ReelGenerationMode): string {
    if (mode === "reelStrips") {
        return "Literal reel strips";
    }
    if (mode === "reelStripGeneration") {
        return "Per-reel generation (literal or generated per reel)";
    }
    if (mode === "symbolWeights") {
        return "Shared symbol weights";
    }
    return "Default (uniform across symbols)";
}

// The unified, read-only Game Model view -- the one default landing for the Game Model tab, for both a
// Blueprint project's own editable source (see MechanicsEditorTab's own "Edit" affordance, gated on
// canEdit) and an introspectable-but-not-editable package/WASM project's tracked source (loaded the
// exact same way, see MechanicsEditorTab's load effect). Every canonical section renders its own view
// representation of whatever the loaded blueprint actually has -- never an edit form bound to no
// data -- and says so plainly ("(none)"/"No ... configured.") when a section is genuinely empty, rather
// than silently omitting it.
export function GameModelView({blueprint}: {blueprint: Record<string, unknown>}) {
    const symbols = asStringList(blueprint.symbols);
    const wilds = asStringList(blueprint.wilds);
    const scatters = asStringList(blueprint.scatters);
    const availableBets = Array.isArray(blueprint.availableBets) ? blueprint.availableBets.filter((value): value is number => typeof value === "number") : [];
    const betModes = asBetModesList(blueprint.betModes);
    const paytableRows = flattenPaytable(blueprint.paytable);
    const winModelType = getWinModelType(blueprint);
    const clusterSize = getWinModelMinimumClusterSize(blueprint);
    const reelGenerationMode = getReelGenerationMode(blueprint);
    const freeGames = hasFreeGames(blueprint) ? getFreeGames(blueprint) : undefined;
    const reels = typeof blueprint.reels === "number" ? blueprint.reels : undefined;
    const rows = typeof blueprint.rows === "number" ? blueprint.rows : undefined;
    const paylineCount = Array.isArray(blueprint.paylines) ? blueprint.paylines.length : 0;

    return (
        <div>
            <PageSection legend="Game basics">
                <Text size="sm">Id: {readManifestField(blueprint, "id") ?? "(none)"}</Text>
                <Text size="sm">Name: {readManifestField(blueprint, "name") ?? "(none)"}</Text>
                <Text size="sm">Version: {readManifestField(blueprint, "version") ?? "(none)"}</Text>
                <Text size="sm">Description: {readManifestField(blueprint, "description") ?? "(none)"}</Text>
                <Text size="sm">Author: {readManifestField(blueprint, "author") ?? "(none)"}</Text>
            </PageSection>

            <PageSection legend="Layout">
                <Text size="sm">Reels: {reels ?? "(none)"}</Text>
                <Text size="sm">Rows: {rows ?? "(none)"}</Text>
                <Text size="sm">
                    Win model: {winModelType}
                    {winModelType === "clusters" && clusterSize !== undefined ? ` (minimum cluster size ${clusterSize})` : ""}
                </Text>
                <Text size="sm">Paylines: {winModelType === "lines" ? paylineCount : "n/a for this win model"}</Text>
            </PageSection>

            <PageSection legend="Symbols">
                {symbols.length === 0 ? (
                    <Text size="sm" c="dimmed">
                        No symbols configured.
                    </Text>
                ) : (
                    <Group gap="xs">
                        {symbols.map((symbol) => (
                            <Badge key={symbol} variant="outline">
                                {symbol}
                                {wilds.includes(symbol) ? " · wild" : ""}
                                {scatters.includes(symbol) ? " · scatter" : ""}
                            </Badge>
                        ))}
                    </Group>
                )}
            </PageSection>

            <PageSection legend="Reels">
                <Text size="sm">Generation mode: {describeReelGenerationMode(reelGenerationMode)}</Text>
            </PageSection>

            <PageSection legend="Paytable">
                {paytableRows.length === 0 ? (
                    <Text size="sm" c="dimmed">
                        No paytable entries configured.
                    </Text>
                ) : (
                    <Table.ScrollContainer minWidth={360}>
                        <Table>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Symbol</Table.Th>
                                    <Table.Th>Match count</Table.Th>
                                    <Table.Th>Payout (x bet)</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {paytableRows.map((row) => (
                                    <Table.Tr key={`${row.symbolId}-${row.matchCount}`}>
                                        <Table.Td>{row.symbolId}</Table.Td>
                                        <Table.Td>{row.matchCount}</Table.Td>
                                        <Table.Td>{row.payout}</Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                )}
            </PageSection>

            <PageSection legend="Bets & Modes">
                <Text size="sm" mb="xs">
                    Available bets: {availableBets.length > 0 ? availableBets.join(", ") : "(none)"}
                </Text>
                {betModes.length === 0 ? (
                    <Text size="sm" c="dimmed">
                        No bet modes configured.
                    </Text>
                ) : (
                    <Table.ScrollContainer minWidth={480}>
                        <Table>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Id</Table.Th>
                                    <Table.Th>Label</Table.Th>
                                    <Table.Th>Cost multiplier</Table.Th>
                                    <Table.Th>Target RTP</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {betModes.map((mode) => (
                                    <Table.Tr key={mode.id}>
                                        <Table.Td>{mode.id}</Table.Td>
                                        <Table.Td>{mode.label ?? "(none)"}</Table.Td>
                                        <Table.Td>{mode.costMultiplier ?? "(none)"}</Table.Td>
                                        <Table.Td>{mode.targetRtp ?? "(none)"}</Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                )}
            </PageSection>

            <PageSection legend="Mechanics">
                {freeGames === undefined ? (
                    <Text size="sm" c="dimmed">
                        No mechanics/features configured.
                    </Text>
                ) : (
                    <div>
                        <Text size="sm">Scatter-triggered free games — scatter symbol: {freeGames.scatterSymbol || "(none)"}</Text>
                        <Text size="sm">
                            Awards:{" "}
                            {Object.entries(freeGames.awardsByCount).length > 0
                                ? Object.entries(freeGames.awardsByCount)
                                    .map(([count, awarded]) => `${count}x → ${awarded} free games`)
                                    .join(", ")
                                : "(none)"}
                        </Text>
                    </div>
                )}
            </PageSection>
        </div>
    );
}
