[← Back to docs index](README.md)

# Modeling Slot Math with POKIE

This is an updated, API-verified walkthrough of the workflow described in
["Exploring Video Slot Math with POKIE"](https://medium.com/@sta-ger/exploring-video-slot-math-with-pokie-3bc7191b72a0)
— balancing RTP, hit frequency, and volatility for a video slot's math model.

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
import {VideoSlotConfig, VideoSlotSession, SymbolsSequence, Paytable, LeftToRightLinesPatterns} from "pokie";

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
[Paylines & Line Patterns](paylines-and-patterns.md) — e.g. dropping from 11 lines to 5 by using
`CustomLinesDefinitions` with only the lines you want, or building your own with `LinesDefinitionsFor5x3` as a
starting point.

## Step 4 — set the paytable

```ts
const paytable = new Paytable(config.getAvailableBets(), ["9","10","J","Q","K","A"], ["W"], 5);
paytable.setPayoutForSymbol("A", 5, 15); // 5-of-a-kind "A" pays 15x bet, across every available bet
config.setPaytable(paytable);
```

See [Paytable & Win Calculation](paytable-and-wins.md) for the full payout data model.

## Step 5 — compute the exact theoretical RTP

For strip sizes small enough to enumerate exhaustively, `SymbolsCombinationsAnalyzer.getAllPossibleSymbolsCombinations`
gives you every possible reel-stop combination, so you can compute RTP exactly rather than statistically:

```ts
import {SymbolsCombinationsAnalyzer, SymbolsCombination, VideoSlotWinCalculator} from "pokie";

const allCombinations = SymbolsCombinationsAnalyzer.getAllPossibleSymbolsCombinations(
    config.getSymbolsSequences(),
    config.getReelsSymbolsNumber(),
);

const winCalculator = new VideoSlotWinCalculator(config);
const bet = config.getAvailableBets()[0];

let totalWin = 0;
for (const combinationMatrix of allCombinations) {
    winCalculator.calculateWin(bet, new SymbolsCombination().fromMatrix(combinationMatrix));
    totalWin += winCalculator.getWinAmount();
}

const theoreticalRtp = totalWin / (allCombinations.length * bet);
```

This is combinatorially expensive — cost is the product of every reel strip's length (see
[Reels & Symbol Sequences](reels-and-sequences.md)) — so keep strips short while iterating on the model, and treat
this as a precision check rather than something you re-run on every tweak.

## Step 6 — validate with a Monte Carlo simulation

Once the theoretical RTP looks right, confirm it holds up under realistic random play using
[Simulation](simulation.md):

```ts
import {Simulation, SimulationConfig} from "pokie";

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

> An older version of this workflow (the linked Medium article) used `simulation.getRtp()` and direct property
> assignment for callbacks (`simulation.beforePlayCallback = ...`). Neither exists on the current API — use
> `simulation.getLastRtp()`/`getAverageRtp()` and `simulation.setBeforePlayCallback(...)` etc. instead (see
> [Simulation](simulation.md)).
