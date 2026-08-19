# P6-20 independent Player-parity rerun — finding

Candidate `00b814a0a764f21933d04d907a32602c599b6365` was built from this
worktree, packed locally, and exercised in a fresh Chrome profile using only
rendered controls, coordinate clicks, and keyboard entry. The generated
`fixture-slot` package, `fixture-round`, round 1 was used throughout.

The generated-package `npm start`, `pokie dev`, Studio Play, Studio Replay,
and the normal public `pokie-examples` Vite workflow (with this candidate
tarball installed) all rendered `A/C/A | A/A/C | A/A/A`, highlights
`0:0/0:1/0:2`, paytable `A=5/B=3/C=1`, credits `1004`, win `5`, bet `1`, and a
five-times payout.

P1 finding: the separately launched `pokie serve` + `pokie client` flow first
rendered a distinct unseeded round. After the visible seed entry and **Start
new session**, the visible **Spin** was disabled immediately, but its first
enabled seeded spin rendered a different, unhighlighted grid instead of the
fixture. This breaks deterministic Player parity and the standalone-client
session-transition criterion. The concise rendered-control record is in
[verification-transcript.txt](verification-transcript.txt).

Only this README and transcript are retained. Temporary package trees, local
services, browser profile, screenshots, logs, and drivers were removed.
