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

The subsequent [recovery-launch-2026-09-10.md](recovery-launch-2026-09-10.md)
records two fresh-profile candidate launches that repaired the previously
unconfirmed Open Play transition and reached a completed rendered Spin. It also
records the still-incomplete simulation/replay/export coverage without claiming
a protocol-valid PC-19 pass or a product finding.

## Final recovery, 2026-09-10

Fresh profiles 21–23 reused the repaired persistent harness and candidate
source launcher only. The final stable run reached a completed 100-round
Simulation, a selected local Session Spin replay, the exact base Outcome
Library terminal, a TypeScript package terminal, and the scoped Stake Engine
export terminal. It also reached Game Model and each required Studio route.
The full unretained rendered transcript is verifier-controlled at
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/PC-20-ddbc1b61bdffbdcc/launch-23-output/studio-transcript.txt`
(SHA-256 `b5996bcfd5ada4cceddd395bbe357ae73374b9db5728faf3212ec88ebeda7f7f`).

The final action was the exact enabled **Build** control in the `PAR sheet
(.xlsx)` card. Its local ready state was `Status: Ready to build`; it was
activated once at `2026-09-10T06:26:24.534Z`. For the following 120 seconds the
same card rendered neither a pending/job state nor its own output/success/error
surface. The recovered matcher was limited to the PAR heading's small card
subtree and did not use the sibling Stake output. This remains an
action-correlation driver gap, not a product finding.

To avoid treating a missing verifier-owned receipt as an external prerequisite,
the bounded empty blind finding list was frozen in
`frozen-findings.json`. The external verifier-owned receipt is
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/PC-20-ddbc1b61bdffbdcc/pc-20-partial-freeze-receipt.json`
(SHA-256 `a6d095c8ef083fcddd1ac529b9a6831fde45eaf09ab5e7c0c066d5ffbdf4e4b8`).
The PC-19 validator received that exact identity and receipt; it correctly
rejected completion because this partial run lacks `PROVENANCE.json`. No
post-freeze comparison was opened. The receipt anchors the partial state only;
it does not claim complete coverage or release approval.
