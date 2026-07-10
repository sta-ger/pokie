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
    reproducibility?: {
        game: {id: string; name: string; version: string};
        seed: string | null;
        requestedRounds: number;
        actualRounds: number;
        command: string;         // e.g. `pokie sim <packageRoot> --rounds 10000 --seed demo`, ready to re-run
    };
    warnings?: string[];         // e.g. no seed given, low rounds, 0 hit frequency/maxWin/totalBet, early stop
    recommendations?: string[];  // simple next-step hints, e.g. use --seed, raise --rounds, run pokie diff/--out
}
```

`reproducibility`, `warnings`, and `recommendations` were added in v1.3 as purely additive, **optional** fields —
a `sim.json` produced by an older `pokie` (or handwritten JSON without them) still validates and renders fine with
[`pokie report`](#pokie-report-simulationreportjson), it just won't have these sections. `pokie sim` itself always
populates all three on every report it produces.

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

When the report has a `reproducibility` block, a **Reproducibility** section follows with the game, seed,
requested/actual rounds, and a ready-to-run `pokie sim` command. When `warnings`/`recommendations` are non-empty,
matching **Warnings**/**Recommendations** sections list them. All three sections are omitted when the report
doesn't have the corresponding field (e.g. an older `sim.json` from before v1.3) or the array is empty — a
report can always be rendered, whether it has these fields or not.

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

## `pokie replay <packageRoot>`

Best-effort replay of a single round, identified by `--seed`/`--round`, from a [game package](game-packages.md).
This is the first foundation for POKIE replay — it does not (yet) reconstruct full session/RNG/audit state; see
[Limitations](#limitations) below.

```
pokie replay ./crazy-fruits --seed demo --round 42 --out replay.json
```

Options:

- `--round <number>` — **required**. A positive integer: the 1-indexed round to replay.
- `--seed <string>` — forwarded as `context.seed` to `game.createSession(context)`, same best-effort caveat as
  [`pokie sim --seed`](#pokie-sim-packageroot).
- `--out <file>` — write the JSON replay descriptor to `<file>`.
- `--format json` — accepted for symmetry with `pokie sim`/`pokie validate`; JSON is currently the only supported
  format, and is always printed to stdout regardless of this flag.

The session's credit balance is set to `Number.MAX_SAFE_INTEGER` before replaying, so reaching `--round` is never
cut short by the session running out of credits.

The JSON replay descriptor shape (`ReplayDescriptor`):

```ts
{
    game: {id: string; name: string; version: string};
    seed: string | null;
    round: number;
    totalBet: number;          // sum of getBet() across every round played to reach `round`
    totalWin: number;          // sum of getWinAmount() across every round played to reach `round`
    screen: unknown[][] | null; // getSymbolsCombination().toMatrix() when the session exposes it, else null
    timestamp: number;          // Date.now() when the replay started
    durationMs: number;         // wall-clock time spent replaying
}
```

### Limitations

`pokie replay` has no seek-to-round primitive to draw on — `GameSessionHandling` only exposes `play()`, so
replaying round N means creating a fresh session and calling `play()` N times in a row. That makes reproducibility
entirely dependent on the game package:

- The game package's `createSession(context)` must actually read `context.seed` and thread it into a deterministic
  RNG/setup — a game that ignores `context` will not replay identically across runs, seed or no seed.
- Anything else non-deterministic in the game package's session construction (e.g. `VideoSlotConfig`'s default
  reel-strip shuffling, which uses unseeded `Math.random()` — see the [`pokie sim`](#pokie-sim-packageroot) seed
  caveat) will also break reproducibility.
- `screen` is only populated when the session exposes `getSymbolsCombination()` (as `VideoSlotSessionHandling`
  does) — the base `GameSessionHandling` contract has no screen/result accessor, so a plain `GameSession` replays
  with `screen: null`.
- This does **not** replay full session/RNG/audit state — no win breakdown, no free-games state, no RNG call log.
  It is a foundation to build on, not a complete audit trail.

The reusable recording API behind the command lives in `src/replay`:

```ts
import {ReplayRecorder, ReplayRecording} from "pokie";

const recorder: ReplayRecording = new ReplayRecorder();
const descriptor = recorder.record({game, seed: "demo", round: 42}); // game: PokieGame, e.g. from loadPokieGame
```

`ReplayRecorder` implements `ReplayRecording` (`record(options: ReplayRecordingOptions): ReplayDescriptor`), so a
custom recorder can be swapped in without touching `ReplayCommand`.

Failure modes:

- Missing `<packageRoot>`, a missing/non-positive `--round`, a missing `--seed` value, or an unknown option throw a
  `Usage: pokie replay ...` error.
- An invalid `packageRoot` throws the same descriptive error `loadPokieGame` would throw directly — see
  [Game Packages](game-packages.md).

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

## `pokie serve <packageRoot>` (experimental)

**Experimental.** Starts a local HTTP server over a single loaded [game package](game-packages.md), so you can
create sessions and spin them over plain JSON HTTP while developing a game. This is a **local/dev reference
server, not a casino backend or RGS** — no real-money wallet, no authentication, and no operator/integration
logic of any kind. Game state (bet/win/screen) goes through a replaceable `SessionRepository`, and credits go
through a separate `WalletPort` — see [Session storage & wallet](#session-storage--wallet) below. The CLI itself
always runs with the defaults (`InMemorySessionRepository`, `InMemoryWallet`), so a `pokie serve` restart still
loses every session; embed `PokieDevServer` directly (see below) to plug in a `FileSessionRepository` or your own
`WalletPort`.

```
pokie serve ./crazy-fruits --port 4000 --host 127.0.0.1
```

```
POKIE dev server (experimental) listening on http://127.0.0.1:4000
This is a local/dev reference server for a single game package — not a casino backend or RGS.
```

Options:

- `--port <number>` — port to listen on (default `3000`). Pass `0` to let the OS assign a free port.
- `--host <string>` — host/interface to bind (default `127.0.0.1`).

The command loads `<packageRoot>` with `loadPokieGame` and starts listening; it does not return until the process
is killed (e.g. `Ctrl+C`) — that's expected for a server.

### `GET /health`

`200 {"status": "ok"}` — always, once the server is up.

### `GET /game`

`200 <PokieGameManifest>` — the loaded game's `getManifest()` output as-is (`id`, `name`, `version`, and
`description`/`author` if the game provides them).

### `POST /sessions`

Creates a new in-memory session via `game.createSession(context)` and returns its initial state:

```ts
{
    sessionId: string;
    game: {id: string; name: string; version: string};
    bet: number;
    credits: number;
    screen?: unknown[][]; // getSymbolsCombination().toMatrix() when the session exposes it, else omitted
}
```

An optional JSON body `{"seed": string | number}` is forwarded as `context.seed` — same best-effort caveat as
[`pokie sim --seed`](#pokie-sim-packageroot): only game packages that actually thread `context.seed` into their own
RNG setup honor it.

### `POST /sessions/:sessionId/spin`

Calls `session.play()` on the stored session and returns its new state:

```ts
{
    sessionId: string;
    game: {id: string; name: string; version: string};
    bet: number;
    win: number;
    credits: number;
    screen?: unknown[][]; // getSymbolsCombination().toMatrix() when the session exposes it, else omitted
}
```

`404 {"error": "..."}` for an unknown `sessionId`.

### `GET /sessions/:sessionId`

Returns the current state of an in-memory session without playing a round — the same `PokieDevSessionResponse`
shape as `POST /sessions` and `POST /sessions/:sessionId/spin`, always including `win` (like the spin response,
since the session already tracks it via `getWinAmount()`):

```ts
{
    sessionId: string;
    game: {id: string; name: string; version: string};
    bet: number;
    win: number;      // session.getWinAmount() as it currently stands — 0 before the first spin
    credits: number;
    screen?: unknown[][]; // getSymbolsCombination().toMatrix() when the session exposes it, else omitted
}
```

`404 {"error": "..."}` for an unknown `sessionId`.

This is a **restore/reload** endpoint, not a new capability — it reads the persisted `SessionRepository` state
`POST /sessions`/`POST .../spin` already write, it doesn't play a round or change any state. With the default
`InMemorySessionRepository` (what the CLI always uses), that state doesn't survive a restart, so every stored
`sessionId` 404s after one. With a `FileSessionRepository` (see below), it does.

#### Client reload flow

A frontend that wants to survive a page reload without losing its session can use `GET /sessions/:sessionId` as a
lightweight restore step:

1. On first load, `POST /sessions` and keep the returned `sessionId` (e.g. in `localStorage`).
2. On every reload, call `GET /sessions/:sessionId` with the stored id.
3. If it responds `200`, use the returned state (bet/credits/screen/win) to resume where the client left off.
4. If it responds `404` — the session's state is gone (process restarted with the in-memory default, or the
   sessionId was never valid) — discard the stored id and fall back to step 1 (`POST /sessions` again).

### Session storage & wallet

`PokieDevServer` never keeps game state only in a live session object — every `POST /sessions` and
`POST .../spin` writes a serializable `PokieSessionState` (`{context?, bet, win, screen?}`, no credits) through a
`SessionRepository`:

```ts
export interface SessionRepository {
    save(sessionId: string, state: PokieSessionState): Promise<void>;
    load(sessionId: string): Promise<PokieSessionState | undefined>;
}
```

- `InMemorySessionRepository` — the default, a `Map` for the lifetime of the process (same behavior as before
  storage became replaceable).
- `FileSessionRepository` — one JSON file per session under a directory you choose, so state survives a
  `pokie serve` restart. A missing or corrupted file is treated as an unknown session (`404`), not a crash. Session
  ids are hashed into filenames, so an untrusted `sessionId` can't be used for path traversal.

Credits are handled separately through a `WalletPort`, and are **deliberately not part of `PokieSessionState`** —
a restart always resets balances even when a `FileSessionRepository` keeps the game state:

```ts
export interface WalletPort {
    getBalance(sessionId: string): Promise<number>;
    setBalance(sessionId: string, balance: number): Promise<void>;
}
```

`InMemoryWallet` is the default (and only built-in) implementation — an unknown `sessionId` defaults to a
configurable `initialBalance` (`0` unless you pass one to the constructor).

Both are constructor options on `PokieDevServer`, additive to the existing `{host, port}` options:

```ts
import {FileSessionRepository, InMemoryWallet, loadPokieGame, PokieDevServer} from "pokie";

const game = await loadPokieGame("./crazy-fruits");
const server = new PokieDevServer(game, {
    host: "127.0.0.1",
    port: 4000,
    sessionRepository: new FileSessionRepository("./sessions"),
    wallet: new InMemoryWallet(1000),
});
```

A live `GameSessionHandling` object is still needed to actually run `play()` — `PokieDevServer` keeps a
process-local cache of already-constructed sessions for that, separate from `SessionRepository`. On a cache miss
(e.g. right after a restart), it reconstructs one via `game.createSession(state.context)` plus `state.bet` before
spinning; a game's other internal state (RNG stream position, round counters not exposed through
`GameSessionHandling`) starts fresh in that case, same caveat as `--seed` reproducibility elsewhere in this CLI.

### Failure modes

- Missing `<packageRoot>`, an unknown option, a non-numeric `--port`, or a missing `--host` value throw a
  `Usage: pokie serve ...` error before the server starts (same as every other command).
- An invalid `packageRoot` throws the same descriptive error `loadPokieGame` would throw directly — see
  [Game Packages](game-packages.md).
- Once the server is running, errors are JSON HTTP responses (`400`/`404`/`500` with `{"error": "..."}`), not
  thrown/exit codes — `pokie serve` is a long-running process, not a one-shot command.

The reusable server sits behind `src/server` (`PokieDevServer`, implementing `PokieDevServerHandling`) — the same
"thin CLI wrapper over a reusable class" shape as [`pokie replay`](#pokie-replay-packageroot):

```ts
import {loadPokieGame, PokieDevServer, PokieDevServerHandling} from "pokie";

const game = await loadPokieGame("./crazy-fruits");
const server: PokieDevServerHandling = new PokieDevServer(game, {host: "127.0.0.1", port: 4000});
const address = await server.start(); // {host, port} — port is the OS-assigned one if 0 was requested
// ...
await server.stop();
```

## Workflow

A typical end-to-end loop, from a fresh directory to a running dev server, chaining every subcommand above:

```
pokie create crazy-fruits
cd crazy-fruits && npm install && npm run build && cd ..

pokie validate ./crazy-fruits

pokie sim ./crazy-fruits --rounds 100000 --seed before --out before.json
pokie report before.json --format markdown --out before.md

# ...tweak the game's paytable/config...

pokie sim ./crazy-fruits --rounds 100000 --seed before --out after.json
pokie diff before.json after.json

pokie replay ./crazy-fruits --seed before --round 42 --out replay.json

pokie serve ./crazy-fruits --port 4000
```

Each step builds on the same `<packageRoot>`:

- [`validate`](#pokie-validate-packageroot) needs a built package (`pokie create`/`pokie init` +
  `npm install && npm run build`) — it checks the contract before anything else runs.
- [`sim --out`](#pokie-sim-packageroot) produces the JSON report that
  [`report`](#pokie-report-simulationreportjson) renders and [`diff`](#pokie-diff-leftreportjson-rightreportjson)
  compares — run `sim` twice (before/after a config change, same `--seed`) to get two reports worth diffing.
- [`replay`](#pokie-replay-packageroot) is independent of `sim`'s output files, but reproducibility across all
  three of `sim`/`diff`/`replay` depends on the same caveat: the game package must actually thread `context.seed`
  into a deterministic RNG for `--seed` to mean anything (see [Limitations](#limitations) below).
- [`serve`](#pokie-serve-packageroot-experimental) is normally the last, interactive step, not part of a scripted
  pipeline — it only needs the same built package and runs until stopped.

## What's next

`pokie create`, `pokie init`, `pokie sim`, `pokie validate`, `pokie report`, `pokie diff`, `pokie replay`, and
`pokie serve` are the first of a planned set of subcommands built on the same [game package](game-packages.md)
primitives (`loadPokieGame`, `isPokieGame`, `PokieGameContractValidationRule`).
