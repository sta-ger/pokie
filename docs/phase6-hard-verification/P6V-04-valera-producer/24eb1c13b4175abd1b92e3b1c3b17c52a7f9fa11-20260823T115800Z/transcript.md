# P6V-04 independent producer transcript

Candidate: `node ./dist/cli/pokie.js --no-open` at `24eb1c13b4175abd1b92e3b1c3b17c52a7f9fa11`.
All product actions below were performed from the rendered Studio UI using mouse/keyboard input; no source, tests, documentation, prior verification artifacts, or application APIs were read.

## Outcome

**PARTIAL / failure preserved.**  The end-to-end producer path reached package build, Play, Simulation, and Replay export.  Outcome-library generation (the prerequisite to Stake Engine export) failed visibly with:

> `"producer-verified-slot" cannot exactly enumerate bet mode "base" because its exact-enumeration session does not support bet-mode selection.`

The PNG-selection control was reached for a symbol, but its native selection did not result in a visible saved artwork preview, so artwork attachment is also not claimed as passed.

## UI journey

- Created the Blueprint project, changed its id/name to `producer-verified-slot` / `Producer Verified Slot`, and saved it.
- Inspected and saved a 5-reel by 3-row line game with 3 paylines, symbols A/K/Q/J, literal reel strips, and paytable.  Configured visible bets 1/2/5 plus mode `base` (cost multiplier 1, RTP 96).  Attempted free-games mechanics, but no selectable scatter appeared, then discarded that unsaved mechanic.
- Closed the project, located it in Projects, and reopened it; the saved id/name were displayed.
- Built the TypeScript Game Package to the displayed default destination.  Studio then displayed `Built to /home/stager/Documents/POKIE Projects/starter-slot-110/tsPackage.`
- Started Play, spun a round, and inspected a completed 8.00 win: 5 J positions were highlighted on the bottom payline; the Play view displayed paylines, bet buttons, paytable, win amount, positions, and round detail.
- Ran 10,000-round Simulation.  Results showed RTP 98.00%, hit frequency 10.46%, volatility 3.69, max win 36.00, duration 0.4 s, and the visible warning that no seed was supplied.
- Loaded the Play session spin in Replay.  The round was marked Inspectable and Exportable; its grid/paytable/win detail was shown and `Download JSON` was activated.
- Tried to generate the outcome library using its default destination.  Studio displayed the exact-enumeration failure above, so the dependent Stake Engine export was not completed.

## Representative evidence checksums

| File | SHA-256 |
| --- | --- |
| `model-literal-reels.png` | `3bdfb53d55bf6e2baa97aafaa8ddd70e8b745051e30ef9154b5ce9798cb7185f` |
| `build-package-success.png` | `4b03d685aa9f2ea48514232dfd106a9e9e4156ee35f59283bb13079fa84d4ada` |
| `play-grid-wins-paytable.png` | `7fb5571ed80e9a5e194cc1b045b4fd17fb96b83d7580b3f175329b882b585c40` |
| `simulation-results.png` | `d66f9565a0fa9b2fa2fd8d45927346d41f6aa2bae68daa8e08ec32fd639b41e5` |
| `replay-export-ready.png` | `3a3d7b7e0108f5642f13d2c8969b39a1e7dc08a182e819d3e0c4066958d5b801` |
| `outcome-library-failure.png` | `64aaac62d5f8ebb8600a67aadf0b567be395ba768c7d9beb702e1adfa3c0cf33` |
