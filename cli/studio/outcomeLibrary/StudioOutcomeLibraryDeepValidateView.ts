import type {ValidationIssue} from "pokie";

// Bundle-only: the "Validate & analyze" step's own deep-audit option (OutcomeLibraryBundleValidator with
// {deep: true}) -- streams every outcome line, re-verifies per-record hashes, and recomputes the whole
// mode's hash/analysis, cross-checked against the manifest. Deliberately a separate, explicitly-triggered
// endpoint rather than folded into "select": it's the one operation in this feature that's genuinely
// expensive on a large bundle, so it never runs unless the user asks for it.
export type StudioOutcomeLibraryDeepValidateView =
    | {readonly status: "ok"; readonly errors: readonly ValidationIssue[]; readonly warnings: readonly ValidationIssue[]}
    | {readonly status: "load-error"; readonly error: string};
