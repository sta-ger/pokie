# P7-08 independent packed-CLI rerun

Candidate: `5f122c54e788ad157bd0384d15ebf9c54e1c2084` (the checked-out HEAD before the run; clean worktree).

On 2026-08-25, `npm pack --pack-destination /tmp` built this checkout through `prepack`, producing
`pokie-1.3.0.tgz` with SHA-256 `3cf493597289949f37ae0fb65772b7509e6e4e4d38655535336ba3eb9801af66`.
I created one fresh temporary directory and installed that tarball only with:

```text
npm install --ignore-scripts --no-audit --no-fund /tmp/pokie-1.3.0.tgz
node ./node_modules/pokie/dist/cli/pokie.js --version     # 1.3.0
```

Every command below used exactly `node ./node_modules/pokie/dist/cli/pokie.js` from that fresh install; no
checkout CLI or installed self-dependency was used. The input was the shipped
`examples/parsheets/starter.blueprint.json` copied into the temporary directory. Its blueprint hash was
`ed4953d3c1e8bc2c8eaa6670bdbe3aee564a65c8245f2b52c7449e7e4e14f4cc`.

## Public surface and exits

`build --help` advertised exactly `tsPackage`, `outcomeLibrary`, `stakeAdapter`, and `parWorkbook` as targets
(exit 0). `export --help` advertised `outcomes`, `adapter`, and `workbook` (exit 0). The public rejection check
`build source.blueprint.json --target wasm` exited 1 with:

```text
Unknown --target "wasm". --target must be one of: tsPackage, outcomeLibrary, stakeAdapter, parWorkbook.
```

| Surface | Default build / readback | Explicit `--out` | `--dry-run` | Occupied destination |
| --- | --- | --- | --- | --- |
| `tsPackage` | `build source.blueprint.json --target tsPackage` 0; `validate tsPackage` 0 | `--out ts-custom` 0 | default destination 0; no destination created | `--out ts-conflict` 1 |
| `outcomeLibrary` | `build source.blueprint.json --target outcomeLibrary` 0; `validate outcomeLibrary --deep` 0; `report ... --format json --out outcome-report.json` 0 | `build outcomeLibrary --target outcomeLibrary --out outcome-custom` 0 | `--out outcome-dry --dry-run` 0; no destination created | `--out outcome-conflict` 1 |
| `stakeAdapter` | `build source.blueprint.json --target stakeAdapter` 0; `import stakeAdapter --out stake-imported` 0 | `build stakeAdapter --target stakeAdapter --out stake-custom` 0 | `--out stake-dry --dry-run` 0; no destination created | `--out stake-conflict` 1 |
| `parWorkbook` | `build source.blueprint.json --target parWorkbook` 0; `par import parWorkbook.xlsx --out par-readback.blueprint.json` 0; `validate par-readback.blueprint.json` 0 | `build parWorkbook.xlsx --target parWorkbook --out par-custom.xlsx` 0 | `--out par-dry.xlsx --dry-run` 0; no file created | `--out par-conflict.xlsx` 1 |

All occupied-destination messages named the selected target and gave the next step, e.g.:

```text
Cannot build target "stakeAdapter" because its destination is unavailable. "stake-conflict" already exists and is not empty.
... Next: choose a different --out path or remove the existing destination, then retry.
```

The same public export aliases also completed and were read back:

| Command | Exit | Readback |
| --- | ---: | --- |
| `export source.blueprint.json --to workbook --out export-workbook.xlsx` | 0 | `par import export-workbook.xlsx --out export-workbook-readback.blueprint.json` 0 |
| `export stake-imported/config.json --to outcomes --out export-outcomes` | 0 | `validate export-outcomes --deep` 0 |
| `export stake-imported/config.json --to adapter --out export-adapter` | 0 | `import export-adapter --out export-adapter-readback` 0 |
| `export source.blueprint.json --to workbook --out export-workbook-conflict.xlsx` (preoccupied) | 1 | `Cannot export target "workbook" because its destination is unavailable ... Next: choose a different --out path or remove the existing destination, then retry.` |

## Structural checks

All checks below were performed in the temporary directory before it was deleted; only checksums are retained.

| Artifact / required structure | SHA-256 |
| --- | --- |
| `tsPackage/package.json`; `tsPackage/dist/index.js` | `ae5360eb312f66524275576180d9cf01607361154b19b69cda9c107e1ca0a51b`; `57d165fa9c5dbaaba24fd2bf36bb1b08fe2d77c92c2295cb22eed300cdc13394` |
| `outcomeLibrary/{manifest.json,index_base.json,outcomes_base.jsonl}` | `06e21e2635f05ec5f1810b78fb826a7f3b6f703c161386f9eec26041a395a0ae`; `a182fcbf04144c8655bde5f50b6c32365bd945f63bdf6144e98b5d2ce6ff2d34`; `c897c2270efed42126616dd6a7dbda06e9119ea65c6357e5d4eea88d5f18ae69` |
| `stakeAdapter/{pokie-manifest.json,index.json}` | `019663f917425224e7dd545d029f6d8b1f43d5db4691d37fb6d590154a0a9488`; `57e19f4de9b88cc3e45e7a5a2f11e0940b465ff9e09a5e1553d58b384807a5d5` |
| `parWorkbook.xlsx`; `par-readback.blueprint.json` | `e17489e08fa950c3287858ff1bb57c95118a13cb23cc25eaa997f0867bcefb25`; `b9cd4d21138deb08a42ef907eaf5b0ca89c0598277200774a988391b59b1e6f2` |
| `export-workbook.xlsx`; `export-outcomes/manifest.json` | `e94c8e6ee1e9fe942e594ec5de6fadde79b973a495f0283dae5db0d12bb420e5`; `591065d55a037f4b1fac53614723062782d98217061b669920f3bcc83e6c5075` |
| `export-adapter/pokie-manifest.json`; `export-adapter-readback/config.json` | `39271b806b5e3d26b4725563f8262132d4aec7ad39f7af0220e4149005bc414e`; `d1fa6f8610b2468fa9825da511abb4f189913e5b9cc7ed719ada0a2c3bef55b4` |

## Finding: raw class name in a public report

The required no-raw-class-diagnostic check did **not** pass. `report outcomeLibrary --format json --out
outcome-report.json` exited 0 but emitted this public `descriptor.limitations` string:

```text
Draws are only ever atomic against this bundle's own current on-disk content -- a rebuild mid-read surfaces as a PreGeneratedOutcomeSourceConflictError, never a silently stale result.
```

`PreGeneratedOutcomeSourceConflictError` is an implementation class name, so this retained transcript does not
claim the required absence of raw internal class diagnostics. All other captured failure messages above were
target-named actionable diagnostics and contained no raw registry, filesystem, or Node stack diagnostic.
