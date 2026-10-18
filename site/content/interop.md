# Interop: PAR, Stake and WASM

## Preview conversions

Use `pokie inspect SOURCE`, then `pokie build SOURCE --target TARGET --out NEW_DESTINATION --dry-run`. A planned source-kind path can still fail on a model's missing capabilities or unsupported composition. Supported intermediates are automatic; do not invent a top-level export command. Execution rechecks bindings/destinations after preview. [Build contract](cli-api.md#build-and-conversion).

## Canonical PAR

```sh
pokie build weighted.blueprint.json --target parWorkbook --out weighted.xlsx
pokie build weighted.xlsx --target blueprint --out returned.blueprint.json
```

Start with the [weighted example](weighted-sequences.md). Canonical workbook readback preserves represented math, fractional bets, missing/zero payouts, grants and exact/weighted reels. Lossless eligibility requires complete supported geometry/mechanics, byte-bound provenance and no ignored headerless data, duplicate columns, unknown/duplicate Meta keys or ignored Meta columns. A matching model hash alone is insufficient. Studio import/re-export does not implicitly save the draft. [PAR import/export source guide](../../docs/cli.md).

## Outcome libraries and Stake

For a supported Blueprint or package, `pokie build SOURCE --target outcomeLibrary --out NEW_LIBRARY --dry-run` previews generation strategy and limits. Exact enumeration and bounded sampling are different; a sampled library cannot claim the generating game's exact distribution. Precomputed weighted outcomes cannot recover authored reel/model/code definitions.

`pokie build SOURCE --target stakeAdapter --out NEW_STAKE --dry-run` previews Stake conversion, using supported intermediates. Preserve native books, event identities, mode costs and uint64 decimal-string weights. Converting those weights to JavaScript numbers can destroy tiny positive probabilities. Compatible POKIE-exported Stake sources can reconstruct within their declared provenance; arbitrary native or optimizer-tuned Stake sources are not thereby lossless POKIE model inputs. Native-only candidates retain inspect/analysis authority. [Import](../../docs/stake-engine-import.md), [export](../../docs/stake-engine-export.md) and [standalone limits](../../docs/stake-engine-standalone.md).

## Canonical WASM

```sh
pokie build weighted.blueprint.json --target wasm --out weighted.wasm
pokie validate weighted.wasm
pokie run weighted.wasm --seed portable-28
pokie sim weighted.wasm --rounds 100 --workers 1 --seed portable-28 --format json --out portable-report.json
pokie replay weighted.wasm --round 100 --seed portable-28 --out portable-replay.json
pokie weighted.wasm
```

The canonical component and integrity sidecar bind executable bytes, model and capabilities. Ordinary lines/ways/clusters use shared `pokie.math.v2` math; feature-aware components support declared authored feature/weighted-sequence cells. Host code owns RNG continuation, ledger and IO; compact executable state retains current progress, not completed-round history. Root/browser/wasm callers consume the same contract; `@fromstan/pokie/wasm` is import-only.

Custom code/services are not compiled by declaring a source type. Missing/swapped/stale sidecars fail before execution authority. Legacy manifest-only components are inspection-only. `serve` is unavailable for canonical WASM; Studio uses its production Web Worker instead. Portable simulation uses one worker and fixed rounds, with no adaptive convergence or `--mode`; portable replay also rejects `--mode`. Do not infer optimizer eligibility from runtime feature support: tuning additionally requires an explicit reproducible source binding and its narrower population. [Current WASM limits](../../docs/wasm-compatibility-boundary.md).
