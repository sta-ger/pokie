[← Back to docs index](README.md)

# Extension Points

Every customizable behavior in POKIE is an interface implementation injected through a constructor default
parameter — `new VideoSlotSession()` with no arguments gives a complete, playable game; you override only the
collaborators you need to change. All parameters below are optional with a working default unless marked
**required**.

| Want to customize... | Implement | Inject into | Details |
|---|---|---|---|
| How lines are turned into wins | `LineWinCalculating<T>` | `VideoSlotWinCalculator`'s 2nd constructor arg | [Paytable & Win Calculation](paytable-and-wins.md#replacing-linescatter-win-logic-entirely) |
| How scatters are turned into wins | `ScatterWinCalculating<T>` | `VideoSlotWinCalculator`'s 3rd constructor arg | [Paytable & Win Calculation](paytable-and-wins.md#replacing-linescatter-win-logic-entirely) |
| Cluster (adjacency) pays | `ClusterWinCalculating<T>` | `VideoSlotWinCalculator`'s 4th constructor arg (opt-in, no default) | [Paytable & Win Calculation](paytable-and-wins.md#cluster-pays) |
| Per-symbol value pays | `ValueWinCalculating<T>` | `VideoSlotWinCalculator`'s 5th constructor arg (opt-in, no default) | [Paytable & Win Calculation](paytable-and-wins.md#value-pays) |
| Ways-to-win pays | `WaysWinCalculating<T>` | `VideoSlotWinCalculator`'s 6th constructor arg (opt-in, no default) | [Paytable & Win Calculation](paytable-and-wins.md#ways-to-win) |
| How multiple evaluator groups are aggregated | `WinAggregationPolicy<T>` | `VideoSlotWinCalculator`'s 7th constructor arg via `VideoSlotWinCalculatorOptions` | [Paytable & Win Calculation](paytable-and-wins.md#aggregation-policy) |
| How symbol-driven multipliers are resolved | `MultiplierResolver<T>` | `VideoSlotWinCalculator`'s 7th constructor arg via `VideoSlotWinCalculatorOptions` | [Paytable & Win Calculation](paytable-and-wins.md#multipliers) |
| Whether validation runs on every evaluate call | — `validateOnEvaluate` via `VideoSlotWinCalculatorOptions` / `WinEvaluationPipelineOptions` | `VideoSlotWinCalculator` / `WinEvaluationPipeline` | [Paytable & Win Calculation](paytable-and-wins.md#aggregation-policy) |
| Which symbols a wild is allowed to substitute for | — call `VideoSlotConfig.setWildSubstitutions(...)` | picked up automatically by line/cluster/ways calculators | [Paytable & Win Calculation](paytable-and-wins.md#per-symbol-wild-substitution) |
| How reel strips are auto-generated | `ReelsSymbolsSequencesGenerating<T>` | `VideoSlotConfig`'s 2nd constructor arg | [Game Session & Configuration](game-session.md#reel-sequence-auto-generation) |
| The RNG behind reel spins | `RandomNumberGenerating` | `SymbolsCombinationsGenerator`/`VariableHeightSymbolsCombinationsGenerator`/`ResizableSymbolsCombinationsGenerator`'s last constructor arg | [Reels & Symbol Sequences](reels-and-sequences.md#rngs) |
| How a spin's grid is generated (fixed/random/persistent height) | `SymbolsCombinationsGenerating<T>` | `VideoSlotSession`'s 2nd constructor arg | [Reels & Symbol Sequences](reels-and-sequences.md#combination-generators--spinning-the-reels) |
| The generic play loop's win amount | `WinAmountDetermining` | `GameSession`'s 2nd constructor arg (defaults to `NoWinAmount`) | [Game Session & Configuration](game-session.md) |
| Free-games bank/retrigger bookkeeping | `FreeGamesRoundHandling<T>` | `VideoSlotWithFreeGamesSession`'s 5th constructor arg | [Free Games](free-games.md#custom-bonus-mechanics) |
| Grid resize policy between rounds | `GridResizeHandling<T>` | `VideoSlotWithResizableGridSession`'s 3rd constructor arg (**required**, no default) | [Resizable Grid](resizable-grid.md) |
| How cascade refills are supplied | `CascadeRefillProviding<T>` | `CascadingSpinResolver`'s 3rd constructor arg (**required**) | [Paytable & Win Calculation](paytable-and-wins.md#cascade-status) |
| Play-strategy gating for simulations | `NextSessionRoundPlayableDetermining` | `SimulationConfig.setPlayStrategy(...)` | [Simulation](simulation.md#play-strategies-nextsessionroundplayabledetermining) |
| Bet size per simulated round | `BetForNextSimulationRoundSetting` | `SimulationConfig.setChangeBetStrategy(...)` | [Simulation](simulation.md#bet-changing-strategy) |
| What a serializer's base layer contributes | `GameSessionSerializing` / `VideoSlotSessionSerializing` | the next serializer up's constructor arg | [Network Serialization](serialization.md) |

## `AbstractVideoSlotSessionDecorator` — writing your own session decorator without the boilerplate

Wrapping a `VideoSlotSessionHandling` to change one or two methods (the way `VideoSlotWithFreeGamesSession` wraps
`VideoSlotSession` to add free-games bookkeeping around `play()`) otherwise means hand-writing a pass-through for
every other method on a fairly wide interface. `AbstractVideoSlotSessionDecorator<T>` is exactly that pass-through,
written once:

```ts
import {AbstractVideoSlotSessionDecorator, VideoSlotSessionHandling} from "pokie";

class LoggingSession<T extends string | number | symbol = string> extends AbstractVideoSlotSessionDecorator<T> {
    public override play(): void {
        console.log("playing round, bet =", this.getBet());
        super.play();
        console.log("win =", this.getWinAmount());
    }
}

const session = new LoggingSession(new VideoSlotSession());
```

It holds no state of its own — just `protected readonly baseSession` and one delegating method per interface
member — so overriding a method or two is all you need to write. Both `VideoSlotWithFreeGamesSession` and
`VideoSlotWithResizableGridSession` are built this way — read either as a worked example.
