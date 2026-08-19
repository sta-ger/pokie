# P6-20 visual surface matrix

Fresh-profile public Studio UI audit of candidate `39bd9cacd8164c1e3b4ea0f3d01f21214699a2f4`. Checksums are SHA-256.

| Rendered surface | Observation | Screenshot proof |
| --- | --- | --- |
| Home / Design Game / Modeler | Default modeler rendered. Its normal managed **Create Project** action failed with the visible recovery error described below. | `01-home-design-valid.png` `20140a938fff…1b1a99` |
| New Blueprint dialog and picker | Recommended, Blank, Random, and Load existing model choices were visible in the rendered dialog. | `02-new-blueprint-dialog.png` `5c0a6e3aa4b4…f243` |
| Outcome Project | Imported Blueprint opened to its rendered Overview with project identity and capability context. | `03-project-overview-success.png` `74a61732ccce…50df` |
| Game Model / every section | Game basics, Layout, Symbols, Reels, Paytable, Bets & Modes, Mechanics, and derived Limits rendered in one workspace. | `04-game-model-overview.png` `9f4ad7120de5…8f26` |
| Reels picker and analysis | Game window, Full strips, and Analysis were reached; Analysis visibly rendered all six reel reports. | `05-game-model-reels-analysis.png` `f2c43d9f0612…a1cd` |
| Play / Simulation | A real visible spin completed; a rendered 25-round simulation reached its report. | `07-play-round-success.png` `7f0a6e3aa4bd…47b8`; `09-simulation-review-success.png` `306d4d7613bd…bb83` |
| Replay / Build | Replay's Session Spin picker and Build/Export's outcome-library/preflight surface rendered. | `11-replay-session-spin-success.png` `4afb30ad7d71…09db`; `12-build-export-preflight-disabled.png` `4a3079d0d255…553fa` |
| Projects / wide | Eleven registrations were visibly grouped as Available projects, with filters, Import Project access, and Page 1 of 2. | `15-projects-wide-registry.png` `02c0670c7088…3b336` |
| Projects / narrow | Responsive narrow layout retained the registry controls, rows, pagination, and Import Project section. | `16-projects-narrow.png` `ee968efaa3a9…2162d` |
| Projects / missing filter and bulk cleanup dialog | Ten stale rows were filtered, selected, and presented to the rendered confirmation dialog before bulk cleanup. | `14-projects-bulk-cleanup.png` `44068e092b60…d046` |

## Finding

`p6-20-final-visual-design-closure-001` — **P1**: In fresh Home/Design Game, choosing the visible default Recommended model then **Create Project** reaches the generic rendered recovery error instead of opening a managed project. This is the primary guided project-creation route. The user cannot diagnose or recover from the displayed message; the specific server-side save/registration failure is not rendered.
