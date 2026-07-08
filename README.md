# POKIE

[![npm version](https://badge.fury.io/js/pokie.svg)](https://badge.fury.io/js/pokie)
[![license](https://img.shields.io/npm/l/pokie.svg)](LICENSE)

_In Australia, they call slot machines "pokies"._

Introducing **POKIE**, a server-side video slot game logic framework for JavaScript and TypeScript.

`npm install pokie`

> **⚠️ RNG:** default `PseudorandomNumberGenerator` uses `Math.random()` — not cryptographically secure. Use
> `SecureRandomNumberGenerator` for real-money/regulated games. See
> [Reels & Symbol Sequences](docs/reels-and-sequences.md).

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

### Modeling slot math with POKIE

See the [walkthrough](docs/math-modeling.md) in the docs for balancing RTP, hit frequency, and volatility with
POKIE. It's an updated, API-verified version of the original
[Medium article](https://medium.com/@sta-ger/exploring-video-slot-math-with-pokie-3bc7191b72a0) on the same topic.

## License

ISC — see [LICENSE](LICENSE).
