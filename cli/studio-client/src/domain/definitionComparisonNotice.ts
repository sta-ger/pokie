import type {MathDefinitionDiff} from "../../../../src/diff/MathDefinitionDiff.js";

/**
 * The headline and explanation shown above a definition comparison. An "invalid" or "partial"
 * comparison must never read like a clean mathematical match: the editable fields may agree while
 * the optional validation could not prove (or actively rejected) the compared models.
 */
export type DefinitionComparisonNotice = {
    readonly label: string;
    readonly detail?: string;
};

export function describeDefinitionComparison(
    diff: Pick<MathDefinitionDiff, "status" | "changes">,
): DefinitionComparisonNotice {
    const mathematicalChanges = diff.changes.filter((change) => change.mathematical);
    if (mathematicalChanges.length > 0) {
        return {
            label: diff.status,
            detail: `${mathematicalChanges.length} mathematical field${mathematicalChanges.length === 1 ? " differs" : "s differ"}.`,
        };
    }
    switch (diff.status) {
        case "identical":
            return {label: "no mathematical differences", detail: "The editable mathematical fields match."};
        case "different":
            return {
                label: "no mathematical differences",
                detail: "Only representation, provenance or technical metadata differs; see technical comparison details.",
            };
        case "partial":
            return {
                label: "no mathematical differences",
                detail: "Some technical metadata could not be compared; see technical comparison details.",
            };
        case "invalid":
            return {
                label: "invalid",
                detail: "At least one compared definition failed validation; review the technical comparison details before applying it.",
            };
        case "unsupported":
            return {
                label: "unsupported",
                detail: "One or both definitions could not be compared completely; review the technical comparison details.",
            };
        case "failed":
            return {
                label: "failed",
                detail: "The comparison did not complete; review the technical comparison details and try again.",
            };
        case "cancelled":
            return {label: "cancelled", detail: "The comparison was cancelled; run it again when ready."};
    }
}
