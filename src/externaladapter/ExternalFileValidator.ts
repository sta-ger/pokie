import type {ValidationIssue} from "../validation/ValidationIssue.js";
import type {ExternalFileGenerationResult} from "./ExternalFileGenerationResult.js";

// Validates an already-generated ExternalFileGenerationResult — structural checks on the *output* of
// ExternalFileGenerator.generate() (duplicate paths, unsafe paths, malformed content, ...), as opposed to
// ExternalExportCompatibilityValidator, which runs *before* generation against the input content and a
// target's own declared requirements/capabilities. Every ExternalExportTarget may supply its own
// implementation for format-specific checks (e.g. a target whose own index file must list every other file
// exactly once); StandardExternalFileValidator is the SDK's own generic, format-agnostic default. Never
// throws — a genuinely malformed result is reported as an error-severity ValidationIssue, same convention as
// every other *Validating.validate() in this package.
export interface ExternalFileValidator {
    validate(result: ExternalFileGenerationResult): ValidationIssue[];
}
