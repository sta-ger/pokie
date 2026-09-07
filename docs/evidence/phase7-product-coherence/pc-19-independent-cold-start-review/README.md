# PC-19 independent cold-start review — P1 finding

Candidate code reviewed: `f02673948a8d4aba07ce42a2dd354be9a1f73447`.
This evidence descendant contains no code diff from that candidate.

The retained `blind-generation-*.md` receipts document the original isolated
launch and its findings freeze before recovery disclosure, source, roadmap,
known findings, fixes, or prior acceptance evidence were read. The prior role,
player, Build/Export and visual receipts in `generation-5/` remain valid
evidence of the reached paths; this review is not passed because the fresh
saved-design lifecycle below contradicts its own visible success claim.

## Current-candidate delta: saved design Browse and Save

The candidate was freshly built with `npm run build-cli`. Its public CLI then
created `Pc19 Delta` with
`node ./dist/cli/pokie.js create pc19-delta --random --seed 19 --out …`.
The resulting blueprint SHA-256 was
`7fd0fa6c2637dd47f948560a9319ff5ebf03ed834f66a5c0d8edb594fdfd8e17`.

Fresh Studio was launched only with `node ./dist/cli/pokie.js --no-open`, with
a new Studio home and Chromium profile. In its rendered Design page, the
enabled `Load from path` `Browse…` control opened the visible server-filesystem
browser after one safe Tab/Space retry. Selecting the CLI-created JSON and
activating rendered `Load` changed the primary action to enabled `Save game`.

One visible `Save game` activation then rendered the action-local claim
`Your game was saved. Opening its workspace…`. After its bounded local wait
had no workspace or action-local error, the same journey continued once to
visible `Projects`; it rendered `No games yet`. Thus the exact action promised
a durable workspace, but its own rendered recovery surface proves that no
saved object exists. The Save action was not repeated.

The concise, action-correlated transcript is
[`generation-6/saved-design-browse-save.md`](generation-6/saved-design-browse-save.md).
Runtime profiles, generated blueprints, raw logs, browser automation and
generated outputs are intentionally not retained.

## Finding and gate

`PC19-SAVED-DESIGN-SAVE-PERSISTENCE` is a P1: saving a valid, Studio-loaded
CLI blueprint visibly reports success but does not make its promised workspace
available. It blocks the saved-design workspace, post-load roles, player, and
CLI/Studio lifecycle-parity portions of the charter. The register therefore
has an unresolved release-blocking finding and PC-19 cannot pass until a fix
receives a new independent delta rerun.
