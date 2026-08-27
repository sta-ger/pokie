# P8-05 exact-candidate Studio browser verification

Candidate: `2d70f4e959c4f03040d68b5ba954a44ba61a2563`.

Each recorded run used a fresh isolated Studio and visible Chromium profile, launched from this checkout exactly with `node ./dist/cli/pokie.js --no-open`. The retained proof shows a newly-created Play session with no invented round, a settled Play round, delayed real Reset loading alongside that retained round, normal Reset replacement, one rendered recoverable-spin retry, and a completed Simulation report.

- `01-initial-session-no-prior-round.png` — new session has no prior round.
- `02-completed-play-round.png` — real settled round.
- `03-delayed-reset-preserves-round.png` — “Spinning…” and the completed prior round are concurrently visible.
- `04-recoverable-play-failure.png` — rendered recoverable Play failure.
- `05-simulation-report.png` — completed two-round Simulation result.
- `06-replay-session-spin.png` — the actual rendered “Session Spin” choice and a selected recorded round’s inspector, including its downloadable JSON action.
- `07-outcome-and-export-results.png` — the Outcome Library card’s local generated-outcomes result and the Stake Engine Export card’s local exported-files result.

The final fresh-profile continuation corrected the local-card predicate, then observed the Outcome Library card’s own generated result before enabling and running the Stake Engine Export card. Both rendered result messages appear in `07-outcome-and-export-results.png`. `ACTION-TRANSCRIPT.txt` is a concise action record; `ARTIFACTS.sha256` covers every retained screenshot. Generated project/output trees and profiles were removed.
