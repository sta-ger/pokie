# P6V-04 independent producer transcript — correction candidate

Candidate: `5c1e4bb274bd72b6e653cbb997a5fca5315b9003`; launch command: `HOME=/tmp/p6v04-fresh-home-5c1e4bb-20260823T122437Z node ./dist/cli/pokie.js --no-open`.

Fresh Studio home/registry and fresh Chrome profile were used. All product actions were performed with rendered UI controls only.

## Results

- Created the fresh default Blueprint. Its visible model was 5 reels × 3 rows, line wins, 3 paylines, symbols A/K/Q/J, literal reel strips, visible bets/paytable and base mode. The model was valid.
- Reached each symbol's `Select PNG` UI control. In this environment the file chooser did not open from the visible browser control, so a real artwork attachment/persistence cannot be claimed.
- Generated the exact base outcome library successfully: 1,024 outcomes, exact RTP 100.78%.
- Ran Stake Engine Export successfully: UI reported `Exported 4 file(s)` to the fresh project directory.
- Ran TypeScript Game Package build through its visible Build UI.
- Play: used `Find any win`; UI produced an 8.00 J line win with five highlighted J positions, then showed paylines/bets/paytable/round detail.
- Simulation: 10,000 rounds completed; RTP 105.02%, hit frequency 10.78%, volatility 3.87, max win 36.00, duration 0.5 s.
- Replay: loaded the actual winning session spin, displayed its round detail and exportability, then activated `Download JSON`.

## Bounded failure / incompleteness

The real PNG artwork persistence criterion was not completed: attempting the visible `Select PNG` control did not yield a file chooser in the browser environment. Close/reopen was not re-run after the fresh candidate's full journey. No claim is made for these two items.

## Evidence checksums

| File | SHA-256 |
| --- | --- |
| `outcome-library-success.png` | `b1dbf932ae26cb2326dcd87c0c713a53d2c90b2917b679f2ea989e34ce270129` |
| `stake-export-success.png` | `0e5640476b6fd26114e9b0d66e8109ffe1510ce5d263718f960ff1a44de5cf28` |
| `play-win-grid.png` | `feec3d2d6e3be264bead39cf4753439f67be374240835da1653f4d0dfb092b84` |
| `simulation-results.png` | `7036686127de17f50a7b1c2d52215f528cf8707efee54d89ed91048abb4f2140` |
| `replay-export-ready.png` | `b48588bdbf5085d1f8ab29e2d690c0630c1053e6bdb055dd9a030a87ab04c842` |
