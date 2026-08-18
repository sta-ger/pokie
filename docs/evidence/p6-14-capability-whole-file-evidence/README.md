# P6-14 independent host verification — finding

Candidate: `ab731169fce04c1105c375c465faae75ce757a1c` (the checked-out HEAD). Host: Linux, Node `v18.19.1`, npm `11.16.0`.

The public CLI was rebuilt from this checkout. Its Studio-client bundle could not finish because the installed Vite/Rolldown imports Node's newer `util.styleText`; the rebuilt CLI executable was produced before that host-runtime incompatibility.

Using that executable against a fresh temporary, finite Blueprint, the native Outcome Library build, validation, report, sample, simulation, and canonical replay commands completed. However, `pokie serve <bundle> --mode base` accepted the bundle and listened locally, then its public `POST /sessions` endpoint returned HTTP 500: `crypto is not defined`. This violates the native Outcome Library serving/session capability.

The exact eight requested whole-file suites were also run once in-band. Five passed; three failed (eight tests), so the required all-green result was not obtained. `ServeCommand.test.ts` independently reproduces the 500. The two Stake-related suite failures and a public Stake-adapter build both stop at `zlib.zstdCompressSync is not a function` on this Node 18 host; Node 18 does not provide that zstd API. WASM public commands truthfully denied unsupported compilation/republication (excerpted in `machine-results.txt`).

Only summaries, excerpts, and hashes are committed here. All generated Blueprint artifacts, reports, full logs, temporary workspace, server process, and build output were removed after capture.
