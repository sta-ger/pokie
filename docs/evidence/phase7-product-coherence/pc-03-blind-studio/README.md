# PC-03 — fresh-profile blind Studio exploration

Candidate: `33e44baf7db37c75d528f400f148e19010bb8702`.

## Boundary and method

On 2026-08-27, the candidate was built once and Studio was launched from this
checkout exactly with `node ./dist/cli/pokie.js --no-open`. Two disposable
launches used separate Studio homes, registries, Chromium profiles, and
generated-project roots. Chromium was visible and active on the inherited
Xvfb display. The explorer used only the README Studio description and
rendered buttons, fields, tabs, radio controls, and native UI; it made no
private HTTP calls, route/state injection, source-guided navigation, or
fabricated input artifact. Temporary profiles, projects, output trees, and
logs were removed. This README is the whole retained evidence payload.

The first launch established the recovery route; the second repaired its
semantic waits and is the substantive run below. A fixed wait that did not
show a product error is not treated as a product failure: the saved edit later
rendered in Game Model and final Overview rendered `Valid — no issues found.`

## Rendered ledger

| Public surface / natural action | Rendered state and outcome | Recovery / handoff |
| --- | --- | --- |
| Home → Design Your Game | Initial automatic `Studio is checking this game design automatically`; Game basics, Layout, Symbols, Reels, Paytable, Bets, Preview Game Model, documentation links, Create game, advanced file/JSON options, and Choose a different start were visible. | Starter selection subsequently settled at `Valid — no issues found.` |
| Choose a different start | Visible choices: Use the starter game, Start with a blank game, Generate random (the visible label for the described idea generator), and Open a saved game design. | These are separate visible capabilities; no duplicate action label was rendered. |
| Open a saved game design — empty form | **P2 finding:** immediately after the rendered route opened, its blank Saved game design field was accompanied by `"…/dist/cli/studio-client" is a folder, not a file. Point this at a file instead…`. No path was entered or selected in that new profile. | The input remained blank and Open was disabled; Back was available. This unrelated candidate-directory error is neither an empty state nor a user-selected file error. |
| Missing saved-design path | Entering `/definitely-not-a-pokie-project` through the visible field and choosing Open produced `doesn't exist`, `Check the path, or use Browse`, and `The saved game design could not be found.` | Back returned to the start choices; the failed location did not remain pending. |
| Starter → Create game | `Replaced the current game design`; each design section was `valid`; automatic validation settled valid. Create game opened Starter Slot Overview, identified as Created in Studio, Editable, and valid. | Overview supplied Close project, Re-check project, Open Play, and all workspace tabs. |
| Game Model | Visible sections: Game basics, Layout, Symbols, Reels (Game window, Full strips, Analysis and stop control), Paytable, Bets & Modes, Mechanics, and Limits. The section affordances are repeated `Edit` buttons rather than duplicate named capabilities. | First Edit opened the Game basics form. Description was changed by rendered keyboard input, Save returned its visible value `Edited in fresh public Studio exploration`, and final Overview showed valid. |
| Play | New Play session → Spin settled, not merely a fixed delay: `Round complete — no win this round`, grid, credits, bet, paytable, no-wins step, Reset Play session, and `Inspect round artifact` rendered. Find-any-win and Find-free-games were enabled; Find-symbol-win was disabled until a symbol is supplied. | A completed Play spin appeared naturally under Replay → Session Spin. |
| Simulation | Rounds was visibly changed from 10000 to 2. Run Simulation settled at 2/2, RTP 0.00%, hit frequency 0, volatility 0, max win 0, with actionable warnings for no seed, low requested rounds, and no winning/payout round. Review and Export step controls, Open full report, Compare with another run, Repeat simulation, Refresh, Open, and Run again were visible. | This is a successful bounded run with warnings, not an error. |
| Replay | Recreate from seed, Replay Artifact, Session Spin, and Recent Simulation were all visible. Selecting Session Spin revealed `Session 1 — Round 1 — Spin — win 0` from the settled Play session and its Session selector; Download JSON remained disabled until selecting that concrete spin. | The cross-surface Play → Replay list handoff succeeded. The natural next rendered control was the specific session-round item; it was not activated before the two-launch limit. |
| Build/Export | Visible cards: Outcome library generator; disabled Stake Engine Export (explaining it reads the canonical generated library); TypeScript Game Package; Outcome library; Stake Engine export; a file-oriented build; and disabled remote compatibility (`Remote delivery is not set up`). Every local artifact card exposed an optional destination plus Browse and Build. | Generate exact outcome library (base) accepted one click and visibly entered `Generating outcome library from this project's current build…`; while pending, it disabled itself and Stake Engine Export remained disabled. No second generate/export click was issued and no generated output was retained. Thus no natural artifact-reuse result is claimed. |

## Handoffs, state inventory, and finding

Reached entrypoints were Home Design, start-choice dialog, saved-design form,
saved-design error/recovery, created-project Overview, Game Model/editor, Play,
Simulation, Replay, and Build/Export. Observed state classes include initial
checking/loading language, disabled submit/actions, valid success, saved edit,
completed Play and Simulation results, warnings, local input error, recovery,
pending generation, and unavailable remote/export prerequisites. No stale
state rendered after the local path recovery or saved edit.

The only completed cross-artifact handoff was the natural Play session →
Replay Session Spin selection. The visible Build/Export dependency chain is
Outcome library generation → Stake Engine Export; it truthfully remained
unavailable because the only generation attempt was pending when the bounded
launch ended, so no artifact was available to reuse. This is not a claim that
generation failed. The visible Build/Export surface also presents overlapping
Outcome library generator and Outcome library Build capabilities; the former
explicitly feeds delivery options while the latter is a build artifact, so the
rendered wording distinguishes their roles rather than proving a duplicate.

**Finding PC-03-P2-01 — spurious saved-design error.** A fresh, blank
Open-a-saved-game-design form renders an error about the source checkout's
`dist/cli/studio-client` directory before the user enters or selects any
path. The error is actionable only for a path the explorer did not provide,
so it is misleading first-contact failure state. The field itself can still
be filled and the explicit missing-path recovery works.
