[← Back to docs index](README.md)

# Paytable & Win Calculation

## `Paytable`

Implements `PaytableRepresenting` (`ConvertableToMap`/`BuildableFromMap` + `AvailableBetsDescribing` +
payout describe/set). Internally a triple-nested map: **bet → symbol → count-of-symbols → payout amount** (an
already-computed absolute amount, not a multiplier).

```ts
constructor(availableBets: number[], availableSymbols?: string[], wildSymbols?: string[], reelsNumber?: number)

getWinAmountForSymbol(symbolId: string, numberOfSymbols: number, bet: number): number   // 0 if unknown, never throws
getAvailableSymbolsForBet(bet: number): string[]
getNumbersOfSymbolsForBet(bet: number, symbolId: string): number[]
setPayoutForSymbol(symbolId: string, times: number, betMultiplier: number, bet?: number): void
toMap(): Record<number, Record<string, Record<number, number>>>
fromMap(value): this
```

If `availableSymbols`/`reelsNumber` are passed to the constructor, a default paytable is generated: every symbol
**except** those in `wildSymbols` (wilds never get payout entries — they only substitute, they never pay on their
own) gets counts `3..reelsNumber` filled in as `(count - 2) × bet` — i.e. 3-of-a-kind pays `1×bet`, 4-of-a-kind
`2×bet`, 5-of-a-kind `3×bet`. Counts 1 and 2 are never populated by default.

```ts
setPayoutForSymbol(symbolId, times, betMultiplier, bet?)
```

If `bet` is omitted, it updates that `times`-count payout for `symbolId` across **every currently known bet level**,
scaled by each — the cheap way to define "3 of a kind pays 5× bet" once for every stake. Pass `bet` to override just
one stake level.

**Scatters, clusters, and ways all reuse the exact same bet→symbol→count map** — there's no separate data shape for
them. The special "count anywhere on the grid"/"count adjacent cells"/"count matching reels, scaled by ways" semantics
live entirely in the respective win calculators below, not in `Paytable` itself. `ValueWinCalculator` is the one
exception — it doesn't consult the paytable at all (see [Value pays](#value-pays)).

## `VideoSlotWinCalculator` — the dispatcher

```ts
constructor(
    conf: VideoSlotConfigDescribing,
    lineWinCalculator: LineWinCalculating = new LineWinCalculator(conf),
    scatterWinCalculator: ScatterWinCalculating = new ScatterWinCalculator(conf),
    clusterWinCalculator?: ClusterWinCalculating,   // opt-in, no default instance — see Cluster pays
    valueWinCalculator?: ValueWinCalculating,       // opt-in, no default instance — see Value pays
    waysWinCalculator?: WaysWinCalculating,         // opt-in, no default instance — see Ways to win
)
calculateWin(bet: number, symbolsCombination: SymbolsCombinationDescribing): void
getWinningLines(): Record<string, WinningLineDescribing>
getWinningScatters(): Record<string, WinningScatterDescribing>
getWinningClusters(): Record<string, WinningClusterDescribing>   // {} unless a clusterWinCalculator was injected
getWinningValues(): Record<string, WinningValueDescribing>       // {} unless a valueWinCalculator was injected
getWinningWays(): Record<string, WinningWayDescribing>           // {} unless a waysWinCalculator was injected
getLinesWinning(): number
getScattersWinning(): number
getClustersWinning(): number
getValuesWinning(): number
getWaysWinning(): number
getWinAmount(): number   // canonical total from the current WinEvaluationResult (or legacy fallback)
```

`calculateWin(bet, combination)`:

1. **Throws** `Bet ${bet} is not specified at paytable` if `bet` isn't in `config.getAvailableBets()`. (Note the
   asymmetry: `Paytable.getWinAmountForSymbol` itself never throws — it defaults to `0` for anything unknown. Only
   the calculator's entry point validates the bet.)
2. Builds a unified `WinEvaluationResult` from the configured evaluator pipeline. `getWinAmount()` reads that
   canonical result (or falls back to the legacy calculator amount if no `getWinEvaluationResult()` is implemented).

Constructing `VideoSlotWinCalculator` with only the first argument (or via `VideoSlotSession`'s default) gives you
line + scatter pays only — the classic model. Cluster/value/ways are additive: pass any subset of them to combine
win styles in the same game (e.g. lines + scatters + a value-pay bonus symbol).

Legacy custom win calculators that do **not** implement `getWinEvaluationResult()` are still supported: the session
adapts their legacy `getWinAmount()` into a canonical `WinEvaluationResult` instead of silently paying `0`.

## Line pays

```ts
interface LineWinCalculating<T = string> {
    calculateWinningLines(bet: number, symbolsCombination: SymbolsCombinationDescribing<T>): Record<string, WinningLineDescribing<T>>;
}
```

`LineWinCalculator` (the default `lineWinCalculator`):

1. Finds every winning line id via
   `SymbolsCombinationsAnalyzer.getWinningLinesIds(matrix, linesDefinitions, patterns, wildSymbols, wildSubstitutions)`.
2. For each, builds a `WinningLine`: extracts the line's symbols (`getSymbolsForDefinition`), finds the matching
   pattern (`getMatchingPattern` — since pattern arrays are built longest-first, this always resolves to the
   **longest** matching run, never a shorter subset), resolves the winning symbol (ignoring wilds), and looks up its
   payout.
3. **Filters the result:** a line is only kept if its symbol is **not** a configured scatter symbol, and its
   `winAmount > 0`. So a contiguous run of scatters along a payline never becomes a "line win", and a match whose
   paytable lookup resolves to `0` (e.g. a 2-symbol match under the default 3..reelsNumber paytable) is silently
   dropped rather than surfaced as a zero-value win.

```ts
interface WinningLineDescribing<T = string> extends WinAmountDetermining {
    getDefinition(): number[];
    getPattern(): number[];
    getSymbolId(): T;
    getLineId(): string;
    getSymbolsPositions(): number[];
    getWildSymbolsPositions(): number[];
}
```

### `WinningLinesAnalyzer` — post-processing helpers

Static helpers over an *already computed* array of `WinningLineDescribing`, useful for feature logic (e.g. "all
paying lines share a symbol" bonuses):

```ts
static allLinesHaveSameSymbolId(lines: WinningLineDescribing[]): boolean
static getLinesWithSymbol(lines, symbolsCombination: string[][], symbolId: string): WinningLineDescribing[]       // full line contains symbolId anywhere
static getLinesWithWinningSymbol(lines, symbolId: string): WinningLineDescribing[]                                 // matched/paid symbol equals symbolId
static getLinesWithDifferentWinningSymbols(lines): WinningLineDescribing[]                                         // [] unless ≥2 distinct symbols
```

## Scatter pays

```ts
interface ScatterWinCalculating<T = string> {
    calculateWinningScatters(bet: number, symbolsCombination: SymbolsCombinationDescribing<T>): Record<T, WinningScatterDescribing<T>>;
}
```

`ScatterWinCalculator` (the default `scatterWinCalculator`): for each configured scatter symbol, scans the **entire
grid** (not any particular line, no adjacency requirement) for every occurrence
(`SymbolsCombinationsAnalyzer.getScatterSymbolsPositions`) and creates a `WinningScatter` if the paytable payout for
that count is `> 0`. Scatters can stack per reel — there's no "one per reel" restriction here (contrast this with
`VideoSlotConfig`'s default reel generation, which *does* avoid stacking scatters — see
[Reels & Symbol Sequences](reels-and-sequences.md) — that's a reel-strip design choice, not a rule enforced by the
win calculator).

```ts
interface WinningScatterDescribing<T = string> extends WinAmountDetermining {
    getSymbolId(): T;
    getSymbolsPositions(): number[][]; // [reel, row] pairs, anywhere on the grid
}
```

## Cluster pays

For pay-anywhere-by-adjacency win styles: groups of orthogonally-adjacent same-symbol cells, each paying on its own
regardless of position or line. Distinct from line pays (fixed paylines) and scatter pays (counts a symbol anywhere,
no adjacency requirement).

```ts
interface ClusterWinCalculating<T = string> {
    calculateWinningClusters(bet: number, symbolsCombination: SymbolsCombinationDescribing<T>): Record<string, WinningClusterDescribing<T>>;
}

class ClusterWinCalculator<T = string> implements ClusterWinCalculating<T> {
    constructor(config: VideoSlotConfigDescribing<T>, minimumClusterSize = 5);
}

interface WinningClusterDescribing<T = string> extends WinAmountDetermining {
    getSymbolId(): T;
    getSymbolsPositions(): number[][];
}
```

Not injected by default — pass it as `VideoSlotWinCalculator`'s 4th constructor argument to enable cluster pays:

```ts
import {ClusterWinCalculator, VideoSlotConfig, VideoSlotWinCalculator} from "pokie";

const config = new VideoSlotConfig();
const winCalculator = new VideoSlotWinCalculator(
    config,
    undefined,                              // keep default LineWinCalculator
    undefined,                              // keep default ScatterWinCalculator
    new ClusterWinCalculator(config, 5),    // minimum cluster size = 5 cells
    undefined,
    undefined,
    {aggregationPolicy: new SelectedEvaluatorGroupWinAggregationPolicy("cluster")},
);
```

A grid can contain several separate clusters of the same symbol — results are keyed by a generated cluster index,
not by `symbolId` (mirrors how winning lines are keyed by `lineId`, not by symbol). The payout for a cluster of size
`n` is looked up as `paytable.getWinAmountForSymbol(symbolId, n, bet)` — the same triple-nested map lines/scatters
use, just keyed by cluster size instead of line-match count. Respects wild substitution (see below).

## Value pays

For symbols that carry their own bet-multiplier value independently of the paytable — e.g. differently-weighted
variants of the same conceptual symbol, each worth a different amount. Every occurrence on the grid contributes
that value independently: `win = occurrences × value × bet`. There's no count-tiered lookup like lines/clusters/ways
use.

```ts
interface ValueWinCalculating<T = string> {
    calculateWinningValues(bet: number, symbolsCombination: SymbolsCombinationDescribing<T>): Record<T, WinningValueDescribing<T>>;
}

class ValueWinCalculator<T = string> implements ValueWinCalculating<T> {
    constructor(symbolValues: Partial<Record<T, number>>);   // symbolId -> bet multiplier, NOT read from Paytable
}

interface WinningValueDescribing<T = string> extends WinAmountDetermining {
    getSymbolId(): T;
    getSymbolsPositions(): number[][];
}
```

```ts
import {ValueWinCalculator, VideoSlotConfig, VideoSlotWinCalculator} from "pokie";

const config = new VideoSlotConfig();
const winCalculator = new VideoSlotWinCalculator(
    config,
    undefined,
    undefined,
    undefined,
    new ValueWinCalculator({VALUE_5: 5, VALUE_10: 10}),
    undefined,
    {aggregationPolicy: new SelectedEvaluatorGroupWinAggregationPolicy("value")},
);
```

A symbol with a configured value of `0`, or absent from the grid entirely, is skipped — `winningValues` never gets
a zero-amount entry for it.

## Ways to win

Multiplicative "ways" evaluation (243-ways-style): pays `paytable.getWinAmountForSymbol(symbolId, reelsMatched, bet)
× waysCount`, where `waysCount` is the product of how many matching cells sit in each consecutive reel starting
from reel 0 (stops at the first reel with zero matches). Distinct from line pays with `WaysDefinitions` (see
[Paylines & Line Patterns](paylines-and-patterns.md)), which enumerates every fixed row-combination as its own
discrete line — correct but combinatorially wasteful for this style of win, and it never surfaces the ways count
itself.

```ts
interface WaysWinCalculating<T = string> {
    calculateWinningWays(bet: number, symbolsCombination: SymbolsCombinationDescribing<T>): Record<T, WinningWayDescribing<T>>;
}

class WaysWinCalculator<T = string> implements WaysWinCalculating<T> {
    constructor(config: VideoSlotConfigDescribing<T>);
}

interface WinningWayDescribing<T = string> extends WinAmountDetermining {
    getSymbolId(): T;
    getSymbolsPositions(): number[][];
    getWaysCount(): number;
}
```

```ts
import {VideoSlotConfig, VideoSlotWinCalculator, WaysWinCalculator} from "pokie";

const config = new VideoSlotConfig();
const winCalculator = new VideoSlotWinCalculator(
    config,
    undefined,
    undefined,
    undefined,
    undefined,
    new WaysWinCalculator(config),
    {aggregationPolicy: new SelectedEvaluatorGroupWinAggregationPolicy("ways")},
);
```

Wild and scatter symbols are excluded from ways evaluation outright — they never produce a "winning way" entry for
themselves. Respects wild substitution (see below). Note the trailing `undefined` placeholders in the example above:
TypeScript only applies a constructor parameter default when the argument is literally `undefined`, so this is how
you skip earlier optional arguments while still getting their defaults.

## Reading full win results from a session

`VideoSlotSession` now exposes `getWinEvaluationResult()`. That is the preferred API for reports, replay, visual
debug, and mixed-mechanic runtime code:

```ts
const config = new VideoSlotConfig();
const winCalculator = new VideoSlotWinCalculator(config);
const session = new VideoSlotSession(config, undefined, winCalculator);
session.play();

const result = session.getWinEvaluationResult();
result.getTotalWin();
result.getWinComponents();
result.getWinningPositions();
```

The old `getWinningLines()` / `getWinningScatters()` methods remain as compatibility views. Legacy
`getWinningClusters()` / `getWinningValues()` / `getWinningWays()` are still available on `VideoSlotWinCalculator`
itself.

## Multipliers

`MultiplierResolver` is the runtime boundary for symbol-driven multipliers. When configured through
`VideoSlotWinCalculatorOptions`, the applied multiplier breakdown is attached to `WinEvaluationResult`. This is
distinct from `ValueWinCalculator`, which pays its own independent amount rather than scaling another component.

`MultiplierResolver` enforces supported component types at runtime:

- omitted/empty `supportedComponentTypes` means "apply to all component types";
- an explicit `supportedComponentTypes` list means "apply only to those types".

Validation follows the same rule.

## Cascade status

`collapseAndRefillSymbols` and `overlaySymbols` are still low-level grid primitives. A full cascade loop now lives in
`CascadingSpinResolver`, which repeatedly evaluates wins, removes winning positions, collapses/refills the grid, and
stops when no wins remain. Use `CascadeResult` / `CascadeStep` for replay, debug, or reporting.

`CascadingSpinResolver` also supports a max-step guard through `CascadeResolverOptions`:

- `maxCascadeSteps` (default `100`)
- `onMaxCascadeStepsExceeded` (`"throw"` by default, optional `"stop"`)

This prevents infinite cascade loops when a refill provider keeps recreating a winning screen.

## Per-symbol wild substitution

By default every wild in `config.getWildSymbols()` substitutes for any symbol (the classic behavior). To restrict a
specific wild to only some symbols, call `VideoSlotConfig.setWildSubstitutions`:

```ts
const config = new VideoSlotConfig();
config.setWildSubstitutions({W: ["A", "K"]}); // "W" only substitutes for A or K, not Q/J/10/9
```

Every win calculator above (`LineWinCalculator`, `ClusterWinCalculator`, `WaysWinCalculator`; not `ScatterWinCalculator`
or `ValueWinCalculator`, which don't involve substitution) picks this up automatically via
`config.getWildSubstitutions?.()`. A wild with no entry in the map keeps substituting for anything — this is opt-in
per wild, not a global switch.

## `WinAmountDetermining` / `NoWinAmount`

```ts
interface WinAmountDetermining { getWinAmount(): number; }
class NoWinAmount implements WinAmountDetermining { getWinAmount(): number { return 0; } }
```

The generic contract the base `GameSession` depends on — it knows nothing about paylines or scatters, just "how
much did this round win." `NoWinAmount` is the default before a slot-specific calculator is wired in.

## Replacing line/scatter win logic entirely

`LineWinCalculator`/`ScatterWinCalculator` are `VideoSlotWinCalculator`'s default 1st/2nd win-calculator constructor
arguments — replace either one to change how those specific wins are computed, without touching bet validation or
anything else the dispatcher already does correctly:

```ts
import {LineWinCalculating, VideoSlotConfig, VideoSlotWinCalculator} from "pokie";

class CustomLineCalculator implements LineWinCalculating {
    public calculateWinningLines(bet, symbolsCombination) {
        // your own logic
    }
}

const config = new VideoSlotConfig();
const calculator = new VideoSlotWinCalculator(config, new CustomLineCalculator());
```

## Rules worth knowing before you tune a paytable

1. **Wild-only runs never win** (lines/clusters/ways). Matching requires at least one non-wild symbol remaining
   after wilds are stripped; an all-wild payline/cluster/way produces zero wins.
2. **Scatters never form line wins**, even if they line up contiguously on a configured payline — they're explicitly
   excluded from the line-win pass.
3. **There is only one `bet` value** per round, used for every win calculator's paytable lookup — there's no
   per-line/per-cluster bet-splitting model.
4. **Mixed evaluators require explicit policy**. The default pipeline rejects incompatible sets such as lines + ways
   or lines + clusters.
5. **Effective minimum-to-win for lines depends on two independently configured things**: the line pattern's
   `minimumWinningSymbols` (default 2) *and* which counts the paytable actually has non-zero payouts for (default
   constructor only fills 3..reelsNumber). Changing one without the other silently changes what pays.
