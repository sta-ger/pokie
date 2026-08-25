# P7-05 current-candidate independent verification — inconclusive Studio driver

Candidate: `f2a1f47c18698cfb1d7691ed5ae2027ce692585d` (2026-08-25).

The required one-command targeted run named all 17 requested files. Jest
reported **17 passed, 17 total; 1506 passed, 1506 total**. It then printed its
open-handle notice and stayed alive; after a bounded poll it was interrupted.
No second Jest command was launched.

`npm run build-cli` passed. A fresh, public `node ./dist/cli/pokie.js` CLI
matrix completed all nine supported cells: Blueprint → tsPackage, Outcome
Library, Stake Engine; tsPackage → Outcome Library, Stake Engine; Outcome
Library → Outcome Library, Stake Engine; Stake Engine → Stake Engine; PAR
workbook → PAR workbook. For every cell the default output and an explicit
`--out` were structurally read back by public `pokie inspect`; `--dry-run`
created no output; and an occupied destination retained its sentinel. The
fresh tsPackage's `node_modules/pokie` was a symlink, `pokie validate` passed,
and both runtime-derived outputs built and inspected successfully.

Matrix summary only (all generated sources and artifacts were removed):
`sha256:707ea10258076d8d3757e698bc0dcec545f178df9053ea315345ae30ad461f0b`.

One fresh Studio was launched exactly as `node ./dist/cli/pokie.js --no-open`.
Through its public Projects URL, Chrome CDP located the rendered Location
control and sent mouse/keyboard input twice: the first try and the one allowed
safe retry (with Tab blur). In both cases the rendered value stayed empty and
the still-rendered Detect control said, “Enter a project location or use Browse
to enable Detect.” No Detect request, registration, Open, or build was emitted,
and Studio rendered no product error. Therefore the public PAR
Detect → Register → Open → Build/Export observation, including the PAR card
and non-selectability of WASM, was not reached. This is retained as driver
inconclusive, not a product finding.

Bounded Studio transcript checksum (not retained as a raw log):
`sha256:fad60c25b3a65517a280fc37686ae411a8a0647cc6936dbc49342ad1c70d4906`.
