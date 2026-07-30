import {ActionIcon, Button, Group, Modal, ScrollArea, Stack, Table, Text, TextInput, Title} from "@mantine/core";
import {IconTrash} from "@tabler/icons-react";
import {useEffect, useState} from "react";
import {applyPaylineSet} from "../../domain/blueprintFormOps";
import {
    deleteCustomPaylineSet,
    listCustomPaylineSets,
    renameCustomPaylineSet,
    saveCustomPaylineSet,
    type CustomPaylineSet,
} from "../../domain/customPaylineSets";
import {
    computePaylineSetPreviewCounts,
    describePaylineSetCompatibility,
    groupPaylinePresetsByShape,
    PAYLINE_PRESETS,
    type PaylinePresetShapeGroup,
} from "../../domain/paylinePresets";
import type {BlueprintMutate} from "../../hooks/useBlueprintEditor";
import {BufferedTextInput} from "../common/BufferedTextInput";
import {QuickActions} from "../common/QuickActions";

function asPaylines(value: unknown): number[][] {
    return Array.isArray(value) ? value.map((line) => (Array.isArray(line) ? line.filter((cell): cell is number => typeof cell === "number") : [])) : [];
}

function lineCountLabel(lineCount: number): string {
    return `${lineCount} line${lineCount === 1 ? "" : "s"}`;
}

// A shaded reels×rows grid -- one cell per grid position, shaded by how many of the set's lines pass
// through it -- so someone can tell "3 horizontals" from "classic 9" at a glance without reading every
// line's raw row indexes.
function PaylineMiniPreview({lines, reels, rows}: {lines: number[][]; reels: number; rows: number}) {
    const counts = computePaylineSetPreviewCounts(lines, reels, rows);
    const maxCount = Math.max(1, ...counts.flat());
    return (
        <div
            role="img"
            aria-label={`Preview: ${reels} × ${rows}, ${lineCountLabel(lines.length)}`}
            style={{display: "grid", gridTemplateColumns: `repeat(${reels}, 12px)`, gridTemplateRows: `repeat(${rows}, 12px)`, gap: 2}}
        >
            {counts.flatMap((rowCounts, rowIndex) =>
                rowCounts.map((count, reelIndex) => (
                    <div
                        key={`${rowIndex}-${reelIndex}`}
                        style={{
                            width: 12,
                            height: 12,
                            borderRadius: 2,
                            backgroundColor: count === 0 ? "var(--mantine-color-gray-2)" : `rgba(34, 139, 230, ${0.3 + 0.7 * (count / maxCount)})`,
                        }}
                    />
                )),
            )}
        </div>
    );
}

// One shape's presets (e.g. every 5x3 layout) under a single heading -- every preset in the group shares
// the same declared reels/rows, so compatibility is computed once per group (from the group's own
// shape) instead of repeating the same reason text on every row.
function PresetShapeGroupSection({
    group,
    reels,
    rows,
    onApply,
}: {
    group: PaylinePresetShapeGroup;
    reels: number;
    rows: number;
    onApply: (lines: number[][], mode: "replace" | "append") => void;
}) {
    const compatibility = describePaylineSetCompatibility(group.reels, group.rows, reels, rows);

    return (
        <Stack gap={4} role="group" aria-label={`${group.reels} reels × ${group.rows} rows preset group`}>
            <Group gap="xs">
                <Text fw={500} size="sm">
                    {group.reels} reels × {group.rows} rows
                </Text>
                {!compatibility.compatible && (
                    <Text size="xs" c="red">
                        {compatibility.reason}
                    </Text>
                )}
            </Group>
            <Table verticalSpacing="xs">
                <Table.Tbody>
                    {group.presets.map((preset) => (
                        <Table.Tr key={preset.id}>
                            <Table.Td>
                                <PaylineMiniPreview lines={preset.lines} reels={preset.reels} rows={preset.rows} />
                            </Table.Td>
                            <Table.Td>
                                <Text size="sm">{preset.label}</Text>
                                <Text size="xs" c="dimmed">
                                    {lineCountLabel(preset.lines.length)}
                                </Text>
                            </Table.Td>
                            <Table.Td>
                                <Group gap="xs" wrap="nowrap">
                                    <Button size="xs" variant="default" disabled={!compatibility.compatible} onClick={() => onApply(preset.lines, "replace")}>
                                        Replace
                                    </Button>
                                    <Button size="xs" variant="default" disabled={!compatibility.compatible} onClick={() => onApply(preset.lines, "append")}>
                                        Append
                                    </Button>
                                </Group>
                            </Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
        </Stack>
    );
}

// Every "apply" action here (built-in preset or saved custom set) goes through applyPaylineSet's own
// Replace/Append split -- Replace swaps the list, Append only ever adds -- so this modal never has a
// third, silently-destructive path of its own. Any shape that isn't an exact reels/rows match (wrong
// reel count, or wrong row count either way) stays visible with the reason rather than being hidden,
// and their Replace/Append buttons are simply disabled -- see describePaylineSetCompatibility's own doc
// comment on why an incompatible set is never reshaped to fit. Shape groups matching the blueprint's
// current reels/rows sort first so the relevant choices don't require scrolling past the others.
export function PaylinePresetsModal({
    opened,
    onClose,
    blueprint,
    mutate,
}: {
    opened: boolean;
    onClose: () => void;
    blueprint: Record<string, unknown>;
    mutate: BlueprintMutate;
}) {
    const reels = typeof blueprint.reels === "number" ? blueprint.reels : 1;
    const rows = typeof blueprint.rows === "number" ? blueprint.rows : 1;
    const currentLines = asPaylines(blueprint.paylines);

    const [customSets, setCustomSets] = useState<CustomPaylineSet[]>([]);
    const [saveName, setSaveName] = useState("");

    useEffect(() => {
        if (opened) {
            setCustomSets(listCustomPaylineSets());
            setSaveName("");
        }
    }, [opened]);

    const shapeGroups = [...groupPaylinePresetsByShape(PAYLINE_PRESETS)].sort((a, b) => {
        const aCurrent = a.reels === reels && a.rows === rows;
        const bCurrent = b.reels === reels && b.rows === rows;
        if (aCurrent === bCurrent) {
            return 0;
        }
        return aCurrent ? -1 : 1;
    });

    function applyLines(lines: number[][], mode: "replace" | "append"): void {
        mutate((b) => applyPaylineSet(b, lines, mode));
        onClose();
    }

    function handleSave(): void {
        const name = saveName.trim();
        if (name.length === 0 || currentLines.length === 0) {
            return;
        }
        saveCustomPaylineSet(name, reels, rows, currentLines);
        setCustomSets(listCustomPaylineSets());
        setSaveName("");
    }

    function handleRename(set: CustomPaylineSet, value: string): void {
        const trimmed = value.trim();
        if (trimmed.length === 0 || trimmed === set.name) {
            return;
        }
        renameCustomPaylineSet(set.id, trimmed);
        setCustomSets(listCustomPaylineSets());
    }

    function handleDelete(set: CustomPaylineSet): void {
        deleteCustomPaylineSet(set.id);
        setCustomSets(listCustomPaylineSets());
    }

    return (
        <Modal opened={opened} onClose={onClose} title={<Title order={4}>Apply payline preset</Title>} size="lg">
            <Stack gap="md">
                <Text size="sm" c="dimmed">
                    Current layout: {reels} reels × {rows} rows. Replace swaps every payline for the preset&apos;s; Append adds the preset&apos;s lines to
                    what&apos;s already there.
                </Text>

                <ScrollArea.Autosize mah={320}>
                    <Stack gap="md">
                        {shapeGroups.map((group) => (
                            <PresetShapeGroupSection key={`${group.reels}x${group.rows}`} group={group} reels={reels} rows={rows} onApply={applyLines} />
                        ))}
                    </Stack>
                </ScrollArea.Autosize>

                <Stack gap="xs">
                    <Text fw={500} size="sm">
                        Custom sets
                    </Text>
                    {customSets.length === 0 && (
                        <Text size="xs" c="dimmed">
                            No saved custom sets yet -- build paylines above, then save them below to reuse later.
                        </Text>
                    )}
                    {customSets.length > 0 && (
                        <Table.ScrollContainer minWidth={480}>
                            <Table verticalSpacing="xs">
                                <Table.Tbody>
                                    {customSets.map((set) => {
                                        const compatibility = describePaylineSetCompatibility(set.reels, set.rows, reels, rows);
                                        return (
                                            <Table.Tr key={set.id}>
                                                <Table.Td>
                                                    <PaylineMiniPreview lines={set.lines} reels={set.reels} rows={set.rows} />
                                                </Table.Td>
                                                <Table.Td style={{minWidth: 180}}>
                                                    <BufferedTextInput
                                                        aria-label={`Custom set "${set.name}" name`}
                                                        value={set.name}
                                                        onCommit={(value) => handleRename(set, value)}
                                                    />
                                                    <Text size="xs" c="dimmed">
                                                        {set.reels} × {set.rows}, {lineCountLabel(set.lines.length)}
                                                    </Text>
                                                    {!compatibility.compatible && (
                                                        <Text size="xs" c="red">
                                                            {compatibility.reason}
                                                        </Text>
                                                    )}
                                                </Table.Td>
                                                <Table.Td>
                                                    <Group gap="xs" wrap="nowrap">
                                                        <Button
                                                            size="xs"
                                                            variant="default"
                                                            disabled={!compatibility.compatible}
                                                            onClick={() => applyLines(set.lines, "replace")}
                                                        >
                                                            Replace
                                                        </Button>
                                                        <Button
                                                            size="xs"
                                                            variant="default"
                                                            disabled={!compatibility.compatible}
                                                            onClick={() => applyLines(set.lines, "append")}
                                                        >
                                                            Append
                                                        </Button>
                                                        <ActionIcon variant="subtle" color="red" aria-label={`Delete custom set "${set.name}"`} onClick={() => handleDelete(set)}>
                                                            <IconTrash size={16} />
                                                        </ActionIcon>
                                                    </Group>
                                                </Table.Td>
                                            </Table.Tr>
                                        );
                                    })}
                                </Table.Tbody>
                            </Table>
                        </Table.ScrollContainer>
                    )}
                    <QuickActions>
                        <TextInput
                            placeholder="Name this layout"
                            aria-label="New custom set name"
                            value={saveName}
                            onChange={(event) => setSaveName(event.currentTarget.value)}
                        />
                        <Button variant="default" disabled={saveName.trim().length === 0 || currentLines.length === 0} onClick={handleSave}>
                            Save current paylines as custom set
                        </Button>
                    </QuickActions>
                </Stack>

                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>
                        Close
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}
