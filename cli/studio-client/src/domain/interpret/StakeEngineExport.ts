import type {StudioStakeEngineExportValidateView, StudioStakeEngineExportView, ValidationIssue} from "../../api/types";

// Pure view-model transforms for the Stake Engine Export tab -- same role as Certification.ts's own
// describe* functions. Every hash/count/manifest field shown by this tab is exactly what
// StakeEngineExporter/StakeEngineExportValidator already computed server-side -- nothing here converts a
// payoutMultiplier into Stake units, renders a lookup CSV, or re-derives a library's own outcome
// count/hash; these functions only add idle/loading/network-error states around the server's own DTOs and
// turn already-computed data into plain-language labels.

export type StakeEngineExportValidateRequestView =
    | {status: "idle"}
    | {status: "loading"}
    | {status: "network-error"; message: string}
    | StudioStakeEngineExportValidateView;

export function describeStakeEngineExportValidateResult(result: StudioStakeEngineExportValidateView): StakeEngineExportValidateRequestView {
    return result;
}

// "network-error" (a thrown fetch failure) is kept distinct from StudioStakeEngineExportView's own
// domain-level "conflict"/"invalid"/"load-error" statuses -- none of them can share the literal "error"
// without colliding in this union's own discriminant.
export type StakeEngineExportRequestView =
    | {status: "idle"}
    | {status: "loading"}
    | {status: "network-error"; message: string}
    | StudioStakeEngineExportView;

export function describeStakeEngineExportResult(result: StudioStakeEngineExportView): StakeEngineExportRequestView {
    return result;
}

// Every outcome a Validate/Export step can end up in, in the language a non-technical user would
// recognize -- never re-validating anything, only reading whether the response's own errors/warnings
// (already computed server-side) are non-empty. "partial" means "succeeded, but with warnings worth
// reviewing" -- never a blocker; "invalid" means the step produced no usable result at all.
export type StakeEngineExportOutcome = "success" | "partial" | "invalid";

export function describeStakeEngineExportOutcome(view: {errors: readonly ValidationIssue[]; warnings: readonly ValidationIssue[]}): StakeEngineExportOutcome {
    if (view.errors.length > 0) {
        return "invalid";
    }
    if (view.warnings.length > 0) {
        return "partial";
    }
    return "success";
}
