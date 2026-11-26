import {Button, Group, List, Select, Text, Textarea} from "@mantine/core";
import {useState} from "react";
import {
    addReelStripSymbol,
    duplicateReelStripSymbolAt,
    moveReelStripSymbolAt,
    removeReelStripSymbolAt,
    replaceReelStripSymbols,
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
    const [pasteValue, setPasteValue] = useState("");
    const [pasteError, setPasteError] = useState<string>();

    const applyPaste = (): void => {
        const tokens = pasteValue.split(/[\s,]+/).filter(Boolean);
        if (tokens.length === 0) {
            setPasteError("Paste at least one symbol id.");
            return;
        }
        const unknown = tokens.filter((symbolId) => !symbols.includes(symbolId));
        if (unknown.length > 0) {
            setPasteError(`Unknown symbol id${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}. Use one of: ${symbols.join(", ")}.`);
            return;
        }
        mutate((b) => replaceReelStripSymbols(b, reelIndex, tokens));
        setPasteError(undefined);
        setPasteValue("");
    };

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
            <Text size="xs" c="dimmed" mt="xs">
                Paste a whole strip to replace this reel in one step. Symbols may be separated by spaces, commas or new lines; unknown ids are rejected.
            </Text>
            <Group align="flex-end" gap="xs" mt={4}>
                <Textarea
                    aria-label={`Paste reel ${reelIndex + 1} symbols`}
                    placeholder="A, K, Q, J, J, S"
                    autosize
                    minRows={1}
                    value={pasteValue}
                    onChange={(event) => {
                        setPasteValue(event.currentTarget.value);
                        setPasteError(undefined);
                    }}
                    style={{flex: "1 1 320px"}}
                />
                <Button variant="default" onClick={applyPaste}>
                    Replace strip
                </Button>
            </Group>
            {pasteError !== undefined && (
                <Text role="alert" size="xs" c="red">
                    {pasteError}
                </Text>
            )}
            <QuickActions>
                <Select
                    searchable
                    placeholder="Choose symbol"
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
