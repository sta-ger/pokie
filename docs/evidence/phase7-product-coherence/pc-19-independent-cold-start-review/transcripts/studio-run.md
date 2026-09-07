# Fresh Studio workflow transcript

Candidate-built Studio was launched at 2026-09-07T15:37:11Z using
`node ./dist/cli/pokie.js --no-open`, with a new registry/profile under the
verifier harness. The rendered Design screen exposed **Create game**. Its
ready state was the starter-game editor; one activation rendered “Your game
was saved. Opening its workspace…” and then the editable Starter Slot
workspace.

From that workspace, the visible **Play** tab led to **New Play session**.
That local transition exposed **Spin**; one Spin rendered a settled **Round
complete** result. The visible **Simulation** tab led to **Run Simulation**;
one activation rendered its accepted state and then a completed 10,000-round
result (RTP 100.08%, duration 0.2s). The visible **Replay** tab then rendered
the replay controls.

The visible **Build/Export** tab rendered the Outcome Library, TypeScript Game
Package, Stake Engine export, and PAR sheet cards. The outcome-library action
rendered its local result. On the TypeScript Game Package card the ready state
said “Status: Ready to build”; one **Build** activation rendered the local
TypeScript package build result, followed by **Open as Project** on that same
card. Its local result opened the package workspace; it was not labelled PAR
or `parWorkbook.xlsx`. One **Close project** activation then rendered the
project-list state. No action-local terminal failure was rendered.

This is the compact transcript of harness run `run-1788795429872`; the runtime
copy is not retained as committed evidence.
