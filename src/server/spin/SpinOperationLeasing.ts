// Optional capability, additive to SpinOperationLog (feature-detected via isSpinOperationLeasing) — lets
// a SpinOperationLog additionally hand out short, exclusive, time-boxed, *fenced* reconciliation claims
// per (sessionId, requestId). This exists so a SpinReconciliationService granted
// exclusiveStartupAuthority (see that class's own doc comment) can establish real, explicit, verifiable
// ownership of a specific record before mutating it — and keep re-verifying that ownership as it works —
// rather than ever relying on a checkpoint's own age alone: two separate processes (or a process and a
// live attempt, under clock skew or simply a slow reconciler) could each independently satisfy any age
// threshold without the record actually being abandoned.
//
// Fencing, not just mutual exclusion: every method here is keyed not just on (sessionId, requestId) but
// on an opaque owner token minted by tryClaimForReconciliation() and required by every later call. This is
// what stops a *stale* owner — one whose own claim already expired, was released, or was superseded by a
// new claimant — from renewing or releasing a claim that isn't its own anymore, even though it has no way
// to know that on its own. A boolean-returning "did I get the lease" API (this interface's own first
// draft) cannot express this: two different callers holding what they each believe is "the" claim have no
// way to tell each other apart, so a stale caller's own eventual release() would silently delete whoever
// legitimately holds the claim now. An owner token closes that gap structurally.
//
// An implementation must make every one of "check the current claim, then act" a single atomic step per
// call (e.g. a conditional/compare-and-swap write against its own backing store, or — for a genuinely
// single-process store — ordinary synchronous JS execution, which is atomic with respect to any other
// same-process caller by construction).
export interface SpinOperationLeasing {
    // Attempts to claim exclusive reconciliation ownership of (sessionId, requestId) for up to
    // leaseDurationMs. Returns a fresh, unguessable owner token if this call now holds the claim (no one
    // else held an unexpired one), or undefined otherwise. A caller that receives undefined must not
    // perform any mutating reconciliation action against this record.
    tryClaimForReconciliation(sessionId: string, requestId: string, leaseDurationMs: number): Promise<string | undefined>;

    // Re-confirms and extends a still-current claim immediately before a caller is about to perform an
    // actual mutating step (a wallet reversal, a session/idempotency write) — narrowing, though not
    // eliminating, the window in which a lease could expire mid-reconciliation. Returns true (and extends
    // the claim's own expiry by leaseDurationMs from now) only when ownerToken is still the record's
    // current, unexpired claim; false when it's stale — already expired, already released, or superseded
    // by a different claimant's token. A caller receiving false must treat itself as having lost ownership
    // and abort immediately, performing no further mutation — exactly as if it had never won the claim.
    renewReconciliationClaim(sessionId: string, requestId: string, ownerToken: string, leaseDurationMs: number): Promise<boolean>;

    // Releases the claim identified by ownerToken, but only while it's still the current, unexpired
    // holder — a stale token (already expired, already released, or superseded by a newer claimant) is a
    // safe no-op that never touches whichever claim (if any) is actually active. This is what stops a
    // stale owner's own eventual release() from clobbering a newer owner's still-active claim.
    releaseReconciliationClaim(sessionId: string, requestId: string, ownerToken: string): Promise<void>;
}
