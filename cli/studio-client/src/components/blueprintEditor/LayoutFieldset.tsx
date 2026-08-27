import {NumberInput, SimpleGrid, Text} from "@mantine/core";
import {useConfirm} from "../../hooks/useConfirm";
import type {ValidationIssue} from "../../api/types";
import {resizePaylinesToReelCount, resizeReelStripGenerationToReelCount, resizeReelStripsToReelCount} from "../../domain/blueprintFormOps";
import {fieldErrorMessage, fieldWarningMessage} from "../../domain/interpret/BlueprintSections";
import type {BlueprintMutate} from "../../hooks/useBlueprintEditor";
import {FieldWarningText} from "../common/FieldWarningText";
import {PageSection} from "../common/PageSection";

// Reels/rows -- split out of MetadataFieldset so the guided Design Game editor can put "how many
// reels/rows" in its own Layout section alongside PaylinesEditor, rather than next to the manifest
// fields. A reel-count change also resizes paylines/reel strips/reel strip generation to match, exactly
// as it did when this lived in MetadataFieldset. `issues` defaults to `[]` -- the raw editor never passes
// any, so it never shows field-level errors, unchanged.
export function LayoutFieldset({
    blueprint,
    mutate,
    issues = [],
}: {
    blueprint: Record<string, unknown>;
    mutate: BlueprintMutate;
    issues?: ValidationIssue[];
}) {
    const confirm = useConfirm();
    const reels = typeof blueprint.reels === "number" ? blueprint.reels : undefined;
    const rows = typeof blueprint.rows === "number" ? blueprint.rows : undefined;

    const applyReelCount = (value: number): void => {
        mutate((b) => {
            b.reels = value;
            resizePaylinesToReelCount(b);
            resizeReelStripsToReelCount(b);
            resizeReelStripGenerationToReelCount(b);
        });
    };

    // Reducing a layout can trim the right-most positions of custom paylines or discard whole
    // custom reel definitions.  The starter/default generator has none of these fields, so this
    // asks only when an authored value could actually be lost.
    const reductionCanDiscardAuthoredData = (value: number): boolean =>
        reels !== undefined && value < reels &&
        (Array.isArray(blueprint.paylines) || Array.isArray(blueprint.reelStrips) || Array.isArray(blueprint.reelStripGeneration));

    return (
        <PageSection legend="Layout">
            <Text size="sm" c="dimmed" mb="sm">
                Required: choose the number of reels and visible rows. Reducing reels can remove custom reel or payline data; Studio asks before it does.
            </Text>
            <SimpleGrid cols={{base: 1, sm: 2}} spacing="sm">
                <div>
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
                            if (reductionCanDiscardAuthoredData(value)) {
                                confirm(
                                    `Reduce reels from ${reels} to ${value}? Custom paylines and reel definitions beyond reel ${value} will be removed.`,
                                    () => applyReelCount(value),
                                );
                                return;
                            }
                            applyReelCount(value);
                        }}
                        error={fieldErrorMessage(issues, "reels")}
                    />
                    <FieldWarningText message={fieldWarningMessage(issues, "reels")} />
                </div>
                <div>
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
                        error={fieldErrorMessage(issues, "rows")}
                    />
                    <FieldWarningText message={fieldWarningMessage(issues, "rows")} />
                </div>
            </SimpleGrid>
        </PageSection>
    );
}
