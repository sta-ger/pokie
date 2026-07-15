import {computeWeightedOutcomeLibraryHash} from "../weightedoutcome/computeWeightedOutcomeLibraryHash.js";
import type {WeightedOutcomeLibrary} from "../weightedoutcome/WeightedOutcomeLibrary.js";
import {InMemoryPreGeneratedOutcomeSourceError} from "./InMemoryPreGeneratedOutcomeSourceError.js";
import type {PreGeneratedOutcomeSelection} from "./PreGeneratedOutcomeSelection.js";
import type {PreGeneratedOutcomeSourcing} from "./PreGeneratedOutcomeSourcing.js";
import type {WeightedOutcomeRandomSource} from "./WeightedOutcomeRandomSource.js";
import type {WeightedOutcomeSelecting} from "./WeightedOutcomeSelecting.js";
import {WeightedOutcomeSelector} from "./WeightedOutcomeSelector.js";

// The PreGeneratedOutcomeSourcing adapter over an already-built, fully in-memory WeightedOutcomeLibrary — what
// PreGeneratedSpinCommandHandler used to be wired to directly before this abstraction existed. Verifies the
// caller-supplied libraryHash against the library's own actual, freshly recomputed hash once, at construction
// (InMemoryPreGeneratedOutcomeSourceError on a mismatch) — since the library is immutable/frozen for this
// adapter's whole lifetime, there both nothing to gain from re-verifying on every draw and no way for its
// identity to ever drift out from under a caller mid-session, unlike a bundle-backed source.
export class InMemoryPreGeneratedOutcomeSource<T extends string | number = string> implements PreGeneratedOutcomeSourcing<T> {
    private readonly library: WeightedOutcomeLibrary<T>;
    private readonly libraryHash: string;
    private readonly totalWeight: number;
    private readonly selector: WeightedOutcomeSelecting;

    constructor(library: WeightedOutcomeLibrary<T>, libraryHash: string, selector: WeightedOutcomeSelecting = new WeightedOutcomeSelector()) {
        const actualHash = computeWeightedOutcomeLibraryHash(library);
        if (libraryHash !== actualHash) {
            throw new InMemoryPreGeneratedOutcomeSourceError(
                `libraryHash "${libraryHash}" does not match library "${library.libraryId}"'s actual hash "${actualHash}".`,
            );
        }
        this.library = library;
        this.libraryHash = libraryHash;
        this.totalWeight = library.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0);
        this.selector = selector;
    }

    public drawOutcome(randomSource: WeightedOutcomeRandomSource): Promise<PreGeneratedOutcomeSelection<T>> {
        const outcome = this.selector.select(this.library, randomSource);
        return Promise.resolve({libraryId: this.library.libraryId, libraryHash: this.libraryHash, totalWeight: this.totalWeight, outcome});
    }
}
