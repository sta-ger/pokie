import {Button, Group, SimpleGrid, Text, TextInput} from "@mantine/core";
import {useEffect, useRef} from "react";
import type {ValidationIssue} from "../../api/types";
import {fieldErrorMessage, fieldWarningMessage} from "../../domain/interpret/BlueprintSections";
import type {BlueprintMutate} from "../../hooks/useBlueprintEditor";
import {FieldWarningText} from "../common/FieldWarningText";
import {PageSection} from "../common/PageSection";

function toRecordCopy(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? {...(value as Record<string, unknown>)} : {};
}

type InfoField = "id" | "name" | "version" | "description" | "author";

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
    gameIdConflict,
}: {
    blueprint: Record<string, unknown>;
    mutate: BlueprintMutate;
    legend?: string;
    issues?: ValidationIssue[];
    gameIdConflict?: {suggestedGameId: string; onUseSuggested: () => void};
}) {
    const info = toRecordCopy(blueprint.info);
    const gameIdRef = useRef<HTMLInputElement>(null);
    const suggestedGameId = gameIdConflict?.suggestedGameId;
    useEffect(() => {
        if (suggestedGameId === undefined) return;
        gameIdRef.current?.focus();
        gameIdRef.current?.scrollIntoView({behavior: "smooth", block: "center"});
    }, [suggestedGameId]);
    const readInfo = (field: InfoField): string => (typeof info[field] === "string" ? (info[field] as string) : "");

    const setInfoField = (field: InfoField, value: string): void => {
        if (readInfo(field) === value) return;
        mutate((b) => {
            const nextInfo = toRecordCopy(b.info);
            if (value.length === 0 && field !== "id" && field !== "name" && field !== "version") {
                Reflect.deleteProperty(nextInfo, field);
            } else {
                nextInfo[field] = value;
            }
            b.info = nextInfo;
        });
    };

    // A project's initial id is a deterministic convenience derived from its Name.  Once somebody
    // types a different Game id it is theirs: later Name edits never overwrite that explicit choice.
    const setName = (value: string): void => {
        if (readInfo("name") === value) return;
        mutate((b) => {
            const nextInfo = toRecordCopy(b.info);
            const previousName = typeof nextInfo.name === "string" ? nextInfo.name : "";
            const previousId = typeof nextInfo.id === "string" ? nextInfo.id : "";
            nextInfo.name = value;
            if (previousId.length === 0 || previousId === deriveIdFromName(previousName)) {
                nextInfo.id = deriveIdFromName(value);
            }
            b.info = nextInfo;
        });
    };

    return (
        <PageSection legend={legend}>
            <Text size="sm" c="dimmed" mb="sm">
                Required: Game id, Game name, and Version. Description and Author are optional.
            </Text>
            <SimpleGrid cols={{base: 1, sm: 2}} spacing="sm">
                <div>
                    <TextInput
                        ref={gameIdRef}
                        label="Game id"
                        value={readInfo("id")}
                        onInput={(event) => setInfoField("id", event.currentTarget.value)}
                        onChange={(event) => setInfoField("id", event.currentTarget.value)}
                        error={fieldErrorMessage(issues, "info.id") ?? (gameIdConflict === undefined ? undefined : "That Game id is already taken.")}
                    />
                    {gameIdConflict !== undefined && (
                        <Group gap={4} mt={2}>
                            <Text size="xs" c="dimmed">Try</Text>
                            <Button size="compact-xs" variant="subtle" onClick={gameIdConflict.onUseSuggested}>
                                {gameIdConflict.suggestedGameId}
                            </Button>
                        </Group>
                    )}
                    <FieldWarningText message={fieldWarningMessage(issues, "info.id")} />
                </div>
                <div>
                    <TextInput
                        label="Game name"
                        value={readInfo("name")}
                        // Native input must update the event-time draft before Save/Open completes,
                        // even while focus remains here. onChange also covers change-only controls.
                        onInput={(event) => setName(event.currentTarget.value)}
                        onChange={(event) => setName(event.currentTarget.value)}
                        error={fieldErrorMessage(issues, "info.name")}
                    />
                    <FieldWarningText message={fieldWarningMessage(issues, "info.name")} />
                </div>
                <div>
                    <TextInput
                        label="Version"
                        value={readInfo("version")}
                        onInput={(event) => setInfoField("version", event.currentTarget.value)}
                        onChange={(event) => setInfoField("version", event.currentTarget.value)}
                        error={fieldErrorMessage(issues, "info.version")}
                    />
                    <FieldWarningText message={fieldWarningMessage(issues, "info.version")} />
                </div>
                <TextInput
                    label="Description (optional)"
                    value={readInfo("description")}
                    onInput={(event) => setInfoField("description", event.currentTarget.value)}
                    onChange={(event) => setInfoField("description", event.currentTarget.value)}
                />
                <TextInput
                    label="Author (optional)"
                    value={readInfo("author")}
                    onInput={(event) => setInfoField("author", event.currentTarget.value)}
                    onChange={(event) => setInfoField("author", event.currentTarget.value)}
                />
            </SimpleGrid>
        </PageSection>
    );
}
