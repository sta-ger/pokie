# P6-20 independent current-candidate Player-parity rerun — finding

Candidate: `88abb897afa9e32a981a66ad7bd92f5f18aeb05a`, verified on Node
`v24.18.0`. The normal candidate build passed. Its packed tarball was
`sha256:1b88fdb14e11c059025bdfbfdf11aa1d3961dafc3018c4b783a339ec3ea2abae`.
The tracked fixture Blueprint was
`sha256:d4a5837dc81732cff77e2343e9c1c0649eac7e4a9357c10d59f93978c561bd82`.

The generated fixture installed that candidate tarball. One fresh headed
Chrome profile then used only rendered-control coordinate clicks and browser
keyboard input. `npm start`, standalone `pokie client`, and `pokie dev` each
created a new `fixture-round` session and visibly rendered the identical
round: `A/C/A | A/A/C | A/A/A`, highlighted `0:0/0:1/0:2`, complete
`A=5/B=3/C=1` paytable, credits `1004`, win `5`, and `5x`.

P1 `p6-20-current-candidate-player-parity`: fresh Studio did not reach Play
or Replay. Through the visible Projects UI, the tracked fixture was detected,
registered, and exposed a rendered **Open** action. The real rendered Open
click left Studio on Projects instead of navigating to the fixture workspace;
therefore no fresh Studio Play session or Replay transition could be exercised.
`studio-open-did-not-navigate.png`
(`sha256:2682c691df89a3da6830d1a565694f29edd0a91bf577ac80733123a3bf408d28`)
captures that post-click state.

P1 `p6-20-current-candidate-player-parity`: a fresh clone of public
`pokie-examples` at `530c2c7ff709361d93fe60f59b20436be719d209` visibly lacks
**Fixture Slot**/**Open deterministic round**, so the public fixture Player
cannot be reached. Its candidate-tarball Vite production build additionally
fails at Rollup's browser-external `fs.promises` import in
`pokie/dist/esm/server/session/FileSessionRepository.js`.
`public-pokie-examples-no-fixture.png`
(`sha256:1422396ed557aeb9350bc3606ac3f9351af9f07cf7e84fb5078e8d9478c9cb7d`)
is the representative public-page capture.

Only this README, the concise transcript, and two representative screenshots
are retained. No generated package, clone, browser profile, automation,
raw/full log, or output tree is committed.
