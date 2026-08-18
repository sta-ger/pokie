# P6-14 exact-candidate capability verification — passed

Candidate: `331e343d0fa44dd81e9874ffec968880f02bc2ea` (checked-out `HEAD`). Host: Linux, Node `v24.18.0`, npm `11.16.0`.

The complete bounded capability suite is green: **8/8 suites, 112/112 tests**. [`machine-results.txt`](machine-results.txt) records the exact eight whole-file paths and the command used; its candidate SHA is the SHA above.

Using the freshly rebuilt public CLI and a temporary `--blank` Blueprint, native Outcome Library build, deep validation, sampling, 12-round simulation, replay, Stake-adapter build, and public local `serve` endpoints all completed. The native library contained 91,125 exact outcomes; `GET /health`, `POST /sessions`, and `POST /sessions/:id/spin` returned success, and the spin included a public replay identity.

[`CHECKSUMS.sha256`](CHECKSUMS.sha256) identifies the unretained public-workflow outputs. No generated project/output tree, raw log, browser data, or automation script is committed.
