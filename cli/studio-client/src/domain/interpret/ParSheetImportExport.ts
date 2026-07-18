import type {ParSheetProvenance, StudioParSheetExportView, StudioParSheetImportView, ValidationIssue} from "../../api/types";

// Pure view-model transforms for the PAR Sheet Import/Export panel — same role as interpretBlueprintEditor.ts's
// own describe*/isStale* functions (main.ts/dom.ts-equivalent React components consume these instead of
// branching on the raw Studio DTOs themselves). "Import" and "Export" are kept as clearly separate
// concerns throughout, matching how little they actually share: an import result doesn't depend on the
// editor's current blueprint/revision at all (it describes a freshly read file), while an export result
// is entirely *about* the current blueprint and must be invalidated when that blueprint changes elsewhere
// mid-flight -- see isStaleParSheetExportRequest.

export type ParSheetImportView = {status: "idle"} | {status: "loading"} | {status: "error"; message: string} | StudioParSheetImportView;

export function describeParSheetImportResult(result: StudioParSheetImportView): ParSheetImportView {
    return result;
}

// "failed" is StudioParSheetExportView's own "error" status, renamed -- same reason
// describeSaveResult() renames StudioBlueprintSaveView's "error" to "failed": the local, network-level
// failure case right below it also needs the tag "error" (matching every other apiClient-facing view
// type in this app), and a domain-level export failure is a distinct thing from a request never even
// reaching the server, so the two must never collide under one shared "error" status.
export type ParSheetExportView =
    | {status: "idle"}
    | {status: "loading"}
    | {status: "error"; message: string}
    | {status: "ok"; path: string; warnings: ValidationIssue[]}
    | {status: "conflict"; path: string; error: string}
    | {status: "invalid"; errors: ValidationIssue[]; warnings: ValidationIssue[]}
    | {status: "failed"; message: string};

export function describeParSheetExportResult(result: StudioParSheetExportView): ParSheetExportView {
    if (result.status === "error") {
        return {status: "failed", message: result.error};
    }
    return result;
}

// An Export request captures the Blueprint Editor's own BlueprintEditorState.revision right before it's
// sent; by the time its response arrives, the blueprint may have changed (another edit, New/Load, a
// successful JSON apply) -- comparing that captured revision against the editor's *current* revision is
// how the panel decides whether to apply the response or silently drop it as stale, exactly like
// isStaleReelStripGenerationRequest already does for the Reel Strip Modeler's own "Resolve reels". Safe
// against a reset-to-a-reused-number because `revision` itself is strictly monotonic and never resets
// (see blueprintEditorState.ts's own doc comment) -- any mismatch, in either direction, means the
// blueprint moved on since the export was requested.
export function isStaleParSheetExportRequest(requestedRevision: number, currentRevision: number): boolean {
    return requestedRevision !== currentRevision;
}

// Every outcome the Import step's own Diagnose & map / Preview canonical model steps can end up in, in
// the language a non-technical user would recognize -- never re-validating anything, only reading
// whether the import's own errors/warnings (already computed server-side by ParSheetImporting, merged
// from both PAR-specific mapping diagnostics and the assembled blueprint's own GameBlueprintValidator
// issues) are non-empty. "partial" is this classification's own name for "readable, and usable, but with
// warnings worth reviewing before Apply" -- never a blocker.
export type ParSheetImportOutcome = "success" | "partial" | "invalid";

export function describeParSheetImportOutcome(view: {errors: readonly ValidationIssue[]; warnings: readonly ValidationIssue[]}): ParSheetImportOutcome {
    if (view.errors.length > 0) {
        return "invalid";
    }
    if (view.warnings.length > 0) {
        return "partial";
    }
    return "success";
}

// The two ParSheetExporter-reported error codes that specifically mean "this blueprint's own reel source
// isn't something a PAR sheet can represent at all" (reelStripGeneration/symbolWeights, or no literal
// reelStrips) -- see ParSheetExporting.exportToFile()'s own doc comment. Distinguished from any other
// validation failure purely for friendlier wording ("this data isn't supported by PAR export" vs. a
// generic "this blueprint is invalid") -- never a re-derivation of what makes the export fail, only a
// recognized-code lookup over issues the server already computed.
const UNSUPPORTED_EXPORT_ISSUE_CODES = new Set(["parsheet-unsupported-reel-source", "parsheet-missing-reel-strips"]);

export function isUnsupportedParSheetExport(errors: readonly ValidationIssue[]): boolean {
    return errors.some((issue) => UNSUPPORTED_EXPORT_ISSUE_CODES.has(issue.code));
}

// Every outcome the Export step's own result banner can end up in for a "conflict"/"error"-free response
// -- "conflict" and "error" are shown as their own dedicated states (see StudioParSheetExportView's own
// doc comment) rather than folded in here, since they need a different action (Overwrite / just an error
// message) than any of these four do.
export type ParSheetExportOutcome = "success" | "partial" | "unsupported" | "invalid";

export function describeParSheetExportOutcome(view: StudioParSheetExportView): ParSheetExportOutcome | undefined {
    if (view.status === "invalid") {
        return isUnsupportedParSheetExport(view.errors) ? "unsupported" : "invalid";
    }
    if (view.status === "ok") {
        return view.warnings.length > 0 ? "partial" : "success";
    }
    return undefined;
}

// A one-line, plain-language summary of a PAR sheet's own recorded provenance (its "Meta" sheet, see
// ParSheetProvenance) for the Import flow's own provenance/source-metadata display -- never a substitute
// for the actual schema-version/hash verification ParSheetImporter already performs (see
// "parsheet-provenance-*" issue codes, surfaced separately via describeParSheetImportOutcome's own
// errors/warnings), purely a human-readable restatement of whatever fields are actually present.
export function describeParSheetProvenanceSummary(provenance: ParSheetProvenance | undefined): string {
    if (provenance === undefined) {
        return 'This file has no recorded origin (no "Meta" sheet).';
    }
    const parts: string[] = [];
    if (provenance.pokieVersion) {
        parts.push(`pokie v${provenance.pokieVersion}`);
    }
    if (provenance.exportedAt) {
        parts.push(`on ${provenance.exportedAt}`);
    }
    if (provenance.source) {
        parts.push(`from "${provenance.source}"`);
    }
    if (parts.length === 0) {
        return 'This file has a "Meta" sheet, but it records no usable origin details.';
    }
    return `Exported by ${parts.join(" ")}.`;
}
