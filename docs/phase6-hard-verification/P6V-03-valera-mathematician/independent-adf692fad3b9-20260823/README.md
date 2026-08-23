# P6V-03 independent host rerun — passed

Candidate: `adf692fad3b98fe327f06f3c2de0101bbe334dd6`.

The final recovery used the candidate-source build from this checkout and
started Studio only with `node ./dist/cli/pokie.js --no-open`. It created a new
Studio configuration/registry, managed-project home, and Chromium profile; no
prior profile, registry, or project was reused. The rendered UI contained no
product error state.

Literal checklist outcomes:

- **Project types and model edits — passed.** Rendered controls created
  Recommended, Random, and Blank projects. In Blank, the verifier added a
  payline; marked A wild and B scatter; selected artwork through the focused
  native picker; entered literal reels; applied a successful generated reel
  with a maximum-consecutive constraint and an A stack; edited the C×3
  paytable; added bet 2 and Base mode; and added free-game awards.
- **Persistence and execution surfaces — passed.** The verifier saved, closed,
  and reopened Blank. Rendered persisted values included the layout, roles,
  selected artwork, generated reel/constraint/stack, paytable, bets/mode, and
  mechanics. Play rendered an ordinary win and feature result; Simulation
  rendered RTP/results; Replay rendered an exportable result; Build/Export
  rendered 891 generated outcomes and four Stake Engine export files.
- **Complete candidate-bound rerun — passed.** This transcript records the
  fresh-start preconditions and all local rendered success states. No
  P0/P1/material-P2 product defect was observed.

Bounded proof is in
[`recovery-complete-20260823.txt`](recovery-complete-20260823.txt). The two
representative screenshots are `recovery-complete-model.png`
(`3ef2151b741bfd35841af0530226b032e2718edc40b5a1b8b65b61152502a305`)
and `recovery-complete-artifacts.png`
(`9a167e7a2a60f3fcef2c7d02d40021f4e4645dff4ded0b0bf9dc7f4fb19b6e54`).
