import type {
    StudioBlueprintLoadView,
    StudioBlueprintSaveView,
    StudioBlueprintValidationView,
    StudioReelStripGenerationView,
    ValidationIssue,
} from "../../api/types";

// Pure view-model transforms for the Blueprint Editor tab — same role as interpretHome.ts's own
// describe* functions (main.ts/dom.ts consume these instead of branching on the raw API DTOs
// themselves, and being pure, these are unit-testable without a real DOM/jsdom). The Build
// Preview/Build panels reuse interpretHome.ts's existing describeBuildPreview/describeBuildResult
// as-is — StudioBlueprintService.previewBuild()/build() return the exact same DTO shapes.

export type BlueprintValidationView =
    | {status: "idle"}
    | {status: "loading"}
    | {status: "error"; message: string}
    | {status: "ok"; warnings: ValidationIssue[]}
    | {status: "invalid"; errors: ValidationIssue[]; warnings: ValidationIssue[]};

export function describeValidation(result: StudioBlueprintValidationView): BlueprintValidationView {
    return result;
}

export type ReelStripGenerationPreviewView =
    | {status: "idle"}
    | {status: "loading"}
    | {status: "error"; message: string}
    | StudioReelStripGenerationView;

export function describeReelStripGenerationPreview(result: StudioReelStripGenerationView): ReelStripGenerationPreviewView {
    return result;
}

// A "Resolve reels" request captures BlueprintEditorState.revision right before it's sent; by the time
// its response arrives, the blueprint may have changed (another edit, a New/Load) -- comparing that
// captured revision against the editor's *current* revision is how main.ts decides whether to apply
// the response or silently drop it as stale, so an in-flight preview can never clobber a newer edit's
// (already-cleared) result with a stale one after the fact. Safe against a reset-to-a-reused-number
// because `revision` itself is strictly monotonic and never resets (see BlueprintEditorState's own doc
// comment) -- any mismatch, in either direction, means the blueprint moved on.
export function isStaleReelStripGenerationRequest(requestedRevision: number, currentRevision: number): boolean {
    return requestedRevision !== currentRevision;
}

// Recursively sorts every object's own keys (arrays keep their order -- position is meaningful there,
// e.g. a literal strip or a constraints list) so two structurally-identical entries compare equal by
// JSON.stringify regardless of the order their own fields happen to have been assembled in by whichever
// mutator produced each one.
function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(canonicalize);
    }
    if (typeof value === "object" && value !== null) {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, entryValue]) => [key, canonicalize(entryValue)]),
        );
    }
    return value;
}

// The Reel Strip Modeler's own "does this reel have unapplied changes" check -- a reel's local, not-yet-
// committed draft entry against the entry actually applied in the blueprint right now. Structural, not
// reference equality (a freshly cloned draft is never `===` its source even when nothing was edited),
// and canonicalized first so an edit-and-revert (e.g. toggling a source mode back and forth) doesn't
// falsely read as dirty purely because of field insertion order.
export function hasReelStripGenerationDraftChanged(draft: Record<string, unknown>, applied: Record<string, unknown>): boolean {
    return JSON.stringify(canonicalize(draft)) !== JSON.stringify(canonicalize(applied));
}

// The Preview-stop-windows step's own visualization: the `rows` consecutive symbols a reel would show if
// it stopped at position `stop`, wrapping around to the strip's own start once it runs past the end --
// exactly what a real spin's screen window would look like for a reel that stopped there, for a strip
// already resolved by the exact same generation/analysis pipeline "pokie build" itself uses. This is
// purely a what-if slice over an already-resolved strip; it never selects a stop itself and is never a
// substitute for the real RNG-driven stop selection a spin performs (see
// ReelsSymbolsSequencesGenerator) -- there is no generation/validation logic here to duplicate, only
// array indexing. Defensive against an out-of-range or negative `stop` (wraps via modulo) and against an
// empty strip or non-positive `rows` (both simply produce no rows).
// A one-line, plain-language summary of a reel's own current configuration for the Select-reel step --
// enough to tell reels apart at a glance without opening each one. Never a substitute for actually
// opening a reel to see (or edit) its full configuration.
export function describeReelStripGenerationEntrySummary(entry: Record<string, unknown>): string {
    if (entry.type === "generated") {
        const length = typeof entry.length === "number" ? entry.length : "?";
        const seed = typeof entry.seed === "number" ? entry.seed : "?";
        return `Generated — length ${length}, seed ${seed}`;
    }
    const strip = Array.isArray(entry.strip) ? entry.strip : [];
    return `Literal — ${strip.length} symbol(s)`;
}

export function computeReelStopWindow(strip: readonly string[], stop: number, rows: number): string[] {
    if (strip.length === 0 || rows <= 0) {
        return [];
    }
    const normalizedStop = ((stop % strip.length) + strip.length) % strip.length;
    return Array.from({length: rows}, (_, i) => strip[(normalizedStop + i) % strip.length]);
}

export type BlueprintLoadView =
    | {status: "idle"}
    | {status: "loading"}
    | {status: "error"; message: string}
    | {status: "load-error"; message: string}
    | {status: "ok"; path: string};

export function describeLoadResult(result: StudioBlueprintLoadView): BlueprintLoadView {
    if (result.status === "load-error") {
        return {status: "load-error", message: result.error};
    }
    return {status: "ok", path: result.path};
}

// "conflict" is kept distinct from "failed" (StudioBlueprintSaveView's own "error" status) since the
// editor renders them very differently: a conflict shows a Confirm-overwrite control, a failure just
// shows the message.
export type BlueprintSaveView =
    | {status: "idle"}
    | {status: "loading"}
    | {status: "error"; message: string}
    | {status: "failed"; message: string}
    | {status: "conflict"; path: string; message: string}
    | {status: "ok"; path: string};

export function describeSaveResult(result: StudioBlueprintSaveView): BlueprintSaveView {
    if (result.status === "conflict") {
        return {status: "conflict", path: result.path, message: result.error};
    }
    if (result.status === "error") {
        return {status: "failed", message: result.error};
    }
    return {status: "ok", path: result.path};
}
