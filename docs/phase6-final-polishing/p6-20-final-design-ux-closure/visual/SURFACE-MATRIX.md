# P6-20 visual surface matrix

Fresh-profile public Studio UI audit of candidate `6f0c8788c42fffedb9407ad5b3f55443c4119651`. Visual/product-design scope only. Every hash is SHA-256.

| Required rendered surface/state | Observation | Screenshot evidence |
| --- | --- | --- |
| Home / Design Game / loading and valid modeler | The single-column editor rendered hierarchy, labels, section validation chips, documentation, and the automatic validation/loading affordance. | `01-home-design-valid.png` `f22919d5…c9495` |
| New Blueprint dialog and model picker | The visible dialog offered Recommended, Blank, Random, and Load existing model choices with clear action hierarchy. | `02-new-blueprint-dialog.png` `456471c0…d9fa` |
| Design Game / error and disabled state | Clearing the rendered Game id showed the inline required-field error and invalid validation summary; Create Project was unavailable until correction. | `02-design-inline-error-disabled.png` `4f194735…950c` |
| Design Game / success and Outcome Project overview | Corrected fields created and opened the managed Blueprint. Overview rendered identity, origin, capability and valid-status information. | `03-project-overview-success.png` `e38c3a60…546c` |
| Game Model / every section | Game basics, Layout, Symbols, Reels, Paytable, Bets & Modes, Mechanics, and derived Limits all rendered in one coherent workspace. | `04-game-model-overview.png` `bdada74d…8598` |
| Game Model / Reels picker, full strips, analysis | Visible Game window, Full strips, and Analysis choices were traversed; Analysis exposed all five reels’ frequency/distance information. | `05-game-model-reels-analysis.png` `08ad4881…607c` |
| Play / empty, disabled, success | Empty session controls preceded a real New Play session and settled visible Spin; the result rendered grid, credits, win, paylines and paytable. | `06-play-empty-disabled.png` `edb28a6d…7e52`; `07-play-round-success.png` `01be4b35…0851` |
| Simulation / empty, disabled, loading path, success and warning | The rendered Configure/Run/Review/Export steps initially had no runs; a real 25-round run reached Review with RTP metrics and explicit low-round/unseeded warnings. | `10-simulation-empty-disabled.png` `e9c86545…16c`; `09-simulation-review-success.png` `da19d6c9…d076` |
| Replay / empty, picker, disabled and success | The source picker and disabled download were visible before selection. Selecting the real Session Spin loaded a complete artifact with inspect/export availability and the canonical grid. | `10-replay-empty-disabled.png` `ddcb11c0…bbcb`; `11-replay-session-spin-success.png` `aea13277…0e17` |
| Build / Export / prerequisites, controls and disabled state | Outcome-library, Stake Engine, artifact cards, Browse controls, preflight cards, available Build controls, and the disabled Stake export prerequisite were rendered. No output was built. | `12-build-export-preflight-disabled.png` `7bb1b707…221e3` |
| Projects / wide responsive layout | Wide view showed a flat registry of current and many missing rows, with only per-row Open/Relocate/Remove actions. | `14-projects-stale-registry.png` `8fcfd523…a8cb2` |
| Projects / narrow responsive layout | Narrow view retained the same long row sequence and actions; the list continued well beyond the viewport. | `16-projects-narrow.png` `3cbd96e5…ac86` |
| Projects / import picker | Scrolling through the rendered registry reached Import Project only after numerous stale rows; Location, Browse, Browse PAR sheet, and disabled Detect rendered correctly. | `15-projects-wide-stale-registry.png` `5ba64e7e…c8610` |

## Consolidated visual finding

`p6-20-final-visual-design-closure-001` — **P2**: Projects presents its persisted registry as an unbounded flat list that places the Import Project picker after a large sequence of stale/missing entries. The rendered controls provide only per-row Relocate/Remove; there is no visible search, state filter, pagination, stale grouping, or bulk cleanup. The condition is demonstrated in both wide and narrow layouts and the picker is only visible at the list’s end. This is a material information-architecture and wayfinding defect.
