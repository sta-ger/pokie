import type {BuildDestinationPreview, GameBuildInfo, PokieGameManifest, StudioBuildPreviewView, StudioBuildResult, ValidationIssue} from "../../api/types";

// Pure view-model transforms for the Home nav — same role as interpretProjectDashboard.ts/
// interpretReplay.ts: main.ts/dom.ts consume these instead of branching on the raw API DTOs
// themselves, and (being pure) these are unit-testable without a real DOM/jsdom.

// POST /api/home/blueprints/build-preview's view — never the result of anything being written to disk.
export type BuildPreviewView =
    | {status: "idle"}
    | {status: "loading"}
    | {status: "error"; message: string}
    | {status: "load-error"; message: string}
    | {status: "invalid"; errors: ValidationIssue[]; warnings: ValidationIssue[]}
    | ({
          status: "ok";
          warnings: ValidationIssue[];
          manifest: PokieGameManifest;
          reels: number;
          rows: number;
          symbolsCount: number;
          blueprintHash: string;
          expectedFiles: string[];
      } & BuildDestinationPreview);

export function describeBuildPreview(preview: StudioBuildPreviewView): BuildPreviewView {
    if (preview.status === "load-error") {
        return {status: "load-error", message: preview.error};
    }
    return preview;
}

// POST /api/home/blueprints/build's view — same "load-error"/"invalid" cases as the preview, plus
// "failed" for StudioBuildResult's own "error" status (most notably GamePackageGenerator's
// safe-rebuild/conflict check refusing to overwrite files it didn't generate) — kept distinct from the
// apiClient-call-level "error" status so the two can never be confused when rendering.
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

// The Blueprint Editor's own Build panel's persistent "last successful build" record -- everything a
// BuildProjectView "ok" carries, plus the exact blueprint that produced it (so a later edit can be
// compared against what was actually built, see hasBlueprintChanged/diffBlueprintTopLevelFields in
// interpretBlueprintEditor.ts). Owned by BlueprintEditorPage, not BlueprintBuildPanel's own local state,
// specifically so it survives that panel's own key={`build-${formGeneration}`} remount (a "Restore built
// blueprint" is itself a wholesale replace) and a later failed rebuild attempt -- neither can make a real
// prior success vanish.
export type BuiltBlueprintSnapshot = {
    blueprint: unknown;
    manifest: PokieGameManifest;
    projectRoot: string;
    buildInfo: GameBuildInfo;
    warnings: ValidationIssue[];
    createdFiles: string[];
};
