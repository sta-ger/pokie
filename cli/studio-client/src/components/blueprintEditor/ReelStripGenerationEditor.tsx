import {Alert, Anchor, Badge, Button, Group, List, NumberInput, Radio, Select, Stepper, Table, Text, TextInput, Textarea} from "@mantine/core";
import {useDisclosure} from "@mantine/hooks";
import {IconAlertTriangle, IconCircleCheck} from "@tabler/icons-react";
import {useEffect, useRef, useState} from "react";
import {previewReelStripGeneration} from "../../api/apiClient";
import type {ReelStripAnalysis, ReelStripGenerationDiagnostic, StudioReelStripGenerationReelView} from "../../api/types";
import {asStringList} from "../../domain/asStringList";
import {
    addReelStripGenerationLiteralSymbol,
    applyReelStripGenerationEntry,
    duplicateReelStripGenerationLiteralSymbolAt,
    getReelStripGenerationSourceMode,
    moveReelStripGenerationLiteralSymbolAt,
    parseReelStripGenerationConstraintsJson,
    removeReelStripGenerationLiteralSymbolAt,
    removeReelStripGenerationLockedPosition,
    removeReelStripGenerationSymbolCount,
    removeReelStripGenerationSymbolWeight,
    setReelStripGenerationConstraints,
    setReelStripGenerationEntryType,
    setReelStripGenerationLength,
    setReelStripGenerationLiteralSymbolAt,
    setReelStripGenerationLockedPosition,
    setReelStripGenerationMaxAttempts,
    setReelStripGenerationSeed,
    setReelStripGenerationSourceMode,
    setReelStripGenerationSymbolCount,
    setReelStripGenerationSymbolWeight,
} from "../../domain/blueprintFormOps";
import {errorMessage} from "../../domain/errorMessage";
import {
    computeReelStopWindow,
    describeReelStripGenerationEntrySummary,
    hasReelStripGenerationDraftChanged,
    isStaleReelStripGenerationRequest,
    type ReelStripGenerationPreviewView,
} from "../../domain/interpret/BlueprintEditor";
import {useStudioApi} from "../../context/StudioApiProvider";
import type {BlueprintMutate, ReelStripGenerationDraftsRef} from "../../hooks/useBlueprintEditor";
import {useConfirm} from "../../hooks/useConfirm";
import {useDoubleSubmitGuard} from "../../hooks/useDoubleSubmitGuard";
import {BufferedTextInput} from "../common/BufferedTextInput";
import {CodeBlock} from "../common/CodeBlock";
import {EmptyState} from "../common/EmptyState";
import {ErrorState} from "../common/ErrorState";
import {IssueList} from "../common/IssueList";
import {LoadingState} from "../common/LoadingState";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";
import {RowActions} from "../common/RowActions";
import {ScreenTable} from "../common/ScreenTable";

function asRecord(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asReelStripGenerationEntries(value: unknown): Record<string, unknown>[] {
    return Array.isArray(value) ? value.map((entry) => asRecord(entry)) : [];
}

function cloneRecord<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

// A minimal stand-in blueprint whose own reelStripGeneration array is just long enough to hold `entry`
// at `reelIndex` (every other slot a harmless placeholder) -- lets every existing mutator below
// (addReelStripGenerationLiteralSymbol, setReelStripGenerationLength, ...) run completely unchanged
// against a reel's own local draft instead of the shared blueprint, since they all address a reel by
// `blueprint.reelStripGeneration[reelIndex]` and are otherwise none the wiser about which blueprint
// object they were actually given.
function makeScratchBlueprint(reelIndex: number, entry: Record<string, unknown>): Record<string, unknown> {
    return {reelStripGeneration: Array.from({length: reelIndex + 1}, (_, i) => (i === reelIndex ? entry : {type: "literal", strip: []}))};
}

function LiteralStripEditor({reelIndex, entry, mutate}: {reelIndex: number; entry: Record<string, unknown>; mutate: BlueprintMutate}) {
    const strip = asStringList(entry.strip);
    const [newSymbolId, setNewSymbolId] = useState("");

    return (
        <div>
            <List listStyleType="none" spacing={4}>
                {strip.map((symbolId, position) => (
                    <List.Item key={position}>
                        <Group gap="xs">
                            <BufferedTextInput
                                aria-label={`Reel ${reelIndex + 1} symbol ${position + 1}`}
                                value={symbolId}
                                onCommit={(value) => mutate((b) => setReelStripGenerationLiteralSymbolAt(b, reelIndex, position, value))}
                            />
                            <RowActions
                                itemLabel={`reel ${reelIndex + 1} symbol ${position + 1}`}
                                onDuplicate={() => mutate((b) => duplicateReelStripGenerationLiteralSymbolAt(b, reelIndex, position))}
                                onRemove={() => mutate((b) => removeReelStripGenerationLiteralSymbolAt(b, reelIndex, position))}
                                onMoveUp={position > 0 ? () => mutate((b) => moveReelStripGenerationLiteralSymbolAt(b, reelIndex, position, position - 1)) : undefined}
                                onMoveDown={
                                    position < strip.length - 1
                                        ? () => mutate((b) => moveReelStripGenerationLiteralSymbolAt(b, reelIndex, position, position + 1))
                                        : undefined
                                }
                            />
                        </Group>
                    </List.Item>
                ))}
            </List>
            <QuickActions>
                <TextInput
                    placeholder="New symbol id"
                    aria-label={`New symbol id for reel ${reelIndex + 1}`}
                    value={newSymbolId}
                    onChange={(event) => setNewSymbolId(event.currentTarget.value)}
                />
                <Button
                    variant="default"
                    aria-label={`Add symbol to reel ${reelIndex + 1}`}
                    onClick={() => {
                        const id = newSymbolId.trim();
                        if (id.length === 0) {
                            return;
                        }
                        mutate((b) => addReelStripGenerationLiteralSymbol(b, reelIndex, id));
                        setNewSymbolId("");
                    }}
                >
                    Add symbol
                </Button>
            </QuickActions>
        </div>
    );
}

function SourceTable({
    reelIndex,
    entry,
    symbols,
    mutate,
}: {
    reelIndex: number;
    entry: Record<string, unknown>;
    symbols: string[];
    mutate: BlueprintMutate;
}) {
    const mode = getReelStripGenerationSourceMode(entry);
    const label = mode === "symbolCounts" ? "Count" : "Weight";
    const values = asRecord(mode === "symbolCounts" ? entry.symbolCounts : entry.symbolWeights);
    const [newSymbol, setNewSymbol] = useState<string | null>(null);
    const [newValue, setNewValue] = useState<number | string>("");

    const setValue = (symbolId: string, value: number): void => {
        mutate((b) => (mode === "symbolCounts" ? setReelStripGenerationSymbolCount(b, reelIndex, symbolId, value) : setReelStripGenerationSymbolWeight(b, reelIndex, symbolId, value)));
    };
    const removeValue = (symbolId: string): void => {
        mutate((b) => (mode === "symbolCounts" ? removeReelStripGenerationSymbolCount(b, reelIndex, symbolId) : removeReelStripGenerationSymbolWeight(b, reelIndex, symbolId)));
    };

    return (
        <div>
            <Table.ScrollContainer minWidth={320}>
                <Table>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Symbol</Table.Th>
                            <Table.Th>{label}</Table.Th>
                            <Table.Th />
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {Object.entries(values).map(([symbolId, value]) =>
                            typeof value === "number" ? (
                                <Table.Tr key={symbolId}>
                                    <Table.Td>{symbolId}</Table.Td>
                                    <Table.Td>
                                        <NumberInput
                                            aria-label={`${symbolId} ${label.toLowerCase()}`}
                                            step={mode === "symbolCounts" ? 1 : undefined}
                                            defaultValue={value}
                                            onBlur={(event) => {
                                                const parsed = Number(event.currentTarget.value);
                                                if (Number.isFinite(parsed)) {
                                                    setValue(symbolId, parsed);
                                                }
                                            }}
                                        />
                                    </Table.Td>
                                    <Table.Td>
                                        <RowActions itemLabel={`${symbolId} ${label.toLowerCase()}`} onRemove={() => removeValue(symbolId)} />
                                    </Table.Td>
                                </Table.Tr>
                            ) : null,
                        )}
                    </Table.Tbody>
                </Table>
            </Table.ScrollContainer>
            <QuickActions>
                <Select aria-label="Symbol" data={symbols} value={newSymbol} onChange={setNewSymbol} />
                <NumberInput aria-label={label} placeholder={label} step={mode === "symbolCounts" ? 1 : undefined} value={newValue} onChange={setNewValue} />
                <Button
                    variant="default"
                    onClick={() => {
                        const value = Number(newValue);
                        if (newSymbol === null || newSymbol.length === 0 || !Number.isFinite(value)) {
                            return;
                        }
                        setValue(newSymbol, value);
                    }}
                >
                    {mode === "symbolCounts" ? "Add count" : "Add weight"}
                </Button>
            </QuickActions>
        </div>
    );
}

function LockedPositions({
    reelIndex,
    entry,
    symbols,
    mutate,
}: {
    reelIndex: number;
    entry: Record<string, unknown>;
    symbols: string[];
    mutate: BlueprintMutate;
}) {
    const locked = asRecord(entry.lockedPositions);
    const [position, setPosition] = useState<number | string>("");
    const [symbol, setSymbol] = useState<string | null>(null);

    return (
        <PageSection legend="Locked positions">
            <Table.ScrollContainer minWidth={320}>
                <Table>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Position</Table.Th>
                            <Table.Th>Symbol</Table.Th>
                            <Table.Th />
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {Object.entries(locked).map(([pos, symbolId]) =>
                            typeof symbolId === "string" ? (
                                <Table.Tr key={pos}>
                                    <Table.Td>{pos}</Table.Td>
                                    <Table.Td>{symbolId}</Table.Td>
                                    <Table.Td>
                                        <RowActions
                                            itemLabel={`locked position ${pos} for reel ${reelIndex + 1}`}
                                            onRemove={() => mutate((b) => removeReelStripGenerationLockedPosition(b, reelIndex, Number(pos)))}
                                        />
                                    </Table.Td>
                                </Table.Tr>
                            ) : null,
                        )}
                    </Table.Tbody>
                </Table>
            </Table.ScrollContainer>
            <QuickActions>
                <NumberInput
                    placeholder="Position"
                    aria-label={`Position to lock for reel ${reelIndex + 1}`}
                    min={0}
                    step={1}
                    value={position}
                    onChange={setPosition}
                />
                <Select aria-label={`Symbol to lock for reel ${reelIndex + 1}`} data={symbols} value={symbol} onChange={setSymbol} />
                <Button
                    variant="default"
                    onClick={() => {
                        const positionValue = Number(position);
                        if (!Number.isInteger(positionValue) || symbol === null || symbol.length === 0) {
                            return;
                        }
                        mutate((b) => setReelStripGenerationLockedPosition(b, reelIndex, positionValue, symbol));
                    }}
                >
                    Lock position
                </Button>
            </QuickActions>
        </PageSection>
    );
}

function ConstraintsEditor({reelIndex, entry, mutate}: {reelIndex: number; entry: Record<string, unknown>; mutate: BlueprintMutate}) {
    const [error, setError] = useState<string>();
    const initialText = Array.isArray(entry.constraints) ? JSON.stringify(entry.constraints, null, 2) : "";

    return (
        <PageSection legend="Constraints (JSON array)">
            <Textarea
                rows={4}
                defaultValue={initialText}
                aria-label={`Constraints for reel ${reelIndex + 1}`}
                onBlur={(event) => {
                    const result = parseReelStripGenerationConstraintsJson(event.currentTarget.value);
                    if (!result.ok) {
                        setError(result.error);
                        return;
                    }
                    setError(undefined);
                    mutate((b) => setReelStripGenerationConstraints(b, reelIndex, result.constraints));
                }}
            />
            {error && <ErrorState message={error} />}
        </PageSection>
    );
}

function GeneratedEditor({
    reelIndex,
    entry,
    symbols,
    mutate,
    drafts,
}: {
    reelIndex: number;
    entry: Record<string, unknown>;
    symbols: string[];
    mutate: BlueprintMutate;
    drafts: ReelStripGenerationDraftsRef;
}) {
    const sourceMode = getReelStripGenerationSourceMode(entry);

    return (
        <div>
            <QuickActions>
                <NumberInput
                    label="Length"
                    min={1}
                    step={1}
                    defaultValue={typeof entry.length === "number" ? entry.length : undefined}
                    onBlur={(event) => {
                        const value = Number(event.currentTarget.value);
                        if (Number.isFinite(value)) {
                            mutate((b) => setReelStripGenerationLength(b, reelIndex, value));
                        }
                    }}
                />
                <NumberInput
                    label="Seed"
                    step={1}
                    defaultValue={typeof entry.seed === "number" ? entry.seed : undefined}
                    onBlur={(event) => {
                        const value = Number(event.currentTarget.value);
                        if (Number.isFinite(value)) {
                            mutate((b) => setReelStripGenerationSeed(b, reelIndex, value));
                        }
                    }}
                />
                <NumberInput
                    label="Max attempts"
                    placeholder="default"
                    min={1}
                    step={1}
                    defaultValue={typeof entry.maxAttempts === "number" ? entry.maxAttempts : undefined}
                    onBlur={(event) => {
                        const raw = event.currentTarget.value.trim();
                        mutate((b) => setReelStripGenerationMaxAttempts(b, reelIndex, raw.length === 0 ? undefined : Number(raw)));
                    }}
                />
            </QuickActions>

            <Radio.Group
                value={sourceMode}
                onChange={(value) => mutate((b) => setReelStripGenerationSourceMode(b, drafts.current, reelIndex, value as "symbolCounts" | "symbolWeights"))}
            >
                <Group gap="md" mb="sm">
                    <Radio value="symbolCounts" label="Counts" />
                    <Radio value="symbolWeights" label="Weights" />
                </Group>
            </Radio.Group>

            <SourceTable reelIndex={reelIndex} entry={entry} symbols={symbols} mutate={mutate} />
            <LockedPositions reelIndex={reelIndex} entry={entry} symbols={symbols} mutate={mutate} />
            <ConstraintsEditor reelIndex={reelIndex} entry={entry} mutate={mutate} />
        </div>
    );
}

function DiagnosticsList({diagnostics}: {diagnostics: ReelStripGenerationDiagnostic[]}) {
    if (diagnostics.length === 0) {
        return null;
    }
    return (
        <PageSection legend={`Generation attempts (${diagnostics.length})`}>
            {diagnostics.map((diagnostic) => (
                <div key={diagnostic.attempt}>
                    <Text size="sm">
                        Attempt {diagnostic.attempt}
                        {diagnostic.accepted ? " — accepted" : ""}
                        {diagnostic.score !== undefined ? ` (score ${diagnostic.score})` : ""}
                    </Text>
                    {diagnostic.violations.length > 0 && (
                        <List size="sm" spacing={2} mb="xs">
                            {diagnostic.violations.map((violation, index) => (
                                <List.Item key={index}>
                                    {violation.constraintId}: {violation.message}
                                </List.Item>
                            ))}
                        </List>
                    )}
                </div>
            ))}
        </PageSection>
    );
}

function AnalysisTable({analysis}: {analysis: ReelStripAnalysis}) {
    const symbolIds = Object.keys(analysis.symbolCounts);
    if (symbolIds.length === 0) {
        return <EmptyState message="No symbols on this strip yet." />;
    }
    return (
        <Table.ScrollContainer minWidth={480}>
            <Table>
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Symbol</Table.Th>
                        <Table.Th>Count</Table.Th>
                        <Table.Th>Frequency</Table.Th>
                        <Table.Th>Min circular distance</Table.Th>
                        <Table.Th>Max circular distance</Table.Th>
                        <Table.Th>Max consecutive</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {symbolIds.map((symbolId) => (
                        <Table.Tr key={symbolId}>
                            <Table.Td>{symbolId}</Table.Td>
                            <Table.Td>{analysis.symbolCounts[symbolId]}</Table.Td>
                            <Table.Td>{(analysis.symbolFrequencies[symbolId] ?? 0).toFixed(3)}</Table.Td>
                            <Table.Td>{analysis.minimumCircularDistances[symbolId] ?? "—"}</Table.Td>
                            <Table.Td>{analysis.maximumCircularDistances[symbolId] ?? "—"}</Table.Td>
                            <Table.Td>{analysis.maximumConsecutiveOccurrences[symbolId] ?? "—"}</Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
        </Table.ScrollContainer>
    );
}

function AdvancedReelDetails({draftEntry, reelPreview}: {draftEntry: Record<string, unknown>; reelPreview: StudioReelStripGenerationReelView | undefined}) {
    const [opened, {toggle}] = useDisclosure(false);
    return (
        <div>
            <Text size="sm" mt="sm">
                <Anchor component="button" type="button" onClick={toggle}>
                    {opened ? "Hide" : "Show"} advanced details (raw draft config, raw preview response)
                </Anchor>
            </Text>
            {opened && (
                <PageSection legend="Advanced details">
                    <Text size="sm" fw={600} mb={4}>
                        Draft reelStripGeneration entry
                    </Text>
                    <CodeBlock>{JSON.stringify(draftEntry, null, 2)}</CodeBlock>
                    {reelPreview && (
                        <div>
                            <Text size="sm" fw={600} mt="sm" mb={4}>
                                Raw preview response for this reel
                            </Text>
                            <CodeBlock>{JSON.stringify(reelPreview, null, 2)}</CodeBlock>
                        </div>
                    )}
                </PageSection>
            )}
        </div>
    );
}

// The Reel Strip Modeler -- the app's most complex sub-feature. Select reel -> Edit or generate ->
// Inspect diagnostics -> Preview stop windows -> Apply: every reel is edited as a local draft (a plain
// clone of its own reelStripGeneration entry) that never touches the shared blueprint until the explicit
// Apply action commits it via applyReelStripGenerationEntry -- Check & Preview, diagnostics, the
// frequency/statistics summary, and the stop-window visualization all run against this draft (spliced
// into a throwaway copy of the real blueprint for the actual API call), never the applied blueprint
// itself, so freely experimenting with a reel's config can never leave a half-edited blueprint behind.
// `revision` is BlueprintEditorState's own monotonic counter (see blueprintEditorState.ts); any change to
// it invalidates a previously-shown preview (an edit elsewhere in the form may affect this reel's own
// blueprint-level errors/warnings) without discarding the current reel's own in-progress draft. A
// wholesale blueprint replace (New/Load) instead remounts this whole component via the parent's own
// `key={formGeneration}` (see useBlueprintEditor's own doc comment), which is what resets reel
// selection/draft/preview back to nothing on a genuinely different blueprint.
export function ReelStripGenerationEditor({
    blueprint,
    mutate,
    drafts,
    revision,
}: {
    blueprint: Record<string, unknown>;
    mutate: BlueprintMutate;
    drafts: ReelStripGenerationDraftsRef;
    revision: number;
}) {
    const fetchImpl = useStudioApi();
    const confirm = useConfirm();
    const entries = asReelStripGenerationEntries(blueprint.reelStripGeneration);
    const symbols = asStringList(blueprint.symbols);
    const defaultRows = typeof blueprint.rows === "number" && blueprint.rows > 0 ? blueprint.rows : 3;

    const [activeStep, setActiveStep] = useState(0);
    const [selectedReelIndex, setSelectedReelIndex] = useState<number>();
    const [draftEntry, setDraftEntry] = useState<Record<string, unknown>>();
    const [preview, setPreview] = useState<ReelStripGenerationPreviewView>({status: "idle"});
    const [stop, setStop] = useState<number | string>(0);
    const [rows, setRows] = useState<number>(defaultRows);
    const resolveGuard = useDoubleSubmitGuard();

    // A local staleness signal alongside `revision` -- reel switches and draft edits don't touch the
    // shared blueprint (so they never bump `revision`), but must still invalidate a Check & Preview
    // request already in flight for a *different* reel or an *earlier* draft. Bumped by selectReel()
    // below; `revision` itself (via revisionRef) still catches an edit elsewhere in the form.
    const requestIdRef = useRef(0);
    const revisionRef = useRef(revision);
    useEffect(() => {
        revisionRef.current = revision;
    }, [revision]);

    const appliedEntry = selectedReelIndex !== undefined ? entries[selectedReelIndex] : undefined;
    const isDirty = draftEntry !== undefined && appliedEntry !== undefined && hasReelStripGenerationDraftChanged(draftEntry, appliedEntry);

    // Any blueprint change invalidates a previously shown preview -- it described the blueprint as it
    // was *before* this change, same contract the old flat editor already had. Never touches the current
    // reel selection or its own draft: an edit elsewhere in the form (e.g. adding a symbol) has nothing
    // to do with in-progress work on this reel, it only means that work needs re-checking.
    useEffect(() => {
        requestIdRef.current++;
        setPreview({status: "idle"});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [revision]);

    // A reel disappearing from the registry (fewer reels configured elsewhere, e.g. "Reels" reduced in
    // Layout) leaves nothing left to model -- back to Select reel, same "the previously selected item is
    // gone" reasoning the Deployment tab's own refreshTargets() uses for a removed target.
    useEffect(() => {
        if (selectedReelIndex !== undefined && entries[selectedReelIndex] === undefined) {
            setSelectedReelIndex(undefined);
            setDraftEntry(undefined);
            setActiveStep(0);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entries.length, selectedReelIndex]);

    function selectReel(reelIndex: number): void {
        const proceed = (): void => {
            requestIdRef.current++;
            setSelectedReelIndex(reelIndex);
            setDraftEntry(cloneRecord(entries[reelIndex]));
            setPreview({status: "idle"});
            setStop(0);
            setRows(defaultRows);
            setActiveStep(1);
        };
        if (isDirty && selectedReelIndex !== undefined) {
            confirm(`Reel ${selectedReelIndex + 1} has unapplied changes. Discard them and switch to Reel ${reelIndex + 1}?`, proceed);
        } else {
            proceed();
        }
    }

    // Every field editor above still calls `mutate((b) => someSetter(b, reelIndex, ...))` completely
    // unchanged -- this just points that same call at a scratch stand-in built from the *current* draft
    // (see makeScratchBlueprint) instead of the shared blueprint, and reads the result back out.
    const localMutate: BlueprintMutate = (fn) => {
        if (selectedReelIndex === undefined) {
            return;
        }
        setDraftEntry((prevEntry) => {
            if (prevEntry === undefined) {
                return prevEntry;
            }
            const scratch = makeScratchBlueprint(selectedReelIndex, cloneRecord(prevEntry));
            fn(scratch);
            return (scratch.reelStripGeneration as Record<string, unknown>[])[selectedReelIndex];
        });
    };

    function checkAndPreview(): void {
        if (selectedReelIndex === undefined || draftEntry === undefined || !resolveGuard.begin()) {
            return;
        }
        const requestId = ++requestIdRef.current;
        const requestedRevision = revision;
        const isStale = (): boolean => requestId !== requestIdRef.current || isStaleReelStripGenerationRequest(requestedRevision, revisionRef.current);
        const scratchEntries = [...entries];
        scratchEntries[selectedReelIndex] = draftEntry;
        const previewBlueprint = {...blueprint, reelStripGeneration: scratchEntries};

        setPreview({status: "loading"});
        previewReelStripGeneration(fetchImpl, previewBlueprint)
            .then((result) => {
                if (isStale()) {
                    return;
                }
                setPreview(result);
                setStop(0);
                setActiveStep(2);
            })
            .catch((error: unknown) => {
                if (isStale()) {
                    return;
                }
                setPreview({status: "error", message: errorMessage(error)});
            })
            .finally(() => resolveGuard.end());
    }

    function applyDraft(): void {
        if (selectedReelIndex === undefined || draftEntry === undefined) {
            return;
        }
        mutate((b) => applyReelStripGenerationEntry(b, selectedReelIndex, draftEntry));
    }

    function discardDraft(): void {
        if (appliedEntry === undefined) {
            return;
        }
        setDraftEntry(cloneRecord(appliedEntry));
        setPreview({status: "idle"});
    }

    const reelPreview: StudioReelStripGenerationReelView | undefined =
        preview.status === "ok" && selectedReelIndex !== undefined ? preview.reels.find((r) => r.reelIndex === selectedReelIndex) : undefined;
    const resolvedReelPreview = reelPreview !== undefined && (reelPreview.type === "literal" || reelPreview.success) ? reelPreview : undefined;
    const strip = resolvedReelPreview?.strip;
    const analysis = resolvedReelPreview?.analysis;

    const editReachable = selectedReelIndex !== undefined;
    const diagnosticsReachable = selectedReelIndex !== undefined && preview.status !== "idle" && preview.status !== "loading";
    const stopWindowReachable = diagnosticsReachable && strip !== undefined;

    const stopValue = typeof stop === "number" ? stop : 0;
    const window = strip !== undefined ? computeReelStopWindow(strip, stopValue, rows) : [];

    return (
        <div>
            <Text size="sm" c="dimmed" mb="sm">
                Each reel is independently a literal strip or a generated one (own length, seed, counts/weights,
                locked positions, constraints). Editing a reel here never touches the blueprint until you explicitly
                Apply it — Check &amp; Preview always runs the same core generation/analysis API &quot;pokie
                build&quot; itself uses, purely in memory.
            </Text>

            <Stepper active={activeStep} onStepClick={setActiveStep} mb="md" size="sm">
                <Stepper.Step label="Select reel" description="Which reel" />
                <Stepper.Step label="Edit or generate" description="Literal or generated" disabled={!editReachable} />
                <Stepper.Step label="Inspect diagnostics" description="Validation" disabled={!diagnosticsReachable} />
                <Stepper.Step label="Preview stop windows" description="Screen window" disabled={!stopWindowReachable} />
                <Stepper.Step label="Apply" description="Commit or discard" disabled={!editReachable} />
            </Stepper>

            {activeStep === 0 &&
                (entries.length === 0 ? (
                    <EmptyState message="No reels configured yet." />
                ) : (
                    <List listStyleType="none" spacing="sm">
                        {entries.map((entry, reelIndex) => (
                            <List.Item key={reelIndex}>
                                <Group gap="sm">
                                    <Text fw={600}>Reel {reelIndex + 1}</Text>
                                    <Text size="sm" c="dimmed">
                                        {describeReelStripGenerationEntrySummary(entry)}
                                    </Text>
                                    {reelIndex === selectedReelIndex && isDirty && (
                                        <Badge size="sm" color="yellow">
                                            Unapplied changes
                                        </Badge>
                                    )}
                                    <Button
                                        size="xs"
                                        aria-label={`Select reel ${reelIndex + 1}`}
                                        variant={reelIndex === selectedReelIndex ? "filled" : "default"}
                                        onClick={() => selectReel(reelIndex)}
                                    >
                                        {reelIndex === selectedReelIndex ? "Selected" : "Select"}
                                    </Button>
                                </Group>
                            </List.Item>
                        ))}
                    </List>
                ))}

            {activeStep === 1 &&
                (selectedReelIndex === undefined || draftEntry === undefined ? (
                    <EmptyState message="Select a reel first." />
                ) : (
                    <div>
                        <Group gap="sm" mb="sm">
                            <Text fw={600}>Reel {selectedReelIndex + 1}</Text>
                            {isDirty && (
                                <Badge size="sm" color="yellow">
                                    Unapplied changes
                                </Badge>
                            )}
                        </Group>
                        <Radio.Group
                            value={draftEntry.type === "generated" ? "generated" : "literal"}
                            onChange={(value) => localMutate((b) => setReelStripGenerationEntryType(b, drafts.current, selectedReelIndex, value as "literal" | "generated"))}
                        >
                            <Group gap="md" mb="sm">
                                <Radio value="literal" label="Literal" />
                                <Radio value="generated" label="Generated" />
                            </Group>
                        </Radio.Group>
                        {draftEntry.type === "generated" ? (
                            <GeneratedEditor reelIndex={selectedReelIndex} entry={draftEntry} symbols={symbols} mutate={localMutate} drafts={drafts} />
                        ) : (
                            <LiteralStripEditor reelIndex={selectedReelIndex} entry={draftEntry} mutate={localMutate} />
                        )}

                        <QuickActions>
                            <Button onClick={checkAndPreview} loading={preview.status === "loading"}>
                                Check &amp; preview
                            </Button>
                        </QuickActions>
                        {preview.status === "loading" && <LoadingState label="Working…" />}
                        {preview.status === "error" && <ErrorState message={preview.message} />}
                    </div>
                ))}

            {activeStep === 2 &&
                (!diagnosticsReachable || preview.status !== "ok" ? (
                    <EmptyState message="Run Check & preview from Edit or generate first." />
                ) : (
                    <div>
                        {preview.errors.length > 0 && (
                            <IssueList title={`This blueprint has ${preview.errors.length} configuration issue(s) elsewhere`} issues={preview.errors} />
                        )}
                        {preview.warnings.length > 0 && <IssueList title="Warnings" issues={preview.warnings} />}

                        {reelPreview === undefined && (
                            <Alert color="orange" variant="light" icon={<IconAlertTriangle size={16} />} title="Invalid reel configuration" mb="sm">
                                This reel&apos;s own configuration isn&apos;t well-formed yet — check the fields on Edit or generate.
                            </Alert>
                        )}
                        {reelPreview !== undefined && reelPreview.type === "literal" && (
                            <Alert color="green" variant="light" icon={<IconCircleCheck size={16} />} title="Literal strip" mb="sm">
                                Sequence: {reelPreview.strip.join(", ")}
                            </Alert>
                        )}
                        {reelPreview !== undefined && reelPreview.type === "generated" && reelPreview.success && (
                            <Alert color="green" variant="light" icon={<IconCircleCheck size={16} />} title="Generated successfully" mb="sm">
                                Satisfied every constraint after {reelPreview.attemptsUsed} attempt(s).
                            </Alert>
                        )}
                        {reelPreview !== undefined && reelPreview.type === "generated" && !reelPreview.success && (
                            <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />} title="Generation failed" mb="sm">
                                Could not satisfy every constraint after {reelPreview.attemptsUsed} attempt(s).
                            </Alert>
                        )}
                        {reelPreview !== undefined && reelPreview.type === "generated" && <DiagnosticsList diagnostics={reelPreview.diagnostics} />}

                        {stopWindowReachable && (
                            <QuickActions>
                                <Button onClick={() => setActiveStep(3)}>Continue to preview stop windows</Button>
                            </QuickActions>
                        )}

                        <AdvancedReelDetails draftEntry={draftEntry ?? {}} reelPreview={reelPreview} />
                    </div>
                ))}

            {activeStep === 3 &&
                (!stopWindowReachable || strip === undefined || analysis === undefined ? (
                    <EmptyState message="No resolved strip to preview yet -- check compatibility first." />
                ) : (
                    <div>
                        <PageSection legend="Frequency & statistics">
                            <AnalysisTable analysis={analysis} />
                        </PageSection>

                        <PageSection legend="Stop window preview">
                            <Text size="sm" c="dimmed" mb="sm">
                                Shows the symbols this reel would display if it stopped at the given position,
                                wrapping around to the start of the strip once it runs past the end.
                            </Text>
                            <QuickActions>
                                <NumberInput
                                    label="Stop position"
                                    min={0}
                                    max={strip.length - 1}
                                    step={1}
                                    value={stop}
                                    onChange={setStop}
                                />
                                <NumberInput label="Visible rows" min={1} step={1} value={rows} onChange={(value) => setRows(typeof value === "number" ? value : defaultRows)} />
                            </QuickActions>
                            <ScreenTable screen={window.map((symbolId) => [symbolId])} />
                        </PageSection>

                        <QuickActions>
                            <Button onClick={() => setActiveStep(4)}>Continue to Apply</Button>
                        </QuickActions>

                        <AdvancedReelDetails draftEntry={draftEntry ?? {}} reelPreview={reelPreview} />
                    </div>
                ))}

            {activeStep === 4 &&
                (selectedReelIndex === undefined || draftEntry === undefined ? (
                    <EmptyState message="Select a reel first." />
                ) : (
                    <div>
                        <Text size="sm" mb="sm">
                            {isDirty
                                ? `Reel ${selectedReelIndex + 1} has unapplied changes.`
                                : `Reel ${selectedReelIndex + 1}'s draft matches what's already in the blueprint — nothing to apply.`}
                        </Text>
                        <QuickActions>
                            <Button onClick={applyDraft} disabled={!isDirty}>
                                Apply
                            </Button>
                            <Button variant="default" color="red" onClick={discardDraft} disabled={!isDirty}>
                                Discard
                            </Button>
                        </QuickActions>
                    </div>
                ))}
        </div>
    );
}
