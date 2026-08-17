# Independent host verification — candidate `95af92f9`

## Result: finding (`P1`)

The public `pokie-examples` fixture route works: a fresh browser opened the
index, clicked **Open deterministic round**, then clicked the visible **Play**
control.  The generated package Player, Studio Play, Studio Replay, and that
public example all visibly render the same seeded round grid and highlighted
A-line (`fixture-round`, round 1), stake/bet 1, win 5, and 5x multiple.

The persisted acceptance criteria nevertheless fail on required visible
cross-surface information:

- Studio Play explicitly renders **"Paytable unavailable"**, instead of the
  fixture paytable rendered by the generated Player and public example
  (`A=5`, `B=3`, `C=1`).
- Studio Replay explicitly renders **"Paytable unavailable"** and does not
  render a **Credits** value at all.  The other three surfaces visibly render
  credits `1004`.

This is a product/UI parity issue, not an unavailable external prerequisite.
It is visible in `11-studio-play.png` and `12-studio-replay.png`, and recorded
machine-readably in `acceptance-gaps.json`.

## Method and evidence

- `01c-candidate-build-node24-terminal.log` — successful clean candidate build
  under the workspace's Node 24 runtime.  (The earlier numbered logs preserve
  initial diagnostic attempts, including the system Node 18/Vite incompatibility
  and the registry's absence of unpublished `pokie@1.3.0`.)
- `02-` through `08-*.log` — generated package build/install/start, Studio
  start, and fresh `pokie-examples` Vite server.  `pokie-1.3.0.tgz` is the
  packed candidate installed into the generated package and copied examples
  workspace; it avoids substituting a registry version for the candidate.
- `12-xvfb-terminal.log` and `13-chrome-terminal.log` — fresh visible Chrome
  hosted on a fresh X display, with CDP used only for rendered coordinate input,
  text inspection, and screenshots.
- `browser-ui-rerun.mjs`, `14-browser-workflow-terminal.log`, and
  `browser-transcript.txt` — full browser transcript.  No Studio application
  endpoint, DOM injection, or application-state injection is used.
- `10-` through `13-` — rendered screenshot, body-text transcript, and rendered
  `[data-cell]` grid for each surface. `cross-surface-grid-comparison.json`
  proves the same nine cells across all four surfaces.

The generated fixture package is preserved in `generated-fixture-slot/`; its
temporary installed `node_modules/` was relocated only after all local servers
stopped and is not evidence. The exact input is `fixture-slot.blueprint.json`.
