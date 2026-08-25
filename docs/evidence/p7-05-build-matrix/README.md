# P7-05 current-candidate independent verification — passed

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

On the focused recovery run, a fresh Studio was launched exactly as
`node ./dist/cli/pokie.js --no-open`, with a fresh visible Chromium profile.
The driver repaired the earlier Location failure by scrolling each rendered
control into the viewport and confirming browser focus on the labelled Location
input before entering the path. Its first Detect pointer event did not emit a
request; the visible enabled control proved it was not accepted, so one safe
idempotent retry was made. Studio then rendered its local pending state and
subsequently the successful `Detected a PAR sheet` result.

The public Projects flow then rendered local success at every step:
Detect → Register (registration confirmation) → Open (PAR dashboard's actual
`Build/Export` action) → Build/Export. The resulting Build artifact fieldset
showed `PAR sheet (.xlsx)` with an enabled Build button. Its selectable rendered
controls contained no WASM item. No generated projects, profiles, automation,
or raw logs are retained.

Bounded transient Studio transcript checksum (not retained as a raw log):
`sha256:1817eed2b09b86e93bf3a3b67719611f12c2363fe83774be1d069f9ad413c6f9`.
