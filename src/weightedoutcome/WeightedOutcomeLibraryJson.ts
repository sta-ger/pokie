import type {WeightedOutcomeLibrary} from "./WeightedOutcomeLibrary.js";

// The canonical JSON projection of a WeightedOutcomeLibrary, stamped with its own content hash (see
// computeWeightedOutcomeLibraryHash) — what PokieJsonWeightedOutcomeLibraryProjector produces, and what a
// round-trip (JSON.stringify → JSON.parse → re-hash) is expected to reproduce byte-for-hash-identically.
export type WeightedOutcomeLibraryJson<T extends string | number = string> = WeightedOutcomeLibrary<T> & {
    readonly hash: string;
};
