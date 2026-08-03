import {Badge, Group, Table, Text} from "@mantine/core";
import type {GameModelBetsAndModes, GameModelMechanics, GameModelProjection, GameModelReelGenerationMode, GameModelSection, GameModelSymbol} from "../../api/types";
import {PageSection} from "../common/PageSection";

function describeReelGenerationMode(mode: GameModelReelGenerationMode): string {
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

// A section whose own data genuinely isn't known (no tracked source blueprint on record, a load
// failure, ...) -- distinct from a section that IS known but simply empty, which renders its own
// "No ... configured." text below instead, straight from the projection's own (empty) data.
function UnavailableSection({reason}: {reason: string}) {
    return (
        <Text size="sm" c="dimmed">
            Not available — {reason}
        </Text>
    );
}

// Split out of the Symbols/Paytable/Mechanics sections below purely to avoid a 3-way nested ternary
// (unavailable / available-but-empty / available-with-data) -- each still renders exactly the same
// markup a flattened ternary chain would have, just as early returns instead.
function SymbolsSection({section}: {section: GameModelSection<GameModelSymbol[]>}) {
    if (section.status === "unavailable") {
        return <UnavailableSection reason={section.reason} />;
    }
    if (section.data.length === 0) {
        return (
            <Text size="sm" c="dimmed">
                No symbols configured.
            </Text>
        );
    }
    return (
        <Group gap="xs">
            {section.data.map((symbol) => (
                <Badge key={symbol.id} variant="outline">
                    {symbol.id}
                    {symbol.isWild ? " · wild" : ""}
                    {symbol.isScatter ? " · scatter" : ""}
                </Badge>
            ))}
        </Group>
    );
}

function PaytableSection({section}: {section: GameModelProjection["paytable"]}) {
    if (section.status === "unavailable") {
        return <UnavailableSection reason={section.reason} />;
    }
    if (section.data.length === 0) {
        return (
            <Text size="sm" c="dimmed">
                No paytable entries configured.
            </Text>
        );
    }
    return (
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
                    {section.data.map((row) => (
                        <Table.Tr key={`${row.symbolId}-${row.matchCount}`}>
                            <Table.Td>{row.symbolId}</Table.Td>
                            <Table.Td>{row.matchCount}</Table.Td>
                            <Table.Td>{row.payout}</Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
        </Table.ScrollContainer>
    );
}

function BetModesTable({betModes}: {betModes: GameModelBetsAndModes["betModes"]}) {
    if (betModes.length === 0) {
        return (
            <Text size="sm" c="dimmed">
                No bet modes configured.
            </Text>
        );
    }
    return (
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
    );
}

function MechanicsSection({section}: {section: GameModelSection<GameModelMechanics>}) {
    if (section.status === "unavailable") {
        return <UnavailableSection reason={section.reason} />;
    }
    if (section.data.freeGames === undefined) {
        return (
            <Text size="sm" c="dimmed">
                No mechanics/features configured.
            </Text>
        );
    }
    const {freeGames} = section.data;
    return (
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
    );
}

// The unified, read-only Game Model view -- the Game Model tab's own default (and, for P3-POLISH-16,
// only) content, for a Blueprint project's own tracked source and an introspectable-but-not-editable
// package/WASM project's tracked source alike (see MechanicsEditorTab's own doc comment). Purely a
// renderer over `projection` (see GameModelProjection in api/types.ts, mirroring the "pokie" core's own
// canonical type) -- every value shown here comes straight off that DTO; this component never flattens a
// paytable, infers a reel generation mode, or otherwise re-derives any of the underlying GameBlueprint's
// own math itself (that's buildGameModelProjection's job, server/core-side).
export function GameModelView({projection}: {projection: GameModelProjection}) {
    return (
        <div>
            <PageSection legend="Game basics">
                {projection.basics.status === "unavailable" ? (
                    <UnavailableSection reason={projection.basics.reason} />
                ) : (
                    <>
                        <Text size="sm">Id: {projection.basics.data.id ?? "(none)"}</Text>
                        <Text size="sm">Name: {projection.basics.data.name ?? "(none)"}</Text>
                        <Text size="sm">Version: {projection.basics.data.version ?? "(none)"}</Text>
                        <Text size="sm">Description: {projection.basics.data.description ?? "(none)"}</Text>
                        <Text size="sm">Author: {projection.basics.data.author ?? "(none)"}</Text>
                    </>
                )}
            </PageSection>

            <PageSection legend="Layout">
                {projection.layout.status === "unavailable" ? (
                    <UnavailableSection reason={projection.layout.reason} />
                ) : (
                    <>
                        <Text size="sm">Reels: {projection.layout.data.reels ?? "(none)"}</Text>
                        <Text size="sm">Rows: {projection.layout.data.rows ?? "(none)"}</Text>
                        <Text size="sm">
                            Win model: {projection.layout.data.winModel.type}
                            {projection.layout.data.winModel.type === "clusters" && projection.layout.data.winModel.minimumClusterSize !== undefined
                                ? ` (minimum cluster size ${projection.layout.data.winModel.minimumClusterSize})`
                                : ""}
                        </Text>
                        <Text size="sm">
                            Paylines: {projection.layout.data.winModel.type === "lines" ? (projection.layout.data.paylineCount ?? 0) : "n/a for this win model"}
                        </Text>
                    </>
                )}
            </PageSection>

            <PageSection legend="Symbols">
                <SymbolsSection section={projection.symbols} />
            </PageSection>

            <PageSection legend="Reels">
                {projection.reels.status === "unavailable" ? (
                    <UnavailableSection reason={projection.reels.reason} />
                ) : (
                    <Text size="sm">Generation mode: {describeReelGenerationMode(projection.reels.data.generationMode)}</Text>
                )}
            </PageSection>

            <PageSection legend="Paytable">
                <PaytableSection section={projection.paytable} />
            </PageSection>

            <PageSection legend="Bets & Modes">
                {projection.betsAndModes.status === "unavailable" ? (
                    <UnavailableSection reason={projection.betsAndModes.reason} />
                ) : (
                    <>
                        <Text size="sm" mb="xs">
                            Available bets: {projection.betsAndModes.data.availableBets.length > 0 ? projection.betsAndModes.data.availableBets.join(", ") : "(none)"}
                        </Text>
                        <BetModesTable betModes={projection.betsAndModes.data.betModes} />
                    </>
                )}
            </PageSection>

            <PageSection legend="Mechanics">
                <MechanicsSection section={projection.mechanics} />
            </PageSection>
        </div>
    );
}
