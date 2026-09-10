# PC-20 recovery correlation follow-up

Candidate: `375499b8fb45757d756ca8118f616a7acb15f05f`.
The retained package archive remains unchanged and hashes to
`3ba7cde00e67d1205def985ef20958198ec2aca16ee6207e89ee632a57662622`.

Three new isolated Studio profiles (harness launches 17, 18, and 19) ran the
candidate source launcher exactly as `node ./dist/cli/pokie.js --no-open`.
Each created the starter workspace, settled one Play Spin, and reached the
same successful rendered export terminals: a 100-round Simulation completed,
the exact base Outcome Library was generated, and the Stake Engine export
reported its published manifest. Launch 17 retained the Simulation terminal
before the later report-control selector timeout, so that later timeout does
not contradict the completed operation.

Each launch then reached the visible, enabled **Build** control scoped to the
`PAR sheet (.xlsx)` card. Its local ready state said `Status: Ready to build`;
the control was activated once per fresh profile. During the 120-second
action-local wait, no rendered pending/job record, success/recovery surface,
or product error appeared for that PAR action. No activation was duplicated
within a profile. This is not a product finding: the rendered UI did not
provide a correlated terminal state from which to make one. It blocks the
remaining PAR/lifecycle coverage and therefore a complete PC-19 protocol
record and freeze receipt cannot truthfully be created.

The verifier-controlled (uncommitted) transcript digests are:

* launch 17: `ff35c4a51ccaaded62568b01c7cab74213dcc5c9fec01e4a0a93a41f3cbea1c9`
* launch 18: `f2e6d60d2b442bc401d412a4ac14e1045e44ec99536fe606aade16984da9c746`
* launch 19: `9845a70d7061e8eccde4f904637cdee64748e6428d235b54ef11a94e7312aeef`

No product code, tests, generated project/output tree, browser profile, or
browser automation was retained in the repository.
