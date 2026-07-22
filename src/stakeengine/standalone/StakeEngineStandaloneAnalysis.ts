// Small values remain numbers for source compatibility. Values derived from a uint64 total are emitted as a
// canonical fixed-point decimal string when converting their denominator to number would lose precision.
export type StakeEngineStandaloneExactDecimal = number | string;

// One event category's own exact weighted frequency across a mode's outcomes -- "occurrenceFrequency" is the
// weighted probability of drawing an outcome that carries at least one event of this category;
// "averageOccurrencesPerOutcome" is the weighted mean count of that category's events per outcome (so a category
// that always fires exactly once per outcome has occurrenceFrequency === averageOccurrencesPerOutcome, while one
// that can fire multiple times per outcome has the latter >= the former).
export type StakeEngineStandaloneEventCategoryBreakdown = {
    readonly category: string;
    readonly occurrenceFrequency: StakeEngineStandaloneExactDecimal;
    readonly averageOccurrencesPerOutcome: StakeEngineStandaloneExactDecimal;
};

// One point of the exact payout distribution, keyed by Stake's own raw integer "payoutMultiplier" (never binned,
// never rounded) -- "ratio" is the same value reversed to a stake-normalized return ratio (see
// StakeEngineOutcomeRecord), undefined only for the rare bucket where that reversal isn't exact for every outcome
// sharing this payoutMultiplier.
export type StakeEngineOutcomePayoutBucket = {
    readonly payoutMultiplier: number;
    readonly ratio: number | undefined;
    readonly probability: StakeEngineStandaloneExactDecimal;
};

// The exact -- not sampled -- statistics StakeEngineStandaloneAnalyzer computes over one mode's own normalized
// outcomes. Mirrors WeightedOutcomeLibraryAnalysis's own shape/semantics where the underlying data supports it
// (rtp/hitFrequency/variance/standardDeviation are all defined over each outcome's own stake-normalized "ratio",
// the same way WeightedOutcomeLibraryAnalysis.rtp is defined over artifact.payoutMultiplier), but is computed
// directly off StakeEngineOutcomeRecord -- no RoundArtifact/WeightedOutcomeLibrary is ever built to get here.
export type StakeEngineStandaloneModeAnalysis = {
    readonly modeName: string;
    readonly cost: number;
    readonly outcomeCount: number;
    readonly totalWeight: StakeEngineStandaloneExactDecimal;
    readonly rtp: number;
    readonly hitFrequency: number;
    readonly zeroWinFrequency: number;
    readonly variance: number;
    readonly standardDeviation: number;
    readonly maxPayoutMultiplier: number;
    readonly maxRatio: number;
    readonly maxWinProbability: number;
    // How many outcomes' own "ratio" couldn't be reversed exactly (see StakeEngineOutcomeRecord) and therefore
    // fell back to an unchecked division for rtp/variance/payoutDistribution purposes -- 0 for any directory this
    // package itself ever wrote; a nonzero count here is the honest signal that this mode's rtp/variance carry a
    // small amount of float imprecision from a handful of outcomes, not silently hidden.
    readonly nonInvertibleRatioCount: number;
    readonly payoutDistribution: readonly StakeEngineOutcomePayoutBucket[];
    readonly eventClassificationBreakdown: readonly StakeEngineStandaloneEventCategoryBreakdown[];
};

export type StakeEngineStandaloneAnalysis = {
    readonly stakeDir: string;
    readonly modes: readonly StakeEngineStandaloneModeAnalysis[];
};
