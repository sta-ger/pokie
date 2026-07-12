import type {GamePackageInspectionReport, PokieGamePackageValidationReport, ProjectDashboardContext} from "./types.js";

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
    | {generated: false}
    | {generated: true; blueprintHash: string; source: string; pokieVersion: string; generatedAt: string; files: string[]};

// Provenance is only meaningful for a package `pokie build` actually generated — everything else
// (a plain `pokie create`/`pokie init` scaffold, or an inspection that failed outright) collapses to
// the same "not generated" view; dom.ts renders one "not built via pokie build" message for both
// rather than needing to know the difference.
export function describeProvenance(report: GamePackageInspectionReport): ProvenanceView {
    if (!report.valid || !report.buildInfo) {
        return {generated: false};
    }
    const {buildInfo} = report;
    return {
        generated: true,
        blueprintHash: buildInfo.blueprintHash,
        source: buildInfo.source ?? "(unknown)",
        pokieVersion: buildInfo.pokieVersion,
        generatedAt: buildInfo.generatedAt,
        files: buildInfo.files ?? [],
    };
}

export type ValidationIssueView = {code: string; message: string};

export type ValidationSummaryView = {
    valid: boolean;
    errors: ValidationIssueView[];
    warnings: ValidationIssueView[];
    suggestions: string[];
    hasIssues: boolean;
};

export function describeValidationSummary(report: PokieGamePackageValidationReport): ValidationSummaryView {
    return {
        valid: report.valid,
        errors: report.errors.map((issue) => ({code: issue.code, message: issue.message})),
        warnings: report.warnings.map((issue) => ({code: issue.code, message: issue.message})),
        suggestions: report.suggestions,
        hasIssues: report.errors.length > 0 || report.warnings.length > 0,
    };
}
