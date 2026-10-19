/** Recovery data is an editable document, never authority to execute or publish a model. */
export type StudioBlueprintDraft = {
    blueprint: Record<string, unknown>;
    importedFromParSheetPath?: string;
    conversionEvidence?: unknown;
};

export type StudioBlueprintDraftSnapshot = {version: string | null; draft?: StudioBlueprintDraft};

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Shared by disk, HTTP and browser recovery. Model validity belongs to the existing Blueprint
// validator: an incomplete document must survive recovery so its author can repair it.
export function validateStudioBlueprintDraft(value: unknown): StudioBlueprintDraft {
    if (!isRecord(value)) throw new Error('"draft" must be an object.');
    if (!isRecord(value.blueprint)) throw new Error('"draft.blueprint" must be a JSON object.');
    if ("importedFromParSheetPath" in value && typeof value.importedFromParSheetPath !== "string") {
        throw new Error('"draft.importedFromParSheetPath" must be a string when given.');
    }
    return {
        blueprint: value.blueprint,
        ...("importedFromParSheetPath" in value ? {importedFromParSheetPath: value.importedFromParSheetPath as string} : {}),
        ...("conversionEvidence" in value ? {conversionEvidence: value.conversionEvidence} : {}),
    };
}

export function validateStudioBlueprintDraftSnapshot(value: unknown): StudioBlueprintDraftSnapshot {
    if (!isRecord(value)) throw new Error('"snapshot" must be an object.');
    if (value.version !== null && (typeof value.version !== "string" || !(/^[a-f0-9]{32}$/).test(value.version))) {
        throw new Error('"version" must be a draft version token or null.');
    }
    return {version: value.version as string | null, ...("draft" in value ? {draft: validateStudioBlueprintDraft(value.draft)} : {})};
}
