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

## Integer strictness

Stake's own CSV/JSONL columns are `uint64` — no fractional weights or payout multipliers. Rather than silently
scale and round POKIE's own (finite, `>= 0`, but not necessarily integer) `weight`/`artifact.payoutMultiplier`
values — which would be a second, lossy calculation path — the exporter requires them to already be whole
numbers, and rejects the export otherwise (see Validation below). If your math model produces fractional
multipliers, scale them to integers (e.g. cents/thousandths of a unit) before building the
`WeightedOutcomeLibrary` in the first place, upstream of this exporter.

The same reasoning applies to `WeightedOutcome.id`: Stake's own "id" column is an integer, but a `WeightedOutcome`'s
`id` is always a caller-supplied string (see [Weighted Outcome Library](weighted-outcome-library.md)). Rather than
invent a mapping (a hash, an incidental array index, ...), the exporter requires the string to already be the
canonical decimal form of a safe non-negative integer (`"0"`, `"1"`, `"2"`, ... — not `"01"`, `"-1"`, or `"1.5"`)
and simply parses it.

## Events: a generic, mechanic-agnostic mapping

Stake's own math-sdk doesn't standardize an event schema beyond "a list of dictionary objects" — every game
defines its own mechanic-specific vocabulary (anticipation, tumble-specific fields, ...). `StakeEngineRoundEventsProjector`
therefore only maps what a `RoundArtifact` itself already models generically, implementing the same
`RoundArtifactProjector<T, TOutput>` extension point `PokieJsonRoundArtifactProjector` uses (see
[Round Artifacts](round-artifacts.md)):

| Round Artifact | Stake event |
|---|---|
| each `RoundStepArtifact` (in order) | `{type: "reveal", board: step.screen}` |
| that step's own `featureEvents` (in order) | passed through as-is — spread into the event alongside their own `type` |
| that step, if `totalWin > 0` | `{type: "win", amount: step.totalWin}` |
| any round-level-only `featureEvents` (passed directly to `buildRoundArtifact`'s own `featureEvents` option, not attached to a step) | same passthrough |
| the round, always, exactly once, last | `{type: "finalWin", amount: artifact.totalWin, payoutMultiplier: artifact.payoutMultiplier}` |

Every event is stamped with its own `index` (its position in the final sequence) last, so it always reflects the
true position even if a passed-through feature event's own data happened to carry a colliding `index` field.

This is a deliberate non-goal: no invented game-specific event vocabulary. A game with mechanic-specific events
Stake's own front-end expects (anticipation reels, per-symbol tumble animations, ...) needs its own projector —
implement `RoundArtifactProjector<T, readonly StakeEngineEvent[]>` directly, the same way you'd implement it for
any other custom representation.

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
| `stakeengine-mode-name-case-collision` | warning | two `modeName`s differing only in case — would collide on a case-insensitive filesystem |
| `stakeengine-mode-cost-invalid` | error | `cost` isn't a finite number `> 0` |
| `stakeengine-cross-mode-provenance-mismatch` | error | a mode's game id/version, `configHash`, or `pokieVersion` doesn't match the export's other modes (`betMode`/`stake` are expected to differ per mode, so those are excluded from this check) |
| `stakeengine-outcome-id-not-integer` | error | an outcome `id` isn't a canonical non-negative integer string |
| `stakeengine-outcome-weight-not-integer` | error | an outcome's `weight` isn't a whole number |
| `stakeengine-outcome-payout-multiplier-not-integer` | error | an outcome's `artifact.payoutMultiplier` isn't a whole number |

`StakeEngineExporter.exportToDirectory` runs this validator first and, on any error-level issue, writes nothing
at all — the same "no partial export" guarantee as `ParSheetExporter`/`GamePackageGenerator`. It additionally
cross-checks, before any file is written, that every lookup CSV row's `payoutMultiplier` exactly matches its
corresponding book line's `payoutMultiplier` (both come from the very same outcome, so a mismatch — always
unreachable given a validator pass with no errors — throws `StakeEngineExportInvariantError` rather than writing
inconsistent files).

## Rebuild safety

Re-running an export into the same `--out` directory overwrites cleanly: `pokie-manifest.json`'s own `files`
field lists exactly what a prior "pokie stakeengine export" run wrote there, so a later run recognizes its own
output and replaces it. Exporting into a directory that already contains a file it's *about to write* — but that
file isn't recognized as its own prior output — is refused outright, with nothing written; a directory that
merely happens to contain unrelated files is left alone. Mirrors `GamePackageGenerator`'s own rebuild-safety
check (see [Game Packages](game-packages.md)).

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
