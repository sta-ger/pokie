import type {ValidationIssue, WeightedOutcomeLibraryAnalysis, WeightedOutcomeLibraryFeatureBreakdown} from "pokie";

// Where a selected library's identity/origin came from -- "game"/"configHash"/"pokieVersion" are only
// ever known for a bundle or Stake Engine source (both carry a manifest); a plain JSON file has no such
// envelope, so those fields are omitted rather than guessed.
export type StudioOutcomeLibraryProvenance = {
    readonly source: "json" | "bundle" | "stakeengine";
    readonly libraryId: string;
    readonly outcomeCount: number;
    readonly hash: string;
    readonly game?: {readonly id: string; readonly name: string; readonly version: string};
    readonly configHash?: string;
    readonly pokieVersion?: string;
};

export type StudioOutcomeLibrarySampleOutcome = {
    readonly id: string;
    readonly weight: number;
    readonly totalWin: number;
    readonly payoutMultiplier: number;
};

// The Outcome Libraries tab's "Select/import" + "Validate & analyze" + "Inspect distribution/features"
// steps all land in one response -- once a library is loaded, computing its diagnostics/analysis/feature
// breakdown is fast and deterministic (no separate round trip needed the way PAR sheet import's own
// Diagnose/Preview split calls exist for genuinely separate, independently-triggerable operations).
//
// "sampleOutcomes" is a bounded prefix (see StudioOutcomeLibraryService.SAMPLE_SIZE), never the full
// outcomes array -- a real library can hold millions of entries, and dumping all of them into one HTTP
// response/the DOM would defeat the whole point of the bundle format's own streaming design. The full
// count is always in `provenance.outcomeCount`; `sampleTruncated` tells the UI whether what it's showing
// under Advanced details is everything or just a prefix.
export type StudioOutcomeLibrarySelectView =
    | {
          readonly status: "ok";
          readonly provenance: StudioOutcomeLibraryProvenance;
          readonly errors: readonly ValidationIssue[];
          readonly warnings: readonly ValidationIssue[];
          readonly analysis: WeightedOutcomeLibraryAnalysis;
          readonly featureBreakdown: WeightedOutcomeLibraryFeatureBreakdown;
          readonly sampleOutcomes: readonly StudioOutcomeLibrarySampleOutcome[];
          readonly sampleTruncated: boolean;
      }
    | {readonly status: "invalid"; readonly errors: readonly ValidationIssue[]; readonly warnings: readonly ValidationIssue[]}
    | {readonly status: "load-error"; readonly error: string};
