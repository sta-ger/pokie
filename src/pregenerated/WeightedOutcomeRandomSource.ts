// The one collaborator WeightedOutcomeSelector draws randomness from — injected rather than hardwired,
// so a caller controls exactly how "random" a selection is: SeededWeightedOutcomeRandomSource for
// reproducible draws (replay, regression tests, certification-style suites), a secure source for
// production. Mirrors RandomNumberGenerating's role for SymbolsCombinationsGenerator.
//
// Returns an exact, unbiased integer rather than a continuous float: selection weights are exact
// integer counts (see WeightedOutcomeSelector's own doc comment for why), and drawing an integer
// directly — via rejection sampling, not `Math.floor(nextFloat() * n)` — is what keeps the result free
// of modulo/rounding bias for any exclusiveUpperBound, not just powers of two.
export interface WeightedOutcomeRandomSource {
    // Must return an integer, uniformly distributed over [0, exclusiveUpperBound), i.e. every integer
    // in that range must be equally likely — every implementation of this interface is responsible for
    // its own unbiasedness (typically via rejection sampling), not just its callers.
    nextInt(exclusiveUpperBound: number): number;
}
