import type {
    StudioOutcomeLibraryCompareView,
    StudioOutcomeLibraryDeepValidateView,
    StudioOutcomeLibraryProvenance,
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
