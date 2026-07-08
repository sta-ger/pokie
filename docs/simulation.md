[← Back to docs index](README.md)

# Simulation

`Simulation` drives any `GameSessionHandling` (e.g. `VideoSlotSession`) through repeated rounds and aggregates
statistics — the tool for RTP/volatility/hit-frequency work. See
[Modeling Slot Math with POKIE](math-modeling.md) for a full worked example.

`Simulation` remains the rich analysis mode that keeps full per-round series. For very large runs where you only want
aggregates, use the newer foundation classes:

- `SimulationAccumulator` — online mean/variance, total bet/payout, hit count, max win, histogram, merge support.
- `AggregateSimulationRunner` — runs a session without storing per-round payout arrays.
- `ConfidenceIntervalCalculator` — basic 95% confidence interval helper.

## `SimulationConfig`

```ts
static readonly DEFAULT_NUMBER_OF_ROUNDS = 1000;

setNumberOfRounds(value: number): void
getNumberOfRounds(): number                                              // default 1000

setPlayStrategy(playStrategy: NextSessionRoundPlayableDetermining): void
getPlayStrategy(): NextSessionRoundPlayableDetermining                   // undefined until set

setChangeBetStrategy(changeBetStrategy: BetForNextSimulationRoundSetting): void
getChangeBetStrategy(): BetForNextSimulationRoundSetting | undefined      // undefined until set
```

## `Simulation`

```ts
constructor(session: GameSessionHandling, config: SimulationConfigRepresenting)
```

Config values (`numberOfRounds`, `playStrategy`, `changeBetStrategy`) are read once at construction time — mutating
the config object afterward has no effect on an already-created `Simulation`.

### Running

```ts
run(): void
runAsync(chunkSize = 1000, delayBetweenChunks = 0): Promise<void>
```

`run()` plays rounds synchronously, one after another, until `numberOfRounds` is reached or the game can no longer be
played — the stop check is `session.canPlayNextGame()` **and**, if a play strategy is set,
`playStrategy.canPlayNextSimulationRound(session)`. `runAsync` runs the exact same loop but in batches of
`chunkSize` rounds, yielding to the event loop via `setTimeout(..., delayBetweenChunks)` between batches — useful for
very large runs so they don't block the thread. There's no worker-thread parallelism involved; it's the same
sequential logic, just chunked.

Both call `onFinishedCallback` once the loop ends.

### Callbacks

Callbacks are **not public properties** — they're set/removed through methods:

```ts
setBeforePlayCallback(callback: () => void): void / removeBeforePlayCallback(): void
setAfterPlayCallback(callback: () => void): void / removeAfterPlayCallback(): void
setOnFinishedCallback(callback: () => void): void / removeOnFinishedCallback(): void
```

### Reading results

```ts
getLastRtp(): number                                       // RTP after the last round played
getAverageRtp(): number                                     // average of the per-round cumulative RTP series
getAllRtpValues(): number[]                                 // cumulative RTP after each round, in order
getHitFrequency(): number                                   // numberOfWinningRounds / roundsPlayed
getPayoutsStandardDeviation(includeZeroPayouts = true): number
getTotalBetAmount(): number
getTotalPayoutAmount(): number
getCurrentRoundNumber(): number                              // rounds actually played
getAllBets(): number[]                                       // bet used per round, in order
getAverageBet(): number
getPayouts(includeZeroPayouts = true): number[]
getAveragePayout(includeZeroPayouts = true): number
getNumberOfWinningRounds(): number
getTotalNumberOfRounds(): number                              // the configured target, not necessarily rounds played
```

```ts
import {Simulation, SimulationConfig, VideoSlotSession} from "pokie";

const session = new VideoSlotSession();

const simulationConfig = new SimulationConfig();
simulationConfig.setNumberOfRounds(10000);

const simulation = new Simulation(session, simulationConfig);
simulation.setBeforePlayCallback(() => console.log("before"));
simulation.setAfterPlayCallback(() => console.log("after"));
simulation.setOnFinishedCallback(() => console.log("finished"));

simulation.run();

simulation.getLastRtp();
simulation.getAverageRtp();
simulation.getHitFrequency();
```

## Play strategies (`NextSessionRoundPlayableDetermining`)

```ts
interface NextSessionRoundPlayableDetermining {
    canPlayNextSimulationRound(session: GameSessionHandling): boolean; // true = keep playing
}
```

Set via `simulationConfig.setPlayStrategy(...)`; `Simulation` ANDs its result with `session.canPlayNextGame()` every
iteration.

- **`PlayUntilAnyWinStrategy`** — keeps playing while `session.getWinAmount() === 0`; stops on the first win. Good
  for capturing/demoing a win.
- **`PlayUntilAnyLosingCombinationStrategy`** — the mirror image: keeps playing while rounds keep winning, stops on
  the first zero-payout round.
- **`PlayUntilSymbolWinStrategy(symbolId)`** — the most configurable: plays until a specific symbol wins, with
  fine-grained conditions (fluent getters/setters, all mutable after construction):
  ```ts
  constructor(symbolId: string)
  getMinLinesNumber() / setMinLinesNumber(n: number)                        // default 1
  isOnlySameSymbolId() / setOnlySameSymbolId(b: boolean)                    // default false — all winning lines must share a symbol
  isAllowWilds() / setAllowWilds(allow: boolean, wildSymbolId: string)      // default true — disallow wild-substituted wins if false
  getMinNumberOfWinningSymbols() / setMinNumberOfWinningSymbols(n: number)  // at least n positions on a winning line/scatter
  getExactNumberOfWinningSymbols() / setExactNumberOfWinningSymbols(n: number)
  ```
  Automatically distinguishes scatter symbols (`session.isSymbolScatter(symbolId)`) from line symbols and checks the
  appropriate winning-lines/winning-scatters collection.
- **`PlayFreeGamesStrategy`** — drives a `VideoSlotWithFreeGamesSessionHandling` through an entire free-games
  feature. By default (`lastFreeGame = false`) it plays base-game rounds until free games are triggered
  (`getWonFreeGamesNumber() > 0`, or exactly `getExactNumberOfFreeGames()` if set), then stops. Set
  `setLastFreeGame(true)` to instead simulate through an *already-triggered* feature until all free games are used,
  optionally requiring the free-games bank to be empty/non-empty at the end via `setShouldHaveFreeBankAtEnd(bool)`.

```ts
import {Simulation, SimulationConfig, PlayUntilSymbolWinStrategy} from "pokie";

const simulationConfig = new SimulationConfig();
simulationConfig.setNumberOfRounds(Infinity);
simulationConfig.setPlayStrategy(new PlayUntilSymbolWinStrategy("A"));

const simulation = new Simulation(session, simulationConfig);
simulation.run(); // stops as soon as symbol "A" wins
```

## Bet-changing strategy

```ts
interface BetForNextSimulationRoundSetting {
    setBetForNextRound(session: GameSessionHandling): void;
}
```

Set via `simulationConfig.setChangeBetStrategy(...)`; if present, `Simulation` calls it right before each round is
played. The one built-in implementation, **`RandomChangeBetStrategy`**, picks a uniformly random bet from
`session.getAvailableBets()` each round — useful for fuzzing bet size to verify payouts scale correctly across every
stake level, not just the default bet.

## Async example

```ts
await simulation.runAsync();       // default chunkSize=1000, delayBetweenChunks=0
await simulation.runAsync(500, 0); // smaller chunks, yields more often
```

## Aggregate-only example

```ts
import {AggregateSimulationRunner, VideoSlotSession} from "pokie";

const runner = new AggregateSimulationRunner(new VideoSlotSession(), 1_000_000);
const accumulator = runner.run();
const stats = accumulator.getStatistics();

stats.rtp;
stats.volatility;
stats.confidenceInterval95;
```
