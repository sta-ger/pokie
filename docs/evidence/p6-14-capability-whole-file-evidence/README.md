# P6-14 independent host verification — passed

Candidate: `b880108c1da02a8539af3e6426c5be2fc0430f41` (checked-out `HEAD`). Host: Linux, Node `v24.18.0`, npm `11.16.0`.

This is independent, machine-owned evidence. The candidate's CLI and Studio client were rebuilt with `npm run build-cli`; generated public-workflow trees and full host logs were removed after the observations below were reduced to this bounded record and artifact checksums.

## Whole-file regression set

The exact requested command completed green: **8/8 suites, 112/112 tests**. See [`machine-results.txt`](machine-results.txt) for the command and suite list.

## Public capability workflow

Using only the rebuilt public `pokie` CLI, a fresh finite Blueprint was created with:

```text
pokie create 'P6-14 Finite Host Capability' --blank --out <temporary>/finite.blueprint.json
pokie build <blueprint> --target outcomeLibrary --out <temporary>/outcome-library
```

The native Outcome Library contained 91,125 exact outcomes. `validate --deep`, `report --format json`, `sample`, `sim --rounds 12`, and `replay --round 2` all succeeded. `pokie serve <bundle> --mode base` served `GET /health` (`200`), its public `POST /sessions` contract returned **201**, and `POST /sessions/:id/spin` returned **200** with a replay identity. This independently exercises the repaired server session-identifier path.

`pokie build <blueprint> --target stakeAdapter` also completed and published its Stake adapter. The two public WASM observations were intentionally negative and truthful: a Blueprint cannot build to WASM because no source grants that capability/no arbitrary package-to-WASM compiler exists; an opaque `.wasm` without a compatible sidecar is not recognized and does not imply execution support.

Only compact results and checksums are committed. No generated Blueprint, Outcome Library, Stake adapter, simulation/replay output, raw logs, browser data, or automation files are retained.
