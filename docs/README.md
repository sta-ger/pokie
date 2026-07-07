# POKIE Documentation

**POKIE** is a server-side video slot game logic framework for JavaScript/TypeScript. This folder is the detailed
reference documentation: how the library is put together, what every subsystem does, and how the pieces compose.

For installation and a quick taste of the API, see the [main README](../README.md). For end-to-end example games,
see [pokie-examples](https://github.com/sta-ger/pokie-examples).

## Contents

1. **[Getting Started](getting-started.md)** — install, create a session, play a round, read the results.
2. **[Architecture & Conventions](architecture.md)** — the interface-per-role naming convention, composition over
   inheritance, package layout, and the dependency-injection style used throughout.
3. **[Game Session & Configuration](game-session.md)** — `GameSession`/`GameSessionConfig` (bet, credits, generic
   play loop) and `VideoSlotSession`/`VideoSlotConfig` (symbols, wilds, scatters, reels).
4. **[Reels & Symbol Sequences](reels-and-sequences.md)** — `SymbolsSequence` (a reel strip), `SymbolsCombination`
   (a spin result), `SymbolsCombinationsGenerator` (spinning the reels), RNGs, and `SymbolsCombinationsAnalyzer`
   (exhaustive combination enumeration for math work).
5. **[Paylines & Line Patterns](paylines-and-patterns.md)** — line definitions (grid shapes), line patterns
   (left-to-right / right-to-left / scattered matching), presets, and "ways to win".
6. **[Paytable & Win Calculation](paytable-and-wins.md)** — `Paytable`, `VideoSlotWinCalculator`, `WinningLine` /
   `WinningScatter` results, and the exact rules used to decide what wins.
7. **[Free Games](free-games.md)** — `VideoSlotWithFreeGamesSession`/`VideoSlotWithFreeGamesConfig` and how a free
   games (bonus) round is tracked and paid out.
8. **[Simulation](simulation.md)** — `Simulation`/`SimulationConfig`, RTP/volatility/hit-frequency statistics, and
   play strategies for driving targeted or bulk simulation runs.
9. **[Network Serialization](serialization.md)** — turning a session's state into plain-data payloads for a game
   client.
10. **[Modeling Slot Math with POKIE](math-modeling.md)** — a worked walkthrough of using POKIE to balance RTP,
    hit frequency, and volatility (an updated version of the ["Exploring Video Slot Math with
    POKIE"](https://medium.com/@sta-ger/exploring-video-slot-math-with-pokie-3bc7191b72a0) article).

## Core concepts at a glance

| Concept | Where |
|---|---|
| Placing bets, tracking credits, "can I play another round" | `GameSession` / `GameSessionConfig` |
| Reel strips, spinning, random symbol windows | `SymbolsSequence`, `SymbolsCombinationsGenerator` |
| Payline shapes and match rules | `LinesDefinitionsDescribing`, `LinesPatternsDescribing` |
| Payouts and what actually won | `Paytable`, `VideoSlotWinCalculator` |
| Free spins / bonus rounds | `VideoSlotWithFreeGamesSession`, `VideoSlotWithFreeGamesConfig` |
| Bulk RTP testing, targeted scenario capture | `Simulation`, play strategies |
| Sending round results to a client | `net/` serializers |

Every class pairs with one or more narrow interfaces (`*Describing`, `*Setting`, `*Determining`, `*Representing`,
`*Handling`). See [Architecture & Conventions](architecture.md) for why, and how that shapes extension points.
