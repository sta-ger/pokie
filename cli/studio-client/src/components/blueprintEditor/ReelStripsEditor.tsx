import {Button, Group, List, Select} from "@mantine/core";
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
import {symbolArtworkFromBlueprint, SymbolPresentation} from "../common/SymbolPresentation";

function asReelStrips(value: unknown): string[][] {
    return Array.isArray(value) ? value.map((strip) => (Array.isArray(strip) ? strip.filter((item): item is string => typeof item === "string") : [])) : [];
}

function ReelStripFieldset({reelIndex, strip, symbols, mutate, artwork}: {reelIndex: number; strip: string[]; symbols: string[]; mutate: BlueprintMutate; artwork: ReturnType<typeof symbolArtworkFromBlueprint>}) {
    const [newSymbolId, setNewSymbolId] = useState<string | null>(null);

    return (
        <PageSection legend={`Reel ${reelIndex + 1}`}>
            <List listStyleType="none" spacing={4}>
                {strip.map((symbolId, position) => (
                    <List.Item key={position}>
                        <Group gap="xs">
                            <SymbolPresentation symbolId={symbolId} artwork={artwork} />
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
                <Select
                    searchable
                    placeholder="Choose canonical symbol"
                    aria-label={`Symbol picker for reel ${reelIndex + 1}`}
                    data={symbols}
                    value={newSymbolId}
                    onChange={setNewSymbolId}
                />
                <Button
                    variant="default"
                    onClick={() => {
                        if (newSymbolId === null) {
                            return;
                        }
                        mutate((b) => addReelStripSymbol(b, reelIndex, newSymbolId));
                        setNewSymbolId(null);
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
    const symbols = Array.isArray(blueprint.symbols) ? blueprint.symbols.filter((symbol): symbol is string => typeof symbol === "string") : [];
    const artwork = symbolArtworkFromBlueprint(blueprint);
    return (
        <div>
            {strips.map((strip, reelIndex) => (
                <ReelStripFieldset key={reelIndex} reelIndex={reelIndex} strip={strip} symbols={symbols} mutate={mutate} artwork={artwork} />
            ))}
        </div>
    );
}
