import {NumberInput, SimpleGrid} from "@mantine/core";
import type {ValidationIssue} from "../../api/types";
import {resizePaylinesToReelCount, resizeReelStripGenerationToReelCount, resizeReelStripsToReelCount} from "../../domain/blueprintFormOps";
import {fieldErrorMessage, fieldWarningMessage} from "../../domain/interpret/BlueprintSections";
import type {BlueprintMutate} from "../../hooks/useBlueprintEditor";
import {FieldWarningText} from "../common/FieldWarningText";
import {PageSection} from "../common/PageSection";

// Reels/rows -- split out of MetadataFieldset so the guided Design & Build editor can put "how many
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
    const reels = typeof blueprint.reels === "number" ? blueprint.reels : undefined;
    const rows = typeof blueprint.rows === "number" ? blueprint.rows : undefined;

    return (
        <PageSection legend="Layout">
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
                            mutate((b) => {
                                b.reels = value;
                                resizePaylinesToReelCount(b);
                                resizeReelStripsToReelCount(b);
                                resizeReelStripGenerationToReelCount(b);
                            });
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
