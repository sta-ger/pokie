# P7-08 current-candidate packed-CLI rerun

Status: **finding** (two destination/lifecycle defects below). This transcript preserves the
prior `packed-cli-rerun-20260825.md` record, which covered an earlier candidate.

## Provenance and clean-room invocation

- Candidate checkout: `c8b5563293fae1c8a7898523efd1698b1571d1f4` (verified with `git rev-parse HEAD`
  before packing; clean worktree).
- Fresh tarball: `npm pack --pack-destination <fresh-pack-dir>` ran this checkout's `prepack` once;
  `pokie-1.3.0.tgz`, SHA-256
  `ddead4a9926e8213b0785c59fdc9e5774b25bc93e7a26bc4bdeed0ee9b48dce3`.
- Fresh consumer: a new empty temporary directory ran
  `npm install --ignore-scripts --no-audit --no-fund <tarball>` and every command below used only
  `node ./node_modules/pokie/dist/cli/pokie.js`. `--version` exited 0 and printed `1.3.0`.
- Host: Node `v24.18.0`, npm `11.16.0`. Input was the shipped
  `examples/parsheets/starter.blueprint.json`, SHA-256
  `3873dde030ece1b7f96151bbac68263d2ef28e5c1db2e61c624f298eb7cd9d1b`.

`build --help` advertised exactly `tsPackage`, `outcomeLibrary`, `stakeAdapter`, and
`parWorkbook`; `export --help` advertised `outcomes`, `adapter`, and `workbook`. The public command
`build source.blueprint.json --target wasm` exited 1 with `Unknown --target "wasm"` and the four
accepted target names.

## Retained build-target lifecycle

Each row used a separate input copy. “Default”, “custom”, “dry”, and “occupied” respectively ran
`build <source> --target <target>`, the same command with `--out <custom>`, the same command with
`--out <dry> --dry-run`, and the same command with `--out <nonempty-sentinel-dir>`.

| Target | Default / resolver or consumer readback | Custom `--out` | Dry run | Occupied destination |
| --- | --- | --- | --- | --- |
| `tsPackage` | 0; `validate` 0 and a separate Node ESM consumer import printed `consumer-load=ok` | 0, output present | 0, no output | 1, target-named next-step diagnostic |
| `outcomeLibrary` | 0; `validate --deep` 0 and `report --format json` 0 | **0 but custom output absent**; CLI says it reused the default project | 0, no output | **0**; CLI says it reused the default project, leaving the requested occupied directory untouched |
| `stakeAdapter` | 0; public `import <adapter> --out <dir>` 0 | 0, output present | 0, no output | 1, target-named next-step diagnostic |
| `parWorkbook` | 0; public `par import` 0 then `validate` 0 | 0, file present | 0, no file | 1, target-named next-step diagnostic |

The exact `outcomeLibrary` custom result was:

```text
Artifact "outcomeLibrary" reused compatible Outcome Project ".../outcomeLibrary"
instead of writing "build-outcomeLibrary/custom".
```

Its occupied invocation likewise exited 0 and reported reuse despite the pre-existing nonempty
`build-outcomeLibrary/conflict/occupied` sentinel. This contradicts the documented `--out` contract
that an explicit output overrides the default and an existing destination is unavailable.

## Public export-alias lifecycle

The source for `outcomes` and `adapter` was produced entirely through public packed-CLI calls:
`build <blueprint> --target stakeAdapter --out <stake-source>`, then
`import <stake-source> --out <source-project>`. Each alias then ran its default output, explicit
`--out`, `--dry-run`, and nonempty occupied-destination variants. The default outputs were read back
through their public consumers.

| Alias | Default / readback | Custom `--out` | `--dry-run` | Occupied destination |
| --- | --- | --- | --- | --- |
| `outcomes` | 0 to `outcomelibrary`; `validate --deep` 0 | 0 | **1:** `Unknown option "--dry-run"` | **0:** replaced a nonempty sentinel directory with an outcome bundle |
| `adapter` | 0 to `stakeengine`; `import` 0 | 0 | **1:** `Unknown option "--dry-run"` | 1, target-named next-step diagnostic |
| `workbook` | 0 to `<source>.par.xlsx`; `par import` then `validate` 0 | 0 | **1:** `Unknown option "--dry-run"` | 1, target-named next-step diagnostic |

For all three rejected dry-run invocations, the exact public diagnostic was:

```text
Unknown option "--dry-run". Usage: pokie export <source> --to outcomes|adapter|workbook [--out <path>]
```

The `outcomes` occupied command instead exited 0 and wrote `index_base.json`,
`outcomes_base.jsonl`, and `manifest.json` over the pre-existing directory. This is distinct from the
successful `adapter` and `workbook` conflict diagnostics, which named the export target and provided a
next step.

## Outcome-library public diagnostic regression check

`report <outcomeLibrary> --format json --out report.json` exited 0. A JSON-only scan of public
`descriptor.limitations` and `issues` exited 0 (`public-report-scan=ok limitations=2 issues=0`) after
rejecting raw internal class names, registry names, filesystem paths, and stack-frame forms. The two
retained public limitations were:

```text
Serves already-computed outcomes exactly as built -- never re-derives or recovers the game model/blueprint that produced them.
Draws are only ever atomic against this bundle's own current on-disk content -- a rebuild mid-read reports that the source content changed, never a silently stale result.
```

Thus the prior raw `PreGeneratedOutcomeSourceConflictError` report leak is absent from the current
packed candidate.

## Artifact checksums

No generated output is retained. The following SHA-256 values were calculated in the fresh consumer
before it was discarded:

| Artifact | SHA-256 |
| --- | --- |
| `tsPackage/package.json` | `ae5360eb312f66524275576180d9cf01607361154b19b69cda9c107e1ca0a51b` |
| `tsPackage/dist/index.js` | `57d165fa9c5dbaaba24fd2bf36bb1b08fe2d77c92c2295cb22eed300cdc13394` |
| `outcomeLibrary/manifest.json` | `72e6ef7768eff484674d182517e2ac7067e16b5f6599d1eb83beaca811235efc` |
| `outcomeLibrary/index_base.json` | `a182fcbf04144c8655bde5f50b6c32365bd945f63bdf6144e98b5d2ce6ff2d34` |
| `outcomeLibrary/outcomes_base.jsonl` | `c897c2270efed42126616dd6a7dbda06e9119ea65c6357e5d4eea88d5f18ae69` |
| `stakeAdapter/pokie-manifest.json` | `a802e17b4fccac07d34962537954aa1608460c5219d73f77644eb3eccf520645` |
| `stakeAdapter/index.json` | `57e19f4de9b88cc3e45e7a5a2f11e0940b465ff9e09a5e1553d58b384807a5d5` |
| `parWorkbook.xlsx` | `16882ce2f696708c25f3a5ebae3eb3e5572a2a6426b5606447d5674234177ef3` |
| `PAR readback blueprint` | `b9cd4d21138deb08a42ef907eaf5b0ca89c0598277200774a988391b59b1e6f2` |
| `export outcomes/manifest.json` | `01bdae49ebbbfc2dbb22d1f4f6b5d858741580f256b923779721d23abde72772` |
| `export adapter/pokie-manifest.json` | `28b48a5cffda65b09bf75f98d0ff4a3bffada2dd005a89635036f9c8c877cfe2` |
| `export workbook.xlsx` | `871725f6904b78d53c138d5c2cc243c11fdbf384c5f8c8bd4bd407962a1e1b44` |
