# P6-20 independent host verification — finding

Candidate verified: `3b9ef34ee961fffc9895477f390a2c7dbdc4579e` on Node
`v24.18.0`. `npm run build` completed and `npm pack --ignore-scripts`
produced `pokie-1.3.0.tgz` with SHA-256
`19242014e5634120d7125653c2828a8f155205d4caabc8bb186dcd6d0896b624`.

The real public `sta-ger/pokie-examples` main checkout was
`530c2c7ff709361d93fe60f59b20436be719d209`. It installed that exact
tarball and its public `npm run build` passed (853 transformed modules). A
fresh headed Chrome profile visibly rendered its **Verifiable spin** Player;
the retained screenshot is SHA-256
`43435740241aaa6f7303a5f8264bc84f74e7e885ee305547167839096960fdd8`.

P1 `p6-20-current-candidate-player-parity`: the public repository contains
no **Fixture Slot** / deterministic-fixture route and no `npm start` script.
Consequently the requested fixture cannot be rendered in that public consumer,
and package-start/client/dev/Studio parity for that exact round is not
independently runnable.

P1 `p6-20-current-candidate-player-parity`: in a fresh headed Studio against
this candidate, the visible Projects page accepted keyboard text in Location,
but its rendered **Detect** action remained disabled. The fresh
Detect → Register → Open → Play → Replay workflow therefore did not reach
Play or Replay. The interaction was not retried.

Only this summary, one concise transcript, and one representative screenshot
are retained. No package tarball, clone, browser profile, automation source,
full log, or generated tree is committed.
