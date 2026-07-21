const CANONICAL_NON_NEGATIVE_INTEGER = /^(0|[1-9]\d*)$/;

// Strict CLI integer-argument parsing (e.g. "pokie fairness commit --nonce"): requires the string to already be
// the canonical decimal form of a safe non-negative integer, the same regex-first-then-Number.isSafeInteger
// pattern parseStakeEngineOutcomeId.ts already uses for parsing a canonical outcome id, reused here since a CLI
// integer argument needs the exact same guarantee. Plain `Number(value)` alone isn't enough — `Number("1e3")`
// silently parses to 1000, `Number("0x10")` to 16, `Number(" 3 ")` to 3, `Number("")` to 0 — none of which are
// anything a caller likely meant to type, and none of which the "!Number.isInteger(parsed)" checks CLI argument
// parsing has used elsewhere in this codebase would catch. Returns undefined for anything else (empty, whitespace,
// signed, fractional, scientific/hex notation, leading zeros, NaN/Infinity spellings, or a safe-looking digit
// string that overflows Number.MAX_SAFE_INTEGER) rather than throwing, so the caller can fold it into its own
// usage-error message with the flag name attached.
export function parseCanonicalNonNegativeInteger(value: string): number | undefined {
    if (!CANONICAL_NON_NEGATIVE_INTEGER.test(value)) {
        return undefined;
    }
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
}
