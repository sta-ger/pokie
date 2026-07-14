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
library's total weight (see the analyzer below). It must be a finite number **greater than zero**: a weight of
exactly `0` is rejected the same as a negative one, not silently accepted — an outcome that can never actually be
drawn contributes nothing to any statistic, so admitting it would only let a caller believe some outcome (a
jackpot, say) is "in" the library's analysis when it can never be. `id` is always caller-supplied, the same way
`RoundArtifact.roundId` is: never auto-generated, so a library rebuilt from the same source math data reproduces
the exact same ids, and therefore the exact same library hash.

Both types are deeply readonly and deeply frozen once built — a `WeightedOutcome`'s own `artifact` isn't
separately deep-copied, since a `RoundArtifact` is already immutable by construction (built via `buildRoundArtifact`).

### Library homogeneity: one library is one paid bet

Every outcome in a library must describe the **same** underlying, paid round: the same
`provenance.game.id`/`provenance.game.version`/`provenance.configHash`/`provenance.pokieVersion`, the same
`betMode`, and the same `stake` — and that `stake` must be a positive number, never `0`. A library mixes results
for one specific bet; it isn't a place to combine spins from different games, configs, or bet sizes.

In particular, **a free-games (or any other multi-step) round belongs inside the same `RoundArtifact` as the
base-game spin that paid for it** — as additional `steps` (`RoundArtifact` already supports multi-step rounds
natively, see [Round Artifacts](round-artifacts.md)) — not as a second, separate outcome with `stake: 0` mixed
into this library. A `WeightedOutcome` with `stake: 0` would have no way to contribute to `rtp` correctly (its
`payoutMultiplier` would be `0` regardless of how big its free-games win was), so `buildWeightedOutcomeLibrary`
rejects it outright.

## Building

```ts
function buildWeightedOutcomeLibrary<T = string>(options: {
    libraryId: string;
    outcomes: readonly {id: string; weight: number; artifact: RoundArtifact<T>}[];
    schemaVersion?: number;
    artifactValidator?: ValidationRule<RoundArtifact<T>>; // an *additional* check, never a replacement — see below
}): WeightedOutcomeLibrary<T>;
```

Fails fast with **`WeightedOutcomeLibraryBuildError`** (`getCode()`/`message`) on: an invalid `libraryId`/
`schemaVersion` (only the current `WEIGHTED_OUTCOME_LIBRARY_SCHEMA_VERSION` is accepted), an empty `outcomes`
list, an invalid or duplicate outcome `id`, an invalid `weight` (must be finite and `> 0`, never `0`) or
`artifact.payoutMultiplier` (must be finite and `>= 0`), an invalid `artifact.stake` (must be finite and `> 0`),
an artifact that fails validation (see "artifact validation" below), inconsistent provenance/`betMode`/`stake`
across outcomes (see "library homogeneity" above), a total weight that isn't a finite number greater than zero
(covers both "sums to zero" and "the sum of otherwise-finite weights overflows to `Infinity`"), or content that
isn't JSON-safe.

### Artifact validation always runs

A real `RoundArtifactValidator` always validates every outcome's artifact, whether or not `artifactValidator` is
given — that option can only ever add *further* checks on top of it, never replace it. A permissive custom
validator (e.g. one that always reports no issues) can therefore never let a malformed `RoundArtifact` — a
mismatched screen, an inconsistent `totalWin`, ... — through: it's rejected as `weighted-outcome-artifact-invalid`
either way. Use `artifactValidator` to layer on extra, library- or game-specific invariants beyond what
`RoundArtifactValidator` already covers, not to loosen its own checks.

Outcomes are canonically sorted by `id` (plain code-point order, not locale-aware) before the library is frozen,
so building from the exact same set of outcomes always produces the exact same library — and therefore the
exact same hash and `WeightedOutcomeLibraryAnalyzer` output — regardless of what order the caller happened to
list them in. `WeightedOutcomeLibraryValidator` checks this too: a hand-crafted library whose `outcomes` aren't
already in that order is flagged as `weighted-outcome-library-outcomes-not-sorted`, since it could only have
gotten that way by bypassing `buildWeightedOutcomeLibrary`.

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
payout/bet ratios, not `totalPayout/totalBet`). `hitFrequency`/`zeroWinFrequency` are the weighted share of
outcomes with `totalWin > 0` / `totalWin === 0` (they always sum to 1). `maxWin`/`maxWinProbability` are the one
exception to the "everything is a ratio" rule: they report the raw currency `totalWin` (matching
`SimulationStatistics.maxWin`'s own meaning) and the weighted probability of hitting it, since "the biggest win
this library can produce" is inherently a statement about actual payout — this is safe precisely *because*
every outcome shares the same `stake` (see "library homogeneity" above), so comparing raw `totalWin` values
across outcomes is meaningful.

Every weighted sum normalizes each outcome's weight (divides by `totalWeight`) *before* multiplying by whatever
it's being weighted by, rather than summing raw `weight * value` products and dividing once at the end — so
`rtp`/`variance`/`hitFrequency`/`maxWinProbability` can only come out `NaN`/`Infinity` if the true mathematical
result actually is one of those, never as an artifact of summation order (a `weight` near `Number.MAX_VALUE`
multiplied directly by a `payoutMultiplier` can overflow even when the correctly-computed weighted mean would
not).

`payoutDistribution` is an **exact** probability mass function — one entry per *exactly* distinct
`payoutMultiplier` value actually present among the outcomes (grouped by strict numeric equality, not by
rounding to some fixed precision — two outcomes whose multipliers differ by any amount, however small, always
get separate entries), sorted ascending, with `probability` values summing to 1 — not a binned histogram the way
`pokie sim`'s Monte Carlo `payoutHistogram` is.

`WeightedOutcomeLibraryAnalyzer` assumes its input is already a validly-built library (as `buildWeightedOutcomeLibrary`
guarantees) and does not re-validate; validate a library from an untrusted source first.

## Validation

```ts
class WeightedOutcomeLibraryValidator<T = string> implements ValidationRule<WeightedOutcomeLibrary<T>> {
    // extraArtifactValidator is additive — RoundArtifactValidator always runs regardless, same as
    // buildWeightedOutcomeLibrary's own artifactValidator option.
    constructor(extraArtifactValidator?: ValidationRule<RoundArtifact<T>>);
    validate(library: WeightedOutcomeLibrary<T>): ValidationIssue[];
}
```

Reuses the existing generic `ValidationRule<T>` contract. Never throws, even for a malformed or hand-crafted
library. Checks `libraryId`/`schemaVersion` (including that it's the currently supported version), that
`outcomes` is non-empty with unique, non-empty `id`s **already in canonical ascending order**
(`weighted-outcome-library-outcomes-not-sorted` otherwise) and finite `weight`s that are each strictly greater
than zero, summing to a finite number greater than zero (flagging the same
`weighted-outcome-library-total-weight-invalid` issue whether the weights sum to zero *or* overflow to
`Infinity`), that each outcome's `artifact.payoutMultiplier`/`artifact.stake` are finite (`stake` additionally
must be `> 0`), that every outcome shares the same provenance/`betMode`/`stake` as the rest of the library (see
"library homogeneity" above), and always delegates full validation of each outcome's own `artifact` to a real
`RoundArtifactValidator` — so "artifact consistency" is exactly `RoundArtifactValidator`'s own definition of
validity, not a second one — plus an overall JSON-safety check. The constructor's `extraArtifactValidator` is
additive the same way `buildWeightedOutcomeLibrary`'s `artifactValidator` option is (see "artifact validation
always runs" above): it can only ever report *further* issues, never suppress `RoundArtifactValidator`'s own.

```ts
const issues = new WeightedOutcomeLibraryValidator().validate(library);
if (issues.some((issue) => issue.severity === "error")) {
    // ...
}
```
