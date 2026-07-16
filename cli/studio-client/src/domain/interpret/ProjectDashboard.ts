import type {GamePackageInspectionReport, PokieGamePackageValidationReport, ProjectDashboardContext, StudioSimulationJobView} from "../../api/types";
import {isSimulationActive} from "./Simulation";

// Pure view-model transforms for the Project Dashboard — mirrors cli/client/interpretResponse.ts's
// role: main.ts/dom.ts consume these instead of branching on the raw discriminated-union DTOs
// themselves, and (being pure) these are unit-testable without a real DOM/jsdom, same as
// interpretResponse.ts's own tests.

export type ProjectHeaderView =
    | {status: "empty"}
    | {status: "loading"; projectRoot: string}
    | {status: "error"; projectRoot: string; message: string}
    | {status: "loaded"; projectRoot: string; id: string; name: string; version: string; description?: string};

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
    return {
        status: "loaded",
        projectRoot: context.projectRoot,
        id: context.game.id,
        name: context.game.name,
        version: context.game.version,
        description: context.game.description,
    };
}

export type ProvenanceView =
    | {status: "generated"; blueprintHash: string; source: string; pokieVersion: string; generatedAt: string; files: string[]}
    | {status: "not-generated"}
    | {status: "error"; message: string};

// Three distinct states, deliberately not collapsed into one another:
// - "generated" — a valid inspection with build-info present (built via `pokie build`).
// - "not-generated" — a *valid* inspection with no build-info (a `pokie create`/`pokie init`
//   scaffold, or a build-info.json that failed to parse/wasn't written by `pokie build` — see
//   GamePackageInspector.readBuildInfo, which already treats either the same way as "absent").
// - "error" — the inspection report itself is invalid (`report.valid === false`, e.g. a missing or
//   corrupt package.json): this is not "not generated", it's "couldn't even be read", and must show
//   the report's own safe error message, not be silently folded into "not built via pokie build".
export function describeProvenance(report: GamePackageInspectionReport): ProvenanceView {
    if (!report.valid) {
        return {status: "error", message: report.error ?? "Inspection failed."};
    }
    if (!report.buildInfo) {
        return {status: "not-generated"};
    }
    const {buildInfo} = report;
    return {
        status: "generated",
        blueprintHash: buildInfo.blueprintHash,
        source: buildInfo.source ?? "(unknown)",
        pokieVersion: buildInfo.pokieVersion,
        generatedAt: buildInfo.generatedAt,
        files: buildInfo.files ?? [],
    };
}

// The full Inspect result block — not just the provenance sub-panel: package name/version/root, plus
// nested provenance. "loading"/"error" here are about the /api/project/inspect call itself (in
// flight, or failing outright — e.g. a 409 when there's no active project); a *successful* call that
// reports an invalid package still comes back as "loaded", with the invalidity carried by its
// nested `provenance` (status "error") — see describeProvenance above.
export type InspectionResultView =
    | {status: "loading"}
    | {status: "error"; message: string}
    | {status: "loaded"; packageRoot: string; packageName?: string; packageVersion?: string; provenance: ProvenanceView};

export function describeInspection(report: GamePackageInspectionReport): InspectionResultView {
    return {
        status: "loaded",
        packageRoot: report.packageRoot,
        packageName: report.packageJson?.name,
        packageVersion: report.packageJson?.version,
        provenance: describeProvenance(report),
    };
}

export type ValidationIssueView = {code: string; message: string};

export type ValidationSummaryView = {
    valid: boolean;
    errors: ValidationIssueView[];
    warnings: ValidationIssueView[];
    suggestions: string[];
    // "Are there any issues to *show*" -- warnings still render in ValidationTab even though they don't
    // block anything (see `blocking` below).
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
