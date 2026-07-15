[← Back to docs index](README.md)

# Certification/Evidence Bundle

`certification/` builds a canonical, portable evidence artifact *on top of* an already-built
[Outcome Library Bundle](outcome-library-bundle.md) — the kind of package a certification lab or an internal
audit trail can hold onto independently of the (potentially much larger) source bundle: a deterministic manifest
carrying game/library provenance and exact weighted metrics, the source bundle's own deep-validation diagnostics,
and one JSONL file per mode of deterministically sampled, individually verifiable `RoundArtifact` records.

Like every other exporter/bundle format in this codebase (`StakeEngineExporter`, `OutcomeLibraryBundleWriter`),
it never introduces a second calculation path: every hash and metric it writes is read verbatim off the source
bundle's own `manifest.json`, and every sampled round is drawn via `OutcomeLibraryBundleReading.drawOutcome` —
the exact same weighted-draw algorithm the [pre-generated runtime](pregenerated-runtime.md) itself uses — seeded
with `SeededWeightedOutcomeRandomSource` so the same `(bundleDir, seed, sampleCount)` input always reproduces the
exact same, byte-identical output.

## Bundle directory layout

```
<certDir>/
  manifest.json              # CertificationEvidenceBundleManifest
  samples_<modeName>.jsonl   # one CertificationEvidenceSampleRecord<T> per line, one per requested mode
```

`manifest.json` carries the same "who/what version/when" provenance stamp every generated-artifact manifest in
this codebase uses (`schemaVersion`/`generatedBy`/`pokieVersion`/`generatedAt`/`artifactPokieVersion`, matching
[`OutcomeLibraryBundleManifest`](outcome-library-bundle.md)'s own convention), plus a `sourceBundleManifestHash`
(a sha256 of the source bundle's own `manifest.json`, canonicalized the same way
`computeWeightedOutcomeLibraryHash` hashes a library) and one entry per mode:

```ts
type CertificationEvidenceBundleModeEntry = {
    modeName: string;
    betMode: string;
    stake: number;
    libraryId: string;
    libraryHash: string;                       // read verbatim off the source bundle's own manifest entry
    outcomeCount: number;
    totalWeight: number;
    analysis: WeightedOutcomeLibraryAnalysis;   // WeightedOutcomeLibraryAnalyzer output, embedded verbatim
    sampleSeed: string;
    sampleCount: number;
    samplesFile: string;                        // "samples_<modeName>.jsonl"
    samplesHash: string;                         // sha256 of the exact bytes of samplesFile
};

type CertificationEvidenceBundleManifest = {
    schemaVersion: number;
    generatedBy: string;
    pokieVersion: string;
    generatedAt: string;
    game: PokieGameManifest;
    configHash?: string;
    artifactPokieVersion: string;
    sourceBundleDir: string;
    sourceBundleManifestHash: string;
    modes: readonly CertificationEvidenceBundleModeEntry[];
    deepValidation: {ranAt: string; issues: readonly ValidationIssue[]};
    files: readonly string[];
};
```

`deepValidation` is `OutcomeLibraryBundleValidating.validate(bundleDir, {deep: true})`'s own output against the
source bundle, run once at build time and embedded verbatim — never a second, differently-derived notion of
"valid". Building refuses to write anything at all if this reports an `error`-severity issue: evidence built on
top of a library that doesn't even validate against its own rules can't be trusted either, the same "no partial
artifact" discipline `OutcomeLibraryBundleWriter`/`StakeEngineExporter` already follow.

Each `samples_<modeName>.jsonl` line is a `CertificationEvidenceSampleRecord<T>`:

```ts
type CertificationEvidenceSampleRecord<T = string> = {
    modeName: string;
    sampleIndex: number;   // 0-based position in the deterministic draw sequence for "seed"
    seed: string;
    outcomeId: string;
    weight: number;
    recordHash: string;    // the source bundle's own OutcomeLibraryBundleIndexEntry.recordHash, reused as-is
    artifactHash: string;  // computeRoundArtifactHash(artifact), reused as-is
    artifact: RoundArtifact<T>;
};
```

The full `RoundArtifact` is embedded verbatim (not just a reference), so an evidence bundle stays self-contained
and independently auditable without needing the — potentially much larger — source bundle at hand for a first
read. Samples are drawn **with replacement** (a genuine simulated sequence of `sampleCount` rounds against the
mode's own weights), not an enumeration of distinct outcomes — the library's own manifest entry already carries
the exact enumeration/metrics; the samples exist to let an auditor spot-check individual rounds' own math.

## Building

```ts
interface CertificationEvidenceBundleBuilding {
    buildFromBundle(
        bundleDir: string,
        modes: readonly CertificationEvidenceBundleModeSampleInput[],
        outDir: string,
    ): Promise<CertificationEvidenceBundleBuildResult>;
}

type CertificationEvidenceBundleModeSampleInput = {modeName: string; seed: string; sampleCount: number};
```

`CertificationEvidenceBundleBuilder` deep-validates the source bundle first; on any `error`-severity issue, or if
a requested mode isn't present in the source bundle's own manifest, nothing is written and `result.manifest` is
`undefined` — the same "no partial bundle" contract `OutcomeLibraryBundleWriteResult`/`StakeEngineExportResult`
already carry. The whole output directory is then published atomically via the same `publishDirectoryAtomically`
helper every other bundle/export format in this codebase shares.

```ts
import {CertificationEvidenceBundleBuilder} from "pokie";

const builder = new CertificationEvidenceBundleBuilder(pokieVersion);
const result = await builder.buildFromBundle(
    "./bundle",
    [{modeName: "base", seed: "cert-2026-07-15-base", sampleCount: 200}],
    "./certification",
);
```

## Validation

`CertificationEvidenceBundleValidating.validate(certDir)` checks a certification bundle **by itself** — never
needs the source Outcome Library Bundle it was built from. Never throws (top-level catch-all
`certification-evidence-bundle-malformed`).

| Code | Meaning |
|---|---|
| `certification-evidence-bundle-manifest-missing` / `-unreadable` / `-invalid-json` / `-malformed` / `-schema-version-unsupported` | `manifest.json` doesn't exist / couldn't be read / doesn't parse / doesn't match the expected shape / has an unsupported `schemaVersion` |
| `certification-evidence-bundle-mode-field-invalid` | a manifest mode entry doesn't match the expected shape |
| `certification-evidence-bundle-mode-name-invalid` / `-duplicate-mode-name` / `-mode-name-case-collision` | a mode name doesn't match `[A-Za-z0-9_-]+`, is used more than once, or two mode names differ only in case |
| `certification-evidence-bundle-mode-filename-mismatch` | a mode's `samplesFile` isn't exactly `samples_<modeName>.jsonl` |
| `certification-evidence-bundle-path-unsafe` | a mode's `samplesFile` is absolute, contains `..`, or otherwise resolves outside `certDir` |
| `certification-evidence-bundle-manifest-files-invalid` / `-duplicate` / `-entry-unsafe` / `-missing-entry` / `-unexpected-entry` | `manifest.json`'s `files` isn't a non-empty array of unique, safe filenames that exactly match `"manifest.json"` plus every current mode's own `samplesFile` |
| `certification-evidence-bundle-samples-file-missing` | a mode's samples file is absent |
| `certification-evidence-bundle-samples-hash-mismatch` | a mode's samples file content doesn't hash to its own recorded `samplesHash` |
| `certification-evidence-bundle-sample-count-mismatch` | a mode's samples file has a different number of lines than its own recorded `sampleCount` |
| `certification-evidence-bundle-sample-line-invalid-json` / `-line-malformed` | a sample line isn't valid JSON at all, vs. parses but isn't a `CertificationEvidenceSampleRecord` |
| `certification-evidence-bundle-sample-index-mismatch` / `-mode-name-mismatch` / `-seed-mismatch` | a sample record's own `sampleIndex`/`modeName`/`seed` disagrees with its position or its mode's own recorded values |
| `certification-evidence-bundle-sample-artifact-not-json-safe` | a sample's embedded artifact can't be re-canonicalized (used to recompute its hash) |
| `certification-evidence-bundle-sample-artifact-hash-mismatch` | a sample's embedded artifact doesn't hash to its own recorded `artifactHash` |
| `certification-evidence-bundle-sample-artifact-invalid` | a sample's embedded artifact fails `RoundArtifactValidator` — never a second definition of "valid" |

## Verification

`CertificationEvidenceBundleVerifying.verify(certDir, {sourceBundleDir?})` composes the validator above (a
structurally broken evidence bundle can't be meaningfully cross-checked against anything, so verification
short-circuits on those codes) with a cross-check against the **live** source Outcome Library Bundle —
`sourceBundleDir` defaults to the manifest's own recorded one, but can be overridden if the source bundle moved.

| Code | Meaning |
|---|---|
| `certification-evidence-verify-source-bundle-unreadable` | the source bundle's own `manifest.json` couldn't be read at `sourceBundleDir` |
| `outcome-library-bundle-*` | any issue the *source* bundle's own (shallow) `OutcomeLibraryBundleValidating` reports against its current on-disk files, forwarded as-is |
| `certification-evidence-verify-source-bundle-manifest-changed` | the source bundle's own `manifest.json` no longer hashes to what this evidence bundle recorded at build time |
| `certification-evidence-verify-manifest-provenance-mismatch` | this evidence bundle's own `game`/`configHash`/`artifactPokieVersion` no longer matches the source bundle's own manifest |
| `certification-evidence-verify-source-mode-missing` | a certified mode is no longer present in the source bundle's own manifest |
| `certification-evidence-verify-manifest-mode-mismatch` | a mode's `libraryId`/`betMode`/`stake`/`libraryHash` no longer matches the source bundle's own manifest entry |
| `certification-evidence-verify-metrics-mismatch` | a mode's `outcomeCount`/`totalWeight`/`analysis` no longer matches the source bundle's own manifest entry |
| `certification-evidence-verify-sample-outcome-missing` | a sampled outcome id is no longer present in the source bundle |
| `certification-evidence-verify-sample-outcome-changed` | a sampled outcome's own weight/artifact (or its record's own `id`/`weight`/`recordHash` triple, per `OutcomeLibraryBundleReading.readOutcomeById`'s own tamper check) no longer matches what this evidence bundle recorded |

Every sampled outcome is re-read from the live source bundle via `readOutcomeById` — the same single-record,
byte-range-verified read the pre-generated runtime itself uses — so verification never has to materialize the
whole source library, however large it is, to check the handful of rounds this evidence actually cites.

## CLI usage

```
pokie certification build <bundleDir> <config.json> [--out <dir>]
pokie certification verify <certDir> [--source <bundleDir>]
```

See [CLI](cli.md#pokie-certification-build-bundledir-configjson) for full option details.

## Programmatic usage

```ts
import {CertificationEvidenceBundleBuilder, CertificationEvidenceBundleValidator, CertificationEvidenceBundleVerifier} from "pokie";

const builder = new CertificationEvidenceBundleBuilder(pokieVersion);
const result = await builder.buildFromBundle(
    "./bundle",
    [{modeName: "base", seed: "cert-2026-07-15-base", sampleCount: 200}],
    "./certification",
);

const selfConsistent = await new CertificationEvidenceBundleValidator().validate("./certification");
const stillMatchesSourceBundle = await new CertificationEvidenceBundleVerifier().verify("./certification");
```
