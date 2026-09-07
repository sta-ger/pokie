# PC-19 independent cold-start review — inconclusive driver record

Candidate reviewed: `f02673948a8d4aba07ce42a2dd354be9a1f73447`.

The reviewer began from a fresh Studio registry and browser profile, without
reading product source, roadmap, known findings, recovery material, or earlier
evidence. Two isolated candidate-CLI launches were used (the allowed maximum).

1. The first rendered the `Start a game` design surface, including all six
   valid design sections and the enabled `Create game` action.
2. The second recorded the ready state, activated `Create game` once, then
   rendered its local acceptance message (`Your game was saved. Opening its
   workspace…`) and the resulting Starter Slot workspace. The workspace showed
   the visible role surfaces Overview, Game Model, Play, Simulation, Replay,
   and Build/Export, with a valid project.

No action-local product error was rendered in either reached flow. The generic
semantic driver stopped on the workspace overview rather than traversing the
six visible role surfaces; both permitted fresh launches had then been used.
Consequently this record deliberately makes no pass/fail claim about the
unreached roles, interoperability, parity, player view, or delta-rerun gate.
This is a driver-inconclusive result, not a product finding.

## Delta recovery receipt

Candidate code remained `f02673948a8d4aba07ce42a2dd354be9a1f73447`; the
only predecessor delta was this evidence README. A fresh candidate build was
packed as `pokie-1.3.0.tgz` with SHA-256
`01205e69ea4b3a911fb56231a0ec8d54059e425eb38df5eea51573fd29b691a4`, then
installed into a disposable external directory. Its installed CLI reported
`1.3.0` and created a seeded (`19`) valid `pc19-delta` blueprint, SHA-256
`7fd0fa6c2637dd47f948560a9319ff5ebf03ed834f66a5c0d8edb594fdfd8e17`.

The first new fresh-profile candidate-CLI Studio launch again created a valid
Starter Slot and reached workspace navigation. It exposed a driver assertion
fault: matching page text found persistent navigation labels before the new
role had rendered. The repaired harness now requires the actual route and
local title; no product error was observed.

The second new fresh-profile launch exercised the saved-design delta up to the
real UI boundary: `Show advanced options`, then the rendered `Load from path`
`Browse…` control. Its exact local ready control was enabled and the activation
was accepted. Chromium did not render a visible OS-native file picker after
that page-side driver activation, so the required focus-verified native path
entry and subsequent `Load` could not truthfully be performed. No later local
terminal state exists, and no page-wide error is attributed to this action.

This is therefore driver-inconclusive rather than a product finding. The
packed tarball, generated blueprint, profiles, raw transcripts, screenshots,
and harness all remain outside evidence; the worktree tarball was moved to
trash after its digest was recorded.
