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

`SimulationAccumulator` keeps payout and RTP statistics separate:

- `averagePayout`
- `averagePayoutConfidenceInterval95`
- `payoutStandardDeviation`
- `rtp`
- `rtpConfidenceInterval95`
- `returnStandardDeviation`

For variable bet sizes, RTP is computed from per-round return ratios (`payout / bet`), not from raw payout averages.

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
stats.averagePayoutConfidenceInterval95;
stats.rtpConfidenceInterval95;
```

## Parallel simulation (workers)

`pokie sim --workers <n>` (and Studio's Simulation tab "Workers" field) split a large run across real
`worker_threads`, using the exact same `AggregateSimulationRunner`/`SimulationAccumulator`/`SimulationStatistics`
calculation path as the single-threaded run — parallelism only changes *how* the rounds are distributed and merged,
never the underlying math. The pieces:

- **`ParallelSimulationRunner`** — the one entry point both `pokie sim` and Studio call, for any `workers >= 1`.
  `workers === 1` runs in-process (no thread spawned at all — see below); `workers > 1` splits the rounds and
  drives real worker threads.
- **`splitRoundsAcrossWorkers(rounds, workers)`** — divides `rounds` as evenly as possible; the first
  `rounds % workers` workers get one extra round, so the shares always sum to exactly `rounds`. If `rounds <
  workers`, the first `rounds` workers get exactly 1 round each and the rest get 0 — a worker with a 0-round share
  is never spawned.
- **`WorkerSeedStrategy`** — derives each worker's own seed from the top-level `--seed`, deterministically:
  - `workers === 1`: the identity case — the single worker gets the original seed **unchanged**. This is what
    makes a `--workers 1` run's statistics match the pre-`--workers` sequential path exactly, for the same seed.
  - `workers > 1`: worker *i* (of *N*) gets a distinct derived seed (`"<seed>::worker<i>/<N>"`), so no two workers
    draw from the same/correlated RNG stream. An unseeded run (`--seed` omitted) simply leaves every worker
    unseeded too — each draws its own non-deterministic randomness.
- **`SimulationWorkerCoordinator`** — spawns one real `Worker` per non-zero round share, sends it a plain-data
  `SimulationWorkerRequest` (`{packageRoot, rounds, seed, workerIndex, totalWorkers, progressChunkSize}`) via
  `workerData`, and collects each one's `SimulationWorkerResult` back via `postMessage`. **No class instances,
  live sessions, or functions ever cross the worker boundary** — only plain, structured-cloneable data. This is
  also why `--workers > 1` requires a real on-disk game package: each worker independently calls `loadPokieGame`
  on `packageRoot` itself, from scratch, inside its own thread — there is no way to hand a worker an
  already-constructed `PokieGame`/session.
- **`SimulationStatisticsMerger`** — combines every worker's result back into one `SimulationStatistics`, reusing
  `SimulationAccumulator.merge()` (the same online mean/variance combination `AggregateSimulationRunner`'s own
  chunking already relies on) — variance is never approximated by averaging each worker's own variance, it's
  recombined correctly from each worker's raw running totals. Category breakdowns are merged the same way
  (`mergeSimulationBreakdowns`).

### Reproducibility guarantees

- The same `(packageRoot, rounds, seed, workers)` always produces the same `SimulationStatistics` — for a fixed
  `workers` count. This holds for both `workers === 1` and any `workers > 1`.
- **`--workers 1` and `--workers N > 1` are each internally reproducible, but are *not* expected to produce
  identical statistics to each other.** Splitting the same rounds across a different number of independent RNG
  streams is a genuinely different execution, not just a faster version of the same one — don't diff a
  `--workers 1` report against a `--workers 4` report (of the same seed) expecting them to match; diff two
  `--workers 4` runs, or two `--workers 1` runs, instead.
- The report's `workers` field and `reproducibility.workerSeedStrategy` (a human-readable description of the
  derivation above) are included specifically so a report is self-describing about which of the two situations
  above applies, without having to know what `--workers` value produced it.
- An unseeded run (no `--seed`) is never reproducible, with or without `--workers` — same as before this feature.

### workers=1 vs. workers>1

| | `--workers 1` (default) | `--workers N > 1` |
|---|---|---|
| Execution | In-process, no thread spawned | N real `worker_threads`, one per non-zero round share |
| Game package | Real package, or an in-memory/mocked one (via a custom `loadGame`) | **Real, on-disk package only** |
| Seed | Used unchanged | Deterministically derived per worker (see `WorkerSeedStrategy`) |
| vs. pre-`--workers` behavior | Byte-for-byte identical | N/A — a new capability, not a faster version of the old path |

### Memory/CPU considerations

- Each worker thread is a full, independent V8 isolate: it re-loads the game package, re-JITs its code, and holds
  its own copy of any static tables (paytables, reel strips, etc.) the game builds at load time. Memory usage
  scales roughly linearly with `--workers`, not just with `--rounds`.
- Thread creation/module loading has fixed overhead per worker, independent of `--rounds` — `--workers` only pays
  off once that fixed cost is small relative to the total simulation time (a `--rounds 1000 --workers 8` run will
  likely be *slower* than `--workers 1`, purely from spin-up overhead across 8 isolates for very little actual
  work per isolate). As a rule of thumb, don't reach for `--workers` below tens of thousands of rounds.
- `--workers` doesn't change how much CPU the simulation *needs* — it changes how many CPU cores it can use at
  once. On a single-core machine (or one already saturated by other work), `--workers > 1` won't be faster and
  may be slower; it helps when idle cores are actually available.
- `MAX_SIMULATION_WORKERS` (32) is a safety ceiling against a typo'd `--workers 100000` spawning far more OS
  threads than any real machine benefits from — it isn't a recommendation to actually use that many; matching
  `--workers` to the number of idle CPU cores is usually the better default.

### Worker package-loading limitations

- `--workers > 1` requires `<packageRoot>` to be a real, on-disk directory `loadPokieGame` can resolve — the same
  requirement `pokie sim`/`pokie serve`/Studio already have for a real project, just enforced per-worker instead
  of once.
- Programmatic callers that inject a custom/in-memory `loadGame` (as `pokie`'s own test suite does) only get that
  behavior for `workers === 1` — the in-process path. `workers > 1` always uses the real `loadPokieGame` inside
  each worker thread and has no injection point for a substitute loader, by design (there is no way to hand a
  worker thread a live object graph to use instead).
- Studio's simulation service behaves the same way: a project must be a real on-disk package (which every open
  Studio project already is) for its "Workers" field to be anything other than 1.

## Feature-level breakdown (`SimulationRoundCategoryDetermining`)

`AggregateSimulationRunner` can additionally attribute each round to a **category** (`"base"`, `"freeGames"`,
`"bonus"`, or anything else a game wants) — this is what powers the `breakdown` field on `pokie sim`'s
[JSON report](cli.md#pokie-sim-packageroot). Categorization is entirely pluggable:

```ts
interface SimulationRoundCategoryDetermining {
    supportsRoundCategorization(session: GameSessionHandling): boolean; // can this round be categorized at all?
    categorizeRound(session: GameSessionHandling): string;              // the category, only called if supported
}
```

`AggregateSimulationRunner`'s 4th constructor argument accepts one; when omitted it defaults to:

```ts
new FallbackSimulationRoundCategoryDeterminer([
    new ExplicitSimulationRoundCategoryDeterminer(),        // 1st: ask the session directly
    new StakeBasedSimulationRoundCategoryDeterminer(),      // 2nd: infer base/freeGames from StakeAmountDetermining
])
```

`FallbackSimulationRoundCategoryDeterminer` tries each determiner in order and uses the first one that supports
the round. Concretely, for each round about to be played, the default chain resolves in this order:

1. **Explicit** — does the session implement `SimulationCategoryDetermining`, and does
   `getSimulationCategory()` return a valid category (see [Category name rules](#category-name-rules-simulationcategorynamenormalizer)
   below) for *this* round? If so, that's the category, full stop — nothing else is consulted.
2. **Stake-based** — otherwise, does the session implement `StakeAmountDetermining`? If so, the round is
   `"freeGames"` when `getStakeAmount() === 0`, `"base"` otherwise.
3. **No breakdown** — otherwise (or if neither contract is implemented at all), this round isn't attributed to
   any category. It still plays and counts toward the overall totals; `getBreakdownStatistics()` only ends up
   `undefined` for the whole run if *no* round, ever, was categorized by *any* step above.

A session implementing neither contract is completely unaffected by any of this — same as before this feature
existed. A session implementing only `StakeAmountDetermining` gets exactly the base/freeGames split it always
had. A session implementing `SimulationCategoryDetermining` can override that split per round, or opt out of it
entirely by always returning a valid category. This default is purely additive; nothing about it changes
behavior for an existing game package.

### Declaring a category explicitly (`SimulationCategoryDetermining`)

A session can skip the base/freeGames inference entirely and just say what category the round belongs to, by
implementing one optional method — the same feature-detected-interface pattern as `StakeAmountDetermining`:

```ts
interface SimulationCategoryDetermining {
    getSimulationCategory(): string;
}
```

```ts
import type {GameSessionHandling, SimulationCategoryDetermining} from "pokie";

class MySession implements GameSessionHandling, SimulationCategoryDetermining {
    private inBonusRound = false;

    // ...

    getSimulationCategory(): string {
        return this.inBonusRound ? "bonus" : "base";
    }
}
```

It's called once per round, right before that round is played, and doesn't have to classify every round —
returning `""` (or any invalid value, see below) for a round means "I have no opinion here," which lets the next
determiner in the chain (stake-based inference, by default) decide instead. A session that implements
`getSimulationCategory()` and always returns a valid string effectively opts out of the base/freeGames inference
altogether.

### Category name rules (`SimulationCategoryNameNormalizer`)

A category name ends up as a JSON object key and a table row label in `pokie sim`/`report`/`diff` output, so it's
validated/normalized before use, not accepted as-is:

- Trimmed of surrounding whitespace.
- Must be non-empty after trimming.
- Must be at most `SimulationCategoryNameNormalizer.MAX_LENGTH` (64) characters.
- Must match `/^[A-Za-z][A-Za-z0-9_-]*$/` — starts with a letter, then letters/digits/hyphens/underscores (so
  `"bonus"`, `"freeGames"`, `"hold-and-win"`, `"bonus_buy2"` are all fine; `"2bonus"`, `"bonus round"`, `""` are
  not).

An invalid or empty category is never used and never throws. This is enforced in two places, so it holds no
matter how a category was produced:

- `ExplicitSimulationRoundCategoryDeterminer` normalizes whatever `getSimulationCategory()` returns before
  deciding whether it supports the round at all — an invalid answer just means "doesn't support this round," so
  `FallbackSimulationRoundCategoryDeterminer` moves on to the next determiner.
- `AggregateSimulationRunner` *itself* normalizes whatever category any `SimulationRoundCategoryDetermining` —
  built-in or a hand-written custom one (see [Custom categorization strategies](#custom-categorization-strategies)
  below) — hands back, before ever using it as a `breakdown` key. A custom determiner has no reason to know about
  `SimulationCategoryNameNormalizer`; the runner guards against it regardless, so a badly-written determiner can't
  put an empty/oversized/unsafe string directly into a JSON report.

A misbehaving session or determiner can't crash a long simulation run over a bad category string; at worst, that
round ends up in `"base"` (via stake-based inference) or outside the breakdown entirely (if nothing else supports
it either) — it still plays and counts toward the overall totals either way, it just isn't attributed to a
specific `breakdown` category.

### Category ordering

`SimulationReportBuilder` and `SimulationReportDiffer` both list `breakdown` categories in a **stable order** —
`"base"` first when present, then everything else alphabetically (`SimulationCategoryOrdering.sort(...)`) — so
`pokie sim`/`report`/`diff` show the same category order every run, regardless of which round happened to be
categorized first during simulation, or which side of a diff introduced a category first. `pokie diff` unions
both reports' category sets before sorting, so an added or removed category slots into the same alphabetical
position it would if it had always been there. (`AggregateSimulationRunner.getBreakdownStatistics()` itself makes
no ordering guarantee — sorting is applied only where category order is actually user-visible.)

### Custom categorization strategies

A game with a mechanic that doesn't fit "ask the session directly, else base/freeGames" — say, deriving the
category from something external to the session — can supply its own `SimulationRoundCategoryDetermining` (or its
own list wrapped in `FallbackSimulationRoundCategoryDeterminer`) as `AggregateSimulationRunner`'s 4th argument,
same as a custom `NextSessionRoundPlayableDetermining` play strategy is its 3rd:

```ts
import {AggregateSimulationRunner, FallbackSimulationRoundCategoryDeterminer, StakeBasedSimulationRoundCategoryDeterminer} from "pokie";

class MyJackpotAwareDeterminer implements SimulationRoundCategoryDetermining {
    supportsRoundCategorization(session: GameSessionHandling): boolean {
        /* ... */
    }
    categorizeRound(session: GameSessionHandling): string {
        return "jackpot";
    }
}

const runner = new AggregateSimulationRunner(
    session,
    1_000_000,
    undefined, // no play strategy
    new FallbackSimulationRoundCategoryDeterminer([new MyJackpotAwareDeterminer(), new StakeBasedSimulationRoundCategoryDeterminer()]),
);
```

### Reading the breakdown

```ts
const runner = new AggregateSimulationRunner(session, 1_000_000);
const accumulator = runner.run();

runner.getBreakdownStatistics();
// undefined, or Record<string, {rounds, totalBet, totalWin, rtp, hitFrequency, maxWin}> keyed by category
```

`pokie sim` takes this, adds a `contribution` field per category (share of the report's overall RTP — see
[`pokie sim`](cli.md#pokie-sim-packageroot)), and puts the result on `SimulationReport.breakdown`.
