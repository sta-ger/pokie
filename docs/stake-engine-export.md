[← Back to docs index](README.md)

# Stake Engine Export

`stakeengine/` exports a canonical [`WeightedOutcomeLibrary`](weighted-outcome-library.md) (one per bet mode) to
the real [Stake Engine math-sdk static file format](https://stakeengine.github.io/math-sdk/rgs_docs/data_format/):
a strict `index.json`, a per-mode lookup CSV, and per-mode zstd-compressed JSONL "books". It's the first static
export target POKIE ships and, like every other exporter in the project (`ParSheetExporter`, `GamePackageGenerator`),
it never introduces a second calculation path — every number it writes already exists on the library's own
outcomes/artifacts, re-shaped, not recomputed.

## Output layout

```
<outDir>/
  index.json            # Stake's own strict schema — never any extra fields
  lookup_<mode>.csv      # per mode: no header, "simulationId,weight,payoutMultiplier"
  books_<mode>.jsonl.zst # per mode: zstd-compressed JSONL, one {id, events, payoutMultiplier} line per outcome
  pokie-manifest.json    # POKIE's own provenance — never read by Stake's own tooling
```

`index.json` is kept exactly to Stake's own schema:

```json
{
    "modes": [
        {"name": "base", "cost": 1, "events": "books_base.jsonl.zst", "weights": "lookup_base.csv"},
        {"name": "bonus", "cost": 100, "events": "books_bonus.jsonl.zst", "weights": "lookup_bonus.csv"}
    ]
}
```

POKIE's own provenance (which `pokie` version produced this export, each mode's library hash, when it ran, ...)
never gets added to `index.json` itself — it goes to a sibling `pokie-manifest.json` instead, the same way
`GameBuildInfo`/`build-info.json` sits alongside a generated game package without polluting the package's own
files (see [Game Packages](game-packages.md)).

## Input shape: one library per mode

```ts
type StakeEngineExportModeInput<T = string> = {
    readonly modeName: string;
    readonly cost: number;
    readonly library: WeightedOutcomeLibrary<T>;
};
```

A `WeightedOutcomeLibrary` is already homogeneous over one game/config/`pokieVersion` and one `betMode`+`stake`
(see ["library homogeneity"](weighted-outcome-library.md#library-homogeneity-one-library-is-one-paid-bet)) —
that's exactly what one Stake "mode" is. A multi-mode export (e.g. `"base"` + `"bonus"`) is simply an array of
these, all sharing the same game/config/`pokieVersion` but differing in `betMode`/`stake`.

`cost` is Stake's own bet-cost multiplier for a mode, relative to the base bet (`1` for the base game, `100` for
a "bonus buy" mode, say). It's always supplied explicitly by the caller — POKIE never derives it from a stake
ratio, since there's no general way to know what "relative to base" should mean for an arbitrary game.

## Stake unit conversion — explicit, never rounded

Stake's own CSV/JSONL `payoutMultiplier` columns are `uint64`, and their actual meaning is scaled by a mode's own
`cost`: converting one of POKIE's own ratios (an `artifact.payoutMultiplier`, or a raw win amount divided by the
round's own `stake`) into Stake units is always

```
stakeUnits = ratio * cost * 100
```

— e.g. a POKIE `0.1x` `payoutMultiplier` at `cost: 1` exports as `10`; a `1.2x` `payoutMultiplier` at `cost: 100`
exports as `12000`. This is never rounded: `convertRatioToStakeUnits` (the one function every Stake amount in
this package goes through) returns the exact result only when it's already a non-negative safe integer, and the
export is rejected otherwise (see Validation below) — silently scaling-and-rounding would be a second, lossy
calculation path. If your math model produces a `payoutMultiplier` that doesn't convert to an exact integer at
the mode's own `cost`, that's a real modeling mismatch to fix upstream (e.g. by choosing a currency/`stake`
denomination that makes it exact), not something this exporter papers over.

The same reasoning applies to `WeightedOutcome.id`: Stake's own "id" column is an integer, but a `WeightedOutcome`'s
`id` is always a caller-supplied string (see [Weighted Outcome Library](weighted-outcome-library.md)). Rather than
invent a mapping (a hash, an incidental array index, ...), the exporter requires the string to already be the
canonical decimal form of a safe non-negative integer (`"0"`, `"1"`, `"2"`, ... — not `"01"`, `"-1"`, or `"1.5"`)
and simply parses it. `weight` has no unit conversion (Stake's own weight column is just an integer, not scaled
by `cost`) but must likewise already be a whole number.

## Events: a generic, mechanic-agnostic mapping

Stake's own math-sdk doesn't standardize an event schema beyond "a list of dictionary objects" — every game
defines its own mechanic-specific vocabulary (anticipation, tumble-specific fields, ...). `StakeEngineRoundEventsProjector`
therefore only maps what a `RoundArtifact` itself already models generically, implementing its own
`StakeEngineRoundEventsProjecting<T>` interface — deliberately not the generic `RoundArtifactProjector<T, TOutput>`
extension point `PokieJsonRoundArtifactProjector` uses (see [Round Artifacts](round-artifacts.md)), since a Stake
projection needs the mode's own `cost` to convert amounts into Stake units:

```ts
type StakeEngineRoundProjectionContext = {readonly cost: number};

interface StakeEngineRoundEventsProjecting<T = string> {
    project(artifact: RoundArtifact<T>, context: StakeEngineRoundProjectionContext): readonly StakeEngineEvent[];
}
```

| Round Artifact | Stake event |
|---|---|
| each `RoundStepArtifact` (in order) | `{type: "reveal", board: step.screen}` |
| that step's own `featureEvents` (in order) | passed through as-is — spread into the event alongside their own `type` |
| that step, if `totalWin > 0` | `{type: "win", amount}` — `amount` is `step.totalWin` converted to Stake units (`(step.totalWin / artifact.stake) * cost * 100`) |
| any round-level-only `featureEvents` (passed directly to `buildRoundArtifact`'s own `featureEvents` option, not attached to a step) | same passthrough |
| the round, always, exactly once, last | `{type: "finalWin", amount, payoutMultiplier}` — both converted to Stake units the same way (`payoutMultiplier` via `artifact.payoutMultiplier * cost * 100`); since `artifact.totalWin / artifact.stake === artifact.payoutMultiplier`, `finalWin.amount` and `finalWin.payoutMultiplier` are always exactly equal |

Every event is stamped with its own `index` (its position in the final sequence) last, so it always reflects the
true position even if a passed-through feature event's own data happened to carry a colliding `index` field. Just
like the top-level `payoutMultiplier` conversion, an amount that isn't representable as a non-negative safe
integer once converted throws — `StakeEngineExporter` treats that (or any other error a projector throws) as a
blocking `ValidationIssue`, never a crash (see Validation below).

`"reveal"`/`"win"`/`"finalWin"` are reserved structural markers in this encoding: a `RoundArtifactFeatureEvent`
whose own `type` is one of those three throws rather than being exported, since it would otherwise be
indistinguishable on import from the real structural event of the same name. Rename the feature event's `type`
before exporting.

This is a deliberate non-goal: no invented game-specific event vocabulary. A game with mechanic-specific events
Stake's own front-end expects (anticipation reels, per-symbol tumble animations, ...) needs its own projector —
implement `StakeEngineRoundEventsProjecting<T>` directly, the same way you'd implement any other custom
representation. Whatever a custom projector returns is still checked for canonical-JSON-safety before anything
is written (see Validation below), so it can't smuggle a `NaN`/`Infinity`/cycle/other non-JSON value into a book.

## Validation

`StakeEngineExportValidator` runs `WeightedOutcomeLibraryValidator` against every mode's library first (forwarding
its issues with the mode name prefixed onto `message` and added to `details.modeName`) — always, additively, the
same "never replaces, only adds" convention every validator in POKIE follows — then layers these Stake-specific
checks on top:

| Code | Severity | Meaning |
|---|---|---|
| `stakeengine-export-modes-empty` | error | no modes given |
| `stakeengine-mode-name-invalid` | error | `modeName` isn't a non-empty string matching `[A-Za-z0-9_-]+` (it drives filenames directly) |
| `stakeengine-duplicate-mode-name` | error | the exact same `modeName` used by more than one mode |
| `stakeengine-mode-name-case-collision` | error | two `modeName`s differing only in case — these would write the exact same `lookup_*.csv`/`books_*.jsonl.zst` filenames on a case-insensitive filesystem, a real conflict, not just a portability nit |
| `stakeengine-mode-cost-invalid` | error | `cost` isn't a finite number `> 0` |
| `stakeengine-cross-mode-provenance-mismatch` | error | a mode's game id/version, `configHash`, or `pokieVersion` doesn't match the export's other modes (`betMode`/`stake` are expected to differ per mode, so those are excluded from this check) |
| `stakeengine-outcome-id-not-integer` | error | an outcome `id` isn't a canonical non-negative integer string |
| `stakeengine-outcome-weight-not-integer` | error | an outcome's `weight` isn't a whole number |
| `stakeengine-outcome-payout-multiplier-not-representable` | error | an outcome's `artifact.payoutMultiplier * cost * 100` isn't a non-negative safe integer |
| `stakeengine-outcome-events-invalid` | error | the events projector (standard or custom) threw while projecting an outcome's artifact — e.g. an event amount that isn't representable in Stake units |
| `stakeengine-outcome-events-not-json-safe` | error | the events projector's output for an outcome isn't canonical-JSON-safe — a `NaN`/`Infinity`, `bigint`, `symbol`, function, `undefined`, circular reference, or other non-JSON value (see `toCanonicalJson`) |

`StakeEngineExporter.exportToDirectory` runs the structural checks above first; if none of them are errors, it
then builds every mode fully in memory (running the events projector and the canonical-JSON check per outcome —
the last two codes above only ever surface at this stage) before writing anything at all. On any error-level
issue from either stage, nothing is written — the same "no partial export" guarantee as
`ParSheetExporter`/`GamePackageGenerator`.

## Rebuild safety — the whole directory is replaced atomically

A `StakeEngineExporter` export doesn't add/overwrite individual files in `--out` — it builds the *entire* output
into a fresh temporary sibling directory first, and only swaps it into place (a directory rename) once every
file has been written successfully. That has two consequences:

- **A failure anywhere before the swap — a validation error, a projector throwing, a disk write failing — leaves
  an existing `--out` directory completely untouched**, byte for byte; there's no window where a reader could
  see a half-written mix of old and new files.
- **A re-export starts from nothing, not from the previous directory's contents.** If a mode that was present in
  a prior export is missing from this run's `modes`, its `lookup_*.csv`/`books_*.jsonl.zst` are simply not
  written into the new directory, and the swap discards the old ones along with everything else — no stale
  per-mode files are ever left behind.

Because the whole directory is discarded and rebuilt this way, exporting into an existing `--out` is only
allowed when that directory is either empty or recognized as a prior `"pokie stakeengine export"` run's own
output (via that run's own `pokie-manifest.json`) — otherwise a caller pointing `--out` at an unrelated directory
by mistake would have it wiped wholesale. An unrecognized non-empty directory is refused outright, with nothing
touched. Conceptually the same rebuild-safety guarantee as `GamePackageGenerator`'s own (see
[Game Packages](game-packages.md)), just applied to a whole directory instead of a fixed list of filenames.

### How the swap itself fails safely

Re-exporting into an existing `--out` is really three filesystem operations, and each one has a distinct,
deliberate failure behavior:

1. **Move the existing directory aside** (to a `.stale-<random>` sibling). If this fails, `--out` was never
   touched — nothing to restore, just the leftover temp directory is cleaned up (best-effort) before the error
   propagates.
2. **Move the freshly-built temp directory into `--out`** — the actual publish step. If *this* fails, the old
   directory is restored back to `--out` (a third rename) before the error propagates, so the export still fails
   with `--out` exactly as it was, byte for byte. In the one truly unrecoverable case — the restore itself also
   fails — the thrown error names the `.stale-<random>` path the old directory's contents are still sitting at,
   so it can be renamed back by hand.
3. **Remove the now-superseded stale directory.** By this point the new export is already live at `--out` — a
   failure here is cosmetic, not a failed export: it's reported as a `stakeengine-stale-export-cleanup-failed`
   warning (not an error) in the result's `issues`, and the stale directory is simply left behind for manual
   cleanup rather than causing the whole export to be reported as failed.

Every one of these failure branches also guarantees the temp directory itself never lingers past the call that
created it (removed best-effort, without ever masking whichever error is actually being thrown/returned).

## CLI usage

```
pokie stakeengine export <config.json> [--out <dir>]
```

`<config.json>` lists one `WeightedOutcomeLibrary` JSON file per mode:

```json
{
    "modes": [
        {"modeName": "base", "cost": 1, "libraryPath": "./libraries/base.json"},
        {"modeName": "bonus", "cost": 100, "libraryPath": "./libraries/bonus.json"}
    ]
}
```

`libraryPath` entries resolve relative to `<config.json>`'s own directory. Default `--out` is `<config.json>`'s
directory plus `/stakeengine`.

## Programmatic usage

```ts
import {StakeEngineExporter} from "pokie";

const exporter = new StakeEngineExporter(pokieVersion);
const result = await exporter.exportToDirectory(
    [
        {modeName: "base", cost: 1, library: baseLibrary},
        {modeName: "bonus", cost: 100, library: bonusLibrary},
    ],
    "./stakeengine",
);

if (result.issues.some((issue) => issue.severity === "error")) {
    // nothing was written — inspect result.issues
} else {
    console.log(result.files); // every file this run wrote, relative to "./stakeengine"
}
```
