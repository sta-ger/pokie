# P6V-04 candidate recovery transcript

- Candidate checked: `b0b11f6184e10a6072cdbec4bd196d045d006714`; this
  checkout is its clean docs-only evidence descendant.
- `npm run build-cli` completed, then a new Studio registry and a new Chrome
  profile ran the candidate source exactly as `node ./dist/cli/pokie.js --no-open`.

## Reached rendered journey

Created the default Blueprint, inspected its Game Model (5×3 literal reels,
symbols, paylines, paytable and bets), then saved, closed and reopened it from
Projects. Play created a session, settled a no-win round and a found winning
round (J line, 4.00 win), visibly showing grid, credits, win amount, positions,
paylines and paytable. Simulation completed 10,000 rounds and displayed its
RTP, hit frequency, volatility, max win and reproducibility warning.

Build/Export completed the TypeScript package, exact base outcome library
(1,024 outcomes, displayed RTP 100.78%), and Stake Engine export (4 files).
Representative generated outputs were not retained; SHA-256 checksums were:

- `tsPackage/dist/index.js`: `c13283e3916ffd0747b095ed631eddc147887e1475f1bd564663686e65b896f5`
- `outcomelibrary/manifest.json`: `8ad4a84aad3128643b7d2409f4cd10e5e1aa5b29643f2222fb5969401bd129c1`
- `stakeengine/pokie-manifest.json`: `fd560f61b8140ec43b87ecc518b6789604bc585b9b6c95fdb8065969226cfc69`

## Remaining driver-inconclusive portions

No rendered product error occurred. The visible driver could not bind the
specific Reels, Symbols, Bets & Modes, or Mechanics section-local edit controls
after the app’s repeated generic `Edit` labels; it therefore did not claim
artwork, literal-strip/stack changes, new bet/mode or free-games persistence.
Replay’s rendered `Session Spin` selector exposed no actionable browser control
to this driver, so round load and JSON download were not rechecked. These are
driver limitations, not product findings. No screenshots are retained: the
concise transcript and checksums are the bounded proof for this incomplete run.
