# P6-20 independent workflow UX audit

Date: 2026-08-20 (fresh disposable browser profile)

Candidate: `6ee8bc9ddfac4845e1923d8b4cfef1e9ce8115d4` is an ancestor of the audited checkout (`4d97b1660d50e2de62a8b6b7383e0634665379cd`). The companion checkout was clean but did **not** match its required exact HEAD: observed `bdb303dacb22b0671eafa9cd398638c316057597`, required `09a0889b8d335eeacbdb277c37376d97de96c268` (the required SHA is an ancestor).

## Natural session

1. Tried the advertised public launcher from the candidate root. `pokie` was not on PATH, so I used the candidate's public CLI entry. `pokie dev` explained that a package root is required; `pokie dev .` then plainly reported that the repository root has no `pokie.entry`. This was a useful recovery, not a product workflow completion.
2. As a first-time user, used public CLI help, then `pokie init` in a disposable child directory. It prepared and verified a minimal game without an install. I launched exactly one successful public `pokie dev <disposable-project> --no-open`; the visible client connected at `http://127.0.0.1:3100`.
3. Initial screen: a session seed field, generated session ID, start/restore controls, bet buttons, a reel grid, line definitions, paytable, Spin, and Raw response. The default bet button was disabled, clearly indicating the active choice. Screenshot: `01-client-start.png`.
4. Pressed **Spin**. The reels changed and credits changed from 1000 to 999, providing visible Play feedback. Screenshot: `02-play-result.png`.
5. Selected bet **10**, then pressed **Spin**. The selected bet was reflected in the header and the result reported bet 10 / credits 989. Screenshot: `03-bet-and-spin.png` was intentionally discarded as duplicative; the action remains recorded here.
6. Entered `fresh-audit` in the optional seed field and pressed **Start new session**. The screen reset to bet 1 and credits 1000 with a new session ID. This is understandable from the button wording, but it gives no explicit destructive-state warning or recovery path.
7. Expanded **Lines definitions** (three visible, focusable line buttons) and **Paytable** (a readable symbol/3/4/5 table). This progressive disclosure worked. Screenshot: `04-new-session.png` records the fresh persisted session; `05-lines-detail.png` records the expanded path interaction.
8. Keyboard check: focus advanced to the native **Spin** button with Tab from the then-current interaction state. Browser Back/Forward had no in-product route to exercise; the page presents no navigation, tabs, stepper, project menu, or editor entry point.
9. Dead end: there is no visible control, link, navigation destination, disabled explanation, or other discoverable next action for project creation/editing/save/reopen, Simulation, Replay, Build, Outcome, or Stake. The available screen is a player preview only. I did not use private APIs or alter browser/DOM state to reach hidden functionality.

## Evidence inventory

| File | SHA-256 |
| --- | --- |
| `01-client-start.png` | `a67675ca09a54b282469f776b4201057b7715d212f2db6117623727aaee4277d` |
| `02-play-result.png` | `130c3a0197f9a39434c0bcd065c2088cb55eeb8fcef7d2faba389616d09e2338` |
| `04-new-session.png` | `b61788a8cb78a1dfdd9215a63d9bdb356ce4daea9639eb6dd468858faabe0498` |
| `05-lines-detail.png` | `94df6efbdca2e396951b12ec6582e826555cc8451c198f5973b710ee7cd0266b` |

All retained images are rendered browser screenshots; no browser profile, automation, project output, or raw log is retained.
