import {Badge, Button, Group, NumberInput, Table, Tabs, Text} from "@mantine/core";
import {useState} from "react";
import type {
    GameModelBetsAndModes,
    GameModelGameWindow,
    GameModelLimits,
    GameModelMechanics,
    GameModelProjection,
    GameModelReel,
    GameModelReelGenerationMode,
    GameModelReels,
    GameModelReelWindowCell,
    GameModelResolvedReel,
    GameModelSection,
    GameModelSharedWeightsSample,
    GameModelSymbol,
} from "../../api/types";
import type {BlueprintValidationView} from "../../domain/interpret/BlueprintEditor";
import {classifyIssuesBySection, crossFieldOnly, type BlueprintSectionId} from "../../domain/interpret/BlueprintSections";
import type {BlueprintMutate, ReelStripGenerationDraftsRef} from "../../hooks/useBlueprintEditor";
import {BetsList} from "../blueprintEditor/BetsList";
import {LayoutFieldset} from "../blueprintEditor/LayoutFieldset";
import {MetadataFieldset} from "../blueprintEditor/MetadataFieldset";
import {PaylinesEditor} from "../blueprintEditor/PaylinesEditor";
import {PaytableEditor} from "../blueprintEditor/PaytableEditor";
import {ReelGenerationModeSelector} from "../blueprintEditor/ReelGenerationModeSelector";
import {AnalysisTable, DiagnosticsList} from "../blueprintEditor/ReelStripGenerationEditor";
import {SymbolsTable} from "../blueprintEditor/SymbolsTable";
import {EmptyState} from "../common/EmptyState";
import {IssueList} from "../common/IssueList";
import {PageSection} from "../common/PageSection";

// GameModelSections offers Edit on exactly "basics"/"layout"/"symbols"/"reels"/"paytable"/"bets" below --
// the BlueprintSectionId values with an existing, canonical field editor to reuse from the guided Design
// Game editor (see SectionedFormEditor.tsx, whose own 6 tabs these mirror one-for-one). "Mechanics"/
// "Limits" have no dedicated field editor anywhere in Studio today (their old one, MechanicsEditorTab's
// BetModesEditor/FreeGamesFieldset, was deleted outright in P4-POLISH-03, not merely hidden) --
// reintroducing one here would be exactly the second, competing implementation this step's own "without
// duplicating mechanics or domain semantics" contract forbids, so those two stay read-only.
//
// Everything GameModelSections needs to render Edit/Save/Cancel per section and swap an editable
// section's read-only body for the exact same field-editor component the guided Design Game editor uses
// (see useBlueprintEditor.ts) -- `blueprint`/`mutate`/`drafts`/`revision` are that hook's own state,
// `validationView` is GameModelTab's own last validateBlueprint() result for the in-progress edit.
// Undefined (the default) everywhere GameModelSections renders a projection that isn't a saved, in-place-
// editable Blueprint Project -- GameModelPreviewPanel's own live Design Game preview never passes this,
// so it renders exactly as it always has, purely read-only.
export type GameModelEditController = {
    // Set the instant Edit is clicked (before the fresh source has even loaded) through to Save/Cancel --
    // every *other* section's own Edit disables the moment this is set, not just once `ready` below
    // flips, so a second Edit click can never race the first section's own still-in-flight load.
    activeSection: BlueprintSectionId | undefined;
    // False while `activeSection`'s own fresh source is still loading (see GameModelTab's own "loading"
    // EditState) -- the field editor only ever renders bound to real, already-loaded content, never a
    // stale or empty draft, so the read-only body stays up until this flips true.
    ready: boolean;
    onEdit: (section: BlueprintSectionId) => void;
    onSave: () => void;
    onCancel: () => void;
    saving: boolean;
    validationView: BlueprintValidationView;
    blueprint: Record<string, unknown>;
    mutate: BlueprintMutate;
    drafts: ReelStripGenerationDraftsRef;
    revision: number;
};

// The Reels section's own View Mode controls for a "symbolWeights"/"default" blueprint's dynamic
// inspection sample (see GameModelSharedWeightsSample's own doc comment) -- undefined wherever
// GameModelSections renders a projection with nothing to reroll/convert (GameModelPreviewPanel's own
// live preview never wires up a conversion, since it has no saved project to write into). `onNewSample`
// re-rolls the sample shown for every section on this projection with a fresh, still-reproducible seed;
// `onConvertToGeneratedReels` (only ever wired up alongside a real `GameModelEditController`, see
// GameModelTab.tsx) freezes exactly the strips currently shown into an editable reelStripGeneration draft
// -- never invents a strip the view itself hasn't already shown.
export type GameModelReelsSampleControls = {
    onNewSample: () => void;
    loading: boolean;
    onConvertToGeneratedReels?: () => void;
    convertDisabled?: boolean;
};

// The Edit/Save/Cancel control group a section's own PageSection legend shows -- every Edit disables the
// instant *any* section is active (loading, editing, or saving -- see GameModelTab's own "one section at
// a time" contract, which keeps every save a single, atomic whole-blueprint write against a baseline
// nothing else in this tab is concurrently mutating), and shows its own loading spinner while its own
// section is the one still fetching a fresh source.
function SectionEditAction({id, edit}: {id: BlueprintSectionId; edit: GameModelEditController}) {
    if (edit.activeSection === id) {
        if (!edit.ready) {
            return (
                <Button size="xs" variant="default" loading disabled>
                    Edit
                </Button>
            );
        }
        return (
            <Group gap="xs" wrap="nowrap">
                <Button size="xs" onClick={edit.onSave} loading={edit.saving}>
                    Save
                </Button>
                <Button size="xs" variant="default" onClick={edit.onCancel} disabled={edit.saving}>
                    Cancel
                </Button>
            </Group>
        );
    }
    return (
        <Button size="xs" variant="default" onClick={() => edit.onEdit(id)} disabled={edit.activeSection !== undefined}>
            Edit
        </Button>
    );
}

// The section-scoped slice of GameModelTab's own last validateBlueprint() result -- same
// classifyIssuesBySection/crossFieldOnly categorization SectionedFormEditor.tsx already uses for the
// guided editor's own per-tab issue lists, reused verbatim rather than a second display categorization.
function SectionValidationIssues({id, edit}: {id: BlueprintSectionId; edit: GameModelEditController}) {
    const view = edit.validationView;
    const errors = view.status === "invalid" ? view.errors : [];
    const warnings = view.status === "invalid" || view.status === "ok" ? view.warnings : [];
    const {bySection: errorsBySection} = classifyIssuesBySection(errors);
    const {bySection: warningsBySection} = classifyIssuesBySection(warnings);
    return (
        <>
            <IssueList title="Errors" issues={crossFieldOnly(errorsBySection[id])} />
            <IssueList title="Warnings" issues={crossFieldOnly(warningsBySection[id])} />
        </>
    );
}

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

// A section whose own data genuinely isn't known (no tracked Blueprint on record, a resolved project
// type Studio can't introspect this deeply, a load failure, ...) -- distinct from a section that IS
// known but simply empty, which renders its own "No ... configured." text below instead, straight from
// the projection's own (empty) data. This component never invents data to fill the gap -- see
// GameModelProjection's own doc comment.
function UnavailableSection({reason}: {reason: string}) {
    return (
        <Text size="sm" c="dimmed">
            Not available — {reason}
        </Text>
    );
}

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

// A reel is "resolved" (has its own real or sample positions to show) iff it carries `positions` --
// mirrors the discriminant GameModelReel/GameModelUnresolvedReel actually use (see GameModelProjection.ts).
function isResolvedReel(reel: GameModelReel): reel is GameModelResolvedReel {
    return "positions" in reel;
}

// This reel's own window column starting at `stop`, wrapping circularly -- the exact same modulo
// resolution ReelStrip.getSymbolAt uses server-side (see GameModelGameWindow's own doc comment), computed
// here purely so the Game Window view can move its own stop client-side without a round trip for every
// position: `positions` already carries every stop this reel could ever show (see GameModelReels.reels).
function reelWindowColumn(reel: GameModelReel, stop: number, rows: number): GameModelReelWindowCell[] {
    if (!isResolvedReel(reel) || reel.positions.length === 0 || rows <= 0) {
        return [];
    }
    const length = reel.positions.length;
    const normalizedStop = ((stop % length) + length) % length;
    return Array.from({length: rows}, (_, rowOffset) => reel.positions[(normalizedStop + rowOffset) % length]);
}

// Game window: this project's own reel grid, [reelIndex][rowIndex], read at a user-movable stop position
// -- computed from each reel's own full circular `positions` (see GameModelReels.reels) rather than the
// projection's own gameWindow.grid, which is always fixed at stop 0. Every reel shares the same `stop`
// (a single scrub control, not one per reel) purely so moving it reads as one coherent spin outcome to
// inspect; each reel's own window still wraps independently around its own length via reelWindowColumn
// above. Wild/scatter cells are highlighted as the window's own overlay.
function GameWindowView({gameWindow, reels}: {gameWindow: GameModelGameWindow; reels: GameModelReel[]}) {
    const [stop, setStop] = useState(0);
    if (gameWindow.reels === 0 || reels.every((reel) => !isResolvedReel(reel) || reel.positions.length === 0)) {
        return <EmptyState message="No reels configured yet." />;
    }
    const grid = reels.map((reel) => reelWindowColumn(reel, stop, gameWindow.rows));
    return (
        <div>
            <Text size="sm" c="dimmed" mb="sm">
                {gameWindow.reels} reel column(s) × {gameWindow.rows} row(s) (row 0 on top) -- every reel wraps back
                to its own start once it runs past its own end. Move the stop position below to see every window
                this configuration can show. Wild/scatter symbols are highlighted.
            </Text>
            <Group gap="xs" mb="sm" wrap="nowrap">
                <Button size="xs" variant="default" aria-label="Previous stop" onClick={() => setStop((current) => current - 1)}>
                    ‹ Prev stop
                </Button>
                <NumberInput
                    aria-label="Stop position"
                    size="xs"
                    step={1}
                    value={stop}
                    onChange={(value) => setStop(typeof value === "number" ? value : 0)}
                    w={120}
                />
                <Button size="xs" variant="default" aria-label="Next stop" onClick={() => setStop((current) => current + 1)}>
                    Next stop ›
                </Button>
            </Group>
            <Table.ScrollContainer minWidth={200}>
                <Table withColumnBorders>
                    <Table.Tbody>
                        {Array.from({length: gameWindow.rows}, (_, rowIndex) => (
                            <Table.Tr key={rowIndex}>
                                {grid.map((column, reelIndex) => {
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
// own doc comment) -- an explicit note plus each view's own "sample" labeling, a "New sample" reroll, and
// (when `sampleControls` wires it up) an explicit "Convert to generated reels" action make that
// unmistakable rather than ever presenting the sample as a fixed strip.
function ReelsSection({section, sampleControls}: {section: GameModelSection<GameModelReels>; sampleControls?: GameModelReelsSampleControls}) {
    if (section.status === "unavailable") {
        return <UnavailableSection reason={section.reason} />;
    }
    const {data} = section;
    const hasNoFixedStrip = data.generationMode === "symbolWeights" || data.generationMode === "default";
    return (
        <div>
            <Text size="sm">Generation mode: {describeReelGenerationMode(data.generationMode)}</Text>
            {hasNoFixedStrip && (
                <div>
                    <Text size="sm" c="dimmed" mb="xs">
                        This mode has no single fixed strip — every reel reshuffles the same weight pool fresh each
                        session, so the views below show one reproducible, seeded sample instead of a real strip
                        {data.sharedWeightsSample !== undefined ? ` (seed ${data.sharedWeightsSample.seed})` : ""}.
                    </Text>
                    {sampleControls && (
                        <Group gap="xs" mb="sm">
                            <Button size="xs" variant="default" loading={sampleControls.loading} onClick={sampleControls.onNewSample}>
                                New sample
                            </Button>
                            {sampleControls.onConvertToGeneratedReels && (
                                <Button
                                    size="xs"
                                    variant="default"
                                    disabled={sampleControls.convertDisabled}
                                    onClick={sampleControls.onConvertToGeneratedReels}
                                >
                                    Convert this sample to generated reels…
                                </Button>
                            )}
                        </Group>
                    )}
                </div>
            )}
            <Tabs defaultValue="gameWindow" mt="sm">
                <Tabs.List>
                    <Tabs.Tab value="gameWindow">Game window</Tabs.Tab>
                    <Tabs.Tab value="fullStrips">Full strips</Tabs.Tab>
                    <Tabs.Tab value="analysis">Analysis</Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value="gameWindow" pt="sm">
                    <GameWindowView gameWindow={data.gameWindow} reels={data.reels} />
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

// Read-only "Game basics" -- pulled out of GameModelSections' own render tree (alongside
// SymbolsSection/ReelsSection/PaytableSection/BetsAndModesSection below) purely so swapping in the edit
// form doesn't need a 3-way nested ternary in the JSX itself.
function BasicsSection({section}: {section: GameModelProjection["basics"]}) {
    if (section.status === "unavailable") {
        return <UnavailableSection reason={section.reason} />;
    }
    return (
        <>
            <Text size="sm">Id: {section.data.id ?? "(none)"}</Text>
            <Text size="sm">Name: {section.data.name ?? "(none)"}</Text>
            <Text size="sm">Version: {section.data.version ?? "(none)"}</Text>
            <Text size="sm">Description: {section.data.description ?? "(none)"}</Text>
            <Text size="sm">Author: {section.data.author ?? "(none)"}</Text>
        </>
    );
}

// Read-only "Layout" -- same reasoning as BasicsSection above.
function LayoutSection({section}: {section: GameModelProjection["layout"]}) {
    if (section.status === "unavailable") {
        return <UnavailableSection reason={section.reason} />;
    }
    return (
        <>
            <Text size="sm">Reels: {section.data.reels ?? "(none)"}</Text>
            <Text size="sm">Rows: {section.data.rows ?? "(none)"}</Text>
            <Text size="sm">
                Win model: {section.data.winModel.type}
                {section.data.winModel.type === "clusters" && section.data.winModel.minimumClusterSize !== undefined
                    ? ` (minimum cluster size ${section.data.winModel.minimumClusterSize})`
                    : ""}
            </Text>
            <Text size="sm">Paylines: {section.data.winModel.type === "lines" ? (section.data.paylineCount ?? 0) : "n/a for this win model"}</Text>
        </>
    );
}

// Read-only "Bets & Modes" -- same reasoning as BasicsSection above.
function BetsAndModesSection({section}: {section: GameModelProjection["betsAndModes"]}) {
    if (section.status === "unavailable") {
        return <UnavailableSection reason={section.reason} />;
    }
    return (
        <>
            <Text size="sm" mb="xs">
                Available bets: {section.data.availableBets.length > 0 ? section.data.availableBets.join(", ") : "(none)"}
            </Text>
            <BetModesTable betModes={section.data.betModes} />
        </>
    );
}

function LimitsSection({section}: {section: GameModelSection<GameModelLimits>}) {
    if (section.status === "unavailable") {
        return <UnavailableSection reason={section.reason} />;
    }
    if (section.data.minBet === undefined && section.data.maxBet === undefined) {
        return (
            <Text size="sm" c="dimmed">
                No bet limits configured.
            </Text>
        );
    }
    return (
        <Text size="sm">
            Bet range: {section.data.minBet ?? "(none)"} – {section.data.maxBet ?? "(none)"}
        </Text>
    );
}

// The unified, read-only Game Model view -- View Mode's own default (and only) content, for every
// resolved project type alike, capability-aware per section (see GameModelProjection's own doc comment).
// Purely a renderer over `projection` (see GameModelProjection in api/types.ts, mirroring the "pokie"
// core's own canonical type) -- every value shown here comes straight off that DTO; this component never
// flattens a paytable, infers a reel generation mode, or otherwise re-derives any of the underlying
// GameBlueprint's own math itself (that's buildGameModelProjection's job, server/core-side). Shared
// verbatim across the Project Workspace's own Game Model tab (GameModelTab.tsx, a saved Blueprint
// project's tracked source) and the guided Design Game editor's own live preview (BlueprintEditorPage's
// GameModelPreviewPanel) -- every surface that shows a game model renders the exact same projection type
// through this exact same component, never a second, independently-drifting rendering.
export function GameModelSections({
    projection,
    edit,
    reelsSampleControls,
}: {
    projection: GameModelProjection;
    edit?: GameModelEditController;
    reelsSampleControls?: GameModelReelsSampleControls;
}) {
    const editingBasics = edit?.ready === true && edit.activeSection === "basics";
    const editingLayout = edit?.ready === true && edit.activeSection === "layout";
    const editingSymbols = edit?.ready === true && edit.activeSection === "symbols";
    const editingReels = edit?.ready === true && edit.activeSection === "reels";
    const editingPaytable = edit?.ready === true && edit.activeSection === "paytable";
    const editingBets = edit?.ready === true && edit.activeSection === "bets";

    return (
        <div>
            <PageSection legend="Game basics" action={edit && <SectionEditAction id="basics" edit={edit} />}>
                {editingBasics && edit ? (
                    <>
                        <SectionValidationIssues id="basics" edit={edit} />
                        <MetadataFieldset blueprint={edit.blueprint} mutate={edit.mutate} legend="Game basics" />
                    </>
                ) : (
                    <BasicsSection section={projection.basics} />
                )}
            </PageSection>

            <PageSection legend="Layout" action={edit && <SectionEditAction id="layout" edit={edit} />}>
                {editingLayout && edit ? (
                    <>
                        <SectionValidationIssues id="layout" edit={edit} />
                        <LayoutFieldset blueprint={edit.blueprint} mutate={edit.mutate} />
                        <PaylinesEditor blueprint={edit.blueprint} mutate={edit.mutate} />
                    </>
                ) : (
                    <LayoutSection section={projection.layout} />
                )}
            </PageSection>

            <PageSection legend="Symbols" action={edit && <SectionEditAction id="symbols" edit={edit} />}>
                {editingSymbols && edit ? (
                    <>
                        <SectionValidationIssues id="symbols" edit={edit} />
                        <SymbolsTable blueprint={edit.blueprint} mutate={edit.mutate} />
                    </>
                ) : (
                    <SymbolsSection section={projection.symbols} />
                )}
            </PageSection>

            <PageSection legend="Reels" action={edit && <SectionEditAction id="reels" edit={edit} />}>
                {editingReels && edit ? (
                    <>
                        <SectionValidationIssues id="reels" edit={edit} />
                        <ReelGenerationModeSelector blueprint={edit.blueprint} mutate={edit.mutate} drafts={edit.drafts} revision={edit.revision} />
                    </>
                ) : (
                    <ReelsSection section={projection.reels} sampleControls={reelsSampleControls} />
                )}
            </PageSection>

            <PageSection legend="Paytable" action={edit && <SectionEditAction id="paytable" edit={edit} />}>
                {editingPaytable && edit ? (
                    <>
                        <SectionValidationIssues id="paytable" edit={edit} />
                        <PaytableEditor blueprint={edit.blueprint} mutate={edit.mutate} />
                    </>
                ) : (
                    <PaytableSection section={projection.paytable} />
                )}
            </PageSection>

            <PageSection legend="Bets & Modes" action={edit && <SectionEditAction id="bets" edit={edit} />}>
                {editingBets && edit ? (
                    <>
                        <SectionValidationIssues id="bets" edit={edit} />
                        <Text size="sm" c="dimmed" mb="xs">
                            Bet modes (id/label/multiplier/target RTP) aren&apos;t editable in Studio yet -- edit
                            available bet amounts below.
                        </Text>
                        <BetsList blueprint={edit.blueprint} mutate={edit.mutate} />
                    </>
                ) : (
                    <BetsAndModesSection section={projection.betsAndModes} />
                )}
            </PageSection>

            <PageSection legend="Mechanics">
                <MechanicsSection section={projection.mechanics} />
            </PageSection>

            <PageSection legend="Limits">
                <LimitsSection section={projection.limits} />
            </PageSection>
        </div>
    );
}
