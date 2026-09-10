# PC-20 independent PC-19 attempt — bounded driver evidence

Candidate: `375499b8fb45757d756ca8118f616a7acb15f05f`.

The exact candidate was built and packed before this review. The retained archive is
`artifacts/pokie-1.3.0.tgz` (SHA-256
`3ba7cde00e67d1205def985ef20958198ec2aca16ee6207e89ee632a57662622`, 3,220,705 bytes).
The public CLI help rendered successfully from `node ./dist/cli/pokie.js --help`.

Two fresh-profile Studio launches used exactly `node ./dist/cli/pokie.js --no-open`.
The second launch is represented by the two screenshots below (and their SHA-256
digests):

* `browser-launch-2/studio-home.png` — `91d5904886a479de412dc19aa1229ee71a6fda8e716f74e6f50067f9ffe807b7`.
  The rendered initial Studio screen exposed an enabled **Create game** control.
* `browser-launch-2/studio-workspace.png` — `831c75d912852a8f9be211f1fe6d876455e2885f98f1b331e52d2aea7872cf2f`.
  One activation of **Create game**, then one activation of **Preview Game Model**,
  rendered the created `starter-slot` workspace as valid and exposed enabled
  **Open Play**, **Simulation**, **Replay**, and **Build/Export** controls.

For the second launch, the local ready state immediately before the attempted
player transition was the created workspace with enabled **Open Play**. That
control was activated once at 2026-09-10T05:03:03.254Z. No accepted job/pending
record, player surface, action-local terminal state, or rendered product error
appeared during the bounded 60-second wait. This is an action-readiness/driver
correlation gap, not a product finding. Per the bounded-launch rule, no third
Studio launch was made and the incomplete blind coverage was not frozen or
represented as a protocol-valid PC-19 record. Consequently no trusted freeze
receipt was created: such a receipt can only anchor an actually complete blind
record.

The pre-existing PC-19 evidence directories were not edited. This directory is
the only retained evidence delta from this inconclusive attempt.
