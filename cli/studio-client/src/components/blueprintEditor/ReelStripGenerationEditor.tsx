import {Button, Group, List, NumberInput, Radio, Select, Table, Text, TextInput, Textarea} from "@mantine/core";
import {useEffect, useRef, useState} from "react";
import {previewReelStripGeneration} from "../../api/apiClient";
import type {ReelStripGenerationDiagnostic} from "../../api/types";
import {asStringList} from "../../domain/asStringList";
import {
    addReelStripGenerationLiteralSymbol,
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
import {isStaleReelStripGenerationRequest, type ReelStripGenerationPreviewView} from "../../domain/interpret/BlueprintEditor";
import {useStudioApi} from "../../context/StudioApiProvider";
import type {BlueprintMutate, ReelStripGenerationDraftsRef} from "../../hooks/useBlueprintEditor";
import {useDoubleSubmitGuard} from "../../hooks/useDoubleSubmitGuard";
import {BufferedTextInput} from "../common/BufferedTextInput";
import {ErrorState} from "../common/ErrorState";
import {IssueList} from "../common/IssueList";
import {LoadingState} from "../common/LoadingState";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";
import {RowActions} from "../common/RowActions";

function asRecord(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asReelStripGenerationEntries(value: unknown): Record<string, unknown>[] {
    return Array.isArray(value) ? value.map((entry) => asRecord(entry)) : [];
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

function ReelFieldset({
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
    const type = entry.type === "generated" ? "generated" : "literal";

    return (
        <PageSection legend={`Reel ${reelIndex + 1}`}>
            <Radio.Group value={type} onChange={(value) => mutate((b) => setReelStripGenerationEntryType(b, drafts.current, reelIndex, value as "literal" | "generated"))}>
                <Group gap="md" mb="sm">
                    <Radio value="literal" label="Literal" />
                    <Radio value="generated" label="Generated" />
                </Group>
            </Radio.Group>
            {type === "literal" ? (
                <LiteralStripEditor reelIndex={reelIndex} entry={entry} mutate={mutate} />
            ) : (
                <GeneratedEditor reelIndex={reelIndex} entry={entry} symbols={symbols} mutate={mutate} drafts={drafts} />
            )}
        </PageSection>
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

// The Reel Strip Modeler -- the app's most complex sub-feature. `revision` is BlueprintEditorState's
// own monotonic counter (see blueprintEditorState.ts); ANY change to it (a field edit, New, Load, or a
// successful JSON apply) both invalidates a previously-shown preview (see the idle-reset effect below)
// and is the stale-response guard "Resolve reels" checks its own response against.
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
    const entries = asReelStripGenerationEntries(blueprint.reelStripGeneration);
    const symbols = asStringList(blueprint.symbols);
    const [preview, setPreview] = useState<ReelStripGenerationPreviewView>({status: "idle"});
    const resolveGuard = useDoubleSubmitGuard();

    // Kept in sync with the latest `revision` on every render so the async resolve handler below can
    // read the *current* value at response time, not the one captured in its own closure at click time
    // -- see isStaleReelStripGenerationRequest's own doc comment.
    const revisionRef = useRef(revision);
    useEffect(() => {
        revisionRef.current = revision;
    }, [revision]);

    // Any blueprint change invalidates a previously shown preview -- it described the blueprint as it
    // was *before* this change.
    useEffect(() => {
        setPreview({status: "idle"});
    }, [revision]);

    const resolveReels = (): void => {
        if (!resolveGuard.begin()) {
            return;
        }
        const requestedRevision = revision;
        setPreview({status: "loading"});
        previewReelStripGeneration(fetchImpl, blueprint)
            .then((result) => {
                if (isStaleReelStripGenerationRequest(requestedRevision, revisionRef.current)) {
                    return;
                }
                setPreview(result);
            })
            .catch((error: unknown) => {
                if (isStaleReelStripGenerationRequest(requestedRevision, revisionRef.current)) {
                    return;
                }
                setPreview({status: "error", message: errorMessage(error)});
            })
            .finally(() => resolveGuard.end());
    };

    return (
        <div>
            <Text size="sm" c="dimmed" mb="sm">
                Each reel is independently a literal strip or a generated one (own length, seed, counts/weights, locked
                positions, constraints). Generation and validation always run through the same core API &quot;pokie
                build&quot; itself uses.
            </Text>

            {entries.map((entry, reelIndex) => (
                <ReelFieldset key={reelIndex} reelIndex={reelIndex} entry={entry} symbols={symbols} mutate={mutate} drafts={drafts} />
            ))}

            <QuickActions>
                <Button onClick={resolveReels} loading={preview.status === "loading"}>
                    Resolve reels
                </Button>
            </QuickActions>

            {preview.status === "loading" && <LoadingState label="Working…" />}
            {preview.status === "error" && <ErrorState message={preview.message} />}
            {preview.status === "ok" && (
                <div>
                    {preview.errors.length > 0 && <IssueList title={`Blueprint has ${preview.errors.length} error(s) elsewhere`} issues={preview.errors} />}
                    {preview.reels.map((reel) => (
                        <PageSection key={reel.reelIndex} legend={`Reel ${reel.reelIndex + 1} (${reel.type})`}>
                            {reel.type === "literal" || reel.success ? (
                                <>
                                    <Text size="sm" style={{overflowWrap: "anywhere"}}>
                                        Sequence: {reel.strip.join(", ")}
                                    </Text>
                                    <Text size="sm" style={{overflowWrap: "anywhere"}}>
                                        Symbol counts:{" "}
                                        {Object.entries(reel.analysis.symbolCounts)
                                            .map(([symbolId, count]) => `${symbolId}=${count}`)
                                            .join(", ")}
                                    </Text>
                                </>
                            ) : (
                                <Text size="sm">Failed to generate after {reel.attemptsUsed} attempt(s).</Text>
                            )}
                            {reel.type === "generated" && <DiagnosticsList diagnostics={reel.diagnostics} />}
                        </PageSection>
                    ))}
                </div>
            )}
        </div>
    );
}
