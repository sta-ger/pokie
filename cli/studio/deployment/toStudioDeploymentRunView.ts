import type {FormatConversionPlan, ExternalExportResult} from "@fromstan/pokie";
import {computeDeploymentStages} from "./computeDeploymentStages.js";
import type {StudioDeploymentRunView} from "./StudioDeploymentRunView.js";

// The one conversion point from ExternalExportService's own ExternalExportResult to the plain
// JSON DTO an API response actually sends. Every field here is copied straight from `result` — the
// only real transforms are content-decoding each generated file's own `content` (string | Buffer)
// into a plain string, and computing `stages` (see computeDeploymentStages). This function never
// re-derives, re-checks, or second-guesses anything ExternalExportService already computed — see
// StudioDeploymentService's own doc comment for why that matters.
export function toStudioDeploymentRunView(result: ExternalExportResult, targetId: string, publish: boolean, plan: FormatConversionPlan): StudioDeploymentRunView {
    return {
        plan,
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
                    files: result.generation.files.map((file) => ({
                        relativePath: file.relativePath,
                        content: typeof file.content === "string" ? file.content : file.content.toString("utf8"),
                    })),
                },
        fileIssues: result.fileIssues,
        diagnostic: result.diagnostic,
        delivery: result.delivery,
    };
}
