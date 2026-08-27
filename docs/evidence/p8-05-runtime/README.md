# P8-05 exact-candidate Studio browser verification

Candidate: `2d70f4e959c4f03040d68b5ba954a44ba61a2563`.

Each recorded run used a fresh isolated Studio and visible Chromium profile, launched from this checkout exactly with `node ./dist/cli/pokie.js --no-open`. The retained proof shows a newly-created Play session with no invented round, a settled Play round, delayed real Reset loading alongside that retained round, normal Reset replacement, one rendered recoverable-spin retry, and a completed Simulation report.

- `01-initial-session-no-prior-round.png` — new session has no prior round.
- `02-completed-play-round.png` — real settled round.
- `03-delayed-reset-preserves-round.png` — “Spinning…” and the completed prior round are concurrently visible.
- `04-recoverable-play-failure.png` — rendered recoverable Play failure.
- `05-simulation-report.png` — completed two-round Simulation result.
- `06-replay-session-spin.png` — the actual rendered “Session Spin” choice and a selected recorded round’s inspector, including its downloadable JSON action.

The final fresh-profile continuation corrected the Replay selector and completed its rendered inspector. It then clicked outcome-library generation, but its page-wide text predicate did not prove the generator’s local success/error state before it tested the export action; no export result, local generation result, or product error was observed. Therefore outcome/export inspection is not claimed and this evidence does not establish a product defect. `ACTION-TRANSCRIPT.txt` is a concise action record; `ARTIFACTS.sha256` covers every retained screenshot. Generated project/output trees and profiles were removed.
