import type {FreeGamesExactRtp, WeightedOutcomeLibraryAnalysis} from "@fromstan/pokie";

// One exact contribution row, computed directly from a retained outcome library's own RoundRecords.
// "rtpContribution" is the win amount attributable to this line/symbol, divided by the round's stake
// and weighted across the whole library -- it uses the same unit as WeightedOutcomeLibraryAnalysis.rtp
// (return per unit staked), so a base game's line contributions can be compared with its reported RTP.
// "hitFrequency" is the probability that a random round contains at least one win for this key; a round
// with several wins of the same line/symbol still counts once. Contributions can overlap (line wins also
// appear in the symbol table, and a round can pay several lines), so neither table is an additive
// decomposition of RTP when summed on its own.
export type StudioExactMathContribution = {
    readonly kind: "line" | "symbol";
    readonly key: string;
    readonly label: string;
    readonly symbolId?: string;
    readonly rtpContribution: number;
    readonly hitFrequency: number;
    readonly outcomeCount: number;
};

export type StudioExactMathContributionTable = {
    readonly entries: readonly StudioExactMathContribution[];
    readonly truncated: boolean;
};

// One feature event (for example freeGamesTriggered) seen in the enumerated paid-spin outcomes.
// A non-empty featureEvents list means the payout metrics above do not include the later feature
// wins those events produce -- the library records the trigger, not the free-spin/bonus outcome.
export type StudioExactMathFeatureEvent = {
    readonly key: string;
    readonly weightedFrequency: number;
    readonly outcomeCount: number;
};

// One distinct win event and the exact probability that a random round contains it. This is deliberately
// event-level (symbol × match count, scatter count, feature win) rather than another total-payout bucket:
// a round can contain several events, so rows overlap and probabilities do not sum to 1.
export type StudioExactMathEvent = {
    readonly kind: "line" | "scatter" | "other";
    readonly key: string;
    readonly label: string;
    readonly winType: string;
    readonly winId: string;
    readonly symbolId?: string;
    readonly matchCount?: number;
    readonly probability: number;
    readonly rtpContribution: number;
    readonly outcomeCount: number;
};

export type StudioExactMathEventTable = {
    readonly entries: readonly StudioExactMathEvent[];
    readonly truncated: boolean;
};

export type StudioExactMathView =
    | {
          readonly status: "ok";
          readonly modeName: string;
          readonly libraryDir: string;
          readonly libraryId: string;
          readonly libraryHash: string;
          readonly outcomeCount: number;
          readonly totalWeight: number;
          readonly stake: number;
          readonly generatedAt: string;
          readonly strategy?: string;
          readonly analysis: WeightedOutcomeLibraryAnalysis;
          readonly contributions: {
              readonly line: StudioExactMathContributionTable;
              readonly symbol: StudioExactMathContributionTable;
          };
          readonly events: StudioExactMathEventTable;
          /** Feature triggers found in the paid-spin records, if their detail could be read. */
          readonly featureEvents?: readonly StudioExactMathFeatureEvent[];
          /**
           * true: the library contains no feature events, so its RTP is a complete paid-spin total.
           * false: feature triggers exist, but the later feature payouts are not included in the library.
           * undefined: the library was too large to inspect; treat the scope as paid-spin only.
           */
          readonly featurePayoutsIncluded?: boolean;
          /** Exact total RTP derived from additive free-game triggers, when the library supports it. */
          readonly freeGamesRtp?: FreeGamesExactRtp;
          readonly featureNote?: string;
          /** Set when exact metrics are available but per-line/symbol/event detail was intentionally skipped. */
          readonly contributionNote?: string;
          /** Set when the event table itself was limited or skipped. */
          readonly eventNote?: string;
      }
    | {readonly status: "missing"; readonly message: string}
    | {readonly status: "stale"; readonly message: string}
    | {readonly status: "error"; readonly message: string};
