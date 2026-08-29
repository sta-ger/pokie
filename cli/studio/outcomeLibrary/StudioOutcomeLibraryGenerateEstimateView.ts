import type {ArtifactConversionPlan, OutcomeLibraryGenerationStrategy, PokieGameManifest} from "pokie";

// The Studio Generate step's own "how big is this?" preview -- mirrors "pokie outcomelibrary generate
// --estimate" exactly (see OutcomeLibraryCommand.executeEstimate): the same estimateExactOutcomeSpaceSize
// probe, never a second, independently-derived guess. totalOutcomeSpaceSize/maxOutcomeSpaceSize use the
// same bigint-safe number-or-decimal-string convention as OutcomeLibraryGeneratorDiagnostics's own fields
// (see toBigIntSafeDecimal), since a raw reel-stop combination count routinely exceeds
// Number.MAX_SAFE_INTEGER.
export type StudioOutcomeLibraryGenerateEstimateView =
    | {
          readonly status: "ok";
          readonly game: PokieGameManifest;
          readonly reelsNumber: number;
          readonly reelsSymbolsNumber: number;
          readonly reelSizes: readonly number[];
          readonly totalOutcomeSpaceSize: number | string;
          readonly maxOutcomeSpaceSize: number | string;
          readonly strategy: OutcomeLibraryGenerationStrategy;
          readonly expectedRawWork: number | string;
          readonly warnings: readonly string[];
          // The exact deterministic sample execution will use when this is a
          // sampled/bounded request. Kept decimal-safe for browser clients.
          readonly sampleSize?: number | string;
          readonly seed?: string;
          // True whenever the raw space exceeds maxOutcomeSpaceSize and no --bounded-equivalent options
          // were supplied -- the same "requires --bounded --sample-size --seed" signal the CLI reports,
          // surfaced here before the caller ever commits to a real generate() run.
          readonly requiresBounded: boolean;
          readonly plan: ArtifactConversionPlan;
          /** Opaque server snapshot. Pass it unchanged to generate to reject source/configuration/destination drift. */
          readonly preflightToken: string;
      }
    // The loaded package doesn't implement createExactEnumerationSession at all -- there is no exact
    // outcome space to estimate (see WeightedOutcomeLibraryGenerationError's own
    // "weighted-outcome-library-generation-unsupported" code).
    | {readonly status: "unsupported"; readonly error: string; readonly plan: ArtifactConversionPlan}
    | {readonly status: "load-error"; readonly error: string; readonly plan: ArtifactConversionPlan};
