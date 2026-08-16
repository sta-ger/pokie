import {SimpleGrid, TextInput} from "@mantine/core";
import type {ValidationIssue} from "../../api/types";
import {fieldErrorMessage, fieldWarningMessage} from "../../domain/interpret/BlueprintSections";
import type {BlueprintMutate} from "../../hooks/useBlueprintEditor";
import {FieldWarningText} from "../common/FieldWarningText";
import {PageSection} from "../common/PageSection";

function toRecordCopy(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? {...(value as Record<string, unknown>)} : {};
}

type ManifestField = "id" | "name" | "version" | "description" | "author";

function deriveIdFromName(name: string): string {
    const derived = name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return derived || "blueprint";
}

// `legend` defaults to "Metadata" (the raw/non-guided editor's own, unchanged label) -- the guided
// Design Game editor's "Game basics" section overrides it, so this component's own default behavior
// stays exactly what it was before reels/rows moved out to LayoutFieldset. `issues` defaults to `[]` for
// the same reason -- the raw editor never passes any, so it never shows field-level errors, unchanged.
export function MetadataFieldset({
    blueprint,
    mutate,
    legend = "Metadata",
    issues = [],
}: {
    blueprint: Record<string, unknown>;
    mutate: BlueprintMutate;
    legend?: string;
    issues?: ValidationIssue[];
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

    // A project's initial id is a deterministic convenience derived from its Name.  Once somebody
    // types a different Game id it is theirs: later Name edits never overwrite that explicit choice.
    const setName = (value: string): void => {
        mutate((b) => {
            const nextManifest = toRecordCopy(b.manifest);
            const previousName = typeof nextManifest.name === "string" ? nextManifest.name : "";
            const previousId = typeof nextManifest.id === "string" ? nextManifest.id : "";
            nextManifest.name = value;
            if (previousId.length === 0 || previousId === deriveIdFromName(previousName)) {
                nextManifest.id = deriveIdFromName(value);
            }
            b.manifest = nextManifest;
        });
    };

    return (
        <PageSection legend={legend}>
            <SimpleGrid cols={{base: 1, sm: 2}} spacing="sm">
                <div>
                    <TextInput
                        label="Game id"
                        defaultValue={readManifest("id")}
                        onBlur={(event) => setManifestField("id", event.currentTarget.value)}
                        error={fieldErrorMessage(issues, "manifest.id")}
                    />
                    <FieldWarningText message={fieldWarningMessage(issues, "manifest.id")} />
                </div>
                <div>
                    <TextInput
                        label="Game name"
                        value={readManifest("name")}
                        // Name drives the managed project's identity.  Keep the editor's event-time
                        // state current while typing so a Create Project click in the same React batch
                        // cannot validate and save the preceding, still-valid name before its blur is
                        // committed.  The other metadata fields remain blur-committed because they do
                        // not participate in that primary-action identity path.
                        onChange={(event) => setName(event.currentTarget.value)}
                        error={fieldErrorMessage(issues, "manifest.name")}
                    />
                    <FieldWarningText message={fieldWarningMessage(issues, "manifest.name")} />
                </div>
                <div>
                    <TextInput
                        label="Version"
                        defaultValue={readManifest("version")}
                        onBlur={(event) => setManifestField("version", event.currentTarget.value)}
                        error={fieldErrorMessage(issues, "manifest.version")}
                    />
                    <FieldWarningText message={fieldWarningMessage(issues, "manifest.version")} />
                </div>
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
