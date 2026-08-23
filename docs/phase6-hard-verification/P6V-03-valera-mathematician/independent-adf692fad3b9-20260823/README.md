# P6V-03 independent host rerun — inconclusive

Candidate: `adf692fad3b98fe327f06f3c2de0101bbe334dd6` (this evidence-only
descendant changes documentation only).

Each public launch used `node ./dist/cli/pokie.js --no-open` from this checkout
and a newly created Chromium profile, registry path, and workspace. No prior
browser profile was reused. The stable recovery harness was kept outside this
repository at the controller-provided path.

The first launch showed that **Create Project** saves the current Design Game
blueprint rather than navigating straight to Workspace. The repaired second
launch then reached Projects. The third fresh journey, through rendered UI,
created **Recommended**, **Random**, and **Blank** managed Blueprint projects,
selected the Recommended project, and opened its Workspace (Overview, Game
Model, Play, Simulation, Replay, and Build/Export navigation all rendered).
No rendered product error appeared.

The fourth permitted launch again created all three types, but its Projects
screen rendered 985 unrelated registrations. The harness could therefore not
select the expected unique Recommended row; this is a driver/registry-isolation
failure, not a rendered product symptom. The launch allowance was exhausted.

Literal checklist outcomes:

- Create all project types and edit layout/paylines, wild/scatter, artwork,
  literal/generated reels, stacks/constraints, paytable, bets, modes, and
  mechanics: **not reached**. Creation and opening the Recommended workspace
  were observed; the required edit coverage was not reached.
- Save, close/reopen, persistence, Play ordinary/feature behaviour, Simulation
  RTP/results, Replay, Outcome Library, and Stake export: **not reached**.
  The workspace was rendered, but these interactions were not completed.
- Complete candidate-bound rerun transcript after all material defects:
  **not reached**. No P0/P1/material-P2 was rendered; the bounded transcript is
  incomplete because the allowed fresh journeys ended in harness isolation or
  selection failures.

Retained screenshots remain truthful evidence for the initial public home and
saved workspace observations. SHA-256:

- `fresh-studio-home.png` — `8f6efa3b5c927cea08e96ea9c2b0dce111763d3aa53303b6192ce976fdae6dc3`
- `saved-project-workspace.png` — `8e66ac386a6140dbdd467003802ca4effceaf1e1fa4c352bbea02e11a904af94`

The subsequent focused recovery is recorded in
[`recovery-20260823.txt`](recovery-20260823.txt). It confirmed rendered
Recommended and Random creation/workspace transitions and identified a
harness-only Blank-entry defect before its remaining coverage could begin.
