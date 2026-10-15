[← Back to docs index](README.md)

# Modeling Slot Math with POKIE

This is manual modeling, measurement, and iteration. Math Targeting/Optimization is an agreed direction
without an implementation in the reviewed repository; release scope remains unconfirmed. Reel strips,
visible rows, and resizable grids do not supply an explicit overscan model. Blueprint schema/editor mechanics
authoring covers win models, free games, and bet modes, but remains partial relative to composable runtime
mechanics. Blueprint symbol/reel/paytable reachability checks are limited checks, not generic mechanics/state
reachability. See the [status register](audit-corrections/README.md).

A worked walkthrough of using POKIE to balance RTP, hit frequency, and volatility for a video slot's math model.

## The vocabulary

- **RTP (Return to Player)** — the percentage of wagered money players can expect to recoup over time (e.g. 93%
  means, on average, 93 credits return for every 100 wagered).
- **Hit frequency** — how often a round produces any win at all (e.g. 0.62 means roughly 62% of rounds pay
  something).
- **Volatility** — low volatility means frequent, smaller wins; high volatility means rarer, bigger wins. Measured
  via the standard deviation of round payouts.

A slot's math model is defined by four things, all configurable on `VideoSlotConfig`
(see [Game Session & Configuration](game-session.md)): available symbols, reel symbol sequences, the paytable, and
the payline definitions.

## Step 1 — configure the game

```ts
import {VideoSlotConfig, VideoSlotSession, SymbolsSequence, Paytable, LeftToRightLinesPatterns} from "@fromstan/pokie";

const config = new VideoSlotConfig();
config.setReelsNumber(5);
config.setReelsSymbolsNumber(3);
config.setAvailableSymbols(["9", "10", "J", "Q", "K", "A", "W", "S"]);
config.setWildSymbols(["W"]);
config.setScatterSymbols(["S"]);
```

## Step 2 — design the reel strips

Reel strip composition is the main RTP/volatility lever: rarer symbols on the strip pay more but hit less often.
Build one `SymbolsSequence` per reel — either an exact count per symbol, or a weighted distribution:

```ts
const symbolsNumbers = {"9": 20, "10": 20, "J": 15, "Q": 15, "K": 7, "A": 6, "S": 5};

const sequences = new Array(config.getReelsNumber())
    .fill(0)
    .map(() => new SymbolsSequence().fromNumbersOfSymbols(symbolsNumbers).shuffle());

config.setSymbolsSequences(sequences);
```

`fromNumbersOfSymbols` takes an exact count per symbol; `fromSymbolsWeights` takes percentages (which must sum to
100) plus a target strip length. See [Reels & Symbol Sequences](reels-and-sequences.md) for the full API and its
gotchas (the `from*` builders replace strip contents rather than append to them).

## Step 3 — reduce or expand paylines

Fewer paylines concentrate the same total bet into fewer, more impactful winning positions; more paylines smooth out
variance. Presets and custom definitions are covered in
[Paylines & Line Patterns](paylines-and-patterns.md) — e.g. dropping to 5 hand-picked lines via
`CustomLinesDefinitions`, or starting from `LinesDefinitionsFor5x3`'s 25 preset lines and trimming it down.

## Step 4 — set the paytable

```ts
const paytable = new Paytable(config.getAvailableBets(), ["9","10","J","Q","K","A"], ["W"], 5);
paytable.setPayoutForSymbol("A", 5, 15); // 5-of-a-kind "A" pays 15x bet, across every available bet
config.setPaytable(paytable);
```

See [Paytable & Win Calculation](paytable-and-wins.md) for the full payout data model, and for cluster/value/ways
win styles if your game isn't fixed-payline-based.

## Step 5 — compute the exact theoretical RTP

For strip sizes small enough to enumerate exhaustively, `SymbolsCombinationsAnalyzer.getAllPossibleSymbolsCombinations`
gives you every possible reel-stop combination, so you can compute RTP exactly rather than statistically:

```ts
import {SymbolsCombinationsAnalyzer, SymbolsCombination, VideoSlotWinCalculator} from "@fromstan/pokie";

const allCombinations = SymbolsCombinationsAnalyzer.getAllPossibleSymbolsCombinations(
    config.getSymbolsSequences(),
    config.getReelsSymbolsNumber(),
);

const winCalculator = new VideoSlotWinCalculator(config);
const bet = config.getAvailableBets()[0];

// dedupe identical grids (different reel stops can render the same visible symbols) so
// calculateWin only runs once per unique grid, weighted by how often it actually occurs
const uniqueCombinations = SymbolsCombinationsAnalyzer.getUniqueCombinationsWithWeights(allCombinations);
const combinationProbability = SymbolsCombinationsAnalyzer.getCombinationProbability(config.getSymbolsSequences());

let expectedWinPerBet = 0;
for (const {combination, weight} of uniqueCombinations) {
    winCalculator.calculateWin(bet, new SymbolsCombination().fromMatrix(combination));
    expectedWinPerBet += (winCalculator.getWinAmount() / bet) * weight * combinationProbability;
}

const theoreticalRtp = expectedWinPerBet;
```

This is combinatorially expensive — cost is the product of every reel strip's length (see
[Reels & Symbol Sequences](reels-and-sequences.md)) — so keep strips short while iterating on the model, and treat
this as a precision check rather than something you re-run on every tweak.

## Step 6 — validate with a Monte Carlo simulation

Once the theoretical RTP looks right, confirm it holds up under realistic random play using
[Simulation](simulation.md):

```ts
import {Simulation, SimulationConfig} from "@fromstan/pokie";

const session = new VideoSlotSession(config);

const simulationConfig = new SimulationConfig();
simulationConfig.setNumberOfRounds(100_000);

const simulation = new Simulation(session, simulationConfig);
simulation.run();

simulation.getAverageRtp();               // should converge close to theoreticalRtp
simulation.getHitFrequency();             // how often rounds pay anything
simulation.getPayoutsStandardDeviation(); // volatility indicator
```

If the simulated RTP diverges noticeably from the theoretical one, or hit frequency/volatility don't match the
target player experience, go back to steps 2–4: adjust symbol distribution on the reel strips, tweak paytable
payouts, or change how many paylines are active — then re-run steps 5–6 until the numbers land where you want them.

## Weighted whole sequences

For variant `v` of reel `r`, a joint variant/stop event has probability
`weight[v] / sum(weights) / length[v]`. POKIE currently requires equal variant
lengths within each reel, so its joint enumeration assigns the variant's exact
integer relative weight to each circular stop. Lengths may differ between reels.
Across independent reels the joint event mass is the product of those weights.

`SymbolsCombinationsAnalyzer.getWeightedCombinations()` returns grid probabilities;
`getCombinationProbability()` rejects weighted inputs because there is no single
uniform tuple probability. Outcome-library generation sweeps the same ordered
variant/stop events, merges mass for identical grids in memory or disk partitions,
and evaluates each grid through the existing forced-session seam. A deduplicated
artifact does not claim one arbitrary variant ID for several possible sources.
Exact source identity includes all authored IDs, arrays, weights and ordering,
including zero-weight alternatives; incompatible checkpoints are rejected.

A tiny fixture uses a 1:3 all-A/all-B reel, an exact all-A reel, and a two-A line
paying four times stake. Its exact RTP is `1/4 * 4 = 1`. Seeded runtime and sampled
libraries use the same distribution. Positive numeric probability underflow is an
explicit exact-analysis/export boundary, while runtime selection retains exact
binary64 weight ratios. See [the reel contract](reels-and-sequences.md#weighted-whole-sequence-reels).

## Authored wilds and screen modifiers

`GameBlueprint.mechanics.modifiers` is finite data with two ordered arrays:
`wilds` declares `{symbol, substitutes?, factor?}` and `rules` declares the
catalogue below. Wild symbols must also appear in `blueprint.wilds`. Omitted
`substitutes` means unrestricted substitution; `[]` forbids it. An omitted
factor means 1; an explicit 0 suppresses that component's payout.

| Catalogue variant | Rule / declaration | Playable Blueprint |
| --- | --- | --- |
| Expanding wild | `expand`, `symbol`, trigger `positions` | `examples/blueprints/wild-expanding.blueprint.json` |
| Sticky wild | `sticky`, `symbol`, acquisition `positions`, integer `lifetime` | `examples/blueprints/wild-sticky.blueprint.json` |
| Restricted wild | Wild `substitutes` array | `examples/blueprints/wild-restricted.blueprint.json` |
| Multiplier wild | Wild nonnegative finite `factor` | `examples/blueprints/wild-multiplier.blueprint.json` |
| Symbol transform | `transform`, `from`, `to`, target `positions` | `examples/blueprints/wild-transform.blueprint.json` |
| Reel fill | `reel`, `symbol`, `reels`, empty `positions` | `examples/blueprints/wild-reel.blueprint.json` |

Every rule has a unique nonempty `id`, `space` and explicit `positions` array.
Positions are integer `[reel,row]` pairs in `generated`, `visible` or `evaluated`
space. Invalid domain coordinates fail validation. Valid cells outside evaluation
are ignored: they cannot transform, trigger expansion or acquire sticky state.
`reel` is unconditional and requires `space: "evaluated"`; its unique `reels`
indexes select whole evaluated columns. All effects preserve generated dimensions,
geometry tags and cells outside evaluation.

The execution order is generate → run rules in array order in the evaluated
window → evaluate → apply wild factors to each component → aggregate → settle.
A rule sees the screen produced by earlier rules. Expansion tests its listed
cells and fills each triggered reel's evaluated rows. Later writes win. Duplicate
positions, identities, wild declarations, unknown fields/symbols and unsupported
compositions are errors. There is no implicit object-key order or hidden trigger.
Initialization and result reads do not execute rules or draw modifier randomness.

Each line, ways or cluster component is multiplied by the product of factors at
its **unique winning coordinates**, once per position. The ways product applies
to the complete component (including its ways count), not separately to each
way. Separate winning lines each receive their own factors. Losing cells and
scatter components contribute no factors. Overflow fails before settlement.
Existing evaluator target selection is retained: all-wild lines have no regular
target and pay zero even when a wild has an own paytable entry; ways excludes wild
paytable targets. A mixed line pays its regular target's entry. For `[A,W2,W3]`,
restrictions to A, paytable A/3 = 10, factors 2 and 3, and bet 0.05, payout is
`0.05 × 10 × 2 × 3 = 3`.

Sticky acquisition occurs at its rule's position in the ordered sequence, after
earlier rules. It retains that rule's wild and factor identity, reapplies it at
the same point in each subsequent step, then decrements its lifetime. Lifetime
includes acquisition; a retained cell is not refreshed while retained. Its last
application has remaining 0 and is then removed; a later step can acquire again.
Later rules may overwrite the current screen without rewriting the retained
identity. Counters advance per executed step across paid spins, free continuations
and mode changes, not per logical round or response. New sessions start empty;
failed evaluation/settlement and duplicate delivery cannot commit another advance.

All six variants compose with line, ways and cluster win models, exact/weighted
reel sources, supported geometry, free games, bet modes and jackpots. Hold & Win
and value evaluators are explicitly unsupported with these declarations. WASM
rejects all modifiers. Persistent sticky rules block independent-spin exact
outcome enumeration and its downstream conversions; stateless rules use the same
session payout path during enumeration. Custom callbacks retain their custom
capability/extraction boundary. See [serialization](serialization.md) and
[the implementation evidence record](v2-completion/V2C-13.md).
