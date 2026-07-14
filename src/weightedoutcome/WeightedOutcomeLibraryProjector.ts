import type {WeightedOutcomeLibrary} from "./WeightedOutcomeLibrary.js";

// A WeightedOutcomeLibrary is transport/storage-agnostic; a projector turns it into one concrete
// representation. PokieJsonWeightedOutcomeLibraryProjector is the standard, ready-made one (canonical JSON +
// content hash) — implement this directly for a different representation without touching
// WeightedOutcomeLibrary itself.
export interface WeightedOutcomeLibraryProjector<T extends string | number, TOutput> {
    project(library: WeightedOutcomeLibrary<T>): TOutput;
}
