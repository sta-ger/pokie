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

The current retained-campaign closeout attempt is indexed in
`closeout-verification-6ae640f1.md`.  It records a public-controller
compatibility failure without rewriting the historical campaign; official
release actions remain pending approval.

## Corrected closeout — 2026-10-06

`closeout-verification-b0a9b66c.md` records the successful corrected public
closeout and a separately invoked successful campaign validation of the
retained candidate/package pair.  It links the immutable manifest, both
external anchors, the append-only closeout, and the pending-approval release
consumer handoff.  No release, packaging, publication, or Drive operation was
run.

## Evidence-only cleanup — 2026-10-05

The verifier removed exactly three superseded, policy-flagged artifacts from
the authorized ephemeral harness campaign
`P8-05-e8e841284370ac5e/campaign-c908cba68a1f79e2-recovery-1`:
`retest-audit-failure.json`, `initial-audits.json`, and
`initial-controller-machine-proof.json`.  They were unreferenced by this
checkout's retained evidence index.  No campaign, browser, Studio, build,
package, install, test, release, publication, or Drive action ran during this
evidence-only finalization.
