import crypto from "crypto";

// The one place a GameBlueprint's *exact-content* hash is computed — shared by buildGameBuildInfo
// (provenance/no-op-rebuild detection) and Studio's own conditional-commit apply flow (optimistic
// concurrency: "is the blueprint on disk still the one I loaded?"), so the two can never disagree
// about what "unchanged" means. Keys are sorted recursively before hashing (arrays keep their order —
// order is meaningful there, e.g. paylines/reelStrips) so the digest depends only on the blueprint's
// actual content, never on incidental object-key order: StudioBlueprintService.save() always writes a
// canonical top-level key order (see serializeGameBlueprint's own KNOWN_TOP_LEVEL_KEYS) regardless of
// what order the in-memory blueprint held them in, so hashing raw JSON.stringify would make a freshly
// re-loaded, byte-identical-in-content file hash differently from the pre-save in-memory object that
// produced it — a false "conflict" on every apply that immediately follows another, with no real edit
// in between.
//
// Deliberately NOT the same thing as parsheet/computeBlueprintHash.ts, despite the similar name: that
// one also canonicalizes field order, but additionally drops empty-vs-omitted distinctions so a
// PAR-sheet round trip hashes as unchanged, and — critically — has no representation at all for
// reelStripGeneration/symbolWeights (PAR sheets can't carry procedural reel generation at all — see
// ParSheetExporter's own preflight rejection of those two fields), so it would silently ignore edits to
// exactly those fields a conflict check needs to catch. Use *this* one for "did the raw blueprint
// content change", that one only for "does this still round-trip losslessly through a PAR sheet".
export function computeGameBlueprintHash(blueprint: unknown): string {
    return `sha256:${crypto.createHash("sha256").update(JSON.stringify(canonicalize(blueprint))).digest("hex")}`;
}

function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(canonicalize);
    }
    if (value !== null && typeof value === "object") {
        const sorted: Record<string, unknown> = {};
        for (const key of Object.keys(value as Record<string, unknown>).sort()) {
            sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
        }
        return sorted;
    }
    return value;
}
