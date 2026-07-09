# POKIE

[![npm version](https://img.shields.io/npm/v/pokie.svg)](https://www.npmjs.com/package/pokie)
[![license](https://img.shields.io/npm/l/pokie.svg)](LICENSE)

_In Australia, they call slot machines "pokies"._

Introducing **POKIE**, a server-side video slot game logic framework for JavaScript and TypeScript.

`npm install pokie`

> **⚠️ RNG:** default `PseudorandomNumberGenerator` uses `Math.random()` — not cryptographically secure.
> `SecureRandomNumberGenerator` gives a stronger, production-like, security-sensitive RNG primitive built on
> Node's `crypto.randomInt`, but it's a building block, not a certification — real-money/regulated games still need
> independent RNG certification and regulatory/compliance sign-off, which is outside POKIE's scope. See
> [Reels & Symbol Sequences](docs/reels-and-sequences.md).

## What's included

POKIE goes well beyond classic paylines:

- **Win styles** — classic line wins, scatter wins, ways/megaways-style, cluster (grid) wins, and per-symbol value
  pays, individually or [mixed](docs/paytable-and-wins.md) under an explicit aggregation policy.
- **Cascading wins** — a deterministic win/remove/collapse/refill resolver (`CascadingSpinResolver`) with a
  max-step guard, for tumble/cascade mechanics.
- **Free games / free spins** and **resizable/growing grids** as first-class session types.
- **Simulation** — full per-round `Simulation` plus aggregate-only primitives (`AggregateSimulationRunner`,
  `SimulationAccumulator`) with RTP, hit frequency, volatility, and 95% confidence intervals, for runs too large
  to keep every round in memory.
- **Deterministic/seeded RNG** (`SeededRandomNumberGenerator`) for reproducible simulation, replay, and
  regression tests, alongside the default and cryptographically-secure RNG options.
- **Network serialization** — `net/` serializers turning session state into plain-data DTOs for a game client.
- **Validation primitives** around the win evaluation pipeline, surfacing incompatible-evaluator or misconfigured
  setups as structured issues instead of silent runtime surprises.

See [pokie-examples](https://github.com/sta-ger/pokie-examples) for a working demo of each of these (ways/
megaways-style, cluster pays, sticky respin, growing grid, value-pay + multiplier wilds, mixed evaluators, and a
verifiable/seeded-RNG spin).

## Usage

### Session

Video slot game logic.

```js
import {VideoSlotSession} from "pokie";

const session = new VideoSlotSession();

session.play();

session.getSymbolsCombination(); // symbols combination
session.getWinAmount(); // total round win amount
session.getWinEvaluationResult(); // unified win breakdown for runtime/reporting/debug
session.getWinningLines(); // winning lines data
session.getWinningScatters(); // winning scatters data
```

### Simulation

Running a certain number of game rounds and calculating RTP.

```js
import {SimulationConfig, Simulation} from "pokie";

const simulationConfig = new SimulationConfig();
simulationConfig.setNumberOfRounds(10000);
const simulation = new Simulation(session, simulationConfig);

// set the callbacks if you want to control the session manually
simulation.setBeforePlayCallback(() => {
    console.log("Before play");
});
simulation.setAfterPlayCallback(() => {
    console.log("After play");
});
simulation.setOnFinishedCallback(() => {
    console.log("Simulation finished");
});

simulation.run(); // 10000 rounds will be played

simulation.getLastRtp(); // RTP after the last round played
simulation.getAverageRtp(); // average RTP across all rounds played
```

Capturing specific game features.

```js
import {SimulationConfig, Simulation, PlayUntilSymbolWinStrategy} from "pokie";

const simulationConfig = new SimulationConfig();
simulationConfig.setNumberOfRounds(Infinity);
simulationConfig.setPlayStrategy(new PlayUntilSymbolWinStrategy("A"));

const simulation = new Simulation(session, simulationConfig);
simulation.run(); // the simulation will be stopped on any winning combination with symbol "A"
```

Running a large number of rounds without keeping every round in memory — just the running statistics.

```js
import {AggregateSimulationRunner, VideoSlotSession} from "pokie";

const runner = new AggregateSimulationRunner(new VideoSlotSession(), 1_000_000);
const stats = runner.run().getStatistics();

stats.rtp; // return-to-player across all 1,000,000 rounds
stats.rtpConfidenceInterval95; // {low, high}
stats.hitCount; // number of winning rounds
```

### Seeded RNG

`SeededRandomNumberGenerator` produces the same sequence of draws for the same seed — useful for
simulation/replay/debugging and regression tests that need a repeatable outcome. It's not a production-grade RNG.
For a stronger, security-sensitive entropy source, POKIE also provides `SecureRandomNumberGenerator` — but note
that real-money/regulated play still requires independent RNG certification and compliance work outside POKIE.

```js
import {SymbolsCombinationsGenerator, SeededRandomNumberGenerator, VideoSlotConfig} from "pokie";

const config = new VideoSlotConfig();
const generator = new SymbolsCombinationsGenerator(config, new SeededRandomNumberGenerator(12345));

generator.generateSymbolsCombination(); // same seed always reproduces the same combination
```

## Documentation

See the [docs](docs/README.md) for the full reference: game session and configuration, reels and symbol sequences,
paylines and line patterns, paytable and win calculation, free games, resizable grids, simulation, network
serialization, extension points, and a walkthrough of modeling slot math with POKIE.

Recent runtime additions include a unified `WinEvaluationResult`, explicit mixed-evaluator aggregation policies,
deterministic cascade runtime foundation (`CascadingSpinResolver`), and aggregate-only simulation primitives.
Legacy custom win calculators remain supported, multiplier scopes are enforced per component type, and cascade
resolution is protected by a max-step guard for deterministic runtime safety.

## Use cases

- **Back-End** — implement the video slot game mechanics server-side: create and manage game sessions, serialize
  round results, and send the payload to your game client through your API.
- **Front-End** — run the same logic standalone client-side for fun/demo play, relieving the server of unnecessary
  load. Use simulations to showcase specific game features.
- **Math** — configure a session and run Monte Carlo simulations to balance RTP, hit frequency, and volatility
  before a game ships.

## Examples

See the [examples](https://github.com/sta-ger/pokie-examples) of various video slot game mechanics implemented with
**POKIE**.

- **Simple video slot game** [[Demo](https://sta-ger.github.io/pokie-examples/simple-slot.html)]
  [[Code](https://github.com/sta-ger/pokie-examples/tree/main/src/games/simple-slot)] — 5x4, 8 lines, right-to-left
  pays, a wild, and two scatter types (a classic any-position scatter and a stacked-reels bonus scatter).
- **Video slot with free spins** [[Demo](https://sta-ger.github.io/pokie-examples/slot-with-free-games.html)]
  [[Code](https://github.com/sta-ger/pokie-examples/tree/main/src/games/slot-with-free-games)] — 5x3 free-spins
  game with scattered line matching and a 2x win multiplier during the bonus; also demonstrates using `Simulation`
  to capture specific outcomes.
- **Video slot with sticky re-spin** [[Demo](https://sta-ger.github.io/pokie-examples/slot-with-sticky-respin.html)]
  [[Code](https://github.com/sta-ger/pokie-examples/tree/main/src/games/slot-with-sticky-respin)] — 5x3 game where
  a win holds its symbols in place and triggers a re-spin, continuing as long as new wins land.
- **Cascading cluster pays** [[Demo](https://sta-ger.github.io/pokie-examples/cascading-cluster.html)]
  [[Code](https://github.com/sta-ger/pokie-examples/tree/main/src/games/cascading-cluster)] — 6x5 cluster-pay slot;
  winning clusters are removed, the grid collapses and refills, and evaluation repeats until nothing wins.
- **Megaways-style ways-to-win** [[Demo](https://sta-ger.github.io/pokie-examples/megaways-style.html)]
  [[Code](https://github.com/sta-ger/pokie-examples/tree/main/src/games/megaways-style)] — each of 6 reels draws
  its own row count every round, paid as ways-to-win rather than fixed paylines.
- **Growing grid bonus** [[Demo](https://sta-ger.github.io/pokie-examples/growing-grid.html)]
  [[Code](https://github.com/sta-ger/pokie-examples/tree/main/src/games/growing-grid)] — the grid grows by a row
  on every win (up to a cap) and resets on a loss.
- **Value pay with multiplier wilds** [[Demo](https://sta-ger.github.io/pokie-examples/value-pay-multiplier.html)]
  [[Code](https://github.com/sta-ger/pokie-examples/tree/main/src/games/value-pay-multiplier)] — coin symbols pay
  independently of line wilds that multiply whatever line they end up part of.
- **Verifiable spin** [[Demo](https://sta-ger.github.io/pokie-examples/verifiable-spin.html)]
  [[Code](https://github.com/sta-ger/pokie-examples/tree/main/src/games/verifiable-spin)] — a seeded RNG plus a
  button that replays the session from scratch and verifies it reproduces the same outcome.
- **Mixed win evaluators** [[Demo](https://sta-ger.github.io/pokie-examples/mixed-evaluators.html)]
  [[Code](https://github.com/sta-ger/pokie-examples/tree/main/src/games/mixed-evaluators)] — the same grid
  evaluated as lines, ways, and clusters at once, paid by whichever wins the most.

### Modeling slot math with POKIE

See the [walkthrough](docs/math-modeling.md) in the docs for balancing RTP, hit frequency, and volatility with
POKIE. It's an updated, API-verified version of the original
[Medium article](https://medium.com/@sta-ger/exploring-video-slot-math-with-pokie-3bc7191b72a0) on the same topic.

## License

ISC — see [LICENSE](LICENSE).
