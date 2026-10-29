import {Button, Group, Text} from "@mantine/core";
import {useState} from "react";
import {addPayline, duplicatePaylineAt, movePaylineAt, removePaylineAt, setPaylineCell} from "../../domain/blueprintFormOps";
import type {BlueprintMutate} from "../../hooks/useBlueprintEditor";
import {BufferedNumberInput} from "../common/BufferedNumberInput";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";
import {RowActions} from "../common/RowActions";
import {PaylinePresetsModal} from "./PaylinePresetsModal";

function asPaylines(value: unknown): number[][] {
    return Array.isArray(value) ? value.map((line) => (Array.isArray(line) ? line.filter((cell): cell is number => typeof cell === "number") : [])) : [];
}

export function PaylinesEditor({blueprint, mutate}: {blueprint: Record<string, unknown>; mutate: BlueprintMutate}) {
    const paylines = asPaylines(blueprint.paylines);
    const previewRows = typeof blueprint.rows === "number" && Number.isInteger(blueprint.rows) && blueprint.rows > 0 ? blueprint.rows : 1;
    const [presetsOpened, setPresetsOpened] = useState(false);

    return (
        <PageSection legend="Paylines">
            <Text size="sm" c="dimmed" mb="sm">
                Optional — omit to use the engine&apos;s default (one horizontal line per row).
            </Text>
            {blueprint.screenGeometry !== undefined && <Text size="sm" mb="sm">Payline rows are evaluation-local. Edit screenGeometry in the JSON view; the form preserves it. Layout changes must also update that geometry.</Text>}
            <Text size="sm" fw={600} mb="sm">{paylines.length} authored {paylines.length === 1 ? "line" : "lines"} · row numbers start at 0</Text>
            <div className="studio-payline-grid">
                {paylines.map((line, lineIndex) => (
                    <fieldset key={lineIndex} className="studio-payline-card">
                        <legend>Payline {lineIndex + 1}</legend>
                        <Group justify="space-between" mb="sm">
                            {line.every(row => Number.isSafeInteger(row) && row >= 0) && <svg className="studio-payline-sketch" viewBox={`0 0 ${Math.max(1, line.length) * 24} 72`} aria-hidden="true" focusable="false">
                                {line.map((row, reel) => <circle key={reel} cx={12 + reel * 24} cy={12 + row * 48 / Math.max(1, previewRows - 1, ...line)} r="4" />)}
                                <polyline fill="none" stroke="currentColor" strokeWidth="2" points={line.map((row, reel) => `${12 + reel * 24},${12 + row * 48 / Math.max(1, previewRows - 1, ...line)}`).join(" ")} />
                            </svg>}
                            <Text size="sm" c="dimmed">Rows: {line.join(" → ") || "No reels"}</Text>
                        </Group>
                        <details className="studio-payline-edit">
                            <summary>Edit reel rows</summary>
                            <div className="studio-payline-cells">
                                {line.map((row, reelIndex) => (
                                    <BufferedNumberInput
                                        key={reelIndex}
                                        aria-label={`Payline ${lineIndex + 1} reel ${reelIndex + 1} row`}
                                        label={`Reel ${reelIndex + 1}`}
                                        hideControls
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
                            </div>
                        </details>
                        <Group justify="flex-end" mt="sm">
                            <RowActions
                                itemLabel={`payline ${lineIndex + 1}`}
                                onDuplicate={() => mutate((b) => duplicatePaylineAt(b, lineIndex))}
                                onRemove={() => mutate((b) => removePaylineAt(b, lineIndex))}
                                onMoveUp={lineIndex > 0 ? () => mutate((b) => movePaylineAt(b, lineIndex, lineIndex - 1)) : undefined}
                                onMoveDown={lineIndex < paylines.length - 1 ? () => mutate((b) => movePaylineAt(b, lineIndex, lineIndex + 1)) : undefined}
                            />
                        </Group>
                    </fieldset>
                ))}
            </div>
            <QuickActions>
                <Button variant="default" onClick={() => mutate((b) => addPayline(b))}>
                    Add payline
                </Button>
                <Button variant="default" onClick={() => setPresetsOpened(true)}>
                    Apply preset…
                </Button>
            </QuickActions>
            <PaylinePresetsModal opened={presetsOpened} onClose={() => setPresetsOpened(false)} blueprint={blueprint} mutate={mutate} />
        </PageSection>
    );
}
