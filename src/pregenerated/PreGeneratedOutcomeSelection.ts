import type {WeightedOutcome} from "../weightedoutcome/WeightedOutcome.js";

// Everything one atomic draw from a PreGeneratedOutcomeSourcing implementation returns, all read/computed from
// exactly the same underlying snapshot — an in-memory library's own fixed identity, or (for a bundle-backed
// source) a single index read. Bundling "which library/version this came from" together with "what was drawn"
// in one return value is what makes a caller's own identity check (see PreGeneratedSpinCommandHandler) relate to
// the *exact* version the draw itself was made against — a separate, later-fetched libraryHash could otherwise
// describe a different version than what actually got drawn, if the underlying source changed in between.
export type PreGeneratedOutcomeSelection<T extends string | number = string> = {
    readonly libraryId: string;
    readonly libraryHash: string;
    readonly totalWeight: number;
    readonly outcome: WeightedOutcome<T>;
};
