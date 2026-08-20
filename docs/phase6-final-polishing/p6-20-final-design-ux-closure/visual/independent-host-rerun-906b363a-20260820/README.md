# P6-20 independent host rerun — passed

Candidate `906b363adc3098541d2449b7e3e24edde1ac6fe7` was built from this
checkout, then served once with exactly `node ./dist/cli/pokie.js --no-open`.
A fresh Chrome/X11 profile used only rendered mouse/keyboard controls:
**New Blueprint → Recommended → Reels → Per-reel (Reel Strip Modeler) →
Select reel 1**.

The rendered five-reel overview retained **Literal — 4 symbol(s)** for Reels
1–5. The selected first reel visibly retained `A`, `K`, `Q`, `J`; validation
rendered **Valid — no issues found**, and the primary **Create Project** button
was enabled. No product finding was observed. The supplied read-only
`pokie-examples` companion was clean at
`6bb67dee3d2e8e98bab754e1000019701a17266b` before the rerun.

| Rendered proof | SHA-256 |
| --- | --- |
| `01-reel1-literal-preserved.png` | `4b537233bf90e9c5434f3f84c0752554b35b23815eedf3fd12cc670e08b04867` |
| `02-five-literal-reels.png` | `bca5787bceffc278b3869806205ddfc2437431dcbd37a7b13f7061d28298ebd2` |

Only these two screenshots and the concise action transcript are retained.
Temporary profile, Studio process, automation, and logs were not committed.
