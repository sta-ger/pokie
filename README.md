# POKIE

POKIE is an ISC-licensed JavaScript/TypeScript framework for video-slot game math: reels, paylines, win
evaluation, free games, feature mechanics, RTP simulation, deterministic replay and portable game
artifacts.

The 2.0 source is prepared for publication as `@fromstan/pokie`. Until the package is published, install
a built checkout or a locally produced archive:

```bash
npm install /absolute/path/to/pokie
# or
npm install /absolute/path/to/fromstan-pokie-2.0.0.tgz
```

POKIE ships one ESM build. ES modules and TypeScript `NodeNext` consumers import it directly;
CommonJS `require()` loads the same build on Node `^20.19.0 || >=22.12.0` through Node's
`require(esm)` support.

> **RNG:** the default `PseudorandomNumberGenerator` uses `Math.random()` and is not cryptographically
> secure. `SecureRandomNumberGenerator` uses Node's `crypto.randomInt`, but it is a building block, not
> an RNG certification. Real-money and regulated games still require independent RNG certification and
> regulatory sign-off, which is outside POKIE's scope.

## What's included

- **Win styles** — line, scatter, ways/megaways-style, cluster and per-symbol value wins, individually or
  mixed under an explicit aggregation policy.
- **Feature mechanics** — free games, bet modes (ante/buy feature), Hold & Win / Lock & Spin, fixed and
  progressive jackpots, cascading wins, resizable grids and weighted bonuses.
- **Simulation** — per-round `Simulation`, aggregate-only runners, parallel workers, RTP, hit frequency,
  volatility, confidence intervals and optional convergence-based early stop.
- **Exact math** — a canonical `WeightedOutcomeLibrary` can enumerate every outcome and its weight, so RTP
  and payout distributions can be computed without Monte Carlo error.
- **Artifacts** — `GameBlueprint` JSON, generated TypeScript packages, Outcome Library bundles, Stake
  Engine adapters, PAR workbooks and canonical WASM modules.
- **Deterministic replay** — seeded RNG, round artifacts, audit replay and commit-reveal fairness proofs.
- **CLI and Studio** — author, build, validate, simulate, replay and inspect games from the terminal or a
  local browser UI.
- **Network and server primitives** — session serialization plus a local/reference HTTP server with
  replaceable session storage and wallet ports. It is not a casino backend or RGS.

## Session

```js
import {VideoSlotSession} from "@fromstan/pokie";

const session = new VideoSlotSession();

session.play();

session.getSymbolsCombination(); // symbols combination
session.getWinAmount(); // total round win amount
session.getWinEvaluationResult(); // unified win breakdown
session.getWinningLines(); // winning lines data
session.getWinningScatters(); // winning scatters data
```

## Simulation

```js
import {SimulationConfig, Simulation} from "@fromstan/pokie";

const simulationConfig = new SimulationConfig();
simulationConfig.setNumberOfRounds(10000);

const simulation = new Simulation(session, simulationConfig);
simulation.run();

simulation.getLastRtp();
simulation.getAverageRtp();
```

Large runs can use `AggregateSimulationRunner`, which keeps only running statistics instead of every
round:

```js
import {AggregateSimulationRunner, VideoSlotSession} from "@fromstan/pokie";

const runner = new AggregateSimulationRunner(new VideoSlotSession(), 1_000_000);
const stats = runner.run().getStatistics();

stats.rtp;
stats.rtpConfidenceInterval95; // {low, high}
stats.hitCount;
```

## Seeded RNG

```js
import {SymbolsCombinationsGenerator, SeededRandomNumberGenerator, VideoSlotConfig} from "@fromstan/pokie";

const config = new VideoSlotConfig();
const generator = new SymbolsCombinationsGenerator(config, new SeededRandomNumberGenerator(12345));

generator.generateSymbolsCombination(); // the same seed reproduces the same combination
```

## CLI

The `pokie` executable has three main entry points:

```bash
pokie                    # open Studio Home
pokie .                  # open the current project in Studio
pokie <project>          # open a specific project in Studio
```

Author and run games without the browser:

```bash
pokie create demo --random --seed 42 --out demo.blueprint.json
pokie build demo.blueprint.json --target tsPackage --out demo-package
pokie validate demo-package
pokie sim demo-package --rounds 10000 --seed demo --out sim.json
pokie report sim.json
```

Other commands include `inspect`, `edit`, `reel`, `par`, `optimize`, `replay`, `run`, `serve`, `client`,
`dev`, `fairness`, `certification` and `diff`. Use `pokie <command> --help` for the exact grammar.

## Studio

`pokie` opens a local web app for designing a `GameBlueprint`, building artifacts, running simulations,
replaying rounds and playing a game in-process. It is a local development tool, not a hosted service or
production RGS.

## Documentation

See [docs/README.md](docs/README.md) for the full reference:

- [Getting started](docs/getting-started.md)
- [Game session and configuration](docs/game-session.md)
- [Reels and symbol sequences](docs/reels-and-sequences.md)
- [Paylines and patterns](docs/paylines-and-patterns.md)
- [Paytable and wins](docs/paytable-and-wins.md)
- [Free games](docs/free-games.md)
- [Resizable grid](docs/resizable-grid.md)
- [Simulation](docs/simulation.md)
- [Serialization](docs/serialization.md)
- [Round artifacts](docs/round-artifacts.md)
- [Weighted outcome library](docs/weighted-outcome-library.md)
- [Game packages](docs/game-packages.md)
- [CLI](docs/cli.md)
- [WASM compatibility](docs/wasm-compatibility-boundary.md)
- [Provably fair](docs/provably-fair.md)
- [Supported mechanics](docs/supported-mechanics.md)

## Examples

See [pokie-examples](https://github.com/sta-ger/pokie-examples) for working games covering ways wins,
cluster pays, sticky respins, growing grids, value pays, mixed evaluators and verifiable spins. Local
Blueprint examples are inline in the [CLI documentation](docs/cli.md).

## License

ISC — see [LICENSE](LICENSE).
