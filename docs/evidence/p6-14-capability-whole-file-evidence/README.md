# P6-14 independent host verification — passed

Candidate: `37683e4b2d87e383bd91ec428a9a3da3a114ae68` (checked-out `HEAD`). Host: Linux, Node `v24.18.0`, npm `11.16.0`.

The three remaining named whole-file suites are green: **3/3 suites, 46/46 tests**. The candidate's public CLI and Studio client were freshly rebuilt first.

Using only that rebuilt `pokie` CLI and a fresh temporary `--blank` Blueprint, native Outcome Library build, deep validation, JSON report, sample, 12-round simulation, and canonical replay all completed. The resulting library contained 11,500 exact outcomes. Its public `serve` endpoint returned `200` for `GET /health`, `201` for `POST /sessions`, and `200` for `POST /sessions/:id/spin`; the spin response included its public replay identity.

The same Blueprint published a Stake adapter with its expected manifest, index, lookup, and compressed-books files. The public WASM checks truthfully rejected both a Blueprint build (no supported source/arbitrary package-to-WASM compiler) and an opaque `.wasm` (no compatible `PokieWasmComponentManifest` sidecar), without claiming execution support.

[`machine-results.txt`](machine-results.txt) is the concise transcript; [`CHECKSUMS.sha256`](CHECKSUMS.sha256) identifies the unretained generated outputs. No generated project/output tree, raw log, browser data, or automation script is committed.
