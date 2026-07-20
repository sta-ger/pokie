import type {
    CertificationEvidenceBundleManifest,
    StudioCertificationBuildView,
    StudioCertificationSourceValidateView,
    ValidationIssue,
} from "../../api/types";

// Pure view-model transforms for the Certification tab -- same role as OutcomeLibraries.ts's own
// describe*/isStale* functions. Every hash/metric shown by this tab is exactly what
// CertificationEvidenceBundleBuilder/CertificationEvidenceBundleValidator already computed server-side
// -- nothing here recomputes a hash, samples a round, or re-derives an outcome's own analysis; these
// functions only add idle/loading/network-error states around the server's own DTOs and turn
// already-computed data into plain-language labels.

export type CertificationSourceValidateRequestView =
    | {status: "idle"}
    | {status: "loading"}
    | {status: "network-error"; message: string}
    | StudioCertificationSourceValidateView;

export function describeCertificationSourceValidateResult(result: StudioCertificationSourceValidateView): CertificationSourceValidateRequestView {
    return result;
}

// "network-error" (a thrown fetch failure) is kept distinct from StudioCertificationBuildView's own
// domain-level "error" status (a diagnosable build failure, with issues) -- both can't share the
// literal "error" without colliding in this union's own discriminant.
export type CertificationBuildRequestView =
    | {status: "idle"}
    | {status: "loading"}
    | {status: "network-error"; message: string}
    | StudioCertificationBuildView;

export function describeCertificationBuildResult(result: StudioCertificationBuildView): CertificationBuildRequestView {
    return result;
}

// Every outcome a Validate/Build step can end up in, in the language a non-technical user would
// recognize -- never re-validating anything, only reading whether the response's own errors/warnings
// (already computed server-side) are non-empty. "partial" means "succeeded, but with warnings worth
// reviewing" -- never a blocker; "invalid" means the step produced no usable result at all.
export type CertificationOutcome = "success" | "partial" | "invalid";

export function describeCertificationOutcome(view: {errors: readonly ValidationIssue[]; warnings: readonly ValidationIssue[]}): CertificationOutcome {
    if (view.errors.length > 0) {
        return "invalid";
    }
    if (view.warnings.length > 0) {
        return "partial";
    }
    return "success";
}

// A one-line, plain-language summary of a built certification/evidence bundle's own recorded identity
// -- purely a human-readable restatement of fields the manifest already carries.
export function describeCertificationProvenanceSummary(manifest: CertificationEvidenceBundleManifest): string {
    const modeCount = manifest.modes.length;
    return (
        `Certification evidence for ${manifest.game.name} v${manifest.game.version}, ` +
        `built from ${modeCount} mode${modeCount === 1 ? "" : "s"} of the source outcome-library bundle ` +
        `(pokie v${manifest.pokieVersion}). Evidence hash ${manifest.evidenceContentHash}.`
    );
}
