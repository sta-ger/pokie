const DESIGN_DRAFT_STORAGE_KEY = "pokie-studio:design-draft:v1";

// `importedFromParSheetPath`, when set, is the .xlsx workbook this draft was Applied from (see
// BlueprintEditorPage's own handleApplyImportedBlueprint) -- carried alongside the draft itself so a
// recovered draft's eventual first Save still records the same workbook provenance an uninterrupted
// session would have (see saveManagedBlueprint's own doc comment), rather than silently becoming an
// ordinary, unattributed managed Blueprint just because the tab happened to refresh first.
export type PersistedBlueprintDraft = {blueprint: unknown; importedFromParSheetPath?: string};

// The guided Design Game editor's own draft-recovery slot -- one browser tab, one in-progress draft at a
// time (Home only ever mounts a single BlueprintEditorPage instance -- see BlueprintEditorPage's own
// `guided` doc comment), so a single fixed key is enough, the same "one storage key per feature" choice
// CertificationTab's own sessionStorage persistence already makes. sessionStorage (not localStorage):
// survives an accidental refresh/crash within the same tab -- the case this exists for -- without also
// resurrecting a stale draft in a brand-new tab days later. Read defensively (see
// loadPersistedBlueprintDraft): storage is outside POKIE's own control (private browsing, a hand-edited
// value, a future format change), so any shape mismatch is treated as "nothing saved yet" rather than
// thrown.
export function loadPersistedBlueprintDraft(): PersistedBlueprintDraft | undefined {
    try {
        const raw = window.sessionStorage.getItem(DESIGN_DRAFT_STORAGE_KEY);
        if (raw === null) {
            return undefined;
        }
        const parsed = JSON.parse(raw) as Partial<PersistedBlueprintDraft>;
        if (parsed.blueprint === undefined) {
            return undefined;
        }
        return {
            blueprint: parsed.blueprint,
            importedFromParSheetPath: typeof parsed.importedFromParSheetPath === "string" ? parsed.importedFromParSheetPath : undefined,
        };
    } catch {
        return undefined;
    }
}

export function savePersistedBlueprintDraft(blueprint: unknown, importedFromParSheetPath?: string): void {
    try {
        window.sessionStorage.setItem(DESIGN_DRAFT_STORAGE_KEY, JSON.stringify({blueprint, importedFromParSheetPath}));
    } catch {
        // sessionStorage unavailable (private browsing, storage disabled) -- the in-memory draft still
        // works for the rest of this tab's lifetime, it just won't survive a refresh.
    }
}

export function clearPersistedBlueprintDraft(): void {
    try {
        window.sessionStorage.removeItem(DESIGN_DRAFT_STORAGE_KEY);
    } catch {
        // See savePersistedBlueprintDraft -- nothing to clean up if storage was never usable.
    }
}
