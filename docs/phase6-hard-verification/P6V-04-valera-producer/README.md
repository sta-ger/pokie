# P6V-04 independent host transcript

Candidate: `13dadda72a6b0f504c198b46844c319ce2713407`

Mode: fresh Studio registry and Chrome profile; candidate `node ./dist/cli/pokie.js --no-open`; 2026-08-23.

## Rendered results

- Created Recommended (`starter-slot-94`), opened it from Projects, inspected Game Model, and closed then reopened it.  The rendered model shows literal reel strips, a 5x3 grid, three paylines, symbols A/K/Q/J, visible strip windows, paytable payouts, bets 1/2/5, and no configured modes/mechanics.
- Started Play with the rendered `New Play session` control and spun once.  The rendered result showed its grid, credits 999, bet 1, total win 0.00, three lines, and paytable.
- Ran the rendered 10,000-round Simulation to Review: RTP 101.72%, hit frequency 11.39%, volatility 3.69, max win 36.00, duration 0.5s.  Studio truthfully warned that no seed was supplied.
- The final fresh recovery run selected the rendered `Session Spin` source, then its actual `Session 1 — Round 1 — Spin — win 0` button.  Studio rendered `Loaded replay`, the complete recorded-round inspector (grid, credits, bet, paylines, paytable, and state capture), enabled `Download JSON`, and the browser downloaded one JSON artifact.  This repaired a driver transition; no private API or fabricated state was used.
- Build/Export showed `Status: Ready to build`; the rendered TypeScript Game Package action completed with `Built to .../starter-slot-94/tsPackage`.
- Focused recovery reruns used fresh registries/profiles from the same candidate build.  A rendered local `Edit` saved a literal-strip change (Reel 1 became `A A K Q J`), and the project then closed and reopened successfully.  The native PNG picker accepted `/usr/share/pixmaps/debian-logo.png` through its active rendered dialog, but neither permitted selection attempt yielded local rendered artwork confirmation.  The visible Bets editor accepted the `Add bet mode` action, but its off-viewport native `New bet amount` and `Add free games` controls did not receive a confirmed driver transition; no rendered product error appeared.

## Scope outcome

This is inconclusive, not a product finding: the permitted fresh recovery launches were consumed while repairing the driver’s local-`Save`, native-picker, section-`Edit`, viewport, and Session-Spin transitions.  Literal reel editing, bet-mode addition, save/reopen, Replay selection, and JSON export were rendered.  Artwork verification and confirmed new-bet/free-games changes remain unverified because their rendered controls did not expose a completed driver transition; no P0/P1/material-P2 product symptom was rendered.

## Screenshot checksums

| Screenshot | SHA-256 |
| --- | --- |
| `screenshots/game-model.png` | `817184b666fb0d276a8fedf8a374627921b397aa7ba1bf5f5b0e4507fc4ba8c3` |
| `screenshots/play-round.png` | `c7100ba5dbe88e7e69c5a892c3e5a7c46cc998c169b4a3024f194f0de187d8e2` |
| `screenshots/build-result.png` | `f664c16ecaeeb3480c22a887cee186088441068583c296ad0bdbe510d8b5c506` |
