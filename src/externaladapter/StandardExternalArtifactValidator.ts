import path from "path";
import type {ValidationIssue} from "../validation/ValidationIssue.js";
import type {ExternalArtifactGenerationResult} from "./ExternalArtifactGenerationResult.js";
import type {ExternalArtifactValidator} from "./ExternalArtifactValidator.js";
import type {ExternalGeneratedArtifact} from "./ExternalGeneratedArtifact.js";

function isUnsafeRelativePath(relativePath: string): boolean {
    if (typeof relativePath !== "string" || relativePath.trim().length === 0) {
        return true;
    }
    if (path.isAbsolute(relativePath) || relativePath.startsWith("/") || relativePath.startsWith("\\")) {
        return true;
    }
    const normalized = path.normalize(relativePath).replace(/\\/g, "/");
    return normalized === ".." || normalized.startsWith("../");
}

// The SDK's own generic, format-agnostic ExternalArtifactValidator — every ExternalDeploymentTarget gets this
// for free unless it supplies its own. Checks only what's true of *any* generated artifact set, regardless of
// which target produced it:
//   - every "relativePath" is a safe relative path (no absolute path, no ".."-escape — see
//     writeExternalDeploymentArtifactsToDirectory, which enforces the same rule at write time),
//   - no two artifacts share a "relativePath", exactly or only differing by case (the same
//     duplicate/case-collision concern ExternalDeploymentTargetRegistry applies to target ids and
//     StakeEngineExportValidator applies to mode names — two artifacts that only differ by case would silently
//     overwrite one another on a case-insensitive filesystem),
//   - every artifact's content is non-empty,
//   - a ".json"-named artifact's content actually parses as JSON.
// A target with format-specific invariants beyond these (e.g. "every path listed in the index file must exist
// in the artifact set") should implement its own ExternalArtifactValidator instead of relying on this one alone.
export class StandardExternalArtifactValidator implements ExternalArtifactValidator {
    public validate(result: ExternalArtifactGenerationResult): ValidationIssue[] {
        const issues: ValidationIssue[] = [];
        const seenPaths = new Map<string, string>(); // lowercase relativePath -> original relativePath

        result.artifacts.forEach((artifact: ExternalGeneratedArtifact, index: number) => {
            if (isUnsafeRelativePath(artifact.relativePath)) {
                issues.push({
                    code: "external-artifact-path-unsafe",
                    severity: "error",
                    message: `artifact at position ${index} has an unsafe relativePath (${JSON.stringify(artifact.relativePath)}); it must be a non-empty relative path that never escapes its own root via "..".`,
                    details: {index, relativePath: artifact.relativePath},
                });
                return;
            }

            const lowerPath = artifact.relativePath.toLowerCase();
            const existing = seenPaths.get(lowerPath);
            if (existing === undefined) {
                seenPaths.set(lowerPath, artifact.relativePath);
            } else if (existing === artifact.relativePath) {
                issues.push({
                    code: "external-artifact-duplicate-path",
                    severity: "error",
                    message: `relativePath "${artifact.relativePath}" is produced by more than one artifact.`,
                    details: {relativePath: artifact.relativePath},
                });
            } else {
                issues.push({
                    code: "external-artifact-path-case-collision",
                    severity: "error",
                    message: `relativePath "${artifact.relativePath}" differs only in case from relativePath "${existing}"; these would write the same file on a case-insensitive filesystem.`,
                    details: {relativePath: artifact.relativePath, collidesWith: existing},
                });
            }

            if (artifact.content.length === 0) {
                issues.push({
                    code: "external-artifact-content-empty",
                    severity: "error",
                    message: `artifact "${artifact.relativePath}" has empty content.`,
                    details: {relativePath: artifact.relativePath},
                });
            }

            if (artifact.relativePath.toLowerCase().endsWith(".json")) {
                const text = typeof artifact.content === "string" ? artifact.content : artifact.content.toString("utf8");
                try {
                    JSON.parse(text);
                } catch (error) {
                    issues.push({
                        code: "external-artifact-json-invalid",
                        severity: "error",
                        message: `artifact "${artifact.relativePath}" is named as JSON but does not parse: ${error instanceof Error ? error.message : String(error)}`,
                        details: {relativePath: artifact.relativePath},
                    });
                }
            }
        });

        return issues;
    }
}
