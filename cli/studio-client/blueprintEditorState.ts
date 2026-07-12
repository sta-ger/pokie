// Owns the Blueprint Editor's Form<->JSON sync. `blueprint` is the one source of truth (a plain object,
// possibly holding top-level fields GameBlueprintValidator doesn't know about — see
// serializeGameBlueprint's own doc comment for why those are never dropped); `jsonText` is always a
// pretty-printed mirror of it, except while the user has a pending, not-yet-applied edit in the JSON
// textarea (`jsonError` set, `blueprint` untouched) — see applyJsonText below.
export type BlueprintEditorState = {
    blueprint: Record<string, unknown>;
    jsonText: string;
    jsonError?: string;
};

// A minimal but structurally valid starting point for "New Blueprint" — small enough to edit by hand
// in the form right away, not a stand-in for GameBlueprintValidator's own rules (an empty "manifest.id"
// will still validate as an error, exactly as it should).
const STARTER_BLUEPRINT: Record<string, unknown> = {
    manifest: {id: "", name: "", version: "0.1.0"},
    reels: 5,
    rows: 3,
    symbols: [],
    paytable: {},
    availableBets: [1],
};

export function createEmptyBlueprintEditorState(): BlueprintEditorState {
    return loadBlueprintEditorState(cloneRecord(STARTER_BLUEPRINT));
}

// Used both by "Load from path" (server-parsed JSON) and by a successful applyJsonText — the two ways
// the editor's blueprint can be replaced wholesale rather than incrementally edited.
export function loadBlueprintEditorState(blueprint: unknown): BlueprintEditorState {
    const record = toRecord(blueprint);
    return {blueprint: record, jsonText: serialize(record)};
}

// Parses `text`; on success, `blueprint` becomes the parsed value and `jsonError` clears. On failure —
// malformed JSON, or valid JSON that isn't an object — `blueprint` is left exactly as it was: an
// invalid edit in the JSON view never destroys the last-known-good Form state, only `jsonText`/
// `jsonError` change so the textarea and an inline error message can reflect what the user typed.
export function applyJsonText(state: BlueprintEditorState, text: string): BlueprintEditorState {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        return {...state, jsonText: text, jsonError: error instanceof Error ? error.message : String(error)};
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return {...state, jsonText: text, jsonError: "The blueprint must be a JSON object."};
    }

    return {blueprint: parsed as Record<string, unknown>, jsonText: text, jsonError: undefined};
}

// Every Form edit goes through this: clone the current blueprint, run a mutation from
// blueprintFormOps.ts against the clone, then re-derive jsonText from the result — this is what keeps
// the JSON view in sync with the Form, and what makes unknown top-level fields survive a Form edit
// (the mutators in blueprintFormOps.ts only ever touch the specific known fields they're about).
export function withFieldUpdate(state: BlueprintEditorState, mutate: (blueprint: Record<string, unknown>) => void): BlueprintEditorState {
    const cloned = cloneRecord(state.blueprint);
    mutate(cloned);
    return {blueprint: cloned, jsonText: serialize(cloned), jsonError: undefined};
}

function serialize(blueprint: Record<string, unknown>): string {
    return `${JSON.stringify(blueprint, null, 4)}\n`;
}

function toRecord(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function cloneRecord<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}
