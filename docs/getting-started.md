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

## Where to go next

- Want to change symbols, reels, paytable, or paylines? → [Game Session & Configuration](game-session.md)
- Want free spins / bonus rounds? → [Free Games](free-games.md)
- Want to balance RTP/volatility or run bulk simulations? → [Simulation](simulation.md) and
  [Modeling Slot Math with POKIE](math-modeling.md)
- Want to send round results to a game client? → [Network Serialization](serialization.md)
