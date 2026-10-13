import {retainWholeSequenceDraft} from "../../domain/blueprintFormOps";
import {Alert, Button, Group, Select, Table, Text, Textarea, TextInput} from "@mantine/core";
import {useEffect, useRef, useState} from "react";
import {WeightedSymbolsSequence} from "../../../../../src/session/videoslot/combinations/WeightedSymbolsSequence";
import type {WeightedSequenceVariant} from "../../../../../src/session/videoslot/combinations/WeightedSequenceVariant";
import {validateBlueprintReelSequences} from "../../../../../src/generated/validateBlueprintReelSequences";
import {previewGameModel, validateBlueprint} from "../../api/apiClient";
import {useStudioApi} from "../../context/StudioApiProvider";
import type {BlueprintMutate, ReelGenerationModeDraftsRef} from "../../hooks/useBlueprintEditor";
import {useConfirm} from "../../hooks/useConfirm";
import {PageSection} from "../common/PageSection";

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}
function record(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
function definitions(value: unknown): Record<string, unknown>[] {
    return Array.isArray(value) ? value.map(record) : [];
}
function relativeWeight(value: unknown): unknown {
    if (typeof value !== "string") return value;
    return value.trim() ? Number(value) : NaN;
}
function payload(draft: Record<string, unknown>[]): Record<string, unknown>[] {
    return draft.map((reel) =>
        reel.type === "weighted"
            ? {
                ...reel,
                variants: definitions(reel.variants).map((variant) => ({
                    ...variant,
                    weight: relativeWeight(variant.weight),
                })),
            }
            : reel,
    );
}

/** Inspection never selects a runtime strip. Apply changes the Blueprint draft; Save owns disk. */
export function WholeSequencesEditor({
    blueprint,
    mutate,
    revision,
    modeDrafts,
    onDirtyChange,
}: {
    blueprint: Record<string, unknown>;
    mutate: BlueprintMutate;
    revision: number;
    modeDrafts: ReelGenerationModeDraftsRef;
    onDirtyChange?: (dirty: boolean) => void;
}) {
    const fetchImpl = useStudioApi();
    const confirm = useConfirm();
    const [draft, setDraft] = useState(() => clone(definitions(blueprint.reelSequences)));
    const [ready, setReady] = useState(false);
    const [selected, setSelected] = useState(0);
    const [busy, setBusy] = useState(false);
    const [previewIdentity, setPreviewIdentity] = useState<string>();
    const [message, setMessage] = useState<string>();
    const request = useRef(0);
    const controller = useRef<AbortController | undefined>(undefined);
    const authored = JSON.stringify(blueprint.reelSequences);
    const candidate = {...blueprint, reelSequences: payload(draft)};
    const identity = JSON.stringify({revision, selected, candidate});
    const dirty = JSON.stringify(payload(draft)) !== authored;
    const errors = validateBlueprintReelSequences(candidate);
    const latest = useRef(identity);
    const previousSource = useRef(authored);
    useEffect(() => {
        if (previousSource.current !== authored && modeDrafts.current.wholeSequenceDraft?.dirty === false) {
            // An applied source update (for example a symbol rename) is authoritative when there
            // is no local edit. A dirty local definition remains available for correction/discard.
            setDraft(clone(definitions(blueprint.reelSequences)));
        }
        previousSource.current = authored;
    }, [authored, blueprint.reelSequences, modeDrafts]);
    useEffect(() => {
        latest.current = identity;
        request.current++;
        controller.current?.abort();
        setBusy(false);
        setPreviewIdentity(undefined);
    }, [identity]);
    useEffect(() => {
        const retained = modeDrafts.current.wholeSequenceDraft;
        if (retained?.base === JSON.stringify(blueprint.reelSequences)) setDraft(clone(retained.definitions));
        setReady(true);
        // The owning editor remounts on wholesale replacement; ordinary revisions keep local edits.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => {
        if (!ready) return;
        onDirtyChange?.(dirty);
        retainWholeSequenceDraft(modeDrafts.current, clone(draft), authored, dirty);
    }, [draft, authored, dirty, modeDrafts, onDirtyChange, ready]);
    useEffect(
        () => () => {
            request.current++;
            controller.current?.abort();
        },
        [],
    );
    const invalidate = (): void => {
        request.current++;
        controller.current?.abort();
        setBusy(false);
        setPreviewIdentity(undefined);
        setMessage(undefined);
    };
    const edit = (change: (next: Record<string, unknown>[]) => void): void => {
        invalidate();
        const next = clone(draft);
        change(next);
        // Publish event-time dirtiness before async Save/Open completion can observe it.
        const nextDirty = JSON.stringify(payload(next)) !== authored;
        retainWholeSequenceDraft(modeDrafts.current, clone(next), authored, nextDirty);
        onDirtyChange?.(nextDirty);
        setDraft(next);
    };
    const inspect = async (): Promise<void> => {
        invalidate();
        if (errors.length) {
            setMessage(errors.join("\n"));
            return;
        }
        const id = ++request.current;
        const expected = identity;
        controller.current = new AbortController();
        const signal = controller.current.signal;
        setBusy(true);
        try {
            const validation = await validateBlueprint(fetchImpl, candidate, signal);
            if (id !== request.current || latest.current !== expected) return;
            if (validation.status === "invalid") {
                setMessage(validation.errors.map((issue) => issue.message).join("\n"));
                return;
            }
            await previewGameModel(fetchImpl, candidate, undefined, signal);
            if (id !== request.current || latest.current !== expected) return;
            setPreviewIdentity(expected);
            setMessage(
                "Complete definitions validated. Context: logical-round-v1; sampling: binary64-integer-ratios-v1. Variant inspection only; no simulation observations or live RNG draws.",
            );
        } catch (error) {
            if (id === request.current && latest.current === expected) setMessage(error instanceof Error ? error.message : String(error));
        } finally {
            if (id === request.current) setBusy(false);
        }
    };
    const reel = draft[selected];
    const variants = reel?.type === "weighted" ? definitions(reel.variants) : [];
    return (
        <PageSection legend="Whole-sequence editor">
            <Text>
                Relative weights need a positive total, and need not sum to 1 or 100. Apply updates this draft; Save
                game writes the authored source.
            </Text>
            <Select
                label="Sequence reel"
                data={draft.map((_, i) => ({value: String(i), label: `Reel ${i + 1}`}))}
                value={String(selected)}
                onChange={(value) => {
                    const select = (): void => {
                        invalidate();
                        setSelected(Number(value));
                    };
                    // Drafts for all reels are retained; switching only changes inspection.
                    select();
                }}
            />
            {reel && (
                <>
                    <Select
                        label="Sequence type"
                        value={String(reel.type)}
                        data={[
                            {value: "exact", label: "Exact ordered sequence"},
                            {value: "weighted", label: "Weighted whole sequences"},
                        ]}
                        onChange={(type) => {
                            const replace = (): void =>
                                edit((next) => {
                                    next[selected] = type === "exact" ? {type, symbols: []} : {type, variants: []};
                                });
                            confirm("Replace this reel's complete definition?", replace);
                        }}
                    />
                    {reel.type === "exact" && (
                        <Textarea
                            label="Exact ordered symbols (one per line)"
                            value={Array.isArray(reel.symbols) ? reel.symbols.join("\n") : ""}
                            onChange={(event) => {
                                const text = event.currentTarget.value;
                                edit((next) => {
                                    next[selected].symbols = text ? text.split("\n") : [];
                                });
                            }}
                        />
                    )}
                    {variants.map((variant, index) => (
                        <PageSection key={index} legend={`Variant ${index + 1}`}>
                            <TextInput
                                label={`Variant ${index + 1} ID`}
                                value={String(variant.id ?? "")}
                                onChange={(event) => {
                                    const text = event.currentTarget.value;
                                    edit((next) => {
                                        definitions(next[selected].variants)[index].id = text;
                                    });
                                }}
                            />
                            <TextInput
                                label={`Variant ${index + 1} relative weight`}
                                value={String(variant.weight ?? "")}
                                onChange={(event) => {
                                    const text = event.currentTarget.value;
                                    edit((next) => {
                                        definitions(next[selected].variants)[index].weight = text;
                                    });
                                }}
                            />
                            <Textarea
                                label={`Variant ${index + 1} ordered symbols (one per line)`}
                                value={Array.isArray(variant.symbols) ? variant.symbols.join("\n") : ""}
                                onChange={(event) => {
                                    const text = event.currentTarget.value;
                                    edit((next) => {
                                        definitions(next[selected].variants)[index].symbols = text
                                            ? text.split("\n")
                                            : [];
                                    });
                                }}
                            />
                            <Button
                                variant="default"
                                onClick={() =>
                                    edit((next) => {
                                        next[selected].variants = definitions(next[selected].variants).filter(
                                            (_, i) => i !== index,
                                        );
                                    })
                                }
                            >
                                Remove variant {index + 1}
                            </Button>
                        </PageSection>
                    ))}
                    {reel.type === "weighted" && (
                        <Button
                            onClick={() =>
                                edit((next) => {
                                    next[selected].variants = [
                                        ...definitions(next[selected].variants),
                                        {id: `variant-${variants.length + 1}`, weight: 1, symbols: []},
                                    ];
                                })
                            }
                        >
                            Add variant
                        </Button>
                    )}
                </>
            )}
            {errors.length > 0 && (
                <Alert color="red" title="Invalid whole sequences">
                    {errors.join("\n")}
                </Alert>
            )}
            {message && <Alert title="Sequence inspection">{message}</Alert>}
            {previewIdentity === identity && errors.length === 0 && (
                <PageSection legend="Inspected complete definitions">
                    {payload(draft).map((definition, reelIndex) => {
                        const alternatives =
                            definition.type === "weighted"
                                ? (definition.variants as WeightedSequenceVariant[])
                                : [{id: "exact", weight: 1, symbols: definition.symbols as string[]}];
                        const sequence =
                            definition.type === "weighted" ? new WeightedSymbolsSequence(alternatives) : undefined;
                        const probabilities = sequence?.getProbabilities() ?? [1];
                        const weights = sequence?.getIntegerWeights();
                        const denominator = weights?.reduce((sum, weight) => sum + weight, BigInt(0)).toString();
                        return (
                            <div key={reelIndex}>
                                <Text>
                                    Reel {reelIndex + 1}: {String(definition.type)}
                                </Text>
                                <Table>
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th>ID</Table.Th>
                                            <Table.Th>Relative weight</Table.Th>
                                            <Table.Th>Configured probability</Table.Th>
                                            <Table.Th>Ordered symbols</Table.Th>
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {alternatives.map((variant, i) => (
                                            <Table.Tr key={i}>
                                                <Table.Td>{variant.id}</Table.Td>
                                                <Table.Td>{variant.weight}</Table.Td>
                                                <Table.Td>
                                                    {probabilities[i] === 0 && variant.weight > 0
                                                        ? `${weights?.[i]}/${denominator}`
                                                        : probabilities[i]}
                                                </Table.Td>
                                                <Table.Td>{variant.symbols.join(" → ")}</Table.Td>
                                            </Table.Tr>
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            </div>
                        );
                    })}
                </PageSection>
            )}
            <Group mt="sm">
                <Button
                    onClick={() => {
                        inspect();
                    }}
                    loading={busy}
                    disabled={errors.length > 0}
                >
                    Preview whole sequences
                </Button>
                <Button
                    disabled={!dirty || previewIdentity !== identity || errors.length > 0 || busy}
                    onClick={() => {
                        if (previewIdentity !== identity || errors.length > 0) return;
                        mutate((next) => {
                            // A sibling buffered field may commit on blur before this activation renders.
                            if (JSON.stringify(next) !== JSON.stringify(blueprint)) return;
                            next.reelSequences = clone(payload(draft));
                        });
                        invalidate();
                    }}
                >
                    Apply whole sequences
                </Button>
                <Button
                    variant="default"
                    onClick={() => {
                        invalidate();
                        setDraft(clone(definitions(blueprint.reelSequences)));
                    }}
                >
                    Cancel sequence changes
                </Button>
            </Group>
        </PageSection>
    );
}
