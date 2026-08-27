# P8-05 Studio runtime journey

Candidate product source: `3ba937f9b27916bb64afa49184fcab597d0c93b8`. Evidence commit changes only bounded proof. Fresh Chromium/XDG profiles drove the built checkout through `node ./dist/cli/pokie.js --no-open`.

The rendered journey created `p8-runtime-proof`, completed real Play rounds, tested failed-reset preservation, successful reset and stale-session recovery, completed a two-round Simulation report, selected a recorded Session Spin in Replay, and generated both the exact outcome library and Stake Engine export. The two recovery responses are explicitly logged browser-protocol faults issued only after their respective visible Play action; no private Studio endpoint was invoked.

- `01-play-round.png` — completed real Play round.
- `02-failed-reset-preserves-context.png` — actionable failed reset preserves the completed round and controls.
- `03-stale-session-cleared.png` — stale no-active-project response clears stale controls.
- `04-simulation-report.png` — visible completed simulation/report.
- `05-replay-session-spin.png` — selected recorded Play round and local Replay inspector.
- `06-build-export-results.png` — visible outcome-library and export completion.

`ACTION-TRANSCRIPT.txt` contains bounded action timing and console/network diagnostics. `ARTIFACTS.sha256` records checksums only; generated output, profiles, raw logs, and automation are not retained.
