# P6V-03 independent host rerun — inconclusive

Candidate: `adf692fad3b98fe327f06f3c2de0101bbe334dd6`.

Fresh-start preconditions: launch used `node ./dist/cli/pokie.js --no-open` from this candidate checkout, a newly created Chromium profile, and a newly created Studio registry/workspace. No existing Studio project, browser profile, registry, or output was reused.

Launch one rendered the public Studio home, opened **New Blueprint**, chose **Recommended**, pressed **Create Project**, and then rendered the saved project workspace for `starter-slot` at the managed Blueprint location. These observations are shown in `fresh-studio-home.png` and `saved-project-workspace.png`.

The harness's first workspace readiness predicate matched retained Design Game text before the SPA navigation had completed. The later rendered workspace proves that creation did succeed, so the expired early transition was not treated as a product defect. Its subsequent Game Model and Play controls were selected against the prior view, leaving the required model editing and playable-round checks incomplete. No rendered product error was observed. The prescribed second launch was not started because launch-one readiness did not pass.

Literal checklist outcomes:

- Create Recommended, Random, and Blank Projects; edit layout/paylines, symbols (wild/scatter), artwork, literal/generated reels, stacks/constraints, paytable, bets, modes, and mechanics: **not reached** (Recommended was created; all required editing plus Random/Blank creation were not completed).
- Save, close/reopen, persistence check, Play ordinary/feature behavior, Simulation RTP/results, Replay, Outcome Library, and Stake export: **not reached** (only managed Recommended-project creation/save and workspace render were observed).
- Rerun after every material defect and provide a fully complete literal checklist transcript: **not reached** (there was no rendered product defect; this driver transition/selector failure requires a fresh verification run).

SHA-256:

- `fresh-studio-home.png` — `8f6efa3b5c927cea08e96ea9c2b0dce111763d3aa53303b6192ce976fdae6dc3`
- `saved-project-workspace.png` — `8e66ac386a6140dbdd467003802ca4effceaf1e1fa4c352bbea02e11a904af94`
