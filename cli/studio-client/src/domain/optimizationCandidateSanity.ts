import type {GameModelPaytableRow, GameModelSymbol} from "../api/types";

type CandidateDiffEntry = {path: string; before: unknown; after: unknown};

const PAYTABLE_PATH = /^\/paytable\/([^/]+)\/(\d+)$/;
// Mirrors GameBlueprintValidator's own SUSPICIOUS_ENTRY_TIER_MULTIPLIER. A paytable's lowest match
// count is its most frequent paid event, so a very large multiplier there is more likely a typo than
// a deliberate design choice.
const SUSPICIOUS_ENTRY_TIER_MULTIPLIER = 10;

/**
 * A pre-Apply warning for an optimization candidate that would trip the blueprint validator's
 * "unusually generous entry payout" heuristic. The optimizer searches for RTP only; this keeps the
 * author from applying a mathematically convenient but suspicious paytable change without seeing the
 * same sanity check the validator will show afterwards.
 */
export function describeCandidatePaytableSanityWarning(
    diff: readonly CandidateDiffEntry[] | undefined,
    paytableRows: readonly GameModelPaytableRow[] | undefined,
    symbols: readonly GameModelSymbol[] | undefined,
): string | undefined {
    if (diff === undefined || paytableRows === undefined || symbols === undefined) return undefined;
    for (const change of diff) {
        const match = PAYTABLE_PATH.exec(change.path);
        if (match === null) continue;
        const symbolId = match[1]!;
        const matchCount = Number(match[2]);
        const after = Number(change.after);
        if (!Number.isFinite(after) || after <= SUSPICIOUS_ENTRY_TIER_MULTIPLIER) continue;
        if (symbols.find((symbol) => symbol.id === symbolId)?.isScatter === true) continue;
        const symbolRows = paytableRows.filter((row) => row.symbolId === symbolId);
        if (symbolRows.length === 0) continue;
        const lowestMatchCount = Math.min(...symbolRows.map((row) => row.matchCount));
        // A changed entry at the current lowest count, or a newly added count below it, becomes the
        // symbol's entry tier; a higher count keeps the existing 3-of-a-kind entry tier.
        if (matchCount > lowestMatchCount) continue;
        return `This candidate sets ${symbolId}, ${matchCount} symbols to ${after}× bet, above the ${SUSPICIOUS_ENTRY_TIER_MULTIPLIER}× sanity threshold for a symbol's lowest match count. The design validator may flag it as a data-entry mistake; double-check before applying.`;
    }
    return undefined;
}
