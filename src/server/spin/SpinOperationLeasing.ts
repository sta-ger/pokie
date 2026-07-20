// Optional capability, additive to SpinOperationLog (feature-detected via isSpinOperationLeasing) — lets
// a SpinOperationLog additionally hand out short, exclusive, time-boxed reconciliation claims per
// (sessionId, requestId). This exists so a SpinReconciliationService with no other structural guarantee
// (see that class's own doc comment's "Ownership" section — SpinCommandHandler's own reconcileOne()/
// reconcileAll() are the one thing that has one, via that handler's per-session enqueue() queue) can
// establish real, explicit authority to mutate a specific record before doing so, instead of ever relying
// on a checkpoint's own age alone: two separate processes (or a process and a live attempt with a
// skewed/slow clock) could both satisfy any age-based threshold at the same time, and age alone can never
// rule that out.
//
// An implementation must make "check whether a claim is currently held, then take it" a single atomic
// step (e.g. a conditional/compare-and-swap write against its own backing store, or — for a genuinely
// single-process store — ordinary synchronous JS execution, which is atomic with respect to any other
// same-process caller by construction). A naive check-then-write built from this interface's own
// load()/record() would reintroduce exactly the race this interface exists to close.
export interface SpinOperationLeasing {
    // Attempts to claim exclusive reconciliation ownership of (sessionId, requestId) for up to
    // leaseDurationMs. Returns true if this call now holds the claim (no one else held an unexpired one),
    // false otherwise. A caller that receives false must not perform any mutating reconciliation action
    // against this record — see SpinReconciliationService's own "deferred" outcome for what it does
    // instead.
    tryClaimForReconciliation(sessionId: string, requestId: string, leaseDurationMs: number): Promise<boolean>;

    // Releases a claim this caller holds, if any. Always safe to call — including for a claim that was
    // never held, was already released, or has already expired — never throws for any of those.
    releaseReconciliationClaim(sessionId: string, requestId: string): Promise<void>;
}
