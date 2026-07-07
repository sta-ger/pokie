[← Back to docs index](README.md)

# Getting Started

## Install

```
npm install pokie
```

POKIE ships both ESM and CJS builds plus type declarations, so it works from `import` or `require` in JS or TS.

## Play a round

```ts
import {VideoSlotSession} from "pokie";

const session = new VideoSlotSession(); // default 5x3 game, symbols A/K/Q/J/10/9, wild "W", scatter "S"

session.setBet(10);
session.play();

session.getSymbolsCombination().toMatrix(); // string[][] — the symbols shown on screen
session.getWinAmount();                     // total win for this round
session.getWinningLines();                  // Record<string, WinningLineDescribing>
session.getWinningScatters();               // Record<string, WinningScatterDescribing>
session.getCreditsAmount();                 // credits after the bet was placed and the win added
```

`new VideoSlotSession()` wires up sensible defaults for every collaborator (config, combinations generator, win
calculator, base session) — see [Architecture & Conventions](architecture.md) for how constructor injection is used
throughout the library, and [Game Session & Configuration](game-session.md) for how to customize the game (symbols,
reels, paytable, lines).

> **⚠️ Before you ship real money on this:** the default RNG behind reel spins (`PseudorandomNumberGenerator`) is
> `Math.random()`-based — not cryptographically secure, and not something a regulator/certification lab will
> accept. For real-money/regulated games, pass `SecureRandomNumberGenerator` explicitly instead — see
> [Reels & Symbol Sequences](reels-and-sequences.md#rngs).

## Determinism/audit gotcha

Two pieces are relevant if you need to reproduce or audit a specific round:

- `SeededRandomNumberGenerator(seed)` — a deterministic PRNG; the same seed always produces the same sequence of
  draws, for reproducible tests/replays/demos. Not cryptographically secure — don't use it for real-money play.
- `SymbolsCombinationsGenerator.getLastStopPositions()` — the per-reel stop position (index into that reel's
  `SymbolsSequence`) that produced the most recently generated combination, so you can reconstruct or log exactly
  how a round's outcome was produced.

## Where to go next

- Want to change symbols, reels, paytable, or paylines? → [Game Session & Configuration](game-session.md)
- Want free spins / bonus rounds? → [Free Games](free-games.md)
- Want to balance RTP/volatility or run bulk simulations? → [Simulation](simulation.md) and
  [Modeling Slot Math with POKIE](math-modeling.md)
- Want to send round results to a game client? → [Network Serialization](serialization.md)
