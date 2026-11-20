import type {ValidationIssue} from "../validation/ValidationIssue.js";
import type {ExternalGeneratedFile} from "./ExternalGeneratedFile.js";

// What one ExternalFileGenerator.generate() call returns. Mirrors StakeEngineExportResult's own
// "issues alongside output, never a thrown exception for a reportable problem" shape: a generator that hits a
// per-outcome problem (a projector throwing, output that isn't JSON-safe, ...) reports it as an error-severity
// ValidationIssue and returns "files: []" — never a partial file set — so a caller can tell "nothing was
// generated, here's why" apart from "here's the complete, generation output" by checking whether any issue has
// severity "error", never by checking whether "files" happens to be empty.
export type ExternalFileGenerationResult = {
    readonly files: readonly ExternalGeneratedFile[];
    readonly issues: readonly ValidationIssue[];
};
