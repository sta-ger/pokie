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

**Scatter symbols use the exact same bet→symbol→count map as line symbols** — there's no separate data shape for
them. The special "count anywhere on the grid, not along a line" semantics live entirely in
`VideoSlotWinCalculator`, not in `Paytable` itself.

## `VideoSlotWinCalculator`

```ts
constructor(conf: VideoSlotConfigDescribing)
calculateWin(bet: number, symbolsCombination: SymbolsCombinationDescribing): void
getWinningLines(): Record<string, WinningLineDescribing>
getWinningScatters(): Record<string, WinningScatterDescribing>
getLinesWinning(): number     // sum of all winning lines' amounts
getScattersWinning(): number  // sum of all winning scatters' amounts
getWinAmount(): number        // getLinesWinning() + getScattersWinning()
```

`calculateWin(bet, combination)`:

1. **Throws** `Bet ${bet} is not specified at paytable` if `bet` isn't in `config.getAvailableBets()`. (Note the
   asymmetry: `Paytable.getWinAmountForSymbol` itself never throws — it defaults to `0` for anything unknown. Only
   the calculator's entry point validates the bet.)
2. Finds every winning line id via
   `SymbolsCombinationsAnalyzer.getWinningLinesIds(matrix, linesDefinitions, patterns, wildSymbols)`.
3. For each, builds a `WinningLine`: extracts the line's symbols
   (`getSymbolsForDefinition`), finds the matching pattern (`getMatchingPattern` — since pattern arrays are built
   longest-first, this always resolves to the **longest** matching run, never a shorter subset), resolves the
   winning symbol (ignoring wilds) and looks up its payout.
4. **Filters the result:** a line is only kept if its symbol is **not** a configured scatter symbol, and its
   `winAmount > 0`. So a contiguous run of scatters along a payline never becomes a "line win", and a match whose
   paytable lookup resolves to `0` (e.g. a 2-symbol match under the default 3..reelsNumber paytable) is silently
   dropped rather than surfaced as a zero-value win.
5. Independently, for each configured scatter symbol, scans the **entire grid** (not any particular line) for every
   occurrence (`getScatterSymbolsPositions`) and creates a `WinningScatter` if the paytable payout for that count is
   `> 0`.

### Result objects

```ts
interface WinningLineDescribing extends WinAmountDetermining {
    getDefinition(): number[];
    getPattern(): number[];
    getSymbolId(): string;
    getLineId(): string;
    getSymbolsPositions(): number[];
    getWildSymbolsPositions(): number[];
}
interface WinningScatterDescribing extends WinAmountDetermining {
    getSymbolId(): string;
    getSymbolsPositions(): number[][]; // [reel, row] pairs, anywhere on the grid
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

### `WinAmountDetermining` / `NoWinAmount`

```ts
interface WinAmountDetermining { getWinAmount(): number; }
class NoWinAmount implements WinAmountDetermining { getWinAmount(): number { return 0; } }
```

The generic contract the base `GameSession` depends on — it knows nothing about paylines or scatters, just "how much
did this round win." `NoWinAmount` is the null-object default before a slot-specific calculator is wired in.

## Rules worth knowing before you tune a paytable

1. **Wild-only runs never win.** Matching requires at least one non-wild symbol remaining after wilds are stripped;
   an all-wild payline produces zero winning lines.
2. **Scatters never form line wins**, even if they line up contiguously on a configured payline — they're explicitly
   excluded from the line-win pass.
3. **Scatters can stack per reel.** `getScatterSymbolsPositions` scans every reel/row with no "one per reel"
   restriction (contrast this with `VideoSlotConfig`'s default reel generation, which *does* avoid stacking scatters
   — see [Reels & Symbol Sequences](reels-and-sequences.md) — that's a reel-strip design choice, not a rule enforced
   by the win calculator).
4. **There is only one `bet` value** per round, used for both line-win and scatter-win lookups — there's no
   per-line bet-splitting model.
5. **Total win is a plain sum** of every winning line and scatter — no "highest win only" exclusivity.
6. **Effective minimum-to-win depends on two independently configured things**: the line pattern's
   `minimumWinningSymbols` (default 2) *and* which counts the paytable actually has non-zero payouts for (default
   constructor only fills 3..reelsNumber). Changing one without the other silently changes what pays.
