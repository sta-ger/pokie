[← Back to docs index](README.md)

# Stake Engine Import

`stakeengine/` also imports a Stake Engine export directory (`index.json`, per-mode lookup CSV, per-mode
zstd-compressed JSONL books, and its own sibling `pokie-manifest.json`) back into one
[`WeightedOutcomeLibrary`](weighted-outcome-library.md) per mode — the reverse of
[Stake Engine Export](stake-engine-export.md). Like every exporter/importer in the project, it never introduces
a second calculation path: every reconstructed number already existed in the Stake export, converted back, never
guessed.

## Lossy vs. lossless — read this before anything else

Stake's own `index.json`/CSV/books never store `RoundArtifact.roundId`, the real per-round win breakdown
(individual line/cluster wins, positions, multiplier breakdowns), or `provenance.pokieVersion` (the `pokie`
version that *built* the original artifact, as opposed to the manifest's own `pokieVersion`, the version that
*ran the export*) — these three are genuinely unrecoverable, by design of the Stake format itself, not a gap in
this importer. Rather than invent plausible-looking stand-ins, the importer uses clearly disclosed substitutes:

| Field | What happens on import |
|---|---|
| `roundId` | synthesized deterministically as `` `stakeengine-import:<modeName>:<id>` `` |
| `wins` | one synthetic win component per step with `totalWin > 0`, flagged via `metadata.stakeEngineImportSynthetic: true` — see below |
| `provenance.pokieVersion` | substituted with `pokie-manifest.json`'s own `pokieVersion` |

Everything else round-trips **exactly**: outcome `id`/`weight`/`payoutMultiplier`, mode `cost`, `betMode`/
`stake`, `libraryId`, and `provenance.game`/`configHash` — all recovered from `pokie-manifest.json`, the one
place they survive (Stake's own files never carry them at all).

**Do not expect `computeWeightedOutcomeLibraryHash(importedLibrary)` to match `pokie-manifest.json`'s own recorded
`libraryHash`** — it won't, because `roundId`/`wins`/`provenance.pokieVersion` differ from the original by design.
`StakeEngineImporter` reports this as an expected, informational `stakeengine-import-library-hash-differs-from-manifest`
issue on every successful mode, not a warning or error.

### The real round-trip property

Since the original pre-export library can't be reproduced bit-for-bit, don't test for that. The property that
**does** hold, and is what this importer is actually for:

```
stakeDir → import → re-export (same modeName/cost) → byte-identical index.json/lookup_*.csv/books_*.jsonl.zst
```

This holds because: outcome ids/weights/payoutMultiplier survive exactly (integer, reversed without hidden
rounding — see below); the reconstructed events, when re-projected by `StakeEngineRoundEventsProjector`, reproduce
the exact same event sequence that was read from the books; and `betMode`/`stake`/`cost`/provenance/`libraryId`
come back exactly from the manifest. `StakeEngineImportResult.modes` is typed as `StakeEngineExportModeInput<T>[]`
— the exporter's own input type — specifically so this round trip is a one-line operation, both in code and from
the CLI (`pokie stakeengine import <stakeDir>` writes exactly what `pokie stakeengine export` reads back in).

## `pokie-manifest.json` is required

Import only ever round-trips a directory `"pokie stakeengine export"` itself produced — there is no path for
importing a hand-crafted or foreign Stake package with caller-supplied fallback fields. Without a recognized
manifest (`generatedBy === "pokie stakeengine export"`), `betMode`/`stake`/`provenance`/`libraryId` are genuinely
unrecoverable, and reporting `stakeengine-import-manifest-missing`/`stakeengine-import-manifest-unrecognized`
is the honest outcome — not inventing stand-in values for them.

## Stake unit reversal — explicit, never rounded

The forward conversion is `stakeUnits = ratio * cost * 100` (see [Stake Engine Export](stake-engine-export.md#stake-unit-conversion--explicit-never-rounded)).
The reverse is `ratio = stakeUnits / cost / 100` — but a plain division can't, on its own, guarantee no *hidden*
rounding slipped in via float error. So every reversal (`convertStakeUnitsToRatio`/`convertStakeUnitsToRawAmount`)
self-checks by re-running the *exact* forward computation on the candidate result and requiring it to land back
on the original integer exactly; if it doesn't, the value is reported as
`stakeengine-import-payout-multiplier-not-invertible`/`stakeengine-import-win-amount-not-invertible` rather than
silently accepted with a slightly-off ratio. A `payoutMultiplier`/amount that round-tripped through
`pokie stakeengine export` at a given `cost` always reverses cleanly; only a hand-tampered or genuinely corrupted
file would fail this check.

## Reconstructing events: a single forward scan

A book line's `events` were produced by `StakeEngineRoundEventsProjector` in an exact, deterministic order:
`[reveal, stepFeature*, win?]` repeated per step, then `roundOnlyFeature*`, then exactly one `finalWin`, always
last. `StakeEngineRoundEventsImporter` reverses this with a single scan, no lookahead:

| Stake event | Reconstructed as |
|---|---|
| `{type: "reveal", board}` | opens a new step, `screen: board` |
| `{type: "win", amount}` | closes that step's own feature-collecting window, sets `totalWin` (amount reversed to raw currency) |
| any other type | a feature event (`{type, data}}`, `data` reconstructed from every key except `index`/`type` — the exact inverse of the forward projector's `{...data, type}` spread) — attributed to the currently-open step if its window hasn't closed yet, otherwise to the round |
| `{type: "finalWin", amount, payoutMultiplier}` | closes the round: reversed `totalWin`/`payoutMultiplier` (`amount`/`payoutMultiplier` must be numerically equal, exactly as the forward projector always writes them), cross-checked against the sum of the reconstructed steps' own `totalWin` |

Two disclosed, pre-existing limitations of the export encoding itself (neither is something this importer can
detect or work around):

- `"reveal"`/`"win"`/`"finalWin"` are reserved by convention only in the forward projector's vocabulary — a
  custom `RoundArtifactFeatureEvent` literally typed one of those would be indistinguishable on import from the
  real structural event.
- A step's own feature-collecting window closes on its own `"win"` event, or — for every step but the last — on
  the *next* step's `"reveal"` regardless of win. The **last** step has neither signal if it never wins: any
  feature events between its `"reveal"` and the round's `"finalWin"` are then genuinely ambiguous between "the
  last step's own features" and "round-level-only features" (the event stream carries no explicit count of how
  many features belong to a step). This never affects a round whose last step has a nonzero win.

## Reconstructing `wins`: one synthetic component per step

`RoundArtifactValidator`/`buildRoundStepArtifact` both require `totalWin` to exactly equal the sum of
`wins[].winAmount` — there is no way to build a valid step with `totalWin > 0` and empty `wins`. Since the real
win breakdown is gone, the importer builds exactly one placeholder `WinComponent` per step with a nonzero
`totalWin`, carrying just the recovered amount:

```ts
export const STAKE_ENGINE_IMPORT_SYNTHETIC_METADATA_KEY = "stakeEngineImportSynthetic";
```

Its `winningPositions` is deliberately empty (never invented positions that were never real) and its `metadata`
always carries `{stakeEngineImportSynthetic: true}` — the documented way to tell a reconstructed win apart from
a real one downstream. This is the one place the importer knowingly fabricates structure (not data) to satisfy
`RoundArtifact`'s own invariants; it's never mistaken for a real win breakdown.

## Validation

Two layers, mirroring the exporter's own "validate everything before building" discipline.

**Structural, cross-file** (`StakeEngineImportValidator`, pure/in-memory — never touches disk itself):

| Code | Meaning |
|---|---|
| `stakeengine-import-index-missing` | `index.json` doesn't exist |
| `stakeengine-import-index-malformed` | `index.json` doesn't parse, or doesn't match `{modes: [{name, cost, events, weights}]}` (empty/duplicate names, wrong types) |
| `stakeengine-import-manifest-missing` | `pokie-manifest.json` doesn't exist |
| `stakeengine-import-manifest-unrecognized` | it exists but doesn't parse, or wasn't written by `"pokie stakeengine export"` |
| `stakeengine-import-manifest-schema-version-unsupported` | its `schemaVersion` isn't the currently supported one |
| `stakeengine-import-mode-missing-in-manifest` / `stakeengine-import-mode-missing-in-index` | a mode name is in one file but not the other |
| `stakeengine-import-mode-cost-mismatch` / `stakeengine-import-mode-events-filename-mismatch` / `stakeengine-import-mode-weights-filename-mismatch` | `index.json` and the manifest disagree on a mode's `cost`/filenames |
| `stakeengine-import-csv-missing` / `stakeengine-import-books-missing` | a mode's own file is absent |
| `stakeengine-import-csv-malformed-row` / `stakeengine-import-books-malformed-line` | a row/line isn't the expected shape |
| `stakeengine-import-outcome-id-not-integer` | a CSV row's or book line's `id` isn't a canonical non-negative integer |
| `stakeengine-import-outcome-weight-not-positive-integer` | a CSV row's `weight` isn't a positive integer |
| `stakeengine-import-csv-books-count-mismatch` / `stakeengine-import-csv-books-id-set-mismatch` | the CSV and books disagree on how many outcomes there are, or which ids exist — matched **by id**, never by row position |
| `stakeengine-import-csv-books-payout-multiplier-mismatch` | the same id's CSV and book `payoutMultiplier` disagree |
| `stakeengine-import-outcome-count-mismatch` | the manifest's own `outcomeCount` disagrees with the actual row/line count |

**Per-outcome reconstruction** (only reached once every structural check above passes with no errors):

| Code | Meaning |
|---|---|
| `stakeengine-import-events-empty` / `stakeengine-import-events-missing-reveal` / `stakeengine-import-events-missing-final-win` / `stakeengine-import-events-final-win-not-last` | the events array doesn't have the required `[reveal, ..., finalWin]` shape |
| `stakeengine-import-events-index-out-of-sequence` | an event's `index` doesn't match its position |
| `stakeengine-import-events-reveal-shape-invalid` / `stakeengine-import-events-win-shape-invalid` / `stakeengine-import-events-final-win-shape-invalid` | a structural event has the wrong keys, or a non-integer amount/board |
| `stakeengine-import-events-unexpected-win` | a `"win"` event with no open step, or a step that already had one |
| `stakeengine-import-win-amount-not-invertible` / `stakeengine-import-payout-multiplier-not-invertible` | an amount/multiplier can't be reversed without hidden rounding at this mode's `cost` |
| `stakeengine-import-final-win-amount-payout-multiplier-mismatch` | `finalWin.amount !== finalWin.payoutMultiplier` |
| `stakeengine-import-total-win-mismatch` | the reconstructed steps' own `totalWin` sum disagrees with the round's own reconstructed `totalWin` |
| `stakeengine-import-book-line-payout-multiplier-mismatch` | a book line's own top-level `payoutMultiplier` disagrees with its own events' `finalWin.payoutMultiplier` |
| `stakeengine-import-outcome-events-invalid` | the events importer (standard or custom) threw for any other reason |
| `stakeengine-import-outcome-artifact-invalid` / `stakeengine-import-library-invalid` | the reconstructed data failed `buildRoundArtifact`/`buildWeightedOutcomeLibrary`'s own checks |
| `stakeengine-import-library-hash-differs-from-manifest` | **info**, always present on a successful mode — see "Lossy vs. lossless" above |

`StakeEngineImporter.importFromDirectory` runs the structural checks first; on any error, nothing is reconstructed
at all (`{modes: [], manifest: undefined, issues}`). Otherwise it reconstructs every mode fully in memory; any
per-outcome error still means the whole import reports nothing built — the same all-or-nothing contract as
`StakeEngineExporter.exportToDirectory`.

## CLI usage

```
pokie stakeengine import <stakeDir> [--out <dir>]
```

Writes exactly the shape `pokie stakeengine export` reads back in — `<outDir>/libraries/<modeName>.json` per
mode, plus `<outDir>/config.json` naming them:

```json
{
    "modes": [
        {"modeName": "base", "cost": 1, "libraryPath": "./libraries/base.json"},
        {"modeName": "bonus", "cost": 100, "libraryPath": "./libraries/bonus.json"}
    ]
}
```

Default `--out` is `<stakeDir>` plus `-imported`. On any error-level issue, nothing is written and the exit code
is non-zero. Feed the result straight back into `pokie stakeengine export <outDir>/config.json` to exercise the
round-trip property above.

## Programmatic usage

```ts
import {StakeEngineExporter, StakeEngineImporter} from "pokie";

const importResult = await new StakeEngineImporter().importFromDirectory("./stakeengine");

if (importResult.issues.some((issue) => issue.severity === "error")) {
    // nothing was reconstructed — inspect importResult.issues
} else {
    // importResult.modes is StakeEngineExportModeInput<T>[] — feed it straight back into the exporter.
    await new StakeEngineExporter(pokieVersion).exportToDirectory(importResult.modes, "./stakeengine-reexported");
}
```
