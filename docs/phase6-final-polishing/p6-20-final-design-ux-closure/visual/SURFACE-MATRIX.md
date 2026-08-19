# P6-20 visual surface matrix

One fresh-profile public Studio session audited candidate `b6ad154db45b3b4ee24d5d588fa650bdacd84efb` on 2026-08-19. Evidence paths below are relative to `fresh-b6ad154d-20260819/`; SHA-256 values are full values in `CHECKSUMS.sha256`.

| Required surface/state | Rendered observation and visual assessment | Screenshot/checksum |
| --- | --- | --- |
| Home / Design Game | Home rendered its clear heading, instructional hierarchy, primary Create Project control, section tabs, documentation links, and automatic-check loading copy. | `01-home-design.png` `1641b3a2…f5c0ce` |
| New Blueprint dialog / picker | The rendered modal exposed Recommended, Blank, Random, and load paths. Recommended applied the valid starter model directly; the resulting Modeler showed a legible form and validation success. | `02-new-blueprint-picker.png` `456471c0…ced9fa`; `03-modeler-valid.png` `f22919d5…5c9495` |
| Modeler / success | Valid starter Game basics, edit controls, validation hierarchy, and preview controls rendered. Create Project then opened the managed workspace successfully. | `03-modeler-valid.png` `f22919d5…5c9495`; `05-outcome-project.png` `db5fa2c3…fe1173` |
| Outcome Project | Starter Slot Overview rendered project identity, path, navigation rail, and a concise next-step hierarchy. | `05-outcome-project.png` `db5fa2c3…fe1173` |
| Game Model: Game basics, Layout, Symbols, Reels, Paytable, Bets & Modes, Mechanics, Limits | All eight named sections rendered in one scrollable, consistently styled workspace: editable basics/layout/symbols/reels/paytable/bets, clear empty Mechanics, and derived Limits. The model grid/table remained legible at desktop width. | `06-game-model-sections.png` `d434f661…1dbd9f` |
| Play / empty and success | Empty/preparation state then a visible New Play session and settled Spin were rendered. The completed play surface communicated session/scenario controls without a visual hierarchy failure. | `07-play-empty.png` `65a076f0…dd9fb`; `08-play-success.png` `a793843d…c334f` |
| Simulation / disabled, loading, success reachability | The blank Rounds configuration rendered its disabled/empty state; after visible input, the active job rendered a running progress state. The entered value appended to the existing default (1,000,020 rounds), so terminal review was not awaited; this was not retried. | `09-simulation-ready.png` `57595d2e…f3b112`; `10-simulation-loading.png` `0d898f3f…0bdbd4` |
| Replay / picker | Replay rendered its explanatory hierarchy and Session Spin picker after the settled Play round. | `11-replay-session-spin.png` `f2d39309…b45c63` |
| Build / disabled, warning, and preflight | Build/Export rendered outcome-library, static export, artifact, and deployment sections with visible prerequisites, preflight details, disabled gated actions, and an unconfigured remote-target warning. | `12-build-export.png` `7224ce7e…b6e39e` |
| Projects / wide success, warning, disabled, picker | Wide Projects rendered an available managed project, Needs attention registrations, disabled missing-row cleanup, Relocate/Open/Remove actions, pagination, and Import Project location/browse controls. | `13-projects-wide.png` `27010095…f94ae` |
| Projects / narrow responsiveness | At 405 px, the desktop multi-column registry is compressed into extremely narrow columns. Project path/status/action text wraps character-by-character and controls are not usable: material P2. | `14-projects-narrow.png` `7771faae…583582` |
| Error-state coverage | No error state occurred in the physical Create Project → workspace → Spin route; no synthetic failure or state injection was used merely to manufacture one. Warning, empty, loading, success, and disabled states are represented above. | `05-outcome-project.png` `db5fa2c3…fe1173`; `10-simulation-loading.png` `0d898f3f…0bdbd4`; `12-build-export.png` `7224ce7e…b6e39e` |

## Consolidated finding

`p6-20-final-visual-design-closure-001` — **P2**: Projects has no usable narrow responsive presentation at 405 px. Its desktop data table compresses instead of reflowing or providing a horizontal/mobile treatment, making project identity, availability, and actions effectively unreadable.
