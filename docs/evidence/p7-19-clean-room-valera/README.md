# P7-19 clean-room Valera CLI journey

Independent host run for candidate `9bb5cf4ebdef008954262f388a4699e9f1cd0b5d` on 2026-08-26.

The run began in a new `/tmp/p7-19-clean-room-valera.*` directory. It installed only
the candidate's packed `pokie-1.3.0.tgz` (`sha256:82462d1cde78c375bb5e38d015c00e0e02b04d25d897f786358ef43d1dfea498`), then used
`./node_modules/.bin/pokie` and its public README/help. No checkout project, fixture,
developer state, or hand-edited generated artifact was used as an input.

The successful interoperable chain was: Blueprint -> runnable package -> validation ->
two seeded simulations -> Markdown report/diff/replay; then Blueprint -> Outcome Library
(deep validation/sample/exact replay), Stake export, and PAR workbook -> imported Blueprint.
`serve` and `dev --no-open` both started and their public health endpoints answered.

Three P2 findings prevent a PASS: the packed README points to missing relative `docs/`
files (including the certification config format); `export --help` promises Blueprint
input but rejects it for `--to adapter`; and `validate` misclassifies a successfully built
Stake export as an Outcome Library. See [TRANSCRIPT.md](TRANSCRIPT.md) and
[CHECKSUMS.sha256](CHECKSUMS.sha256).
