import type {
    OutcomeSourceProjectReportView,
    PokieGamePackageValidationReport,
    ProjectDashboardContext,
    StudioProjectCapability,
    StudioProjectOrigin,
    StudioProjectType,
    StudioWasmPresentation,
} from "../../api/types";

// Pure view-model transforms for the Project Dashboard — mirrors cli/client/interpretResponse.ts's
// role: main.ts/dom.ts consume these instead of branching on the raw discriminated-union DTOs
// themselves, and (being pure) these are unit-testable without a real DOM/jsdom, same as
// interpretResponse.ts's own tests.

export type ProjectHeaderView =
    | {status: "empty"}
    | {status: "loading"; projectRoot: string}
    | {status: "error"; projectRoot: string; message: string; errorDetail?: string}
    | {
          status: "loaded";
          projectRoot: string;
          id: string;
          name: string;
          version: string;
          description?: string;
          // Best-effort identity of the *original* project `projectRoot` resolved from -- undefined
          // when Studio couldn't independently identify it (see ProjectDashboardContext's own doc
          // comment), never an error on its own.
          type?: StudioProjectType;
          capabilities: StudioProjectCapability[];
          origin?: StudioProjectOrigin;
      }
    | {
          status: "outcome-source";
          projectRoot: string;
          type: StudioProjectType;
          capabilities: StudioProjectCapability[];
          origin?: StudioProjectOrigin;
          report: OutcomeSourceProjectReportView;
      }
    | {
          status: "artifact";
          projectRoot: string;
          type: Exclude<StudioProjectType, "wasm">;
          capabilities: StudioProjectCapability[];
          origin?: StudioProjectOrigin;
      }
    | {
          status: "artifact";
          projectRoot: string;
          type: "wasm";
          capabilities: StudioProjectCapability[];
          origin?: StudioProjectOrigin;
          wasmPresentation: StudioWasmPresentation;
      };

type WasmArtifactContext = Extract<ProjectDashboardContext, {status: "artifact"}> & {
    project: {type: "wasm"; rootPath: string; capabilities: StudioProjectCapability[]; provenance: string};
    wasmPresentation: StudioWasmPresentation;
};

function isWasmArtifactContext(context: Extract<ProjectDashboardContext, {status: "artifact"}>): context is WasmArtifactContext {
    return context.project.type === "wasm";
}

const PROJECT_OPEN_FAILURE_MESSAGE =
    "We couldn't open this game. Return to your games and try opening it again. If it continues, check the game's location and reopen Studio.";

// Resolver diagnostics for a component's missing, malformed, or incompatible
// sidecar are already the product contract's safe recovery guidance. They can
// arrive during direct launch or history restore before a project type exists,
// so identify the contract wording rather than relying on a typed dashboard.
const WASM_CONTRACT_FAILURE = /(?:WASM target|WASM component|PokieWasmComponentManifest)/i;

// Project-context failures can originate while Studio starts directly in a workspace, restores a
// project-scoped browser-history entry, or reloads the active project. Those are all the same
// designer-facing recovery moment. Keep the server's response available for support, but never let
// its implementation-specific wording become the alert a designer sees first.
export function describeProjectContextFailure(projectRoot: string, detail?: string): ProjectHeaderView {
    // Planner diagnostics are already safe, actionable user-facing text.  In particular they carry
    // the attempted path, exact conversion edge, and recovery; replacing them with opening copy loses
    // the only information a designer can use to repair a non-runnable source.
    if (detail !== undefined && (detail.startsWith("Cannot prepare a runnable runtime") || WASM_CONTRACT_FAILURE.test(detail))) {
        return {status: "error", projectRoot, message: detail};
    }
    return {status: "error", projectRoot, message: PROJECT_OPEN_FAILURE_MESSAGE, errorDetail: detail};
}

export function describeProjectHeader(context: ProjectDashboardContext): ProjectHeaderView {
    if (context.status === "empty") {
        return {status: "empty"};
    }
    if (context.status === "loading") {
        return {status: "loading", projectRoot: context.projectRoot};
    }
    if (context.status === "error") {
        const detail = [context.error, context.errorDetail].filter((value, index, details) => value !== undefined && details.indexOf(value) === index).join("\n\n");
        return describeProjectContextFailure(context.projectRoot, detail || undefined);
    }
    if (context.status === "outcome-source") {
        return {
            status: "outcome-source",
            projectRoot: context.projectRoot,
            type: context.project.type,
            capabilities: context.project.capabilities,
            origin: context.origin,
            report: context.report,
        };
    }
    if (context.status === "artifact") {
        if (isWasmArtifactContext(context)) {
            return {
                status: "artifact",
                projectRoot: context.projectRoot,
                type: "wasm",
                capabilities: context.project.capabilities,
                origin: context.origin,
                wasmPresentation: context.wasmPresentation,
            };
        }
        return {
            status: "artifact",
            projectRoot: context.projectRoot,
            type: context.project.type,
            capabilities: context.project.capabilities,
            origin: context.origin,
        };
    }
    return {
        status: "loaded",
        projectRoot: context.projectRoot,
        id: context.game.id,
        name: context.game.name,
        version: context.game.version,
        description: context.game.description,
        type: context.type,
        capabilities: context.capabilities ?? [],
        origin: context.origin,
    };
}

// The capability id "Game Model" (Studio's editor for a project's own Blueprint source) requires --
// only a project resolved as "blueprint" grants it (see src/project/ProjectCapabilities.ts's own
// PROJECT_TYPE_CAPABILITIES). Duplicated here as a literal (rather than imported from the "pokie"
// package) since studio-client is a standalone TS project with no dependency on it -- same convention
// as StudioProjectCapability's own doc comment in api/types.ts.
export const BLUEPRINT_BUILD_CAPABILITY: StudioProjectCapability = "blueprint.build";

// The capability every in-process runtime operation (Simulation, Replay, Runtime, Certification,
// Fairness, Build/Export, Analysis) requires -- only a project resolved as "tsPackage" grants it on its
// own (see PROJECT_TYPE_CAPABILITIES). A "blueprint" project never carries this id itself, even though
// Studio always materializes it into a runnable tsPackage before ever loading it (see
// loadProjectDashboardContext.ts's own doc comment) -- ProjectDashboardPage therefore treats either this
// or BLUEPRINT_BUILD_CAPABILITY as sufficient for those tabs, rather than requiring this one specifically.
export const RUNTIME_EXECUTE_CAPABILITY: StudioProjectCapability = "runtime.execute";

// The capability a project that already holds a readable, pre-generated outcome-library bundle carries --
// only a project resolved as "outcomeLibrary" grants it (see PROJECT_TYPE_CAPABILITIES). Unlike
// BLUEPRINT_BUILD_CAPABILITY/RUNTIME_EXECUTE_CAPABILITY, this alone is never enough to reach the whole
// Build/Export tab (see RUNTIME_CAPABLE_CAPABILITIES in ProjectDashboardPage.tsx -- there is no in-process
// build/run to gate the tab's own generic "current project" framing on) -- but ExportDeployTargets.ts still
// reads it to decide whether a *specific* card that only needs an already-existing canonical outcome
// library (never one it has to generate itself) applies.
export const OUTCOME_LIBRARY_READ_CAPABILITY: StudioProjectCapability = "outcomeLibrary.read";

// Granted to both "outcomeLibrary" and "stakeAdapter" projects (see PROJECT_TYPE_CAPABILITIES) -- what
// Overview's own Exact Analysis section (OutcomeSourceOverview) requires to be reachable at all: both
// types already have their own canonical outcome-source reader, even though only "outcomeLibrary" can
// also be drawn from (see OUTCOME_SOURCE_SAMPLE_CAPABILITY below).
export const OUTCOME_SOURCE_READ_CAPABILITY: StudioProjectCapability = "outcomeSource.read";

// Granted only to "outcomeLibrary" (see PROJECT_TYPE_CAPABILITIES) -- what Play/Simulation/Replay each
// require in addition to (never instead of) RUNTIME_CAPABLE_CAPABILITIES, since a resolved
// "outcomeLibrary" project reaches each of those sections through its own real OutcomeSource adapters
// (StudioPlayService/StudioSimulationService/StudioReplayExecutionService), never loadPokieGame. A
// "stakeAdapter" export has no draw contract of its own and never grants this.
export const OUTCOME_SOURCE_SAMPLE_CAPABILITY: StudioProjectCapability = "outcomeSource.sample";

// Granted only to "stakeAdapter" (see PROJECT_TYPE_CAPABILITIES) -- alongside OUTCOME_LIBRARY_READ_CAPABILITY,
// what ExportDeployTab's own capability-driven cards read to decide whether a Stake Engine export project can
// still reach the Build/Export section (to republish itself), even though it can never generate a fresh
// outcome library or be drawn from.
export const STAKE_ADAPTER_EXCHANGE_CAPABILITY: StudioProjectCapability = "stakeAdapter.exchange";

// Granted only to "parWorkbook" (see PROJECT_TYPE_CAPABILITIES) -- lets Studio's Build/Export tab
// republish an already-loaded PAR workbook through the ArtifactBuilderRegistry.  This is deliberately
// distinct from the runtime and outcome-source capabilities: a workbook can be copied to a new .xlsx
// destination, but it cannot be loaded as a game or treated as a canonical outcome source.
export const PAR_WORKBOOK_EXCHANGE_CAPABILITY: StudioProjectCapability = "parWorkbook.exchange";

export const PROJECT_TYPE_LABEL: Record<Exclude<StudioProjectType, "wasm">, string> = {
    blueprint: "Game design",
    tsPackage: "Playable game",
    outcomeLibrary: "Game data library",
    stakeAdapter: "Game export",
    parWorkbook: "PAR spreadsheet",
};

export function describeProjectType(type: Exclude<StudioProjectType, "wasm">): string;
export function describeProjectType(type: "wasm", wasmPresentation: StudioWasmPresentation): string;
export function describeProjectType(type: StudioProjectType, wasmPresentation?: StudioWasmPresentation): string {
    return type === "wasm" ? wasmPresentation!.label : PROJECT_TYPE_LABEL[type];
}

const CAPABILITY_LABEL: Record<string, string> = {
    "blueprint.build": "Edit and build this game",
    "runtime.execute": "Play, test, and export this game",
    "outcomeLibrary.read": "Use saved game outcomes",
    "stakeAdapter.exchange": "Share this game export",
    "parWorkbook.exchange": "Share this PAR spreadsheet",
    "outcomeSource.read": "Review game outcome data",
    "outcomeSource.sample": "Play and replay saved outcomes",
};

// Capability ids are an open, plain-string vocabulary (see StudioProjectCapability's own doc comment)
// -- an id this dictionary doesn't recognize yet is shown as-is rather than hidden, so Overview never
// silently under-reports what a project can do just because a label hasn't been added here.
export function describeCapability(capability: StudioProjectCapability): string {
    return CAPABILITY_LABEL[capability] ?? capability;
}

export type ValidationIssueView = {code: string; message: string};

export type ValidationSummaryView = {
    valid: boolean;
    errors: ValidationIssueView[];
    warnings: ValidationIssueView[];
    suggestions: string[];
    // "Are there any issues to *show*" -- warnings still render in Overview's own validation
    // diagnostics even though they don't block anything (see `blocking` below).
    hasIssues: boolean;
    // True only when there are errors or the report itself reports invalid -- warnings alone must never
    // block the happy path (Simulate/Build stay reachable with warnings-only). Kept distinct from
    // `hasIssues` specifically so callers can't accidentally conflate "has something to show" with
    // "should stop the user from proceeding".
    blocking: boolean;
};

export function describeValidationSummary(report: PokieGamePackageValidationReport): ValidationSummaryView {
    return {
        valid: report.valid,
        errors: report.errors.map((issue) => ({code: issue.code, message: issue.message})),
        warnings: report.warnings.map((issue) => ({code: issue.code, message: issue.message})),
        suggestions: report.suggestions,
        hasIssues: report.errors.length > 0 || report.warnings.length > 0,
        blocking: !report.valid || report.errors.length > 0,
    };
}

// Explicit idle/loading/error/success state for the Project Dashboard's own "Validate" action (POST
// /api/project/validate) -- replaces a bare `ValidationSummaryView | undefined` + a separate loading
// boolean, whose combination made a failed re-validation silently leave a stale successful summary
// displayed with no error shown anywhere (see ProjectDashboardPage's runValidate). Replacing the whole
// state on every attempt (loading -> error, or loading -> success) is what makes a new error naturally
// clear a stale success, and vice versa.
export type ProjectValidationView =
    | {status: "idle"}
    | {status: "loading"}
    | {status: "error"; message: string}
    | {status: "success"; summary: ValidationSummaryView};
