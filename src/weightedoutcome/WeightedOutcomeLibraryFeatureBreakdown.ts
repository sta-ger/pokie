// One entry per distinct bet mode, or per distinct feature event type, seen anywhere in a library --
// "weightedFrequency" is the weighted probability that a random draw from the library lands on this bet
// mode / triggers this feature event at least once; "outcomeCount" is the plain (unweighted) number of
// outcomes that do. See computeWeightedOutcomeLibraryFeatureBreakdown for how this is derived.
export type WeightedOutcomeLibraryFeatureBreakdownEntry = {
    readonly key: string;
    readonly weightedFrequency: number;
    readonly outcomeCount: number;
};

export type WeightedOutcomeLibraryFeatureBreakdown = {
    readonly betModes: readonly WeightedOutcomeLibraryFeatureBreakdownEntry[];
    readonly featureEvents: readonly WeightedOutcomeLibraryFeatureBreakdownEntry[];
};
