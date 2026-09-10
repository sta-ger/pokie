# PC-20 harness-recovery follow-up

Candidate: `375499b8fb45757d756ca8118f616a7acb15f05f`.
The retained exact archive remains
`artifacts/pokie-1.3.0.tgz` (SHA-256
`3ba7cde00e67d1205def985ef20958198ec2aca16ee6207e89ee632a57662622`).
The pre-existing home/workspace screenshot digests still match the README.

The four-launch recovery allowance was used with fresh Studio profiles and the
candidate source launcher only: `node ./dist/cli/pokie.js --no-open`.
The first launch was stopped before an asynchronous operation after its route
check was repaired. The remaining launches created the starter workspace,
opened Play, created one Play session, and settled one Spin.

The rendered `Run Simulation` control was ready and activated once. Its local
accepted state was `queued — 0/10000 rounds — elapsed 0.0s`; no job identifier
was rendered. After a 120-second wait, that same operation had no local terminal
state and no rendered product error, so it was not sent again. Similarly,
`Generate exact outcome library (base)` was ready and activated once; its
accepted local state exposed `Cancel generation`, but no action-local terminal
was retained before the profile ended, so it was not repeated.

Replay recovery succeeded: selecting the rendered `Session Spin` radio and its
one rendered `Session 1 — Round 1 — Spin` item yielded the local terminal
`Loaded replay`, `Inspectable AVAILABLE`, and `This round's data is loaded and
ready to inspect.` The later rendered success supersedes the harness's earlier
too-narrow transition wait; it is not a product finding.

The final rendered `Build` control was enabled and activated once. It rendered
no accepted/pending job, action-local terminal, or product error during the
bounded 30-second diagnostic wait. This is a driver/readiness gap, not a
product finding. The unretained harness transcript SHA-256 is
`c6744f519eedc36251f5facb8b78f2a9f6583f8d697675af0c5a929eb73015e0`.

No complete blind coverage record can truthfully be frozen from these partial
lifecycle observations. Therefore this directory deliberately contains no new
protocol record, trusted freeze receipt, validator pass, or release conclusion.
No P0, P1, or material P2 product finding was observed in the reached rendered
workflow.
