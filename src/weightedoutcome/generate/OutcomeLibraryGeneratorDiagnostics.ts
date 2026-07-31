import type {PokieGameManifest} from "../../gamepackage/PokieGameManifest.js";

// "exact": every reachable reel-stop tuple in the space was actually swept -- the library's own weights are
// the true combinatorial counts, not an estimate. "bounded-coverage": the caller explicitly opted into
// sampling a space too large to sweep exhaustively (see BoundedCoverageGenerationOptions on
// GenerateExactWeightedOutcomeLibraryOptions) -- the library is a real, honestly-labeled statistical sample
// through the exact same calculation path, never presented as canonical/exact.
export type OutcomeLibraryGenerationStrategy = "exact" | "bounded-coverage";

// Generator/algorithm/seed/build/provenance diagnostics for one generateExactWeightedOutcomeLibrary run --
// returned alongside the library itself (see GenerateExactWeightedOutcomeLibraryResult) and, when a caller
// threads it into OutcomeLibraryBundleModeInput.generator, copied verbatim into that mode's own bundle
// manifest entry. totalOutcomeSpaceSize/sampledRawCount use the same bigint-safe number-or-decimal-string
// convention as StakeEngineStandaloneExactDecimal (see toBigIntSafeDecimal) since an exact reel-stop
// combination space routinely exceeds Number.MAX_SAFE_INTEGER.
export type OutcomeLibraryGeneratorDiagnostics = {
    readonly algorithm: string;
    readonly strategy: OutcomeLibraryGenerationStrategy;
    readonly totalOutcomeSpaceSize: number | string;
    readonly sampledRawCount: number | string;
    // Only present for "bounded-coverage" -- the deterministic seed its own sampling draws were made from,
    // so the exact same sample can be reproduced later. "exact" generation uses no randomness at all.
    readonly seed?: string;
    readonly pokieVersion: string;
    readonly game: PokieGameManifest;
    readonly configHash?: string;
    readonly generatedAt: string;
};
