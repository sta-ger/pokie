[← Back to docs index](README.md)

# Reel Strip Generation

A design-time tool for producing a physical reel strip's fixed symbol sequence under a set of constraints — exact
symbol counts, minimum spacing between repeats, maximum run length, forbidden neighbors, locked positions. It is
deliberately **not** part of the runtime spin path: the output is an immutable `ReelStripDefinition`, not a
`SymbolsSequence` (see [Reels & Symbol Sequences](reels-and-sequences.md)). Once you're happy with a generated
strip, feed its `toArray()` into `SymbolsSequence.fromArray(...)` to actually use it in a game.

## Quick example

```ts
import {
    ForbiddenAdjacencyConstraint,
    MaximumConsecutiveOccurrencesConstraint,
    MinimumCircularDistanceConstraint,
    ReelStripAnalyzer,
    ReelStripGenerator,
} from "pokie";

const generator = new ReelStripGenerator();

const result = generator.generate({
    length: 32,
    symbolCounts: {W: 2, A: 6, K: 8, Q: 8, J: 8},
    seed: 12345, // omit for non-deterministic generation
    lockedPositions: {0: "W"}, // symbol "W" is pinned to position 0
    constraints: [
        new MinimumCircularDistanceConstraint(6, ["W"]), // wilds at least 6 apart, wrap-aware
        new MaximumConsecutiveOccurrencesConstraint(3), // no symbol repeats more than 3 times in a row
        new ForbiddenAdjacencyConstraint([["W", "W"]]), // redundant here, just for illustration
    ],
});

if (result.success) {
    console.log(result.strip!.toArray()); // the canonical, immutable symbol sequence
} else {
    // every attempt's violations are available for diagnosis
    console.log(result.diagnostics.at(-1)!.violations);
}
```

## `ReelStripDefinition` / `ReelStrip` — the canonical strip

```ts
interface ReelStripDefinition {
    getLength(): number;
    getSymbolAt(position: number): string;   // circular index resolution, like SymbolsSequence.getIndex
    toArray(): string[];
    getSymbolCounts(): Record<string, number>;
}
```

`ReelStrip` is the immutable implementation: its constructor defensively copies the input array (and rejects an
empty one — `getSymbolAt` always returns a real `string`, never `undefined`), and every getter returns a value that
can't be used to mutate internal state.

## `ReelStripGenerator` — the entry point

```ts
constructor(
    strategy: ReelStripGenerationStrategy = new ShuffleReelStripGenerationStrategy(),
    validator: ReelStripConstraintValidator = new CompositeReelStripConstraintValidator(),
    scorer: ReelStripScorer = new ViolationCountReelStripScorer(),
    symbolWeightsConverter: ReelStripSymbolWeightsConverter = new LargestRemainderReelStripSymbolWeightsConverter(),
)
generate(request: ReelStripGenerationRequest): ReelStripGenerationResult
generateFromSymbolWeights(request: ReelStripWeightedGenerationRequest): ReelStripGenerationResult
```

```ts
type ReelStripGenerationRequest = {
    length: number;
    symbolCounts: Record<string, number>;       // must sum to length
    seed?: number;                              // same seed -> same result, deterministically
    lockedPositions?: Record<number, string>;   // fixed/locked positions, honored by construction
    constraints?: ReelStripConstraint[];
    maxAttempts?: number;                       // default 200
    scorer?: ReelStripScorer;                   // overrides the constructor-level scorer for this call
};

type ReelStripGenerationResult = {
    success: boolean;                           // true iff some attempt satisfied every constraint
    strip?: ReelStripDefinition;                // the best candidate found, even when success is false
    attemptsUsed: number;
    diagnostics: ReelStripGenerationDiagnostic[]; // one entry per attempt (or one, if the request itself was malformed)
    symbolWeightsConversion?: ReelStripSymbolWeightsConversionDiagnostic; // present only from generateFromSymbolWeights
};
```

Each attempt asks `strategy` for one candidate strip and checks it in two layers:

1. **Invariants** — `symbolCounts` and `lockedPositions` are re-validated directly against the candidate, independent
   of whichever `validator`/`constraints` are in play. This is not optional and can't be swapped out: even a buggy
   or malicious custom `ReelStripGenerationStrategy` can never produce a `success: true` result whose strip doesn't
   actually match the request's counts and locked positions.
2. **`request.constraints`** — validated via `validator`, exactly as configured.

A candidate that clears both layers is accepted **immediately** as `success: true` — `scorer` is never consulted for
it. `scorer` only ever runs on a candidate that failed something, to decide which invalid candidate is worth keeping
as the closest miss if no attempt fully succeeds within `maxAttempts`; a scorer that (accidentally or not) rates
invalid candidates above valid ones can never turn a real success into a reported failure, because valid candidates
skip scoring entirely.

If every attempt fails, `success` is `false` and `strip` is set to the highest-scoring (least-bad) candidate seen,
for inspection.

Malformed requests (`symbolCounts` not summing to `length`, a locked position out of range or requesting more
copies of a symbol than `symbolCounts` provides, a non-positive `length`/`maxAttempts`) are rejected up front with a
single diagnostic (`attemptsUsed: 0`) — no candidate is ever generated for a request that couldn't possibly succeed
structurally.

### Determinism

Pass `seed` for reproducible output — one seeded RNG (`SeededRandomNumberGenerator`, see
[Reels & Symbol Sequences](reels-and-sequences.md#rngs)) drives every attempt in the call, so the same request
always produces the same sequence of candidates and the same final result. Omit `seed` to use
`PseudorandomNumberGenerator` (`Math.random()`-based) instead.

### `ShuffleReelStripGenerationStrategy` — the default `ReelStripGenerationStrategy`

Builds the exact symbol pool described by `symbolCounts`, seats locked symbols first, then Fisher–Yates-shuffles the
remaining pool into the remaining positions. Exact counts and locked positions therefore hold **by construction**
for every candidate — only constraints beyond that (distance, run length, adjacency, ...) can still fail and trigger
another attempt. Swap in your own `ReelStripGenerationStrategy` to change how candidates are produced without
touching `ReelStripGenerator` itself (Open/Closed: `ReelStripGenerator` never needs to know which strategy it's
driving) — `ReelStripGenerator` re-checks `symbolCounts`/`lockedPositions` regardless of which strategy produced the
candidate (see above), so a custom strategy that gets them wrong fails loudly instead of silently reporting success.

## Generating from weights instead of exact counts

Specifying exact `symbolCounts` up front means doing the weight-to-count arithmetic yourself. `generateFromSymbolWeights`
does it for you: give it proportions (`symbolWeights`), and it converts them into exact `symbolCounts` for the
requested `length`, then generates through **the same `generate()` path** described above — there is no separate
generation codepath for weighted requests, only a conversion step in front of it.

```ts
import {ReelStripGenerator} from "pokie";

const generator = new ReelStripGenerator();

const result = generator.generateFromSymbolWeights({
    length: 32,
    symbolWeights: {W: 2, A: 6, K: 8, Q: 8, J: 8}, // proportions, not exact counts (need not sum to length)
    seed: 12345,
});

if (result.success) {
    result.strip!.toArray();               // the generated strip, exactly as from generate()
    result.symbolWeightsConversion!.counts; // the exact counts the weights resolved to: {W: 2, A: 6, K: 8, Q: 8, J: 8}
}
```

```ts
type ReelStripWeightedGenerationRequest = {
    length: number;
    symbolWeights: Record<string, number>;                             // proportions, need not sum to length or to 100
    roundingPolicy?: ReelStripSymbolWeightsRoundingPolicy;              // default "floor"
    remainderTieBreakPolicy?: ReelStripSymbolWeightsRemainderTieBreakPolicy; // default "symbol-id"
    // ...plus seed / lockedPositions / constraints / maxAttempts / scorer, same as ReelStripGenerationRequest
};
```

### `ReelStripSymbolWeightsConverter` — the explicit weights → counts strategy

```ts
interface ReelStripSymbolWeightsConverter {
    convert(request: ReelStripSymbolWeightsConversionRequest): ReelStripSymbolWeightsConversionResult;
}
```

The default, `LargestRemainderReelStripSymbolWeightsConverter`, implements the **Largest Remainder Method** (a.k.a.
Hare-quota apportionment — the same family of algorithm used for proportional seat allocation):

1. Each symbol's exact quota is `weight / totalWeight * length` (a real number).
2. `roundingPolicy` turns each quota into an initial integer count:
   - `"floor"` (default) — never overshoots `length` on its own, so step 3 only ever *adds* units.
   - `"round"` — nearest integer; may overshoot or undershoot.
   - `"ceil"` — always overshoots unless every quota is already an integer; step 3 only ever *removes* units.
3. The gap between the sum of those initial counts and `length` (the "remainder") is corrected one unit at a time,
   always picking the symbol(s) whose quota was least well served by the initial rounding (largest fractional
   remainder gets the next `+1`; smallest gets the next `-1`).
4. Ties in step 3 are broken deterministically per `remainderTieBreakPolicy`. Each policy defines a single priority
   order — the higher-priority symbol is the one more "deserving" of representation:
   - `"symbol-id"` (default) — ascending symbol ID is higher priority, independent of declaration order.
   - `"declared-order"` — earlier appearance in `symbolWeights` is higher priority.
   - `"largest-weight-first"` — the heavier original weight is higher priority; falls back to `"symbol-id"` if
     weights also tie.

   **The same priority order governs both directions, symmetrically**: when *adding* a unit (`remainder > 0`), the
   highest-priority tied symbol receives it first. When *removing* a unit (`remainder < 0`, i.e. `roundingPolicy`
   overshot `length`), the priority order is reversed — the **lowest**-priority tied symbol loses a unit first, and
   the highest-priority symbol is protected. A policy never both "receives extra copies first" and "loses copies
   first"; if `"largest-weight-first"` favors the heavier symbol when adding, it also protects that same heavier
   symbol from losing a count when removing.

The same `symbolWeights`, `length`, and policies always produce the same `symbolCounts` — swap in your own
`ReelStripSymbolWeightsConverter` (the generator's 4th constructor argument) for a different apportionment algorithm
without touching `ReelStripGenerator` itself (Open/Closed, same as the other three collaborators).

### Diagnostics: weights, counts, and proportion deviation

```ts
type ReelStripSymbolWeightsConversionDiagnostic = {
    weights: Record<string, number>;            // the original input weights, unchanged
    counts: Record<string, number>;              // the resolved exact counts (includes 0-count symbols)
    targetProportions: Record<string, number>;   // weight / totalWeight, the ideal proportion
    actualProportions: Record<string, number>;   // count / length, what was actually achievable
    deviations: Record<string, number>;          // actualProportion - targetProportion, per symbol
};
```

```ts
import {LargestRemainderReelStripSymbolWeightsConverter} from "pokie";

const converter = new LargestRemainderReelStripSymbolWeightsConverter();
const conversion = converter.convert({length: 10, symbolWeights: {A: 1, B: 1, C: 1}});

conversion.symbolCounts;              // {A: 4, B: 3, C: 3} -- 10/3 doesn't divide evenly
conversion.diagnostic!.deviations;    // {A: 0.0667, B: -0.0333, C: -0.0333} -- A got the rounding-up
```

`result.symbolWeightsConversion` on `ReelStripGenerationResult` is this same diagnostic, so you don't need to call
the converter yourself unless you want the counts *before* generation.

### Validation

Rejected up front, mirroring `generate()`'s own malformed-request handling (`success: false`, no candidate/counts ever
computed):

- A non-positive/non-integer `length`.
- An empty `symbolWeights`.
- Any weight that is zero, negative, `NaN`, or `Infinity` (weights must be positive finite numbers — to exclude a
  symbol entirely, omit it from `symbolWeights` rather than giving it a weight of `0`).
- **The sum of all weights**, even if every individual weight is finite — two `Number.MAX_VALUE` weights, for
  example, are each individually valid but overflow to `Infinity` once summed, which would otherwise silently corrupt
  every quota (`weight / totalWeight * length`). The sum must be finite and positive.
- **An unrecognized `roundingPolicy` or `remainderTieBreakPolicy` string.** TypeScript callers can't construct one of
  these outside the literal union, but anything crossing a JS/JSON/`any`-typed boundary can — an unknown value is
  rejected with a violation rather than silently falling back to `"floor"`/`"symbol-id"`.

## Constraints (`ReelStripConstraint`)

```ts
interface ReelStripConstraint {
    getId(): string;
    validate(strip: ReelStripDefinition): ReelStripConstraintViolation[];
}
```

Built-in constraints, all under `constraints/` in the package. None of them touch generation or the runtime spin
path — they only ever read a `ReelStripDefinition` and report violations, whether that strip came from
`ReelStripGenerator` or was hand-authored:

| Constraint | Checks |
|---|---|
| `ExactSymbolCountsConstraint(expectedCounts)` | Every symbol's occurrence count matches exactly (a symbol present on the strip but absent from `expectedCounts` is expected to occur 0 times) |
| `MinimumCircularDistanceConstraint(minimumDistance, symbolIds?, wrapAround = true)` | The gap between every symbol occurrence and the *next* occurrence of that same symbol, going around the strip, is at least `minimumDistance` |
| `MaximumCircularDistanceConstraint(maximumDistance, symbolIds?, wrapAround = true)` | The gap between every symbol occurrence and the *next* occurrence of that same symbol, going around the strip, is at most `maximumDistance` — e.g. a scatter that must not go too long without reappearing. The mirror image of `MinimumCircularDistanceConstraint`; a symbol occurring 0 or 1 times has no gap to measure and is never flagged |
| `MaximumConsecutiveOccurrencesConstraint(maximumConsecutive, symbolIds?, wrapAround = true)` | No run of identical adjacent symbols exceeds `maximumConsecutive` |
| `ForbiddenAdjacencyConstraint(pairs, wrapAround = true, directed = false)` | No adjacent pair of positions holds two symbols from the same forbidden pair |
| `RequiredAdjacencyConstraint(pairs, directed = false, wrapAround = true)` | Every occurrence of a "subject" symbol has one of its required neighbor(s) actually adjacent to it |
| `FixedPositionsConstraint(lockedPositions)` | Specific positions hold specific symbols — useful for validating a hand-authored strip outside `ReelStripGenerator`, which already enforces `request.lockedPositions` as a built-in invariant |

**Both circular-distance constraints check consecutive occurrences only** — the arcs that partition the circle
between one occurrence and the next — never the distance between arbitrary, non-consecutive occurrence pairs. With
occurrences at positions 0, 5, and 9 on a 10-long strip, only the 0→5, 5→9, and 9→0 arcs are ever measured; there is
no direct "0 to 9" check that skips over the occurrence at 5. For a *minimum*, that happens to be equivalent to
checking every possible pair (the closest pair is always a consecutive one) — but for a *maximum* it is not, so
`MaximumCircularDistanceConstraint` would give a different (and wrong) answer if it checked all pairs instead.

`symbolIds` (where present) restricts the check to a subset of symbols, defaulting to every symbol on the strip. The
two adjacency constraints have no separate `symbolIds` parameter — their `pairs` argument already determines exactly
which symbols get inspected (a symbol that never appears as a pair member is never looked at).

`wrapAround` (where present) controls whether the strip's last and first positions are treated as adjacent/circular
(the default, matching a physical reel strip) or purely linear — e.g. whether the arc from the last occurrence back
to the first counts for the circular-distance constraints, or whether the last/first symbols count as neighbors for
`ForbiddenAdjacencyConstraint`/`RequiredAdjacencyConstraint`.

**Fail-fast constructor validation:** `minimumDistance`, `maximumDistance`, and `maximumConsecutive` must each be a
positive, finite integer — `NaN`, `Infinity`, `0`, negative, and fractional values all throw immediately from the
constructor instead of being silently accepted as a nonsensical bound.

### Directed vs. undirected adjacency

Both adjacency constraints default to **undirected**: a pair `[A, B]` matches regardless of which side `A` or `B`
lands on. Pass `directed = true` to make order matter:

- **`ForbiddenAdjacencyConstraint(pairs, wrapAround, directed = true)`** — `[A, B]` only forbids `A` immediately
  followed by `B`; `B` followed by `A` is unaffected (list both pairs explicitly to forbid both orders).
- **`RequiredAdjacencyConstraint(pairs, directed = true, wrapAround)`** — `[subject, requiredNeighbor]` only counts
  the *next* position; the subject's previous neighbor is not considered at all, even if it happens to match.

```ts
import {ReelStrip, RequiredAdjacencyConstraint} from "pokie";

// Every "W" must have an "M" or an "X" next to it, in either direction (undirected, the default).
const flanked = new RequiredAdjacencyConstraint([
    ["W", "M"],
    ["W", "X"],
]);
flanked.validate(new ReelStrip(["M", "W", "A"])); // [] -- "M" is on the left, that's enough

// Every "W" must be *immediately followed by* an "M" specifically.
const followedByM = new RequiredAdjacencyConstraint([["W", "M"]], true);
followedByM.validate(new ReelStrip(["M", "W", "A"])); // one violation -- "W" is followed by "A", not "M"
```

Multiple `requiredPairs` entries sharing the same subject accumulate into a set of acceptable neighbors for that
subject (an "OR": any one of them satisfies that occurrence), rather than requiring all of them simultaneously.

Each violation is a plain, inspectable object:

```ts
type ReelStripConstraintViolation = {
    constraintId: string;
    message: string;             // human-readable explanation
    positions?: number[];        // the offending position(s), if applicable
    details?: Record<string, unknown>;
};
```

Writing a custom constraint means implementing `ReelStripConstraint` — `ReelStripGenerator` and
`CompositeReelStripConstraintValidator` (the default `ReelStripConstraintValidator`) never need to change to support
it.

## Scoring (`ReelStripScorer`)

```ts
interface ReelStripScorer {
    score(strip: ReelStripDefinition, violations: ReelStripConstraintViolation[]): number;
}
```

The default, `ViolationCountReelStripScorer`, scores `-violations.length` — higher is better, `0` (no violations) is
the best possible score, though a fully valid candidate is returned immediately without ever calling `scorer` (see
above) — in practice `scorer` only ever compares invalid candidates against each other. Supply your own
`ReelStripScorer` (via the constructor or per-call `request.scorer`) to prefer one imperfect candidate over another
when nothing fully satisfies every constraint within `maxAttempts` — for example, weighting some constraints as more
important than others.

## `ReelStripAnalyzer` — inspecting any strip

A static-methods-only utility (never instantiated, mirrors `SymbolsCombinationsAnalyzer`'s style) for analyzing
**any** `ReelStripDefinition` — generated or hand-authored:

```ts
static analyze(strip: ReelStripDefinition): ReelStripAnalysis
```

```ts
type ReelStripAnalysis = {
    length: number;
    symbolCounts: Record<string, number>;
    symbolFrequencies: Record<string, number>;              // count / length, per symbol
    minimumCircularDistances: Record<string, number>;       // per symbol with 2+ occurrences
    maximumCircularDistances: Record<string, number>;       // per symbol with 2+ occurrences
    maximumConsecutiveOccurrences: Record<string, number>;  // per symbol, longest run (wrap-aware)
};
```

```ts
import {ReelStrip, ReelStripAnalyzer} from "pokie";

const analysis = ReelStripAnalyzer.analyze(new ReelStrip(["A", "A", "B", "A", "C"]));
analysis.symbolCounts;                 // {A: 3, B: 1, C: 1}
analysis.symbolFrequencies;            // {A: 0.6, B: 0.2, C: 0.2}
analysis.minimumCircularDistances;     // {A: 1} -- B/C occur once, so no distance applies
analysis.maximumCircularDistances;     // {A: 2} -- B/C occur once, so no distance applies
analysis.maximumConsecutiveOccurrences; // {A: 2, B: 1, C: 1}
```

Both `minimumCircularDistances` and `maximumCircularDistances` measure the same underlying gaps between consecutive
occurrences of a symbol (going around the circle) — they only differ in whether the smallest or largest of those
gaps is reported. A symbol occurring 0 or 1 times has no gap to measure and is omitted from both — matching exactly
how `MinimumCircularDistanceConstraint`/`MaximumCircularDistanceConstraint` treat that same symbol.
