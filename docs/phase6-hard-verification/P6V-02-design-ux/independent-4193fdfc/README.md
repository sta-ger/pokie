# P6V-02 independent rendered verification

Candidate: `4193fdfc5a3d9e16eb65e31e099555f486c23eab`  
Date: 2026-08-21 (Europe/Warsaw)  
Launch command (both fresh launches): `node ./dist/cli/pokie.js --no-open`

## Result

No rendered P0, P1, or material P2 product defect was confirmed in the two-launch
independent cold-start audit. This evidence is bounded to five representative
screenshots (464 KiB total); no generated project/output tree, profile, raw log,
automation source, or browser artifact is included.

## Rendered interaction transcript

Launch 1 (fresh Chromium profile) used Recommended Create Project, then closed and
reopened the new `starter-slot-47` project from Projects. It completed one Play spin,
one 1-round Simulation (the intentional low-round and missing-seed warnings rendered),
loaded that recorded round through Replay, generated 1,024 exact base outcomes, and
completed the base Stake Engine export (4 files). The transient earlier 100001-round
simulation came from an unaccepted browser selection gesture; the subsequent rendered
control value was verified as `1` before the required 1-round run, so it is not a
product finding.

Launch 2 (a separate fresh profile) used only rendered controls for the cold-start
exploration. It reviewed Home/Design and Projects; the Game Model sections (basics,
layout, symbols, reels, paytable, bets/modes, mechanics and limits); Game window,
Full strips and Analysis; and the Per-reel Reel Strip Modeler. Cancelling un-applied
reel changes opened the rendered discard-confirmation dialog and Confirm returned to
the non-editing state. Build/Export showed empty, disabled and ready states; its Browse
control opened the real host native folder picker. At a 405px viewport the navigation
collapsed to the menu control and the Build/Export card remained readable. An expected
limit guard rendered its recovery guidance when exact outcome-space limit `1` was below
the model's 1,024 combinations.

## Surface matrix

| Surface / state | Result | Rendered evidence |
| --- | --- | --- |
| Home, Design Game, Projects, desktop | Passed | `home-desktop.png`; rendered create/save/reopen flow in transcript |
| Game Model sections and Reel Strip Modeler | Passed | `game-model-desktop.png` (discard-confirmation dialog over modeler) |
| Play, Simulation, Replay | Passed | transcript: completed spin, 1/1 simulation, selected recorded round |
| Outcome Library and Stake export | Passed | transcript: exact outcome success and 4-file export; disabled precondition assessed |
| Empty/loading/success/warning/error/disabled | Passed | transcript plus `outcome-limit-error-mobile.png` |
| Dialogs, real native picker, responsive 405px | Passed | `game-model-desktop.png`, `native-picker.png`, `build-export-mobile-405.png` |
| Cold-start navigation, hierarchy, recovery, dead ends | Passed | rendered-only launch-2 exploration; no dead end observed in reachable surfaces |

## Screenshot checksums

| File | SHA-256 |
| --- | --- |
| `home-desktop.png` | `49601744a3a40095289301e6a1978c9f970d5778285a0c2a5293935266547797` |
| `game-model-desktop.png` | `e9d91c83deb5bb5c4bfa1e46440bc202548c966e81c3a2a7498ebc695b8096ce` |
| `native-picker.png` | `e1608f21a10758cf810652064174a55c3fafc27ef136bf92772b655efc05009d` |
| `build-export-mobile-405.png` | `1fc2aa43bed9b2df072a33109794c6b3b7808f0154fc9b544a350c37fc737f1e` |
| `outcome-limit-error-mobile.png` | `3e0f50a83247b37f7f5741804000260680933b75fdd25b122e11c040968bba59` |
