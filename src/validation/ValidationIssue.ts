import type {ValidationIssueSeverity} from "./ValidationIssueSeverity.js";

export type ValidationIssue = {
    code: string;
    severity: ValidationIssueSeverity;
    message: string;
    details?: Record<string, unknown>;
    suggestion?: string;
    // Optional dotted/bracketed field path (e.g. "manifest.id", "reels") this issue is about, when a
    // check targets exactly one field -- absent for cross-field/structural checks. Populated only where
    // a validator already knows the specific field at the point it pushes the issue (see
    // GameBlueprintValidator's own manifest/reels/rows checks); never inferred after the fact.
    path?: string;
};
