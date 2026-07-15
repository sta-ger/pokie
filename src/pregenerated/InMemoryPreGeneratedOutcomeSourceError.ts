// Thrown synchronously by InMemoryPreGeneratedOutcomeSource's constructor when the caller-supplied libraryHash
// doesn't match the given library's own actual, freshly recomputed hash (computeWeightedOutcomeLibraryHash) — a
// stale hash left over from a library that was since regenerated with different weights/outcomes under the same
// libraryId. Fails fast at construction, once, since an in-memory library never changes for the adapter's whole
// lifetime — there is nothing to gain from re-checking on every draw.
export class InMemoryPreGeneratedOutcomeSourceError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "InMemoryPreGeneratedOutcomeSourceError";
    }
}
