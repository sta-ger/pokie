# Architecture and extension points

POKIE is headless: presentation is a consumer of math/runtime results. Interfaces are paired with classes so authors can compose collaborators rather than fork a hierarchy. [Public root exports](../../src/index.ts) and [extension guide](../../docs/extension-points.md) locate the contracts.

## Domain and session composition

`PokieGame` supplies manifest, session factory and explicit optional capabilities. `VideoSlotSession` composes config, a `SymbolsCombinationsGenerating` collaborator, a `VideoSlotWinCalculating` collaborator and a base session. Authored decorators model feature progress. Custom packages can implement their own sessions while declaring only the operations they actually support.

[PokieGame](../../src/gamepackage/PokieGame.ts) · [VideoSlotSession](../../src/session/videoslot/VideoSlotSession.ts) · [SymbolsCombinationsGenerating](../../src/session/videoslot/combinations/SymbolsCombinationsGenerating.ts) · [VideoSlotWinCalculating](../../src/session/videoslot/wincalculator/VideoSlotWinCalculating.ts)

## Calculation and command orchestration

`VideoSlotWinCalculator` and `SharedSlotMath` evaluate math; `SessionRuntimeHandling` / `SessionRuntime` validate commands, own logical-round continuation and expose results. They do not create a second math engine. CLI, Studio, direct-library callers and local HTTP adapters consume these shared runtime contracts. `SpinCommandHandler` adapts the command boundary to repository/wallet ports.

`net` serializers, `PublicRoundArtifactProjector` and the canonical player project visible results. They do not determine payouts or establish restoration capability. [Calculation](../../src/session/videoslot/wincalculator/VideoSlotWinCalculator.ts), [shared math](../../src/wasm/math/SharedSlotMath.ts), [runtime interface](../../src/runtime/SessionRuntimeHandling.ts), [runtime](../../src/runtime/SessionRuntime.ts), [public projection](../../src/artifact/PublicRoundArtifactProjector.ts).

## State and persistence

Executable state contains the complete future-relevant composition, including custom codec data, current feature progress, logical-round selections and seeded RNG continuation. A serializer that emits a nice screen is not a complete state codec. Live-only custom sessions remain usable for supported live operations but cannot claim durable restoration or executable audit replay. Public visible results and private audit/debug evidence have different disclosure boundaries. [State contracts](../../src/session/SessionStateRestoring.ts), [serialization guide](../../docs/serialization.md).

`FileSessionRepository` persists session state; it does not make independent wallet/result/idempotency/operation-log ports atomic or durable together. `TransactionalRoundStore` is the explicit atomic commit contract. `SqliteTransactionalRoundStore` is a local reference implementation with its own transaction boundary. Independent ports do not inherit its guarantees. [Session repository](../../src/server/session/FileSessionRepository.ts), [atomic interface](../../src/server/storage/TransactionalRoundStore.ts), [SQLite store](../../src/server/storage/SqliteTransactionalRoundStore.ts).

## Wallet and settlement

Wallet settlement is outside payout calculation. `SpinCommandHandler` coordinates it; external-wallet flows use `SpinReconciliationService`, a durable local outbox and a provider capability contract. Local transaction authority does not create distributed ACID with an external provider. Outcome-source settlement paths have weaker guarantees; Studio Play is process-only. [Command handler](../../src/server/spin/SpinCommandHandler.ts), [reconciliation](../../src/server/spin/SpinReconciliationService.ts), [wallet ports](../../src/server/wallet/), [external store](../../src/server/storage/ExternalRoundStore.ts).

## Extend and own resources

The checked-in [consumer extension](../../tests/v2/fixtures/RuntimeExtension.ts) composes a delegating custom win calculator through public imports and an explicit complete state contract, then executes it at the repository/wallet boundary. Delegating calculators with no hidden future state can use the compatible seeded codec; stateful custom collaborators must provide their complete codecs instead of copying that opt-in assertion.

Direct consumers own lifetimes. A loaded game/runtime must be released in `finally`; call `SessionRuntime.release()` for retained command state and `discard` for unsaved optimizer candidates. Cancel and drain all owned work before closing a store or releasing shared runtime state. The [complete session example](cli-api.md#root-esm-and-commonjs) demonstrates runtime release; the [optimizer example](optimization.md#direct-library-ownership) demonstrates candidate discard. With `loadPokieGameRuntime`, release both the game's optional resources (`game.release?.()`) and the loaded runtime lease (`loaded.release()`) after consumers have drained.

Production integration still owns deployment, accounts, wallet provider contracts and compliance. [Local server boundaries](server.md).
