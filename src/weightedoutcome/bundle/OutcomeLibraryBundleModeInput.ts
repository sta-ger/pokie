import type {WeightedOutcomeInput} from "../buildWeightedOutcomeLibrary.js";

// One mode to persist into an outcome-library bundle — a streaming *source* of outcomes, not an already-built
// WeightedOutcomeLibrary: the writer consumes "outcomes" exactly once, in the order it arrives, validating and
// writing each one to disk as it goes, so a mode with an enormous number of outcomes never needs to exist as one
// in-memory array (see OutcomeLibraryBundleWriter). "outcomes" must already be in canonical (ascending, see
// compareIds) order by id — the same order buildWeightedOutcomeLibrary itself sorts to — since the writer can
// only verify that order as outcomes stream past, never re-sort them (that would require buffering all of
// them). A caller that already has a full WeightedOutcomeLibrary in memory can pass its own `outcomes` array
// directly (already sorted, since buildWeightedOutcomeLibrary guarantees it) — a plain array is a valid
// `Iterable`.
//
// Unlike StakeEngineExportModeInput, there's no "cost" — that's Stake's own bet-cost multiplier, meaningless to
// this generic, Stake-independent persistence format.
export type OutcomeLibraryBundleModeInput<T extends string | number = string> = {
    readonly modeName: string;
    readonly libraryId: string;
    readonly schemaVersion?: number;
    readonly outcomes: Iterable<WeightedOutcomeInput<T>> | AsyncIterable<WeightedOutcomeInput<T>>;
};
