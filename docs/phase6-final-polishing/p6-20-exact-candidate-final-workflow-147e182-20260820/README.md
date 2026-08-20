# P6-20 exact-candidate public workflow rerun — passed

The accepted implementation candidate is
`147e182de681431c4c73393069c4206ae7fb216d`. Its production build completed
before this public workflow run.

The companion fixture was `pokie-examples` at
`6bb67dee3d2e8e98bab754e1000019701a17266b`. Its public `npm start` page, a
candidate-built package served by `pokie dev`, Studio Play, and Studio Replay
all visibly rendered `fixture-round`: `A/C/A | A/A/C | A/A/A`, credits `1004`,
win `5`, and `5x`.

Studio was driven with a fresh headed browser profile and visible
mouse/keyboard input. After closing the generated package, **Projects** showed
its Fixture Slot card and visible **Open** control; clicking it returned to the
Fixture Slot Workspace. The [action transcript](ACTION-TRANSCRIPT.txt) records
the four public paths. [Open control](projects-open-control.png) and
[reopened Workspace](projects-reopened-workspace.png) are the only retained,
non-duplicated rendered recovery captures. Temporary packages, browser
profiles, processes, logs, and checksum manifests are not committed.
