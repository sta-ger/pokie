# Rendered surface matrix

Candidate: `f470985c6370e80dcf4c9932da9593bc864cc28d`. Companion: required clean HEAD `6bb67dee3d2e8e98bab754e1000019701a17266b`. One fresh-profile public Studio session was launched with `node ./dist/cli/pokie.js --no-open`; screenshots below are rendered UI only.

| Required surface/state | Rendered observation | Screenshot (SHA-256) |
| --- | --- | --- |
| Home / Design Game / loading | Clear title, primary action, section hierarchy, and automatic-check loading copy render at entry. | `f470985c-20260820/01-design-home.png` (`1641b3a269325eefe8671c5dde917681625873c64f1096c698cd3fb622f5c0ce`) |
| Dialog / New Blueprint | Recommended, Blank, Random, and Load existing are visibly grouped in the creation dialog. | `f470985c-20260820/02-new-blueprint-dialog.png` (`456471c0e06c3c1ffae198a0ac263f6d16e14f46c9f5b0cbb5a5675a98ced9fa`) |
| Design Game / error and disabled | Blank model renders the invalid/disabled state and validation feedback. | `f470985c-20260820/03-blank-error-disabled.png` (`22ae8d56c77cb51c1947f4e9d8f3b5076f71868d04203f4d2f0a79d2ebdb839b`) |
| Dialog / success | Random generation visibly completes and enables Use this blueprint. | `f470985c-20260820/04-random-success-dialog.png` (`4676b11dcc1854dc406781c4203ee6308589553e4e96c1e556a8a6821a05eaba`) |
| Every guided Game Model section | Game basics, Layout, Symbols, Reels, Paytable, and Bets were each selected through rendered controls; valid state and section rail are visible. | `f470985c-20260820/05-guided-game-model-sections.png` (`fe803eb1a6171a4cebc9b85b9a18fa58425cf047cff2956fe359fbb32e508fdd`) |
| Workspace / Overview | A real temporary Blueprint opened with clear breadcrumb, hierarchy, and workspace navigation. | `f470985c-20260820/06-workspace-overview.png` (`a75dd5128ad3254c91e00cec11ca11021a8f18838502f3db49ad086e9595b041`) |
| Workspace Game Model / all sections | Rendered Game basics, Layout, Symbols, Reels, Paytable, Bets & Modes, Mechanics, and Limits share a coherent section/card system. | `f470985c-20260820/07-workspace-game-model.png` (`4888fbbe07a98c9fc5efc13bb11eb346f56a63fda3554282e768fb68c34c69a7`) |
| Modeler / loading and retained content | Per-reel Reel Strip Modeler reached its Select state; five reels visibly retained Literal — 4 symbol(s), with Select/Configure/Preview/Done steps. | `f470985c-20260820/15-reel-strip-modeler.png` (`bd9e3bc88c45baf5053f114fb73ae8115be9f7c8bc1c2fdc8b37dbf4bcfd29ee`) |
| Play / empty disabled | Empty Play exposes New Play session rather than an unexplained inactive surface. | `f470985c-20260820/08-play-empty-disabled.png` (`80a2989879e5c0d257e80dae9b5a368318daa9c31156f5e67bd7c247548c6f1f`) |
| Play / success | New Play session and Spin render a settled round, credits, bet controls, and no-win state. | `f470985c-20260820/09-play-spin-success.png` (`85009504674e04aa7e0591b97b18c9f283c3651435e88e889463992b33f65909`) |
| Simulation / warning and success | Completed 10-round report visibly includes RTP metrics, progress hierarchy, recent run, no-seed warning, and low-sample warning. | `f470985c-20260820/10-simulation-warning-success.png` (`86f447a8b0fab5984dd30e27ed36422b44e96cfb0693c296038424f9f6659520`) |
| Replay / picker | Replay source UI rendered and was reached after a recorded Play spin. | `f470985c-20260820/11-replay-source-picker.png` (`87719200b630234fccf4fd2982627be3220d367d55d1f041435b6a2d8934e4fc`) |
| Build / Outcome Project | Build/Export rendered outcome-library, static-export, build-artifact, disabled-prerequisite, and output-picker controls without initiating a write. | `f470985c-20260820/12-build-outcome-project.png` (`3a41ce4a8af4496fc13295d3acabb3597268d85d30fefbfb21aff47221d80332`) |
| Projects / picker and disabled state | Projects shows registry states, filters, Import Project guidance, disabled Detect, and a visible Browse trigger; the trigger was invoked. | `f470985c-20260820/13-projects-picker-disabled.png` (`25d626d8d634cc92dd302eb4eb1647b5be7f48b6e34dcf194bb575ca8241d070`) |
| Projects / narrow responsive state | **P2 finding:** at 405px, cards and controls collapse into unreadably narrow multi-column fragments; the list cannot be practically scanned or acted on. | `f470985c-20260820/14-projects-narrow-responsive.png` (`9a218f4f8d2412ea5a3161392de1255b93c8230568bc168cdae3f7e95f866087`) |

Desktop typography, visual hierarchy, spacing, contrast, controls, state callouts, and section consistency were otherwise coherent across the sampled surfaces. The P2 narrow Projects layout is the sole observed material visual/product-design defect.
