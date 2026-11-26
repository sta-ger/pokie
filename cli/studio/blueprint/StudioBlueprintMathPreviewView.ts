import type {FreeGamesExactRtp, WeightedOutcomeLibraryAnalysis, WeightedOutcomeLibraryFeatureBreakdown} from "@fromstan/pokie";

// Design Game's own on-demand exact math preview. "available" means one complete enumeration of the
// current draft finished successfully; it never represents a sampled Simulation and nothing was saved.
// "unavailable" is an ordinary domain state (structurally invalid draft, stateful mechanic with no finite
// exact space, or a space above the preview cap), not a transport failure.
export type StudioBlueprintMathPreviewView =
    | {
          readonly status: "ok";
          readonly outcomeCount: number;
          readonly totalWeight: number;
          readonly stake: number;
          readonly analysis: WeightedOutcomeLibraryAnalysis;
          /** Feature triggers in the paid-spin records; see BlueprintMathAnalysis. */
          readonly featureBreakdown: WeightedOutcomeLibraryFeatureBreakdown;
          /** Exact total RTP derived from additive free-game triggers, when available. */
          readonly freeGamesRtp: FreeGamesExactRtp;
          readonly generatedAt: string;
          readonly maxOutcomes: number;
          readonly note?: string;
      }
    | {
          readonly status: "unavailable";
          readonly message: string;
          readonly outcomeSpaceSize?: string;
      };
