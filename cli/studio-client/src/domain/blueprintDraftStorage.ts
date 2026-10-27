import {BLUEPRINT_SECTIONS, type BlueprintSectionId} from "./interpret/BlueprintSections";

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

export type PersistedProjectBlueprintDraft = {
    blueprint: Record<string, unknown>;
    section: BlueprintSectionId | "mechanics";
    sourceHash: string;
};

export function validatePersistedProjectBlueprintDraft(value: unknown): PersistedProjectBlueprintDraft {
    const {blueprint} = validatePersistedBlueprintDraft(value);
    const envelope = value as Record<string, unknown>;
    if (envelope.section !== "mechanics" && !BLUEPRINT_SECTIONS.some(section => section.id === envelope.section)) {
        throw new Error('"draft.section" must be an editable Game Model section.');
    }
    if (typeof envelope.sourceHash !== "string") throw new Error('"draft.sourceHash" must be a string.');
    return {blueprint, section: envelope.section as PersistedProjectBlueprintDraft["section"], sourceHash: envelope.sourceHash};
}

function projectDraftKey(projectRoot: string): string {
    return `pokie-studio:project-draft:v1:${projectRoot}`;
}

// A writer belongs to one edit lifetime. Explicit discard invalidates older writers before
// removing the slot, so a queued persistence effect cannot resurrect a draft after Leave.
// A fresh Edit/Restore gets a new writer; refresh itself never discards the persisted bytes.
const projectDraftGenerations = new Map<string, number>();
export type ProjectBlueprintDraftWriter = (draft: PersistedProjectBlueprintDraft) => void;

export function createProjectBlueprintDraftWriter(projectRoot: string): ProjectBlueprintDraftWriter {
    const generation = projectDraftGenerations.get(projectRoot) ?? 0;
    return draft => {
        if (generation === (projectDraftGenerations.get(projectRoot) ?? 0)) {
            savePersistedProjectBlueprintDraft(projectRoot, draft);
        }
    };
}

export function loadPersistedProjectBlueprintDraft(projectRoot: string): PersistedProjectBlueprintDraft | undefined {
    return readDraft(projectDraftKey(projectRoot), validatePersistedProjectBlueprintDraft);
}

export function savePersistedProjectBlueprintDraft(projectRoot: string, draft: PersistedProjectBlueprintDraft): void {
    writeDraft(projectDraftKey(projectRoot), draft, validatePersistedProjectBlueprintDraft);
}

export function clearPersistedProjectBlueprintDraft(projectRoot: string): void {
    projectDraftGenerations.set(projectRoot, (projectDraftGenerations.get(projectRoot) ?? 0) + 1);
    clearDraft(projectDraftKey(projectRoot));
}

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
    return readDraft(DESIGN_DRAFT_STORAGE_KEY, validatePersistedBlueprintDraft);
}

function readDraft<T>(key: string, validate: (value: unknown) => T): T | undefined {
    try {
        const raw = window.sessionStorage.getItem(key);
        if (raw === null) {
            return undefined;
        }
        return validate(JSON.parse(raw));
    } catch {
        return undefined;
    }
}

export function savePersistedBlueprintDraft(blueprint: unknown, importedFromParSheetPath?: string, conversionEvidence?: unknown): void {
    writeDraft(DESIGN_DRAFT_STORAGE_KEY, {blueprint, importedFromParSheetPath, conversionEvidence}, validatePersistedBlueprintDraft);
}

function writeDraft(key: string, draft: unknown, validate: (value: unknown) => unknown): void {
    try {
        const raw = JSON.stringify(draft);
        validate(JSON.parse(raw));
        window.sessionStorage.setItem(key, raw);
    } catch {
        // Storage unavailable or invalid envelope: preserve any previous recovery data. The in-memory
        // editor remains usable; explicit Save still keeps the project without relying on this slot.
    }
}

export function clearPersistedBlueprintDraft(): void {
    clearDraft(DESIGN_DRAFT_STORAGE_KEY);
}

function clearDraft(key: string): void {
    try {
        window.sessionStorage.removeItem(key);
    } catch {
        // See savePersistedBlueprintDraft -- nothing to clean up if storage was never usable.
    }
}
