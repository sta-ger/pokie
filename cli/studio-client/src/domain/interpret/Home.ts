import type {
    GameBuildInfo,
    PokieGameManifest,
    StudioBuildPreviewView,
    StudioBuildResult,
    StudioHomeRecentProjectView,
    StudioScaffoldResultView,
    ValidationIssue,
} from "../../api/types";

// Pure view-model transforms for the Home nav — same role as interpretProjectDashboard.ts/
// interpretReplay.ts: main.ts/dom.ts consume these instead of branching on the raw API DTOs
// themselves, and (being pure) these are unit-testable without a real DOM/jsdom.

// Same role as interpretReports.ts's ReportListView: distinguishes "nothing recorded yet" from
// "here's the list". "loading"/an API-call-level error are constructed directly by main.ts around the
// fetch call itself, same convention as every other list in this app.
export type HomeRecentProjectsListView = {status: "empty"} | {status: "loaded"; entries: StudioHomeRecentProjectView[]};

export function describeRecentProjectsList(entries: StudioHomeRecentProjectView[]): HomeRecentProjectsListView {
    return entries.length === 0 ? {status: "empty"} : {status: "loaded", entries};
}

// Shared by Create Project and Initialize Project — GamePackageCreating's and GamePackageScaffolding's
// ScaffoldResult shapes are already identical (see StudioScaffoldResultView), so both flows render
// through this same view. "idle"/"loading"/"error" (an apiClient call itself failing — a malformed
// request, a network error) are constructed directly by main.ts; "failed" is the *domain*-level failure
// StudioScaffoldResultView's own "error" status carries (e.g. the destination already exists) —
// deliberately a distinct status from "error" so the two can never be confused when rendering.
export type ScaffoldActionView =
    | {status: "idle"}
    | {status: "loading"}
    | {status: "error"; message: string}
    | {status: "failed"; message: string}
    | {
          status: "ok";
          projectRoot: string;
          manifest: PokieGameManifest;
          createdFiles: string[];
          updatedFiles: string[];
          skippedFiles: string[];
      };

export function describeScaffoldResult(result: StudioScaffoldResultView): ScaffoldActionView {
    return result.status === "error" ? {status: "failed", message: result.error} : result;
}

// POST /api/home/projects/build/preview's view — never the result of anything being written to disk.
export type BuildPreviewView =
    | {status: "idle"}
    | {status: "loading"}
    | {status: "error"; message: string}
    | {status: "load-error"; message: string}
    | {status: "invalid"; errors: ValidationIssue[]; warnings: ValidationIssue[]}
    | {
          status: "ok";
          warnings: ValidationIssue[];
          manifest: PokieGameManifest;
          reels: number;
          rows: number;
          symbolsCount: number;
          blueprintHash: string;
          expectedFiles: string[];
      };

export function describeBuildPreview(preview: StudioBuildPreviewView): BuildPreviewView {
    if (preview.status === "load-error") {
        return {status: "load-error", message: preview.error};
    }
    return preview;
}

// POST /api/home/projects/build's view — same "load-error"/"invalid" cases as the preview, plus
// "failed" for StudioBuildResult's own "error" status (most notably GamePackageGenerator's
// safe-rebuild/conflict check refusing to overwrite files it didn't generate) — kept distinct from the
// apiClient-call-level "error" status for the same reason as ScaffoldActionView above.
export type BuildProjectView =
    | {status: "idle"}
    | {status: "loading"}
    | {status: "error"; message: string}
    | {status: "load-error"; message: string}
    | {status: "invalid"; errors: ValidationIssue[]; warnings: ValidationIssue[]}
    | {status: "failed"; message: string}
    | {
          status: "ok";
          projectRoot: string;
          manifest: PokieGameManifest;
          createdFiles: string[];
          buildInfo: GameBuildInfo;
          unchanged: boolean;
          warnings: ValidationIssue[];
      };

export function describeBuildResult(result: StudioBuildResult): BuildProjectView {
    if (result.status === "load-error") {
        return {status: "load-error", message: result.error};
    }
    if (result.status === "error") {
        return {status: "failed", message: result.error};
    }
    return result;
}
