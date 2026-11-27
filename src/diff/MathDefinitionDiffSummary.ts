import type {MathDefinitionDiff} from "./MathDefinitionDiff.js";

export type MathDefinitionDiffSummary = {
    label: "identical" | "representation-only" | "different" | "partial" | "unsupported" | "invalid" | "failed" | "cancelled";
    mathematicalChanges: number;
    representationChanges: number;
    provenanceChanges: number;
    validationChanges: number;
    advancedInconclusive: boolean;
    revisionsEqual: boolean;
};

/** Human/CI classification that keeps provenance-only noise separate from real math changes. */
export function summarizeMathDefinitionDiff(diff: MathDefinitionDiff): MathDefinitionDiffSummary {
    const count = (predicate: (change: MathDefinitionDiff["changes"][number]) => boolean): number =>
        diff.changes.filter(predicate).length;
    const mathematicalChanges = count((change) => change.mathematical);
    const advancedInconclusive = [diff.left, diff.right].some(
        (source) =>
            source.support !== "complete" ||
            source.advanced === undefined ||
            source.advanced.verdict !== "proved-within-assumptions",
    );
    const revisionsEqual =
        typeof diff.left.identity.revision === "string" &&
        diff.left.identity.revision.length > 0 &&
        diff.left.identity.revision === diff.right.identity.revision;
    let label: MathDefinitionDiffSummary["label"];
    if (diff.status === "identical") label = "identical";
    else if (mathematicalChanges > 0) label = "different";
    else if (diff.status === "different") label = "representation-only";
    else label = diff.status;
    return {
        label,
        mathematicalChanges,
        representationChanges: count((change) => change.classification === "representation"),
        provenanceChanges: count((change) => change.classification === "provenance"),
        validationChanges: count((change) => change.classification === "validation"),
        advancedInconclusive,
        revisionsEqual,
    };
}

/**
 * `--ci` exit policy: 0 identical or representation/provenance-only, 1 mathematical change, 2 incomplete/error.
 * An equal retained revision is enough to treat provenance-only changes as safe even when the optional advanced
 * proof exhausted its budget; without that equality, an inconclusive proof remains exit 2.
 */
export function mathDefinitionDiffCiExitCode(diff: MathDefinitionDiff): number {
    if (!["identical", "different", "partial"].includes(diff.status)) return 2;
    const summary = summarizeMathDefinitionDiff(diff);
    if (summary.mathematicalChanges > 0) return summary.advancedInconclusive ? 2 : 1;
    if (summary.advancedInconclusive && !summary.revisionsEqual) return 2;
    return 0;
}
