import type {ValidationIssue} from "pokie";

// The Certification tab's "Validate" step -- a preflight, opt-in-before-you-commit run of the exact
// same deep bundle validation CertificationEvidenceBundleBuilder.buildFromBundle itself runs (and
// aborts on) before sampling a single round. Never a bespoke check: same OutcomeLibraryBundleValidating
// call the Outcome Libraries tab's own deep validation uses (see StudioOutcomeLibraryService.validateBundleDeep).
export type StudioCertificationSourceValidateView =
    | {readonly status: "ok"; readonly errors: readonly ValidationIssue[]; readonly warnings: readonly ValidationIssue[]}
    | {readonly status: "load-error"; readonly error: string};
