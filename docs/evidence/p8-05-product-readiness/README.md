# P8-05 product-readiness campaign

This directory is append-only campaign evidence for a single final candidate.
`scripts/p8-05-product-readiness-campaign.mjs` validates the five clean-room
initial audits, frozen finding register, focused regressions, clean retests and
cleanup attestations. `scripts/p8-05-release-completion.mjs` permits the
existing PC-20 release lifecycle only after that validator accepts the exact
retest commit and package digest.

Candidate-bound verifier receipts are retained here only after an independent
controller has completed them. Historical `docs/evidence/p8-05-runtime/`
remains untouched.

## Evidence-only cleanup — 2026-10-05

The verifier removed exactly three superseded, policy-flagged artifacts from
the authorized ephemeral harness campaign
`P8-05-e8e841284370ac5e/campaign-c908cba68a1f79e2-recovery-1`:
`retest-audit-failure.json`, `initial-audits.json`, and
`initial-controller-machine-proof.json`.  They were unreferenced by this
checkout's retained evidence index.  No campaign, browser, Studio, build,
package, install, test, release, publication, or Drive action ran during this
evidence-only finalization.
