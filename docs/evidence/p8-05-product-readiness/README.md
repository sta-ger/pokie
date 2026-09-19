# P8-05 product-readiness campaign

This directory is append-only campaign evidence for a single final candidate.
`scripts/p8-05-product-readiness-campaign.mjs` validates the five clean-room
initial audits, frozen finding register, focused regressions, clean retests and
cleanup attestations. `scripts/p8-05-release-completion.mjs` permits the
existing PC-20 release lifecycle only after that validator accepts the exact
retest commit and package digest.

No candidate evidence is checked in here: audits and release receipts are
created by the independent controller after the candidate is final. Historical
`docs/evidence/p8-05-runtime/` remains untouched.
