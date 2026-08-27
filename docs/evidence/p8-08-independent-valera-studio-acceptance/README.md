# P8-08 independent Studio UX verification

Candidate: `36003173888e06c3bc20646969b7a98e7fc3d7e1`  
Date: 2026-08-27

`npm run build` completed successfully. A final independent, fresh-profile
Studio journey launched this source checkout with exactly
`node ./dist/cli/pokie.js --no-open` and real visible Chromium mouse input.
It created the rendered starter game, opened a new Play session and completed
a Spin, ran Simulation through its enabled Review state, loaded Replay through
its rendered next `Run again` state, generated the exact outcome library, and
ran Stake Engine Export through its rendered `Open output folder` result.
No rendered alert or assertive error was present at any checkpoint.

Earlier fixed waits for Replay download and export wording expired without a
product error; the later local `Run again` and `Open output folder` controls
show the respective operations succeeded. Those thresholds are therefore not
product findings. Retained evidence is deliberately limited to this concise
transcript; generated profiles, logs, outputs, screenshots, and harness files
are not committed.
