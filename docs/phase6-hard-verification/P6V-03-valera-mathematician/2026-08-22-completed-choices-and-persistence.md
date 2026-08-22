# P6V-03 completed choices and persistence recovery

Candidate code checked: `a87e90d8ced5febdccd6979915c9b35a66795f7d`, an
ancestor of this evidence-only commit. `npm run build-cli` completed, and the
retained screenshots still match their recorded SHA-256 values:
`workspace-and-persistence.png`
`645918afbbc2240ac3b8b427736848ea5cc81246137e179861e05cacd71c9273`,
and `final-play-feature.png`
`b80794689b1bf62d3fd5e5fcdf72b6ce32587c6d659d80bf1815c2fa88847150`.

After the recorded driver recovery, one fresh HOME/XDG registry and visible
Chrome profile launched Studio from this checkout exactly as `node
./dist/cli/pokie.js --no-open`. Using only rendered controls, the verifier
selected Recommended, waited for its local `Valid — no issues found.` result,
created its Workspace, closed it, and reopened it through the rendered
Projects `Open` action. It then created and closed a locally validated Random
Workspace, and selected Blank, whose rendered editor has empty Game id/name.

The retained candidate-bound Valera transcript and feature screenshot remain
the proof for the already-completed fourth payline, PNG artwork, Wild/Scatter,
non-empty Literal Reel 1 Preview/Apply, duplicate bet, Play/feature,
Simulation, Replay, Outcome Library, and Stake Engine work; this recovery did
not repeat that passing viewport.

| New bounded proof | SHA-256 |
| --- | --- |
| `2026-08-22-recovery-recommended-workspace.png` | `c88fe1f39f3f738f3961209b97784c8d7e30d4ce341b008df5cc3915b3786df3` |
| `2026-08-22-recovery-choices-and-blank.png` | `f5436abc63f94bf71a2f7f440ef1e9bb6d0ddd207c6c8cdd2b4b2f6243324f05` |

No temporary registry, browser profile, project/output tree, raw log, PID
file, or automation source is retained.
