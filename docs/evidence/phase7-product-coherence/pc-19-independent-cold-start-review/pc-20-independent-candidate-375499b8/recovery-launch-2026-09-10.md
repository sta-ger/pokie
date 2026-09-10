# PC-20 recovery launches — compact transcript

Candidate: `375499b8fb45757d756ca8118f616a7acb15f05f`.
Exact retained package archive: `artifacts/pokie-1.3.0.tgz`, SHA-256
`3ba7cde00e67d1205def985ef20958198ec2aca16ee6207e89ee632a57662622`.

Both permitted fresh-profile launches used the candidate source launcher exactly:
`node ./dist/cli/pokie.js --no-open`. The persistent harness was first repaired
to wait for the rendered same-page Play route rather than assuming a new browser
target. It then completed this action-local sequence in each new profile:

1. `Create game` → created `starter-slot` workspace.
2. `Preview Game Model` → workspace with enabled `Open Play`.
3. `Open Play` → rendered `Start Play` / `New Play session` surface.
4. `New Play session` → local Play session with enabled `Spin`.
5. `Spin` → `Round complete — no win this round.` (the local terminal state).

The second launch additionally activated `Run Simulation`. Its own rendered
state became `queued — 0/10000 rounds`, then `running — 2000/10000 rounds`.
The harness incorrectly accepted a broad page-text predicate as terminal and
navigated away before recording that job's terminal state; it did not send a
second simulation request. The Replay view subsequently rendered its genuine
`Session Spin` source selector, but its `Load` action was not reached by the
remaining generic selector. Build/Export rendered an enabled navigation route,
but the Outcome Library action was still disabled while its local readiness
surface settled. Neither condition rendered an action-local product error, so
they are driver/readiness gaps, not findings.

Public CLI confirmation from the candidate build: `node ./dist/cli/pokie.js
--help` printed the command inventory, and `node ./dist/cli/pokie.js
not-a-command` returned the documented unknown-command error. No private API
was used.

Representative browser captures remain only in the verifier-controlled harness
workspace and are intentionally not committed. SHA-256: launch 3 player round
`6e69a1ac0e086b4ae3357502cdfcc6afcdc9cdc1c941cfbccca4c7455e3c8d73`;
launch 4 player round
`7ba48b8051d21d6907c2998d60023bd4143d8b8e2465b2694651c31456003fbc`;
launch 4 queued-simulation capture
`5a4291caed81ff5ef3c807c7e59b09c6064e97c2aeab0b96ba5f73fe97093eee`.

The two-launch budget for this recovery invocation is exhausted. Because the
remaining required PC-19 coverage and post-freeze comparison are incomplete,
no immutable complete review record or trusted freeze receipt was created.
