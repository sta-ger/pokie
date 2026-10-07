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

## Reviewed release handoff

A campaign keeps the commit and archive it actually exercised. When a reviewed
release commit is a descendant containing only P8-05 campaign/release tooling,
its focused tests and this step's evidence changes, the release configuration
may supply:

```json
{
  "campaignReleaseHandoff": {
    "auditedCandidateId": "207d0d2b4d83b329b60a062bfb4f9818ff1162d1",
    "archivePath": "<absolute path to the retained canonical npm archive>"
  }
}
```

The configuration's `candidateId` (and `pc20.candidateId`) remains the exact
reviewed release checkout. Its `candidatePackageSha256` remains the audited
archive digest. Campaign and output directories remain external. The consumer
revalidates both trusted campaign anchors, the original candidate build receipt,
the complete archive executable manifest and Git ancestry. Every product or
build input outside the explicit tooling/evidence allowlist must be identical;
any difference requires new blind retests. It does not relabel retest records.

`node scripts/p8-05-release-completion.mjs --preflight --config <absolute-json>`
authenticates this binding and checks PC-20's exact clean checkout and package
identity without running a gate or creating any receipt. Its JSON result joins
the audited and reviewed commits, campaign manifest/closeout, build receipt and
archive with a deterministic handoff digest. Gate, completion, retained-receipt
reuse and the protected lifecycle revalidate and retain that same binding.
Packaging smoke installs the original canonical archive in handoff mode and
retains those exact bytes for publication; the existing direct-candidate mode
continues to build and pack normally. The preflight is not release evidence:
official gates and the protected publication/Drive lifecycle remain controller
work after independent review.

## Independent preflight verification — 2026-10-06

`preflight-verification-d15a438b.md` is the bounded verifier-owned index for
the exact reviewed handoff.  It records the successful public preflight, an
independent wrong-checkout rejection, unchanged retained-campaign digests, and
the controller-owned complete-file result without retaining raw logs or
generated artifacts in this checkout.
