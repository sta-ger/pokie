# P6-20 independent current-candidate Player-parity rerun — finding

Candidate: `88abb897afa9e32a981a66ad7bd92f5f18aeb05a` (Node `v24.18.0`).
The normal candidate build passed. A tarball made from that build
(`sha256:1b88fdb14e11c059025bdfbfdf11aa1d3961dafc3018c4b783a339ec3ea2abae`)
was installed into a newly generated `fixture-slot` package made from the
tracked fixture (`sha256:d4a5837dc81732cff77e2343e9c1c0649eac7e4a9357c10d59f93978c561bd82`).

One fresh Chrome profile used only rendered-control coordinate clicks and
keyboard input. `npm start`, standalone `pokie client`, and `pokie dev` each
created a new `fixture-round` session and visibly rendered the identical
round: `A/C/A | A/A/C | A/A/A`, highlighted `0:0/0:1/0:2`, complete
`A=5/B=3/C=1` paytable, credits `1004`, win `5`, and `5x`. Studio Play and
Replay both completed that same visible round; `studio-play.png` is the one
representative successful Studio capture.

P1 `p6-20-current-candidate-player-parity`: a fresh clone of the real public
`pokie-examples` repository at `530c2c7ff709361d93fe60f59b20436be719d209`
did not render the required **Fixture Slot**/**Open deterministic round**
entry. Its visible index is captured in `public-pokie-examples-no-fixture.png`,
so the public Player page and round could not be exercised. Additionally,
after installing the candidate tarball, the public checkout's normal Vite
production build stopped at Rollup's browser-external `fs` module with:
`"promises" is not exported by "__vite-browser-external"`, imported by
`pokie/dist/esm/server/session/FileSessionRepository.js`. Thus the requested
public cross-surface parity is not presently releasable, despite the reachable
package and Studio paths passing.

Only this README, the concise transcript, and two representative screenshots
are retained; no generated package, clone, browser profile, automation, or raw
log is committed.
