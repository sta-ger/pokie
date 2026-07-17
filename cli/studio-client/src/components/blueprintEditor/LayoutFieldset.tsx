import {NumberInput, SimpleGrid} from "@mantine/core";
import type {BlueprintMutate} from "../../hooks/useBlueprintEditor";
import {resizePaylinesToReelCount, resizeReelStripGenerationToReelCount, resizeReelStripsToReelCount} from "../../domain/blueprintFormOps";
import {PageSection} from "../common/PageSection";

// Reels/rows -- split out of MetadataFieldset so the guided Design & Build editor can put "how many
// reels/rows" in its own Layout section alongside PaylinesEditor, rather than next to the manifest
// fields. A reel-count change also resizes paylines/reel strips/reel strip generation to match, exactly
// as it did when this lived in MetadataFieldset.
export function LayoutFieldset({blueprint, mutate}: {blueprint: Record<string, unknown>; mutate: BlueprintMutate}) {
    const reels = typeof blueprint.reels === "number" ? blueprint.reels : undefined;
    const rows = typeof blueprint.rows === "number" ? blueprint.rows : undefined;

    return (
        <PageSection legend="Layout">
            <SimpleGrid cols={{base: 1, sm: 2}} spacing="sm">
                <NumberInput
                    label="Reels"
                    min={1}
                    step={1}
                    defaultValue={reels}
                    onBlur={(event) => {
                        const value = Number(event.currentTarget.value);
                        if (!Number.isFinite(value)) {
                            return;
                        }
                        mutate((b) => {
                            b.reels = value;
                            resizePaylinesToReelCount(b);
                            resizeReelStripsToReelCount(b);
                            resizeReelStripGenerationToReelCount(b);
                        });
                    }}
                />
                <NumberInput
                    label="Rows"
                    min={1}
                    step={1}
                    defaultValue={rows}
                    onBlur={(event) => {
                        const value = Number(event.currentTarget.value);
                        if (!Number.isFinite(value)) {
                            return;
                        }
                        mutate((b) => {
                            b.rows = value;
                        });
                    }}
                />
            </SimpleGrid>
        </PageSection>
    );
}
