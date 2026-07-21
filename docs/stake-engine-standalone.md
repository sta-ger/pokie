[← Back to docs index](README.md)

# Stake Engine Standalone

`stakeengine/standalone/` reads and analyzes **any** Stake Engine outcome directory — `index.json`, per-mode
lookup CSV, per-mode zstd-compressed JSONL books — with **no `pokie-manifest.json` involved at any point**. This
is deliberately different from [Stake Engine Import](stake-engine-import.md), which only ever round-trips a
directory `"pokie stakeengine export"` itself produced (it requires that run's own manifest to recover
`betMode`/`stake`/provenance/`libraryId`, and fails outright without one). Standalone is for the other case: an
existing directory with no POKIE manifest and no history of a POKIE export at all — a third party's own Stake
Engine math-sdk output, or POKIE's own export with the manifest stripped.

## Why not just reuse the importer?

`StakeEngineImporter` reconstructs a full `WeightedOutcomeLibrary` — every outcome as a `RoundArtifact` with a
per-step win breakdown, `betMode`, `stake`, provenance. Building any of that requires POKIE-specific knowledge a
genuinely foreign export never carries: a fixed `reveal`/`win`/`finalWin` event vocabulary (see
[Stake Engine Export](stake-engine-export.md#events-a-generic-mechanic-agnostic-mapping)), a per-round win
breakdown, and a manifest to recover `betMode`/`stake` (Stake's own `index.json`/CSV/books never store either).
Standalone never attempts any of that. It normalizes into a much smaller canonical DTO and computes statistics
directly over it — no `RoundArtifact`/`WeightedOutcomeLibrary` is ever built.

## Data shapes

```ts
type StakeEngineOutcomeRecord = {
    readonly id: number;
    readonly weight: number;
    readonly payoutMultiplier: number; // Stake's own raw integer unit
    readonly ratio: number | undefined; // payoutMultiplier reversed to a stake-normalized ratio, at this mode's cost
    readonly events: readonly StakeEngineEvent[]; // normalized verbatim, no POKIE step model reconstructed
};

type StakeEngineStandaloneMode = {
    readonly modeName: string;
    readonly cost: number; // read straight off index.json -- the one place a manifest-less directory ever records it
    readonly outcomes: readonly StakeEngineOutcomeRecord[];
};
```

`ratio` is `payoutMultiplier` reversed via `convertStakeUnitsToRatio` (`ratio = payoutMultiplier / cost / 100`,
self-checked against the exact forward computation the same way [Stake Engine Import](stake-engine-import.md#stake-unit-reversal--explicit-never-rounded)
does) — `undefined` only when that reversal can't be guaranteed exact, which `StakeEngineOutcomeSourceReader`
reports as an informational, non-blocking `stakeengine-standalone-outcome-ratio-not-representable` warning rather
than failing the whole read (the raw `payoutMultiplier` integer is unaffected either way).

## Reading and validating

`StakeEngineOutcomeSourceReader` (implementing `StakeEngineOutcomeSourceReading`) is the only place this pipeline
touches the filesystem. It assembles a `StakeEngineStandaloneBundle` (index.json plus every mode's own CSV/books,
read but not yet validated) and hands it to `StakeEngineStandaloneValidator` — pure, in-memory, never touches
disk. Same all-or-nothing discipline as the importer: any error-level issue means `modes` comes back empty and
every issue is in `issues`.

Validation covers `index.json`'s own field shapes, mode-name rules (format, duplicates, case-insensitive
collisions), path-safety of every mode's own filenames (`resolveSafeStakeEngineFilePath` — absolute paths,
`..`/nested paths, and anything resolving outside the directory are refused), and per-mode CSV/books cross-checks
matched by id. One deliberate difference from `StakeEngineImportValidator`: a mode's own `events`/`weights`
filename is **never** required to match a `books_<name>.jsonl.zst`/`lookup_<name>.csv` naming convention — that's
`"pokie stakeengine export"`'s own convention, not part of Stake's actual schema, and a genuinely foreign
directory has no reason to follow it. Whatever `index.json` itself names (subject to path-safety) is trusted.
Issue codes are prefixed `stakeengine-standalone-*`, distinct from both `stakeengine-import-*` (manifest-bearing)
and `stakeengine-*`/`stakeengine-export-*` (export-side).

## `isStakeEngineOutcomeDirectory`

A cheap upfront classifier for a caller deciding which pipeline to run — checks only that `index.json` exists,
parses, and has a non-empty `modes` array. It never validates CSV/books or per-outcome data; use
`StakeEngineOutcomeSourceReader.readFromDirectory` for the full picture.

## Exact weighted analysis

`StakeEngineStandaloneAnalyzer` computes exact — not sampled — statistics directly over a mode's own normalized
`StakeEngineOutcomeRecord`s, mirroring `WeightedOutcomeLibraryAnalyzer`'s own semantics where the underlying data
supports it (`rtp`/`hitFrequency`/`variance`/`standardDeviation` are defined over each outcome's own
stake-normalized `ratio`, the same normalize-before-multiply overflow-avoidance discipline that class uses):

```ts
type StakeEngineStandaloneModeAnalysis = {
    readonly modeName: string;
    readonly cost: number;
    readonly outcomeCount: number;
    readonly totalWeight: number;
    readonly rtp: number;
    readonly hitFrequency: number;
    readonly zeroWinFrequency: number;
    readonly variance: number;
    readonly standardDeviation: number;
    readonly maxPayoutMultiplier: number;
    readonly maxRatio: number;
    readonly maxWinProbability: number;
    readonly nonInvertibleRatioCount: number;
    readonly payoutDistribution: readonly {payoutMultiplier: number; ratio: number | undefined; probability: number}[];
    readonly eventClassificationBreakdown: readonly {category: string; occurrenceFrequency: number; averageOccurrencesPerOutcome: number}[];
};
```

`hitFrequency` is computed straight off the raw integer `payoutMultiplier > 0` (always exact, no reversal
involved). `rtp`/`variance` fall back to an unchecked `payoutMultiplier / cost / 100` for the rare outcome whose
`ratio` wasn't exactly invertible — `nonInvertibleRatioCount` reports how many, so a caller always knows whether a
mode's `rtp`/`variance` carry a small amount of float imprecision, never silently. `payoutDistribution` is an
exact probability mass function keyed by the raw `payoutMultiplier` (never binned, never merged by float
comparison on `ratio`).

## Pluggable event classification

Stake's own math-sdk doesn't standardize an event vocabulary beyond "a list of dictionary objects" — every game
defines its own mechanic-specific one. `eventClassificationBreakdown` is driven by a pluggable
`StakeEngineEventClassifying`:

```ts
type StakeEngineEventClassification = {readonly category: string};

interface StakeEngineEventClassifying {
    classify(event: StakeEngineEvent): StakeEngineEventClassification;
}
```

`StakeEngineStandardEventClassifier` (the default) recognizes POKIE's own `reveal`/`win`/`finalWin` structural
vocabulary as their own category and classifies everything else as `"feature"` — a reasonable starting point only
for a directory that happens to already speak that convention, never assumed for a genuinely foreign export.
Implement `StakeEngineEventClassifying` directly for a foreign game's own vocabulary (e.g. mapping
`"anticipation"`/`"multiplierApplied"`/`"tumble"` to whatever categories are useful) and pass it to
`StakeEngineStandaloneAnalyzer`'s constructor. Classification is purely advisory — it only ever feeds the
breakdown, never gates whether an outcome parses successfully, and never rejects an event it doesn't recognize.

`occurrenceFrequency` is the exact weighted probability of drawing an outcome that carries at least one event of
that category; `averageOccurrencesPerOutcome` is the weighted mean count of that category's events per outcome
(so a category that always fires exactly once per outcome has `occurrenceFrequency === averageOccurrencesPerOutcome`,
while one that can fire multiple times per outcome has the latter `>=` the former).

## CLI usage

```
pokie stakeengine analyze <stakeDir> [--format json] [--out <file>]
```

`<stakeDir>` is any Stake Engine outcome directory, with or without a `pokie-manifest.json`. Prints a
per-mode summary by default; `--format json` prints (and `--out <file>` writes) the machine-readable
`{stakeDir, issues, analysis}` shape — `analysis` is `undefined` whenever any issue is error-severity, the same
"nothing built on error" contract as `pokie stakeengine import`. Exit code is non-zero on any error-level issue.

The CLI always uses the default `StakeEngineStandardEventClassifier`; supply a custom `StakeEngineEventClassifying`
programmatically for a foreign event vocabulary (see above) — CLI-level custom classifier wiring is left for a
later increment.

## Programmatic usage

```ts
import {StakeEngineOutcomeSourceReader, StakeEngineStandaloneAnalyzer} from "pokie";

const readResult = await new StakeEngineOutcomeSourceReader().readFromDirectory("./some-stake-dir");

if (readResult.issues.some((issue) => issue.severity === "error")) {
    // nothing was normalized -- inspect readResult.issues
} else {
    const analysis = new StakeEngineStandaloneAnalyzer().analyze(readResult);
    console.log(analysis.modes[0].rtp);
}
```

## What this vertical slice deliberately leaves for later

This is the first standalone increment: read, normalize, validate, and analyze one directory in isolation. Diffing
two standalone-analyzed directories against each other (the standalone counterpart to `pokie diff`) is left for a
following, small, separate step — nothing here is built assuming it in advance.
