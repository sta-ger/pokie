const DESIGN_DRAFT_STORAGE_KEY = "pokie-studio:design-draft:v1";

// `importedFromParSheetPath`, when set, is the .xlsx workbook this draft was Applied from (see
// BlueprintEditorPage's own handleApplyImportedBlueprint) -- carried alongside the draft itself so a
// recovered draft's eventual first Save still records the same workbook provenance an uninterrupted
// session would have (see saveManagedBlueprint's own doc comment), rather than silently becoming an
// ordinary, unattributed managed Blueprint just because the tab happened to refresh first.
export type PersistedBlueprintDraft = {
    blueprint: Record<string, unknown>;
    importedFromParSheetPath?: string;
    conversionEvidence?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Recovery validates the envelope, not model semantics: incomplete documents must survive so their
// author can repair them. Executable validity and durable provenance belong to validation/save/build.
export function validatePersistedBlueprintDraft(value: unknown): PersistedBlueprintDraft {
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

// One guided Design draft per browser tab. sessionStorage survives a same-tab refresh without
// exposing a shared application-profile slot to other tabs or fresh browser sessions. Mount only
// offers explicit Restore/Discard. Storage may be unavailable or hand-edited, so reads fail closed.
export function loadPersistedBlueprintDraft(): PersistedBlueprintDraft | undefined {
    try {
        const raw = window.sessionStorage.getItem(DESIGN_DRAFT_STORAGE_KEY);
        if (raw === null) {
            return undefined;
        }
        return validatePersistedBlueprintDraft(JSON.parse(raw));
    } catch {
        return undefined;
    }
}

export function savePersistedBlueprintDraft(blueprint: unknown, importedFromParSheetPath?: string, conversionEvidence?: unknown): void {
    try {
        const raw = JSON.stringify({blueprint, importedFromParSheetPath, conversionEvidence});
        validatePersistedBlueprintDraft(JSON.parse(raw));
        window.sessionStorage.setItem(DESIGN_DRAFT_STORAGE_KEY, raw);
    } catch {
        // Storage unavailable or invalid envelope: preserve any previous recovery data. The in-memory
        // editor remains usable; explicit Save still keeps the project without relying on this slot.
    }
}

export function clearPersistedBlueprintDraft(): void {
    try {
        window.sessionStorage.removeItem(DESIGN_DRAFT_STORAGE_KEY);
    } catch {
        // See savePersistedBlueprintDraft -- nothing to clean up if storage was never usable.
    }
}
