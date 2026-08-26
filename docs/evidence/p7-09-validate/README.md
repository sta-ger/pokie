# P7-09 independent packed-CLI validation

Candidate: `b3b722c899e994bfd9aa27a4135f504a75bc087a` (`pokie@1.3.0`).

This is a clean-room rerun in a newly-created `$TMP` directory.  The candidate
source was built once, packed with `npm pack --ignore-scripts`, and the resulting
tarball was installed with `npm install --ignore-scripts --prefix $TMP/install`.
Every command below uses the installed candidate binary:

```sh
CLI='node $TMP/install/node_modules/pokie/dist/cli/pokie.js'
```

It does not use the checkout's `node_modules` executable or any private API.
The packed tarball SHA-256 was
`f312823ca4313d0841e754fd8bbd05ec1827864000b20f410d32344cdd7102d0`.

## Input provenance

The installed CLI created a deterministic valid Blueprint and then public build
artifacts:

```sh
$CLI create validation-sample --random --seed 709 --out valid.blueprint.json
$CLI build valid.blueprint.json --target tsPackage --out $TMP/install/valid-package
$CLI build valid.blueprint.json --target outcomeLibrary --sample 40 --seed p7-09 \
  --out valid-outcome-library
```

The generated Blueprint (`037453…e7c33`) became two ordinary authored JSON
inputs: `warning.blueprint.json` (`c6043a…f71f4`), with a deliberately
non-monotonic `paytable["7"]`, and `structural.blueprint.json` (`1aac7c…5285`),
with `reels: 0`. `malformed.blueprint.json` is the single line `{ not valid JSON`
(`43d7ab…c0adb`). The corruption case is a copy of the public generated library
whose `outcomes_base.jsonl` bytes were replaced in-place at every index-recorded
byte range, preserving that file's byte layout. The unmodified library files
had SHA-256: manifest `30dfcbe0…c5578`, index `a23c9471…c63d`, outcomes
`1649869e…4bdb5`.

## Public validation transcript and readback

For every row, the command was:

```sh
$CLI validate <input> [--deep] --format json --out <saved-report.json>
```

Stdout and the saved report were separately parsed and compared for equality.
All 11 saved reports parsed as `schemaVersion: 1` and had `project.path`,
`project.kind`, `errors`, `warnings`, and `suggestions`. Paths below are
redacted as `$TMP`; that is the only filesystem value intentionally present in
the reports' required project identity.

| Input / mode | Exit | Report readback |
| --- | ---: | --- |
| built `valid-package` | 0 | `package`, `deep:false`, valid; game `validation-sample` |
| valid Blueprint with math warning | 0 | `blueprint`, valid; `blueprint-paytable-non-monotonic` warnings |
| malformed Blueprint | 1 | `blueprint`, invalid; `blueprint-file-malformed` |
| structural Blueprint (`reels: 0`) | 1 | `blueprint`, invalid; `blueprint-reels-invalid` |
| valid outcome library, shallow | 0 | `outcome-library`, `deep:false`, valid |
| same valid outcome library, deep | 0 | `outcome-library`, `deep:true`, valid |
| byte-layout-preserving corruption, shallow | 0 | `outcome-library`, `deep:false`, valid |
| same corruption, deep | 1 | `outcome-library`, `deep:true`, invalid; safe outcome-file diagnostics |
| independent rerun of built package | 0 | byte-identical stdout and saved report to the first package run |

Representative distinct saved-report SHA-256 values were: valid package
`f74509b4…ee800`; warning Blueprint `52474f95…83ddc`; malformed Blueprint
`07ff5a80…1f954`; structural Blueprint `5f11267d…b95a5`; valid library shallow
`99a482cc…fe872`; valid library deep `5863557f…e54378`; corruption shallow
`7f4c6562…305db`; corruption deep `3cb70f62…7fb08`. The repeated package run
was byte-for-byte equal to the first one.

## Human diagnostics and machine-safety check

The normal (non-JSON) public command was also run for malformed Blueprint and
deep corruption, each with `--out`. Selected bounded excerpts:

```text
[$TMP/work/malformed.blueprint.json] blueprint-file-malformed:
The Blueprint JSON at "$TMP/work/malformed.blueprint.json" could not be read as JSON.
Next: Fix the JSON syntax and save a JSON object describing the Blueprint, then run validate again.

[outcomes_base.jsonl] outcome-library-bundle-outcomes-byte-range-mismatch:
The outcome-library artifact at "outcomes_base.jsonl" does not match the related outcome-library data.
Next: Repair outcomes_base.jsonl to match the outcome-library bundle format, then run validate again.
```

The deep corruption command returned 121 safe, location-specific diagnostics
(the 40 modified outcome records create multiple consistency checks); no retry
or duplicate write was performed. A scan of all 20 JSON stdout/saved machine
representations rejected `ENOENT`, parser names/text, `Error:`, stack frames,
`node_modules`, source/dist paths, TypeScript/JavaScript source locations,
`resolver`, and `class`. It passed. Thus diagnostics retain only public artifact
locations and next actions, not raw implementation, parser, filesystem, or
stack details.

No generated project, library, package, report, log, dependency tree, or tarball
is retained here; this single transcript retains their provenance and checksums.
