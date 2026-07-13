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
- **[Reel strip generation](docs/reel-strip-generation.md)** — `ReelStripGenerator` produces a reel strip's fixed
  symbol sequence under constraints (exact counts, minimum distance, max run length, forbidden adjacency, locked
  positions), deterministically by seed, with clear diagnostics when a request can't be satisfied. Also accepts
  proportional `symbolWeights` instead of exact counts, deterministically apportioned via the Largest Remainder
  Method. A design-time tool, separate from the runtime spin path.
- **[Game packages](docs/game-packages.md)** — a `PokieGame`/`pokie.entry` npm package convention plus a
  `loadPokieGame` loader, so an external game can be loaded by a CLI, simulator, validator, or server without
  knowing about it in advance.
- **[CLI](docs/cli.md)** — `npx pokie build <config.json>` generates a working game package straight from a JSON
  `GameBlueprint` (reels, symbols, paylines, paytable, reel strips/weights), no compile step required (see
  [`examples/blueprints`](examples/blueprints)); `npx pokie build` with no config path launches an interactive
  wizard that asks for the same fields on the terminal instead; `npx pokie build --init-blueprint <file>` writes a
  small, hand-editable example `GameBlueprint` to `<file>` instead of building anything, ready for the
  `--init-blueprint -> edit -> --dry-run -> --out` loop (`--dry-run` validates and previews a blueprint without
  writing anything); `npx pokie inspect
  <packageRoot>` prints a package's provenance (game, blueprint hash, source, `pokie` version) without running it;
  `npx pokie create <name>` scaffolds a brand-new game package,
  `npx pokie init` scaffolds an existing npm project in place, both minimal, buildable, and loadable; `npx pokie
  sim <packageRoot>` runs a simulation against a package and reports RTP/hit-frequency/max-win; `npx pokie
  validate <packageRoot>`
  checks a package's contract without playing it; `npx pokie report <simulationReportJson>` renders a `pokie sim`
  report (including reproducibility info, warnings, and recommendations) as Markdown/HTML; `npx pokie diff
  <leftReportJson> <rightReportJson>` compares two `pokie sim` reports
  (e.g. before/after a config change); `npx pokie replay <packageRoot>` best-effort replays a single round (by
  seed + round index) as a JSON artifact; `npx pokie serve <packageRoot>` (experimental) starts a local/dev JSON
  HTTP server over a package for creating sessions and spinning them, not a casino backend/RGS; `npx pokie client
  <packageRoot>` (experimental) serves a universal browser preview UI talking to a running `pokie serve`; `npx
  pokie dev <packageRoot>` (experimental) runs both together, opening a browser — all optionally as a JSON
  file/machine-readable output; `npx pokie` (or `npx pokie studio`) (experimental) launches **POKIE Studio**, a
  local web app GUI for create/init/build/inspect/validate/sim/report/replay/serve, opening a browser.

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

### CLI

Scaffold a brand-new [game package](docs/game-packages.md) in a new directory:

```
npm i -g pokie
pokie create crazy-fruits
```

Or turn an existing empty npm project into one in place:

```
npm init -y
npm i pokie
npx pokie init
```

Then check a package's contract without playing it:

```
pokie validate ./crazy-fruits
```

See the [CLI docs](docs/cli.md) for what `pokie create`/`pokie init` generate, what `pokie sim`/`pokie validate`
report, and a
[full create → validate → sim → report → diff → replay → dev walkthrough](docs/cli.md#workflow).

Or skip the individual commands and drive the same workflow from a GUI:

```
npx pokie
```

**POKIE Studio** (experimental) is a local web app covering Home (create/init/build/open a project, plus a visual
Blueprint Editor) and, once a project is open, a Project Dashboard (inspect/validate/simulate/replay/download
reports, and a `pokie serve`-equivalent Runtime tab with session tools) — see the
[Studio docs](docs/cli.md#pokie--pokie-studio-experimental) for the full tour. Like `pokie serve`/`pokie dev`,
it's a local/dev tool, not a casino backend or RGS.

## Documentation

See the [docs](docs/README.md) for the full reference: game session and configuration, reels and symbol sequences,
paylines and line patterns, paytable and win calculation, free games, resizable grids, simulation, network
serialization, extension points, reel strip generation, and a walkthrough of modeling slot math with POKIE.

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
  [[Code](https://github.com/sta-ger/pokie-examples/tree/main/src/games/cascading-cluster)] — 6x5 cluster-pay slot
  using `CascadingSpinResolver`: winning clusters are removed, the grid collapses and refills, and evaluation
  repeats until nothing wins, with an escalating step multiplier.
- **Megaways-style ways-to-win** [[Demo](https://sta-ger.github.io/pokie-examples/megaways-style.html)]
  [[Code](https://github.com/sta-ger/pokie-examples/tree/main/src/games/megaways-style)] — each of 6 reels draws
  its own row count every round (`VariableHeightSymbolsCombinationsGenerator`), paid with `WaysWinCalculator`.
- **Growing grid bonus** [[Demo](https://sta-ger.github.io/pokie-examples/growing-grid.html)]
  [[Code](https://github.com/sta-ger/pokie-examples/tree/main/src/games/growing-grid)] — `ResizableSymbolsCombinationsGenerator`
  grows the grid by a row on every win (up to a cap) and resets it on a loss.
- **Value pay with multiplier wilds** [[Demo](https://sta-ger.github.io/pokie-examples/value-pay-multiplier.html)]
  [[Code](https://github.com/sta-ger/pokie-examples/tree/main/src/games/value-pay-multiplier)] — `ValueWinCalculator`
  coins pay independently of `MultiplierResolver` wilds, which are scoped to line wins only.
- **Verifiable spin** [[Demo](https://sta-ger.github.io/pokie-examples/verifiable-spin.html)]
  [[Code](https://github.com/sta-ger/pokie-examples/tree/main/src/games/verifiable-spin)] — `SeededRandomNumberGenerator`
  plus a button that replays the session's seed from scratch and verifies it reproduces the same outcome.
- **Mixed win evaluators** [[Demo](https://sta-ger.github.io/pokie-examples/mixed-evaluators.html)]
  [[Code](https://github.com/sta-ger/pokie-examples/tree/main/src/games/mixed-evaluators)] — the same grid
  evaluated as lines, ways, and clusters at once, paid by whichever wins the most (`HighestWinOnlyAggregationPolicy`).

### Modeling slot math with POKIE

See the [walkthrough](docs/math-modeling.md) in the docs for balancing RTP, hit frequency, and volatility with
POKIE. It's an updated, API-verified version of the original
[Medium article](https://medium.com/@sta-ger/exploring-video-slot-math-with-pokie-3bc7191b72a0) on the same topic.

## License

ISC — see [LICENSE](LICENSE).
