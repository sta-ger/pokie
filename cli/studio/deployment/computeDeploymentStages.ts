import type {ExternalDeploymentResult, ValidationIssue} from "pokie";
import type {StudioDeploymentStageSummary} from "./StudioDeploymentStageSummary.js";

function hasError(issues: readonly ValidationIssue[]): boolean {
    return issues.some((issue) => issue.severity === "error");
}

function stageStatus(skippedBecauseEarlierStageFailed: boolean, thisStageFailed: boolean): "ok" | "error" | "skipped" {
    if (skippedBecauseEarlierStageFailed) {
        return "skipped";
    }
    return thisStageFailed ? "error" : "ok";
}

// The one place StudioDeploymentRunView.stages is computed — server-side, from the exact
// ExternalDeploymentResult ExternalDeploymentService.deploy() returned, never inferred by a client from
// which DTO fields happen to be present. This exists specifically because "is `generation` present"
// is *not* a safe proxy for "did the generation stage fail": ExternalDeploymentService treats a
// generator's return value as untrusted and runs StandardExternalArtifactValidator against it before
// `generation` is ever populated (see that class's own doc comment) — when that structural check
// itself fails, `generation` stays `undefined` even though the generator was actually invoked
// successfully, and the real diagnostics explaining what went wrong live in `artifactIssues`, not in
// any (nonexistent) `generation.issues`. Naively treating "generation === undefined" as "the
// generation stage failed" would misattribute that failure to the wrong stage and — worse — mark the
// artifact-validation stage that actually owns those diagnostics as "skipped", hiding them entirely.
//
// So the two stages are deliberately kept apart by what they each actually represent:
//   - "generation" is ok unless the generator itself reported its own error (`generation.issues` has
//     one) once it's already known to have returned a well-formed result — never merely because
//     `generation` is absent for some other stage's reason.
//   - "artifactValidation" owns *every* issue in `artifactIssues`, regardless of whether it came from
//     StandardExternalArtifactValidator's structural check (generation still undefined),
//     target.artifactValidator, or an extra validator — exactly matching where ExternalDeploymentService
//     itself put those diagnostics.
export function computeDeploymentStages(result: ExternalDeploymentResult, publish: boolean): StudioDeploymentStageSummary[] {
    const descriptorFailed = hasError(result.descriptorIssues);
    const compatibilityFailed = hasError(result.compatibilityIssues);
    const projectionFailed = hasError(result.projectionIssues);

    const upToProjectionFailed = descriptorFailed || compatibilityFailed || projectionFailed;

    // Only a genuine generator-reported failure (its own `.issues`, once the raw result was already
    // confirmed well-formed) counts against the generation stage itself — see the function's own doc
    // comment above for why "generation === undefined" alone must never be read as "generation failed".
    const generationReportedFailure = result.generation !== undefined && hasError(result.generation.issues);
    const upToGenerationFailed = upToProjectionFailed || generationReportedFailure;

    const artifactValidationFailed = hasError(result.artifactIssues);
    const upToArtifactValidationFailed = upToGenerationFailed || artifactValidationFailed;

    const stages: StudioDeploymentStageSummary[] = [
        {key: "descriptor", label: "Target descriptor", status: stageStatus(false, descriptorFailed), issues: result.descriptorIssues},
        {key: "compatibility", label: "Compatibility", status: stageStatus(descriptorFailed, compatibilityFailed), issues: result.compatibilityIssues},
        {key: "projection", label: "Round projection", status: stageStatus(descriptorFailed || compatibilityFailed, projectionFailed), issues: result.projectionIssues},
        {
            key: "generation",
            label: "Artifact generation",
            status: stageStatus(upToProjectionFailed, generationReportedFailure),
            issues: result.generation?.issues ?? [],
        },
        {
            key: "artifactValidation",
            label: "Artifact validation",
            status: stageStatus(upToGenerationFailed, artifactValidationFailed),
            issues: result.artifactIssues,
        },
    ];

    const diagnosticFailed = result.diagnostic !== undefined && !result.diagnostic.ok;
    stages.push({
        key: "diagnostic",
        label: "Target diagnostic",
        status: stageStatus(upToArtifactValidationFailed || result.diagnostic === undefined, diagnosticFailed),
        issues: (result.diagnostic?.checks ?? [])
            .filter((check) => !check.ok)
            .map((check) => ({code: check.name, severity: "error" as const, message: check.message ?? `"${check.name}" failed.`})),
    });

    const deliveryFailed = result.delivery === undefined || !result.delivery.delivered;
    stages.push({
        key: "delivery",
        label: "Delivery",
        status: stageStatus(!publish || upToArtifactValidationFailed || diagnosticFailed, deliveryFailed),
        issues: result.delivery?.issues ?? [],
    });

    return stages;
}
