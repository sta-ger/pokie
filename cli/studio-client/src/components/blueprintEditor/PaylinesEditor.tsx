import {Button, Group, Stack, Text} from "@mantine/core";
import {addPayline, duplicatePaylineAt, movePaylineAt, removePaylineAt, setPaylineCell} from "../../domain/blueprintFormOps";
import type {BlueprintMutate} from "../../hooks/useBlueprintEditor";
import {BufferedNumberInput} from "../common/BufferedNumberInput";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";
import {RowActions} from "../common/RowActions";

function asPaylines(value: unknown): number[][] {
    return Array.isArray(value) ? value.map((line) => (Array.isArray(line) ? line.filter((cell): cell is number => typeof cell === "number") : [])) : [];
}

export function PaylinesEditor({blueprint, mutate}: {blueprint: Record<string, unknown>; mutate: BlueprintMutate}) {
    const paylines = asPaylines(blueprint.paylines);

    return (
        <PageSection legend="Paylines">
            <Text size="sm" c="dimmed" mb="sm">
                Optional — omit to use the engine&apos;s default (one horizontal line per row).
            </Text>
            <Stack gap="sm">
                {paylines.map((line, lineIndex) => (
                    <Group key={lineIndex} gap="xs">
                        {line.map((row, reelIndex) => (
                            <BufferedNumberInput
                                key={reelIndex}
                                aria-label={`Payline ${lineIndex + 1} reel ${reelIndex + 1} row`}
                                w={80}
                                min={0}
                                step={1}
                                value={row}
                                onCommit={(value) => {
                                    if (Number.isInteger(value)) {
                                        mutate((b) => setPaylineCell(b, lineIndex, reelIndex, value));
                                    }
                                }}
                            />
                        ))}
                        <RowActions
                            itemLabel={`payline ${lineIndex + 1}`}
                            onDuplicate={() => mutate((b) => duplicatePaylineAt(b, lineIndex))}
                            onRemove={() => mutate((b) => removePaylineAt(b, lineIndex))}
                            onMoveUp={lineIndex > 0 ? () => mutate((b) => movePaylineAt(b, lineIndex, lineIndex - 1)) : undefined}
                            onMoveDown={lineIndex < paylines.length - 1 ? () => mutate((b) => movePaylineAt(b, lineIndex, lineIndex + 1)) : undefined}
                        />
                    </Group>
                ))}
            </Stack>
            <QuickActions>
                <Button variant="default" onClick={() => mutate((b) => addPayline(b))}>
                    Add payline
                </Button>
            </QuickActions>
        </PageSection>
    );
}
