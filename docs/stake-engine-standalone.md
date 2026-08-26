[← Back to docs index](README.md)

# Stake Engine Standalone

`stakeengine/standalone/` reads and analyzes **any** Stake Engine outcome directory — `index.json`, per-mode
lookup CSV, per-mode zstd-compressed JSONL books — with **no `pokie-manifest.json` involved at any point**. This
is deliberately different from [Stake Engine Import](stake-engine-import.md), which only ever round-trips a
directory produced by POKIE's Stake Engine export workflow (it requires that run's own manifest to recover
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
    readonly weight: bigint | number; // CSV weights are uint64; the reader always supplies bigint (see below)
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

`weight` is `bigint | number` because Stake's own lookup CSV weight column is a uint64 — values that routinely
exceed `Number.MAX_SAFE_INTEGER`. `StakeEngineOutcomeSourceReader` always supplies `bigint`; the `number` arm
exists only for callers constructing the DTO themselves (e.g. hand-built test fixtures). `StakeEngineStandaloneAnalyzer`
accepts a `bigint` anywhere in the positive uint64 range or a `number` that's a safe positive integer, and throws
otherwise — it never silently truncates an out-of-range weight.

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
POKIE's export workflow convention, not part of Stake's actual schema, and a genuinely foreign
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
type StakeEngineStandaloneExactDecimal = number | string;

type StakeEngineStandaloneModeAnalysis = {
    readonly modeName: string;
    readonly cost: number;
    readonly outcomeCount: number;
    readonly totalWeight: StakeEngineStandaloneExactDecimal;
    readonly rtp: number;
    readonly hitFrequency: number;
    readonly zeroWinFrequency: number;
    readonly variance: number;
    readonly standardDeviation: number;
    readonly maxPayoutMultiplier: number;
    readonly maxRatio: number;
    readonly maxWinProbability: number;
    readonly nonInvertibleRatioCount: number;
    readonly payoutDistribution: readonly {payoutMultiplier: number; weight: StakeEngineStandaloneExactDecimal; ratio: number | undefined; probability: StakeEngineStandaloneExactDecimal}[];
    readonly eventClassificationBreakdown: readonly {category: string; occurrenceFrequency: StakeEngineStandaloneExactDecimal; averageOccurrencesPerOutcome: StakeEngineStandaloneExactDecimal}[];
};
```

### Canonical decimal-string semantics (`StakeEngineStandaloneExactDecimal`)

`totalWeight`, `payoutDistribution[].weight`, `payoutDistribution[].probability`, and both `eventClassificationBreakdown[]` fields are computed
from a uint64 weight total that can exceed what a JS `number` represents exactly. Every one of these is typed
`StakeEngineStandaloneExactDecimal = number | string`, and the analyzer chooses between the two arms itself, never
leaving it to the caller:

- **`number`** whenever the exact value is representable without loss (small totals, and fractions whose numerator
  and denominator both fit under `Number.MAX_SAFE_INTEGER`).
- **canonical fixed-point decimal `string`** otherwise — a plain base-10 string (`"12345678901234567890"`,
  `"0.1234..."` up to 40 fractional digits), never scientific notation, never rounded, never a `bigint` (JSON has
  no `bigint`, so a value that must cross a JSON boundary — CLI `--format json`, `--out <file>` — is a string, not
  a type that would fail to serialize).

A caller that only needs an approximate value can `Number(...)` either arm directly; a caller that needs the exact
value must branch on `typeof` and parse the string arm as an arbitrary-precision decimal itself (POKIE deliberately
never gives you back a `bigint` here — see above). This mirrors, at the standalone DTO layer, the same
never-silently-lossy discipline `convertRatioToStakeUnits` uses on the export side (see
[Stake Engine Export](stake-engine-export.md#stake-unit-conversion--explicit-never-rounded)): a value that can't be
trusted at `number` precision is never returned as one.

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

## Diffing two analyses

`StakeEngineStandaloneAnalysisDiffer` (implementing `StakeEngineStandaloneAnalysisDiffing`) is the standalone
counterpart to `pokie diff` — it compares two already-computed `StakeEngineStandaloneAnalysis` results (e.g. before
vs. after a math-model change) mode-by-mode, matched by `modeName`:

```ts
type StakeEngineStandaloneAnalysisMetricDiff = {left: number; right: number; delta: number; percentDelta: number | null};

type StakeEngineStandaloneAnalysisDiff = {
    stakeDir: {left: string; right: string};
    perMode: Record<string, StakeEngineStandaloneModeAnalysisDiff>; // one entry per mode name present in *both* inputs
    onlyInLeft: string[]; // mode names present only in the left analysis
    onlyInRight: string[]; // mode names present only in the right analysis
};
```

Every scalar metric (`rtp`, `hitFrequency`, `zeroWinFrequency`, `variance`, `standardDeviation`,
`maxPayoutMultiplier`, `maxRatio`, `maxWinProbability`, `nonInvertibleRatioCount`) diffs to a
`StakeEngineStandaloneAnalysisMetricDiff` — `percentDelta` is `null` when `left` is `0` (nothing to take a percent
of). `payoutDistribution`/`eventClassificationBreakdown` diff to `{left, right}` pairs (each `null` when a bucket
or category is missing from that side) rather than a computed `delta` — both can carry a canonical decimal
`string` (see above), and a delta over an arbitrary-precision decimal string is intentionally left to the caller
rather than reimplemented as float subtraction here. `warnings` flags material `rtp`/`hitFrequency`/`maxRatio`
swings past a constructor-configurable threshold (`DEFAULT_RTP_DELTA_WARNING_THRESHOLD` and friends), the same
"flag it, don't fail on it" contract `pokie diff` itself uses.

```ts
import {StakeEngineStandaloneAnalysisDiffer} from "pokie";

const diff = new StakeEngineStandaloneAnalysisDiffer().diff(beforeAnalysis, afterAnalysis);
console.log(diff.perMode.base.warnings);
```

## What this vertical slice deliberately leaves for later

This vertical slice reads, normalizes, validates, analyzes, and diffs one directory (or a pair of directories) in
isolation. `pokie stakeengine analyze` and `pokie stakeengine diff` expose that same pipeline on the command line;
custom event-classifier wiring remains programmatic so the CLI never pretends to understand a foreign game's
mechanic-specific event vocabulary.
