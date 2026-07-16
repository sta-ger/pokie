import {NumberInput, SimpleGrid, TextInput} from "@mantine/core";
import type {BlueprintMutate} from "../../hooks/useBlueprintEditor";
import {resizePaylinesToReelCount, resizeReelStripGenerationToReelCount, resizeReelStripsToReelCount} from "../../domain/blueprintFormOps";
import {PageSection} from "../common/PageSection";

function toRecordCopy(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? {...(value as Record<string, unknown>)} : {};
}

type ManifestField = "id" | "name" | "version" | "description" | "author";

export function MetadataFieldset({blueprint, mutate}: {blueprint: Record<string, unknown>; mutate: BlueprintMutate}) {
    const manifest = toRecordCopy(blueprint.manifest);
    const readManifest = (field: ManifestField): string => (typeof manifest[field] === "string" ? (manifest[field] as string) : "");

    const setManifestField = (field: ManifestField, value: string): void => {
        mutate((b) => {
            const nextManifest = toRecordCopy(b.manifest);
            if (value.length === 0 && field !== "id" && field !== "name" && field !== "version") {
                Reflect.deleteProperty(nextManifest, field);
            } else {
                nextManifest[field] = value;
            }
            b.manifest = nextManifest;
        });
    };

    const reels = typeof blueprint.reels === "number" ? blueprint.reels : undefined;
    const rows = typeof blueprint.rows === "number" ? blueprint.rows : undefined;

    return (
        <PageSection legend="Metadata">
            <SimpleGrid cols={{base: 1, sm: 2}} spacing="sm">
                <TextInput label="Game id" defaultValue={readManifest("id")} onBlur={(event) => setManifestField("id", event.currentTarget.value)} />
                <TextInput label="Game name" defaultValue={readManifest("name")} onBlur={(event) => setManifestField("name", event.currentTarget.value)} />
                <TextInput label="Version" defaultValue={readManifest("version")} onBlur={(event) => setManifestField("version", event.currentTarget.value)} />
                <TextInput
                    label="Description (optional)"
                    defaultValue={readManifest("description")}
                    onBlur={(event) => setManifestField("description", event.currentTarget.value)}
                />
                <TextInput
                    label="Author (optional)"
                    defaultValue={readManifest("author")}
                    onBlur={(event) => setManifestField("author", event.currentTarget.value)}
                />
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
