import {validateStudioBlueprintDraft, type StudioBlueprintDraft} from "../../../studio/blueprint/StudioBlueprintDraft.js";

const DESIGN_DRAFT_STORAGE_KEY = "pokie-studio:design-draft:v1";

// `importedFromParSheetPath`, when set, is the .xlsx workbook this draft was Applied from (see
// BlueprintEditorPage's own handleApplyImportedBlueprint) -- carried alongside the draft itself so a
// recovered draft's eventual first Save still records the same workbook provenance an uninterrupted
// session would have (see saveManagedBlueprint's own doc comment), rather than silently becoming an
// ordinary, unattributed managed Blueprint just because the tab happened to refresh first.
export type PersistedBlueprintDraft = StudioBlueprintDraft;

// Immediate per-tab cache. BlueprintDraftPersistence also writes the profile's recovery slot through
// Studio's API, so a server/browser restart does not depend on retaining this tab or its origin.
// The profile slot is only offered for explicit Restore/Discard; it never silently opens a project.
export function loadPersistedBlueprintDraft(): PersistedBlueprintDraft | undefined {
    try {
        const raw = window.sessionStorage.getItem(DESIGN_DRAFT_STORAGE_KEY);
        if (raw === null) {
            return undefined;
        }
        return validateStudioBlueprintDraft(JSON.parse(raw));
    } catch {
        return undefined;
    }
}

export function savePersistedBlueprintDraft(blueprint: unknown, importedFromParSheetPath?: string, conversionEvidence?: unknown): void {
    try {
        window.sessionStorage.setItem(DESIGN_DRAFT_STORAGE_KEY, JSON.stringify({blueprint, importedFromParSheetPath, conversionEvidence}));
    } catch {
        // The server profile can still retain the draft when browser storage is unavailable.
    }
}

export function clearPersistedBlueprintDraft(): void {
    try {
        window.sessionStorage.removeItem(DESIGN_DRAFT_STORAGE_KEY);
    } catch {
        // See savePersistedBlueprintDraft -- nothing to clean up if storage was never usable.
    }
}
