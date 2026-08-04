import {Badge, Group, Table, Tabs, Text} from "@mantine/core";
import type {
    GameModelBetsAndModes,
    GameModelGameWindow,
    GameModelMechanics,
    GameModelProjection,
    GameModelReel,
    GameModelReelGenerationMode,
    GameModelReels,
    GameModelResolvedReel,
    GameModelSection,
    GameModelSharedWeightsSample,
    GameModelSymbol,
} from "../../api/types";
import {AnalysisTable, DiagnosticsList} from "../blueprintEditor/ReelStripGenerationEditor";
import {EmptyState} from "../common/EmptyState";
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

function describeGameWindowCellColor(cell: {isWild: boolean; isScatter: boolean}): string {
    if (cell.isWild) {
        return "grape";
    }
    if (cell.isScatter) {
        return "orange";
    }
    return "gray";
}

// Game window: this project's own reel grid at stop position 0, [reelIndex][rowIndex] -- read straight
// off GameModelGameWindow, never re-derived (see that type's own doc comment for which strip each column
// actually comes from). Wild/scatter cells are highlighted as the window's own overlay.
function GameWindowView({gameWindow}: {gameWindow: GameModelGameWindow}) {
    if (gameWindow.reels === 0 || gameWindow.grid.every((column) => column.length === 0)) {
        return <EmptyState message="No reels configured yet." />;
    }
    return (
        <div>
            <Text size="sm" c="dimmed" mb="sm">
                {gameWindow.reels} reel column(s) × {gameWindow.rows} row(s) (row 0 on top), read at stop position
                0 -- every reel wraps back to its own start once it runs past its own end. Wild/scatter symbols are
                highlighted.
            </Text>
            <Table.ScrollContainer minWidth={200}>
                <Table withColumnBorders>
                    <Table.Tbody>
                        {Array.from({length: gameWindow.rows}, (_, rowIndex) => (
                            <Table.Tr key={rowIndex}>
                                {gameWindow.grid.map((column, reelIndex) => {
                                    const cell = column[rowIndex];
                                    return (
                                        <Table.Td key={reelIndex} ta="center">
                                            {cell === undefined ? (
                                                "—"
                                            ) : (
                                                <Badge variant={cell.isWild || cell.isScatter ? "filled" : "outline"} color={describeGameWindowCellColor(cell)}>
                                                    {cell.symbolId}
                                                </Badge>
                                            )}
                                        </Table.Td>
                                    );
                                })}
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            </Table.ScrollContainer>
        </div>
    );
}

// A reel is "resolved" (has its own real or sample positions to show) iff it carries `positions` --
// mirrors the discriminant GameModelReel/GameModelUnresolvedReel actually use (see GameModelProjection.ts).
function isResolvedReel(reel: GameModelReel): reel is GameModelResolvedReel {
    return "positions" in reel;
}

function describeReelSource(source: GameModelResolvedReel["source"]): string {
    if (source === "literal") {
        return "Literal strip — fixed, exactly as authored.";
    }
    if (source === "generated") {
        return "Generated strip — resolved from this reel's own reelStripGeneration config.";
    }
    return "Sample only — this generation mode has no fixed strip (every session reshuffles fresh); shown as one reproducible instance.";
}

function describeSpecialCell(position: {isWild: boolean; isScatter: boolean}): string {
    if (position.isWild) {
        return "Wild";
    }
    if (position.isScatter) {
        return "Scatter";
    }
    return "—";
}

function ReelPositionsTable({reel}: {reel: GameModelResolvedReel}) {
    return (
        <Table.ScrollContainer minWidth={480}>
            <Table>
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Index</Table.Th>
                        <Table.Th>Symbol</Table.Th>
                        <Table.Th>Special</Table.Th>
                        <Table.Th>Stack</Table.Th>
                        <Table.Th>Locked</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {reel.positions.map((position) => (
                        <Table.Tr key={position.index}>
                            <Table.Td>{position.index}</Table.Td>
                            <Table.Td>{position.symbolId}</Table.Td>
                            <Table.Td>{describeSpecialCell(position)}</Table.Td>
                            <Table.Td>{position.stackSize > 1 ? `${position.stackSize}×` : "—"}</Table.Td>
                            <Table.Td>{position.locked ? "Locked" : "—"}</Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
        </Table.ScrollContainer>
    );
}

// Full strips: every physical reel's own full, circular strip -- index, symbol, wild/scatter, stack
// run, and locked positions (see GameModelReelStripPosition's own doc comment). An unresolved
// "generated" reel shows exactly why it couldn't be resolved instead of a strip.
function FullStripsView({reels}: {reels: GameModelReel[]}) {
    if (reels.length === 0) {
        return <EmptyState message="No reels configured yet." />;
    }
    return (
        <div>
            {reels.map((reel) => (
                <PageSection key={reel.reelIndex} legend={`Reel ${reel.reelIndex + 1}`}>
                    {isResolvedReel(reel) ? (
                        <>
                            <Text size="sm" c="dimmed" mb="xs">
                                {describeReelSource(reel.source)} {reel.positions.length} position(s), circular (wraps
                                from the last position back to index 0).
                            </Text>
                            <ReelPositionsTable reel={reel} />
                        </>
                    ) : (
                        <Text size="sm" c="red">
                            Unresolved — {reel.reason}
                        </Text>
                    )}
                </PageSection>
            ))}
        </div>
    );
}

function SharedWeightsConversionTable({sample}: {sample: GameModelSharedWeightsSample}) {
    const symbolIds = Object.keys(sample.weights);
    return (
        <PageSection legend="Shared weights → counts conversion">
            <Text size="sm" c="dimmed" mb="xs">
                Reproducible sample only (seed {sample.seed}, sample length {sample.sampleLength}) — not the strip any
                real session will use; every reel independently reshuffles this same weight pool fresh each session.
            </Text>
            <Table.ScrollContainer minWidth={480}>
                <Table>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Symbol</Table.Th>
                            <Table.Th>Weight</Table.Th>
                            <Table.Th>Resolved count</Table.Th>
                            <Table.Th>Target proportion</Table.Th>
                            <Table.Th>Actual proportion</Table.Th>
                            <Table.Th>Deviation</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {symbolIds.map((symbolId) => (
                            <Table.Tr key={symbolId}>
                                <Table.Td>{symbolId}</Table.Td>
                                <Table.Td>{sample.weights[symbolId]}</Table.Td>
                                <Table.Td>{sample.conversion.counts[symbolId] ?? 0}</Table.Td>
                                <Table.Td>{(sample.conversion.targetProportions[symbolId] ?? 0).toFixed(3)}</Table.Td>
                                <Table.Td>{(sample.conversion.actualProportions[symbolId] ?? 0).toFixed(3)}</Table.Td>
                                <Table.Td>{(sample.conversion.deviations[symbolId] ?? 0).toFixed(3)}</Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            </Table.ScrollContainer>
        </PageSection>
    );
}

// Analysis: the shared weights → counts conversion (when this generation mode has one), plus each
// reel's own ReelStripAnalyzer output (counts/shares/distances/possible stop windows) and, for a
// "generated" reel, its own generation constraint diagnostics -- reusing AnalysisTable/DiagnosticsList
// verbatim from the Reel Strip Modeler rather than a second implementation of either.
function AnalysisView({reels, sharedWeightsSample}: {reels: GameModelReel[]; sharedWeightsSample: GameModelSharedWeightsSample | undefined}) {
    if (reels.length === 0) {
        return <EmptyState message="No reels configured yet." />;
    }
    return (
        <div>
            {sharedWeightsSample !== undefined && <SharedWeightsConversionTable sample={sharedWeightsSample} />}
            {reels.map((reel) => (
                <PageSection key={reel.reelIndex} legend={`Reel ${reel.reelIndex + 1} analysis`}>
                    {isResolvedReel(reel) ? (
                        <>
                            <Text size="sm" c="dimmed" mb="xs">
                                {reel.analysis.length} possible stop position(s) (this reel&apos;s own length).
                            </Text>
                            <AnalysisTable analysis={reel.analysis} />
                            {reel.generationDiagnostics !== undefined && <DiagnosticsList diagnostics={reel.generationDiagnostics} />}
                        </>
                    ) : (
                        <>
                            <Text size="sm" c="red" mb="xs">
                                Unresolved — {reel.reason}
                            </Text>
                            <DiagnosticsList diagnostics={reel.generationDiagnostics} />
                        </>
                    )}
                </PageSection>
            ))}
        </div>
    );
}

// The Reels section's own content -- Game window / Full strips / Analysis, straight off whichever
// GameModelReels this project's generation mode actually produced (see buildGameModelReels.ts). Never
// shows a single strip as "the" strip for "symbolWeights"/"default" (see GameModelSharedWeightsSample's
// own doc comment) -- an explicit note plus each view's own "sample" labeling makes that unmistakable.
function ReelsSection({section}: {section: GameModelSection<GameModelReels>}) {
    if (section.status === "unavailable") {
        return <UnavailableSection reason={section.reason} />;
    }
    const {data} = section;
    const hasNoFixedStrip = data.generationMode === "symbolWeights" || data.generationMode === "default";
    return (
        <div>
            <Text size="sm">Generation mode: {describeReelGenerationMode(data.generationMode)}</Text>
            {hasNoFixedStrip && (
                <Text size="sm" c="dimmed" mb="sm">
                    This mode has no single fixed strip — every reel reshuffles the same weight pool fresh each
                    session, so the views below show one reproducible sample instead of a real strip.
                </Text>
            )}
            <Tabs defaultValue="gameWindow" mt="sm">
                <Tabs.List>
                    <Tabs.Tab value="gameWindow">Game window</Tabs.Tab>
                    <Tabs.Tab value="fullStrips">Full strips</Tabs.Tab>
                    <Tabs.Tab value="analysis">Analysis</Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value="gameWindow" pt="sm">
                    <GameWindowView gameWindow={data.gameWindow} />
                </Tabs.Panel>
                <Tabs.Panel value="fullStrips" pt="sm">
                    <FullStripsView reels={data.reels} />
                </Tabs.Panel>
                <Tabs.Panel value="analysis" pt="sm">
                    <AnalysisView reels={data.reels} sharedWeightsSample={data.sharedWeightsSample} />
                </Tabs.Panel>
            </Tabs>
        </div>
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
                <ReelsSection section={projection.reels} />
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
