# POKIE documentation

POKIE is an ISC-licensed toolkit for video-slot game math, a headless JavaScript/TypeScript runtime, a
CLI and a local Studio. This folder is the reference: what each public class and interface does, how to
configure it, and how to replace it.

For installation and a quick API example, see the [main README](../README.md). For complete example
games, see [pokie-examples](https://github.com/sta-ger/pokie-examples). For the words POKIE uses, see the
[glossary](glossary.md).

**Scope:** POKIE is a game-logic library, not a casino backend. It does not ship an RGS, a production
wallet or ledger, a compliance platform, a key-management service or a timestamping authority. It
computes round outcomes and wins and provides reproducible tooling on top of that. Wiring any of it into
an account, currency or compliance system is left to the integrating backend. `pokie serve` and `pokie
dev` are local/reference tools, not production infrastructure.

## Start here

1. **[Getting started](getting-started.md)** — install, create a session, play a round, read the results.
2. **[Glossary](glossary.md)** — the seven objects, slot terms, build terms and audit terms.
3. **[Modeling slot math with POKIE](math-modeling.md)** — a worked walkthrough of balancing RTP, hit
   frequency and volatility.

## Game model

4. **[Game session and configuration](game-session.md)** — `GameSession`/`GameSessionConfig` and
   `VideoSlotSession`/`VideoSlotConfig`.
5. **[Reels and symbol sequences](reels-and-sequences.md)** — reel strips, spin results, combination
   generators, RNGs and grid analysis.
6. **[Paylines and patterns](paylines-and-patterns.md)** — line definitions and left-to-right,
   right-to-left or scattered matching.
7. **[Paytable and wins](paytable-and-wins.md)** — line, scatter, cluster, value and ways win
   calculators.
8. **[Free games](free-games.md)** — free-spin sessions and bonus-round tracking.
9. **[Resizable grid](resizable-grid.md)** — growing and shrinking grids between rounds.
10. **Bet modes** — base, ante and buy-feature runtime semantics. See
    [Supported mechanics](supported-mechanics.md).
11. **Hold & Win / Lock & Spin** — respin-and-collect mechanics. See
    [Supported mechanics](supported-mechanics.md).
12. **Jackpots** — fixed, local and progressive pools. See [Supported mechanics](supported-mechanics.md).

## Build and test

13. **[Simulation](simulation.md)** — RTP, volatility, hit frequency, parallel workers and adaptive
    early stop.
14. **[Reel strip generation](reel-strip-generation.md)** — reproducible strip generation under
    constraints, including proportional symbol weights.
15. **[Outcome library](weighted-outcome-library.md)** — every possible outcome with its exact weight,
    and exact (not Monte Carlo) statistics.
16. **[Outcome library folder](outcome-library-bundle.md)** — the on-disk storage format for an outcome
    library.
17. **[Pre-generated runtime](pregenerated-runtime.md)** — drawing and replaying rounds from an outcome
    library.
18. **[Optimization](optimization.md)** — exact and seeded math optimization within declared limits.
19. **[Supported mechanics](supported-mechanics.md)** — the authored workflow and composition support
    matrix.
20. **[Feature chains with limits](bounded-mechanics.md)** — authored cascade, respin and collection
    compositions.
21. **[Weighted bonus](weighted-bonus.md)** — finite weighted-bonus outcomes.

## Replay and audit

22. **[Round records](round-records.md)** — stable, hashable records of completed rounds.
23. **[Network serialization](serialization.md)** — plain-data payloads for a game client.
24. **[Provably fair](provably-fair.md)** — commit-reveal proofs for a single round drawn from an outcome
    library.
25. **[Certification pack](certification-pack.md)** — the evidence folder, hashes, metrics and sampled
    rounds prepared for an auditor.

## Integrations

26. **[Game packages](game-packages.md)** — the `PokieGame` interface and `pokie.entry` package
    convention.
27. **[Stake Engine export](stake-engine-export.md)** — exporting an outcome library to the Stake Engine
    math-sdk format.
28. **[Stake Engine import](stake-engine-import.md)** — importing a POKIE-produced Stake Engine export.
29. **[Stake Engine standalone](stake-engine-standalone.md)** — reading, validating and analyzing any
    Stake Engine outcome directory.
30. **[External connector SDK](external-adapter-sdk.md)** — interfaces for delivering an outcome library
    to an external format or RGS-style target.
31. **[WASM compatibility](wasm-compatibility-boundary.md)** — the versioned WASM component interface and
    supported execution limits.
32. **[Extension points](extension-points.md)** — replaceable collaborators and session decorators.
33. **[Studio jobs](studio-long-running-jobs.md)** — job status, progress and cancellation.

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
| Sending round results to a client | network serializers |
| Loading an external game package | `PokieGame`, `loadPokieGame` |
| Round records and replay | `RoundRecord`, `buildRoundRecordFromSession` |
| Exact RTP over every outcome | `WeightedOutcomeLibrary`, `WeightedOutcomeLibraryAnalyzer` |
| Stake Engine exchange | `StakeEngineExporter`, `StakeEngineImporter` |
| Portable WASM execution | `@fromstan/pokie/wasm`, `src/wasm` |
| Local Studio | `pokie`, `pokie .` |

The public API also uses role interfaces: `*Describing`/`*Determining` for reads, `*Setting` for writes,
and `*Representing`/`*Handling` for both. Depend on the narrowest interface your code needs.
