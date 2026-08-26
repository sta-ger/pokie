# P7-08 corrected packed-CLI lifecycle rerun

Status: **passed**. This replaces the superseded P7-08 records; no generated
consumer tree or raw log is retained.

## Provenance

- Candidate checkout was clean at `b8bb7c41edccde7b5dcafe17d459e107d65f5a72`.
- One `npm pack --pack-destination <fresh pack directory>` ran the candidate's
  `prepack` build and produced `pokie-1.3.0.tgz`:
  `sha256:9987d096586e0708d976f851394f3ab84962de17b3f043bbb3526a5e90ac8c88`.
- A new empty temporary consumer ran `npm init -y`, then
  `npm install --ignore-scripts --no-audit --no-fund <tarball>`. Every public
  workflow command used only
  `node ./node_modules/pokie/dist/cli/pokie.js`; `--version` exited 0 and
  printed `1.3.0`. Node was `v24.18.0`, npm was `11.16.0`.
- The shipped `examples/parsheets/starter.blueprint.json` was copied into that
  consumer (input SHA-256
  `3873dde030ece1b7f96151bbac68263d2ef28e5c1db2e61c624f298eb7cd9d1b`).
  Outcome/adapter export configuration was created exclusively by the packed
  CLI: build `stakeAdapter`, then public `import ... --out stake-readback`.

`build --help` listed exactly `tsPackage`, `outcomeLibrary`, `stakeAdapter`,
and `parWorkbook`; `export --help` listed `outcomes`, `adapter`, and
`workbook`. `build source.blueprint.json --target wasm` exited 1:

```text
Unknown --target "wasm". --target must be one of: tsPackage, outcomeLibrary, stakeAdapter, parWorkbook.
```

## Retained target and alias matrix

For every row, default output, a unique explicit `--out`, and an explicit
`--out --dry-run` exited 0. Each dry destination was absent after its command.
Each conflict was pre-populated with a `sentinel`; every command exited 1 and
the sentinel remained unchanged. The bounded failure excerpt for all such
conflicts was target-named and actionable: `Cannot build/export target
"<target>" because its destination is unavailable ... Next: choose a different
--out path or remove the existing destination, then retry.`

| Public surface | Source | default / `--out` / dry / conflict | Consumer readback |
| --- | --- | --- | --- |
| build `tsPackage` | blueprint | 0 / 0 / 0 (absent) / 1 (sentinel retained) | `validate tsPackage` 0; a Node ESM import of `tsPackage/dist/index.js` printed `consumer-import=ok` |
| build `outcomeLibrary` | blueprint | 0 / 0 / 0 (absent) / 1 (sentinel retained) | `validate outcomeLibrary --deep` 0 |
| build `stakeAdapter` | blueprint | 0 / 0 / 0 (absent) / 1 (sentinel retained) | `import stakeAdapter --out stake-readback` 0 |
| build `parWorkbook` | blueprint | 0 / 0 / 0 (absent) / 1 (sentinel retained) | `par import parWorkbook.xlsx --out par-readback.blueprint.json` 0; `validate` readback 0 |
| export `outcomes` | public `stake-readback/config.json` | 0 / 0 / 0 (absent) / 1 (sentinel retained) | `validate stake-readback/outcomelibrary --deep` 0 |
| export `adapter` | public `stake-readback/config.json` | 0 / 0 / 0 (absent) / 1 (sentinel retained) | `import stake-readback/stakeengine --out export-adapter-readback-ok` 0 |
| export `workbook` | blueprint | 0 / 0 / 0 (absent) / 1 (sentinel retained) | `par import source.par.xlsx --out export-workbook-readback-final.blueprint.json` 0; `validate` readback 0 |

The export defaults were resolved by the CLI beside their sources:
`stake-readback/outcomelibrary`, `stake-readback/stakeengine`, and
`source.par.xlsx`; their `--out` variants were separately present before the
temporary consumer was removed. Thus both destination variants and the public
consumer paths were exercised, rather than inspecting internal APIs.

## Cross-mode outcomes rejection

A second blueprint with a different public manifest id was built to a Stake
adapter and publicly imported. A two-mode outcome config then referenced the
two resulting imported libraries. Both commands rejected it and left neither
the requested destination nor a `cross-*.staging-*` artifact:

```text
$ pokie export outcomes-cross-mode-config.json --to outcomes --out cross-dry --dry-run
exit=1; Cannot export target "outcomes" because source "outcomes-cross-mode-config.json" is not compatible.
cross_dry_destination_absent=yes cross_staging_absent=yes

$ pokie export outcomes-cross-mode-config.json --to outcomes --out cross-real
exit=1; outcome-library-bundle-cross-mode-provenance-mismatch: mode "bonus" has different provenance (game id/version, configHash, or pokieVersion) than the bundle's other modes.
cross_real_destination_absent=yes cross_staging_absent=yes
```

This confirms the dry path validates the same incompatible input and is
non-writing; the normal build supplies the detailed per-mode diagnostic.

## Public report diagnostic check and checksums

`report outcomeLibrary --format json --out outcome-report.json` exited 0.
Scanning only its public `descriptor.limitations` and `issues` found no raw
implementation class, registry name, filesystem path, or stack-frame form:
`public-report-scan=ok limitations=2 issues=0`. The two limitations were
plain consumer guidance about already-computed outcomes and detecting a
mid-read rebuild; neither exposed implementation diagnostics.

No generated artifacts are retained. SHA-256 values recorded before cleanup:

| Artifact | SHA-256 |
| --- | --- |
| `tsPackage/package.json` | `ae5360eb312f66524275576180d9cf01607361154b19b69cda9c107e1ca0a51b` |
| `tsPackage/dist/index.js` | `57d165fa9c5dbaaba24fd2bf36bb1b08fe2d77c92c2295cb22eed300cdc13394` |
| `outcomeLibrary/manifest.json` | `a3252823682618f5d0babcd5270f16c36049d2a125768738a8cbb2314d4deef4` |
| `outcomeLibrary/index_base.json` | `a182fcbf04144c8655bde5f50b6c32365bd945f63bdf6144e98b5d2ce6ff2d34` |
| `outcomeLibrary/outcomes_base.jsonl` | `c897c2270efed42126616dd6a7dbda06e9119ea65c6357e5d4eea88d5f18ae69` |
| `stakeAdapter/pokie-manifest.json` | `ef07cd40770ddf4f6d68b7164dbeb8e20fd341a7c35059597c1d83295a00220f` |
| `stakeAdapter/index.json` | `57e19f4de9b88cc3e45e7a5a2f11e0940b465ff9e09a5e1553d58b384807a5d5` |
| `parWorkbook.xlsx` | `c83e2aee7a971479a3c2b1d65517c6e02a741883ebb40bdd3bb2dc61e2f0dc90` |
| `par-readback.blueprint.json` | `b9cd4d21138deb08a42ef907eaf5b0ca89c0598277200774a988391b59b1e6f2` |
| exported outcomes manifest | `34c7031aee7535cb111c8d7a0a2d2ea4258f40aa7034d5ad04e4cda682e6e7ae` |
| exported adapter manifest | `916fba5f25158c7a4bceeafa4dee9b58fd8d85ab6a548bf83efe2660ed7bb62c` |
| exported workbook | `5d262b78664c884f7e63a11b24d27e24618523307c2229d1a031c94428172936` |
| exported-workbook readback | `b9cd4d21138deb08a42ef907eaf5b0ca89c0598277200774a988391b59b1e6f2` |
| public outcome report | `508fb94bc29bccd54772169e92957011c03dd96aaf10c802a06cd8d256e09e0b` |
