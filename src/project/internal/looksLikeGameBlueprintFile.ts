import fs from "fs";

// A lightweight, non-throwing recognition check for ProjectTargetResolver's blueprint adapter — deliberately
// not the structural validation GameBlueprintValidator already owns: just enough of GameBlueprint's own
// required fields (manifest, reels, rows, symbols, paytable — see generated/GameBlueprint.ts) to tell "this
// JSON file is a blueprint source" apart from any other JSON file a caller might point the resolver at.
// Returns false for a file that doesn't exist or whose content doesn't parse as JSON, isn't a JSON object, or
// is missing any of those required fields — a malformed or merely-unrelated ".json" file is simply not
// recognized, not an error (see ProjectTargetResolver's own "never throws for a non-match" contract).
export function looksLikeGameBlueprintFile(filePath: string): boolean {
    let parsed: unknown;
    try {
        parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
        return false;
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return false;
    }

    const candidate = parsed as Record<string, unknown>;
    return (
        typeof candidate.manifest === "object" &&
        candidate.manifest !== null &&
        typeof candidate.reels === "number" &&
        typeof candidate.rows === "number" &&
        Array.isArray(candidate.symbols) &&
        typeof candidate.paytable === "object" &&
        candidate.paytable !== null
    );
}
