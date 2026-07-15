import type {PreGeneratedOutcomeSelection} from "./PreGeneratedOutcomeSelection.js";
import type {WeightedOutcomeRandomSource} from "./WeightedOutcomeRandomSource.js";

// What PreGeneratedSpinCommandHandler actually needs to serve a round — a single atomic weighted draw — without
// ever being tied to a full WeightedOutcomeLibrary sitting in memory. WeightedOutcomeSelecting.select(library,
// randomSource) requires the whole library up front; this interface exists specifically so a bundle-backed
// source (see OutcomeLibraryBundleOutcomeSource) can serve draws directly off disk, one index read at a time,
// without ever materializing every outcome.
//
// Two implementations: InMemoryPreGeneratedOutcomeSource (wraps an already-built WeightedOutcomeLibrary, reusing
// WeightedOutcomeSelector) and OutcomeLibraryBundleOutcomeSource (reads a canonical outcome-library bundle's own
// small index, never calling readLibrary()) — both return exactly the same shape, so
// PreGeneratedSpinCommandHandler never has to special-case which kind of source it was given.
export interface PreGeneratedOutcomeSourcing<T extends string | number = string> {
    // Atomically draws one outcome and returns it together with the exact libraryId/libraryHash/totalWeight that
    // draw was made against. "Atomic" here means: a caller comparing this result's libraryId/libraryHash against
    // some previously-recorded expectation is always comparing against the *same* version the outcome itself was
    // drawn from — never a separately-fetched, potentially staler or newer, snapshot.
    //
    // May throw PreGeneratedOutcomeSourceConflictError to signal a genuine source-level conflict — the
    // underlying content this draw relied on no longer matches what the source itself last promised (e.g. a
    // bundle rewritten mid-read) — which PreGeneratedSpinCommandHandler catches specifically and turns into a
    // graceful "conflict" result, before the idempotency cache is consulted and before any wallet transaction.
    // Any other thrown error propagates unchanged, as a genuine fault rather than an operational conflict.
    drawOutcome(randomSource: WeightedOutcomeRandomSource): Promise<PreGeneratedOutcomeSelection<T>>;
}
