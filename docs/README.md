# POKIE Documentation

**POKIE** is a server-side video slot game logic framework for JavaScript/TypeScript. This folder is the API
reference: what every class/interface does, its constructor and methods, and how to configure or replace it.

For installation and a quick taste of the API, see the [main README](../README.md). For end-to-end example games,
see [pokie-examples](https://github.com/sta-ger/pokie-examples).

**Scope:** POKIE is a game-logic library, not a casino backend — it doesn't ship an RGS, a wallet/ledger system, a
network transport, or player/session persistence. It computes what a round's outcome and win are; wiring that into
an account, currency, or compliance system is left to the integrating backend.

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
8. **[Simulation](simulation.md)** — `Simulation`/`SimulationConfig`, RTP/volatility/hit-frequency statistics, and
   play strategies for driving targeted or bulk simulation runs.
9. **[Network Serialization](serialization.md)** — turning a session's state into plain-data payloads for a game
   client.
10. **[Extension Points](extension-points.md)** — every injectable collaborator in the library, in one table, plus
    `AbstractVideoSlotSessionDecorator` for writing a session wrapper without re-implementing every passthrough
    method.
11. **[Modeling Slot Math with POKIE](math-modeling.md)** — a worked walkthrough of using POKIE to balance RTP,
    hit frequency, and volatility.
12. **[Game Packages](game-packages.md)** — the `PokieGame` contract, `pokie.entry` package.json convention, and
    `loadPokieGame`/`isPokieGame` for loading an external game as a standalone npm package.
13. **[CLI](cli.md)** — `pokie create <name>` (new directory) and `pokie init` (existing project), which scaffold
    a minimal game package, and `pokie sim <packageRoot>`, which runs a simulation against one and reports
    RTP/hit-frequency/max-win.

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
| Sending round results to a client | `net/` serializers |
| Loading an external game package by convention | `PokieGame`, `loadPokieGame` |
| Scaffolding a new game package | `pokie create <name>` / `pokie init` CLI |
| Running a quick RTP/hit-frequency report from the CLI | `pokie sim <packageRoot>` |

Every class implements one or more of `*Describing`/`*Determining` (read), `*Setting` (write), and `*Representing`/
`*Handling` (both) interfaces. Depend on the narrowest one your code actually needs.
