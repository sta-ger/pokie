import type {
    StudioOutcomeLibraryCompareView,
    StudioOutcomeLibraryDeepValidateView,
    StudioOutcomeLibraryGenerateEstimateView,
    StudioOutcomeLibraryGenerateResultView,
    StudioOutcomeLibraryProvenance,
    StudioOutcomeLibraryRegistryView,
    StudioOutcomeLibrarySelectView,
    ValidationIssue,
} from "../../api/types";

// Pure view-model transforms for the Outcome Libraries tab -- same role as ParSheetImportExport.ts's own
// describe*/isStale* functions. Every number/analysis/breakdown/diff shown by this tab is exactly what
// WeightedOutcomeLibraryAnalyzer/computeWeightedOutcomeLibraryFeatureBreakdown/
// WeightedOutcomeLibraryAnalysisDiffer already computed server-side -- nothing here recomputes RTP, hit
// rate, volatility, a payout distribution, or a diff; these functions only add idle/loading/network-error
// states around the server's own DTOs and turn already-computed data into plain-language labels.

export type OutcomeLibrarySelectRequestView = {status: "idle"} | {status: "loading"} | {status: "error"; message: string} | StudioOutcomeLibrarySelectView;

export function describeOutcomeLibrarySelectResult(result: StudioOutcomeLibrarySelectView): OutcomeLibrarySelectRequestView {
    return result;
}

export type OutcomeLibraryCompareRequestView = {status: "idle"} | {status: "loading"} | {status: "error"; message: string} | StudioOutcomeLibraryCompareView;

export function describeOutcomeLibraryCompareResult(result: StudioOutcomeLibraryCompareView): OutcomeLibraryCompareRequestView {
    return result;
}

export type OutcomeLibraryDeepValidateRequestView =
    | {status: "idle"}
    | {status: "loading"}
    | {status: "error"; message: string}
    | StudioOutcomeLibraryDeepValidateView;

export function describeOutcomeLibraryDeepValidateResult(result: StudioOutcomeLibraryDeepValidateView): OutcomeLibraryDeepValidateRequestView {
    return result;
}

// Every outcome the Select/import -> Validate & analyze step can end up in, in the language a
// non-technical user would recognize -- never re-validating anything, only reading whether the select
// response's own errors/warnings (already computed server-side) are non-empty. "partial" means "loaded,
// and usable, but with warnings worth reviewing" -- never a blocker; "invalid" means analysis/breakdown
// were never even computed (see StudioOutcomeLibraryService.select()'s own doc comment).
export type OutcomeLibraryOutcome = "success" | "partial" | "invalid";

export function describeOutcomeLibraryOutcome(view: {errors: readonly ValidationIssue[]; warnings: readonly ValidationIssue[]}): OutcomeLibraryOutcome {
    if (view.errors.length > 0) {
        return "invalid";
    }
    if (view.warnings.length > 0) {
        return "partial";
    }
    return "success";
}

const SOURCE_LABELS: Record<StudioOutcomeLibraryProvenance["source"], string> = {
    json: "a plain JSON library file",
    bundle: "an outcome-library bundle",
    stakeengine: "a Stake Engine export",
};

// A one-line, plain-language summary of a selected library's own recorded identity -- purely a
// human-readable restatement of whatever StudioOutcomeLibraryProvenance fields are actually present
// (game/configHash/pokieVersion are only ever known for a bundle/Stake Engine source).
export function describeOutcomeLibraryProvenanceSummary(provenance: StudioOutcomeLibraryProvenance): string {
    const parts: string[] = [`library "${provenance.libraryId}"`, `${provenance.outcomeCount.toLocaleString()} outcomes`];
    if (provenance.game) {
        parts.push(`for ${provenance.game.name} v${provenance.game.version}`);
    }
    if (provenance.pokieVersion) {
        parts.push(`built with pokie v${provenance.pokieVersion}`);
    }
    return `Loaded from ${SOURCE_LABELS[provenance.source]}: ${parts.join(", ")}.`;
}

// ---- Generate ----
// The Generate step never computes an outcome space, a library, or a bundle itself -- every field here is
// exactly what StudioOutcomeLibraryGenerateService (built on the same generateExactWeightedOutcomeLibrary/
// estimateExactOutcomeSpaceSize/OutcomeLibraryBundleWriter "pokie outcomelibrary generate"/"build" already
// drive) reports; these functions only add idle/loading/error states, same convention as the rest of this
// file.

export type OutcomeLibraryGenerateEstimateRequestView =
    | {status: "idle"}
    | {status: "loading"}
    | {status: "error"; message: string}
    | StudioOutcomeLibraryGenerateEstimateView;

export function describeOutcomeLibraryGenerateEstimateResult(result: StudioOutcomeLibraryGenerateEstimateView): OutcomeLibraryGenerateEstimateRequestView {
    return result;
}

export type OutcomeLibraryGenerateRequestView =
    | {status: "idle"}
    | {status: "loading"}
    | {status: "error"; message: string}
    | StudioOutcomeLibraryGenerateResultView;

export function describeOutcomeLibraryGenerateResult(result: StudioOutcomeLibraryGenerateResultView): OutcomeLibraryGenerateRequestView {
    return result;
}

// totalOutcomeSpaceSize/maxOutcomeSpaceSize are bigint-safe (see StudioOutcomeLibraryGenerateEstimateView's
// own doc comment) -- a `number` small enough to fit gets locale-formatted, a decimal string (too big for
// Number.MAX_SAFE_INTEGER) is shown as-is, since String has no toLocaleString of its own.
function formatBigIntSafeCount(value: number | string): string {
    return typeof value === "number" ? value.toLocaleString() : value;
}

// A one-line summary of an estimate's own strategy -- purely descriptive, mirrors "pokie outcomelibrary
// generate --estimate"'s own summary output (see OutcomeLibraryCommand.executeEstimate).
export function describeOutcomeLibraryEstimateSummary(view: Extract<StudioOutcomeLibraryGenerateEstimateView, {status: "ok"}>): string {
    const spaceLabel = `${formatBigIntSafeCount(view.totalOutcomeSpaceSize)} raw reel-stop combinations`;
    if (view.strategy === "exact") {
        return `Exact: every one of the ${spaceLabel} in "${view.game.name}" will be swept.`;
    }
    return `Bounded-coverage required: ${spaceLabel} exceeds the ${formatBigIntSafeCount(view.maxOutcomeSpaceSize)} exact-sweep limit -- a sample size and seed are needed.`;
}

// A one-line, plain-language summary of a completed generate() run -- same "restate the server's own
// already-computed fields" discipline as describeOutcomeLibraryProvenanceSummary above, never re-deriving
// anything (coverage/RTP/hash/count/weight all come straight from the server's own view).
export function describeOutcomeLibraryGenerateSummary(view: Extract<StudioOutcomeLibraryGenerateResultView, {status: "ok"}>): string {
    const coverageLabel = view.generator.strategy === "exact" ? "full (exact) coverage" : `${(view.coverage * 100).toFixed(4)}% sampled coverage`;
    return (
        `Generated "${view.mode.libraryId}" (mode "${view.mode.modeName}"): ${view.mode.outcomeCount.toLocaleString()} outcomes, ` +
        `total weight ${view.mode.totalWeight.toLocaleString()}, RTP ${(view.mode.rtp * 100).toFixed(2)}%, ${coverageLabel}. ` +
        `This is computed by actually running the project's own built package, never a static blueprint JSON.`
    );
}

// ---- Registry ----

export type OutcomeLibraryRegistryRequestView = {status: "idle"} | {status: "loading"} | {status: "error"; message: string} | StudioOutcomeLibraryRegistryView;

export function describeOutcomeLibraryRegistryResult(result: StudioOutcomeLibraryRegistryView): OutcomeLibraryRegistryRequestView {
    return result;
}

export type OutcomeLibraryRegistryBuildStatus = Exclude<StudioOutcomeLibraryRegistryView, {status: "load-error"}>["buildStatus"];

const REGISTRY_BUILD_STATUS_LABELS: Record<OutcomeLibraryRegistryBuildStatus, {label: string; color: string; action: "build" | "rebuild" | "none"}> = {
    missing: {label: "No library built yet", color: "gray", action: "build"},
    wrong: {label: "Wrong build (different game)", color: "red", action: "rebuild"},
    stale: {label: "Stale (build has moved on)", color: "yellow", action: "rebuild"},
    compatible: {label: "Compatible with the current build", color: "green", action: "none"},
};

export function describeOutcomeLibraryRegistryBuildStatus(buildStatus: OutcomeLibraryRegistryBuildStatus): {label: string; color: string; action: "build" | "rebuild" | "none"} {
    return REGISTRY_BUILD_STATUS_LABELS[buildStatus];
}
