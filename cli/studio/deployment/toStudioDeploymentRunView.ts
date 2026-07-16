import type {ExternalDeploymentResult} from "pokie";
import {computeDeploymentStages} from "./computeDeploymentStages.js";
import type {StudioDeploymentRunView} from "./StudioDeploymentRunView.js";

// The one conversion point from ExternalDeploymentService's own ExternalDeploymentResult to the plain
// JSON DTO an API response actually sends. Every field here is copied straight from `result` — the
// only real transforms are content-decoding each generated artifact's own `content` (string | Buffer)
// into a plain string, and computing `stages` (see computeDeploymentStages). This function never
// re-derives, re-checks, or second-guesses anything ExternalDeploymentService already computed — see
// StudioDeploymentService's own doc comment for why that matters.
export function toStudioDeploymentRunView(result: ExternalDeploymentResult, targetId: string, publish: boolean): StudioDeploymentRunView {
    return {
        targetId,
        publish,
        stages: computeDeploymentStages(result, publish),
        descriptorIssues: result.descriptorIssues,
        compatibilityIssues: result.compatibilityIssues,
        projectionIssues: result.projectionIssues,
        generation:
            result.generation === undefined
                ? undefined
                : {
                    issues: result.generation.issues,
                    artifacts: result.generation.artifacts.map((artifact) => ({
                        relativePath: artifact.relativePath,
                        content: typeof artifact.content === "string" ? artifact.content : artifact.content.toString("utf8"),
                    })),
                },
        artifactIssues: result.artifactIssues,
        diagnostic: result.diagnostic,
        delivery: result.delivery,
    };
}
