import type {StudioFairnessConfigureView, StudioFairnessGenerateView, StudioFairnessVerifyView, ValidationIssue} from "../../api/types";

// Pure view-model transforms for the Provably Fair tab -- same role as OutcomeLibraries.ts's own
// describe*/isStale* functions. Every hash/artifact shown by this tab is exactly what
// computeFairnessServerSeedCommitment/computeFairnessCommitment/FairnessRoundProofBuilder/
// FairnessRoundProofVerifier already computed server-side -- nothing here recomputes a hash, draws an
// outcome, or re-derives a proof's own validity; these functions only add idle/loading/network-error
// states around the server's own DTOs and turn already-computed data into plain-language labels.

export type FairnessConfigureRequestView = {status: "idle"} | {status: "loading"} | {status: "error"; message: string} | StudioFairnessConfigureView;

export function describeFairnessConfigureResult(result: StudioFairnessConfigureView): FairnessConfigureRequestView {
    return result;
}

export type FairnessGenerateRequestView = {status: "idle"} | {status: "loading"} | {status: "error"; message: string} | StudioFairnessGenerateView;

export function describeFairnessGenerateResult(result: StudioFairnessGenerateView): FairnessGenerateRequestView {
    return result;
}

export type FairnessVerifyRequestView = {status: "idle"} | {status: "loading"} | {status: "error"; message: string} | StudioFairnessVerifyView;

export function describeFairnessVerifyResult(result: StudioFairnessVerifyView): FairnessVerifyRequestView {
    return result;
}

// Every outcome the Verify step can end up in, in the language a non-technical user would recognize --
// never re-validating anything, only reading whether the verifier's own errors/warnings (already
// computed server-side) are non-empty. "partial" means "verified, but with warnings worth reviewing" --
// never a blocker; "invalid" means the proof did not verify.
export type FairnessOutcome = "success" | "partial" | "invalid";

export function describeFairnessOutcome(view: {errors: readonly ValidationIssue[]; warnings: readonly ValidationIssue[]}): FairnessOutcome {
    if (view.errors.length > 0) {
        return "invalid";
    }
    if (view.warnings.length > 0) {
        return "partial";
    }
    return "success";
}

// An honest explanation of the two-phase commit-reveal publish order these two artifacts represent --
// never a live negotiation, just what a real round would publish and when.
export function describeFairnessCommitmentPublishOrder(): string {
    return (
        "In a real round, the server seed commitment is published first, before the player's client seed/nonce " +
        "are even solicited. The full commitment is published next, once those are known, but still before the " +
        "outcome is drawn. Both are shown here together so you can inspect what each step would publish."
    );
}
