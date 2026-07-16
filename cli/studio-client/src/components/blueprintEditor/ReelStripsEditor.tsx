import {Button, Group, List, TextInput} from "@mantine/core";
import {useState} from "react";
import {
    addReelStripSymbol,
    duplicateReelStripSymbolAt,
    moveReelStripSymbolAt,
    removeReelStripSymbolAt,
    setReelStripSymbolAt,
} from "../../domain/blueprintFormOps";
import type {BlueprintMutate} from "../../hooks/useBlueprintEditor";
import {BufferedTextInput} from "../common/BufferedTextInput";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";
import {RowActions} from "../common/RowActions";

function asReelStrips(value: unknown): string[][] {
    return Array.isArray(value) ? value.map((strip) => (Array.isArray(strip) ? strip.filter((item): item is string => typeof item === "string") : [])) : [];
}

function ReelStripFieldset({reelIndex, strip, mutate}: {reelIndex: number; strip: string[]; mutate: BlueprintMutate}) {
    const [newSymbolId, setNewSymbolId] = useState("");

    return (
        <PageSection legend={`Reel ${reelIndex + 1}`}>
            <List listStyleType="none" spacing={4}>
                {strip.map((symbolId, position) => (
                    <List.Item key={position}>
                        <Group gap="xs">
                            <BufferedTextInput
                                aria-label={`Reel ${reelIndex + 1} symbol ${position + 1}`}
                                value={symbolId}
                                onCommit={(value) => mutate((b) => setReelStripSymbolAt(b, reelIndex, position, value))}
                            />
                            <RowActions
                                itemLabel={`reel ${reelIndex + 1} symbol ${position + 1}`}
                                onDuplicate={() => mutate((b) => duplicateReelStripSymbolAt(b, reelIndex, position))}
                                onRemove={() => mutate((b) => removeReelStripSymbolAt(b, reelIndex, position))}
                                onMoveUp={position > 0 ? () => mutate((b) => moveReelStripSymbolAt(b, reelIndex, position, position - 1)) : undefined}
                                onMoveDown={
                                    position < strip.length - 1 ? () => mutate((b) => moveReelStripSymbolAt(b, reelIndex, position, position + 1)) : undefined
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
                        mutate((b) => addReelStripSymbol(b, reelIndex, id));
                        setNewSymbolId("");
                    }}
                >
                    Add symbol
                </Button>
            </QuickActions>
        </PageSection>
    );
}

export function ReelStripsEditor({blueprint, mutate}: {blueprint: Record<string, unknown>; mutate: BlueprintMutate}) {
    const strips = asReelStrips(blueprint.reelStrips);
    return (
        <div>
            {strips.map((strip, reelIndex) => (
                <ReelStripFieldset key={reelIndex} reelIndex={reelIndex} strip={strip} mutate={mutate} />
            ))}
        </div>
    );
}
