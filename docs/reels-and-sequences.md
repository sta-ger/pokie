[← Back to docs index](README.md)

# Reels & Symbol Sequences

## `SymbolsSequence` — one reel's full strip

A `SymbolsSequence` (implements `SymbolsSequenceRepresenting = SymbolsSequenceDescribing & SymbolsSequenceModifying`)
is a mutable, **circular** list of symbol IDs representing everything printed on one physical reel strip — not just
the visible window.

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

## `SymbolsCombinationsGenerator` — spinning the reels

```ts
constructor(config: VideoSlotConfigDescribing, rng: RandomNumberGenerating = new PseudorandomNumberGenerator())
generateSymbolsCombination(): SymbolsCombinationDescribing
```

For each reel, it draws a random start position anywhere on that reel's `SymbolsSequence`
(`rng.getRandomInt(0, sequence.getSize())`) and reads `reelsSymbolsNumber` consecutive symbols from there, wrapping
around the strip's end via `SymbolsSequence.getIndex` if needed — simulating "spin the physical strip, stop at a
random position, read the visible window."

### RNGs

```ts
interface RandomNumberGenerating { getRandomInt(min: number, max: number): number; } // [min, max)
```

- **`PseudorandomNumberGenerator`** (the default) — `Math.random()`-based, not cryptographically secure.
- **`SecureRandomNumberGenerator`** — uses Node's `crypto.randomInt`. Not used anywhere by default; opt in for
  real-money/regulated gameplay by passing it explicitly:

  ```ts
  import {SymbolsCombinationsGenerator, SecureRandomNumberGenerator} from "pokie";

  const generator = new SymbolsCombinationsGenerator(config, new SecureRandomNumberGenerator());
  ```

## `SymbolsCombinationsAnalyzer` — static analysis utilities

Unlike everything else in this subsystem, this is a static-methods-only utility class with no paired interface (it's
never instantiated). It's the engine behind both win calculation
([Paytable & Win Calculation](paytable-and-wins.md)) and exhaustive math analysis
([Modeling Slot Math with POKIE](math-modeling.md)):

```ts
static getSymbolsForDefinition(symbols: string[][], definition: number[]): string[]
static getSymbolsMatchingPattern(symbols: string[], pattern: number[]): string[]
static isMatchPattern(symbols: string[], pattern: number[], wildSymbols?: string[]): boolean
static getWinningSymbolId(symbols: string[], pattern: number[], wildSymbols?: string[]): string | null
static getMatchingPattern(symbols: string[], patterns: number[][], wildSymbols?: string[]): number[] | null
static getWildSymbolsPositions(symbols: string[], pattern: number[], wildSymbols: string[]): number[]
static getScatterSymbolsPositions(symbols: string[][], scatterSymbolId: string): number[][]
static getWinningLinesIds(symbols: string[][], linesDefinitions: LinesDefinitionsDescribing, patterns: number[][], wildSymbols?: string[]): string[]
static getAllPossibleSymbolsCombinations(sequences: SymbolsSequenceDescribing[], symbolsNumber: number): string[][][]
```

`getAllPossibleSymbolsCombinations` exhaustively enumerates **every** stop-position combination across all reels —
the total is the product of every reel's sequence size (5 reels × 50-symbol strips ≈ 312.5M combinations). It's
meant for exact, brute-force RTP calculation over reasonably small strip sizes; keep reel-strip lengths modest when
using it, or expect long runtimes and heavy memory use.
