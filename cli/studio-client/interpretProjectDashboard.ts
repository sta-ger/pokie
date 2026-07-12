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
