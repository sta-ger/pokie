[← Back to docs index](README.md)

# Outcome Library Bundle

`weightedoutcome/bundle/` persists a canonical [`WeightedOutcomeLibrary`](weighted-outcome-library.md) (one per
mode) as a directory bundle — a small manifest, a small per-mode index, and one streaming JSONL file of outcomes
per mode — instead of the single, whole-file JSON document `PokieJsonWeightedOutcomeLibraryProjector` produces.
This is the one canonical, on-disk source both the [pre-generated runtime](pregenerated-runtime.md) and the
[Stake Engine exporter](stake-engine-export.md) load a `WeightedOutcomeLibrary` from — both call the same
`loadWeightedOutcomeLibraryFromBundle` function, so they can never end up reading different bytes or disagreeing
about what a bundle contains.

## Why a bundle, not one JSON file

A real game's outcome library can enumerate a very large number of distinct outcomes, each carrying its own
`RoundArtifact`. Loading that as a single JSON document means holding every outcome in memory just to read one,
or to serve one weighted draw. This bundle format is built around avoiding that:

- **The writer streams** — one canonical-JSON line per outcome, written directly to disk one at a time, never
  building one giant string for a mode's whole outcomes file.
- **The reader supports three genuinely different access patterns**, none of which require loading everything:
  - `iterateModeOutcomes` — full sequential streaming, one outcome in memory at a time.
  - `readOutcomeById` / `drawOutcome` — exactly one outcome loaded, via the mode's own small index.
  - `readLibrary` — the "give me everything" convenience a caller that genuinely needs the whole
    `WeightedOutcomeLibrary` (the Stake exporter, the pre-generated runtime) uses.
- **The validator has a shallow mode** that never opens an outcomes file's content at all — only the manifest and
  each mode's own small index, so validating a bundle doesn't itself defeat the point of the format.

## Bundle directory layout

```
<bundleDir>/
  manifest.json              # OutcomeLibraryBundleManifest
  index_<modeName>.json      # OutcomeLibraryBundleModeIndex, one per mode
  outcomes_<modeName>.jsonl  # one canonical-JSON WeightedOutcome<T> per line, one per mode
```

`manifest.json` carries the "who/what version/when" provenance stamp every generated-artifact manifest in this
codebase uses (`schemaVersion`/`generatedBy`/`pokieVersion`/`generatedAt`, matching
[`StakeEngineManifest`](stake-engine-export.md)'s own convention), plus one entry per mode:

```ts
type OutcomeLibraryBundleManifestModeEntry = {
    modeName: string;
    betMode: string;
    stake: number;
    libraryId: string;
    libraryHash: string;                    // computeWeightedOutcomeLibraryHash(library) — reused as-is
    outcomeCount: number;
    totalWeight: number;
    analysis: WeightedOutcomeLibraryAnalysis; // WeightedOutcomeLibraryAnalyzer output, embedded verbatim
    indexFile: string;                       // "index_<modeName>.json"
    outcomesFile: string;                    // "outcomes_<modeName>.jsonl"
};
```

`index_<modeName>.json` is deliberately small — every field is a number or a short string, never a full
`RoundArtifact` — so it's always cheap to load in full, even for a library with millions of outcomes:

```ts
type OutcomeLibraryBundleIndexEntry = {
    id: string;
    weight: number;
    byteOffset: number; // where this line's JSON begins in the outcomes file
    byteLength: number; // exact byte length of the line's JSON (excludes the trailing "\n")
};
```

`libraryHash`/`librarySchemaVersion` are duplicated onto the index (not only the manifest), so a caller that only
ever needs one mode — the pre-generated runtime, typically — can load and self-identify a mode from just its own
`index_<modeName>.json` + `outcomes_<modeName>.jsonl`, without ever reading `manifest.json`.

## Determinism, hashing, and metrics — no second calculation path

Every persisted file/line uses `toCanonicalJson`, the same canonical serializer used everywhere else in this
codebase (deterministic key order, rejects anything that isn't losslessly JSON-safe). `libraryHash` is
`computeWeightedOutcomeLibraryHash(library)` — the exact same function used by
`PokieJsonWeightedOutcomeLibraryProjector` and every other consumer of a `WeightedOutcomeLibrary`'s hash — and
`analysis` is `WeightedOutcomeLibraryAnalyzer`'s own output, embedded verbatim. Both are computed once, directly
from the in-memory `WeightedOutcomeLibrary` the writer was given, before/while streaming it to disk — never a
second, differently-derived value.

Each outcome's own JSONL line is written in the same canonically-sorted-by-id order
`buildWeightedOutcomeLibrary` already produces, so index-entry position, JSONL line order, and
`library.outcomes` order all agree.

## Streaming reader

```ts
interface OutcomeLibraryBundleReading<T extends string | number = string> {
    readManifest(bundleDir: string): Promise<OutcomeLibraryBundleManifest>;
    readModeIndex(bundleDir: string, modeName: string): Promise<OutcomeLibraryBundleModeIndex>;
    iterateModeOutcomes(bundleDir: string, modeName: string): AsyncIterable<WeightedOutcome<T>>;
    readOutcomeById(bundleDir: string, modeName: string, id: string): Promise<WeightedOutcome<T> | undefined>;
    drawOutcome(bundleDir: string, modeName: string, randomSource: WeightedOutcomeRandomSource): Promise<WeightedOutcome<T>>;
    readLibrary(bundleDir: string, modeName: string): Promise<WeightedOutcomeLibrary<T>>;
}
```

- `iterateModeOutcomes` streams the outcomes file line by line (via Node's `readline` over a read stream) —
  the one place in this codebase that reads a file as a true, never-buffer-the-whole-thing async stream, since
  that's exactly what "never materialize the whole file" sequential reading requires.
- `readOutcomeById` binary-searches the mode's own small index (already sorted by id) for the matching entry,
  then does a single `fs.read` for exactly that byte range — never touching any other part of the outcomes file.
- `drawOutcome` picks a winning outcome by walking exact integer cumulative weights against
  `randomSource.nextInt(totalWeight)` — the same algorithm
  [`WeightedOutcomeSelector`](pregenerated-runtime.md) uses, deliberately mirrored rather than called directly
  (that class's own type requires every outcome's full `RoundArtifact`, which is exactly what a streaming,
  index-only weighted draw exists to avoid loading) — over the index's own entries, then loads exactly the one
  winning outcome via `readOutcomeById`. A dedicated test cross-checks this against `WeightedOutcomeSelector`'s
  own pick for the same inputs across many seeds, so the two can never silently diverge.
- `readLibrary` drains `iterateModeOutcomes` into `buildWeightedOutcomeLibrary` — the same builder every other
  in-memory library goes through, so the result carries the exact same validation/sort/freeze guarantees as any
  other `WeightedOutcomeLibrary`. This is the one shared "give me everything" path both integration points below
  call.

Assumes an already-valid bundle (see Validation below for a bundle from an untrusted source) and throws rather
than returning diagnostics — the same "assume already validated, fail fast on a genuine surprise" contract
`WeightedOutcomeSelector` has toward a `WeightedOutcomeLibrary`.

## Streaming writer

```ts
interface OutcomeLibraryBundleWriting<T extends string | number = string> {
    writeToDirectory(modes: readonly OutcomeLibraryBundleModeInput<T>[], outDir: string): Promise<OutcomeLibraryBundleWriteResult>;
}
```

Takes an already-built `WeightedOutcomeLibrary<T>` per mode (mirrors `StakeEngineExportModeInput` — there's no
`cost` field here, since that's Stake's own bet-cost multiplier, meaningless to this generic format). Runs
`WeightedOutcomeLibraryValidator` against every mode's library (always, never bypassed) plus a mode-name/
cross-mode-provenance check before writing anything — the same "preflight everything, then publish" discipline
`StakeEngineExporter` uses. The whole output directory is then published atomically via the same
`publishDirectoryAtomically` helper `StakeEngineImportWriter` uses: built into a fresh temporary sibling
directory first, swapped into place only once every file has been written successfully. A failure anywhere
before the swap leaves an existing `outDir` completely untouched; a re-write into the same `outDir` starts from
nothing, so a mode that no longer appears in this run never leaves its old index/outcomes files behind.

## Validation

`OutcomeLibraryBundleValidating.validate(bundleDir, {deep?: boolean})` — never throws (top-level catch-all
`outcome-library-bundle-malformed`).

**Shallow (default)** — reads `manifest.json` and every mode's own `index_<modeName>.json` (all small); never
opens an outcomes file for content, only a cheap `fs.stat` size check against the index's own last recorded byte
range:

| Code | Meaning |
|---|---|
| `outcome-library-bundle-manifest-missing` / `-unreadable` / `-invalid-json` / `-malformed` / `-schema-version-unsupported` | `manifest.json` doesn't exist / couldn't be read / doesn't parse / doesn't match the expected shape / has an unsupported `schemaVersion` |
| `outcome-library-bundle-path-unsafe` | a mode's `indexFile`/`outcomesFile` is absolute, contains `..`, contains a path separator, or otherwise resolves outside `bundleDir` |
| `outcome-library-bundle-mode-index-missing` / `-unreadable` / `-invalid-json` / `-malformed` / `-schema-version-unsupported` | the same five outcomes, for a mode's own index file |
| `outcome-library-bundle-mode-index-library-id-mismatch` / `-hash-mismatch-with-manifest` | the index and the manifest disagree on a mode's `libraryId`/`libraryHash` |
| `outcome-library-bundle-mode-index-entry-invalid` | an index entry isn't `{id: non-empty string, weight: finite number > 0, byteOffset/byteLength: non-negative safe integers}` |
| `outcome-library-bundle-mode-index-duplicate-id` / `-entries-not-sorted` | the index's own entries have a duplicate id, or aren't canonically sorted by id |
| `outcome-library-bundle-mode-index-count-mismatch` / `-total-weight-mismatch` | the index's own entry count/weight sum disagrees with its own (or the manifest's) recorded `outcomeCount`/`totalWeight` |
| `outcome-library-bundle-outcomes-file-missing` / `-outcomes-file-too-small` | a mode's outcomes file is absent, or smaller than its own index's last recorded byte range requires |

**Deep (`{deep: true}`, opt-in, expensive)** — additionally streams every outcomes line per mode and fully
rebuilds each mode's library (via the same `readLibrary` path above) to catch corruption a byte-count sanity
check alone can't:

| Code | Meaning |
|---|---|
| `outcome-library-bundle-outcomes-line-invalid-json` / `-line-malformed` | a line isn't valid JSON at all, vs. parses but isn't `{id, weight, artifact}` — reported as two distinct codes rather than collapsed into one |
| `outcome-library-bundle-outcomes-duplicate-id` | the same id appears twice in the outcomes file |
| `outcome-library-bundle-outcomes-extra-id` / `-missing-id` | an id is in the outcomes file but not the index, or in the index but not the outcomes file — matched **by id**, never by row position |
| `outcome-library-bundle-outcomes-weight-mismatch` | the same id's weight disagrees between the outcomes file and the index |
| `outcome-library-bundle-outcomes-count-mismatch` | the outcomes file's own valid-record count disagrees with the index's entry count |
| `outcome-library-bundle-library-invalid` | the rebuilt library failed `buildWeightedOutcomeLibrary`'s own checks (a malformed `RoundArtifact`, inconsistent provenance/betMode/stake across outcomes, ...) — never a second definition of "valid" |
| `outcome-library-bundle-hash-mismatch` | the recomputed `libraryHash` doesn't match the manifest's recorded one |
| `outcome-library-bundle-analysis-mismatch` | the recomputed `WeightedOutcomeLibraryAnalyzer` stats don't match the manifest's recorded `analysis` — independent of `hash-mismatch`, since a library's hash never covers `analysis` |

## Integration — one shared loader

```ts
function loadWeightedOutcomeLibraryFromBundle<T extends string | number = string>(
    bundleDir: string,
    modeName: string,
    reader?: OutcomeLibraryBundleReading<T>,
): Promise<WeightedOutcomeLibrary<T>>;
```

Both integration points call exactly this function (which just calls `reader.readLibrary`), so they can never
end up disagreeing about what a bundle contains:

- **Pre-generated runtime** — no changes to `WeightedOutcomeSelector`, `PreGeneratedSpinCommandHandler`, or
  `PokieDevServerOptions` (all stabilized, unchanged contracts — see [Pre-Generated
  Runtime](pregenerated-runtime.md)). A wiring point calls `loadWeightedOutcomeLibraryFromBundle` then
  `computeWeightedOutcomeLibraryHash` to build the exact `(library, hash)` pair those constructors already
  accept today.
- **Stake Engine exporter** — `pokie stakeengine export`'s `config.json` mode entries gain an alternative to
  `libraryPath`:
  ```json
  {"modeName": "bonus", "cost": 100, "bundleDir": "./bundle", "bundleModeName": "bonus"}
  ```
  (`bundleModeName` defaults to `modeName` when omitted; exactly one of `libraryPath`/`bundleDir` is required per
  mode.) See [Stake Engine Export](stake-engine-export.md) for the rest of that config format.

## CLI usage

```
pokie outcomelibrary build <config.json> [--out <dir>]
pokie outcomelibrary validate <bundleDir> [--deep]
```

`build`'s config.json: `{"modes": [{"modeName": "base", "libraryPath": "./libraries/base.json"}]}` — a plain
`WeightedOutcomeLibrary` JSON file per mode (no `cost` field; that's Stake-specific). `validate` prints every
issue and returns a non-zero exit code if any is `error`-severity; `--deep` runs the expensive full-content check.

See [CLI](cli.md#pokie-outcomelibrary-build-configjson) for full option details.

## Programmatic usage

```ts
import {OutcomeLibraryBundleWriter, OutcomeLibraryBundleReader, loadWeightedOutcomeLibraryFromBundle} from "pokie";

await new OutcomeLibraryBundleWriter(pokieVersion).writeToDirectory(
    [{modeName: "base", library: baseLibrary}],
    "./bundle",
);

const reader = new OutcomeLibraryBundleReader();
for await (const outcome of reader.iterateModeOutcomes("./bundle", "base")) {
    // one outcome in memory at a time
}

const oneOutcome = await reader.drawOutcome("./bundle", "base", randomSource);
const wholeLibrary = await loadWeightedOutcomeLibraryFromBundle("./bundle", "base");
```
