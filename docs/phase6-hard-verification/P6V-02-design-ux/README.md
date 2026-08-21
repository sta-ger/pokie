# P6V-02 exact-candidate rendered audit

Audited checkout: `7e71fb2dda988396dfa2ad721976c2d093c24700`.

The candidate was built once, then Studio was started three times, each time
exactly as `node ./dist/cli/pokie.js --no-open`, with a fresh visible Chromium
profile on the inherited display. The bounded rendered-controls-only
transcript is in `current-candidate/ACTION-TRANSCRIPT.txt`.

Desktop and 405px controls completed Design Game, create/reopen Workspace,
Game Model, Play spin, one-round Simulation, Replay, Outcome Library, Stake
Engine export, and editable Reel Strip Modeler. No rendered product error or
dead end was observed. The recovery launch opened the native PNG picker after
one accepted visible **Select PNG** click; its PNG filter and Cancel/OK controls
were visible. Cancelling returned to the Symbols surface without an alert.

## Retained representative captures

| Capture | SHA-256 | Surface |
| --- | --- | --- |
| `01-cold-start-design-desktop.png` | `5b31eb149bd3af02f2e414b6efcd8a67f03fcdec1133d1bc8f48828f8f74f222` | Cold-start Design Game |
| `04-play-success-desktop.png` | `96f9a2f054586de09a3a184e69b6fef640bdb08023f3961aaf3ed3fa5046e7d7` | Completed Play spin |
| `06-replay-session-spin-desktop.png` | `0c5ac742e769a1327a527d2ab7a23f17f0ec77ebd80963c6d2cb2786891eae82` | Replay session spin |
| `08-build-export-mobile-405.png` | `75d891c27731b15dfea3beda0c6a468beb77e1bb5841a26a6ed77627d77ea087` | 405px Build/Export |
| `09-reel-strip-modeler-mobile-405.png` | `d8c371b3b38444fce09e99c168d6ce4718c7594d5a579b6b0d8d65765bf53f5f` | 405px editable Reel Strip Modeler |
| `10-native-picker-headed.png` | `19f7454981cf4d69b68e720edf65d872e0b7b7303ab7145568c4e930a172d94e` | Headed inherited-display native PNG picker |
