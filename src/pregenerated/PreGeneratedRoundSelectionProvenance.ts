// Which library and outcome produced a PreGeneratedRoundResult, and the exact probability it carried
// at selection time — the audit trail proving a served round came from a specific, hashable library
// rather than a live calculation. `weight`/`totalWeight`/`probability` are captured at build time
// rather than recomputed later so this stays a true record of what was actually selected even if the
// library is later regenerated with different weights under the same libraryId.
export type PreGeneratedRoundSelectionProvenance = {
    readonly libraryId: string;
    readonly libraryHash: string;
    readonly outcomeId: string;
    readonly weight: number;
    readonly totalWeight: number;
    readonly probability: number;
};
