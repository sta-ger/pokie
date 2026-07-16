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
