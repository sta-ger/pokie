# P6-11 independent host verification

Candidate: `ca98d7d1bb2bca78f323cb85f783244e48ec562a`.

`browser-ui-workflow.mjs` ran a fresh production Studio/client with Chrome CDP used only for visible coordinate clicks, keyboard entry, wheel scrolling, and rendered screenshots. The final browser transcript records the actual UI path: Blueprint Build/Export preflight, Outcome build, Add to Projects, Open as Project, exact analysis and sample, Play/Spin, 25-round Simulation, Replay of the recorded spin, fresh registry-visible Outcome generation, and Stake Engine export.

The CLI logs record an invalid Blueprint diagnostic (`reels` must be a positive integer), source correction and deep-valid retry, then a public `pokie init` code-first package with `base` and `ante` modes. The code-first outcome rebuild explicitly reused its first registered Outcome destination and did not create the alternate requested directory; Stake output preserved mode/bet/stake/cost parity.

Key files:

- `browser-transcript.txt` and `01`–`08` screenshots/text captures
- `invalid-blueprint-diagnostic.log`, `invalid-blueprint-retry.log`
- `code-first-init.log`, `code-first-build.log`, `code-first-workflow.log`
- `artifacts/` generated Blueprint, Outcome, Stake, code-first package, and reports
