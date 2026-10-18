[← Back to docs index](README.md)

# Simulation

Opt-in `SimulationObservationRequest` counters record bounded named event presence and arbitrary
half-open payout/actual-paid-stake buckets. Aggregate, chunked and worker paths retain the same request
and accepted-observation counts through snapshots/merging; missing or different coverage is rejected.
These are selected subround observations, not a claim of full feature-round coverage. Existing currency
histograms and default simulation behavior are unchanged. The [optimization workflow](optimization.md)
uses supported population adapters, a separately seeded fixed held-out assessment and bounded joint
confidence intervals. Simulation precision convergence is not optimization target attainment; neither a
short zero-variance sample nor an empirical maximum supplies a mathematical support bound.

Feature analytics remain partial: aggregate/report statistics, mode/feature breakdowns, and outcome-event
analysis exist, but do not constitute complete feature analytics. Reports support JSON, Markdown, and HTML;
PAR workbook exchange is a separate model format. YAML authoring and PDF report output are absent from the
reviewed capabilities. Report and Outcome Library/Stake comparisons are partial coverage for math-definition
diff, not arbitrary mathematical model comparison. See the [status register](https://github.com/fromstan/pokie/blob/develop/docs/audit-corrections/README.md).

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
import {Simulation, SimulationConfig, VideoSlotSession} from "@fromstan/pokie";

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
import {Simulation, SimulationConfig, PlayUntilSymbolWinStrategy} from "@fromstan/pokie";

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
import {AggregateSimulationRunner, VideoSlotSession} from "@fromstan/pokie";

const runner = new AggregateSimulationRunner(new VideoSlotSession(), 1_000_000);
const accumulator = runner.run();
const stats = accumulator.getStatistics();

stats.rtp;
stats.volatility;
stats.averagePayoutConfidenceInterval95;
stats.rtpConfidenceInterval95;
```

## Parallel simulation (workers)

`ParallelSimulationRunner` is a public part of the `@fromstan/pokie` package itself — importable directly from `"@fromstan/pokie"` like
any other class, with no CLI or Studio involved — that splits a large run across real `worker_threads`, using the
exact same `AggregateSimulationRunner`/`SimulationAccumulator`/`SimulationStatistics` calculation path as the
single-threaded run. Parallelism only changes *how* the rounds are distributed and merged, never the underlying
math. `pokie sim --workers <n>` and Studio's Simulation tab "Workers" field are both just callers of this same
class — neither has (or needs) its own worker-thread implementation.

### Programmatic usage

```ts
import {ParallelSimulationRunner} from "@fromstan/pokie";

const runner = new ParallelSimulationRunner("./sample-slot", 1_000_000, {
    seed: "demo",
    workers: 4, // omit (or pass 1) to run in-process, exactly like the pre-`--workers` sequential path
});

const result = await runner.run();

result.manifest; // {id, name, version} — the game's own manifest
result.statistics; // SimulationStatistics — rtp, volatility, confidence intervals, payout histogram, etc.
result.breakdown; // Record<string, SimulationBreakdownComponent> | undefined — same shape as pokie sim's own
result.workers; // the actual worker count used
result.workerSeedStrategy; // human-readable description of how per-worker seeds were derived
```

Everything `pokie sim --workers`/Studio's Simulation tab support is available the same way:

```ts
const controller = new AbortController();

const runner = new ParallelSimulationRunner("./sample-slot", 5_000_000, {
    seed: "demo",
    workers: 8, // custom worker count, up to MAX_SIMULATION_WORKERS
    signal: controller.signal, // cancel a run in progress — see Cancellation below
    onProgress: (roundsCompleted) => console.log(`${roundsCompleted} rounds so far`),
});

const resultPromise = runner.run();
// ... later, e.g. in response to a user action ...
controller.abort(); // stops every worker thread; resultPromise rejects with SimulationCancelledError
```

`MAX_SIMULATION_WORKERS` (the same safety ceiling `--workers` is validated against) is also exported, for a caller
that wants to clamp/validate a user-supplied worker count itself before constructing a runner.

### The pieces

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
  already-constructed `PokieGame`/session. `SimulationWorkerCoordinator` is itself part of the public API too (a
  lower-level building block than `ParallelSimulationRunner`, for a caller that wants direct control over worker
  spawning), but the *transport* it speaks internally — the tagged-union postMessage protocol and the worker
  entry script that receives it — is not: those live under `simulation/parallel/internal/` in the source tree and
  are deliberately not exported, so they can change shape freely without it being a breaking change.
- **`SimulationStatisticsMerger`** — combines every worker's result back into one `SimulationStatistics`, reusing
  `SimulationAccumulator.merge()` (the same online mean/variance combination `AggregateSimulationRunner`'s own
  chunking already relies on) — variance is never approximated by averaging each worker's own variance, it's
  recombined correctly from each worker's raw running totals. Category breakdowns are merged the same way.
- **`SimulationCancelledError`** / **`SimulationWorkerFailureError`** — thrown by `run()` for, respectively, a
  cancelled run (via `signal`) and any worker failure (a thrown error, a crash, a malformed message, or a
  premature exit) — see Cancellation and error handling below.

### Cancellation and error handling

- Passing an already-aborted `signal` (or aborting it before/during a run) rejects `run()` with a
  `SimulationCancelledError` and terminates every worker thread that run had spawned — `run()` never resolves
  with a partial `ParallelSimulationResult` in that case, cancelled or not.
- Any single worker failing — an uncaught exception, a malformed message, or exiting prematurely — immediately
  stops the *whole* run: every other worker is terminated too, and `run()` rejects with a
  `SimulationWorkerFailureError` (`.workerIndex` names which worker failed; `.message` is always a safe,
  stack-trace-free description, never the worker's raw `Error.stack`).
- Either way, by the time `run()`'s returned promise settles, no worker thread that call spawned is still running
  — nothing is left behind for the caller to clean up.

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

## Adaptive early stop (`SimulationConvergenceOptions`)

`ParallelSimulationRunner`/`pokie sim` support an **opt-in** adaptive early stop, on top of the pre-existing
fixed-round behavior — absent by default, so an existing caller/CLI invocation is completely unaffected: `rounds`
is always played in full unless `ParallelSimulationRunOptions.convergence` is explicitly set. The legacy
`Simulation`/`SimulationConfig` class (see above) has no concept of this feature at all and never will.

```ts
import {ParallelSimulationRunner} from "@fromstan/pokie";

const runner = new ParallelSimulationRunner("./sample-slot", 5_000_000, {
    seed: "demo",
    convergence: {
        minRounds: 100_000, // no stop before this many rounds, however stable the estimate looks early
        rtpTolerance: 0.002, // stop once the RTP's 95% CI half-width is within +/-0.2 percentage points
        checkIntervalRounds: 25_000, // how often to check -- also becomes the run's effective chunk size
        stableChecks: 3, // consecutive satisfying checks required before actually stopping (default 3)
    },
});

const result = await runner.run();

result.stopReason; // "maxRounds" | "sessionStopped" | "converged"
result.convergence; // echoes the options + checksPerformed/consecutiveStableChecks/achievedRtpHalfWidth
```

`SimulationConvergenceChecker` is the class doing the actual evaluation — it reads
`SimulationAccumulator.getStatistics().rtpConfidenceInterval95` (itself built on the existing
`ConfidenceIntervalCalculator`) after every chunk and never recomputes RTP/variance/confidence intervals itself,
so no simulation math is duplicated for this feature. It's stateful only in a "how many consecutive checks passed"
counter, reset to zero by any check that doesn't satisfy `minRounds`/`rtpTolerance` — this is what makes the stop
require *sustained* convergence rather than a single lucky/noisy interval.

**Workers > 1**: convergence is evaluated **independently per worker**, against that worker's own share of the
rounds — there is no live coordination of one global running RTP across worker threads. This is a deliberate
choice, not a shortcut: real cross-worker coordination would mean workers reporting partial running totals back to
a coordinator and being told to stop mid-run, which makes the exact stop point depend on message-arrival timing —
breaking the [reproducibility guarantee](#reproducibility-guarantees) that a fixed `(packageRoot, rounds, seed,
workers)` always produces the same result for a fixed `workers` count. Evaluating per-worker-share instead keeps
every worker's stop point a pure function of its own derived seed and its own share, so a converging multi-worker
run is exactly as deterministic as a non-converging one always was. The practical consequence: size
`minRounds`/`checkIntervalRounds` relative to `rounds / workers`, not to the total `rounds` — a `minRounds` sized
for the whole run will rarely be reached by any individual worker's smaller share.

`ParallelSimulationResult.stopReason`/`.convergence` (and, from there, `SimulationReport.stopReason`/`.convergence`
— see [`pokie sim`'s JSON report](cli.md#pokie-sim-packageroot)) summarize across every worker when `workers > 1`:
`"sessionStopped"` always wins, regardless of what any other worker did (a session ending early is the most
notable outcome). Otherwise, `"converged"` requires **every** worker to have independently converged — if even one
worker instead exhausted its own share and hit `"maxRounds"`, the whole run reports `"maxRounds"`, not
`"converged"`, since the merged report would otherwise mix a converged estimate with a plain fixed-round one.
`convergence.checksPerformed` sums across workers, `consecutiveStableChecks` takes the minimum (the
weakest-converged worker), `achievedRtpHalfWidth` takes the maximum (the least-precise worker's estimate) — a
conservative summary, never a made-up statistic recomputed from the merged accumulator.

See [`pokie sim`'s `--min-rounds`/`--rtp-tolerance`/`--check-interval`/`--stable-checks`
flags](cli.md#adaptive-early-stop-convergence) for the CLI surface of this same feature.

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
import type {GameSessionHandling, SimulationCategoryDetermining} from "@fromstan/pokie";

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
import {AggregateSimulationRunner, FallbackSimulationRoundCategoryDeterminer, StakeBasedSimulationRoundCategoryDeterminer} from "@fromstan/pokie";

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

### Counting logical rounds

Existing `rounds`, category breakdowns, iteration limits and `totalPayout` count
domain steps and their mathematical wins. They continue to include zero-stake
free-game steps. Delivery count and released wallet bank are not extra simulated
outcomes. Exact weighted-outcome generation still enumerates one screen; logical
delivery does not introduce full-feature enumeration.

Capable sessions additionally report `logicalRounds` with completed entry count,
domain step count, actual total stake and mathematical total win. An unfinished
observation travels with the executable session across runner/chunk boundaries
and closes once when its domain feature ends. Completed observations merge
through accumulator snapshots and `SimulationStatisticsMerger`; `Simulation`
also exposes `getLogicalRoundStatistics()`. Partial final features are omitted
from completed logical totals, while their played steps remain in the existing
statistics. Separate workers still have separate independent session streams.
A forcing mode locked by an explicit simulation strategy is selected afresh at
each new entry; delivery loops never invoke that strategy to buy another round.

A feature tail first observed without its entry ledger is not a completed logical
observation. Its steps still count normally; bare feature snapshots cannot recover
the original entry price or command. Durable runtime statistics use the retained
logical entry and therefore complete normally after restart.

## Whole-sequence selection coverage

Weighted sessions expose `getSequenceStatistics()`. Aggregate simulations subtract
the starting counters, so reused or restored sessions report only the current run.
Counters pass through chunk snapshots, worker results, statistics merging and
JSON/Markdown/HTML reports; Studio renders the same fields.

Each `reelSequences` report entry contains its reel index, `logical-round` context,
model identity, selection denominator and configured variants. Every variant has
its ID, authored weight, normalized probability (and exact `probabilityRatio`),
count, observed frequency and `uncovered` flag. Positive-weight entries with zero
observations are uncovered; zero-weight entries are identified separately. A zero
selection denominator yields frequency zero, never NaN. Reports keep unseen
configured entries, and incompatible weighted model identities cannot be merged.

Initialization and exact probes contribute no selection events. Free continuations,
repeated reads, saved stage delivery and idempotent retry do not recount a choice.
Restorable runtime rollback and compensated persistence failure restore counters
with selection/RNG state. Variant state keeps only active contextual selections and
configured counters, rather than a history of completed round IDs.


Whole-sequence observed frequency is **variant count / selections for that reel and
context**, not count / delivered spins. Markdown, HTML, JSON downloads and Studio
show the actual denominator, configured probabilities and distinct uncovered versus
zero-weight coverage. Positive probabilities that underflow numeric display retain
an exact `probabilityRatio`. Zero-selection results have zero frequency and no NaN.

The existing simulation-report differ (and `pokie diff`) includes `reelSequences`.
It explains variant additions/removals, ordering, authored weight, full-array and
context/model changes even when payout metrics agree. Configured changes are separate
from observed count/denominator differences; multi-mode sets propagate these changes.
Reports without sequence fields remain comparable. Cancelled/failed simulation jobs
keep their existing partial-result/completion contract; editor previews are not
observed simulation results.

Authored Hold&Win/jackpot/mode compositions use the existing aggregate/parallel runners and report renderers. Actual charged stake remains the denominator; zero-stake continuation payouts retain feature attribution. Jackpot statistics are run-local deltas, including reused/restored sessions. Each simulation worker owns independent session-local accumulating pools; reports do not represent one shared progressive. Fixed pools count contributions without growing their balance. A fixed mode selector intentionally repeats purchases when available, unlike Play's fresh-action purchase controls. Incomplete feature tails remain incomplete observations. See [the catalogue](https://github.com/fromstan/pokie/blob/develop/docs/v2-completion/V2C-12.md).

Authored modifier reports expose `modifiers.steps`, `ruleApplications`,
`stickySteps` (including the expiry application) and `multipliedComponents`.
Counters are collected after execution, carried through accumulator snapshots,
then summed across chunks/workers. Sticky state stays with each session across
chunks and starts empty in each worker/job. Existing worker seed partitioning
still applies: serial and parallel sticky trajectories are not promised identical.

## Bounded authored mechanics (V2C-14)

See [cascades, respins and collections](bounded-mechanics.md) for the declarative
contracts, supported compositions, authoring/build/extraction/PAR workflow,
logical-round accounting, continuation and durability boundaries.

## Weighted bonus authoring

See [finite weighted bonus outcomes](weighted-bonus.md) for selection identity,
payout/duration units, authoring/interchange, restoration/replay, statistics and
custom-rule/target boundaries. The [launch support register](v2-completion/launch-mechanics-support.md)
maps every mandatory family separately from arbitrary custom callbacks.

## Feature analytics aggregates (V2C-16)

`AggregateSimulationRunner` and `Simulation` share the accepted mathematical-play
observer. `SimulationAccumulator.addRound(stake, win, observation?)` accepts its
plain-data observation contract; omit observation when only amounts are known.
`statistics.analytics` carries schema/event version 1, executable `modelId`,
capabilities and the metric policy through snapshots, chunk/worker merges,
reports, CLI JSON/text and Studio report details/downloads. Older reports with no
analytics remain readable and display **unavailable**, rather than invented zero
observations. `setSimulationModelIdentity(session, game.getConfigHash?.())` binds
an executable identity for direct runners; the package/parallel paths do this
automatically. A custom model without a hash is explicitly unidentified. A null
identity cannot merge with a known identity. Two anonymous envelopes may merge
only with matching metric/capability policy; this is not evidence of the same
executable model. An empty, unconfigured accumulator
can adopt an envelope; a configured empty accumulator still enforces its policy. Restored older amount-only
accumulators can continue amount-only accounting, keeping analytics unavailable;
they cannot acquire current provenance or accept identified observations without
rebuilding from evidence.

Every rate retains numerator and denominator. Paid entries count positive
**actual charged stake**, including purchases; logical entries count observed
new logical entries on a session, including legitimate zero-stake entries. Accepted
subrounds count successful plays once and remain the requested-round/progress
budget. Completed logical rounds exclude incomplete/exhausted and restored tails
without entry evidence. Mathematical cascade evaluations have a separate count;
delivery-only stages and retries never call this observer. Completed logical
sample core report metrics can therefore have a different population from the
observed monetary totals and the analytics subround metrics.

- Entry frequency = feature entries / paid entries, or / logical entries, with
  both alternatives labeled. Retrigger frequency = extension events / feature
  entries; grants separately count the number of granted games/respins, including
  unused grants when Hold&Win completes on its triggering entry. Weighted bonus
  respin grants use the selected duration; they are not extra entry events.
- Duration = executed feature subrounds / completed feature instances. A natural
  base trigger does not execute a free spin. A purchase executes its first free
  spin on entry, which is included in duration and separately counted as
  `entrySubrounds`. Cascades are mathematical stages, not extra feature plays.
- Average bonus win = completed feature win sum / completions. Zero-duration and
  zero-win completions enter their distributions. Both duration and win use four
  fixed buckets: `0`, `(0,10)`, `[10,100)`, `100+`. Duration is integral. A parent
  and a child may both observe the same feature play; lifecycle win summaries
  overlap and are **not** an additive payout partition.
- The additive partition reads the session evaluation's canonical components
  once: jackpot components first, then feature continuations/explicit feature
  awards, then base components. A purchase's executed free spin is feature win.
  Collection and weighted awards and released free-game banks are never added a
  second time. Components retain identity, occurrences, samples and amount;
  source artifacts retain their original components and metadata unchanged.
  Bet mode is a separate dimension. Each dimension reports RTP contribution
  (amount / actual charged stake) and payout share (amount / total observed win).
- Symbol, line and scatter hits are canonical component presence per accepted
  subround, deduplicated by symbol/line/scatter ID within that subround. Component
  occurrence totals remain separate. A zero-valued canonical component counts
  as component presence; landed display symbols alone never count as paid wins.
- Dead spins = zero-win accepted subrounds / all accepted subrounds. Maximum-win
  frequency counts the exact maximum, including zero in an all-zero run; empty
  runs have zero occurrences. Maximum contribution = maximum * occurrences /
  total win. Top wins retain exactly the largest ten positive subround payouts
  (or all when fewer): descending order, repeated equal values occupy slots,
  equal-value identity is immaterial. Contribution uses their sum / total win.

All zero-denominator ratios return numeric zero, and raw counts distinguish an
observed zero from unavailable lifecycle/components or an unconfigured feature.
Native outcome libraries use their flattened canonical wins once, supporting
component hits and jackpot attribution. Their other component amounts are marked
unattributed (`partition.unavailable`): event presence does not establish a
feature lifecycle. Canonical feature WASM rounds expose accepted mathematical lifecycle/component observations and weighted counters. Ordinary amount-only artifacts keep those metrics explicitly unavailable.

Built-in free games, Hold&Win, bounded respins, collection, cascades, weighted
bonuses, modifiers and their already-supported jackpot/bet-mode compositions use
the same observer. Retained active state is session-local and contains only fixed
feature counters, duration and win sums. Same-session chunks complete the original
instance once; a separately restored tail records excluded completion and carried
subrounds, never a fabricated feature entry. A fixed per-session terminal marker
keeps a middle-only chunk visibly incomplete, including carried-in incomplete
features, even when its entry lies outside that chunk. A completion whose known entry was
outside a selected chunk is labeled carried. Independent worker trajectories
never reconcile each other's unfinished features. Failure/cancellation prefixes
are diagnostics, not completed reports.

Analytics stores seven feature rows, two four-bucket distributions per feature,
ten top payouts, at most 512 component/hit IDs, 128 modes/categories and 64 session trajectories.
Category names remain limited to 64 characters, and imported payout histograms
accept only their four fixed buckets.
Excess model dimensions/trajectories reject before mutation. Logical reconciliation
immediately discards matched coordinates and summarizes abandoned samples;
unmatched disjoint coordinates are capped at 128 per trajectory. This bounds even
adversarial partition fragmentation rather than merely coalescing adjacent ranges.
No event, screen, completed-feature ID or logical-round ID is retained per play.
The legacy `Simulation` API still retains payout/bet/RTP history arrays: its shared
analytics is bounded, but that entire API intentionally remains history-retaining.

Partition equivalence means **identical observations**. Integer/exactly representable
fixtures prove exact monetary and count merges; arbitrary floating-point addition
is order-dependent. Fractional stakes (0.05, 7.5, 1e-7) are retained without rounding.
For workers=1 the seed is unchanged. For workers>1 each seed is
`<seed>::worker<index>/<totalWorkers>`. Fixed seed, worker count, model and options
are reproducible; changing worker count does not preserve the sequential draw
stream. Features and accumulating jackpots are session-local, and every worker
can end with its own unfinished tail. Saved reproducibility metadata and analytics
provenance travel together; merge rates are derived from summed numerators and
denominators, never averages of worker rates.

Native outcome reports also retain their actual `derived-round-seed-v1` policy
(`"<seed>:<round>"`, no package-worker split). WASM reports retain the single
portable seeded-host policy. These adapter policies do not claim equivalence to
the package worker RNG streams. Unseeded outcome API callers retain their own
random-source contract rather than a fabricated seeded replay guarantee.

### Saved analytics and precision diagnostics

Current reports persist `diagnostics` beside the V2 feature aggregates. The saved report is authoritative in Studio, including after reopening history; supplementary compatibility statistics fill only legacy missing fields. JSON, console, Markdown, HTML and Studio share the same diagnostic projection. An absent analytics block means unavailable legacy support, not observed zero.

The requested budget counts accepted plays. When canonical logical-round observations exist, hit frequency, means, payout histogram, volatility, maximum and confidence intervals use **completed logical rounds**. Monetary totals and monetary RTP include every accepted play, including unfinished tails. The interval's centre can therefore differ from monetary RTP. Reports show accepted plays, completed samples, carried observations and excluded unfinished/restored tails separately. Each worker owns an independent session trajectory.

Feature entries use paid entries or logical entries as labelled; retriggers use feature entries. Duration and bonus-win distributions use completed features only, with bins `0`, `(0,10)`, `[10,100)`, `[100,infinity)`. Duration is executed feature plays and bonus win is currency. The payout histogram uses the same currency boundaries despite its historical `1-9`/`10-99` keys. Accepted-play dead spins, maximum occurrence/share and top ten wins are separate from the completed-logical-round maximum. “Exact maximum observed win” means the observed sample maximum, never a theoretical game maximum. Overlapping lifecycle wins must not be added; base/feature/jackpot/unavailable monetary partitions are additive. Bet mode is a separate attribution dimension.

A normal-approximation 95% interval is an empirical estimate. Adaptive precision does not prove agreement with configured target RTP or coverage of unseen rare events. The report distinguishes insufficient samples, an uninformative losing prefix, insufficient precision, empirical precision and fixed-budget runs without a requested tolerance. Low-evidence warnings use actual usable samples even if a large budget was requested. Adaptive checks reject fewer than two usable samples, zero charged stake, losing-only prefixes and known uncovered positive-weight selections. Checks remain independent per worker at chunk boundaries; all contributing workers must converge. `maxRounds` explicitly means the budget ended, including when tolerance was not attained. The merged interval is separate from the worst-worker adaptive half-width. An adaptive run that stopped before any check stores a null half-width and renders it as unavailable, rather than inventing a measured zero or persisting Infinity.

Native sampled outcome-library outputs retain their library provenance and statistics and now also project the ordinary saved simulation report. `pokie report` accepts both that projection and the older sampled shape. These sampled estimates are separate from static outcome-source analysis. Flattened artifact events cannot prove lifecycle; ordinary amount-only WASM artifacts supply amount-only observations, and custom sessions may lack lifecycle/component capabilities. Unassignable money stays in `unavailable` without losing total-win accounting.


## Canonical dossier preparation (V2C-27)

Assessment dossiers attach canonical schema-1 simulation reports and reproduce seeded mathematics through the same runner, preserving CI availability, worker seed strategy, feature attribution, logical/subround populations and per-mode denominators. Outcome-source projections label `reproducibility.libraryHash` separately from runtime `configHash`. Exact library distributions do not create sampled CIs or prove full model coverage. See [dossier reproduction](certification-evidence-bundle.md).
