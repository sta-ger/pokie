# POKIE Documentation

**POKIE** is a server-side video slot game logic framework for JavaScript/TypeScript. This folder is the API
reference: what every class/interface does, its constructor and methods, and how to configure or replace it.

For installation and a quick taste of the API, see the [main README](../README.md). For end-to-end example games,
see [pokie-examples](https://github.com/sta-ger/pokie-examples).

**Scope:** POKIE is a game-logic library, not a casino backend — it doesn't ship an RGS, a real wallet/ledger
system, or any compliance/audit guarantee. It computes what a round's outcome and win are; wiring that into an
account, currency, or compliance system is left to the integrating backend. The one exception is `pokie serve`/
`pokie dev` (see [CLI](cli.md), item 13 below): an explicitly **experimental, dev/reference-only** HTTP transport
with a replaceable, in-memory-by-default `SessionRepository` and `WalletPort` — useful for local development and
previewing a game, but neither a substitute for a real backend nor RGS-grade in any sense.

## Contents

1. **[Getting Started](getting-started.md)** — install, create a session, play a round, read the results.
2. **[Game Session & Configuration](game-session.md)** — `GameSession`/`GameSessionConfig` (bet, credits, generic
   play loop) and `VideoSlotSession`/`VideoSlotConfig` (symbols, wilds, scatters, reels).
3. **[Reels & Symbol Sequences](reels-and-sequences.md)** — `SymbolsSequence` (a reel strip), `SymbolsCombination`
   (a spin result), the combination generators (fixed, variable-height, resizable), RNGs, and
   `SymbolsCombinationsAnalyzer` (grid analysis and transform utilities).
4. **[Paylines & Line Patterns](paylines-and-patterns.md)** — line definitions (grid shapes), line patterns
   (left-to-right / right-to-left / scattered matching), and presets.
5. **[Paytable & Win Calculation](paytable-and-wins.md)** — `Paytable`, `VideoSlotWinCalculator`, the line/scatter/
   cluster/value/ways win calculators, and per-symbol wild substitution.
6. **[Free Games](free-games.md)** — `VideoSlotWithFreeGamesSession`/`VideoSlotWithFreeGamesConfig` and how a free
   games (bonus) round is tracked and paid out.
7. **[Resizable Grid](resizable-grid.md)** — `VideoSlotWithResizableGridSession` and per-reel height changes between
   rounds, for features that grow or shrink the grid.
8. **[Simulation](simulation.md)** — `Simulation`/`SimulationConfig`, RTP/volatility/hit-frequency statistics, play
   strategies for driving targeted or bulk simulation runs, the pluggable base/freeGames/custom-category
   feature-level breakdown behind `pokie sim`'s `breakdown` field, and worker-thread parallelism via
   `pokie sim --workers`.
9. **[Network Serialization](serialization.md)** — turning a session's state into plain-data payloads for a game
   client.
10. **[Round Artifacts](round-artifacts.md)** — `RoundArtifact`/`RoundStepArtifact`, the canonical hashable record
    of a completed round built from already-computed runtime state (no second calculation path), the standard
    `PokieJsonRoundArtifactProjector` JSON projection with a stable content hash, and `RoundArtifactValidator`.
11. **[Weighted Outcome Library](weighted-outcome-library.md)** — `WeightedOutcomeLibrary`, a canonical, hashable
    enumeration of every possible round outcome (each a `RoundArtifact` plus its exact weight), and
    `WeightedOutcomeLibraryAnalyzer`'s exact — no Monte Carlo — RTP/hit-frequency/variance/payout-distribution
    statistics.
12. **[Extension Points](extension-points.md)** — every injectable collaborator in the library, in one table, plus
    `AbstractVideoSlotSessionDecorator` for writing a session wrapper without re-implementing every passthrough
    method.
13. **[Modeling Slot Math with POKIE](math-modeling.md)** — a worked walkthrough of using POKIE to balance RTP,
    hit frequency, and volatility.
14. **[Game Packages](game-packages.md)** — the `PokieGame` contract, `pokie.entry` package.json convention, and
    `loadPokieGame`/`isPokieGame` for loading an external game as a standalone npm package.
15. **[CLI](cli.md)** — `pokie build <config.json>`, which generates a working game package straight from a JSON
    `GameBlueprint` (reels, symbols, paylines, paytable, reel strips — literal, weighted, or build-time generated
    via `reelStripGeneration` and `ReelStripGenerator`), no compile step required; `pokie
    create <name>` (new directory) and `pokie init` (existing project), which scaffold
    a minimal game package; `pokie sim <packageRoot>`, which runs a simulation against one and reports
    RTP/hit-frequency/max-win; `pokie validate <packageRoot>`, which checks the `PokieGame` contract without
    playing it; `pokie inspect <packageRoot>`, which prints a generated package's provenance (game, blueprint
    hash, source, timestamp, `pokie` version) from `package.json`/`build-info.json` without running it; `pokie
    report <simulationReportJson>`, which renders a `pokie sim --out` report as Markdown or
    HTML; `pokie diff <leftReportJson> <rightReportJson>`, which compares two `pokie sim --out` reports;
    `pokie replay <packageRoot>`, which best-effort replays one round (by seed + round index) as a JSON artifact;
    `pokie serve <packageRoot>` (experimental), which starts a local/dev JSON HTTP server over a package — not a
    casino backend or RGS; `pokie client <packageRoot>` (experimental), a universal browser preview UI talking to
    a running `pokie serve`; `pokie dev <packageRoot>` (experimental), which runs both together; `pokie par
    import <input.xlsx>`, which imports a PAR sheet XLSX workbook (symbols, literal reel strips, paytable,
    paylines, available bets) into a `GameBlueprint` JSON file; `pokie par export <config.json>`, which
    exports a `GameBlueprint` back to a PAR sheet XLSX workbook; `pokie stakeengine export <config.json>`,
    which exports one or more `WeightedOutcomeLibrary` JSON files to the Stake Engine math-sdk static file format;
    and `pokie stakeengine import <stakeDir>`, which imports one back.
16. **[Reel Strip Generation](reel-strip-generation.md)** — `ReelStripGenerator`, generating a reel strip's fixed
    symbol sequence under constraints (exact counts, minimum/maximum circular distance, max run length, forbidden/
    required adjacency and exact-sequence patterns — directed/reversed matching, wrap-around — locked positions)
    either from exact counts or from proportional `symbolWeights` (via
    `LargestRemainderReelStripSymbolWeightsConverter`), and `ReelStripAnalyzer` for inspecting any strip. A
    design-time tool, separate from the runtime spin path.
17. **[Pre-Generated Runtime](pregenerated-runtime.md)** — `WeightedOutcomeSelector`, drawing a single round
    deterministically from a `WeightedOutcomeLibrary` (seed/RNG-injected, no game calculation path involved),
    `buildPreGeneratedRoundResult`/`PreGeneratedRoundResultValidator` for the runtime result this produces,
    `PreGeneratedRoundResultProjector` for its public/internal response split, `PreGeneratedRoundReplayer` for
    exact (not best-effort) reconstruction of a past round, and `PreGeneratedSpinCommandHandler`/
    `PokieDevServer`'s additive `/pregenerated-sessions` routes for serving it over HTTP with idempotency.
18. **[Stake Engine Export](stake-engine-export.md)** — exporting a canonical `WeightedOutcomeLibrary` (one per
    bet mode) to the real Stake Engine math-sdk static file format (`index.json`, per-mode lookup CSV, zstd-
    compressed JSONL books), `StakeEngineRoundEventsProjector`'s generic `RoundArtifact` → Stake "events"
    mapping, and `StakeEngineExporter`/`StakeEngineExportValidator`.
19. **[Stake Engine Import](stake-engine-import.md)** — reconstructing a `WeightedOutcomeLibrary` back from a
    Stake Engine export directory via `StakeEngineImporter`/`StakeEngineRoundEventsImporter`, the disclosed
    lossy-vs-lossless boundary (`roundId`/win breakdown/`provenance.pokieVersion` are substituted, everything
    else round-trips exactly), and the real round-trip property: import then re-export reproduces byte-identical
    Stake output.

## Core concepts at a glance

| Concept | Where |
|---|---|
| Placing bets, tracking credits, "can I play another round" | `GameSession` / `GameSessionConfig` |
| Reel strips, spinning, random symbol windows | `SymbolsSequence`, `SymbolsCombinationsGenerator` |
| Payline shapes and match rules | `LinesDefinitionsDescribing`, `LinesPatternsDescribing` |
| Payouts and what actually won | `Paytable`, `VideoSlotWinCalculator` |
| Free spins / bonus rounds | `VideoSlotWithFreeGamesSession`, `VideoSlotWithFreeGamesConfig` |
| Grids that grow/shrink between rounds | `VideoSlotWithResizableGridSession`, `GridResizeHandling` |
| Bulk RTP testing, targeted scenario capture | `Simulation`, play strategies |
| Sending round results to a client | `net/` serializers, wired into `pokie serve` via `PokieGame.getSessionSerializer()` |
| A sequence of stages within one round (cascades, multi-pick bonuses, ...) | `MultiStageRoundSessionSerializer`, `CascadeSessionSerializer` |
| Loading an external game package by convention | `PokieGame`, `loadPokieGame` |
| Generating a game package straight from a JSON blueprint (no compile step) | `pokie build <config.json>` CLI |
| Importing/exporting a GameBlueprint as a PAR sheet XLSX workbook | `pokie par import <input.xlsx>` / `pokie par export <config.json>` |
| Scaffolding a new game package | `pokie create <name>` / `pokie init` CLI |
| Running a quick RTP/hit-frequency report from the CLI | `pokie sim <packageRoot>` |
| Rendering a sim report as Markdown/HTML | `pokie report <simulationReportJson>` |
| Comparing two sim reports (e.g. before/after a config change) | `pokie diff <leftReportJson> <rightReportJson>` |
| Best-effort replay of a single round (by seed + round index) | `pokie replay <packageRoot>` |
| Local/dev JSON HTTP server over a package (experimental) | `pokie serve <packageRoot>` |
| Browser preview UI for a running `pokie serve` (experimental) | `pokie client <packageRoot>` |
| `pokie serve` + `pokie client` together, with a browser auto-opened (experimental) | `pokie dev <packageRoot>` |
| Generating a reel strip's symbol sequence under constraints (design-time, not runtime spin) | `ReelStripGenerator`, `ReelStripAnalyzer` |
| Canonical, hashable, storage/audit-grade record of a completed round | `RoundArtifact`, `buildRoundArtifactFromSession`, `PokieJsonRoundArtifactProjector` |
| Exact (no Monte Carlo) RTP/volatility/payout-distribution over every possible outcome | `WeightedOutcomeLibrary`, `buildWeightedOutcomeLibrary`, `WeightedOutcomeLibraryAnalyzer` |
| Exporting a `WeightedOutcomeLibrary` to the Stake Engine math-sdk static file format | `pokie stakeengine export <config.json>`, `StakeEngineExporter` |
| Importing a `WeightedOutcomeLibrary` back from a Stake Engine export directory | `pokie stakeengine import <stakeDir>`, `StakeEngineImporter` |

Every class implements one or more of `*Describing`/`*Determining` (read), `*Setting` (write), and `*Representing`/
`*Handling` (both) interfaces. Depend on the narrowest one your code actually needs.
