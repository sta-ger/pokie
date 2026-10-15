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
| Feature-level breakdown category per simulated round | `SimulationRoundCategoryDetermining` | `AggregateSimulationRunner`'s 4th constructor arg | [Simulation](simulation.md#feature-level-breakdown-simulationroundcategorydetermining) |
| Declaring a round's breakdown category from the session itself | `SimulationCategoryDetermining` | implement on any `GameSessionHandling` (feature-detected) | [Simulation](simulation.md#declaring-a-category-explicitly-simulationcategorydetermining) |
| What a serializer's base layer contributes | `GameSessionSerializing` / `VideoSlotSessionSerializing` | the next serializer up's constructor arg | [Network Serialization](serialization.md) |

## `AbstractVideoSlotSessionDecorator` — writing your own session decorator without the boilerplate

Wrapping a `VideoSlotSessionHandling` to change one or two methods (the way `VideoSlotWithFreeGamesSession` wraps
`VideoSlotSession` to add free-games bookkeeping around `play()`) otherwise means hand-writing a pass-through for
every other method on a fairly wide interface. `AbstractVideoSlotSessionDecorator<T>` is exactly that pass-through,
written once:

```ts
import {AbstractVideoSlotSessionDecorator, VideoSlotSessionHandling} from "@fromstan/pokie";

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

## Headless runtime contract

The public root exports `SessionRuntimeHandling`, `SessionRuntime`, `SessionCommand`, `SessionCommandResult`, `RepositoryCommandHandling`, `RepositoryCommand`, `GameSessionIdentity`, `SessionStateRestoring`, `SpinCommandHandler`, and the existing repository/codec interfaces. Compose these around `PokieGame` and injected `GameSessionHandling` collaborators; no private imports or new package subpath are required. The maintained consumer example is `tests/v2/fixtures/RuntimeExtension.ts` in the repository; its focused test emits candidate declarations and strictly resolves both root ESM and CJS export conditions. Custom durable sessions explicitly promise a complete codec and validate opaque state before recovery; built-in subclasses do not inherit a completeness promise for added hidden state.

### Transactional round storage

`TransactionalRoundStore` is the explicit canonical round boundary. Its transaction
callback receives `RoundTransaction` (versioned sessions, result repository, operation
log and local ledger) tied to one owning transaction. Implementations must acquire
cross-process ownership before loading/constructing/calculating, preserve supplied intent
identity, roll back non-played results/exceptions, commit the whole tuple before success,
return detached historical results and drain accepted calls on close. Existing independent
port implementations do not gain this contract by sharing a database filename.

`SqliteTransactionalRoundStore.open(filename, {lockWaitMs})` is the durable WAL/FULL
reference implementation, lazily loading optional Node SQLite. `ReferenceRoundLedger`
is a callback-owned **test/reference** participant; it cannot make external wallets ACID,
and forbids separate compensation. Public root ESM/CJS declarations include these APIs;
browser/portable entry points remain independent. See
[configuration, schema, identity and recovery](game-session.md#durable-transactional-reference-rounds).
`new SpinCommandHandler(game, store, captureOptions)` uses the existing `SessionRuntime`
and capture/authority contracts. Direct initialize/readSession/lookupResult/close APIs
support reopen without domain execution. A server's `transactionalRoundStore` option
accepts exclusive ownership; pre-generated/outcome-source and Studio Play remain on
separate, weaker settlement paths.

`ExternalRoundStore` / `SqliteExternalRoundStore` compose a durable local outbox with a
`DurableWalletPort`; declared durability and inspection capabilities require provider
verification. Session fencing, permanent settlement IDs, calculated continuation and saved
responses survive local restart. This composition reconciles independent stores and never
claims distributed ACID. Legacy independent repositories and wallets remain weaker
compensation configurations. See [external settlement](game-session.md#durable-external-wallet-reconciliation).

### Declarative modifier boundary

For expanding/sticky/restricted/multiplier wilds, transforms and reel fills, use
`VideoSlotConfig.setScreenModifiers` or Blueprint `mechanics.modifiers`; the
[math contract](math-modeling.md#authored-wilds-and-screen-modifiers) specifies
ordering and supported combinations. `ScreenModifierHandling` describes the
finite interpreter. Its proposed state is committed by `VideoSlotSession` only
after successful settlement. Arbitrary generators, transform callbacks,
calculators and multiplier `combine` callbacks remain custom. A model descriptor
preserves declared data but does not certify callback equivalence; list executable
limitations in `unsupported` instead of flattening them into a Blueprint.
