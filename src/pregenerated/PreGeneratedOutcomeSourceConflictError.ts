// Thrown by a PreGeneratedOutcomeSourcing implementation's own drawOutcome() to signal a genuine, operational
// source-level conflict — the underlying content this draw was made against no longer matches what the source
// itself last promised (e.g. a canonical outcome-library bundle whose outcomes file was rewritten between the
// index being read and the winning record's own byte range being read, or any other source-specific "the
// snapshot this draw relied on is stale" condition) — as opposed to a genuine bug or infrastructure fault, which
// should still propagate as whatever error it naturally throws.
//
// PreGeneratedSpinCommandHandler catches this specifically, and only this, right after drawing — before the
// idempotency cache is ever consulted and before any wallet transaction — and turns it into a "conflict"
// PreGeneratedSpinCommandResult, the same graceful, nothing-to-compensate outcome a session-identity mismatch
// already gets. Any PreGeneratedOutcomeSourcing implementation, not just the ones this package ships
// (OutcomeLibraryBundleOutcomeSource translates a byte-range hash/id/weight mismatch into this), may throw it.
export class PreGeneratedOutcomeSourceConflictError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PreGeneratedOutcomeSourceConflictError";
    }
}
