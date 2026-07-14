[← Back to docs index](README.md)

# Weighted Outcome Library

`weightedoutcome/` is the "no Monte Carlo" counterpart to [Simulation](simulation.md): instead of sampling
rounds and estimating RTP/volatility with a confidence interval, a `WeightedOutcomeLibrary` enumerates every
distinct possible round outcome a math model can produce — each one a canonical [`RoundArtifact`](round-artifacts.md)
plus its exact probability weight — and `WeightedOutcomeLibraryAnalyzer` computes exact statistics directly from
that enumeration. There's no sampling error and no confidence interval to report, because the library already
accounts for every outcome.

This is the same idea `math-modeling.md`'s "compute the exact theoretical RTP" section already uses ad hoc via
`SymbolsCombinationsAnalyzer.getUniqueCombinationsWithWeights` — a `WeightedOutcomeLibrary` is the canonical,
hashable, reusable form of that same "enumerate with weights" pattern, generalized to any round shape (single-step
or multi-step) via `RoundArtifact` rather than just raw symbol combinations.

## Data shapes

```ts
type WeightedOutcome<T = string> = {
    readonly id: string;
    readonly weight: number;
    readonly artifact: RoundArtifact<T>;
};

type WeightedOutcomeLibrary<T = string> = {
    readonly schemaVersion: number;
    readonly libraryId: string;
    readonly outcomes: readonly WeightedOutcome<T>[];
};
```

`weight` is relative, not a probability — an outcome's actual probability is its own `weight` divided by the
library's total weight (see the analyzer below). `id` is always caller-supplied, the same way `RoundArtifact.roundId`
is: never auto-generated, so a library rebuilt from the same source math data reproduces the exact same ids, and
therefore the exact same library hash.

Both types are deeply readonly and deeply frozen once built — a `WeightedOutcome`'s own `artifact` isn't
separately deep-copied, since a `RoundArtifact` is already immutable by construction (built via `buildRoundArtifact`).

## Building

```ts
function buildWeightedOutcomeLibrary<T = string>(options: {
    libraryId: string;
    outcomes: readonly {id: string; weight: number; artifact: RoundArtifact<T>}[];
    schemaVersion?: number;
}): WeightedOutcomeLibrary<T>;
```

Fails fast with **`WeightedOutcomeLibraryBuildError`** (`getCode()`/`message`) on: an invalid `libraryId`/
`schemaVersion` (only the current `WEIGHTED_OUTCOME_LIBRARY_SCHEMA_VERSION` is accepted), an empty `outcomes`
list, an invalid or duplicate outcome `id`, an invalid `weight` or `artifact.payoutMultiplier` (both must be
finite numbers `>= 0`), a total weight that sums to zero, or content that isn't JSON-safe.

```ts
import {buildWeightedOutcomeLibrary} from "pokie";

const library = buildWeightedOutcomeLibrary({
    libraryId: "crazy-fruits-base-game-v1",
    outcomes: [
        {id: "no-win", weight: 70, artifact: losingArtifact},
        {id: "small-win", weight: 25, artifact: smallWinArtifact},
        {id: "jackpot", weight: 5, artifact: jackpotArtifact},
    ],
});
```

## Canonical JSON + hash

```ts
class PokieJsonWeightedOutcomeLibraryProjector<T = string>
    implements WeightedOutcomeLibraryProjector<T, WeightedOutcomeLibraryJson<T>> {
    project(library: WeightedOutcomeLibrary<T>): WeightedOutcomeLibraryJson<T>;
}

function computeWeightedOutcomeLibraryHash<T = string>(library: WeightedOutcomeLibrary<T>): string; // "sha256:<hex>"
```

Both share the exact same canonical serializer (`toCanonicalJson`, see [Round Artifacts](round-artifacts.md)) as
`computeRoundArtifactHash`/`PokieJsonRoundArtifactProjector` — the same fail-fast JSON-safety guarantees apply.

## Exact analysis (no Monte Carlo)

```ts
type WeightedOutcomePayoutBucket = {readonly payoutMultiplier: number; readonly probability: number};

type WeightedOutcomeLibraryAnalysis = {
    readonly totalWeight: number;
    readonly rtp: number;
    readonly hitFrequency: number;
    readonly zeroWinFrequency: number;
    readonly variance: number;
    readonly standardDeviation: number;
    readonly maxWin: number;
    readonly maxWinProbability: number;
    readonly payoutDistribution: readonly WeightedOutcomePayoutBucket[];
};

class WeightedOutcomeLibraryAnalyzer<T = string> {
    analyze(library: WeightedOutcomeLibrary<T>): WeightedOutcomeLibraryAnalysis;
}
```

`rtp`/`variance`/`standardDeviation` are all defined over each outcome's own `artifact.payoutMultiplier` (a
stake-normalized return ratio) — the same convention `SimulationStatistics.rtp` uses (the mean of per-round
payout/bet ratios, not `totalPayout/totalBet`), so the result stays correct even when outcomes mix different
stakes (e.g. base-game spins alongside zero-stake free-games outcomes). `hitFrequency`/`zeroWinFrequency` are the
weighted share of outcomes with `totalWin > 0` / `totalWin === 0` (they always sum to 1). `maxWin`/
`maxWinProbability` are the one exception to the "everything is a ratio" rule: they report the raw currency
`totalWin` (matching `SimulationStatistics.maxWin`'s own meaning) and the weighted probability of hitting it,
since "the biggest win this library can produce" is inherently a statement about actual payout.

`payoutDistribution` is an **exact** probability mass function — one entry per distinct `payoutMultiplier` value
actually present among the outcomes (grouped at a fixed floating-point precision, so division noise never splits
one payout level into several near-identical buckets), sorted ascending, with `probability` values summing to 1 —
not a binned histogram the way `pokie sim`'s Monte Carlo `payoutHistogram` is.

`WeightedOutcomeLibraryAnalyzer` assumes its input is already a validly-built library (as `buildWeightedOutcomeLibrary`
guarantees) and does not re-validate; validate a library from an untrusted source first.

## Validation

```ts
class WeightedOutcomeLibraryValidator<T = string> implements ValidationRule<WeightedOutcomeLibrary<T>> {
    validate(library: WeightedOutcomeLibrary<T>): ValidationIssue[];
}
```

Reuses the existing generic `ValidationRule<T>` contract. Never throws, even for a malformed or hand-crafted
library. Checks `libraryId`/`schemaVersion` (including that it's the currently supported version), that
`outcomes` is non-empty with unique, non-empty `id`s and finite non-negative `weight`s summing to more than
zero, that each outcome's `artifact.payoutMultiplier` is finite and non-negative, and delegates full validation
of each outcome's own `artifact` to `RoundArtifactValidator` (injectable via the constructor) — so "artifact
consistency" is exactly `RoundArtifactValidator`'s own definition of validity, not a second one — plus an
overall JSON-safety check.

```ts
const issues = new WeightedOutcomeLibraryValidator().validate(library);
if (issues.some((issue) => issue.severity === "error")) {
    // ...
}
```
