// The checkpoint sequence SpinCommandHandler.playAndSettle() writes to SpinOperationLog as it progresses
// through one requestId-bearing attempt — never for a requestId-less call, the same scope idempotency
// itself already has (see SpinOperationLog's own doc comment). Written durably, immediately after the
// underlying step actually succeeds, never in advance — the same "record the truth right after it
// happens" discipline atomicallyWriteExternalDeploymentArtifactsToDirectory uses for a filesystem swap,
// applied here to a cross-store attempt instead.
//
// "started"/"debited"/"settled"/"session-saved" are in-flight — an attempt whose process died (or whose
// own in-process compensation failed) leaves its record at exactly one of these, which is what
// SpinReconciliationService reads to decide what happened. "committed"/"compensated" are terminal: the
// attempt is fully resolved one way or the other and SpinOperationLog.listIncomplete() never returns it
// again.
export type SpinOperationCheckpoint =
    // Recorded before the wallet debit is even attempted — nothing has been applied yet. By code order
    // alone (never contingent on wallet inspection), an attempt found stuck here is always safe to treat
    // as if it never happened.
    | "started"
    // The stake debit succeeded. Whether play()/the win settlement that follows it ever ran is unknown
    // from the checkpoint alone — see SpinReconciliationService's own doc comment for how it resolves
    // this, with or without an inspectable wallet.
    | "debited"
    // The win credit/debit-delta succeeded — both wallet legs of this attempt are now confirmed applied.
    // The record's own capturedResult is populated from here on, so reconciliation never needs to call
    // session.play() again to recover what this attempt already computed.
    | "settled"
    // The new session state was persisted. Only the idempotency-result write is outstanding.
    | "session-saved"
    // Terminal: the idempotency result was persisted too — the attempt is fully done, exactly as if
    // nothing had ever gone wrong.
    | "committed"
    // Terminal: this attempt failed, and every one of playAndSettle()'s own compensating writes
    // (restoreSessionState/reverseApplied) succeeded — wallet and session are back to their pre-attempt
    // state. Never written when any compensating step itself failed; see SpinCommandHandler's own catch
    // block for why leaving the checkpoint at its last honest in-flight value there instead is deliberate.
    | "compensated";
