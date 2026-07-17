import {SimpleGrid, TextInput} from "@mantine/core";
import type {BlueprintMutate} from "../../hooks/useBlueprintEditor";
import {PageSection} from "../common/PageSection";

function toRecordCopy(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? {...(value as Record<string, unknown>)} : {};
}

type ManifestField = "id" | "name" | "version" | "description" | "author";

// `legend` defaults to "Metadata" (the raw/non-guided editor's own, unchanged label) -- the guided
// Design & Build editor's "Game basics" section overrides it, so this component's own default behavior
// stays exactly what it was before reels/rows moved out to LayoutFieldset.
export function MetadataFieldset({
    blueprint,
    mutate,
    legend = "Metadata",
}: {
    blueprint: Record<string, unknown>;
    mutate: BlueprintMutate;
    legend?: string;
}) {
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

    return (
        <PageSection legend={legend}>
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
            </SimpleGrid>
        </PageSection>
    );
}
