# P6-08 independent host verification

Candidate `e00e80180b90292551e19e7a90a5e9b624923345` was built with the local
Node `v24.19.0` runtime, then used to generate `generated-package/` from the
deterministic `fixture-slot` Blueprint. The package was installed from this
candidate's own packed `pokie-1.3.0.tgz`, rather than a workspace alias or a
registry dependency.

The real generated-package `npm start` command launched `pokie dev .` on
ports 4511/4512. A fresh Chrome instance drove only rendered controls through
normal CDP mouse/wheel/keyboard events. It captured the package Player UI, then
Studio Play and Studio Replay using `fixture-round` and round 1.

Passing observations:

- `24-package-export-resolution.log` resolves `pokie/client/player` from the
  installed package's `node_modules/pokie/dist/cli/client/player/index.js`, and
  shows its public `renderPlayerRound` export.
- `20-generated-package-npm-start-player.{png,txt}` shows the real package UI
  from `npm start`: 3x3 grid, artwork/text fallback symbols, paytable, bet,
  credits, win, multiplier, paylines and Spin control.
- `21-studio-play-seeded-round.{png,txt}` and
  `22-studio-replay-seeded-round.{png,txt}` visibly agree on the seeded grid
  `[["A","C","A"],["A","A","C"],["A","A","A"]]`, a highlighted
  A line, stake 1.00, credits 1004, and total win 5.00 (5.00x). The same result
  is independently printed by the public `pokie replay` CLI in
  `25-cli-replay.log`.

Finding: the generated package's browser Player has no rendered seed or
session-creation control. Its public UI always creates an unseeded session on
load, so a user cannot select `fixture-round` and reproduce the Studio
Play/Replay round through package `npm start`. The captured package UI instead
shows a different unseeded screen and 0 win. `browser-ui-rerun-transcript.txt`
records the rendered UI actions and this limitation; the browser driver source
is retained as `browser-ui-rerun.mjs`.

Build and lifecycle evidence is retained in `06-build-node24.log`,
`11-generate-package.log`, `12-pack.log`, `13-generated-package-install.log`,
`14-generated-npm-start.log`, `15-studio.log`, `16-chrome.log`, and
`23-browser-ui-rerun-terminal.log`. `01-build.log` documents the initial
unsupported Node 18/Vite attempt before the supported local Node 24 rerun.
