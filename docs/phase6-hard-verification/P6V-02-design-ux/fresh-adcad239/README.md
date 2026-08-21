# P6V-02 independent rendered verification

Candidate: `adcad23920e33420be05e8661985859e90702a5e`  
Date: 2026-08-21  
Launches: two fresh Studio instances from this checkout, each started with `node ./dist/cli/pokie.js --no-open`; neither used the installed `node_modules` CLI.

## Surface matrix

| Surface/state | Rendered observation | Result |
| --- | --- | --- |
| Home / Design Game | Recommended model showed all six editable sections, automatic validation, preview and advanced controls. | pass |
| Projects | Loading state resolved to paginated available-project cards, search/filter/import controls and a clear empty-detection hint. | pass |
| Workspace / Game Model | Game basics, Layout, Symbols, Reels, Paytable, Bets & Modes, Mechanics and Limits rendered. Reels' Game window, Full strips and Analysis controls rendered; Full strips exposed every stop. Reels Edit exposed the Per-reel Reel Strip Modeler. | pass |
| Play / success | Recommended project was created, saved, reopened, started, and one Spin settled as `Round complete — no win this round.` | pass |
| Simulation / warning | One-round run reached Review with result metrics and actionable low-round/no-seed/no-win warnings. | pass |
| Replay / success | The recorded Session Spin selected and loaded into the round inspector, with grid, detail and enabled JSON export. | pass |
| Build/Export / disabled/success | Stake export was initially disabled with its prerequisite stated. Exact outcome generation produced 1,024 outcomes (RTP 100.78%); the ensuing Stake export reported four files written. | pass |
| Dialogs and native picker | Game Model edit form rendered Save/Cancel. The visible Browse control launched the host Zenity directory picker; Escape dismissed it without changing the destination. | pass |
| Error and recovery | Clearing the unsaved Game id, then blurring it, rendered `Invalid — 1 error(s)` and the precise non-empty-id remedy. No project was saved from this exploratory draft. | pass |
| Approximately 405 px | Fresh reload at a 405 px emulated viewport rendered a readable Overview, hamburger navigation and full-width workflow callout; the drawer exposed all six workspace destinations. | pass |

## Interaction transcript

1. Fresh launch → **Create Project** → Overview; validation rendered `Valid — no issues found`.
2. **Game Model** → inspected all sections and **Full strips**; opened and cancelled the per-reel editor.
3. **Play** → **New Play session** → **Spin** → settled Round 1.
4. **Simulation** → changed Rounds to 1 through the focused rendered input → **Run Simulation** → Review metrics and warnings.
5. **Replay** → **Session Spin** → selected Round 1 → round inspector loaded.
6. **Build/Export** → **Generate exact outcome library (base)** → **Run Stake Engine Export (base)**.
7. **Browse…** → native picker appeared → Escape. Second fresh-profile launch explored Design Game → Workspace → Projects only through rendered controls; its invalid unsaved field rendered recovery feedback.

## Representative screenshot checksums

| File | SHA-256 |
| --- | --- |
| `01-overview-desktop.png` | `44f4c8747d72c8495a45227b08e9cda4302985d62be2c298c021a90a9983bf7b` |
| `02-play-round-desktop.png` | `99e3f13c396a926febda55631a80e02592b813982e48d1ac4a09ee24343d6e35` |
| `03-simulation-warning-desktop.png` | `1eeb1713fdb34cd9f71297229405b4500fcb969bb9eb0ae5faee7c5879d3c60f` |
| `04-outcome-stake-success-desktop.png` | `4131099be1a856bf08492b790dfe2cfa6b6b186e248ea69fd1bfb3061f697820` |
| `05-native-directory-picker.png` | `0b771277d0ec4bf4195c50ff45691af04b38d77202bc9cf9da8dbae59f2cc827` |
| `06-overview-405px.png` | `9300a5261cd3859f34c062f4be55d1d510e3dd7846d12dc53abd476dd86edbad` |

No confirmed P0, P1 or material P2 defect was observed. The evidence contains six screenshots (534 KiB total) and this transcript; no generated project/output tree, profile, raw log, browser script or build artifact is included.
