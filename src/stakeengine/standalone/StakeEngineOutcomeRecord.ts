import type {StakeEngineEvent} from "../StakeEngineEvent.js";

// One outcome read from an arbitrary Stake Engine outcome directory (a mode's own lookup CSV/books pair),
// normalized into POKIE's own canonical shape -- deliberately NOT a RoundArtifact/WeightedOutcome. Reconstructing
// either of those (see StakeEngineImporting) requires POKIE-specific knowledge a genuinely foreign export never
// carries and this standalone pipeline never assumes: a fixed reveal/win/finalWin event vocabulary, a per-round
// win breakdown, betMode/stake, a pokie-manifest.json. This DTO only ever holds what index.json/CSV/books
// themselves actually contain, reversed exactly where that's possible.
//
// "ratio" is "payoutMultiplier" (Stake's own integer unit, see docs/stake-engine-export.md#stake-unit-conversion)
// reversed via convertStakeUnitsToRatio at the owning mode's own cost -- undefined when that reversal can't be
// guaranteed exact (StakeEngineOutcomeSourceReader reports this as an informational, non-blocking issue rather
// than failing the read), so a caller always knows whether it can trust the normalized value or only the raw
// Stake integer.
export type StakeEngineOutcomeRecord = {
    readonly id: number;
    // CSV weights are uint64 values.  `number` remains accepted for callers that construct the DTO themselves,
    // but the standalone reader always supplies bigint and the analyzer rejects unsafe legacy numbers.
    readonly weight: bigint | number;
    readonly payoutMultiplier: number;
    readonly ratio: number | undefined;
    readonly events: readonly StakeEngineEvent[];
};
