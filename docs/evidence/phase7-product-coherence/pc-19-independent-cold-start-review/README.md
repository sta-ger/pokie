# PC-19 exact-candidate independent review — P2 finding

Candidate: `cc0219a1088de689781de5bf56ed2786e8d40972`
Archive: `artifacts/pokie-1.3.0.tgz`
Archive SHA-256: `07053aad46507e453d0fadd04a18cf47e03031cceb6d1a80ae49ee5735b509ad`

The archive was freshly packed after a candidate-source build and installed into
an isolated examples consumer. A fresh candidate-source Studio run completed
Create, Play/Spin, Simulation, Replay inspection, Game Model, exact 1,024-item
Outcome Library generation, native-picker Outcome/PAR builds, project close and
reopen. The isolated archive-installed fixture player rendered at desktop and
narrow viewports, including its feature scenario controls.

The small exact archive CLI flow completed Blueprint validation, exact Outcome
Library and Stake output, PAR export/import/validation, simulation, replay, and
fairness commitment/reveal/verification. The separate accepted large exact
generation is an unresolved material P2: both `build --target outcomeLibrary
--exact` and `generate --exact` accepted an estimated 614,656-outcome request,
then fatally exhausted Node memory after work/progress, with no library or
action-local recovery result. The complete PC-19 acceptance record therefore
cannot pass.

The verifier supplied the receipt and its digest to the protocol validator. The
validator correctly rejected release-complete validation because this finding
freeze intentionally has no complete acceptance record (`PROVENANCE.json` is
absent); it was not represented as a passing review.

The verifier-owned receipt is outside this directory at
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/PC-20-fc978abcc6fa36ae/pc-20-freeze-receipt.json`.
Its digest is stated in the verifier report.
