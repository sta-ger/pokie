# P6-20 independent Player-presentation rerun

Candidate `7d13394a0484946de11e3ac624b30a648482f15c` was freshly built with Node 24.18.0 and exercised through a fresh headed Chrome profile using rendered controls only. The generated `fixture-slot` package used seed `fixture-round`, round 1.

Generated-package `npm start`, standalone `pokie serve` + `pokie client`, `pokie dev`, Studio Play, and Studio Replay all rendered `A/C/A | A/A/C | A/A/A`, persistent highlights `0:0/0:1/0:2`, line-A win `5`, credits `1004`, bet `1`, five-times payout, paytable `A=5/B=3/C=1`, and no feature counter. The standalone client had first rendered a prior unseeded round; immediately after visible `Start new session`, its Spin control was visibly disabled and a coordinate click did nothing. After boot, the visible seeded spin rendered the fixture round, not the prior round.

The final public `pokie-examples` leg is externally unavailable: the current public checkout (`530c2c7ff709361d93fe60f59b20436be719d209`) has no `fixture-slot.html`, and `git fetch origin c36f83b68dca6be9d4a56e0c66e6ddb5819e1f28` returned `remote error: upload-pack: not our ref`. Its Vite workflow did launch normally, but cannot exercise the required fixture. See [verification-transcript.txt](verification-transcript.txt).

Only this concise README and transcript are retained; temporary package trees, browser profile, screenshots, logs, and browser-driving source were removed after verification.
