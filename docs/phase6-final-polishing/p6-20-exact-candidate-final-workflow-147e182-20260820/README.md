# P6-20 exact-candidate public workflow rerun — passed

The implementation candidate is `147e182de681431c4c73393069c4206ae7fb216d`.
This checkout is a documentation-only descendant: `git diff --name-only
147e182d..HEAD` contains only this P6-20 evidence. `npm run build` completed
before the run, and the public archive built from that output was
`sha256:474c66f96a76ba30b1fd1529987b309916b86648aa1311ce5e0cf8cba59917e7`.

The supplied read-only `pokie-examples` checkout was clean at the required
`6bb67dee3d2e8e98bab754e1000019701a17266b` before and after the run. A
temporary copy installed the candidate archive and used its public `npm start`
fixture page. A candidate `pokie build` created a temporary Fixture Slot
package; candidate `node ./dist/cli/pokie.js dev` served that package. Visible
mouse/keyboard input produced `fixture-round` on both: `A/C/A | A/A/C |
A/A/A`, credits `1004`, win `5`, and `5x`.

Studio was served from this source checkout with exactly
`node ./dist/cli/pokie.js --no-open` and driven with a fresh headed browser
profile and visible mouse/keyboard input only. Its rendered **Play** flow
(seed `fixture-round`, **New Play session**, **Spin**) and rendered **Replay**
Session Spin both showed the same round and values. The generated package was
then visibly closed; **Projects** displayed its registered Fixture Slot card
and the fully visible **Open** control. Clicking that control returned to the
Fixture Slot Workspace.

| Rendered recovery proof | SHA-256 |
| --- | --- |
| `projects-open-control.png` | `209e7de252e4a474dee9a6304de7754583cddeb400d3ebbb77df647fc5b3582d` |
| `projects-reopened-workspace.png` | `4385fb6a495688ec54b0677dc38c737787fad810701e0a80a2f6c9541c818be4` |

Only the two representative recovery images and this concise record are
retained. Temporary packages, archive, browser profile, display, processes,
and raw logs are not committed.
