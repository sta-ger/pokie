import path from "path";
import type {ArtifactConversionPlan, ArtifactTargetType} from "pokie";

/**
 * Checks the immutable facts an adapter supplied when it prepared a plan.  This
 * deliberately does not re-plan: a changed source, destination, or generation
 * request must be surfaced as recovery, never silently turned into a different
 * conversion.
 */
export function describePreparedArtifactPlanDrift(
    plan: ArtifactConversionPlan | undefined,
    sourcePath: string,
    target: ArtifactTargetType,
    destinationPath?: string,
    generationSemantics?: "exact" | "boundedSample",
): string | undefined {
    if (plan === undefined || plan.status !== "planned") return undefined;
    if (plan.source.canonicalLocation !== undefined && plan.source.canonicalLocation !== path.resolve(sourcePath)) {
        return "The selected source changed after this conversion was prepared; refresh the preview and retry.";
    }
    if (plan.target.kind !== target) {
        return "The requested target no longer matches the prepared conversion; refresh the preview and retry.";
    }
    if (destinationPath !== undefined && plan.target.canonicalLocation !== undefined && plan.target.canonicalLocation !== path.resolve(destinationPath)) {
        return "The requested destination changed after this conversion was prepared; refresh the preview and retry.";
    }
    if (generationSemantics !== undefined && plan.target.configurationProvenance?.generationSemantics !== undefined &&
        plan.target.configurationProvenance.generationSemantics !== generationSemantics) {
        return "The requested generation strategy changed after this conversion was prepared; refresh the preview and retry.";
    }
    return undefined;
}
