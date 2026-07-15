[← Back to docs index](README.md)

# Outcome Library Bundle

`weightedoutcome/bundle/` persists a canonical [`WeightedOutcomeLibrary`](weighted-outcome-library.md) (one per
mode) as a directory bundle — a small manifest, a small per-mode index, and one streaming JSONL file of outcomes
per mode — instead of the single, whole-file JSON document `PokieJsonWeightedOutcomeLibraryProjector` produces.
This is the one canonical, on-disk source both the [pre-generated runtime](pregenerated-runtime.md) and the
[Stake Engine exporter](stake-engine-export.md) load outcomes from.

## Why a bundle, not one JSON file

A real game's outcome library can enumerate a very large number of distinct outcomes, each carrying its own
`RoundArtifact`. Loading that as a single JSON document means holding every outcome in memory just to read one,
or to serve one weighted draw. This bundle format is streaming end to end, so nothing on the write or read side
ever has to hold a whole mode's outcomes in memory at once:

- **The writer streams from an `Iterable`/`AsyncIterable` source** — one canonical-JSON line per outcome, written
  directly to disk as it arrives, hashed incrementally in the same pass. A caller with millions of outcomes can
  hand the writer an async generator reading from a database cursor or a JSONL file on disk (see `pokie
  outcomelibrary build`'s `outcomesPath` config below) without ever building the equivalent
  `WeightedOutcomeLibrary` in memory first.
- **The reader supports four genuinely different access patterns**, none of which require loading everything:
  - `iterateModeOutcomes` — full sequential streaming, one outcome in memory at a time.
  - `readOutcomeById` / `drawOutcome` — exactly one outcome loaded, via the mode's own small index and a single
    byte-range read — verified against the index entry's own `id`/`weight` before ever being returned (see
    below).
  - `readLibrary` — the "give me everything" convenience a caller that genuinely needs the whole
    `WeightedOutcomeLibrary` uses.
  - `OutcomeLibraryBundleOutcomeSource` — a thin, bundle-native wrapper around `drawOutcome`, built specifically
    for the [pre-generated runtime](pregenerated-runtime.md): it serves weighted draws straight from a bundle on
    disk and never calls `readLibrary()`, so a game can be played entirely off a bundle without ever
    materializing a `WeightedOutcomeLibrary`.
- **The validator has a shallow mode** that never opens an outcomes file's content at all — only the manifest and
  each mode's own small index, plus an exact byte-layout check (see Validation below) — so validating a bundle
  doesn't itself defeat the point of the format.
- **The Stake Engine exporter can stream a mode directly from a bundle** (`StakeEngineBundleStreamingExporter`),
  writing CSV/books output as outcomes arrive rather than building a `WeightedOutcomeLibrary` first — see
  [Stake Engine Export](stake-engine-export.md).

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
  The record found there is verified to have exactly the `id`/`weight` the index entry promised before it's ever
  returned; a mismatch (a corrupted byte range, an index and outcomes file that have drifted out of sync) throws
  `OutcomeLibraryBundleInvariantError` rather than silently handing back the wrong outcome.
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

### Bundle-native OutcomeSource (pre-generated runtime)

`OutcomeLibraryBundleOutcomeSource` binds one `(bundleDir, modeName)` pair to the general
[`PreGeneratedOutcomeSourcing`](pregenerated-runtime.md#pregeneratedoutcomesourcing--decoupling-the-runtime-from-a-full-library)
interface `PreGeneratedSpinCommandHandler` consumes:

```ts
type PreGeneratedOutcomeSelection<T extends string | number = string> = {
    libraryId: string;
    libraryHash: string;
    totalWeight: number;
    outcome: WeightedOutcome<T>;
};

interface PreGeneratedOutcomeSourcing<T extends string | number = string> {
    drawOutcome(randomSource: WeightedOutcomeRandomSource): Promise<PreGeneratedOutcomeSelection<T>>;
}
```

Every `drawOutcome()` call reads this mode's own small index_<modeName>.json exactly **once** — never a separate
read for identity and another for selection — picks a winning entry by exact integer cumulative weight, reads
exactly that one outcome's own byte range, and returns `libraryId`/`libraryHash`/`totalWeight` from that same
single index read alongside the outcome. It never calls `readLibrary()`, so a caller (the pre-generated runtime,
or any other code that just needs to draw outcomes) can serve draws directly off a bundle on disk without ever
materializing a `WeightedOutcomeLibrary`. Reading the index exactly once per draw is what lets
`PreGeneratedSpinCommandHandler`'s own session-identity check relate to the *exact* bundle version a draw was
made against — if the bundle is rebuilt between two calls, the very next draw's own atomic result reflects that
immediately, rather than a separately-fetched, possibly stale identity.

## Streaming writer

```ts
interface OutcomeLibraryBundleWriting<T extends string | number = string> {
    writeToDirectory(modes: readonly OutcomeLibraryBundleModeInput<T>[], outDir: string): Promise<OutcomeLibraryBundleWriteResult>;
}

type OutcomeLibraryBundleModeInput<T extends string | number = string> = {
    modeName: string;
    libraryId: string;
    schemaVersion?: number;
    outcomes: Iterable<WeightedOutcomeInput<T>> | AsyncIterable<WeightedOutcomeInput<T>>;
};
```

Takes an `Iterable`/`AsyncIterable` outcomes source per mode — not an already-built `WeightedOutcomeLibrary` — so
a caller with more outcomes than fit comfortably in memory can stream from wherever they live (a database
cursor, a JSONL file on disk) straight into the bundle. Each mode's outcomes are consumed exactly once, in
arrival order: validated per-outcome (id format/uniqueness/sort order, weight, artifact, cross-outcome
homogeneity — the same checks `buildWeightedOutcomeLibrary` runs, necessarily duplicated here since that
function's own array-based implementation requires every outcome up front) and written to disk one line at a
time, with the mode's `libraryHash` computed incrementally in the same pass — never a second, differently-derived
value, and never an array of outcomes held in memory. Weights must be positive safe integers (stricter than
`WeightedOutcomeLibrary`'s general finite-positive-number contract): this bundle format's own `drawOutcome`
genuinely needs exact integer weights to walk cumulative sums correctly. A validation error (including the sum of
a mode's weights overflowing a safe integer) means nothing is written for that call.

Runs a small upfront check (mode name format/duplicates/case collisions, non-empty `libraryId`) before consuming
any mode's outcomes, plus a cross-mode provenance check (same game/config/pokieVersion across modes) once each
mode's first outcome has streamed through. The whole output directory is then published atomically via the same
`publishDirectoryAtomically` helper `StakeEngineImportWriter` uses: built into a fresh temporary sibling
directory first, swapped into place only once every file has been written successfully. A failure anywhere
before the swap leaves an existing `outDir` completely untouched; a re-write into the same `outDir` starts from
nothing, so a mode that no longer appears in this run never leaves its old index/outcomes files behind.

## Validation

`OutcomeLibraryBundleValidating.validate(bundleDir, {deep?: boolean})` — never throws (top-level catch-all
`outcome-library-bundle-malformed`).

**Shallow (default)** — reads `manifest.json` and every mode's own `index_<modeName>.json` (all small); never
opens an outcomes file's content, only an exact byte-layout check against the index's own recorded ranges:

| Code | Meaning |
|---|---|
| `outcome-library-bundle-manifest-missing` / `-unreadable` / `-invalid-json` / `-malformed` / `-schema-version-unsupported` | `manifest.json` doesn't exist / couldn't be read / doesn't parse / doesn't match the expected shape / has an unsupported `schemaVersion` |
| `outcome-library-bundle-manifest-mode-field-invalid` | a manifest mode entry's `betMode`/`stake`/`libraryId`/`libraryHash`/`outcomeCount`/`totalWeight`/`analysis` isn't the expected type/shape |
| `outcome-library-bundle-mode-name-invalid` / `-duplicate-mode-name` / `-mode-name-case-collision` | a mode name doesn't match `[A-Za-z0-9_-]+`, is used by more than one mode, or two mode names differ only in case |
| `outcome-library-bundle-mode-filename-mismatch` | a mode's `indexFile`/`outcomesFile` isn't exactly `index_<modeName>.json`/`outcomes_<modeName>.jsonl` — this format's own fixed naming convention |
| `outcome-library-bundle-manifest-files-invalid` / `-duplicate` / `-entry-unsafe` / `-missing-entry` / `-unexpected-entry` | `manifest.json`'s `files` isn't a non-empty array of unique, safe filenames that exactly match `"manifest.json"` plus every current mode's own `indexFile`/`outcomesFile` — nothing missing, nothing extra |
| `outcome-library-bundle-path-unsafe` | a mode's `indexFile`/`outcomesFile` is absolute, contains `..`, contains a path separator, or otherwise resolves outside `bundleDir` |
| `outcome-library-bundle-mode-index-missing` / `-unreadable` / `-invalid-json` / `-malformed` / `-schema-version-unsupported` | the same five outcomes, for a mode's own index file |
| `outcome-library-bundle-mode-index-library-schema-version-unsupported` | the index's `librarySchemaVersion` isn't the currently-supported `WeightedOutcomeLibrary` schema version |
| `outcome-library-bundle-mode-index-mode-name-mismatch` / `-library-id-mismatch` / `-hash-mismatch-with-manifest` / `-outcomes-file-mismatch` | the index and the manifest disagree on a mode's `modeName`/`libraryId`/`libraryHash`/`outcomesFile` |
| `outcome-library-bundle-mode-index-entry-invalid` | an index entry isn't `{id: non-empty string, weight: positive safe integer, byteOffset/byteLength: non-negative safe integers}` |
| `outcome-library-bundle-mode-index-duplicate-id` / `-entries-not-sorted` | the index's own entries have a duplicate id, or aren't canonically sorted by id |
| `outcome-library-bundle-mode-index-count-mismatch` / `-total-weight-overflow` / `-total-weight-mismatch` | the index's own entry count/weight sum disagrees with its own (or the manifest's) recorded `outcomeCount`/`totalWeight`, or the weight sum itself overflows a safe integer |
| `outcome-library-bundle-outcomes-file-missing` | a mode's outcomes file is absent |
| `outcome-library-bundle-mode-index-byte-range-not-contiguous` | an entry's `byteOffset` doesn't immediately follow the previous entry's own range (ranges must be contiguous, start at 0, in the same canonical order the index is already sorted in) |
| `outcome-library-bundle-mode-index-entry-not-newline-terminated` | the byte right after an entry's own recorded range isn't `"\n"` — its `byteOffset`/`byteLength` don't describe a real line boundary |
| `outcome-library-bundle-outcomes-file-too-small` / `-has-trailing-bytes` | the outcomes file is smaller than the index's own ranges require, or has bytes left over past the last recorded range — the file's size must exactly match what the index accounts for |

**Deep (`{deep: true}`, opt-in, expensive)** — additionally, for every index entry, independently reads exactly
that entry's own recorded byte range and verifies the record found there really is that entry's own `{id,
weight}` (the same check `readOutcomeById`/`drawOutcome` themselves rely on — see `outcome-library-bundle-outcomes-byte-range-mismatch`
below), **and** streams every outcomes line sequentially, matching each record against the index **by id**
(never by byte offset or row position) to catch corruption a per-entry byte-range check alone can't (an id
present in the file but absent from the index, or vice versa):

| Code | Meaning |
|---|---|
| `outcome-library-bundle-outcomes-byte-range-mismatch` | an index entry's own recorded byte range, read directly, decodes to a different id/weight than that entry promises — e.g. a reordered or shifted outcomes file where every id is still present *somewhere*, just not where its own index entry says |
| `outcome-library-bundle-outcomes-line-invalid-json` / `-line-malformed` | a line isn't valid JSON at all, vs. parses but isn't `{id, weight, artifact}` — reported as two distinct codes rather than collapsed into one |
| `outcome-library-bundle-outcomes-duplicate-id` | the same id appears twice in the outcomes file |
| `outcome-library-bundle-outcomes-extra-id` / `-missing-id` | an id is in the outcomes file but not the index, or in the index but not the outcomes file — matched **by id**, never by row position |
| `outcome-library-bundle-outcomes-weight-mismatch` | the same id's weight disagrees between the outcomes file and the index |
| `outcome-library-bundle-outcomes-artifact-invalid` | an outcome's artifact fails `RoundArtifactValidator` — never a second definition of "valid" |
| `outcome-library-bundle-outcomes-inconsistent-provenance` / `-inconsistent-bet-mode` / `-inconsistent-stake` | an outcome's game/config/pokieVersion, `betMode`, or `stake` disagrees with this mode's other outcomes |
| `outcome-library-bundle-outcomes-manifest-provenance-mismatch` | this mode's outcomes' own (mutually-consistent) game id/version/configHash doesn't match `manifest.json`'s own top-level `game`/`configHash` — a gap the cross-*outcome* check above can't catch on its own, since it never reads the manifest. Deliberately does not compare `manifest.pokieVersion` (which pokie *tool* version built this bundle file) against `artifact.provenance.pokieVersion` (which pokie version *computed* that artifact) — the two measure different things and are never required to match |
| `outcome-library-bundle-outcomes-manifest-mode-mismatch` | this mode's outcomes' own betMode/stake doesn't match `manifest.json`'s own per-mode `betMode`/`stake` entry |
| `outcome-library-bundle-outcomes-not-json-safe` | an outcome can't be re-canonicalized via `toCanonicalJson` (used to recompute the hash) |
| `outcome-library-bundle-outcomes-count-mismatch` | the outcomes file's own valid-record count disagrees with the index's entry count |
| `outcome-library-bundle-hash-mismatch` | the recomputed `libraryHash` doesn't match the manifest's recorded one |
| `outcome-library-bundle-analysis-mismatch` | the recomputed `WeightedOutcomeLibraryAnalyzer` stats don't match the manifest's recorded `analysis` — independent of `hash-mismatch`, since a library's hash never covers `analysis` |

The sequential per-line pass runs regardless of whether the byte-layout checks above found a problem — a
reordered/duplicated/extra outcome can trip both a byte-layout code and a content-level code at once, and deep
mode reports everything it finds rather than stopping at the first kind of corruption.

## Integration

- **Pre-generated runtime** — `PreGeneratedSpinCommandHandler` is wired to a
  [`PreGeneratedOutcomeSourcing`](pregenerated-runtime.md#pregeneratedoutcomesourcing--decoupling-the-runtime-from-a-full-library),
  not a raw `WeightedOutcomeLibrary` (`WeightedOutcomeSelector`/`PokieDevServerOptions` themselves are unchanged
  — see [Pre-Generated Runtime](pregenerated-runtime.md)). A caller that still wants a full in-memory
  `WeightedOutcomeLibrary` calls `loadWeightedOutcomeLibraryFromBundle(bundleDir, modeName)` (which just calls
  `reader.readLibrary`) then `computeWeightedOutcomeLibraryHash` to build an `InMemoryPreGeneratedOutcomeSource`;
  a caller that wants to avoid materializing a library entirely uses `OutcomeLibraryBundleOutcomeSource` directly
  (see above) — either one plugs straight into `PreGeneratedSpinCommandHandler`'s constructor.
- **Stake Engine exporter** — `pokie stakeengine export`'s `config.json` mode entries gain an alternative to
  `libraryPath`:
  ```json
  {"modeName": "bonus", "cost": 100, "bundleDir": "./bundle", "bundleModeName": "bonus"}
  ```
  (`bundleModeName` defaults to `modeName` when omitted; exactly one of `libraryPath`/`bundleDir` is required per
  mode.) When **every** mode in one export uses `bundleDir`, the whole export streams directly from the bundle(s)
  via `StakeEngineBundleStreamingExporter` — reading each mode's `libraryHash`/`libraryId`/`outcomeCount` straight
  from its own index and never calling `readLibrary()`. Mixing even one `libraryPath` mode into the same export
  falls back to the existing `StakeEngineExporter`, which needs every mode's library fully in memory anyway. See
  [Stake Engine Export](stake-engine-export.md) for the rest of that config format.

## CLI usage

```
pokie outcomelibrary build <config.json> [--out <dir>]
pokie outcomelibrary validate <bundleDir> [--deep]
```

`build`'s config.json lists one outcome source per mode, either a plain `WeightedOutcomeLibrary` JSON file —
`{"modes": [{"modeName": "base", "libraryPath": "./libraries/base.json"}]}` — fully loaded into memory, or a
streaming JSONL file of outcomes for a mode too large to hold in memory at once — `{"modeName": "bonus",
"outcomesPath": "./outcomes-bonus.jsonl", "libraryId": "bonus-lib"}` (one canonical `{"id", "weight", "artifact"}`
record per line, not wrapped in a library object; `libraryId` is required since there's no wrapping library
object to read it from, and `schemaVersion` is optional). Exactly one of `libraryPath`/`outcomesPath` is required
per mode. `validate` prints every issue and returns a non-zero exit code if any is `error`-severity; `--deep`
runs the expensive full-content check.

See [CLI](cli.md#pokie-outcomelibrary-build-configjson) for full option details.

## Programmatic usage

```ts
import {
    OutcomeLibraryBundleOutcomeSource,
    OutcomeLibraryBundleReader,
    OutcomeLibraryBundleWriter,
    loadWeightedOutcomeLibraryFromBundle,
} from "pokie";

// "outcomes" can be a plain array or a genuine AsyncIterable (e.g. an async generator reading from a database
// cursor or a JSONL file) — consumed exactly once, streamed straight to disk.
await new OutcomeLibraryBundleWriter(pokieVersion).writeToDirectory(
    [{modeName: "base", libraryId: "base-lib", outcomes}],
    "./bundle",
);

const reader = new OutcomeLibraryBundleReader();
for await (const outcome of reader.iterateModeOutcomes("./bundle", "base")) {
    // one outcome in memory at a time
}

const oneOutcome = await reader.drawOutcome("./bundle", "base", randomSource);
const wholeLibrary = await loadWeightedOutcomeLibraryFromBundle("./bundle", "base");

// The pre-generated runtime's own bundle-native path — never calls readLibrary(). One index read returns the
// outcome together with the exact libraryId/libraryHash/totalWeight it was drawn against.
const source = new OutcomeLibraryBundleOutcomeSource("./bundle", "base");
const selection = await source.drawOutcome(randomSource);
console.log(selection.libraryId, selection.libraryHash, selection.totalWeight, selection.outcome.id);
```
