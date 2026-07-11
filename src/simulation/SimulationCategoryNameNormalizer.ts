// Validates/normalizes a raw category string coming from a game session's optional
// SimulationCategoryDetermining contract before it's used as a SimulationReport.breakdown key. A
// game author controls this string, but it still ends up as a JSON object key and a table row label
// in "pokie sim"/"report"/"diff" output, so it's kept to a small, predictable identifier shape rather
// than accepting arbitrary text.
export class SimulationCategoryNameNormalizer {
    // Long enough for any reasonable category name ("holdAndWin", "bonus-buy-super", ...), short
    // enough to keep JSON reports and table output readable.
    public static readonly MAX_LENGTH = 64;
    // Starts with a letter, then letters/digits/hyphen/underscore — mirrors the "base"/"freeGames"
    // identifier style already used by the built-in categories, while still allowing "hold-and-win"
    // or "bonus_buy" style names.
    private static readonly VALID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;

    // Returns the trimmed category name, or undefined if it's empty, too long, or contains characters
    // outside the safe identifier pattern — never throws, so a misbehaving session can't crash a
    // long-running simulation over a bad category string.
    public static normalize(rawCategory: unknown): string | undefined {
        if (typeof rawCategory !== "string") {
            return undefined;
        }
        const trimmed = rawCategory.trim();
        if (trimmed.length === 0 || trimmed.length > SimulationCategoryNameNormalizer.MAX_LENGTH) {
            return undefined;
        }
        if (!SimulationCategoryNameNormalizer.VALID_PATTERN.test(trimmed)) {
            return undefined;
        }
        return trimmed;
    }
}
