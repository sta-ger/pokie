[← Back to docs index](README.md)

# CLI

`pokie` ships a small CLI, installed alongside the library, for scaffolding and (eventually) operating on
[game packages](game-packages.md).

## `pokie create <name>`

Scaffolds a brand-new [game package](game-packages.md) in a new `<name>` directory.

```
npm i -g pokie
pokie create crazy-fruits
cd crazy-fruits
npm install
npm run build
```

`pokie create <name>` creates `./<name>` and writes:

- `package.json` — name `<name>`, a `pokie` dependency, a `build` script, and `pokie.entry` pointing at
  `./dist/index.js`;
- `tsconfig.json` (CommonJS output to `./dist`, source in `./src`);
- `src/<GameName>Game.ts` — a `PokieGame` implementation (`<GameName>` is `<name>` converted to PascalCase, e.g.
  `crazy-fruits` → `CrazyFruits`), with a manifest id/name derived from `<name>`;
- `src/<GameName>Session.ts` — a factory returning a default `VideoSlotSession`;
- `src/index.ts` — the entry module, re-exporting `<GameName>Game` as its default export.

It fails if `./<name>` already exists — pick a different name or remove the directory first.

The result is loadable like any other [game package](game-packages.md):

```ts
import {loadPokieGame} from "pokie";

const game = await loadPokieGame("./crazy-fruits");
game.createSession().play();
```

From here, replace the generated `src/<GameName>Session.ts`/`src/<GameName>Game.ts` with your own symbols,
paytable, and session wiring — see [Getting Started](getting-started.md) and
[Game Session & Configuration](game-session.md).

## `pokie init`

Turns an existing npm project into a minimal POKIE-compatible game package.

```
npm init -y
npm i pokie
npx pokie init
```

Run inside the project directory. `pokie init` reads the project's `package.json` and:

- adds/updates `pokie.entry` (pointing at `./dist/index.js`);
- adds a `build` (`tsc`) script, without overwriting any script you already have;
- adds `typescript` to `devDependencies` and `pokie` to `dependencies` if either is missing;
- creates a minimal `tsconfig.json` (CommonJS output to `./dist`, source in `./src`);
- creates `src/index.ts`, a working entry module exporting a `PokieGame` — `getManifest()` returns an id/name
  derived from the project's package name (and its version), `createSession()` returns a default
  `VideoSlotSession`.

It never overwrites an existing `tsconfig.json` or `src/index.ts` — if either is already there, it's left alone
and reported as skipped. `package.json` is always re-written with the merged fields above.

After running it:

```
npm install
npm run build
```

The project is now loadable like any other [game package](game-packages.md):

```ts
import {loadPokieGame} from "pokie";

const game = await loadPokieGame(process.cwd());
game.createSession().play();
```

From here, replace the generated `src/index.ts` with your own symbols, paytable, and session wiring — see
[Getting Started](getting-started.md) and [Game Session & Configuration](game-session.md).

## `pokie sim <packageRoot>`

Loads a [game package](game-packages.md) with `loadPokieGame` and runs an [aggregate simulation](simulation.md)
(`AggregateSimulationRunner`) against it, then reports RTP/hit-frequency/max-win statistics.

```
pokie sim ./crazy-fruits --rounds 10000 --seed demo --out report.json
```

Options:

- `--rounds <number>` — how many rounds to play (default `1000`, `SimulationConfig.DEFAULT_NUMBER_OF_ROUNDS`).
- `--seed <string>` — forwarded as `context.seed` to `game.createSession(context)`. **Best-effort, not guaranteed**:
  POKIE has no built-in way to seed an arbitrary loaded game — it's up to the game package's own `createSession`
  to read `context.seed` and thread it into a `SeededRandomNumberGenerator`. A game that ignores `context` will
  simply run unseeded, seed or no seed. Note also that `VideoSlotConfig`'s *default* reel-strip generator shuffles
  with an unseeded `Math.random()` at construction time, independently of any RNG passed to
  `SymbolsCombinationsGenerator` — a game package needs fixed (non-shuffled) symbol sequences, e.g. via
  `config.setSymbolsSequences(...)`, for `--seed` to make a whole run reproducible, not just individual reel stops.
- `--out <file>` — write the JSON report to `<file>`.
- `--format json` — print the JSON report to stdout instead of the default human-readable summary. Independent of
  `--out`: combine both to see the report and save it in the same run.

The session's credit balance is set to `Number.MAX_SAFE_INTEGER` before the run starts — `pokie sim` measures
RTP/volatility, not risk of ruin, so `--rounds` is never cut short by the session running out of credits.

The JSON report shape:

```ts
{
    game: {id: string; name: string; version: string};
    requestedRounds: number;
    rounds: number;           // rounds actually played — can be less than requestedRounds if the game
                               // itself stops early (canPlayNextGame() returning false)
    seed: string | null;
    totalBet: number;
    totalWin: number;
    rtp: number;               // 0-1, e.g. 0.9532 for 95.32%
    hitFrequency: number;      // 0-1
    maxWin: number;
    durationMs: number;
    spinsPerSecond: number;
}
```

Failure modes:

- Missing `<packageRoot>`, an unknown option, or a non-positive `--rounds` throw a `Usage: pokie sim ...` error.
- An invalid `packageRoot` (no `package.json`, no `pokie.entry`, or an entry module that doesn't export a valid
  `PokieGame`) throws the same descriptive error `loadPokieGame` would throw directly — see
  [Game Packages](game-packages.md).

## `pokie report <simulationReportJson>`

Renders a JSON report produced by [`pokie sim --out`](#pokie-sim-packageroot) as a human-readable Markdown or
HTML document.

```
pokie sim ./crazy-fruits --rounds 10000 --out sim.json
pokie report sim.json --format html --out report.html
```

Options:

- `--format markdown|html` — output format (default `markdown`).
- `--out <file>` — also write the rendered report to `<file>`. Independent of `--format`: the rendered report is
  always printed to the console; `--out` additionally saves it to disk.

The rendered report includes, at minimum: game id/name/version, requested rounds, actual rounds, seed, total bet,
total win, RTP, hit frequency, max win, duration, and spins per second. The HTML output is plain semantic HTML
(a heading and a table) — no charts.

The reusable rendering API behind the command lives in `src/reporting`:

```ts
import {HtmlSimulationReportRenderer, MarkdownSimulationReportRenderer, SimulationReportRendering} from "pokie";

const renderer: SimulationReportRendering = new MarkdownSimulationReportRenderer();
const markdown = renderer.render(report); // report: SimulationReport, e.g. from JSON.parse(fs.readFileSync(...))
```

`MarkdownSimulationReportRenderer` and `HtmlSimulationReportRenderer` both implement `SimulationReportRendering`
(`render(report: SimulationReport): string`), so a custom renderer (e.g. plain text, a different HTML layout) can
be swapped in without touching `ReportCommand`.

Failure modes:

- Missing `<simulationReportJson>`, an unknown option, or an invalid `--format`/`--out` value throw a
  `Usage: pokie report ...` error.
- A `<simulationReportJson>` that can't be read (missing file, permissions) throws
  `Could not read simulation report at "<path>": <reason>`.
- A `<simulationReportJson>` that isn't valid JSON throws `"<path>" is not valid JSON: <reason>`.
- Valid JSON that doesn't look like a `SimulationReport` (missing `game`/`rtp`/`rounds`/... fields) throws
  `"<path>" does not look like a pokie sim report ...`.

## `pokie diff <leftReportJson> <rightReportJson>`

Compares two JSON reports produced by [`pokie sim --out`](#pokie-sim-packageroot) and reports what changed —
handy for seeing how a paytable/config change moved the game's math between runs.

```
pokie sim ./crazy-fruits --rounds 100000 --seed demo --out before.json
# ...change the game's config...
pokie sim ./crazy-fruits --rounds 100000 --seed demo --out after.json
pokie diff before.json after.json
```

Compares, at minimum: game id/name/version, requested rounds, actual rounds, seed, total bet, total win, RTP,
hit frequency, max win, duration, and spins per second.

Options:

- `--format json` — print the JSON diff to stdout instead of the default human-readable summary.
- `--out <file>` — also write the JSON diff to `<file>`. Independent of `--format`: the summary/JSON is always
  printed to the console; `--out` additionally saves the JSON diff to disk.

The human-readable summary looks like:

```
Diff: Crazy Fruits (id: "crazy-fruits")
  seed            demo -> demo2
  requested rounds 10000 -> 10000 (0, 0.00%)
  rounds          9800 -> 9850 (+50, +0.51%)
  total bet       9800.00 -> 9850.00 (+50.00, +0.51%)
  total win       9331.40 -> 9400.00 (+68.60, +0.74%)
  rtp             95.22% -> 95.43% (+0.21 pp, +0.22%)
  hit frequency   24.10% -> 24.50% (+0.40 pp, +1.66%)
  max win         120.50 -> 130.00 (+9.50, +7.88%)
  duration        1234ms -> 1300ms (+66ms, +5.35%)
  spins/s         7942 -> 7900 (-42, -0.53%)
```

A `Warnings:` section is appended whenever RTP, hit frequency, or max win moved by a noticeable amount (by
default: RTP or hit frequency by more than 1 percentage point, or max win by more than 10%) — the signal that
usually matters most after a paytable/config change.

The JSON diff shape:

```ts
{
    game: {left: {id, name, version}; right: {id, name, version}; changed: boolean};
    seed: {left: string | null; right: string | null; changed: boolean};
    requestedRounds: {left: number; right: number; delta: number; percentDelta: number | null};
    rounds: {left: number; right: number; delta: number; percentDelta: number | null};
    totalBet: {left: number; right: number; delta: number; percentDelta: number | null};
    totalWin: {left: number; right: number; delta: number; percentDelta: number | null};
    rtp: {left: number; right: number; delta: number; percentDelta: number | null};
    hitFrequency: {left: number; right: number; delta: number; percentDelta: number | null};
    maxWin: {left: number; right: number; delta: number; percentDelta: number | null};
    durationMs: {left: number; right: number; delta: number; percentDelta: number | null};
    spinsPerSecond: {left: number; right: number; delta: number; percentDelta: number | null};
    warnings: string[];
}
```

Every numeric field is a `{left, right, delta, percentDelta}` tuple — `percentDelta` is `null` when `left` is
`0` (a relative percent change is undefined there), not `Infinity`/`NaN`.

The reusable diffing API behind the command lives in `src/diff`:

```ts
import {SimulationReportDiffer, SimulationReportDiffing} from "pokie";

const differ: SimulationReportDiffing = new SimulationReportDiffer();
const diff = differ.diff(leftReport, rightReport); // leftReport/rightReport: SimulationReport
```

`SimulationReportDiffer`'s constructor optionally takes the three warning thresholds (RTP delta, hit frequency
delta, max win percent delta), in that order, if the defaults don't fit a particular game.

Failure modes:

- Missing `<leftReportJson>`/`<rightReportJson>`, an unknown option, or an invalid `--format`/`--out` value throw
  a `Usage: pokie diff ...` error.
- Each report path is read/parsed/validated the same way as [`pokie report`](#pokie-report-simulationreportjson) —
  the same "could not read"/"not valid JSON"/"does not look like a pokie sim report" errors apply to either side.

## `pokie validate <packageRoot>`

Loads a [game package](game-packages.md) and checks it against the `PokieGame` contract, without playing it —
`package.json`'s `pokie.entry`, the entry module's export shape, and the manifest returned by `getManifest()`
(non-empty `id`/`name`/`version`).

```
pokie validate ./crazy-fruits
```

```
Validating "Crazy Fruits" (id: "crazy-fruits", v0.1.0) at "./crazy-fruits"
  valid           yes

No issues found.
```

Options:

- `--format json` — print the JSON report to stdout instead of the default human-readable summary.
- `--out <file>` — write the JSON report to `<file>`. Independent of `--format json`: combine both to see the
  report and save it in the same run.

The JSON report shape:

```ts
{
    packageRoot: string;
    valid: boolean;
    game: {id: string; name: string; version: string} | null;  // null if the manifest couldn't be read at all
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
    suggestions: string[];      // deduped `issue.suggestion` text pulled from any error/warning that has one
}
```

`game` is populated whenever `getManifest()` could be called and returned an object, even if some of its fields
failed validation (e.g. an empty `id`) — so you can see what the package *does* report, not just that it's wrong.

Exit code is `0` when `valid` is `true` and `1` when it's `false` — no thrown/printed error on top of the report,
so scripting against `pokie validate` doesn't have to parse stderr. Only usage mistakes (missing `<packageRoot>`,
an unknown option, `--out`/`--format` without a value) throw the usual `Usage: pokie validate ...` error.

## What's next

`pokie create`, `pokie init`, `pokie sim`, `pokie validate`, `pokie report`, and `pokie diff` are the first of a
planned set of subcommands built on the same [game package](game-packages.md) primitives (`loadPokieGame`,
`isPokieGame`, `PokieGameContractValidationRule`). `pokie serve` (a local server adapter) is still planned. It
doesn't exist yet — running it today just prints the CLI's usage/command list.
