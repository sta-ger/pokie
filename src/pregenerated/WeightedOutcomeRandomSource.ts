// The one collaborator WeightedOutcomeSelector draws randomness from — injected rather than hardwired,
// so a caller controls exactly how "random" a selection is: SeededWeightedOutcomeRandomSource for
// reproducible draws (replay, regression tests, certification-style suites), a secure source for
// production. Mirrors RandomNumberGenerating's role for SymbolsCombinationsGenerator, but returns a
// continuous [0, 1) value rather than an integer range — weights are arbitrary finite numbers, not
// necessarily integers, so an integer draw would either lose precision or force artificial scaling.
export interface WeightedOutcomeRandomSource {
    // Must return a finite number in [0, 1) (0 inclusive, 1 exclusive) every time it's called.
    nextUnitInterval(): number;
}
