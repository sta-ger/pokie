# P8-05 recovery authentication — 256cbe2c

This is a bounded, append-only index of verifier-owned runtime evidence.  It
does not copy browser profiles, generated projects, packages, screenshots, or
raw logs into the candidate checkout.

## Authenticated collection

Candidate: `256cbe2cb471e610f2db6bf1712b4fca8ba1cb68`  
Candidate package SHA-256:
`52a9a0ab45101f34bd440be2009721ae0eafbf49ea9b9a48ddf19ad9ae4d1a4b`

The immutable executable receipt is
`candidate-executable-receipt.json`, SHA-256
`63e68e972d98b06b41145f8d6181ed075b03593b17472f82235521e9b7af456f`.
The independently rechecked collection receipt is
`collection-authentication-7072499da358f70b.json`, SHA-256
`8087cb5c5f30c029d81830b3fe61bbaafca8fe2cc02eb3b44892e70e2a653031`,
under the verifier harness
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P8-05-7c4c5562d8acd1ee/`.

It authenticates these non-rewritten, isolated runs:

| phase | summary SHA-256 | completed | personas / viewports |
| --- | --- | --- | --- |
| initial | `fb50b98edec9117b728f865454d6484cca767579ac269186430552935a86b048` | 2026-10-04T23:39:01.703Z | mathematician/wide, programmer/compact, producer/narrow, UI-UX/wide, graphic-designer/compact |
| retest | `0c0a229682ff57d0a81d5daf301685df46b979443ab74b18b4aa5ba2688c04d7` | 2026-10-04T23:52:46.033Z | mathematician/wide, programmer/compact, producer/narrow, UI-UX/wide, graphic-designer/compact |

Both summaries have six passed checklist items, five passed persona audits,
and no uncompleted action.  Every audited leaf's digest matches its summary;
each records `processTreeDrained`, `resourcesDrained`, and `contextRemoved` as
true.  The frozen finding register SHA-256 is
`6bef6938c8fbfd4b520e9b4c1fce43c6385ec4e887ae9c3ed9bdad9cb228e535`; it
has five dispositions, zero open findings, and is chronologically between the
two runs (2026-10-04T23:40:36.929Z).  The retained audit directories contain
the linked wide, compact, and narrow rendered screenshots; the largest is
148800 bytes.

The authenticated targeted result is outside the checkout at
`/home/stager/Work/sta-ger/agents/runtime/verifier-targeted-results/bc39ec62455446dced7658d5/result.json`,
SHA-256 `36fcf35edcc4e84757e83a186fb1849ddd81e1dd244df2b6be99677e18d71cfe`.
It binds the exact required 20-file command to the candidate before and after
execution (both clean), return code 0, no timeout, 20/20 passed suites and
1203/1203 passed tests.  Its stdout and stderr SHA-256 values are respectively
`d100d409e5c6cdef2d66ed5ad85f8f4aa09b4750e3279bccb83df71a3cdc7f53` and
`da94839b727c0f39e766c0cd805c0a3d6b1847c1acafdfe9aa76f843ed8ffe0d`.

## Closeout blocker

No campaign manifest, anchors, or closeout was minted.  That omission is
intentional and reproducible: this clean-room rebaseline necessarily has the
same candidate SHA for initial and retest.  The required validator rejects
that shape before it can validate an aggregate:

```text
scripts/p8-05-product-readiness-campaign.mjs:645
if (initialCandidate.candidateId === finalCandidate.candidateId)
  fail("blind retests must use a new candidate after the initial audit");
```

Therefore this evidence is not a successful campaign receipt.  The campaign
controller/validator must support a same-candidate rebaseline (while retaining
the initial/freeze/retest boundary and its immutable leaf references) before a
truthful manifest, independent anchors, and closeout can be produced.  No
Studio, Chromium, build, package/install command, test, release gate,
publication, or Drive action was run for this report-only recovery.
