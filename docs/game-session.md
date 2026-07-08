[← Back to docs index](README.md)

# Game Session & Configuration

## The generic layer: `GameSession` / `GameSessionConfig`

`GameSessionConfig` (implements `GameSessionConfigRepresenting`) holds the bare essentials any bet-based game needs:

```ts
setAvailableBets(availableBets: number[]): void
getAvailableBets(): number[]
setCreditsAmount(creditsAmount: number): void
getCreditsAmount(): number
setBet(bet: number): void          // no validation — see note below
getBet(): number
isBetAvailable(bet: number): boolean
```

Defaults (no-arg constructor): `availableBets = [1, 2, 3, 4, 5, 10, 20, 30, 40, 50, 100]`, `creditsAmount = 1000`,
`bet = availableBets[0]` (`1`).

> **`GameSessionConfig.setBet` does not validate against `availableBets`.** It's dumb storage. Validation is a
> session-layer responsibility.

`GameSession` (implements `GameSessionHandling`) is the actual play loop:

```ts
constructor(config: GameSessionConfigRepresenting = new GameSessionConfig(), winAmountCalculator: WinAmountDetermining = new NoWinAmount())
getCreditsAmount(): number
setCreditsAmount(creditsAmount: number): void
getWinAmount(): number              // delegates to the injected WinAmountDetermining
getAvailableBets(): number[]
getBet(): number
setBet(bet: number): void           // rejects unavailable bets, falls back to getAvailableBets()[0]
canPlayNextGame(): boolean          // credits >= bet
play(): void                        // if canPlayNextGame(), credits -= bet
```

`GameSessionHandling` intentionally excludes `AvailableBetsSetting`/`AvailableBetDetermining` — a running session can
read available bets but not redefine the set; that stays a config-only responsibility.

## The video-slot layer: `VideoSlotSession` / `VideoSlotConfig`

`VideoSlotSession` composes a `GameSessionHandling`, a `SymbolsCombinationsGenerating`, and a
`VideoSlotWinCalculating` around a `VideoSlotConfigRepresenting` (see [Architecture](architecture.md) for why it's
composition, not inheritance):

```ts
constructor(
    config: VideoSlotConfigRepresenting = new VideoSlotConfig(),
    combinationsGenerator: SymbolsCombinationsGenerating = new SymbolsCombinationsGenerator(config),
    winCalculator: VideoSlotWinCalculating = new VideoSlotWinCalculator(config),
    baseSession: GameSessionHandling = new GameSession(config),
)

play(): void  // places the bet, generates a new combination, calculates win, adds win to credits
getSymbolsCombination(): SymbolsCombinationDescribing
getWinningLines(): Record<string, WinningLineDescribing>
getWinningScatters(): Record<string, WinningScatterDescribing>
getLinesWinning(): number
getScattersWinning(): number
getWinAmount(): number
getPaytable(): PaytableRepresenting
getSymbolsSequences(): SymbolsSequenceDescribing[]
getReelsSymbolsNumber(): number
getReelsNumber(): number
getAvailableSymbols(): string[]
isSymbolWild(symbolId: string): boolean
isSymbolScatter(symbolId: string): boolean
getWildSymbols(): string[]
getScatterSymbols(): string[]
getLinesDefinitions(): LinesDefinitionsDescribing
getLinesPatterns(): LinesPatternsDescribing
// plus the base session surface: getCreditsAmount/setCreditsAmount, getBet/setBet, getAvailableBets, canPlayNextGame
```

`VideoSlotConfig` (implements `VideoSlotConfigRepresenting`) is where the game's shape lives:

```ts
constructor(baseConfig = new GameSessionConfig())

getReelsNumber(): number / setReelsNumber(n: number): void
getReelsSymbolsNumber(): number / setReelsSymbolsNumber(n: number): void   // visible rows per reel
getAvailableSymbols(): string[] / setAvailableSymbols(symbols: string[]): void
getWildSymbols(): string[] / setWildSymbols(symbols: string[]): void
getScatterSymbols(): string[] / setScatterSymbols(symbols: string[]): void
isSymbolWild(symbolId: string): boolean
isSymbolScatter(symbolId: string): boolean
getPaytable(): PaytableRepresenting / setPaytable(p: PaytableRepresenting): void
getLinesDefinitions(): LinesDefinitionsDescribing / setLinesDefinitions(d): void
getLinesPatterns(): LinesPatternsDescribing / setLinesPatterns(p): void
getSymbolsSequences(): SymbolsSequenceDescribing[] / setSymbolsSequences(s): void
// plus GameSessionConfigRepresenting: bet, credits, available bets
```

Defaults (no-arg constructor): 5 reels × 3 rows, `availableSymbols = ["A","K","Q","J","10","9","W","S"]`,
`wilds = ["W"]`, `scatters = ["S"]`, `linesDefinitions = new HorizontalLines(5, 3)`,
`linesPatterns = new LeftToRightLinesPatterns(5)`, and per-reel symbol sequences built automatically (see below).

### Reel sequence auto-generation

```ts
constructor(
    baseConfig = new GameSessionConfig(),
    sequencesGenerator: ReelsSymbolsSequencesGenerating = new ReelsSymbolsSequencesGenerator(),
)
```

`VideoSlotConfig` builds one `SymbolsSequence` per reel by delegating to the injected `ReelsSymbolsSequencesGenerating`.
The default, `ReelsSymbolsSequencesGenerator`: 15 copies of each non-wild/non-scatter symbol, 5 copies of each
wild, 3 copies of each scatter, then shuffles — re-rolling the shuffle until no reel has a scatter symbol as part of
a multi-symbol stack (so scatters land as single symbols on each reel by default). This runs:

- once, in the constructor,
- again whenever `setScatterSymbols(...)` is called,
- again whenever `setAvailableSymbols(...)` is called.

Calling `setSymbolsSequences(...)` yourself overrides whatever was auto-generated — this is how you supply your own,
math-model-tuned reel strips (see [Reels & Symbol Sequences](reels-and-sequences.md) and
[Modeling Slot Math with POKIE](math-modeling.md)). If instead you want a *different generation algorithm* to run
automatically on every `setAvailableSymbols`/`setScatterSymbols` call (e.g. weighted by paytable, or without the
"no scattered stacks" constraint), implement `ReelsSymbolsSequencesGenerating` and pass it as the 2nd constructor
argument instead of replacing the generated sequences after the fact:

```ts
import {ReelsSymbolsSequencesGenerating, SymbolsSequenceDescribing, VideoSlotConfig} from "pokie";

class WeightedReelsGenerator implements ReelsSymbolsSequencesGenerating {
    public generate(reelsNumber: number, availableSymbols: string[], wildSymbols: string[], scatterSymbols: string[]): SymbolsSequenceDescribing[] {
        // your own strip-generation logic
    }
}

const config = new VideoSlotConfig(new GameSessionConfig(), new WeightedReelsGenerator());
```

### Example: a custom 5×3 game

```ts
import {
    VideoSlotConfig, VideoSlotSession, SymbolsSequence,
    LinesDefinitionsFor5x3, LeftToRightLinesPatterns, Paytable,
} from "pokie";

const config = new VideoSlotConfig();
config.setAvailableSymbols(["A", "K", "Q", "J", "10", "W", "S"]);
config.setWildSymbols(["W"]);
config.setScatterSymbols(["S"]);
config.setLinesDefinitions(new LinesDefinitionsFor5x3());
config.setLinesPatterns(new LeftToRightLinesPatterns(5, 2)); // min. 2 symbols from the left to win

const paytable = new Paytable(config.getAvailableBets(), ["A", "K", "Q", "J", "10"], ["W"], 5);
paytable.setPayoutForSymbol("A", 3, 5);  // 3-of-a-kind pays 5x bet, across every available bet
config.setPaytable(paytable);

const session = new VideoSlotSession(config);
session.setBet(10);
session.play();
```

### Symbol IDs are generic

Every class that touches a symbol ID (`VideoSlotConfig`, `VideoSlotSession`, `Paytable`, `SymbolsSequence`,
`SymbolsCombination`, `WinningLine`, `WinningScatter`, the win calculator/analyzer, the free-games layer, the `net/`
serializers, and `PlayUntilSymbolWinStrategy`) is generic over a type parameter `T extends string | number | symbol`,
defaulting to `T = string`. The default keeps every existing call site — `new VideoSlotConfig()`,
`VideoSlotSessionHandling`, etc. — working exactly as before with no changes required.

Pass an explicit type argument to use something other than plain strings, e.g. numeric symbol codes:

```ts
import {VideoSlotConfig, VideoSlotSession, SymbolsSequence} from "pokie";

const config = new VideoSlotConfig<number>();
config.setAvailableSymbols([1, 2, 3, 4, 100, 200]); // 100 = wild, 200 = scatter
config.setWildSymbols([100]);
config.setScatterSymbols([200]);
config.setSymbolsSequences(
    new Array(config.getReelsNumber())
        .fill(0)
        .map(() => new SymbolsSequence<number>().fromNumberOfEachSymbol([1, 2, 3, 4, 100, 200], 15)),
);

const session = new VideoSlotSession<number>(config);
session.play();
session.getSymbolsCombination().toMatrix(); // number[][]
```

A `string`-literal union (e.g. `"A" | "K" | "Q"`) also works as `T`, giving compile-time exhaustiveness checks over a
fixed symbol set instead of plain unchecked `string`.

See [Paylines & Line Patterns](paylines-and-patterns.md) and [Paytable & Win Calculation](paytable-and-wins.md) for
details on lines/patterns/paytable, and [Free Games](free-games.md) for the bonus-round layer on top of this.
