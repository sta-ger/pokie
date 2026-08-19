# P6-20 independent host verification — finding

Candidate `3b9ef34ee961fffc9895477f390a2c7dbdc4579e` built successfully on
Node `v24.18.0`. The exact `npm pack --ignore-scripts` tarball SHA-256 is
`19242014e5634120d7125653c2828a8f155205d4caabc8bb186dcd6d0896b624`.

The real public `sta-ger/pokie-examples` clone from GitHub was
`530c2c7ff709361d93fe60f59b20436be719d209`. Its package scripts are only
`dev`, `build`, `preview`, and `pages`; its tracked source has no Fixture
Slot/deterministic-fixture page. Therefore the packed candidate cannot render
the required deterministic fixture in that public consumer, and its package
`npm start` surface does not exist. This is P1
`p6-20-current-candidate-player-parity`.

A fresh headed Studio from the exact candidate successfully performed the
visible Projects → Detect → Register → Open → Play → Replay flow. Play and
the recorded Session 1 replay both rendered A/C/A | A/A/C | A/A/A with credits
1004, win 5, and paytable A/B/C. The retained Play screenshot SHA-256 is
`312cab0545a719fd6871265d0a0d93ab6fe9adaeeb098743749fe3501ed0769a`.

Only this summary, the concise transcript, and one representative screenshot
are retained; no clone, tarball, profile, automation source, raw log, or
generated output tree is committed.
