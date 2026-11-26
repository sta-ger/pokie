[← Back to docs index](README.md)

# Getting Started

## Install

The package is intended to be installed as `@fromstan/pokie`. Until it is published, install a
locally produced archive (`npm install /absolute/path/to/fromstan-pokie.tgz`) or an already built
checkout, then use the installed `pokie` executable.

```
npm install @fromstan/pokie
```

POKIE requires Node `>=22.12.0` and ships one ESM build plus type declarations. It works from
`import` everywhere, and from `require()` through Node's `require(esm)` support. TypeScript
consumers should use `module`/`moduleResolution` `NodeNext` (or `Node20`); the older `Node16` mode
cannot type-check an ESM dependency from a CommonJS file.

## Design and test in Studio

Run `npx --package @fromstan/pokie pokie` to open Home. Choose a starter, change its design, then **Create game design** to save it and open
its workspace. The Layout section chooses **lines**, **ways** or **clusters**. The Ways and Clusters
starter variants are structural demos: they keep the line paytable until you retune it, so check exact
RTP before treating one as balanced. **Mechanics** holds free games,
weighted bonuses, cascades, respins, collection, wild modifiers, Hold & Win and jackpots. **Overview** checks the design and shows **Exact math** when a compatible Outcome Library exists; if none
exists yet, **Compute exact outcome table** generates one and then shows exact RTP, the complete payout distribution, and line/symbol
contributions. **Math preview** in Game design is a draft/read-only preview only; it does not write the project's stored
outcome table. After saving, the preview stays visible for the saved design, and **Compute exact outcome table** on
Overview writes the table that other Studio views treat as exact. **Play** runs real local rounds. **Simulation** estimates RTP; its optional **Target precision** keeps
**Plays** as a ceiling and stops once the 95% RTP interval is tight enough. **Build/Export** writes a game package or
another output. Saving a design, preparing its project, validating it and building an output are separate results. The
saved game design remains editable; an exported game package is read-only in Studio. Keep the design for later changes.

Applying a reviewed optimization asks for confirmation and can be undone once from the same Studio session, until the
source changes, the undo expires after 15 minutes, or Studio restarts.

POKIE serves developers and game-math authors; Studio provides a local authoring and testing path. It
does not provide mathematical certification or a casino backend. Delivering a game to an operator
requires developer integration. See the [CLI reference](cli.md#pokie) for launch and build
commands.

## The seven objects

POKIE has seven user-facing objects. Everything else is implementation detail.

| Object | What it is |
|---|---|
| **Game design (Blueprint)** | The JSON file where you describe the game. |
| **Project** | A folder POKIE can open. |
| **Game package** | A runnable package built from a game design. |
| **Outcome library** | Every possible outcome of one paid entry spin and how often it occurs. Feature payouts that settle later are derived or simulated separately. |
| **Round record** | What happened in one round, saved for replay or audit. |
| **Simulation report** | RTP, hit frequency, volatility and payout statistics. |
| **Certification pack** | The evidence folder prepared for an auditor. |

See the [glossary](glossary.md) for one-line definitions of slot, build and audit terms.

## Play a round

```ts
import {VideoSlotSession} from "@fromstan/pokie";

const session = new VideoSlotSession(); // default 5x3 game, symbols A/K/Q/J/10/9, wild "W", scatter "S"

session.setBet(10);
session.play();

session.getSymbolsCombination().toMatrix(); // string[][] — the symbols shown on screen
session.getWinAmount(); // total win for this round
session.getWinEvaluationResult(); // unified win breakdown object
session.getWinningLines(); // Record<string, WinningLineDescribing>
session.getWinningScatters(); // Record<string, WinningScatterDescribing>
session.getCreditsAmount(); // credits after the bet was placed and the win added
```

`new VideoSlotSession()` wires up working defaults for every collaborator (config, combinations generator, win
calculator, base session) — see [Game Session & Configuration](game-session.md) for how to customize the game
(symbols, reels, paytable, lines), and [Extension Points](extension-points.md) for the full list of what can be
swapped out.

> **⚠️ Before you ship real money on this:** the default RNG behind reel spins (`PseudorandomNumberGenerator`) is
> `Math.random()`-based — not cryptographically secure. `SecureRandomNumberGenerator` is a stronger, production-like
> entropy source, but it's a building block, not a certification: real-money/regulated games still need independent
> RNG certification and regulatory/compliance sign-off, which is outside POKIE's scope — see
> [Reels & Symbol Sequences](reels-and-sequences.md#rngs).

## Reproducible replay

Two pieces are relevant if you need to reproduce or audit a specific round:

- `SeededRandomNumberGenerator(seed)` — a reproducible random generator; the same seed always produces the same
 sequence of draws, for tests, replays and demos. Not cryptographically secure — don't use it for real-money play.
- `SymbolsCombinationsGenerator.getLastStopPositions()` — the per-reel stop position (index into that reel's
 `SymbolsSequence`) that produced the most recently generated combination, so you can reconstruct or log exactly
 how a round's outcome was produced.

## Where to go next

- Want to change symbols, reels, paytable, or paylines? → [Game Session & Configuration](game-session.md)
- Want free spins / bonus rounds? → [Free Games](free-games.md)
- Want a grid that grows or shrinks between rounds? → [Resizable Grid](resizable-grid.md)
- Want cluster pays, per-symbol value pays, or ways-to-win instead of fixed paylines? →
 [Paytable & Win Calculation](paytable-and-wins.md)
- Want to balance RTP/volatility or run bulk simulations? → [Simulation](simulation.md) and
 [Modeling Slot Math with POKIE](math-modeling.md)
- Want to send round results to a game client? → [Network Serialization](serialization.md)
- Want to record, replay or audit a round? → [Round Records](round-records.md) and
 [Provably Fair](provably-fair.md)
- Want to prepare evidence for an auditor? → [Certification Pack](certification-pack.md)
