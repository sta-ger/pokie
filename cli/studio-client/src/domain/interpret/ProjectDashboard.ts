import type {
    GamePackageInspectionReport,
    OutcomeSourceProjectReportView,
    PokieGamePackageValidationReport,
    ProjectDashboardContext,
    StudioProjectCapability,
    StudioProjectOrigin,
    StudioProjectType,
    StudioSimulationJobView,
} from "../../api/types";
import {isSimulationActive} from "./Simulation";

// Pure view-model transforms for the Project Dashboard — mirrors cli/client/interpretResponse.ts's
// role: main.ts/dom.ts consume these instead of branching on the raw discriminated-union DTOs
// themselves, and (being pure) these are unit-testable without a real DOM/jsdom, same as
// interpretResponse.ts's own tests.

export type ProjectHeaderView =
    | {status: "empty"}
    | {status: "loading"; projectRoot: string}
    | {status: "error"; projectRoot: string; message: string}
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
      };

export function describeProjectHeader(context: ProjectDashboardContext): ProjectHeaderView {
    if (context.status === "empty") {
        return {status: "empty"};
    }
    if (context.status === "loading") {
        return {status: "loading", projectRoot: context.projectRoot};
    }
    if (context.status === "error") {
        return {status: "error", projectRoot: context.projectRoot, message: context.error};
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

export const PROJECT_TYPE_LABEL: Record<StudioProjectType, string> = {
    blueprint: "Blueprint",
    tsPackage: "Package",
    outcomeLibrary: "Outcome library",
    stakeAdapter: "Stake Engine export",
    wasm: "WASM",
    parWorkbook: "PAR sheet",
};

const CAPABILITY_LABEL: Record<string, string> = {
    "blueprint.build": "Build from Blueprint source",
    "runtime.execute": "Run in-process (simulate, replay, play)",
    "outcomeLibrary.read": "Read pre-generated outcomes",
    "stakeAdapter.exchange": "Exchange with Stake Engine",
    "parWorkbook.exchange": "Exchange as a PAR sheet",
    "wasm.export": "Export to WASM",
};

// Capability ids are an open, plain-string vocabulary (see StudioProjectCapability's own doc comment)
// -- an id this dictionary doesn't recognize yet is shown as-is rather than hidden, so Overview never
// silently under-reports what a project can do just because a label hasn't been added here.
export function describeCapability(capability: StudioProjectCapability): string {
    return CAPABILITY_LABEL[capability] ?? capability;
}

// The full Inspect result block: package name/version/root. "loading"/"error" are about the
// /api/project/inspect call itself (in flight, or failing outright, e.g. a network failure or a 409 when
// there's no active project) -- their message is a raw exception, run through describeProjectActionError
// like every other action failure. "invalid" is different: a *successful* call whose own report says the
// package itself couldn't be read (`report.valid === false`, e.g. a missing/corrupt package.json) --
// `message` there is the report's own safe, already-curated error text, shown verbatim rather than
// folded into generic remediation copy.
export type InspectionResultView =
    | {status: "loading"}
    | {status: "error"; message: string}
    | {status: "invalid"; message: string}
    | {status: "loaded"; packageRoot: string; packageName?: string; packageVersion?: string};

export function describeInspection(report: GamePackageInspectionReport): InspectionResultView {
    if (!report.valid) {
        return {status: "invalid", message: report.error ?? "Inspection failed."};
    }
    return {
        status: "loaded",
        packageRoot: report.packageRoot,
        packageName: report.packageJson?.name,
        packageVersion: report.packageJson?.version,
    };
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

export type NextActionView = {
    kind: "validate" | "validating" | "validation-failed" | "fix-validation" | "simulate" | "simulation-running" | "view-report";
    title: string;
    description: string;
    // Absent while there's nothing useful to click yet (e.g. a validation already in flight).
    actionLabel?: string;
};

// Pure UI-sequencing over state Project Overview already has (validation state, current simulation job)
// -- not game/simulation logic, just "which screen should the user go to next." Deliberately a single
// ordered if-chain (not a lookup table) since each branch's copy depends on the *reason*, not just a
// status enum. Warnings-only validation results are deliberately NOT treated as blocking here -- only
// `summary.blocking` (errors, or an outright invalid report) gates progress past Validate.
export function describeNextAction(validation: ProjectValidationView, simulationJob: StudioSimulationJobView | undefined): NextActionView {
    if (validation.status === "idle") {
        return {
            kind: "validate",
            title: "Validate your project",
            description: "Run a validation check to confirm your game package is ready to simulate.",
            actionLabel: "Validate project",
        };
    }
    if (validation.status === "loading") {
        return {kind: "validating", title: "Validating…", description: "Checking your project for issues."};
    }
    if (validation.status === "error") {
        return {kind: "validation-failed", title: "Validation failed", description: validation.message, actionLabel: "Try again"};
    }

    const {summary} = validation;
    if (summary.blocking) {
        const issueCount = summary.errors.length + summary.warnings.length;
        return {
            kind: "fix-validation",
            title: "Fix validation issues",
            description: `${issueCount} issue${issueCount === 1 ? "" : "s"} found — review and resolve them before building or simulating.`,
            actionLabel: "Review validation",
        };
    }
    if (simulationJob === undefined) {
        return {
            kind: "simulate",
            title: "Run a simulation",
            description: summary.hasIssues
                ? `Your project is valid, with ${summary.warnings.length} warning(s). Run a simulation to see how it performs.`
                : "Your project is valid. Run a simulation to see how it performs.",
            actionLabel: "Run a simulation",
        };
    }
    if (isSimulationActive(simulationJob)) {
        return {
            kind: "simulation-running",
            title: "Simulation in progress",
            description: "Your simulation is still running.",
            actionLabel: "View progress",
        };
    }
    if (simulationJob.status === "completed") {
        return {
            kind: "view-report",
            title: "View your report",
            description: "Your simulation finished — open the report to see the results.",
            actionLabel: "View report",
        };
    }
    return {
        kind: "simulate",
        title: "Run a new simulation",
        description: "The last simulation didn't complete. Run a new one when you're ready.",
        actionLabel: "Run a simulation",
    };
}
