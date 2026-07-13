[← Back to docs index](README.md)

# Reels & Symbol Sequences

> Looking to *generate* a reel strip's symbol sequence under constraints (exact counts, minimum distance, max run
> length, forbidden adjacency, locked positions) rather than spin an existing one? See
> [Reel Strip Generation](reel-strip-generation.md) — a design-time tool, separate from everything below.

## `SymbolsSequence` — one reel's full strip

A `SymbolsSequence` (implements `SymbolsSequenceRepresenting = SymbolsSequenceDescribing & SymbolsSequenceModifying`)
is a mutable, **circular** list of symbol IDs representing everything printed on one physical reel strip — not just
the visible window.

`SymbolsSequence`, like every symbol-facing class in this subsystem, is generic over
`T extends string | number | symbol = string` — the signatures below use the default `string` for readability (see
[Game Session & Configuration](game-session.md#symbol-ids-are-generic) for using `SymbolsSequence<number>` or a
string-literal union instead).

```ts
// building
fromArray(symbols: string[]): this
fromNumberOfEachSymbol(availableSymbols: string[], symbolsNumber: number): this   // N copies of each symbol
fromNumbersOfSymbols(symbolsNumbers: Record<string, number>): this                // explicit count per symbol
fromSymbolsWeights(weights: Record<string, number>, sequenceLength = 50): this     // percentages, must sum to 100

// editing
addSymbol(symbolId: string, stackSize = 1, index?: number): this   // splice in, or append if index omitted/OOB
addSymbols(symbolsIds: string[], index?: number): this
setSymbol(index: number, symbolId: string): this
setSymbols(index: number, symbols: string[]): this
removeSymbol(index: number): this
removeAllSymbols(symbolId: string): this
shuffle(): this                                                    // in-place Fisher–Yates, uses Math.random()

// reading
getSymbol(index: number): string
getSymbols(index: number, symbolsNumber: number): string[]
getSize(): number
getNumberOfSymbols(symbolId: string): number
getSymbolWeight(symbolId: string): number                          // as a PERCENTAGE, not a 0–1 fraction
getSymbolsWeights(): Record<string, number>
getSymbolsIndexes(symbolsIds: string[]): number[]
getSymbolsStacksIndexes(): {index: number; size: number}[]          // runs of 2+ identical adjacent symbols
getIndex(index: number): number                                    // circular index resolution
toArray(): string[]
```

```ts
import {SymbolsSequence} from "pokie";

const reel = new SymbolsSequence();
reel.fromNumberOfEachSymbol(["A", "K", "Q"], 2); // ["A","A","K","K","Q","Q"]
reel.getSymbolWeight("A");        // 33.33... (percent)
reel.getSymbolsStacksIndexes();  // [{index: 0, size: 2}, {index: 2, size: 2}, {index: 4, size: 2}]

reel.getSymbol(6);        // wraps around — same as getSymbol(0)
reel.getSymbols(5, 2);    // reads across the wrap point, e.g. ["Q", "A"]
```

### Gotchas

- **The three `from*` methods fully replace the sequence's contents** — despite reading like incremental builders,
  they are not additive. Use `addSymbol`/`addSymbols` to append.
- **`removeSymbol(index)` does not wrap** via `getIndex()` like every other index-based method does — a negative or
  out-of-range index is a silent no-op rather than wrapping or throwing.
- **`fromSymbolsWeights` throws a raw string** (not an `Error` instance) if the weights don't sum to exactly 100 —
  don't rely on `instanceof Error` in a `catch`.
- **`shuffle()` always uses `Math.random()`** directly — it is not affected by swapping in a different
  `RandomNumberGenerating` implementation (that injection point only affects spin generation, see below).

## `SymbolsCombination` — one spin's result grid

Implements `SymbolsCombinationDescribing` (`ConvertableToMatrix` + `BuildableFromMatrix`):

```ts
getSymbols(reelId: number): string[]
fromMatrix(value: string[][], transposed?: boolean): this
toMatrix(transposed?: boolean): string[][]
```

Stored internally as `combination[reelId][rowIndex]`. Pass `transposed = true` to `fromMatrix`/`toMatrix` if your
data is laid out row-major (`[row][reel]`) instead — both directions deep-clone via
`JSON.parse(JSON.stringify(...))`, so the stored/returned matrices are always decoupled from caller-owned arrays.
Reels don't need to be the same length — a jagged `T[][]` (see `VariableHeightSymbolsCombinationsGenerator` below)
round-trips through `fromMatrix`/`toMatrix` unchanged.

## Combination generators — spinning the reels

Three interchangeable implementations of `SymbolsCombinationsGenerating<T>`, injected as `VideoSlotSession`'s 2nd
constructor argument. Pick the one that matches how your game's grid shape behaves.

```ts
interface SymbolsCombinationsGenerating<T> {
    generateSymbolsCombination(): SymbolsCombinationDescribing<T>;
    getLastStopPositions?(): number[];
}
```

### `SymbolsCombinationsGenerator` — fixed height (the default)

```ts
constructor(config: VideoSlotConfigDescribing, rng: RandomNumberGenerating = new PseudorandomNumberGenerator())
generateSymbolsCombination(): SymbolsCombinationDescribing
getLastStopPositions(): number[]
```

For each reel, draws a random start position anywhere on that reel's `SymbolsSequence`
(`rng.getRandomInt(0, sequence.getSize())`) and reads `config.getReelsSymbolsNumber()` consecutive symbols from
there, wrapping around the strip's end via `SymbolsSequence.getIndex` if needed. `getLastStopPositions()` returns
the per-reel stop position used to produce the most recently generated combination, e.g. for logging/auditing
exactly how a round's outcome was produced or reconstructing it later.

### `VariableHeightSymbolsCombinationsGenerator` — a random height every round

For games where each reel's visible symbol count is itself randomly redrawn every round, from its own weighted
distribution:

```ts
constructor(
    config: VideoSlotConfigDescribing,
    reelsHeightWeights: SymbolsSequenceDescribing<number>[],   // one weighted height-pool per reel
    rng: RandomNumberGenerating = new PseudorandomNumberGenerator(),
)
generateSymbolsCombination(): SymbolsCombinationDescribing
getLastStopPositions(): number[]
getLastReelsHeights(): number[]   // heights actually drawn for the most recent combination
```

`reelsHeightWeights[reelId]` is an ordinary `SymbolsSequenceDescribing<number>` — reuse the same weighted-pool
primitive as symbol strips, just with heights as the "symbols":

```ts
import {SymbolsSequence, VariableHeightSymbolsCombinationsGenerator, VideoSlotSession} from "pokie";

const reelsHeightWeights = [
    new SymbolsSequence<number>().fromNumbersOfSymbols({3: 70, 4: 20, 5: 10}), // reel 0: mostly 3 rows
    new SymbolsSequence<number>().fromNumbersOfSymbols({3: 70, 4: 20, 5: 10}),
    new SymbolsSequence<number>().fromNumbersOfSymbols({3: 70, 4: 20, 5: 10}),
];
const generator = new VariableHeightSymbolsCombinationsGenerator(config, reelsHeightWeights);
const session = new VideoSlotSession(config, generator);
```

The resulting grid is legitimately jagged (`T[][]` with different-length reels); the grid-transform/win-shape
helpers below (`getWaysForSymbol`, `getSymbolsClusters`, `collapseAndRefillSymbols`, `overlaySymbols`) already
operate per-reel-length rather than assuming a uniform height, so nothing else needs to change to support this.

### `ResizableSymbolsCombinationsGenerator` — an explicit, persistent height you control

For games where the grid's shape isn't redrawn randomly every round but is instead explicit, persistent state that
something external sets between rounds (e.g. a feature that grows or shrinks the grid based on round outcomes — see
[Resizable Grid](resizable-grid.md)):

```ts
constructor(
    config: VideoSlotConfigDescribing,
    initialReelsHeights: number[],
    rng: RandomNumberGenerating = new PseudorandomNumberGenerator(),
)
generateSymbolsCombination(): SymbolsCombinationDescribing
getLastStopPositions(): number[]
getReelsHeights(): number[]
setReelsHeights(reelsHeights: number[]): void
```

Draws exactly `reelsHeights[reelId]` symbols per reel, same as the fixed generator but per-reel and mutable instead
of one shared `config.getReelsSymbolsNumber()`. `getReelsHeights`/`setReelsHeights` aren't part of
`SymbolsCombinationsGenerating` — callers already hold this concrete type, since they had to construct it with
`initialReelsHeights` themselves.

### RNGs

```ts
interface RandomNumberGenerating { getRandomInt(min: number, max: number): number; } // [min, max)
```

- **`PseudorandomNumberGenerator`** (the default) — `Math.random()`-based, not cryptographically secure. **Don't use
  this for real-money/regulated games** — see the warning in [Getting Started](getting-started.md).
- **`SecureRandomNumberGenerator`** — uses Node's `crypto.randomInt` for a stronger, production-like entropy source
  than the default. Not used anywhere by default; opt in by passing it explicitly. It's a building block, not a
  certification — real-money/regulated games still need independent RNG certification and compliance sign-off
  outside POKIE:

  ```ts
  import {SymbolsCombinationsGenerator, SecureRandomNumberGenerator} from "pokie";

  const generator = new SymbolsCombinationsGenerator(config, new SecureRandomNumberGenerator());
  ```
- **`SeededRandomNumberGenerator(seed)`** — a deterministic PRNG (mulberry32): the same seed always produces the
  same sequence of draws. Not cryptographically secure, so not a substitute for `SecureRandomNumberGenerator` in
  production — but useful for reproducible tests, replaying a specific round, or demo/practice modes that need
  consistent outcomes:

  ```ts
  import {SymbolsCombinationsGenerator, SeededRandomNumberGenerator} from "pokie";

  const generator = new SymbolsCombinationsGenerator(config, new SeededRandomNumberGenerator(12345));
  generator.generateSymbolsCombination(); // always the same combination for a given config + seed
  ```

## `SymbolsCombinationsAnalyzer` — static analysis utilities

A static-methods-only utility class, never instantiated. It's the engine behind win calculation
([Paytable & Win Calculation](paytable-and-wins.md)) and exhaustive math analysis
([Modeling Slot Math with POKIE](math-modeling.md)), and also exposes standalone grid-transform helpers for building
your own mechanics (cascades, expanding/sticky wilds, mystery symbols).

### Matching and win-shape analysis

```ts
static getSymbolsForDefinition(symbols: string[][], definition: number[]): string[]
static getSymbolsMatchingPattern(symbols: string[], pattern: number[]): string[]
static isMatchPattern(symbols: string[], pattern: number[], wildSymbols?: string[], wildSubstitutions?: Partial<Record<string, string[]>>): boolean
static getWinningSymbolId(symbols: string[], pattern: number[], wildSymbols?: string[]): string | null
static getMatchingPattern(symbols: string[], patterns: number[][], wildSymbols?: string[], wildSubstitutions?: Partial<Record<string, string[]>>): number[] | null
static getWildSymbolsPositions(symbols: string[], pattern: number[], wildSymbols: string[]): number[]
static getLineSymbolsGridPositions(definition: number[], symbolsPositions: number[]): number[][]
static getScatterSymbolsPositions(symbols: string[][], scatterSymbolId: string): number[][]
static getSymbolsClusters(symbols: string[][], minimumClusterSize: number, wildSymbols?: string[], wildSubstitutions?: Partial<Record<string, string[]>>): {symbolId: string; positions: number[][]}[]
static getWaysForSymbol(symbols: string[][], symbolId: string, wildSymbols?: string[], wildSubstitutions?: Partial<Record<string, string[]>>): {reelsMatched: number; waysCount: number; positions: number[][]}
static getWinningLinesIds(symbols: string[][], linesDefinitions: LinesDefinitionsDescribing, patterns: number[][], wildSymbols?: string[], wildSubstitutions?: Partial<Record<string, string[]>>): string[]
static getSymbolsCount(symbols: string[][], symbolId: string): number
static getSymbolsFrequency(symbols: string[][]): Record<string, number>
static getPositionsMultiplier(symbols: string[][], positions: number[][], multiplierValues: Partial<Record<string, number>>, combine?: (acc: number, next: number) => number, identity?: number): number
```

- `getSymbolsClusters` groups orthogonally-adjacent same-symbol cells (4-directional flood fill), for cluster-pay
  win styles — see `ClusterWinCalculator` in [Paytable & Win Calculation](paytable-and-wins.md#cluster-pays).
- `getWaysForSymbol` counts, for one symbol, how many matching (or wild-substitutable) cells sit in reel 0, reel 1,
  and so on, stopping at the first reel with zero matches — `waysCount` is the product of those per-reel counts
  (243-ways-style evaluation). See `WaysWinCalculator` in
  [Paytable & Win Calculation](paytable-and-wins.md#ways-to-win).
- `getLineSymbolsGridPositions` converts a winning line's own position format (indexes into `definition`) into the
  same `[reelId, rowId]` pairs `getScatterSymbolsPositions`/`getSymbolsClusters` return — useful for feeding a
  line win's positions into `collapseAndRefillSymbols` alongside scatter/cluster/value win positions.
- `getPositionsMultiplier` combines the multiplier values carried by whichever of `positions` land on a symbol
  present in `multiplierValues` (e.g. multiplier wilds sitting inside a winning line/cluster) — positions on
  symbols absent from `multiplierValues` are skipped rather than resetting the accumulator. Defaults to multiplying
  (`identity = 1`); pass a summing `combine` with `identity = 0` for games that add multiplier wilds together
  instead. This is distinct from `ValueWinCalculator`, which pays its own independent win rather than scaling
  someone else's.
- `getSymbolsCount`/`getSymbolsFrequency` scan the whole grid (all reels/rows) — useful for quick analysis of a
  combination without wiring up scatter config or a payline (e.g. "how many wilds landed this spin").
- `isMatchPattern`/`getMatchingPattern`/`getWinningLinesIds`/`getSymbolsClusters`/`getWaysForSymbol` all accept an
  optional trailing `wildSubstitutions` map restricting which target symbols a given wild is allowed to complete a
  match for (a wild absent from the map keeps substituting for anything, the default). See
  [Paytable & Win Calculation](paytable-and-wins.md#per-symbol-wild-substitution) for the full explanation and an
  example wired through `VideoSlotConfig`.

### Grid transforms

Pure functions — no RNG, no mutation of the input — for building cascade/expanding-wild/sticky-wild/mystery-symbol
style mechanics on top of a generated combination. These are grid primitives, not by themselves a full runtime loop:

```ts
static collapseAndRefillSymbols(symbols: string[][], positionsToRemove: number[][], refillSymbolsPerReel: string[][]): string[][]
static overlaySymbols(symbols: string[][], overrides: {position: number[]; symbolId: string}[]): string[][]
```

- **`collapseAndRefillSymbols`** — clears the given positions, lets the remaining symbols in each affected reel fall
  towards the higher row index (row 0 is the top, gravity pulls down), and fills the freed slots at the top from
  `refillSymbolsPerReel` — you decide how those replacement symbols were drawn, this stays RNG-free on purpose.
  Duplicate entries in `positionsToRemove` are safe. Extra refill symbols beyond what a reel needs are ignored;
  providing too few for a reel **throws** (a short reel would silently corrupt the grid otherwise).
- **`overlaySymbols`** — stamps a symbol onto specific cells with no gravity and no removal: expanding wilds
  (override a whole reel), walking/random wilds (override scattered cells before win evaluation), sticky
  wilds/Hold & Win respins (override held positions on a freshly generated grid), mystery-symbol reveal (override
  every placeholder with the resolved symbol). Later entries in `overrides` win ties on the same position.
  Out-of-range positions are ignored rather than throwing.

### Exhaustive enumeration (math modeling)

```ts
static getAllPossibleSymbolsCombinations(sequences: SymbolsSequenceDescribing[], symbolsNumber: number): string[][][]
static getCombinationProbability(sequences: SymbolsSequenceDescribing[]): number
static getUniqueCombinationsWithWeights(combinations: string[][][]): {combination: string[][]; weight: number}[]
static areCombinationsEqual(a: string[][], b: string[][]): boolean
```

`getAllPossibleSymbolsCombinations` exhaustively enumerates **every** stop-position combination across all reels —
the total is the product of every reel's sequence size (5 reels × 50-symbol strips ≈ 312.5M combinations). It's
meant for exact, brute-force RTP calculation over reasonably small strip sizes; keep reel-strip lengths modest when
using it, or expect long runtimes and heavy memory use. Three companion methods make that enumeration more useful in
practice:

- **`getCombinationProbability(sequences)`** — the probability of any *one* specific combination, i.e.
  `1 / product(reel sizes)` (every reel stop is equally likely — see `SymbolsCombinationsGenerator` above). Pairs
  with `getAllPossibleSymbolsCombinations` for a weighted RTP sum without re-deriving the probability by hand.
- **`getUniqueCombinationsWithWeights(combinations)`** — deduplicates identical grids out of an exhaustively
  enumerated set and returns `{combination, weight}` pairs (`weight` = how many stop-position tuples produced that
  grid). Different reel-stop combinations can render the same visible grid (e.g. on strips with repeated adjacent
  symbols); running win calculation once per unique grid × its weight avoids redundant work.
- **`areCombinationsEqual(a, b)`** — deep equality check for two grids, handy for tests/debugging.
