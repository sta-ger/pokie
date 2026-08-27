# P8-05 Studio runtime journey — bounded driver inconclusive

Candidate product source: `3ba937f9b27916bb64afa49184fcab597d0c93b8`. This evidence descendant changes no product source. Fresh Chromium/XDG profiles drove the built checkout with `node ./dist/cli/pokie.js --no-open`.

The rendered public Studio journey created `p8-runtime-proof`, completed real Play rounds, verified failed-reset preservation, successful reset, stale-session clearing/recovery, and completed a two-round Simulation report. The recovery rerun selected the actual Session Spin source and rendered the selected recorded round's Replay inspector. Build/Export was opened and its exact outcome-library action clicked, but a harness readiness condition was too broad and did not prove a local generator completion/error before export. No rendered product error was observed, and the four-launch budget prevented another run.

- `01-play-round.png` — completed real Play round.
- `02-failed-reset-preserves-context.png` — actionable reset failure with preserved round and controls.
- `03-stale-session-cleared.png` — stale context cleared to New Play session.
- `04-simulation-report.png` — completed Simulation report.
- `05-replay-session-spin.png` — selected recorded Play round and local Replay inspector.

`ACTION-TRANSCRIPT.txt` records bounded timings and diagnostics. Generated output, profiles, raw logs, and automation are not retained.
