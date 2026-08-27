# P8-04 independent fresh-profile authoring rerun

Product candidate: `cce79716790ae3cfc8d6f5c095fbc08426386e56`.
The checkout's product source matches that candidate; its only descendant change is this bounded evidence path.

## Fresh public Studio journey

On 2026-08-27, a new isolated HOME and Chromium profile launched the candidate build exactly with `node ./dist/cli/pokie.js --no-open` (never `node_modules/.bin/pokie`). Studio and Chromium used the inherited controller display; Chromium was visibly activated and verified before input. The journey used rendered Studio controls and guidance only.

- **Design Your Game** rendered its required Game id/Game name/Version and optional Description/Author guidance. **Choose a different start** then **Use the starter game** opened the guided starter editor.
- Clearing the rendered **Game id** produced the local, actionable error `"manifest.id" must be a non-empty string.` in 675 ms. Entering `fresh-p8-04-slot` and **Fresh P8-04 Slot** returned a valid design in 666 ms.
- Layout guidance warned that reducing reels can remove custom reel/payline data. Reducing 5 to 4 displayed `Reduce reels from 5 to 4?` and stated that definitions beyond reel 4 would be removed. **Cancel** completed in 271 ms, restored the visible count to 5, and preserved five visible Payline 1 cells. Repeating the change and **Confirm** completed in 2 ms, visibly left 4 reels/4 cells, and showed four named actionable repairs in 714 ms.
- In Paytable, the four rendered `Remove A/K/Q/J x5 payout` controls each disappeared immediately after its own click. The resulting `Valid, with warnings — 0 error(s), 1 warning(s).` state contained only the actionable K-versus-Q strip-weighting/RTP advisory; it was not an authoring error.
- **Create game** opened the saved project workspace in 299 ms. **Close project** immediately rendered the Projects row, and its rendered **Open** action reopened **Fresh P8-04 Slot** in 1 ms. The reopened workspace displayed the next-workflow controls (Game Model, Play, Simulation, Replay, and Build/Export) and the editable, valid-with-warning project state.

No browser console warnings/errors were recorded. The sole network diagnostic was two `GET /favicon.ico` 404 responses. No rendered product error occurred.

## Bounded proof

Only checksums of discarded rendered screenshots/results are retained; no browser profile, project tree, automation source, raw log, or generated output is committed.

- destructive-reduction confirmation PNG: `281526afa1ab539b9b82e571984a38edc60d10185d8aaebce8f9ea92c468431b`
- repaired four-reel design PNG: `3b85476ac3b90231181a6d8ea3996226424e36e1209eb809797608fd2319c568`
- reopened workspace PNG: `adead6b075e4300645c62e4bc60668387fdffaa8c8b4d6ab6c31ee53b21e3cfd`
- rendered result transcript: `9cb335c786c7f2a2100052ade11f2883fa4d0107b113f8effe1ecaf2da0931a2`
