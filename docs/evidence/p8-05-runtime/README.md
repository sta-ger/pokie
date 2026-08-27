# P8-05 Studio runtime journey — bounded inconclusive rerun

Candidate product source: `3ba937f9b27916bb64afa49184fcab597d0c93b8`. This evidence-only descendant changes no product source. A fresh Chromium profile drove the built checkout using `node ./dist/cli/pokie.js --no-open`.

The reached public Studio flow created `p8-runtime-proof`, completed two real Play rounds, demonstrated failed-reset preservation, successful reset, stale-session clearing and recovery, and completed the visible two-round simulation report. Screenshots are representative rendered proof; no generated game, export, profile, raw log, or automation source is retained here.

Replay was opened, but the harness had not selected the rendered **Session Spin** source before waiting for its round row. It therefore timed out at its own selector/readiness transition, not at a rendered product error. The persistent harness is repaired to select that source and then wait for its local selected-round state, but this invocation's two fresh-launch budget was exhausted. Build/Export was consequently not exercised.

- `01-play-round.png` — completed real Play round.
- `02-failed-reset-preserves-context.png` — actionable reset error with preserved completed round and usable control.
- `03-stale-session-cleared.png` — no-active-project boundary cleared stale Play actions.
- `04-simulation-report.png` — completed report and Recent runs result.

`ACTION-TRANSCRIPT.txt` records the action sequence, timings, limitation, and bounded diagnostics.
