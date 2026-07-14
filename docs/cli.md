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

- `package.json` — name `<name>`, a `pokie` dependency, `build`/`start`/`server`/`client` scripts (see
  [`pokie serve`](#pokie-serve-packageroot-experimental)/[`pokie client`](#pokie-client-packageroot-experimental)/
  [`pokie dev`](#pokie-dev-packageroot-experimental) below), and `pokie.entry` pointing at `./dist/index.js`;
- `tsconfig.json` (CommonJS output to `./dist`, source in `./src`);
- `src/<GameName>Game.ts` — a `PokieGame` implementation (`<GameName>` is `<name>` converted to PascalCase, e.g.
  `crazy-fruits` → `CrazyFruits`), with a manifest id/name derived from `<name>`, and a `getSessionSerializer()`
  returning `new VideoSlotSessionSerializer()` so `pokie serve`/`pokie client`/`pokie dev` show the full
  game-specific payload out of the box (see [Network Serialization](serialization.md));
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

## `pokie build [config.json]`

Generates a working [game package](game-packages.md) from a `GameBlueprint` — reels/rows, symbols, paylines,
paytable, and reel strips/weights for a standard line-pay video slot. Unlike `pokie create`/`pokie init`, the
output is plain JavaScript with no compile step: it's immediately loadable by every other command below.

There are three ways to provide the blueprint:

- **config-driven** — `pokie build <config.json>` reads it from a JSON file (this section);
- **interactive** — `pokie build` with no arguments launches a wizard that asks for the same fields on the
  terminal (see [Interactive mode](#interactive-mode-pokie-build-with-no-arguments) below);
- **starter template** — `pokie build --init-blueprint <file>` writes a small, hand-editable example
  `GameBlueprint` to `<file>` instead of building anything, for editing by hand and feeding back into the
  config-driven path above (see [Starter template](#starter-template-pokie-build---init-blueprint-file) below).

Both produce the exact same `GameBlueprint` shape, go through the exact same validation
([`GameBlueprintValidator`](#validation)) and generation ([`GamePackageGenerator`](#pokie-build-configjson)), and
the resulting package supports the exact same
[`build -> inspect -> validate -> sim -> report -> replay -> serve`/`dev` workflow](#workflow-build---inspect---validate---sim---report---replay---servedev) —
the wizard is just another way to assemble the same input, not a different code path.

```
pokie build examples/blueprints/crazy-fruits.blueprint.json
cd crazy-fruits
npm install
```

`pokie build <config.json>` validates the blueprint first (see below) and, if it has no errors, creates
`./<manifest.id>` (or `--out <dir>`) and writes:

- `package.json` — name/version/description from `manifest` (a default description if `manifest.description` is
  omitted), a `pokie` dependency, `start`/`server`/`client` scripts, and `pokie.entry` pointing at
  `./src/generated/index.js`;
- `README.md` — a short orientation doc for the generated package itself: what each file is, that
  `src/generated/` is generated output and shouldn't be hand-edited, and the `build -> inspect -> validate -> sim ->
  report -> replay -> serve`/`dev` workflow below;
- `src/generated/index.js` — a `PokieGame` implementation built from the blueprint: a `VideoSlotConfig` with the
  given reels/rows/symbols/wilds/scatters/paytable/paylines/reel strips, wrapped in a `VideoSlotSession`, with
  `getSessionSerializer()` returning `new VideoSlotSessionSerializer()`. The file is organized into labeled
  sections (blueprint data, config assembly, `PokieGame` exports) with a header comment summarizing the build
  metadata below. Re-run `pokie build` to regenerate this file after changing the blueprint — it's generated
  output, not meant to be hand-edited;
- `src/generated/build-info.json` — provenance for the generated output: the `GameBlueprint` schema version, the
  `pokie` version that generated it, an ISO 8601 generation timestamp, a `sha256` hash of the source blueprint
  (so an unchanged blueprint reproduces the same hash across re-runs), the source file path (when known), the
  list of files this run generated (`files` — also what a later `pokie build` reads to recognize this directory
  as safe to rebuild, see below), the blueprint's own `manifest`, and — only when the blueprint's
  `reelStripGeneration` actually generated at least one reel — a `reelStripGeneration: {reels}` block with one
  entry per *generated* reel (literal reels have no generation story to record): that reel's own authored config
  (including its `seed`) and the resulting exact strip; see
  [`reelStripGeneration`](#reelstripgeneration-build-time-reel-strip-generation) above. The same summary (minus
  the timestamp and the full hash's `sha256:` prefix repetition) is echoed as the header comment in `index.js`, so
  either file is enough to tell what a generated package was built from. Re-running `pokie build` on an unchanged
  blueprint with the same `pokie` version regenerates every file byte-identically, including `build-info.json`'s
  own timestamp (reused from the previous run rather than restamped) — see
  [Rebuilding an existing `--out` directory](#rebuilding-an-existing---out-directory).

After generation, `pokie build` prints a build summary to stdout: package root, game id/name/version, blueprint
hash, source path (when known), the files it wrote, and a `status` line — `generated` for a real build, or an
explicit `unchanged` message when the rebuild above turned out to be a no-op.

Options:

- `--out <dir>` — write the package to `<dir>` instead of `./<manifest.id>`.
- `--dry-run` — validate the blueprint and print a preview (game id/name/version, reels x rows, symbol count,
  payline count, bets, blueprint hash, and the files a real build would generate) without creating or touching
  the `--out` directory at all. Exit code follows the same rule as a normal build: non-zero if the blueprint has
  errors, `0` if it's valid (warnings included).

### Starter template (`pokie build --init-blueprint <file>`)

For editing by hand rather than writing a `GameBlueprint` from scratch or answering the [interactive
wizard](#interactive-mode-pokie-build-with-no-arguments)'s prompts:

```
pokie build --init-blueprint my-game.blueprint.json
```

```
Created starter blueprint "my-game.blueprint.json".

Edit it by hand, then run:
  pokie build my-game.blueprint.json --dry-run
  pokie build my-game.blueprint.json --out <dir>
```

Writes a small-but-complete, formatted `GameBlueprint` JSON file to `<file>` — game id/name/version, reels/rows,
symbols, available bets, paylines, a paytable, and symbol weights, all filled with valid example values (not the
minimum required to pass validation) so there's something concrete to edit for every field. It passes
[`GameBlueprintValidator`](#validation) with zero errors or warnings as written, and `pokie build <file> --out
<dir>` works on it completely unedited — but the point is to open it in an editor, change the numbers/symbols/ids
to your own game, and build that.

The full starter-template workflow — scaffold, hand-edit, validate-only preview, then a real build:

```
pokie build --init-blueprint my-game.blueprint.json
# ...edit my-game.blueprint.json by hand...
pokie build my-game.blueprint.json --dry-run    # re-run after every edit until it looks right
pokie build my-game.blueprint.json --out my-game
```

[`--dry-run`](#pokie-build-configjson) validates the edited blueprint and prints the same preview a real build
would (game info, reels/rows, symbol/payline/bet counts, blueprint hash, expected files) without creating or
touching `--out` — so a mistake in a hand-edit is caught immediately, with the same error messages a real build
would print, before anything is generated.

`--init-blueprint` only ever writes `<file>` itself: it doesn't launch the wizard, validate anything beyond what's
needed to write the template, or call `GamePackageGenerator` — no package is generated, and nothing else on disk is
touched. If `<file>` already exists, it's left untouched and the command exits with an error instead of silently
overwriting it — remove or rename the existing file first, or pick a different `<file>`.

### The `GameBlueprint` format

```ts
{
    manifest: {id: string; name: string; version: string; description?: string; author?: string};
    reels: number;
    rows: number;
    symbols: string[];
    wilds?: string[];        // must be a subset of "symbols"
    scatters?: string[];     // must be a subset of "symbols"
    // Row index (0-based) per reel, one array per payline. Omit for the engine's default: one
    // horizontal line per row (VideoSlotConfig's own default via HorizontalLines).
    paylines?: number[][];
    // symbolId -> matchCount -> bet multiplier, applied across every configured bet.
    paytable: Record<string, Record<string, number>>;
    // One strip (an ordered array of symbol ids) per reel. Takes precedence over reelStripGeneration
    // and symbolWeights. Unchanged since before reelStripGeneration existed.
    reelStrips?: string[][];
    // Per-reel build-time alternative to a literal reelStrips: one entry per reel (must have exactly
    // "reels" entries), each independently either a literal strip or its own generation config — see
    // "reelStripGeneration" below. Mutually exclusive with reelStrips (an error if both are set);
    // takes precedence over symbolWeights.
    reelStripGeneration?: ReelStripGenerationSpec[];
    // symbolId -> relative count, applied uniformly (independently shuffled) to every reel. Ignored
    // when reelStrips or reelStripGeneration is present. Omit all three for the engine's built-in
    // default weighting.
    symbolWeights?: Record<string, number>;
    availableBets?: number[];
}
```

A minimal example (5x3, 3 symbols, no wilds/scatters, default paylines and reel weighting):

```json
{
    "manifest": {"id": "crazy-fruits", "name": "Crazy Fruits", "version": "0.1.0"},
    "reels": 5,
    "rows": 3,
    "symbols": ["A", "K", "Q"],
    "paytable": {
        "A": {"3": 5, "4": 10, "5": 20},
        "K": {"3": 4, "4": 8, "5": 16},
        "Q": {"3": 3, "4": 6, "5": 12}
    }
}
```

A complete example using every optional field (wilds, scatters, `symbolWeights`, `availableBets`) lives at
[`examples/blueprints/crazy-fruits.blueprint.json`](../examples/blueprints/crazy-fruits.blueprint.json) in this
repository — see [`examples/blueprints/README.md`](../examples/blueprints/README.md) for how to try it directly
from a checkout. It's also what the workflow below and `pokie build`'s own smoke test
(`tests/cli/BuildWorkflow.integration.test.ts`) both run, so it's guaranteed to actually work, not just parse.

### `reelStripGeneration` (build-time reel strip generation)

A **per-reel** alternative to hand-authoring `reelStrips`: an array with exactly one entry per reel, each entry
independently either a literal strip or its own build-time generation config run through the same
[`ReelStripGenerator`](reel-strip-generation.md) you'd use programmatically. Literal and generated reels freely mix
within one blueprint — there is no blueprint-wide shared config, every "generated" reel is entirely independent
(own `length`, own `symbolCounts`/`symbolWeights`, own `seed`, own `constraints`). `pokie build` bakes the resulting
exact strips into the generated package as plain `reelStrips` — the runtime game module never depends on the
generation API at all, only ever seeing a plain literal array (the same shape a hand-authored `reelStrips`
blueprint already has).

```ts
type ReelStripGenerationSpec =
    | {type: "literal"; strip: string[]}                    // same data a reelStrips[i] entry would hold
    | {type: "generated"} & ReelStripGenerationConfig;

type ReelStripGenerationConfig = {
    length: number;
    // Exactly one of these two must be set.
    symbolCounts?: Record<string, number>;
    symbolWeights?: Record<string, number>;
    // Required (not optional): build-time generation must be reproducible.
    seed: number;
    roundingPolicy?: "floor" | "round" | "ceil";                              // only with symbolWeights
    remainderTieBreakPolicy?: "symbol-id" | "declared-order" | "largest-weight-first"; // only with symbolWeights
    lockedPositions?: Record<number, string>;
    constraints?: ReelStripConstraintSpec[];
    maxAttempts?: number;
};
```

Generation is fully **deterministic**: each "generated" entry supplies its own `seed`, so re-running `pokie build`
on an unchanged blueprint always reproduces the same exact strip for every generated reel, and a rebuild reports
`status  unchanged` exactly like a literal-`reelStrips` blueprint would.

`constraints` entries are plain JSON, not class instances — a `type` field picks which
[constraint](reel-strip-generation.md#constraints-reelstripconstraint) to build, and every other field maps onto
that constraint's own constructor parameters:

```ts
type ReelStripConstraintSpec =
    | {type: "minimumCircularDistance"; minimumDistance: number; symbolIds?: string[]; wrapAround?: boolean}
    | {type: "maximumCircularDistance"; maximumDistance: number; symbolIds?: string[]; wrapAround?: boolean}
    | {type: "maximumConsecutiveOccurrences"; maximumConsecutive: number; symbolIds?: string[]; wrapAround?: boolean}
    | {type: "forbiddenAdjacency"; pairs: [string, string][]; wrapAround?: boolean; directed?: boolean}
    | {type: "requiredAdjacency"; pairs: [string, string][]; directed?: boolean; wrapAround?: boolean}
    | {type: "forbiddenSequence"; sequence: string[]; maximumOccurrences?: number; reversed?: boolean; wrapAround?: boolean}
    | {type: "requiredSequence"; sequence: string[]; minimumOccurrences?: number; maximumOccurrences?: number; reversed?: boolean; wrapAround?: boolean};
```

A complete example (one hand-placed literal reel, four independently generated reels — different lengths, seeds,
constraints, `symbolCounts` vs. `symbolWeights`, and a locked position) lives at
[`examples/blueprints/generated-reels.blueprint.json`](../examples/blueprints/generated-reels.blueprint.json) — see
[`examples/blueprints/README.md`](../examples/blueprints/README.md) to try it directly from a checkout.

**When generation fails** — a "generated" entry's constraints can't be satisfied within its own `maxAttempts` —
`pokie build` reports it exactly like a validation error: printed per failing reel with its index, seed, attempt
count, and the closest attempt's constraint violations, then exits non-zero without writing any files. Other
reels' generation is unaffected (each is entirely independent) — only the failing reel(s) are reported. This only
runs *after* validation passes (validation only checks `reelStripGeneration`'s shape — one entry per reel, each a
well-formed `{type: "literal", strip}` or `{type: "generated", ...}` with a positive `length`, an integer `seed`,
exactly one of `symbolCounts`/`symbolWeights`, and a fully validated `constraints` array — every required field
present, correct types, unknown symbols, and numeric bounds checked per constraint `type`; see
[Validation](#validation) below) — whether a configuration is actually *satisfiable* is a question only
`ReelStripGenerator` itself can answer, by actually trying.

**`build-info.json`** additionally records `reelStripGeneration: {reels}` when at least one reel was actually
generated: one entry per *generated* reel (literal reels have no generation story to record) with that reel's own
authored `config` (including its `seed`), `success`, `attemptsUsed`, `diagnostics`, and — on success — the
resulting exact `strip`. Absent entirely for a literal-`reelStrips` blueprint, an all-literal
`reelStripGeneration`, or one using neither field.

`blueprintHash`/the `status  unchanged` no-op-rebuild check are both computed from the blueprint exactly as
**authored** (with its `reelStripGeneration` array intact), not from the materialized `reelStrips` a build produces
— two different authored configs that happen to generate byte-identical strips still hash differently, and only an
unchanged *authored* blueprint is ever reported as a no-op rebuild.

### Validation

Every field above is checked before anything is generated: `manifest.id`/`name`/`version` must be non-empty
strings; `reels`/`rows` must be positive integers; `symbols` must be a non-empty array of unique non-empty
strings; `wilds`/`scatters` must be arrays of unique symbol ids with no overlap between the two; `wilds`/`scatters`/
`paytable` keys/`reelStrips` symbols/`reelStripGeneration` symbols/`symbolWeights` keys must all reference symbols
actually listed in `symbols`; `paytable` match-counts must be integers between 2 and `reels`, with positive
multipliers; `paylines` entries must have exactly `reels` row indexes, each within `[0, rows)`; `reelStrips` must
have exactly one strip per reel; `reelStripGeneration` must have exactly one entry per reel, each entry either a
well-formed `{type: "literal", strip}` (a non-empty array of known symbol ids) or `{type: "generated", ...}` with
a positive `length`, an integer `seed`, exactly one of `symbolCounts`/`symbolWeights`, well-shaped
`lockedPositions`, a positive `maxAttempts`, and valid `roundingPolicy`/`remainderTieBreakPolicy` enum values where
present; `availableBets` must be positive numbers.

Every `constraints[]` entry inside a `"generated"` reel is fully validated too, not just its `type`: every field
that `type` requires must be present with the correct JS type (a number, a boolean, an array of known symbol ids,
...), numeric bounds must make sense (positive/non-negative integers, and for `requiredSequence`,
`maximumOccurrences >= minimumOccurrences`), and any symbol id referenced anywhere in the spec (`symbolIds`,
sequence/pair entries, ...) must actually be listed in `symbols`.

A `symbolCounts` entry of exactly `0` is treated as **absent from that reel** for reachability purposes (it will
never actually land), exactly like a symbol simply omitted from a literal `reelStrips` entry — declaring
`{A: 5, B: 0}` does not make `B` reachable via that reel.

Since `reelStrips` (or, absent that, `reelStripGeneration`, or absent that, `symbolWeights`) fully replaces the
engine's default reel generator, every symbol referenced by `paytable`/`wilds`/`scatters` must also actually appear
somewhere across it — otherwise that payout, wild, or scatter can physically never land, which is flagged as an
error, not a warning. Note that this only checks `reelStripGeneration`'s declared `strip`/`symbolCounts`/
`symbolWeights` content — whether a `"generated"` reel's generation actually *succeeds* is checked separately,
after validation passes (see [`reelStripGeneration`](#reelstripgeneration-build-time-reel-strip-generation) above).

Setting both `reelStrips` and `reelStripGeneration` is an error (not a warning): a reel's strip must come from
exactly one of them, so there's no sensible precedence to fall back to. Within a single blueprint, though, literal
and generated reels freely mix — that mixing lives entirely inside `reelStripGeneration`'s own per-reel array (a
`{type: "literal", ...}` entry alongside `{type: "generated", ...}` entries), not between `reelStrips` and
`reelStripGeneration`.

A number of further checks catch configs that parse fine but are almost certainly mistakes, so they're reported as
**warnings** rather than errors (they don't block generation): a paytable entry for a wild symbol's own id (an
all-wild line resolves to no winning symbol id, so the entry is never looked up); setting both `reelStrips` and
`symbolWeights` (`reelStrips` wins, `symbolWeights` is ignored), or both `reelStripGeneration` and `symbolWeights`
(`reelStripGeneration` wins); duplicate `paylines` entries or duplicate `availableBets` values; a `reelStrips`
entry shorter than `rows` (guaranteed to repeat a symbol within a single spin due to wrapping); a `paytable` entry
that pays less for more matching symbols than for fewer; a non-wild, non-scatter symbol in `symbols` with no
`paytable` entry at all (it can never win anything); and `reels`/`rows` values above 10 (unusually large for a
line-pay video slot).

#### Math-quality warnings

A further set of warnings look for blueprints that parse and generate fine but are likely to produce an
unrealistic RTP — the exact kind of mistake that's easy to make by hand and only obvious after running
[`pokie sim`](#pokie-sim-packageroot). All of these are static, cheap checks on the blueprint's own numbers (not a
simulation) and only apply to non-scatter, non-wild symbols with at least one payout — scatters are exempt, since
their economics (paying from 2-of-a-kind, much bigger multipliers) are legitimately different:

- **Frequent low-match payouts** (`blueprint-paytable-frequent-low-match`) — a payout at 2 matching symbols. Most
  line-pay symbols start at 3-of-a-kind; paying from 2 hits very often and inflates hit frequency and RTP.
- **Missing base payout** (`blueprint-paytable-missing-base-payout`) — payouts defined only for 4/5-of-a-kind but
  not 3, when `reels` is at least 3.
- **Generous entry-tier payout** (`blueprint-paytable-generous-entry-payout`) — a symbol's lowest configured
  match-count pays more than 10x bet, unusually generous for what's normally the most frequently-hit tier.
- **No low/high-pay tiering** (`blueprint-paytable-no-tiering`) — every symbol with a payout tops out at the exact
  same multiplier, so there's no differentiation between filler and premium symbols.
- **A symbol dominates the reels** (`blueprint-weighting-dominant-symbol`) — one symbol makes up more than 40% of
  `symbolWeights` (or `reelStripGeneration`'s own `symbolCounts`/`symbolWeights`, or, counting occurrences across
  every strip, `reelStrips`), crowding out the rest.
- **A wild is too common** (`blueprint-weighting-wild-too-common`) — a wild symbol's weight is at least as high as
  the average of the regular symbols. Wilds substitute for everything, so landing this often inflates RTP well
  beyond what the paytable alone suggests.
- **Payout doesn't track rarity** (`blueprint-weighting-pay-mismatch`) — a higher-paying symbol isn't rarer (in
  `symbolWeights`/`reelStripGeneration`/`reelStrips`) than a lower-paying one. This is the most common way a
  blueprint's RTP quietly runs away: identical weights across symbols with different payouts (every symbol equally
  likely, but some worth much more) mean the high-value symbol lands just as often as the low-value one — see
  [`examples/blueprints/crazy-fruits.blueprint.json`](../examples/blueprints/crazy-fruits.blueprint.json)'s own
  `symbolWeights`/`paytable` for what a fix looks like (low-pay symbols weighted heavier, high-pay symbols rarer).

None of these check the actual math (that's what [`pokie sim`](#pokie-sim-packageroot) is for) — they flag shapes
that are very likely to be a mistake, so run `pokie sim --rounds 100000` on anything they flag before trusting the
math either way.

Every error is printed with its code and message, followed by a one-line pointer back to this section
(`<config.json> is a GameBlueprint ... — see docs/cli.md#pokie-build-configjson for the format.`), so a failed
`pokie build` always tells you where to look next, not just what's wrong.

Failure modes:

- Missing `<config.json>` launches the [interactive wizard](#interactive-mode-pokie-build-with-no-arguments)
  instead of failing — see that section for its own cancellation/invalid-input handling. An unknown option (given
  alongside a config path) throws a `Usage: pokie build <config.json> [--out <dir>]` error (plus the same doc
  pointer as above).
- A blueprint with any error-level issue prints every error plus the doc pointer and exits `1` without generating
  anything — whether the blueprint came from `<config.json>` or the wizard.
- The output directory (`./<manifest.id>` or `--out <dir>`) already existing as a *file* (not a directory)
  throws — pick a different `--out` or remove it first.
- The output directory already existing and containing a file `pokie build` did not generate — at any of
  `package.json`, `README.md`, `src/generated/index.js`, `src/generated/build-info.json` — throws, naming the
  conflicting file(s), instead of silently overwriting them. See the next section for exactly when this does and
  doesn't trigger.

### Rebuilding an existing `--out` directory

Re-running `pokie build <config.json> --out <dir>` into a directory from a previous `pokie build` run — after
editing the blueprint, or just to pick up a newer `pokie` version — overwrites it in place instead of throwing.
This is recognized via that directory's own `src/generated/build-info.json` (itself `pokie build` output): if it
parses and its `generatedBy` is `"pokie build"`, every file its `files` list names is trusted and freely
overwritten. An empty or entirely unrelated existing directory (no file at any of the four generated paths) is
also fine to build into.

What isn't overwritten silently: if the directory has no such `build-info.json` (or it fails to parse, or wasn't
written by `pokie build`) *and* already has a file at one of the four generated paths — e.g. your own unrelated
`package.json` sitting at that `--out` path — `pokie build` refuses and names exactly which path(s) conflict,
rather than guessing. Files elsewhere in the directory (anything not at one of those four paths — your own docs,
`node_modules`, a lockfile, `.git`) are never touched either way and never cause a conflict.

Rebuilding the *same* blueprint with the same `pokie` version reproduces every generated file byte-for-byte,
`build-info.json` included (see the `build-info.json` bullet above) — a rebuild of an unchanged blueprint is a
true no-op, not just a smaller diff. The build summary's `status` line calls this out explicitly as `unchanged`.
Want to check this without writing anything at all? `pokie build <config.json> --dry-run` validates and prints
the same blueprint hash a real build would produce, with no `--out` directory created or touched.

### Interactive mode (`pokie build` with no arguments)

```
pokie build
```

Runs a wizard on the terminal that asks, in order, for: game id/name/version; reels/rows; symbols; available
bets; paylines; paytable; reel weighting (symbol weights or explicit reel strips); and the output directory.
Each answer that has a sensible default (name, version, reels, rows, available bets, paylines, output directory)
can be left blank to accept it — the prompt shows the default in `[brackets]`. The wizard is deliberately minimal:
it asks for the same fields `pokie build <config.json>` needs for a line-pay video slot and nothing more (no
wilds/scatters yet) — add those by hand-editing the generated blueprint's config-driven equivalent, or wait for a
future wizard pass.

The wizard assembles a plain `GameBlueprint` object — the same shape a `<config.json>` file has — and hands it to
the exact same [`GameBlueprintValidator`](#validation)/[`GamePackageGenerator`](#pokie-build-configjson) the
config-driven path uses, so everything in the sections above (the field format, validation rules, `--out`-style
output directory prompt, rebuild behavior) applies identically; the wizard has no *generation* logic of its own.
It does do light, per-prompt input-shape checks (a number is a number, a symbol id isn't blank, ...), and a
handful of these deliberately mirror `GameBlueprintValidator`'s own error-level rules — specifically the ones
cheap to check immediately against fields already collected earlier in the same run (a paytable `matchCount`
between 2 and the chosen reel count; a reel-weighting/reel-strip symbol that's actually one of the symbols entered
earlier) — so a typo is caught and re-asked on the spot instead of only surfacing as a validator error after
answering every remaining question. This is a convenience, not a second source of truth: the final answer is
always whatever `GameBlueprintValidator` decides once the wizard hands off its result, same as for
`<config.json>`.

Per-question input handling:

- An answer that doesn't parse (e.g. non-numeric reels, a duplicate symbol id, a malformed `matchCount:multiplier`
  pair, a paytable `matchCount` outside `2..reels`, a reel-weighting symbol not among the symbols entered earlier)
  prints a one-line reason and re-asks the same question — it never silently drops or guesses at bad input.
- Pressing **Ctrl+C** at any prompt cancels the wizard gracefully: it prints `Build cancelled.` and exits with a
  non-zero status without writing anything, rather than a stack trace. So does closing/exhausting the input stream
  (EOF) — e.g. a scripted/piped run that provides fewer answers than the wizard asks for.
- The paytable and reel-strip prompts are asked once per symbol/reel (so the number of prompts scales with how
  many symbols/reels you configured earlier in the same run).
- Reel weighting is a single choice up front — `w` for symbol weights (one combined `symbol:count` line), `s` for
  explicit reel strips (one line per reel), or blank for the engine's built-in default weighting — mirroring the
  blueprint's own `reelStrips`/`symbolWeights` mutual exclusivity.
- Symbol ids can't contain `:` — the wizard's own prompts reuse it as a pair separator later on (paytable, symbol
  weights), so a symbol id containing one would be unparseable there.

Answers can also be piped/scripted (e.g. `printf '...\n...\n' | pokie build`, or piping a saved answers file) —
each question is answered from the piped input in the same order it would be asked interactively, one line per
prompt, and the same reprompt-on-invalid-input and EOF-cancellation rules apply.

Once the wizard completes, it prints the same "created files" / "Next:" summary as the config-driven path,
including the ready-to-run `validate -> sim -> report -> replay -> serve`/`dev` commands below.

### Workflow: `build` -> `inspect` -> `validate` -> `sim` -> `report` -> `replay` -> `serve`/`dev`

The minimal loop from a blueprint to a running local server, chaining every command this file documents. Unlike
the [`create`/`init` workflow](#workflow) below, there's no `npm run build` step in the middle — `pokie build`
output is loadable immediately after `npm install`:

```
pokie build examples/blueprints/crazy-fruits.blueprint.json
cd crazy-fruits && npm install && cd ..

pokie inspect ./crazy-fruits

pokie validate ./crazy-fruits

pokie sim ./crazy-fruits --rounds 100000 --seed demo --out sim.json
pokie report sim.json

pokie replay ./crazy-fruits --seed demo --round 42

pokie dev ./crazy-fruits
```

`pokie build`'s own success output prints exactly this sequence (with real paths substituted in) as its "Next:"
lines, so you don't have to come back to this doc to remember the order.

Each step is the same command documented elsewhere in this file, with the same options/failure modes —
[`inspect`](#pokie-inspect-packageroot), [`validate`](#pokie-validate-packageroot),
[`sim`](#pokie-sim-packageroot)/[`report`](#pokie-report-simulationreportjson),
[`replay`](#pokie-replay-packageroot), and [`serve`](#pokie-serve-packageroot-experimental)/
[`dev`](#pokie-dev-packageroot-experimental) work identically whether the package came from `pokie build`,
`pokie create`, or `pokie init` — none of them care how a package was produced, only that it satisfies the
[game package](game-packages.md) contract. `pokie sim --out` twice (before/after a tweak) also lets you
[`pokie diff`](#pokie-diff-leftreportjson-rightreportjson) the two reports, same as the [`create`/`init`
workflow](#workflow) below.

## `pokie par import <input.xlsx>` / `pokie par export <config.json>`

Round-trips a `GameBlueprint` to/from a "PAR sheet" — a workbook laid out the way a game designer would author
symbols/reel strips/paytable/paylines/bets in Excel, instead of hand-writing JSON. Supports the same subset of
`GameBlueprint` as [`pokie build --init-blueprint`](#starter-template-pokie-build---init-blueprint-file)'s
literal-`reelStrips` path — manifest, reels/rows, symbols (with wilds/scatters), literal `reelStrips`, `paytable`,
`paylines`, and `availableBets`. `reelStripGeneration`/`symbolWeights` (procedural reel generation, see
[`reelStripGeneration`](#reelstripgeneration-build-time-reel-strip-generation)) are not supported by this command.

```
pokie par export examples/parsheets/starter.blueprint.json --out starter.par.xlsx
pokie par import starter.par.xlsx --out starter.blueprint.json
```

See `examples/parsheets/` for a worked example (`starter.blueprint.json` and the `starter.par.xlsx` exported from
it).

### Workbook format

A `.par.xlsx` workbook has up to seven sheets:

| Sheet | Columns | Required | Maps to |
|---|---|---|---|
| `Manifest` | `Key`, `Value` (rows: `Id`, `Name`, `Version`, `Description`, `Author`, `Reels`, `Rows`) | yes | `manifest`, `reels`, `rows` |
| `Symbols` | `Symbol`, `Wild`, `Scatter` — one row per symbol, in reel order | yes | `symbols`, `wilds`, `scatters` |
| `Paytable` | `Symbol`, `Matches`, `Multiplier` — one row per payout tier | yes | `paytable` |
| `ReelStrips` | `Reel 1`..`Reel N` — one row per strip position; a shorter (ragged) reel just leaves trailing blank cells | no | `reelStrips` (literal only) |
| `Paylines` | `Line` (a 1-based label, not read back), `Reel 1`..`Reel N` (row index per reel) | no | `paylines` |
| `AvailableBets` | `Bet` — one row per value | no | `availableBets` |
| `Meta` | `Key`, `Value` (rows: `Schema Version`, `Pokie Version`, `Exported At`, `Source`, `Blueprint Hash`) | no | nothing — provenance only, see below |

`pokie par export` always writes every sheet except `ReelStrips`, which it omits when the blueprint has no
literal `reelStrips` (i.e. it only has `reelStripGeneration`/`symbolWeights`) — the rest of the workbook is still
written, so the file is still useful for editing symbols/paytable/paylines/bets by hand even though this command
can't represent that blueprint's reel data.

### `pokie par import <input.xlsx>`

Reads `<input.xlsx>`, maps every sheet above to a `GameBlueprint`, then runs the result through the same
[`GameBlueprintValidator`](#validation) `pokie build` uses — so an imported PAR sheet gets the exact same
reachability/paytable-quality/weighting checks as a hand-written blueprint. If there are no error-level issues,
writes the resulting `GameBlueprint` JSON to `--out <file>` (default: `<input>` with its extension replaced by
`.blueprint.json`).

Options:

- `--out <file>` — where to write the imported `GameBlueprint` JSON.
- `--format json` — print the full `{blueprint, issues}` result as JSON instead of a human-readable summary.

Exit code is non-zero (and nothing is written) if there are any error-level diagnostics.

### `pokie par export <config.json>`

Loads `<config.json>` (a `GameBlueprint`, same as [`pokie build`](#pokie-build-configjson)), validates it, and —
provided it has no error-level issues — writes a `.par.xlsx` workbook to `--out <file>` (default: `<config.json>`
with `.blueprint.json`/`.json` replaced by `.par.xlsx`). A missing literal `reelStrips` is reported as its own
error (see above) but does not stop the rest of the workbook from being written.

Options:

- `--out <file>` — where to write the exported workbook.

### Diagnostics

Both directions report problems as `ValidationIssue`s (the same `{code, severity, message, details, suggestion}`
shape as [`pokie build`'s validation](#validation)):

- an unrecognized sheet name (`parsheet-unknown-sheet`, warning) or column (`parsheet-unknown-column`, warning);
- a missing required sheet (`parsheet-missing-sheet`) or column (`parsheet-missing-column`);
- a cell that can't be parsed as the type its column expects — e.g. a non-numeric `Multiplier`
  (`parsheet-paytable-invalid-multiplier-cell`) or an unrecognizable `Wild`/`Scatter` flag
  (`parsheet-symbol-invalid-flag`);
- a blank cell in a required column, which drops that row (`parsheet-symbol-missing-id`,
  `parsheet-paytable-missing-symbol`);
- two rows that collide once turned into a single `GameBlueprint` field, e.g. the same `(Symbol, Matches)` pair
  twice in `Paytable` (`parsheet-paytable-duplicate-entry`, warning — the last one wins) or the same key twice in
  `Manifest`/`Meta` (`parsheet-manifest-duplicate-key`, warning);
- a gap in `ReelStrips` — a blank cell followed by a non-blank one further down the same column
  (`parsheet-reelstrips-gap`) — as opposed to a shorter (ragged) reel's trailing blank cells, which are fine;
- everything `GameBlueprintValidator` itself already checks once the blueprint is assembled (unknown/duplicate
  symbols, unreachable symbols, out-of-range match counts, paytable/weighting quality warnings, ...) — these use
  the same `blueprint-*` codes documented under [Validation](#validation), not `parsheet-*`.

### Provenance (`Meta` sheet)

`pokie par export` always writes a `Meta` sheet recording the `GameBlueprint` schema version, the `pokie` version
that exported it, an ISO 8601 export timestamp, the source blueprint's file path (when known), and a `sha256`
hash of the exported blueprint (the same formula `GameBuildInfo`'s `blueprintHash` uses — see
[`pokie build`](#pokie-build-configjson)). None of it is fed back into the imported `GameBlueprint`; `pokie par
import` only ever surfaces it as a single informational `parsheet-provenance-present` issue (or a
`parsheet-provenance-missing` warning if the sheet isn't there at all — e.g. a hand-authored PAR sheet that was
never exported by `pokie par export` in the first place).

## `pokie init`

Turns an existing npm project into a minimal POKIE-compatible game package.

```
npm init -y
npm i pokie
npx pokie init
```

Run inside the project directory. `pokie init` reads the project's `package.json` and:

- adds/updates `pokie.entry` (pointing at `./dist/index.js`);
- adds `build`/`start`/`server`/`client` scripts (see
  [`pokie serve`](#pokie-serve-packageroot-experimental)/[`pokie client`](#pokie-client-packageroot-experimental)/
  [`pokie dev`](#pokie-dev-packageroot-experimental) below), without overwriting any script you already have;
- adds `typescript` to `devDependencies` and `pokie` to `dependencies` if either is missing;
- creates a minimal `tsconfig.json` (CommonJS output to `./dist`, source in `./src`);
- creates `src/index.ts`, a working entry module exporting a `PokieGame` — `getManifest()` returns an id/name
  derived from the project's package name (and its version), `createSession()` returns a default
  `VideoSlotSession`, and `getSessionSerializer()` returns `new VideoSlotSessionSerializer()` (see
  [Network Serialization](serialization.md)).

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
pokie sim ./crazy-fruits --rounds 1000000 --seed demo --workers 4 --out report.json
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
- `--workers <number>` — split `--rounds` across this many worker threads (default `1`; must be an integer between
  1 and `MAX_SIMULATION_WORKERS`, currently 32). See
  [Parallel simulation](simulation.md#parallel-simulation-workers) for the full mechanism, reproducibility
  guarantees, and memory/CPU tradeoffs — the short version: `--workers 1` is the original, unchanged sequential
  path; `--workers N > 1` runs N real OS threads, each independently loading `<packageRoot>` and playing its own
  share of the rounds, merged back into one report. **`--workers > 1` requires `<packageRoot>` to be a real,
  on-disk game package** — each worker thread calls `loadPokieGame` on it independently, so this doesn't work
  against an in-memory/mocked game (not a concern for normal CLI use, only for embedding `pokie sim`'s underlying
  API in your own tooling).
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
    workers?: number;            // how many worker threads the run was split across (1 by default)
    reproducibility?: {
        game: {id: string; name: string; version: string};
        seed: string | null;
        requestedRounds: number;
        actualRounds: number;
        command: string;         // e.g. `pokie sim <packageRoot> --rounds 10000 --seed demo`, ready to re-run
                                  // (includes `--workers N` when N > 1)
        workerSeedStrategy?: string; // human-readable description of how per-worker seeds were derived
    };
    warnings?: string[];         // e.g. no seed given, low rounds, 0 hit frequency/maxWin/totalBet, early stop
    recommendations?: string[];  // simple next-step hints, e.g. use --seed, raise --rounds, run pokie diff/--out
    breakdown?: {
        components: Record<string, {         // keyed by category, e.g. "base", "freeGames"
            rounds: number;
            totalBet: number;
            totalWin: number;
            rtp: number;           // this category's OWN payback ratio: totalWin / totalBet (within the category)
            contribution: number;  // this category's share of the report's overall rtp: totalWin / report.totalBet
            hitFrequency: number;
            maxWin: number;
        }>;
    };
}
```

`reproducibility`, `warnings`, and `recommendations` were added in v1.3 as purely additive, **optional** fields —
a `sim.json` produced by an older `pokie` (or handwritten JSON without them) still validates and renders fine with
[`pokie report`](#pokie-report-simulationreportjson), it just won't have these sections. `pokie sim` itself always
populates all three on every report it produces.

`breakdown` is a later v1.3 addition, also purely additive and optional: a feature-level RTP breakdown split by
category. `components` is a plain `Record<string, ...>` — there's no fixed category list, and its key order is
stable (`"base"` first when present, then alphabetically) regardless of which round was categorized first during
simulation. Each round is categorized by a 3-step fallback chain, in this order:

1. **Explicit** — the session implements the optional `SimulationCategoryDetermining` contract
   (`getSimulationCategory(): string`) and returns a valid category (`"bonus"`, `"respins"`, `"holdAndWin"`,
   `"jackpot"`, anything — see [category name rules](simulation.md#category-name-rules-simulationcategorynamenormalizer))
   for this particular round.
2. **Stake-based** — otherwise, the session implements `StakeAmountDetermining` — the same contract
   `SpinCommandHandler` already uses server-side to tell a charged base-game round from an unfinished free-games
   round that charges nothing (see [Free Games](free-games.md) and
   [Spin orchestration & idempotency](#spin-orchestration--idempotency)). The round is `"freeGames"` when, right
   before it's played, `session.getStakeAmount() === 0`; `"base"` otherwise.
3. **No breakdown** — otherwise, the round simply isn't attributed to any category (it still plays and counts
   toward `totalBet`/`totalWin`/etc. as normal). If *every* round in the run falls through to this step, `pokie
   sim` omits `breakdown` from the report entirely — it never guesses a category from incidental data like
   balance, and it doesn't nag about the absence either: most games don't have a free-games (or other special)
   feature, and that's not a problem worth flagging on every single report forever.

See [Simulation → Feature-level breakdown](simulation.md#feature-level-breakdown-simulationroundcategorydetermining)
for the full mechanism, including how to plug in an entirely custom `SimulationRoundCategoryDetermining` as
`AggregateSimulationRunner`'s 4th constructor argument. An invalid/empty category — from either the built-in
explicit determiner or a custom one — is always safely treated as step 3 above, never used as-is; it can't crash a
run or end up as a stray key in the JSON report.

Each category's `rtp` and `contribution` answer different questions, and it's easy to misread one for the other:
`rtp` is that category's own payback ratio *in isolation* (`totalWin / totalBet` using only that category's own
rounds) — a `"freeGames"` category routinely shows `rtp > 1` (100%+) since free spins pay out but cost nothing, and
that's expected, not a bug. `contribution` is that category's *share of the report's overall RTP* (`totalWin /`
the report's overall `totalBet`) — contributions across every category always sum to exactly `report.rtp`, so it's
the number to reach for when asking "how many RTP percentage points does this feature account for?".

`pokie sim` only warns about a `breakdown` that looks off, and only when the sample size makes that a safe call —
false positives are worse than missing a real signal here:

- If no non-`"base"` category ever appeared at all, that's only flagged once `rounds >= 10000` (the same threshold
  used for the "requested rounds is low" warning) — below that, a feature simply not having triggered yet is normal
  variance, not a signal.
- If a non-`"base"` category did appear but never won, that's only flagged once it has at least
  `SimulationReportBuilder.MIN_FEATURE_ROUNDS_FOR_ZERO_WIN_WARNING` (20) rounds of its own — an all-zero streak
  shorter than that is common even for an intentional, working feature.

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
matching **Warnings**/**Recommendations** sections list them. When the report has a `breakdown` block, a
**Breakdown** section lists rounds/total bet/total win/RTP/contribution/hit frequency/max win per category (e.g.
`base`, `freeGames`) as a table. All sections are omitted when the report doesn't have the corresponding field
(e.g. an older `sim.json` from before v1.3, or a game whose session doesn't support round categorization) or the
array is empty — a report can always be rendered, whether it has these fields or not.

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
hit frequency, max win, duration, and spins per second. Also compares the feature-level `breakdown` (see
[`pokie sim`](#pokie-sim-packageroot)) when both reports have one.

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
    breakdown?: {
        components: Record<string, {   // keyed by category, e.g. "base", "freeGames"
            left: {rounds, totalBet, totalWin, rtp, contribution, hitFrequency, maxWin} | null;
            right: {rounds, totalBet, totalWin, rtp, contribution, hitFrequency, maxWin} | null;
            rounds: {left: number; right: number; delta: number; percentDelta: number | null};
            totalBet: {left: number; right: number; delta: number; percentDelta: number | null};
            totalWin: {left: number; right: number; delta: number; percentDelta: number | null};
            rtp: {left: number; right: number; delta: number; percentDelta: number | null};
            contribution: {left: number; right: number; delta: number; percentDelta: number | null};
            hitFrequency: {left: number; right: number; delta: number; percentDelta: number | null};
            maxWin: {left: number; right: number; delta: number; percentDelta: number | null};
        }>;
    };
}
```

Every numeric field is a `{left, right, delta, percentDelta}` tuple — `percentDelta` is `null` when `left` is
`0` (a relative percent change is undefined there), not `Infinity`/`NaN`.

`breakdown` is only populated when **both** reports have one — an older report (or one from a game whose session
doesn't support round categorization) is never diffed against a newer one's breakdown, it's simply left out, same
as [`pokie report`](#pokie-report-simulationreportjson) simply omits the **Breakdown** section for such a report.
Categories are the union of both sides' `components` keys, in the same stable order `pokie sim`/`report` use
(`"base"` first, then alphabetically) — so an added or removed category slots into the same position it would if
it had always been there, rather than showing up at the end.

A category present on only one side is compared against zero for the missing side (`left`/`right` is `null`,
numeric fields read as `0`), and `Warnings:`/`warnings` labels it explicitly instead of reporting a generic RTP
change:

- **Added** (only on the right): `"<category>" is a new category in the right report (rtp X%, contributing Y pp)`.
- **Removed** (only on the left): `"<category>" is no longer present in the right report (was rtp X%, contributing Y pp)`.
- **Present on both sides**: the existing `"<category>" RTP changed by ...` message, still gated by the RTP delta
  threshold like the top-level `RTP changed by ...` warning.

The added/removed messages always fire (a category structurally appearing or disappearing is worth knowing about
regardless of magnitude) — unlike the "RTP changed" message, which only fires past the threshold. A `"freeGames"`
category dropping from 200 rounds to 0 reads as `"freeGames" is no longer present in the right report (...)`, not
as a misleading `"freeGames" RTP changed by -100 percentage points`.

**Both reports missing a breakdown is silent** — that's the common case (two old reports, or two reports from a
game with no free-games feature) and isn't worth a note every time. **Exactly one side having a breakdown** is
different: `breakdown` still comes out `undefined` (there's nothing to diff against), but `warnings` gets an
explicit entry — `Feature-level breakdown comparison skipped — the left/right report has no breakdown data.` — so
it's clear the comparison was skipped for a reason, not silently dropped, typically because one report predates the
game adding a free-games feature (or the session categorization contract) and the other postdates it.

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

## `pokie inspect <packageRoot>`

Prints a package's provenance — reading `package.json` and, when present, `src/generated/build-info.json` — without
loading or running the game at all. Where `pokie validate` answers "does this package satisfy the `PokieGame`
contract", `pokie inspect` answers "what is this package and where did it come from": handy right after `pokie
build` (or on a package you didn't build yourself) to check what blueprint and `pokie` version produced it.

```
pokie inspect ./crazy-fruits
```

```
Inspecting package at "./crazy-fruits"

  game             Crazy Fruits (id: "crazy-fruits", v0.1.0)
  package root     ./crazy-fruits
  blueprint hash   sha256:...
  source           examples/blueprints/crazy-fruits.blueprint.json
  generated at     2026-01-02T03:04:05.000Z
  pokie version    1.3.0
  generated files  README.md, package.json, src/generated/build-info.json, src/generated/index.js
```

If `src/generated/build-info.json` is missing (or present but not recognizably written by `pokie build` — see
[Rebuilding an existing `--out` directory](#rebuilding-an-existing---out-directory) for what that check looks
for), `pokie inspect` doesn't treat that as an error: it prints what `package.json` has (`name`/`version`) and a
clear "this package does not look like it was generated by `pokie build`" message instead — true for a `pokie
create`/`pokie init` scaffold, or any hand-written package.

`pokie inspect` never writes or modifies anything. Exit code is `0` for a normal inspection either way (generated
or not) — it's only `1` when `<packageRoot>` itself doesn't exist/isn't a directory, or its `package.json` is
missing or fails to parse; the error is printed to stderr in that case. Only usage mistakes (missing
`<packageRoot>`, an unexpected extra argument) throw the usual `Usage: pokie inspect ...` error.

## `pokie serve <packageRoot>` (experimental)

**Experimental.** Starts a local HTTP server over a single loaded [game package](game-packages.md), so you can
create sessions and spin them over plain JSON HTTP while developing a game. This is a **local/dev reference
server, not a casino backend or RGS** — no real-money wallet, no authentication, and no operator/integration
logic of any kind. Game state (bet/win/screen) goes through a replaceable `SessionRepository`, and credits go
through a separate `WalletPort` — see [Session storage & wallet](#session-storage--wallet) below. The CLI itself
always runs with the defaults (`InMemorySessionRepository`, `InMemoryWallet`), so a `pokie serve` restart still
loses every session; embed `PokieDevServer` directly (see below) to plug in a `FileSessionRepository` or your own
`WalletPort`.

Every response — success and error alike — carries permissive CORS headers (`Access-Control-Allow-Origin: *`,
`Access-Control-Allow-Methods: GET, POST, OPTIONS`, `Access-Control-Allow-Headers: Content-Type`), and `OPTIONS`
requests get a bare `204`. This is what lets [`pokie client`](#pokie-client-packageroot-experimental) (a
different origin/port by design) talk to this server's API at all.

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

Creates a new in-memory session via `game.createSession(context)` and returns its initial state. The exact shape
depends on whether the loaded game implements the optional `PokieGame.getSessionSerializer()` (see
[Game Packages](game-packages.md#the-contract) and [Network Serialization](serialization.md)):

- **No `getSessionSerializer()`** (the original, unchanged behavior for any existing game package):
  ```ts
  {
      sessionId: string;
      game: {id: string; name: string; version: string};
      bet: number;
      credits: number;
      screen?: unknown[][]; // getSymbolsCombination().toMatrix() when the session exposes it, else omitted
  }
  ```
- **`getSessionSerializer()` implemented**: `{sessionId, game, credits, ...serializer.getInitialData(session)}` —
  `credits` is always the authoritative wallet balance, overriding whatever the serializer itself computed. For a
  game returning `new VideoSlotSessionSerializer()` (what `pokie create`/`pokie init` scaffold by default), that
  means `bet`, `availableBets`, `reelsSymbols`, `availableSymbols`, `paytable`, `linesDefinitions`, and more — see
  [Network Serialization](serialization.md) for the full shape, including the `MultiStageRoundSessionSerializer`/
  `CascadeSessionSerializer` payload for multi-stage/cascade mechanics. This is `getInitialData()`'s output only —
  any field a serializer produces *exclusively* from `getRoundData()` (see below) is absent here, since no round
  has been played yet.

An optional JSON body `{"seed": string | number}` is forwarded as `context.seed` — same best-effort caveat as
[`pokie sim --seed`](#pokie-sim-packageroot): only game packages that actually thread `context.seed` into their own
RNG setup honor it.

### `POST /sessions/:sessionId/spin`

Delegates to `SpinCommandHandler` (see [Spin orchestration & idempotency](#spin-orchestration--idempotency)
below), which applies the session's current wallet balance, checks `session.canPlayNextGame()`, and only then
calls `session.play()` on the (possibly just-reconstructed, see
[Session storage & wallet](#session-storage--wallet)) session, returning its new state:

- **No `getSessionSerializer()`**:
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
- **`getSessionSerializer()` implemented**: `{sessionId, game, credits, ...serializer.getRoundData(session)}` —
  the serializer's *round* output for the spin that just happened, not `getInitialData()`. Any field only present
  in `getInitialData()`'s output (e.g. `availableSymbols`, `paytable` — descriptive data that doesn't change
  between rounds) is **not** repeated here; a client that needs both keeps what `POST /sessions` gave it and
  merges in each spin's response, or re-fetches everything at once via `GET /sessions/:sessionId` below.

An optional JSON body `{"requestId"?: string, "expectedSessionVersion"?: number}`:

- `requestId` makes the call idempotent: a repeated request with the same `sessionId`/`requestId` pair returns
  the exact same response instead of spinning (and charging the wallet) again — see
  [Spin orchestration & idempotency](#spin-orchestration--idempotency). Omit it (or send no body) to always spin
  for real, the original behavior.
- `expectedSessionVersion`, when the configured `SessionRepository` supports
  [optimistic locking](#optimistic-locking-session-versioning), lets a caller declare "I expect the session to
  still be at version N" — a mismatch is rejected as a `409` immediately, before `canPlayNextGame()`/`play()`/any
  wallet transaction, so there's nothing to compensate. This is a caller-declared precondition, distinct from (and
  checked before) the repository's own storage-level conflict detection described below; omit it to skip this
  check entirely. Ignored (never causes a conflict) when the configured repository isn't versioned.

`404 {"error": "..."}` for an unknown `sessionId`. `400 {"error": "..."}` if `canPlayNextGame()` returns `false`
(e.g. insufficient credits for the current bet) — `play()` is never called in that case, and the session's
game state, `SessionRepository` entry, and `WalletPort` balance are all left exactly as they were. A game whose
`canPlayNextGame()` ignores balance while an in-progress feature (e.g. a free-games round) is active still spins
normally even at a 0 balance — the gate only ever reflects what `canPlayNextGame()` itself returns. `400
{"error": "..."}` too if a `requestId` is sent but isn't a string, or if `expectedSessionVersion` is sent but
isn't a positive integer. `409 {"error": "..."}` if `expectedSessionVersion` was given and no longer matches (see
above), or if the configured `SessionRepository` supports
[optimistic locking](#optimistic-locking-session-versioning) and this session's version moved between load and
save — the wallet is left exactly as it was before this attempt (every transaction it applied is reversed), same
as the `canPlayNextGame()` case above.

### `GET /sessions/:sessionId`

Returns the current state of an in-memory session without playing a round — for a game with no
`getSessionSerializer()`, the same `PokieDevSessionResponse` shape as `POST /sessions` and
`POST /sessions/:sessionId/spin`, always including `win` (like the spin response, since the session already
tracks it via `getWinAmount()`):

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

For a game implementing `getSessionSerializer()`, this returns `{sessionId, game, credits, ...initialPayload,
...roundPayload}` — the session's `getInitialData()` output from creation (see `POST /sessions` above) **merged
with** its `getRoundData()` output from the last spin (see `POST /sessions/:sessionId/spin` above), round data
winning on any overlapping key. This is the one endpoint that returns everything a client needs to fully rebuild
its UI in a single call — neither `POST /sessions` nor `POST .../spin` alone does, by design (see
[Session storage & wallet](#session-storage--wallet) below). Before any spin has happened, `roundPayload` isn't
set yet, so the response is just `{sessionId, game, credits, ...initialPayload}`.

This reads back exactly what was captured at session creation and after the last spin — **not** a freshly
re-serialized session. A freshly reconstructed session only restores a game's own bespoke `featureState` (e.g.
free-games counters via `ConvertableToSessionState`/`BuildableFromSessionState`), never round-outcome data like
the last screen/win/cascade result, so re-running the serializer on a reconstructed session would silently
produce a wrong payload; reading back what was actually captured avoids that entirely.

#### Client reload flow

A frontend that wants to survive a page reload without losing its session can use `GET /sessions/:sessionId` as a
lightweight restore step:

1. On first load, `POST /sessions` and keep the returned `sessionId` (e.g. in `localStorage`).
2. On every reload, call `GET /sessions/:sessionId` with the stored id.
3. If it responds `200`, use the returned state (bet/credits/screen/win) to resume where the client left off.
4. If it responds `404` — the session's state is gone (process restarted with the in-memory default, or the
   sessionId was never valid) — discard the stored id and fall back to step 1 (`POST /sessions` again).

### Public vs. internal/debug responses

**POKIE is not an RGS.** There is no compliance-grade audit trail, no operator/regulator reporting, and no wallet
custody guarantee anywhere in this framework — see the top of this section. What `pokie serve` *does* provide,
starting in v1.3, is an explicit split between what a response sends by default (public, client-safe data) and what
it can optionally include for local development/debugging (internal data — never sent unless a request asks for
it).

Every `GET`/`POST` response above (`POST /sessions`, `POST /sessions/:sessionId/spin`, `GET /sessions/:sessionId`) is
public-only by default — exactly the shapes documented above, unchanged. Adding `?debug=1` (or `?debug=true`) to any
of the three adds one extra field, `internal`, never present otherwise. The match is exact and strict: `?debug=0`,
`?debug=false`, `?debug=` (empty), any other value, an unrelated query parameter (e.g. `?seed=demo`), or no query
string at all all leave the response public-only — there is no fuzzy/truthy parsing, only the two literal strings
`"1"`/`"true"` turn it on, and all three endpoints check it the exact same way.

```ts
{
    // ...the same public response documented above...
    internal?: {
        stateAfter: PokieSessionState;    // the session's raw, persisted state (see below)
        stateBefore?: PokieSessionState;  // only present on a spin response — the state right before it
        debugData?: Record<string, unknown>; // see below — only present if the serializer provides it
        requestId?: string;               // only present on a spin response made with a requestId
        sessionVersion?: number;          // see "Optimistic locking" below — only present when the
                                           // configured SessionRepository supports it
    };
}
```

`stateAfter`/`stateBefore` are the actual `PokieSessionState` objects `SessionRepository` persists (see
[Session storage & wallet](#session-storage--wallet) below) — `context`, `bet`, `win`, `screen`, `featureState`,
`initialPayload`/`roundPayload`, unfiltered. This is meaningfully more than the public response ever exposes: e.g.
`context` (the seed a session was created with) is never part of a public response at all.

`debugData` is populated only when the loaded game's serializer (`PokieGame.getSessionSerializer()`) implements the
optional debug hooks on `GameSessionSerializing`:

```ts
export interface GameSessionSerializing {
    getInitialData(session): GameInitialNetworkData;
    getRoundData(session): GameRoundNetworkData;
    // Optional — implement to expose internal/debug-only data (RNG info, reel stops, evaluator
    // traces, anything else worth inspecting locally) without ever putting it in the public response.
    getInitialDebugData?(session): Record<string, unknown>;
    getRoundDebugData?(session): Record<string, unknown>;
}
```

A serializer that implements neither hook (every built-in serializer — `GameSessionSerializer`,
`VideoSlotSessionSerializer`, `VideoSlotWithFreeGamesSessionSerializer`, `CascadeSessionSerializer` — is unchanged
by this feature and implements neither) simply has no `debugData` — `internal.stateAfter`/`stateBefore` are still
present under `?debug=1`, but there's nothing else to add. A game package with no serializer at all (the legacy
fallback) behaves the same way. Implementing the hooks is entirely additive and optional, same pattern as
`ConvertableToSessionState`/`BuildableFromSessionState`/`StakeAmountDetermining` elsewhere in this server — see
[Network Serialization](serialization.md#internaldebug-data-getinitialdebugdatagetrounddebugdata) for the full
contract and an example.

`GET /sessions/:sessionId` merges `initialDebugPayload`/`roundDebugPayload` the same way it merges the public
`initialPayload`/`roundPayload` — round data wins on any overlapping key.

No option exists to make `internal` the *default* — every endpoint is public-only unless a specific request opts
in. `pokie client`/`pokie dev` never pass `?debug=1` themselves (see `cli/client/apiClient.ts` — every request URL
it builds is a plain `/sessions`/`/sessions/:id`/`/sessions/:id/spin`, no query string), so the browser preview
always talks to the public API exactly as before this feature existed; passing `?debug=1` by hand (e.g. via `curl`
or a browser devtools request) is how a game author inspects the internal data while developing.

This also applies to an idempotent replay (see [Idempotency and concurrency](#idempotency-and-concurrency) below):
`internal` is decided fresh, per request, from that request's own `?debug=` value — not from whatever the original
spin that produced the cached result was called with. Replaying the same `sessionId`/`requestId` with `?debug=1`
returns the same already-committed outcome (state, win, credits — nothing spins again) *plus* `internal` describing
that original spin; replaying it without `?debug=1` returns the exact same public body whether or not the original
call happened to include `?debug=1`.

### Session storage & wallet

`PokieDevServer` never keeps game state only in a live session object — every `POST /sessions` and
`POST .../spin` writes a serializable `PokieSessionState` (`{context?, bet, win, screen?, featureState?,
initialPayload?, roundPayload?}`, no credits) through a `SessionRepository`:

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

Both also implement an additive optimistic-locking API, `VersionedSessionRepository` — see
[Optimistic locking (session versioning)](#optimistic-locking-session-versioning) below.

`featureState` is where a game's own internal state beyond bet/win/screen lives — e.g. an in-progress free-games
round. It's populated through an optional, feature-detected pair of interfaces a `GameSessionHandling`
implementation can implement:

```ts
export interface ConvertableToSessionState<T = unknown> {
    toSessionState(): T;
}

export interface BuildableFromSessionState<T = unknown> {
    fromSessionState(value: T): this;
}
```

`VideoSlotWithFreeGamesSession` implements both (its free-games num/sum/bank). A game that implements neither gets
a **snapshot-only fallback**: `PokieDevServer` still restores bet/win/screen after a restart, it just can't put a
reconstructed session back into whatever mid-feature state it was in — the same caveat plain `VideoSlotSession`
and any other game without this contract already had. Implementing it is entirely optional and additive; existing
games and the standalone `VideoSlotSession` behave exactly as before whether or not they implement it.

`initialPayload`/`roundPayload` are the `getSessionSerializer()` counterparts — present only for a game
implementing it. `initialPayload` holds `getInitialData(session)`'s output, captured exactly once, at session
creation; it's never recomputed on a spin, since a session's own descriptive data (paytable, availableSymbols,
...) doesn't change between rounds. `roundPayload` holds `getRoundData(session)`'s output, captured fresh after
every spin and replaced each time — it's the actual outcome of the most recent round, not accumulated across
spins. `GET /sessions/:sessionId` reads both straight back out of storage and merges them (see that endpoint's
own note above) rather than re-serializing a reconstructed session, which would silently produce a wrong payload
(see the note there for why).

Credits are handled separately through a `WalletPort`, and are **deliberately not part of `PokieSessionState`** —
a restart always resets balances even when a `FileSessionRepository` keeps the game state:

```ts
export interface WalletPort {
    getBalance(sessionId: string): Promise<number>;
    setBalance(sessionId: string, balance: number): Promise<void>;
}
```

This is the original contract, unchanged — a plain read/full-overwrite pair. Anything implementing it, including
your own pre-existing custom `WalletPort`, keeps working unchanged; see
[Spin orchestration & idempotency](#spin-orchestration--idempotency) below for the additive transactional API
`SpinCommandHandler` actually settles a spin through, and how a plain `WalletPort` gets one automatically. A
custom `WalletPort` implementation can verify its own `getBalance`/`setBalance` behavior against `InMemoryWallet`'s
using the exported `walletPortContractTests` Jest suite:

```ts
import {walletPortContractTests} from "pokie";

walletPortContractTests("MyWalletPort", () => new MyWalletPort());
```

`InMemoryWallet` is the default (and only built-in) implementation, and `PokieDevServer` treats it differently
depending on whether you configured one:

- **No `wallet` option passed** — `PokieDevServer` uses its own default `InMemoryWallet`, and seeds each new
  session's balance from that session's own `getCreditsAmount()` at creation time. This preserves `pokie serve`'s
  original out-of-box behavior: the balance you see is whatever the loaded game package's own config already
  defaults to.
- **`wallet` passed explicitly** — that `WalletPort` (an `InMemoryWallet(initialBalance)` or your own
  implementation) becomes the sole source of a new session's starting balance instead: `PokieDevServer` reads it
  via `getBalance()` for the not-yet-seen `sessionId` and applies it onto the freshly created session, rather than
  the other way around. A session's own default credits never get written back into an explicitly configured
  wallet.

Either way, a session's balance only changes from its starting value after an actual spin (`setBalance()` is
always called after `play()`).

Both are constructor options on `PokieDevServer`, additive to the existing `{host, port}` options (as is
`idempotencyRepository`, see below):

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

A live `GameSessionHandling` object is still needed to actually run `play()` — this is kept in a process-local
cache owned by `SpinCommandHandler` (see below), separate from `SessionRepository`. `PokieDevServer` primes it
with the freshly constructed session on every `POST /sessions`. On a cache miss (e.g. right after a restart), it
reconstructs one via `game.createSession(state.context)` plus `state.bet`, then restores `state.featureState`
onto it via `fromSessionState()` if the game implements `BuildableFromSessionState`, before spinning. Anything not
covered by bet/win/screen/featureState — RNG stream position, for instance — still starts fresh in that case,
same caveat as `--seed` reproducibility elsewhere in this CLI.

### Optimistic locking (session versioning)

`SessionRepository` itself stays the plain, unversioned two-method contract documented above — nothing
about it changed. Both built-in implementations, `InMemorySessionRepository` and
`FileSessionRepository`, additionally implement a second, additive interface:

```ts
export interface VersionedSessionRepository extends SessionRepository {
    loadVersioned(sessionId: string): Promise<{state: PokieSessionState; version: number} | undefined>;
    saveVersioned(sessionId: string, state: PokieSessionState, expectedVersion: number): Promise<number>;
}
```

Every `save()` (through either method) bumps a per-`sessionId` version counter, starting at 1 on the
first save. `saveVersioned()` only writes when `expectedVersion` still matches the repository's current
version, returning the new version on success; otherwise it rejects with a `SessionVersionConflictError`
and leaves whatever's currently stored **completely untouched** — no partial write, no silent
overwrite.

A client can observe the current version through `internal.sessionVersion` on `POST /sessions`,
`POST /sessions/:sessionId/spin`, and `GET /sessions/:sessionId` — present only under `?debug=1`/
`?debug=true` and only when the configured repository is versioned, same opt-in as every other
`internal` field (see [Public vs. internal/debug responses](#public-vs-internaldebug-responses)
above).

`SpinCommandHandler` feature-detects this via `isVersionedSessionRepository()`: when the configured
repository supports it, the state it loads at the start of an attempt is saved back through
`saveVersioned()` with the version it was read at, instead of the plain unconditional `save()`. A
version mismatch becomes a new `SpinCommandResult` outcome, `{status: "conflict", sessionId, reason}`
— by the time it's returned, every wallet transaction this attempt applied has already been reversed
and the live session evicted, the same compensation any other mid-flight failure gets (see
[Failure handling is best-effort compensation, not a transaction](#failure-handling-is-best-effort-compensation-not-a-transaction)
below). `PokieDevServer` maps this to `409 {"error": "..."}` on `POST /sessions/:sessionId/spin`. A
conflicted attempt is never cached under its `requestId` either — a client retry with the same
`requestId` runs for real against whatever is current, rather than replaying the failed attempt.

The version compared above is always the one `SpinCommandHandler` itself just loaded — never a
client-declared expectation. A caller that wants to assert "I expect the session to still be at version
N" and get a `409` on demand when that's stale (rather than only when a genuinely concurrent writer
raced it) passes `expectedSessionVersion` on the spin request body itself — see
[`POST /sessions/:sessionId/spin`](#post-sessionssessionidspin) above — checked by
`SpinCommandHandler.handle()`'s optional third parameter before anything else runs, so a mismatch here
never even reaches `canPlayNextGame()`/`play()`/the wallet.

This mainly matters for a repository **shared across multiple `PokieDevServer` instances or
processes** — e.g. two servers pointed at the same `FileSessionRepository` directory. Within a single
instance, every command for a given `sessionId` is already serialized through `SpinCommandHandler`'s
own per-session queue (see [Idempotency and concurrency](#idempotency-and-concurrency) below), so its
own load-then-save can never race against itself; a conflict there would mean something outside
`SpinCommandHandler` wrote to the repository in between, which the built-in commands never do.

`FileSessionRepository` itself also serializes every `save()`/`saveVersioned()` for one `sessionId`
through its own internal, in-process queue (independent of `SpinCommandHandler`'s), so two calls made
directly against the *same* `FileSessionRepository` object — bypassing `SpinCommandHandler` entirely —
can't interleave their read-then-write either; `fs.readFile`/`fs.writeFile` are async and yield to the
event loop, so without that queue two such calls could both read the same version and both write,
silently corrupting one write with the other. That queue is purely in-memory, though, so it only
protects calls made through *that one instance*. It does nothing for two *separate*
`FileSessionRepository` instances/processes sharing the same directory: `saveVersioned()` re-reads the
file immediately before writing, which narrows that cross-process race, but doesn't close it — there's
no OS-level file lock, so two processes reading the same expected version at nearly the same instant
can still both pass the check before either writes, and the loser's write is silently lost. A
deployment needing a hard guarantee across processes must provide real file locking or a transactional
store itself, the same tradeoff as the wallet/idempotency durability discussion below.

A plain, pre-existing custom `SessionRepository` (only `save()`/`load()`) keeps working exactly as
before — no conflict detection, no `sessionVersion`, no `409`s — since it never implemented
`VersionedSessionRepository` to begin with; implementing that interface is entirely additive and
opt-in, same pattern as `TransactionalWalletPort`/`isTransactionalWalletPort()` for the wallet.

### Spin orchestration & idempotency

`POST /sessions/:sessionId/spin` is implemented by `SpinCommandHandler`, a reusable, transport-agnostic class
(`SpinCommandResult` has no HTTP status codes) that owns the whole spin: replay an idempotent retry, load/
reconstruct the session, gate on `canPlayNextGame()`, run `play()`, settle the wallet, and persist the new state:

```ts
export interface SpinCommandHandling {
    primeSession(sessionId: string, session: GameSessionHandling): void;
    handle(sessionId: string, requestId?: string): Promise<SpinCommandResult>;
}
```

#### Transactional wallet settlement

`SpinCommandHandler` never calls `WalletPort.setBalance()` directly to settle a spin. It settles through a
separate, additive interface:

```ts
export interface TransactionalWalletPort extends WalletPort {
    debit(sessionId: string, transactionId: string, amount: number): Promise<number>;
    credit(sessionId: string, transactionId: string, amount: number): Promise<number>;
    reverse(sessionId: string, transactionId: string): Promise<number>;
}
```

`debit`/`credit` take a caller-chosen `transactionId` and should be idempotent per `(sessionId, transactionId)` —
repeating one that's still in effect must not mutate the balance again. `reverse` compensates the *specific*
transaction recorded under `transactionId` (crediting back a debit, debiting back a credit) instead of asking the
caller to separately track and pass an amount to undo, and must itself be idempotent (reversing twice is a
no-op) — and once reversed, that same `transactionId` stops counting as "already applied": a later call reusing
it (e.g. a retried command after its first attempt was compensated) is applied for real again rather than
silently treated as a no-op replay of the transaction that no longer has any effect. `InMemoryWallet` implements
this natively. A caller-supplied plain `WalletPort` (including your own pre-existing custom implementation,
predating this interface entirely) is transparently wrapped by `PokieDevServer` in a `TransactionalWalletAdapter`,
which keeps its own in-memory transaction ledger on top of `getBalance`/`setBalance` to provide the same
behavior — nothing about an existing custom `WalletPort` needs to change. `isTransactionalWalletPort()` is the
feature-detection `PokieDevServer` uses to skip wrapping a wallet that's already transactional. A custom
`TransactionalWalletPort` (or a plain `WalletPort` you want to check through the adapter) can be verified with:

```ts
import {transactionalWalletPortContractTests, TransactionalWalletAdapter} from "pokie";

transactionalWalletPortContractTests("MyWalletPort (adapted)", () => new TransactionalWalletAdapter(new MyWalletPort()));
```

For each spin, the stake is debited **before** `play()` and the win is credited **after**, as two separate
transactions. Each gets its own id, `{roundId}:{attemptId}:debit` / `:credit` — `roundId` is the spin's
`requestId` (or a generated id when none was given), tying a transaction back to the logical command for
traceability; `attemptId` is freshly generated every time `SpinCommandHandler` actually executes a spin, so a
retried command that follows a reversed prior attempt always gets brand-new transaction ids rather than reusing
the reversed ones — the logical request id and the per-attempt transaction ids are deliberately different things:

- **Stake**: `session.getBet()`, unless the session implements the optional `StakeAmountDetermining` contract
  below, in which case `getStakeAmount()` decides instead. The wallet balance itself is never used to infer "this
  must be a free spin" — a session's `canPlayNextGame()` can legitimately return `true` at any balance for reasons
  that have nothing to do with a free round, so balance alone isn't a safe signal either way.
- **Win**: whatever reconciles the wallet to the session's own final credits after `play()` — i.e.
  `balanceBeforePlay - stakeDebited + winCredited` always equals `session.getCreditsAmount()` post-`play()`. This
  is what keeps the numbers correct even when a session's own accounting doesn't match a naive bet/win split
  (e.g. a free-games round that banks several spins' wins and only pays them out once the round finishes):
  whatever the session's own credits moved by, beyond the stake actually charged, is exactly what gets credited.

```ts
export interface StakeAmountDetermining {
    getStakeAmount(): number;
}
```

Optional and feature-detected, same pattern as `ConvertableToSessionState`/`BuildableFromSessionState`. A session
implementing it is asked what its *next* `play()` will actually charge — `VideoSlotWithFreeGamesSession`
implements it, returning `0` while an unfinished free-games round is in progress (the same condition its own
`canPlayNextGame()` uses to let a spin through regardless of balance) and `getBet()` otherwise, so a free spin
debits zero **at any wallet balance**, not just a low one. A session that doesn't implement this interface is
simply assumed to always charge its full `getBet()`.

#### Failure handling is best-effort compensation, not a transaction

If anything fails after entering the mutating phase — a wallet call, persisting the new session state, or
persisting the idempotency result — `SpinCommandHandler` *attempts* to undo whatever it already did for that
attempt: every wallet transaction already applied is individually reversed by its own `transactionId`, any
already-persisted session state is restored to what it was before the attempt, and the live session is evicted
from the handler's cache. When every one of those compensating steps succeeds, a retry finds either the complete
result of a prior successful attempt or a clean pre-attempt state to spin fresh against.

That's **best-effort, process-local compensation** — not a cross-store database transaction, and not a strict
guarantee. Two concrete ways it can fall short:

- **Process crash.** If the process dies (or is killed) between two of the awaited calls this handler makes — e.g.
  right after debiting/crediting the wallet but before persisting the new session state, or right after
  persisting the session state but before persisting the idempotency result — no catch block ever runs, so
  nothing gets compensated. The wallet, `SessionRepository`, and `idempotencyRepository` can be left durably
  diverged (e.g. a debited wallet whose session state was never updated) until something else reconciles them.
  The built-in `InMemoryWallet` and `InMemoryIdempotencyRepository` lose everything on a crash anyway, so nothing
  survives on their side to diverge — but `FileSessionRepository` writes to disk and *does* survive a crash, so
  its persisted session state can easily end up ahead of (diverged from) an in-memory wallet/idempotency store
  that reset to nothing on restart. A real durable/persistent `WalletPort` or `IdempotencyRepository` doesn't get
  this protection for free just by being used with `SpinCommandHandler`, and pairing `FileSessionRepository` with
  the in-memory wallet/idempotency defaults is exactly this scenario, not a hypothetical one.
- **Compensation failure.** The reversal/restore calls themselves can fail (e.g. the same outage that made the
  original call fail is still ongoing). That failure is swallowed, so it doesn't replace or hide the original
  error `handle()` rejects with — but it also means the compensation silently didn't happen: the wallet and/or
  `SessionRepository` can be left reflecting a partially-applied attempt.

A production deployment that needs real durable atomicity across the wallet, `SessionRepository`, and
`idempotencyRepository` — one that survives a process crash or a failed compensating write — is responsible for
providing it itself, typically by implementing `WalletPort`/`SessionRepository`/`IdempotencyRepository` (or a
subset of them sharing state) over one transactional store and committing the relevant writes together at that
layer. `SpinCommandHandler`'s own compensation is a correctness improvement over doing nothing on failure; it is
not a substitute for that.

#### Idempotency and concurrency

Idempotency is a separate, additive `IdempotencyRepository`, keyed by `(sessionId, requestId)`:

```ts
export interface IdempotencyRepository<T = unknown> {
    load(sessionId: string, requestId: string): Promise<T | undefined>;
    save(sessionId: string, requestId: string, result: T): Promise<void>;
}
```

`InMemoryIdempotencyRepository` is the default (a `Map` for the lifetime of the process, same tradeoff as
`InMemorySessionRepository`/`InMemoryWallet`), overridable via the `idempotencyRepository` constructor option.
When `POST /sessions/:sessionId/spin`'s body includes a `requestId`, `SpinCommandHandler.handle()` checks this
repository first and, on a hit, returns the stored result without touching the session, wallet, or
`SessionRepository` again. A successful spin (`status: "played"`) is the only outcome ever stored — `blocked`
(`canPlayNextGame()` false) and `not-found` made no state changes to begin with, so there's nothing to protect
against replaying; `conflict` (see [Optimistic locking](#optimistic-locking-session-versioning) above) is the
same way — its wallet transactions were already reversed before it's returned, so caching it would only make a
retry replay a failed attempt instead of trying for real against the now-current version. Omitting `requestId`
skips idempotency entirely, spinning for real every time.

Every command for a given `sessionId` — the same `requestId` retried concurrently, or two genuinely different
spins racing — is serialized through an internal per-session queue, so there's never more than one
`play()`/wallet-settlement/persist in flight for a session at once. That's also what makes a concurrently
repeated `requestId` safe without any separate "in-flight" tracking: the second call is simply queued behind the
first, and by the time its own turn runs, the first's result is already in `idempotencyRepository` for it to
find — it never spins a second time. A concurrent request for a *different* `sessionId` is unaffected and runs
independently.

### Failure modes

- Missing `<packageRoot>`, an unknown option, a non-numeric `--port`, or a missing `--host` value throw a
  `Usage: pokie serve ...` error before the server starts (same as every other command).
- An invalid `packageRoot` throws the same descriptive error `loadPokieGame` would throw directly — see
  [Game Packages](game-packages.md).
- Once the server is running, errors are JSON HTTP responses (`400`/`404`/`409`/`500` with `{"error": "..."}`),
  not thrown/exit codes — `pokie serve` is a long-running process, not a one-shot command. `409` is specific to
  a spin's session version going stale — see [Optimistic locking](#optimistic-locking-session-versioning) above.

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

## `pokie client <packageRoot>` (experimental)

**Experimental.** Serves the universal browser preview UI: create a session, save its `sessionId`, restore it
after a page reload, spin, and see credits/bet/win/screen update — plus playback for any
`MultiStageRoundSessionSerializer`-based `stages` array (e.g. a cascade round) and a generic collapsible raw-JSON
view for whatever it doesn't specifically recognize (see [Network Serialization](serialization.md)).

**`pokie client` never starts an API server itself** — it's a static-file server only, expecting a separately
running `pokie serve` (default `http://127.0.0.1:3000`). Use [`pokie dev`](#pokie-dev-packageroot-experimental)
to run both together with zero configuration.

```
pokie serve ./crazy-fruits            # in one terminal
pokie client ./crazy-fruits            # in another
```

```
POKIE client preview (experimental) listening on http://127.0.0.1:3100
Talking to a pokie serve API expected at http://127.0.0.1:3000 — start it separately (e.g. "pokie serve") or use "pokie dev" to run both together.
```

Options:

- `--port <number>` — port to listen on (default `3100`). Pass `0` to let the OS assign a free port.
- `--host <string>` — host/interface to bind (default `127.0.0.1`).
- `--api-host <string>` / `--api-port <number>` — where to expect the `pokie serve` API (default
  `127.0.0.1:3000`).

`<packageRoot>` is required — for signature symmetry with `pokie serve`/`pokie dev`, and because the scaffolded
`"client": "pokie client ."` script always passes one — but it's **never loaded**: the browser preview is entirely
game-agnostic, so `pokie client` doesn't call `loadPokieGame` at all.

The client's own configured API address is served from the same origin at `GET /config`
(`{"apiBaseUrl": "http://host:port"}`), which is how the served page knows where to `fetch()` without any
build-time configuration — `pokie dev` (below) sets this to the API port it actually bound, so the two always
agree even when both are started with `--port 0`.

The reusable server sits behind `src/server` (`PokieClientServer`, implementing `PokieClientServerHandling`),
the same shape as `PokieDevServer`:

```ts
import {PokieClientServer, PokieClientServerHandling} from "pokie";

const server: PokieClientServerHandling = new PokieClientServer("./dist/cli/client", {
    host: "127.0.0.1",
    port: 3100,
    apiAddress: {host: "127.0.0.1", port: 3000},
});
const address = await server.start();
// ...
await server.stop();
```

## `pokie dev <packageRoot>` (experimental)

**Experimental.** Runs [`pokie serve`](#pokie-serve-packageroot-experimental) and
[`pokie client`](#pokie-client-packageroot-experimental) together — as two HTTP listeners in one process, not
child processes — waits for the API's `GET /health` to actually respond, best-effort opens the default browser
pointed at the client, and cleanly stops both servers on `Ctrl+C` (`SIGINT`/`SIGTERM`).

```
pokie dev ./crazy-fruits
```

```
POKIE dev server (experimental) listening on http://127.0.0.1:3000
POKIE client preview listening on http://127.0.0.1:3100
This is a local/dev reference setup for a single game package — not a casino backend or RGS.
```

Options:

- `--port <number>` / `--host <string>` — the API server's port/host (same defaults as `pokie serve`).
- `--client-port <number>` / `--client-host <string>` — the client server's port/host (same defaults as
  `pokie client`).
- `--no-open` — don't try to open a browser.

Opening the browser is entirely best-effort: it shells out to `open` (macOS), `start` (Windows), or `xdg-open`
(everything else), and a failure there (no display, sandboxed environment, missing binary, ...) is swallowed —
it never fails the command. Registering `SIGINT`/`SIGTERM` handlers to stop both servers means `pokie dev` also
calls `process.exit()` itself once both `.stop()` calls settle (successfully or not) — Node won't exit
automatically once a custom signal handler is registered.

## `pokie` / `pokie studio` (experimental)

**Experimental.** Launches **POKIE Studio**: a local web app (its own HTTP server plus a small browser-based
frontend) that hosts a GUI for the commands above. The Home nav below already covers `create`/`init`/`build`/
opening a project; the Project Dashboard (see its own section) covers `inspect`/`validate`/`sim`/`report`/`replay`.
Like `pokie serve`/`pokie dev`, this is a **local/dev tool, not a casino backend or RGS** — no real-money wallet,
no authentication, and no operator/integration logic of any kind; its Runtime tab is the same local/dev reference
server `pokie serve` is (see its own section above for what that does and doesn't provide).

Several invocations all launch it, resolved by `resolveCliInvocation` (`cli/resolveCliInvocation.ts`):

- `pokie` (no arguments at all) — Studio in **Home** mode.
- `pokie .` — Studio in **Project** mode for the current directory.
- `pokie <path>` — Studio in **Project** mode for `<path>`, as long as `<path>` isn't itself one of the command
  names below and actually exists (a typo'd command name is never silently treated as a path — see below).
- `pokie studio` — Home mode, explicitly.
- `pokie studio .` / `pokie studio <path>` — Project mode, explicitly.

Every other `pokie <command> ...` invocation (`pokie sim ...`, `pokie serve ...`, etc.) is unaffected — a first
argument that matches a known command name always dispatches to that command, never to Studio.

```
pokie
```

```
POKIE Studio listening on http://127.0.0.1:3200
```

A browser tab opens automatically (same best-effort `open`/`start`/`xdg-open` mechanism as `pokie dev`, and the
same `--no-open` escape hatch) showing the **Home** view, with six tabs:

- **Recent Projects** — every project created/opened this session (most-recently-started first), each showing its
  name, path, and last-opened time. A project whose directory/`package.json` can no longer be found is flagged
  **missing** (its Open button disabled) rather than silently dropped from the list — it's still there to explain
  history, and reappears as normal if the directory comes back. In-memory only: resets when Studio is restarted.
- **Create Project** — destination directory, package name, and optional game id/name/version overrides, calling
  the same `GamePackageCreating` service `pokie create` uses (the overrides are new: `GamePackageCreating.create()`
  now accepts an optional third `{id?, name?, version?}` argument on top of what it would otherwise derive from the
  package name — `pokie create` itself is unaffected, still calling the plain 2-argument form). Shows the created
  files and an **Open in Studio** button on success.
- **Initialize Project** — an existing directory, calling the same `GamePackageScaffolding` service `pokie init`
  uses. Shows created/updated/skipped files (a missing `package.json` is reported as a clear error, exactly as
  `pokie init` itself reports it) and an **Open in Studio** button on success.
- **Build from Blueprint** — a blueprint JSON path and optional output directory, with two actions: **Preview**
  (`GameBlueprintValidating` + a pure `buildGameBuildInfo()` call — validation summary, game metadata, blueprint
  hash, and expected generated files, without writing anything, same as `pokie build --dry-run`) and **Build**
  (the same `GamePackageGenerating` service `pokie build` uses, including its safe-rebuild/conflict check — building
  into a directory that already contains files a prior build didn't generate is refused with the same descriptive
  error `pokie build` itself gives). Shows warnings, generated files, and build-info on success, plus an
  **Open in Studio** button.
- **Open Existing Project** — an absolute or relative path, loaded with `loadPokieGame`, the same package loader
  every other command uses; switches to the **Project** view on success. This is also what each of Create/Init/
  Build's own "Open in Studio" buttons calls, against the path they just produced — Create/Init/Build never
  transition Studio into Project mode themselves.
- **Blueprint Editor** — creates or edits a `GameBlueprint` through a GUI instead of hand-written JSON, editing the
  exact same DTO `pokie build <config.json>` accepts (no separate Studio-only blueprint schema, and the
  vertical-slice scope is unchanged: manifest, reels/rows, symbols, paylines, paytable, reel strips/symbol weights,
  available bets). **New Blueprint** starts from a minimal starter object; **Load** reads an existing blueprint JSON
  from a path the user types. A **Form**/**JSON** toggle switches between the field-by-field editor (with
  add/remove/duplicate/reorder controls for every collection: symbols, bets, paylines, paytable rows, reel-strip
  symbols, symbol-weight rows, plus wild/scatter checkboxes and a reel-strips-vs-symbol-weights mode toggle) and a
  raw JSON textarea kept in sync with it — a Form edit always re-derives the JSON text, a syntactically valid JSON
  edit always re-derives the Form, and invalid JSON (or JSON that parses but isn't an object) leaves the last-known-
  good state untouched rather than clearing the editor; any top-level field the Form doesn't know about survives
  every round trip unchanged. **Validate** runs the same `GameBlueprintValidator` used everywhere else, without
  touching disk. **Save** writes the blueprint as formatted JSON with a stable field order and a trailing newline
  (so re-saving unchanged content is byte-identical) to a path the user types — refusing to overwrite a file that
  already exists unless the request explicitly confirms it (`{"status": "conflict"}`, `409`; see the API section);
  the UI's own **Overwrite** button asks for a confirmation naming the path before resending that request.
  **Build Preview**/**Build Package** call the same `buildGameBuildInfo()`/`GamePackageGenerating` services the
  path-based Build tab and `pokie build` itself use, including the same safe-rebuild/conflict check, followed by an
  **Open in Studio** button on a successful build — the same Home → Project transition as every other flow here.
  Re-clicking **Build**/**Build Package** against the same output directory a build already succeeded against
  earlier in the session asks for confirmation first (a first build against a given directory never does).
  Load/Save/Build never resolve a path against Studio's own internal asset directory (`studioRoot`) — only an
  explicitly user-given path is ever read or written.
- **Reel Strip Modeler** — a fourth "Reel generation" mode (alongside Default/Reel strips/Symbol weights) for editing
  a `GameBlueprint`'s per-reel [`reelStripGeneration`](#reelstripgeneration-build-time-reel-strip-generation) array:
  each reel independently toggles between **Literal** (the same per-symbol strip editor as the Reel strips mode) and
  **Generated** (that reel's own length, seed, max attempts, an exclusive counts-or-weights table, a locked-positions
  table, and its `constraints` array edited as raw JSON — there are seven constraint types with quite different
  fields, so this reuses the same JSON-editing affordance the whole-blueprint JSON view already has instead of one
  bespoke widget per type). Switching a reel between Literal/Generated, or a generated reel's own source between
  counts/weights, never discards what was already entered on the side being left — the previous configuration is
  restored, not reset to defaults, the next time the toggle comes back around. **Resolve reels** calls `POST
  /api/home/blueprints/reel-strip-generation-preview` (see the API section), which runs the exact same
  `resolveReelStripGeneration`/`ReelStripGenerator`/`ReelStripAnalyzer` `pokie build` itself uses — never a
  reimplementation — and shows every reel's exact resulting symbol sequence, symbol-count analysis, and (for a
  generated reel whose constraints can't be satisfied) every generation attempt's own diagnostics/violations, the
  same information a real `pokie build` failure would report, without writing anything; a blueprint-level problem
  unrelated to reelStripGeneration itself never blocks this preview, only hides the (unrelated) affected reel if any.
  Any further edit clears a previously shown preview outright (it described the blueprint as it was *before* that
  edit), and a "Resolve reels" response that arrives after the blueprint has since changed is silently discarded
  rather than shown. **Save** always writes the *authored* `reelStripGeneration` array
  (counts/weights/seed/constraints), never a resolved/materialized strip — identical to how `pokie build` itself
  keeps `blueprintHash` keyed on the authored blueprint.

None of these ever shell out to `pokie create`/`init`/`build` as a subprocess, or duplicate their logic — see
`StudioHomeService` (`cli/studio/home/StudioHomeService.ts`) for Create/Init/Build(path)/Open, and
`StudioBlueprintService` (`cli/studio/blueprint/StudioBlueprintService.ts`) for the Blueprint Editor — both drive
the same underlying services directly, and share one place (`StudioHomeService.rememberRecentProject`) for
recent-projects bookkeeping across all six flows.

A **Documentation** section links into this repository's docs.

Options:

- `--port <number>` / `--host <string>` — where Studio listens (default `127.0.0.1:3200`).
- `--no-open` — don't try to open a browser.

### Project Dashboard

Opening or creating a project — or launching Studio directly with `pokie .`/`pokie <path>`/`pokie studio <path>`
— switches Studio into the **Project** mode/route, identified by that project's `projectRoot`, and shows the
**Project Dashboard**: the first real Project-mode feature (everything else beyond it — GUIs for
`build`/`sim`/`report`/`diff`/`replay`/`serve` — is still to come, via the `StudioToolHandling` extension point).

The Dashboard has six tabs, **Overview**, **Validation**, **Simulation**, **Reports**, **Replay**, and
**Runtime**, switched client-side with no full page reload:

- **Overview** shows the game's name/id/version, the absolute `projectRoot`, and a **provenance** panel — if the
  package was generated by [`pokie build`](#pokie-build-configjson), its blueprint hash, source path, `pokie`
  version, and generated-files list (the exact same data [`pokie inspect`](#pokie-inspect-packageroot) prints);
  otherwise a "not built via `pokie build`" message. An **Inspect** quick action re-runs this (handy after
  rebuilding without restarting Studio).
- **Validation** shows the result of a **Validate** quick action (or its own "Run Validate" button): valid/invalid,
  errors, warnings, and suggestions — the exact same report [`pokie validate`](#pokie-validate-packageroot)
  produces.
- **Simulation** — see its own section below.
- **Reports** — see its own section below.
- **Replay** — see its own section below.
- **Runtime** — see its own section below.

Every quick action calls `GamePackageInspecting`/`PokieGamePackageValidating`/the simulation services directly (the
same services `pokie inspect`/`pokie validate`/`pokie sim` use) — Studio never spawns a CLI command as a
subprocess, and never duplicates their logic.

The Dashboard itself has four states, all handled explicitly by the frontend:

- **empty** — Studio is in Home mode; there's no project to show a dashboard for.
- **loading** — only right after Studio starts directly into Project mode (`pokie .`/`pokie <path>`); the entry
  module hasn't finished loading yet. Create/Open both already have the manifest in hand by the time they switch
  Studio into Project mode, so they go straight to **loaded**.
- **loaded** — the game's manifest (id/name/version) loaded successfully.
- **error** — loading the entry module failed (missing build output, a package that doesn't satisfy the
  `PokieGame` contract, a corrupt/missing `package.json`, an entry module that throws on import, ...). The
  Overview/Validation tabs stay usable even here — Inspect only reads `package.json`/`build-info.json` (no entry
  module needed), and Validate is exactly how to see the concrete reason loading failed.

#### Simulation

The **Simulation** tab runs a [`pokie sim`](#pokie-sim-packageroot)-equivalent simulation against the active
project and shows a human-readable report — without ever shelling out to `pokie sim` or reimplementing its logic.
A form asks for **rounds** (required, a positive integer), an optional **seed**, and **workers** (a positive
integer, default `1`), same as `pokie sim --rounds/--seed/--workers`; running it shows **queued** → **running**
(with a live rounds-completed/total progress line — aggregated across every worker when `workers > 1` — and
elapsed duration) → **completed**/**failed**/**cancelled**. A **Cancel** button is available while
queued/running (asking for confirmation before it actually cancels — see below for what cancelling actually stops
when `workers > 1`), and once the job reaches a terminal state, a **Run again with the same parameters** button
re-submits the exact same rounds/seed/workers.

The report shown on completion includes at minimum: game id/version, rounds (and requested rounds, if the game
stopped itself early), seed, total bet, total payout, RTP, hit frequency, volatility/standard deviation, the RTP
95% confidence interval, max win, a base/free-games/custom category **breakdown** table when the report has one
(same as [`pokie sim`](#pokie-sim-packageroot)'s own breakdown — omitted entirely for a game whose session doesn't
support round categorization), and any **warnings**/**reproducibility** command the report carries.

Only one simulation may be queued/running per project at a time — starting a second one while the first is still
active returns a `409` naming the already-active job's id, rather than silently starting a competing run.

Studio drives every simulation through the same [`ParallelSimulationRunner`](simulation.md#parallel-simulation-workers)
`pokie sim --workers` uses — not a separate implementation of its own. For `workers === 1` (the default), that
means the same bounded-chunks-with-a-yield-between-them approach as before (progress/cancellation only take effect
between chunks, since [`AggregateSimulationRunner`](#pokie-sim-packageroot) itself is a synchronous,
uninterruptible loop with no hooks of its own); for `workers > 1`, real worker threads are spawned per
`ParallelSimulationRunner`'s own rules (see [Worker package-loading limitations](simulation.md#worker-package-loading-limitations)
— this is why Workers is only usable against a real, on-disk project, which every open Studio project already
is), and cancelling terminates every one of them immediately rather than waiting for a chunk boundary. Either way,
a cancelled/failed job never surfaces a partial report as if it were a successful one. Stopping Studio itself
(`Ctrl+C`) cancels every still-active simulation the same way.

#### Reports

Every simulation that reaches **completed** shows up in the **Reports** tab's list — reopenable at any point during
the current Studio process, not just right after it finishes. Each row shows the simulation id, game id/version,
requested vs. actual rounds, seed, RTP, hit frequency, max win, started/completed time, duration, whether the
report has warnings, and its status; clicking one opens the full report below the list. The Simulation tab's own
"View in Reports" button jumps straight to that same detail view for the simulation that just ran, and the detail
view's own "Back to Simulation parameters" button returns to the Simulation tab with **rounds**/**seed** pre-filled
from that report, ready to re-run. **Refresh** re-fetches the list without a full page reload — handy after
starting another simulation from a different tab.

The detail view offers three downloads — **Download JSON**, **Download Markdown**, **Download HTML** — plain links
to `GET /api/project/reports/:id/download?format=...` (see below); the browser's own save dialog handles the rest,
no client-side blob handling needed. Markdown/HTML are rendered with the exact same
`MarkdownSimulationReportRenderer`/`HtmlSimulationReportRenderer` [`pokie report`](#pokie-report-simulationreportjson)
uses — Studio never spawns `pokie report` as a subprocess, and never reimplements its formatting.

Only **completed** simulations ever appear in the list — a failed/cancelled job has no report to show, though it's
still retained (see below) in case its id is looked up directly. Opening a report for a simulation that hasn't
completed yet, has no report (failed/cancelled), or doesn't exist at all are all handled explicitly (see the API
section's `409`/`404` cases below) rather than crashing the detail view.

Studio keeps at most the 20 most recently completed/failed/cancelled simulations per project (oldest evicted
first) — a queued/running job is never evicted, no matter how many terminal jobs pile up around it. This is a
process-local, in-memory limit (same as the simulation jobs themselves): restarting Studio clears it.

#### Replay

The **Replay** tab runs a [`pokie replay`](#pokie-replay-packageroot)-equivalent replay against the active
project — reusing `loadPokieGame`/`GameSessionHandling.play()` directly (the same primitives
`ReplayRecorder` itself uses), never shelling out to `pokie replay` or reimplementing its logic. A form asks for a
**round** (required, a positive integer) and an optional **seed**, same as `pokie replay --round/--seed`.

Unlike the CLI's `ReplayRecorder`, which plays a fresh session forward to `round` in one uninterrupted synchronous
loop, Studio runs the replay as a background job, in bounded chunks against one long-lived session — the exact
same reason [Simulation](#simulation) is chunked: replaying a large `round` in a single call would block the whole
HTTP server's event loop (no status poll, cancel request, or unrelated Inspect/Validate call could be served) for
as long as it took. `POST /api/project/replays` therefore returns immediately (`202`) with a **queued** job; the
tab then shows **queued** → **running** (with a live completed-rounds/requested-round progress line and elapsed
duration) → **completed**/**failed**/**cancelled**. A **Cancel** button is available while queued/running (asking
for confirmation before it actually cancels), and once the job reaches a terminal state, a **Run again with the
same parameters** button re-submits the exact same round/seed. Only one replay may be queued/running per project at a time — starting a second one while the first is
still active returns a `409` naming the already-active job's id, rather than silently starting a competing run.
Cancellation, like Simulation's, can only take effect between chunks, not mid-chunk. The session itself is created
exactly once per job and reused across every chunk — never recreated, and its RNG/game state is never reset — so
the sequence of rounds actually played, and therefore the resulting descriptor, is identical to what
`ReplayRecorder`'s own uninterrupted loop would produce for the same seed/round; only the *scheduling* differs.

The completed result shown includes: game id/name/version, round, seed, cumulative total bet, cumulative total
payout, the final **screen** rendered as a simple grid (or a "no screen available" notice for a session that
doesn't implement `getSymbolsCombination()` — the exact same feature-detection [`pokie
replay`](#pokie-replay-packageroot) itself relies on), timestamp, and duration. **Download JSON** downloads the
full `ReplayDescriptor` — only available once the job is `"completed"`; a failed/cancelled job has no descriptor to
download, same as a failed/cancelled simulation having no report. The tab also carries a standing notice that
replay reproducibility is best-effort: a deterministic game reproduces exactly for the same seed/round, but a game
whose outcome doesn't depend solely on the seed may not.

A **Recent Replays** list shows every replay job for the active project regardless of status (including a
still-running one, unlike Simulation's Reports list which only ever shows completed jobs), most-recently-started
first; clicking one re-fetches its full state (resuming live polling if it's still queued/running) and updates the
round/seed fields and "Run again" target to match. Studio keeps at most the 20 most recent *terminal*
(completed/failed/cancelled) replays per project (oldest evicted first) — a queued/running job is never evicted,
no matter how many terminal jobs pile up around it. This is a process-local, in-memory limit, same as Reports:
restarting Studio clears it, and a replay from one project becomes unreachable (a `404`, indistinguishable from an
unknown id) once Studio switches to a different project. Stopping Studio itself (`Ctrl+C`) cancels every
still-active replay the same way it cancels every still-active simulation.

Studio bounds `round` to an explicit safety ceiling (`MAX_STUDIO_REPLAY_ROUND`, 100,000) — `pokie replay` itself has
no such limit; this mostly bounds how long a single replay job can occupy its project's one-active-replay-at-a-time
slot, now that the replay itself no longer blocks the server while it runs.

#### Runtime

The **Runtime** tab starts, stops, and restarts an in-process, [`pokie serve`](#pokie-serve-packageroot-experimental)-
equivalent HTTP server for the active project, then lets you create/load a session and spin against it — the same
`PokieDevServer`/`SessionRepository`/`WalletPort`/network serializers/idempotency repository/optimistic-locking
machinery `pokie serve`/`pokie dev` themselves use, driven directly, in-process. **`pokie serve`/`pokie dev` are
never spawned as a subprocess, and none of their logic is reimplemented** — a `StudioRuntimeManager`
(`cli/studio/runtime/StudioRuntimeManager.ts`) owns at most one running server for the current project, and Session
Tools talk to that running server through a small typed HTTP client
(`cli/studio/runtime/RuntimeSessionClient.ts`) exactly the way any external client would — Studio's own domain
layer never reimplements `PokieDevServer`'s HTTP contract.

**Server controls** — **Host**/**Port** (blank port lets the OS assign a free one, same as `pokie serve --port 0`),
**Debug mode**, **Session storage** (`memory`, the default and same as `pokie serve`'s own out-of-box behavior, or
`file`, backed by a `FileSessionRepository` under a Studio-managed temp directory that survives a Stop→Start or
Restart within the same project session), and an optional default **Seed** applied to Create Session when its own
seed field is left blank — then **Start**/**Stop**/**Restart** buttons. A status badge always shows one of the five
lifecycle states — **stopped**, **starting**, **running**, **stopping**, **failed** — plus, once running, the bound
host/port/base URL and an **Open runtime endpoint in a new tab** link (`<baseUrl>/health`). Starting while already
running is refused with a `409` naming the currently running state rather than silently restarting; starting a
second time after a genuine failure (an invalid project package, or a port already in use) is always safe to retry.
Stopping an already-stopped runtime, and stopping one that was never started, are both a no-op, never an error; the
**Stop** button itself asks for confirmation first. Switching to a different project (or back to Home) always stops
any active runtime first, and also cancels any active Simulation/Replay job for the project being left (see above)
— nothing from a project you've switched away from keeps running unseen.

**Debug mode is a start-time toggle on the runtime server itself**, not a raw `?debug=1` exposed per request to the
browser: `sessionVersion` is always shown regardless (central to demonstrating optimistic locking below), but the
rest of the internal/debug bundle (`stateBefore`/`stateAfter`/`debugData`/`requestId`) is only ever attached to
Studio's own response — and only ever shown in the tab's **Debug response** panel — when the runtime was started
with debug mode on; otherwise that panel shows an explicit "Debug disabled" placeholder. Restart with debug mode on
to inspect it.

**Session Tools**: **Create Session** (with an optional seed override) or **Load Session** by an existing session
id (restoring it exactly as `GET /sessions/:sessionId` would) both show the session id, its `sessionVersion` (when
the configured repository is versioned), credits, bet, win, and — for a game with a screen — a rendered grid. A
**Spin** form takes an optional **Request id** (repeating the same one returns the exact same result instead of
spinning again — the tab's own **Repeat Same Request** button resends the last spin's exact `requestId`/
`expectedSessionVersion`, a quick way to see idempotent replay in action) and an optional **Expected session
version** — a stale value is rejected as an HTTP `409` conflict immediately, before anything spins (see
[Optimistic locking](#optimistic-locking-session-versioning) above for the underlying
`expectedSessionVersion` mechanism this field drives). The **Public response** panel always shows the exact JSON a
plain client of the runtime server would see; the **Debug response** panel shows the rest of `internal` when debug
mode is on. Every outcome is a distinct, clearly labeled state — an unknown session id, insufficient balance/
`canPlayNextGame()` blocked, a stale-version conflict, and the runtime simply not running yet — never a generic
error. A **Request/Response History** list (page-session only, capped at 20 entries, never persisted) records every
Server-control/Session-tools action taken.

None of this ever returns a stack trace, a `SessionRepository`/`WalletPort` instance, or a raw runtime session
object through Studio's own API — `StudioRuntimeManager` only ever forwards the same plain JSON `RuntimeSessionClient`
already got back from the real running server.

### API

Studio's frontend and JSON API share one origin/server (unlike `pokie serve`/`pokie client`'s deliberate split) —
no CORS handling is needed. Every response is a typed, plain-data DTO — no stack traces are ever sent to the
client, even for a load/validation failure.

- `GET /api/health` — `200 {"status": "ok"}`, always, once Studio is up.
- `GET /api/context` — the current mode: `{"mode": "home"}` or `{"mode": "project", "projectRoot": "..."}`.
- `GET /api/studio/diagnostics` — safe, plain diagnostic data, in either mode: `{"studioVersion", "nodeVersion",
  "mode", "projectRoot"?, "activeSimulationCount", "activeReplayCount", "runtimeStatus", "recentProjectStoragePath",
  "uptimeSeconds"}`. Every field is a primitive already safe to expose — never a stack trace, an environment
  variable, a token, or a service instance; `recentProjectStoragePath` is always the literal
  `"in-memory (no persistent path)"`, since recent projects are never actually persisted to disk (see
  **Recent Projects** above).
- `GET /api/home/recent-projects` — the in-memory recent-projects list: `{projectRoot, name, openedAt,
  missing}[]`, most-recently-started first. `missing` is `true` when the project's directory/`package.json` can no
  longer be found on disk — the entry itself is never dropped just because of that (see
  `StudioHomeService.listRecentProjects()`).
- `POST /api/home/projects/create` `{"destinationDir": string, "name": string, "gameId"?: string, "gameName"?:
  string, "version"?: string}` — creates a project via the same `GamePackageCreating` service `pokie create` uses.
  `400 {"error": "..."}` for a malformed request (missing `destinationDir`/`name`, or an empty optional override);
  otherwise always `200`/`201` with a `StudioScaffoldResultView`: `{"status": "ok", "projectRoot", "manifest",
  "createdFiles", "updatedFiles", "skippedFiles"}` or `{"status": "error", "error": "..."}` for a domain-level
  failure (e.g. the destination already exists) — a well-formed request that fails at the domain level is not a
  failed HTTP request, so this is never a 4xx. Never switches Studio to Project mode itself — see
  `POST /api/home/projects/open` below.
- `POST /api/home/projects/init` `{"directory": string}` — initializes an existing npm project via the same
  `GamePackageScaffolding` service `pokie init` uses. Same request-validation-vs-domain-result split as `create`
  above; the same `StudioScaffoldResultView` shape (a missing `package.json` is `{"status": "error", "error":
  "..."}`, the same clear message `pokie init` itself gives).
- `POST /api/home/projects/build/preview` `{"blueprintPath": string, "outDir"?: string}` — validates the blueprint
  and previews what a build would generate, without writing anything: `{"status": "load-error", "error": "..."}`
  (the file doesn't exist/isn't valid JSON) / `{"status": "invalid", "errors": [...], "warnings": [...]}` /
  `{"status": "ok", "warnings": [...], "manifest", "reels", "rows", "symbolsCount", "blueprintHash",
  "expectedFiles"}`. Always `200` for a well-formed request, same reasoning as `GET /api/project/validate`.
- `POST /api/home/projects/build` — same request shape as the preview; on top of `load-error`/`invalid`, generates
  the package via the same `GamePackageGenerating` service `pokie build` uses, including its safe-rebuild/conflict
  check: `{"status": "error", "error": "..."}` (e.g. `"... already exists and contains file(s) ... did not
  generate: ..."` — refusing to overwrite a directory it didn't produce) or `{"status": "ok", "projectRoot",
  "manifest", "createdFiles", "buildInfo", "unchanged", "warnings"}` on success (`201`).
- `POST /api/home/blueprints/validate` `{"blueprint": <any JSON value>}` — runs `GameBlueprintValidator` against
  `blueprint` as given (no file is read or written): `400 {"error": "..."}` only if `blueprint` itself is missing
  from the request body; otherwise always `200` with `{"status": "ok", "warnings": [...]}` or `{"status": "invalid",
  "errors": [...], "warnings": [...]}`.
- `POST /api/home/blueprints/load` `{"path": string}` — reads and parses `path` as a `GameBlueprint` JSON file (the
  same `loadGameBlueprint` `pokie build` itself uses): `200 {"status": "ok", "path": "<resolved path>", "blueprint":
  <parsed value>}`, or `200 {"status": "load-error", "error": "..."}` for a missing file, invalid JSON, or a path
  that resolves inside Studio's own internal asset directory. `400 {"error": "..."}` only for a missing/malformed
  `path`.
- `POST /api/home/blueprints/save` `{"path": string, "blueprint": <any JSON value>, "overwrite"?: boolean}` — writes
  `blueprint` to `path` as formatted JSON (known `GameBlueprint` fields in a fixed order, any unrecognized top-level
  fields preserved and appended after them, 4-space indent, trailing newline — deterministic: re-saving unchanged
  content produces byte-identical output). If `path` already exists and `overwrite` isn't `true`, nothing is written
  and the response is `409 {"status": "conflict", "path": "...", "error": "..."}` — resend with `"overwrite": true`
  to replace it. `201 {"status": "ok", "path": "..."}` on a successful write; `200 {"status": "error", "error":
  "..."}` for an fs failure or a path resolving inside Studio's own internal directory (safe message, never a stack
  trace). `400 {"error": "..."}` only for a missing `path`/`blueprint`, or a non-boolean `overwrite`.
- `POST /api/home/blueprints/reel-strip-generation-preview` `{"blueprint": <any JSON value>}` — same request shape
  and shape-validation as `/validate` (`400 {"error": "..."}` only if `blueprint` itself is missing); resolves
  `blueprint.reelStripGeneration` (if present) via the real `resolveReelStripGeneration`/`ReelStripGenerator` and
  analyzes every reel's resulting strip via `ReelStripAnalyzer` — never writes anything. Always `200 {"status": "ok",
  "errors": [...], "warnings": [...], "reels": [...]}`: `errors`/`warnings` are the same `GameBlueprintValidator`
  issues `/validate` would report, but never block `reels` — a blueprint-level problem unrelated to
  reelStripGeneration itself (a broken paytable, an invalid `availableBets`, ...) never hides every other,
  resolvable reel's result. `reels` is empty when the blueprint has no `reelStripGeneration` at all; a
  reelStripGeneration entry that isn't even a well-formed object (a hand-edited JSON blueprint) is simply left out
  of `reels` rather than failing the request. Each remaining entry is either `{"reelIndex", "type": "literal",
  "strip", "analysis"}` or, for a `"generated"` reel, `{"reelIndex", "type": "generated", "seed", "success",
  "attemptsUsed", "diagnostics", "strip"?, "analysis"?}` — `strip`/`analysis` present if and only if `success` is
  `true`; a failed reel's `diagnostics` carries every attempt made (not just the last one) with that attempt's own
  violations, the same information a `pokie build` failure would print, without failing the request as a whole
  (every other reel's result is still returned).
- `POST /api/home/blueprints/build-preview` `{"blueprint": <any JSON value>, "outDir"?: string, "sourcePath"?:
  string}` — the same preview `POST /api/home/projects/build/preview` gives, except the blueprint is taken directly
  from the request body instead of loaded from a path (so it never needs to be saved first): `200 {"status":
  "invalid", "errors": [...], "warnings": [...]}` or `200 {"status": "ok", "warnings": [...], "manifest", "reels",
  "rows", "symbolsCount", "blueprintHash", "expectedFiles"}`. Never writes anything.
- `POST /api/home/blueprints/build` — same request shape as the preview; on top of `invalid`, generates the package
  via the same `GamePackageGenerating` service `pokie build` uses, including its safe-rebuild/conflict check (an
  `outDir` resolving inside Studio's own internal directory is also refused, the same way as `save` above):
  `200 {"status": "error", "error": "..."}` or `201 {"status": "ok", "projectRoot", "manifest", "createdFiles",
  "buildInfo", "unchanged", "warnings"}` on success — the built project is also recorded as a recent project, so its
  **Open in Studio** button (`POST /api/home/projects/open` below) works exactly like every other Home flow's.
- `POST /api/home/projects/open` `{"projectRoot": string}` — loads `projectRoot` with `loadPokieGame` and switches
  Studio to Project mode on success (`200 {"context": {...}, "manifest": {...}}`); `400 {"error": "..."}` if it
  isn't a valid [game package](game-packages.md). This is the one explicit Home → Project Studio context
  transition — it mutates the same running server's state in place, never starting a new HTTP server or Studio
  process (see `StudioServer.handleHomeOpenProject`).
- `POST /api/projects/close` — switches back to Home mode.
- `GET /api/project/context` — the Project Dashboard's own read model, always one of the four states above:
  `{"status": "empty"}` / `{"status": "loading", "projectRoot": "..."}` /
  `{"status": "loaded", "projectRoot": "...", "game": {"id": "...", "name": "...", "version": "..."}}` /
  `{"status": "error", "projectRoot": "...", "error": "..."}`.
- `GET /api/project/inspect` — the active project's `GamePackageInspectionReport` (same shape as
  [`pokie inspect`](#pokie-inspect-packageroot)'s JSON), or `409 {"error": "No active project."}` in Home mode.
- `GET /api/project/validate` — the active project's `PokieGamePackageValidationReport` (same shape as
  [`pokie validate`](#pokie-validate-packageroot)'s JSON), or `409 {"error": "No active project."}` in Home mode.
- `POST /api/project/simulations` `{"rounds": number, "seed"?: string, "workers"?: number}` — starts a simulation
  for the active project and returns immediately (`202`) with the new job in `"queued"` status; the simulation
  itself runs in the background, never blocking this request. `workers` defaults to `1` when omitted. `400
  {"error": "..."}` for an invalid `rounds` (missing, not an integer, less than 1, or above the safe Studio
  ceiling of 2,000,000 — see `MAX_STUDIO_SIMULATION_ROUNDS`), an invalid `seed` (present but empty/not a string),
  or an invalid `workers` (present but not an integer between 1 and `MAX_SIMULATION_WORKERS`, currently 32); `409
  {"error": "No active project."}` in Home mode; `409 {"error": "...", "activeJobId": "..."}` if a simulation is
  already queued/running for this project — a retried/duplicated request can never spawn a competing job or
  corrupt the one already in flight.
- `GET /api/project/simulations/:id` — that job's current state:
  `{id, status, rounds, seed?, workers, startedAt, roundsCompleted, durationMs, report?, statistics?, error?}` — `status` is
  `"queued"`/`"running"`/`"completed"`/`"failed"`/`"cancelled"`; `report` (a full `SimulationReport`, see
  [`pokie sim`](#pokie-sim-packageroot)) and `statistics` (the extra volatility/standard-deviation/confidence-
  interval fields `SimulationAccumulator` computes but `SimulationReport` itself doesn't carry) are only present
  once `status` is `"completed"`; `error` (a safe message, never a stack trace) only once `status` is `"failed"`.
  `404 {"error": "..."}` for an unknown id.
- `DELETE /api/project/simulations/:id` — requests cancellation of a queued/running job (returns its current
  view — the record only actually flips to `"cancelled"` once that's noticed, on the next `GET`/poll: at the next
  chunk boundary for `workers === 1`, or as soon as its worker threads are terminated for `workers > 1`);
  idempotent on an already-terminal job (just returns it unchanged, not an error). `404 {"error": "..."}` for an
  unknown id.
- `GET /api/project/reports` — the active project's completed simulations, most-recently-completed first:
  `{id, status: "completed", game: {id, version}, requestedRounds, actualRounds, seed?, workers, rtp, hitFrequency,
  maxWin, startedAt, completedAt, durationMs, hasWarnings}[]`. A failed/cancelled job never appears here (it has no report
  to summarize). `409 {"error": "No active project."}` in Home mode.
- `GET /api/project/reports/:id` — that simulation's full `SimulationReport` (same shape as
  [`pokie sim`](#pokie-sim-packageroot)'s own JSON). `404 {"error": "..."}` for an unknown id **or** one that
  belongs to a different project (deliberately indistinguishable from "unknown" — this can never be used to probe
  whether some other project has a simulation with a given id). `409 {"error": "..."}` if the simulation hasn't
  completed yet (still queued/running) or completed without a report (failed/cancelled) — the message names which.
- `GET /api/project/reports/:id/download?format=json|markdown|html` — the same report as a downloadable file:
  correct `Content-Type` per format (`application/json`, `text/markdown`, `text/html`, each `charset=utf-8`) and
  `Content-Disposition: attachment; filename="..."` with a filename built from the game id/version and simulation
  id (sanitized — any character outside `[a-zA-Z0-9._-]` is replaced, so this is safe regardless of what a game's
  id/version happen to contain). `400 {"error": "..."}` for a missing/invalid `format`; the same `404`/`409` cases
  as the JSON endpoint above otherwise.
- `POST /api/project/replays` `{"round": number, "seed"?: string}` — starts a replay for the active project and
  returns immediately (`202`) with the new job in `"queued"` status; the replay itself runs in the background,
  never blocking this request. `400 {"error": "..."}` for an invalid `round` (missing, not an integer, less than 1,
  or above the safe Studio ceiling of 100,000 — see `MAX_STUDIO_REPLAY_ROUND`) or an invalid `seed` (present but
  empty/not a string); `409 {"error": "No active project."}` in Home mode; `409 {"error": "...", "activeJobId":
  "..."}` if a replay is already queued/running for this project — a retried/duplicated request can never spawn a
  competing job or corrupt the one already in flight.
- `GET /api/project/replays/:id` — that job's current state: `{id, status, round, seed?, startedAt,
  completedRounds, durationMs, game?, descriptor?, error?}` — `status` is
  `"queued"`/`"running"`/`"completed"`/`"failed"`/`"cancelled"`; `game` (id/name/version) is known as soon as the
  package has loaded, before the round-playing loop even starts; `descriptor` (a full `ReplayDescriptor`, same
  shape as [`pokie replay`](#pokie-replay-packageroot)'s own JSON, including `screen: null` for a session without
  `getSymbolsCombination()`) is only present once `status` is `"completed"`; `error` (a safe message, never a stack
  trace) only once `status` is `"failed"`. `404 {"error": "..."}` for an unknown id **or** one that belongs to a
  different project (deliberately indistinguishable from "unknown", same reasoning as Reports' detail endpoint
  above); `409 {"error": "No active project."}` in Home mode.
- `DELETE /api/project/replays/:id` — requests cancellation of a queued/running replay (returns its current view —
  the record only actually flips to `"cancelled"` once the chunk loop notices, on the next `GET`/poll); idempotent
  on an already-terminal job (just returns it unchanged, not an error). `404 {"error": "..."}` for an unknown id or
  one belonging to a different project.
- `GET /api/project/replays` — the active project's most recent replay jobs regardless of status, most-recently-
  started first: `{id, status, game?, round, seed?, completedRounds, totalBet?, totalWin?, startedAt, completedAt?,
  durationMs, error?}[]` (no `screen` — fetch the detail endpoint for that). `409 {"error": "No active project."}`
  in Home mode.
- `GET /api/project/replays/:id/download` — the completed job's `ReplayDescriptor` as a downloadable JSON file:
  `Content-Type: application/json; charset=utf-8` and `Content-Disposition: attachment; filename="..."` with a
  filename built from the game id/version and replay id (sanitized the same way as Reports' download filenames).
  `404 {"error": "..."}` for an unknown id or one belonging to a different project; `409 {"error": "..."}` if the
  replay hasn't completed yet (still queued/running) or completed without a descriptor (failed/cancelled) — the
  message names which.
- `GET /api/project/runtime` — the active project's runtime lifecycle state: `{"status": "stopped"}` /
  `{"status": "starting"}` / `{"status": "running", "host", "port", "baseUrl", "debug", "repositoryMode", "startedAt"}`
  / `{"status": "stopping"}` / `{"status": "failed", "error"}`. `409 {"error": "No active project."}` in Home mode.
- `POST /api/project/runtime/start` `{"host"?: string, "port"?: number, "debug"?: boolean, "seed"?: string|number,
  "repositoryMode"?: "memory"|"file"}` — starts a `PokieDevServer` for the active project directly, in-process
  (never a subprocess); `"port"` omitted or `0` lets the OS assign a free port, same as `pokie serve --port 0`;
  `"repositoryMode"` defaults to `"memory"`. `201` with the resulting `{"status": "running", ...}` state on success;
  `200 {"status": "failed", "error": "..."}` for a safe domain-level failure (an invalid project package, or the
  port already in use — never a stack trace); `409 {"error": "Runtime is already running.", "state": {...}}` if a
  runtime is already `"running"`/`"starting"` for this project — refuses to silently restart it. `400 {"error":
  "..."}` for a malformed request. `409 {"error": "No active project."}` in Home mode.
- `POST /api/project/runtime/stop` — idempotent: always `200 {"status": "stopped"}`, whether or not a runtime was
  actually running. `409 {"error": "No active project."}` in Home mode.
- `POST /api/project/runtime/restart` — same request shape as `start`, but every field is optional even as a whole:
  omit the body entirely to reuse the last successful start's own options; never a `409` conflict (restarting while
  already running is the point). Same `201`/`200`-with-`"failed"` response shape as `start`. `409 {"error": "No
  active project."}` in Home mode.
- `POST /api/project/runtime/sessions` `{"seed"?: string|number}` — creates a session against the running runtime
  server via `RuntimeSessionClient` (the same request an external client would make to
  [`POST /sessions`](#post-sessions)), overriding `start`'s own default seed when given. `201 {"status": "ok",
  "session": {...}}` on success — `session` always includes `sessionVersion` when the configured repository is
  versioned, and a `debug` field (the rest of `internal`) only when the runtime was started with debug mode on (see
  [Runtime](#runtime) above). `409 {"error": "Runtime is not running. Start it first."}` if the runtime isn't
  `"running"`; `200 {"status": "error", "error": "..."}` for a safe, unexpected failure. `409 {"error": "No active
  project."}` in Home mode.
- `GET /api/project/runtime/sessions/:sessionId` — restores a session's current state via
  [`GET /sessions/:sessionId`](#get-sessionssessionid) against the running runtime server. Same `{"status": "ok",
  "session": {...}}` shape as create. `404 {"error": "Unknown sessionId \"...\"."}` for an unknown id; `409
  {"error": "Runtime is not running. Start it first."}` if the runtime isn't running; `200 {"status": "error",
  "error": "..."}` for a safe, unexpected failure. `409 {"error": "No active project."}` in Home mode.
- `POST /api/project/runtime/sessions/:sessionId/spins` `{"requestId"?: string, "expectedSessionVersion"?: number}`
  — spins via [`POST /sessions/:sessionId/spin`](#post-sessionssessionidspin) against the running runtime server,
  forwarding both fields as-is (see [Optimistic locking](#optimistic-locking-session-versioning) above for what
  `expectedSessionVersion` does). Same `{"status": "ok", "session": {...}}` shape as create/get. `404 {"error":
  "Unknown sessionId \"...\"."}` for an unknown id; `400 {"error": "..."}` if `canPlayNextGame()` blocks the spin;
  `409 {"error": "...", "reason": "not-running"}` if the runtime isn't running, or `409 {"error": "...", "reason":
  "conflict"}` for a stale `expectedSessionVersion`/a storage-level version conflict — `reason` disambiguates the
  two 409 cases (both a genuine HTTP conflict, deliberately, per the task this feature was built for) without
  parsing `error`'s free-text message; `200 {"status": "error", "error": "..."}` for a safe, unexpected failure.
  `409 {"error": "No active project."}` in Home mode.

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

pokie dev ./crazy-fruits
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
- [`dev`](#pokie-dev-packageroot-experimental) (or `serve`/`client` run separately) is normally the last,
  interactive step, not part of a scripted pipeline — it only needs the same built package and runs until
  stopped. `pokie create`/`pokie init` already scaffold `npm run start`/`server`/`client` scripts wrapping these
  three commands.

## What's next

`pokie build`, `pokie create`, `pokie init`, `pokie inspect`, `pokie sim`, `pokie validate`, `pokie report`,
`pokie diff`, `pokie replay`, `pokie serve`, `pokie client`, and `pokie dev` are the first of a planned set of
subcommands built on the same [game package](game-packages.md) primitives (`loadPokieGame`, `isPokieGame`,
`PokieGameContractValidationRule`). [POKIE Studio](#pokie--pokie-studio-experimental) is where GUIs for each of
them will eventually live, built on the exact same primitives via `StudioToolHandling`.
