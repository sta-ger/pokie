# P6-20 visual surface matrix

Fresh-profile local Studio at candidate `6f0c8788c42fffedb9407ad5b3f55443c4119651`; visual/product-design audit only. Checksums are SHA-256.

| Required surface/state | Rendered observation | Screenshot proof |
| --- | --- | --- |
| Home / Design Game — valid | Clear single-column modeler, section status chips, inline labels, documentation links, and valid automatic validation were rendered. | `01-home-design-valid.png` `ee2ace01…c25c5e` |
| Home / Design Game — loading, error, disabled | Clearing Game id rendered “checking again”, then inline required-field error and invalid validation summary. Editing a Game Model section later visibly disabled competing Edit/Refresh controls. | `02-design-inline-error-disabled.png` `5f2b767a…117202` |
| Home / Design Game — success | Create Project saved the managed Blueprint and opened its workspace. | `03-project-overview-success.png` `06c0f8ed…13d72e` |
| Project overview / Outcome Project | Blueprint identity, origin, capabilities, validation, and the outcome-library generation capability were rendered; Build/Export subsequently showed the outcome-library generator card. | `03-project-overview-success.png` `06c0f8ed…13d72e`; `12-build-export-preflight-disabled.png` `351fdd0e…24ae71` |
| Game Model — all sections | Game basics, Layout, Symbols, Reels, Paytable, Bets & Modes, Mechanics, and derived Limits rendered together. Basics and Layout editors were opened; their competing section actions were disabled while editing. | `04-game-model-overview.png` `98960739…c08f2b` |
| Game Model — Reels subsections | Rendered Game window plus Full strips and Analysis tabs; the latter displayed all five reel frequency/distance tables. | `05-game-model-reels-analysis.png` `dc52a84…c1ed` |
| Play — empty/disabled | Initial Play called out session preparation; newly created session showed empty round state and disabled Find symbol win with no Symbol. | `06-play-empty-disabled.png` `ab975c3f…94c070` |
| Play — settled round | Real visible Spin settled a round and rendered grid, bankroll, bet selector, line controls, paytable, and empty win detail. | `07-play-round-success.png` `70708175…494941` |
| Simulation — empty/loading/success/warning/disabled | Configure step initially had Run/Review/Export disabled and no runs. A 25-round visible run completed; Review showed computed RTP/hit-frequency/volatility/max win and explicit low-round/unseeded warnings. Completion was too fast to retain a distinct loading screenshot. | `09-simulation-review-success.png` `0122e55c…c6cfc` |
| Replay — empty/disabled | Recreate, artifact, session-spin, and recent-simulation picker choices rendered; Download JSON was disabled before a selection. | `10-replay-empty-disabled.png` `ed9fb5dd…393701` |
| Replay — session-spin picker/success | Selecting the rendered Session Spin picker row loaded the real recorded Play round, exposing provenance, inspectability, grid, detail, and enabled download. | `11-replay-session-spin-success.png` `e25e9659…09dd92` |
| Build / Export — disabled prerequisites and preflight | Outcome library, Stake Engine, all three artifact cards, output-directory inputs, remote placeholder, conflict state, and disabled Stake Engine action until library generation were rendered. No build was run. | `12-build-export-preflight-disabled.png` `351fdd0e…24ae71` |
| Projects / import picker location | A fresh-profile browser opened the persisted Projects registry. It showed current and missing rows plus Relocate/Remove controls; the Import Project Location/Browse/Detect picker was reached visually after the long table. | `14-projects-stale-registry.png` `3271e89f…759e014` |
| Responsive Projects | At 780px the table collapsed to Name-only presentation; at 1440px it exposed Name/Type/Origin/Last opened/Actions. Both showed the same unbounded stale-row problem. | `14-projects-stale-registry.png` `3271e89f…759e014`; `15-projects-wide-stale-registry.png` `98d6e5b6…62805a` |
| Visual design review | Typography, spacing, card hierarchy, status colors, input/control treatment, and grid/readability were consistent across the inspected workspace. The material exception is the Projects registry information architecture below. | all screenshots above |

## Consolidated visual finding

`p6-20-final-visual-design-closure-001` — **P2**: Projects renders an unbounded flat history of stale/missing registrations ahead of Import Project. In this real persisted surface, import controls were at rendered y=12,933 and the table offered only per-row Relocate/Remove; there was no visible search, status filter, pagination, bulk cleanup, or stale grouping. On narrow width, all non-name columns collapse, further reducing scanability. This is a material product-design/wayfinding defect, not a workflow-UX finding.
