// The fixed GameBlueprint field order (see src/generated/GameBlueprint.ts's own declaration order) —
// Save always writes known fields in this order, regardless of what order the editor/JSON view held
// them in, so a re-save of unchanged content is byte-identical every time.
const KNOWN_TOP_LEVEL_KEYS = [
    "manifest",
    "reels",
    "rows",
    "symbols",
    "wilds",
    "scatters",
    "paylines",
    "paytable",
    "reelStrips",
    "symbolWeights",
    "availableBets",
] as const;

// The Blueprint Editor's Save formatter. Deliberately takes `unknown` (not GameBlueprint): the editor's
// JSON view may hold a blueprint with extra top-level fields GameBlueprintValidator hasn't rejected yet
// (or fields older/newer tooling added) — those are never dropped, only moved after the known fields in
// their original relative order, so nothing a user pasted or loaded is ever silently lost on Save.
export function serializeGameBlueprint(blueprint: unknown): string {
    const record =
        typeof blueprint === "object" && blueprint !== null && !Array.isArray(blueprint)
            ? (blueprint as Record<string, unknown>)
            : {};

    const ordered: Record<string, unknown> = {};
    for (const key of KNOWN_TOP_LEVEL_KEYS) {
        if (key in record) {
            ordered[key] = record[key];
        }
    }
    for (const key of Object.keys(record)) {
        if (!(key in ordered)) {
            ordered[key] = record[key];
        }
    }

    return `${JSON.stringify(ordered, null, 4)}\n`;
}
