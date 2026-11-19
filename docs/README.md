# POKIE documentation

POKIE provides ISC-licensed game math, a headless JavaScript/TypeScript runtime, a CLI and a local
Studio. This folder is the API reference: what each public class/interface does, how to configure it,
and how to replace it.

For installation and a quick API example, see the [main README](../README.md). For complete example
games, see [pokie-examples](https://github.com/sta-ger/pokie-examples).

**Scope:** POKIE is a game-logic library, not a casino backend. It does not ship an RGS, a production
wallet/ledger, a compliance platform, a key-management service or a timestamping authority. It computes
round outcomes and wins and provides deterministic tooling on top of that. Wiring any of it into an
account, currency or compliance system is left to the integrating backend. `pokie serve` and `pokie dev`
are local/reference tools, not production infrastructure.

## Guides

1. **[Getting started](getting-started.md)** — install, create a session, play a round, read the results.
2. **[Game session and configuration](game-session.md)** — `GameSession`/`GameSessionConfig` and
   `VideoSlotSession`/`VideoSlotConfig`.
3. **[Reels and symbol sequences](reels-and-sequences.md)** — reel strips, spin results, combination
   generators, RNGs and grid analysis.
4. **[Paylines and patterns](paylines-and-patterns.md)** — line definitions and left-to-right,
   right-to-left or scattered matching.
5. **[Paytable and wins](paytable-and-wins.md)** — line, scatter, cluster, value and ways win
   calculators.
6. **[Free games](free-games.md)** — free-spin sessions and bonus-round tracking.
7. **[Resizable grid](resizable-grid.md)** — growing and shrinking grids between rounds.
8. **Bet modes** — base, ante and buy-feature runtime semantics (`src/session/videoslot/betmode/`).
9. **Hold & Win / Lock & Spin** — respin-and-collect mechanics (`src/session/videoslot/holdandwin/`).
10. **Jackpots** — fixed, local and progressive pools (`src/session/videoslot/jackpot/`).
11. **[Simulation](simulation.md)** — RTP, volatility, hit frequency, parallel workers and adaptive
    early stop.
12. **[Network serialization](serialization.md)** — plain-data payloads for a game client.
13. **[Round artifacts](round-artifacts.md)** — canonical hashable records of completed rounds.
14. **[Weighted outcome library](weighted-outcome-library.md)** — every possible outcome with its exact
    weight, and exact (not Monte Carlo) statistics.
15. **[Extension points](extension-points.md)** — injectable collaborators and session decorators.
16. **[Modeling slot math with POKIE](math-modeling.md)** — a worked walkthrough of balancing RTP, hit
    frequency and volatility.
17. **[Game packages](game-packages.md)** — the `PokieGame` contract and `pokie.entry` package
    convention.
18. **[CLI](cli.md)** — Studio, `create`, `init`, `build`, `sim`, `validate`, `report`, `diff`,
    `replay`, `serve`, `client`, `dev`, `par`, `reel`, `optimize`, `fairness`, `certification` and more.
19. **[Reel strip generation](reel-strip-generation.md)** — deterministic strip generation under
    constraints, including proportional symbol weights.
20. **[Pre-generated runtime](pregenerated-runtime.md)** — drawing and replaying rounds from a weighted
    outcome library.
21. **[Stake Engine export](stake-engine-export.md)** — exporting a weighted outcome library to the
    Stake Engine math-sdk format.
22. **[Stake Engine import](stake-engine-import.md)** — importing a POKIE-produced Stake Engine export.
23. **[Stake Engine standalone](stake-engine-standalone.md)** — reading, validating and analyzing any
    Stake Engine outcome directory.
24. **[Outcome library bundle](outcome-library-bundle.md)** — the on-disk persistence format for a
    weighted outcome library.
25. **[Certification evidence bundle](certification-evidence-bundle.md)** — deterministic evidence
    packages, model hashes, metrics and sampled rounds.
26. **[Provably fair](provably-fair.md)** — commit-reveal proofs for a single round drawn from an outcome
    library.
27. **[External adapter SDK](external-adapter-sdk.md)** — contracts for deploying a weighted outcome
    library to an external format or RGS-style target.
28. **[WASM compatibility boundary](wasm-compatibility-boundary.md)** — the versioned WASM component
    contract and supported execution limits.
29. **[Bounded mechanics](bounded-mechanics.md)** — authored cascade, respin and collection compositions.
30. **[Weighted bonus](weighted-bonus.md)** — finite weighted-bonus contracts.
31. **[Optimization](optimization.md)** — finite exact and bounded seeded math optimization.
32. **[Supported mechanics](supported-mechanics.md)** — the authored workflow and composition support
    matrix.
33. **[Studio long-running jobs](studio-long-running-jobs.md)** — job lifecycle, progress and
    cancellation.

## Core concepts at a glance

| Concept | Where |
|---|---|
| Placing bets, tracking credits, "can I play another round" | `GameSession` / `GameSessionConfig` |
| Reel strips, spinning, random symbol windows | `SymbolsSequence`, `SymbolsCombinationsGenerator` |
| Payline shapes and match rules | `LinesDefinitionsDescribing`, `LinesPatternsDescribing` |
| Payouts and what actually won | `Paytable`, `VideoSlotWinCalculator` |
| Free spins / bonus rounds | `VideoSlotWithFreeGamesSession` |
| Grids that grow or shrink | `VideoSlotWithResizableGridSession`, `GridResizeHandling` |
| Ante bet / buy-feature semantics | `BetMode.runtimeType`, `VideoSlotWithBetModesSession` |
| Respin-and-collect features | `VideoSlotWithHoldAndWinSession` |
| Fixed/local/progressive jackpots | `VideoSlotWithJackpotSession` |
| Bulk RTP testing and target scenarios | `Simulation`, play strategies |
| Sending round results to a client | `net/` serializers |
| Loading an external game package | `PokieGame`, `loadPokieGame` |
| Canonical round records and replay | `RoundArtifact`, `buildRoundArtifactFromSession` |
| Exact RTP over every outcome | `WeightedOutcomeLibrary`, `WeightedOutcomeLibraryAnalyzer` |
| Stake Engine interchange | `StakeEngineExporter`, `StakeEngineImporter` |
| Portable WASM execution | `@fromstan/pokie/wasm`, `src/wasm` |
| Local Studio | `pokie`, `pokie .` |

Every public class implements one or more of `*Describing`/`*Determining` (read), `*Setting` (write) and
`*Representing`/`*Handling` (both) interfaces. Depend on the narrowest interface your code needs.
