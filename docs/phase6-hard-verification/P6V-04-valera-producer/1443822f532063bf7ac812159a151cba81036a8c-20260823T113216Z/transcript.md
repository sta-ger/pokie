# P6V-04 independent producer transcript

- Candidate SHA: `1443822f532063bf7ac812159a151cba81036a8c`
- UTC start of captured corrected-session evidence: `2026-08-23T11:32:16Z`
- Launch: fresh browser profile against the product CLI server (`node ./dist/cli/pokie.js --no-open`), then visible Studio controls only.

## Observations and actions

1. **Design Game** loaded the recommended `starter-slot` / `Starter Slot` blueprint. The six visible configuration sections (`Game basics`, `Layout`, `Symbols`, `Reels`, `Paytable`, `Bets`) each showed a green-valid state; validation said `Valid — no issues found.`
2. Used **Create Project**. Studio opened the managed Blueprint project and showed its saved location. Reopened **Game Model**.
3. Observed the playable model: 5 reels × 3 rows, line wins, 3 paylines; symbols A/K/Q/J; `Literal reel strips`; paytable and per-line bet selector. Entered the Game basics editor, changed the name to `Producer Journey Slot`, and used visible **Save**. Studio assigned ID `producer-journey-slot`.
4. Opened **Play**, started a **New Play session**, kept the visible 1.00 bet, and pressed **Spin**. The settled round displayed a 5×3 symbol grid, credits 999, total win 0.00 (0.00x), three selectable paylines, and the A/K/Q/J paytable (3/4/5 awards). Result said `Round complete — no win this round.`
5. Opened **Simulation**, set Rounds to 100, and pressed **Run Simulation**. Studio completed it: RTP 96.00%, hit frequency 12.00%, volatility 3.18, max win 20.00. The rendered warning correctly called out the unseeded, low-round estimate.
6. Opened **Replay** → **Recreate from seed**; entered seed `1443822`, loaded target round 1, then selected **Run again**. The completed replay showed Full round artifact capture (screen, wins, steps, debug), an inspectable result, configured-seed replay availability, and JSON export availability. Scrolled to and activated visible **Download JSON**.
7. Opened **Build/Export**. The default-destination **Build** completed (`Built to .../tsPackage`). Generated the exact base outcome library: `Generated 1,024 outcomes for mode "base" using exact (RTP 100.78%)`. Ran **Stake Engine Export (base)**; Studio reported `Exported 4 file(s) to .../stakeengine.`

## Scope note

This transcript records the controls and results independently observed in the corrected product-server session. I inspected the existing literal reels, symbols, layout, paylines/paytable and bet model, and saved a Game basics change. I did not add a new PNG artwork asset or alter the default reel/paytable values.

## Screenshots

- `screenshots/p6v04-product-01.png` — valid Design Game model
- `screenshots/p6v04-product-03-game-model.png` — model summaries / literal reels
- `screenshots/p6v04-product-05-saved-basics.png` — saved Game basics change
- `screenshots/p6v04-product-09-round.png` — settled Play grid, lines, paytable
- `screenshots/p6v04-product-11-sim-result.png` — completed Simulation
- `screenshots/p6v04-product-15-replay-result.png` — completed Replay metadata
- `screenshots/p6v04-product-17-replay-download.png` — visible Download JSON control
- `screenshots/p6v04-product-20-built.png` — completed TypeScript package build
- `screenshots/p6v04-product-22-library.png` — exact outcome-library generation
- `screenshots/p6v04-product-25-stake-result.png` — completed Stake Engine export
