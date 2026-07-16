import path from "path";
import type {ValidationIssue} from "../validation/ValidationIssue.js";
import type {ExternalArtifactGenerationResult} from "./ExternalArtifactGenerationResult.js";
import type {ExternalArtifactValidator} from "./ExternalArtifactValidator.js";
import type {ExternalGeneratedArtifact} from "./ExternalGeneratedArtifact.js";

// An ExternalArtifactGenerationResult's own static type guarantees nothing about a value that actually arrives
// at runtime — e.g. a hand-crafted or malformed result from a badly-written custom ExternalArtifactGenerator.
// Every field is read through this loosened view so the checks below are real runtime guards, the same idiom
// RoundArtifactValidator/WeightedOutcomeLibraryValidator/ExternalDeploymentTargetDescriptorValidator use for
// the same reason.
type Loose<X> = {[K in keyof X]?: unknown};

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnsafeRelativePath(relativePath: string): boolean {
    if (relativePath.trim().length === 0) {
        return true;
    }
    if (path.isAbsolute(relativePath) || relativePath.startsWith("/") || relativePath.startsWith("\\")) {
        return true;
    }
    const normalized = path.normalize(relativePath).replace(/\\/g, "/");
    return normalized === ".." || normalized.startsWith("../");
}

// The SDK's own generic, format-agnostic ExternalArtifactValidator — every ExternalDeploymentTarget gets this
// for free unless it supplies its own, and ExternalDeploymentService always runs it regardless (see that
// class's own doc comment). Checks two things, in order:
//
//   1. That "result" itself is even shaped like an ExternalArtifactGenerationResult at all — "artifacts" and
//      "issues" must both be arrays, since a badly-written custom ExternalArtifactGenerator's return value is
//      only ever *documented* to have this shape, never structurally guaranteed once it's already reached this
//      validator as an arbitrary runtime value. A result that fails this check is reported as a single
//      structural issue and nothing further is checked (there's no array to iterate).
//   2. For every artifact that does exist: that "relativePath" is a string and "content" is a string or Buffer
//      (again, checked before anything else touches them — reading `.length` off a non-string/non-Buffer
//      "content", or passing a non-string "relativePath" to a `path.*` function, would otherwise throw), and
//      only once both hold: that "relativePath" is a safe relative path (no absolute path, no ".."-escape — see
//      writeExternalDeploymentArtifactsToDirectory, which enforces the same rule at write time), that no two
//      artifacts share a "relativePath" (exactly or only differing by case — the same duplicate/case-collision
//      concern ExternalDeploymentTargetRegistry applies to target ids and StakeEngineExportValidator applies to
//      mode names), that "content" is non-empty, and that a ".json"-named artifact's content actually parses.
//
// Never throws: validate() wraps everything in a catch-all, so a result so malformed it defeats even the shape
// checks above still comes back as a single error-severity ValidationIssue, not an exception. A target with
// format-specific invariants beyond these (e.g. "every path listed in the index file must exist in the artifact
// set") should implement its own ExternalArtifactValidator for those — additively, alongside this one, never
// instead of it.
export class StandardExternalArtifactValidator implements ExternalArtifactValidator {
    public validate(result: ExternalArtifactGenerationResult): ValidationIssue[] {
        try {
            return this.validateInternal(result as Loose<ExternalArtifactGenerationResult>);
        } catch (error) {
            return [
                {
                    code: "external-artifact-generation-result-malformed",
                    severity: "error",
                    message: `ExternalArtifactGenerationResult could not be validated: ${error instanceof Error ? error.message : String(error)}`,
                },
            ];
        }
    }

    private validateInternal(result: Loose<ExternalArtifactGenerationResult>): ValidationIssue[] {
        const issues: ValidationIssue[] = [];

        if (!isPlainObject(result)) {
            return [
                {
                    code: "external-artifact-generation-result-invalid",
                    severity: "error",
                    message: `ExternalArtifactGenerationResult must be an object, got ${JSON.stringify(result) ?? String(result)}.`,
                },
            ];
        }

        if (!Array.isArray(result.artifacts)) {
            issues.push({
                code: "external-artifact-generation-result-invalid",
                severity: "error",
                message: `ExternalArtifactGenerationResult.artifacts must be an array, got ${typeof result.artifacts}.`,
            });
        }
        if (!Array.isArray(result.issues)) {
            issues.push({
                code: "external-artifact-generation-result-invalid",
                severity: "error",
                message: `ExternalArtifactGenerationResult.issues must be an array, got ${typeof result.issues}.`,
            });
        }
        if (!Array.isArray(result.artifacts)) {
            return issues;
        }

        const seenPaths = new Map<string, string>(); // lowercase relativePath -> original relativePath
        (result.artifacts as readonly unknown[]).forEach((rawArtifact: unknown, index: number) => {
            this.validateArtifact(rawArtifact, index, seenPaths, issues);
        });

        return issues;
    }

    private validateArtifact(rawArtifact: unknown, index: number, seenPaths: Map<string, string>, issues: ValidationIssue[]): void {
        if (!isPlainObject(rawArtifact)) {
            issues.push({
                code: "external-artifact-shape-invalid",
                severity: "error",
                message: `artifact at position ${index} must be an object, got ${JSON.stringify(rawArtifact) ?? String(rawArtifact)}.`,
                details: {index},
            });
            return;
        }

        const artifact = rawArtifact as Loose<ExternalGeneratedArtifact>;
        const hasSafePath = this.validateRelativePath(artifact.relativePath, index, seenPaths, issues);
        const hasValidContent = this.validateContentType(artifact.content, artifact.relativePath, index, issues);

        if (!hasValidContent) {
            return;
        }
        const content = artifact.content as string | Buffer;

        if (content.length === 0) {
            issues.push({
                code: "external-artifact-content-empty",
                severity: "error",
                message: `artifact at position ${index}${hasSafePath ? ` ("${String(artifact.relativePath)}")` : ""} has empty content.`,
                details: {index, relativePath: artifact.relativePath},
            });
        }

        if (hasSafePath && (artifact.relativePath as string).toLowerCase().endsWith(".json")) {
            const text = typeof content === "string" ? content : content.toString("utf8");
            try {
                JSON.parse(text);
            } catch (error) {
                issues.push({
                    code: "external-artifact-json-invalid",
                    severity: "error",
                    message: `artifact "${String(artifact.relativePath)}" is named as JSON but does not parse: ${error instanceof Error ? error.message : String(error)}`,
                    details: {relativePath: artifact.relativePath},
                });
            }
        }
    }

    // Returns whether "relativePath" is a string that turned out to be a safe, non-colliding path (i.e. whether
    // path/content checks further down may treat it as a real path) — false for anything reported here, whether
    // that's "not even a string" or "a string, but unsafe/duplicate/case-colliding".
    private validateRelativePath(relativePath: unknown, index: number, seenPaths: Map<string, string>, issues: ValidationIssue[]): boolean {
        if (typeof relativePath !== "string") {
            issues.push({
                code: "external-artifact-relative-path-invalid",
                severity: "error",
                message: `artifact at position ${index} has a non-string relativePath (${JSON.stringify(relativePath) ?? String(relativePath)}).`,
                details: {index},
            });
            return false;
        }

        if (isUnsafeRelativePath(relativePath)) {
            issues.push({
                code: "external-artifact-path-unsafe",
                severity: "error",
                message: `artifact at position ${index} has an unsafe relativePath (${JSON.stringify(relativePath)}); it must be a non-empty relative path that never escapes its own root via "..".`,
                details: {index, relativePath},
            });
            return false;
        }

        const lowerPath = relativePath.toLowerCase();
        const existing = seenPaths.get(lowerPath);
        if (existing === undefined) {
            seenPaths.set(lowerPath, relativePath);
            return true;
        }
        if (existing === relativePath) {
            issues.push({
                code: "external-artifact-duplicate-path",
                severity: "error",
                message: `relativePath "${relativePath}" is produced by more than one artifact.`,
                details: {relativePath},
            });
        } else {
            issues.push({
                code: "external-artifact-path-case-collision",
                severity: "error",
                message: `relativePath "${relativePath}" differs only in case from relativePath "${existing}"; these would write the same file on a case-insensitive filesystem.`,
                details: {relativePath, collidesWith: existing},
            });
        }
        return false;
    }

    private validateContentType(content: unknown, relativePath: unknown, index: number, issues: ValidationIssue[]): boolean {
        if (typeof content === "string" || Buffer.isBuffer(content)) {
            return true;
        }
        issues.push({
            code: "external-artifact-content-type-invalid",
            severity: "error",
            message: `artifact at position ${index}${typeof relativePath === "string" ? ` ("${relativePath}")` : ""} has invalid content (must be a string or Buffer, got ${typeof content}).`,
            details: {index, relativePath},
        });
        return false;
    }
}
