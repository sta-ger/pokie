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
