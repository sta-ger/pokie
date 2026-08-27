# P8-05 exact-candidate Studio browser rerun

Candidate: `2d70f4e959c4f03040d68b5ba954a44ba61a2563`.

Fresh isolated Studio and visible Chromium profiles used the candidate checkout entrypoint exactly as `node ./dist/cli/pokie.js --no-open`. The rendered journey created a managed starter game, opened Play, completed a real round, held that real Reset request at the browser transport boundary, and captured the resulting visible loading state. The server's normal response was then released and visibly replaced the old round with a fresh session.

- `01-initial-session-no-prior-round.png` — a new Play session shows “No round played yet -- Spin to play.”
- `02-completed-play-round.png` — a real settled Play round.
- `03-delayed-reset-preserves-round.png` — visible “Spinning…” feedback and the completed prior round together.
- `04-recoverable-play-failure.png` — the rendered recovery state after one browser-transport failure, followed by one successful rendered retry (recorded in the transcript).
- `05-simulation-report.png` — a completed two-round Simulation result.

The run reached Replay but its harness's exact-button selector did not recognize the rendered Session Spin segmented-control option. No further Studio launch was permitted, so Replay and Build/Export are intentionally not claimed. `ACTION-TRANSCRIPT.txt` records the bounded actions and terminal selector observation. `ARTIFACTS.sha256` records only retained-evidence checksums; generated project/output trees and profiles were removed.
