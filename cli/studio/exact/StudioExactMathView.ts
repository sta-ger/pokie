import type {WeightedOutcomeLibraryAnalysis} from "@fromstan/pokie";

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
          /** Set when exact metrics are available but per-line/symbol detail was intentionally skipped. */
          readonly contributionNote?: string;
      }
    | {readonly status: "missing"; readonly message: string}
    | {readonly status: "stale"; readonly message: string}
    | {readonly status: "error"; readonly message: string};
