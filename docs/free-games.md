[← Back to docs index](README.md)

# Free Games

## `VideoSlotWithFreeGamesConfig`

Wraps a `VideoSlotConfig` — every `VideoSlotConfigRepresenting` method is a one-line delegate. It adds exactly one
thing: a scatter-symbol → symbol-count → free-games-awarded map.

```ts
constructor(baseConfig = new VideoSlotConfig())

getFreeGamesForScatters(symbolId: string, numberOfSymbols: number): number   // 0 if unregistered
setFreeGamesForScatters(symbolId: string, numberOfSymbols: number, freeGamesNum: number): void
// plus everything from VideoSlotConfigRepresenting, delegated to the wrapped VideoSlotConfig
```

Default map: only scatter `"S"` is pre-registered — `{3: 10, 4: 15, 5: 20}` (3/4/5 scatters award 10/15/20 free
games). Any other symbol or count returns `0` until you register it explicitly — a typo'd symbol id fails silently,
so double-check spelling.

```ts
import {VideoSlotWithFreeGamesConfig} from "pokie";

const config = new VideoSlotWithFreeGamesConfig();
config.getFreeGamesForScatters("S", 3); // 10 (built-in default)

config.setFreeGamesForScatters("BONUS", 3, 8);
config.getFreeGamesForScatters("BONUS", 3); // 8
```

## `VideoSlotWithFreeGamesSession`

Wraps a `baseSession: VideoSlotSessionHandling` and adds free-games bookkeeping:

```ts
constructor(
    config: VideoSlotWithFreeGamesConfigRepresenting = new VideoSlotWithFreeGamesConfig(),
    combinationsGenerator: SymbolsCombinationsGenerating = new SymbolsCombinationsGenerator(config),
    winCalculator: VideoSlotWinCalculating = new VideoSlotWinCalculator(config),
    baseSession: VideoSlotSessionHandling = new VideoSlotSession(config, combinationsGenerator, winCalculator),
    freeGamesRoundHandler: FreeGamesRoundHandling = new FreeGamesRoundHandler(),
)

getFreeGamesNum(): number / setFreeGamesNum(v: number): void     // free games played so far in the current round
getFreeGamesSum(): number / setFreeGamesSum(v: number): void     // free games awarded/available in the current round
getFreeGamesBank(): number / setFreeGamesBank(v: number): void   // winnings accumulated during the free-games round
getWonFreeGamesNumber(): number                                   // free games awarded by the MOST RECENT spin's scatters
getFreeGamesForScatters(symbolId: string, numberOfSymbols: number): number
play(): void
// plus everything from VideoSlotSessionHandling, delegated to baseSession
```

Don't confuse `getWonFreeGamesNumber()` (this spin's trigger) with `getFreeGamesSum()` (the running total for the
whole bonus round — it can grow further via retriggers).

### `play()` flow

```ts
public play(): void {
    this.freeGamesRoundHandler.beforeRoundPlayed(this);
    const creditsBeforePlay = this.getCreditsAmount();
    this.baseSession.play();
    this.freeGamesRoundHandler.afterRoundPlayed(this, creditsBeforePlay);
}
```

`FreeGamesRoundHandler` (the constructor's default 5th argument) implements the classic bank-and-retrigger
mechanic:

1. **`beforeRoundPlayed`** — if the previous round's free games are all used up (`freeGamesNum === freeGamesSum`),
   the bank/num/sum counters reset to `0`.
2. The session records credits before playing, then plays the underlying `VideoSlotSession` round as normal (bet is
   deducted, win is added to credits by the base session).
3. **`afterRoundPlayed`**, while inside a free-games round (`freeGamesSum > 0 && freeGamesNum < freeGamesSum`):
   increments `freeGamesNum`, adds this round's win to `freeGamesBank`, and **restores credits to what they were
   before this round** (free spins don't cost/pay credits directly — winnings accrue in the bank instead). Then
   checks `getWonFreeGamesNumber()` from this round's scatter wins: if free games were won, adds them to
   `freeGamesSum` (a trigger or retrigger); otherwise, if this was the last free game in the round
   (`freeGamesSum > 0 && freeGamesNum === freeGamesSum`), the accumulated `freeGamesBank` is finally added to real
   credits.

```ts
import {VideoSlotWithFreeGamesSession} from "pokie";

const session = new VideoSlotWithFreeGamesSession();
session.setBet(10);
session.play(); // base-game spin — may trigger free games via scatters

if (session.getWonFreeGamesNumber() > 0) {
    while (session.getFreeGamesNum() < session.getFreeGamesSum()) {
        session.play(); // plays through the awarded free games; wins accumulate in the bank
    }
    // bank has now been paid out to credits automatically
}
```

See [Simulation](simulation.md)'s `PlayFreeGamesStrategy` for driving a simulation deterministically through an
entire free-games feature (trigger → all spins → payout).

## Custom bonus mechanics

A different bonus mechanic — a progressive per-spin multiplier, paying out immediately instead of banking, a
"buy the feature" flow — is a different `FreeGamesRoundHandling` implementation, injected as the constructor's 5th
argument, not a fork of the whole session:

```ts
import {FreeGamesRoundHandling, VideoSlotWithFreeGamesConfig, VideoSlotWithFreeGamesSession} from "pokie";

class ImmediatePayoutFreeGamesHandler implements FreeGamesRoundHandling {
    public beforeRoundPlayed(session) {
        /* ... */
    }

    public afterRoundPlayed(session, creditsBeforePlay) {
        // e.g. pay out every free-spin win immediately instead of banking it
    }
}

const config = new VideoSlotWithFreeGamesConfig();
const session = new VideoSlotWithFreeGamesSession(
    config,
    undefined,
    undefined,
    undefined,
    new ImmediatePayoutFreeGamesHandler(),
);
```

Note the `undefined` placeholders — TypeScript only applies a parameter default when the argument is literally
`undefined`, so skipping the 2nd-4th constructor args this way still gets you their normal defaults. See
[Extension Points](extension-points.md) for the full list of injectable collaborators, including
`AbstractVideoSlotSessionDecorator` for writing your own session wrapper (the same pattern
`VideoSlotWithFreeGamesSession` itself is built on) without re-implementing every passthrough method.
