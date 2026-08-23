# P6V-04 independent Producer rerun

Candidate: `bc810a69dba8ee4e036906fd9c10dda9fefb5680` (the checked-out HEAD).  This is a rendered-browser rerun, not a cache/materialization test.  Studio was started from this checkout with `node ./dist/cli/pokie.js --no-open`, once per fresh Chrome profile; no documentation or source was used for the cold-start exploration.

## Launch 1 — functional readiness

- Recommended **Create Project** opened the saved `Starter Slot` Workspace (then the project was closed, found in Projects, reopened, and remained valid).
- In Game Model, inspected the visible 5×3, 3-line layout, symbols, paylines and paytable.  Selected a PNG through the rendered host picker, saved it for `A`, kept literal reel strips, duplicated the first `A` to make the displayed 2× stack, and inspected every strip/stack in Full strips.
- Added a `mode-1` bet mode at 2× cost; marked `A` as scatter; configured and saved the visible scatter free-games mechanic, `3x → 5`.
- Play: started a rendered session, spun once, then used **Find any win**.  The settled round displayed grid, credits 1007, total win 10.00 (10.00×), scatter winning positions, paylines, paytable, and `freeGamesTriggered`.  The scenario’s 12-second wait expired before its label changed, but its later rendered settled round proved success.
- Simulation: ran 10,000 rounds and opened the complete report (RTP 381.94%, hit frequency 36.44%, max win 36.00; Studio truthfully warned that no seed was supplied).  The unusually high result is the deliberately edited scatter/free-games model, not a UI error.
- Replay: selected the recorded win, inspected its full round artifact/grid/win detail and invoked enabled **Download JSON**.
- Build/Export: generated 1,280 exact outcomes, exported four Stake Engine files, and built the TypeScript package.  Build preflight and the unsupported WASM/remote delivery surfaces gave explicit truthful status and recovery guidance.

## Launch 2 — uncoached cold start

One-sentence task: “I want to make a slot and see if I can play it.”  From the untouched Design Game screen, the visible **Create Project** control opened a new saved Workspace immediately; no documentation, source, previous evidence, or prepared interaction sequence was consulted.

No P0, P1, or material P2 product defect was rendered in either launch.

## Retained rendered proof

| File | SHA-256 | What it shows |
| --- | --- | --- |
| `01-cold-create-workspace.png` | `ec24e9aeb10c1f18589bfa0640695d3c5e551aa6ac017548d457be3206130ffa` | Fresh cold-start Create Project landing in Workspace. |
| `02-literal-reels-stacks.png` | `e9e5b54fb1449f0e20a063b05f60c8ac7ecff7fbb2addf2866541a21d55f146c` | Literal reels, layout/paylines, and displayed stack length. |
| `03-replay-round.png` | `a6ffbd35c317a1b2b3bc98f03757dc45232f52d1594f2a221e550185f88bfd30` | Selected, full recorded Replay artifact. |
| `04-build-output.png` | `82714a916589952815af757b793b93115101b0f24d79c249bf6db3b4cd123c5e` | Rendered TypeScript build preflight and completion. |

Only this compact transcript and four screenshots are retained; generated project/output trees, browser profiles, harness scripts, raw logs, and downloads are excluded.
