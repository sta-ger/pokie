import type {ValidationIssue} from "pokie";

// The project-scoped "Apply" endpoint's own DTO — see applyGameBlueprintToProject.ts for the
// conditional-commit semantics behind it. "conflict" means the source blueprint on disk no longer
// matches the snapshot this request was built from (an external edit landed since it was loaded, or
// even while this request was staging its own write) — never a write, in either case. "invalid" is a
// defensive re-validation (the client should already have validated), also never a write. "error"
// covers any write failure — the accompanying message says whether an already-committed resource was
// rolled back, or (the one unrecoverable case) names a stale backup path to restore by hand.
export type StudioBlueprintApplyView =
    | {status: "ok"; blueprintHash: string; warnings: ValidationIssue[]}
    | {status: "conflict"; currentHash: string}
    | {status: "invalid"; errors: ValidationIssue[]; warnings: ValidationIssue[]}
    | {status: "error"; error: string};
