# P10-03 candidate-reader targeted verification

Date: 2026-10-11. This bounded record replaces superseded targeted-test
metadata and preserves the controller-owned result for the reviewed product
candidate `3d769d415039c8f2f3a0f15d9c5ac26747213eff`.

## Candidate and command

Before the controller command, the machine receipt recorded that exact `HEAD`
and an empty dirty-state value. It recorded the same exact `HEAD` and empty
dirty-state value afterwards; this verifier independently confirmed the clean
candidate head before adding this evidence-only record.

The controller ran exactly one serial whole-file invocation, without a test
name filter:

```sh
npm run test:targeted -- \
  tests/cli/studio-client/src/productionStudioCandidate.test.tsx \
  tests/scripts/p9-11-corrective-closeout.test.mjs \
  tests/scripts/p9-11-produce-candidate.test.mjs
```

Machine-owned receipt:
`/home/stager/Work/sta-ger/agents/runtime/verifier-targeted-results/960a150583973721760ba490/result.json`
(SHA-256 `e6da15e3191ec1872047dd96f7074478983dabd5d8cf9fa9e57190252eb24bbc`).
The retained controller runtime stdout and stderr siblings have SHA-256
`7c8313860c393e3ca17bb7201da15c6518f8f6497450adcb147a90fcc80b6bdd` and
`b358307209541ba4606f8fd5740eb2f42ec0fda2b68c8b3c9ea6560d89ca5b0f`.
They are intentionally referenced rather than copied into this repository.

## Result and contract coverage

The receipt is `completed`, return code 0, not timed out, and records 33.472 s
wall/monotonic duration. Its terminal Jest summary is **3 passed suites / 87
passed tests / 0 snapshots**, in 31.793 s, across precisely the three paths
above. The terminal per-suite lines are `p9-11-corrective-closeout`,
`p9-11-produce-candidate`, and `productionStudioCandidate`.

This whole-file result exercises the shared reader's authenticated installed
candidate selection and rejection of checkout-dist fallback, corrupted
handoffs, stale installed assets, unexpected installed assets, and
product-changing descendants. The producer suite covers the normal
build/pack/install aggregate through its pinned archive digest and verifies
that both build and install receipts require drained resources and closed
stdio; it also rejects unsafe delivery on undrained cleanup, open stdio,
mutation, or stale installation. Separately, the controller receipt reports no
orphan process group reaped, zero detached process groups reaped, and no Pokie
containers before or after the command. This is contract-test evidence only:
it neither builds, packs, installs, nor collects a new workflow.

## Preserved prior evidence

The independent installed-math result remains
[P10-03 independent installed rerun](p10-03-independent-installed-rerun.md),
bound to its original `a9a0ead57276d8c7ebb06b7c0369b9f66000068f` identity.
It and the completed-step history are preserved without relabelling or
recollection. No browser, release, or public workflow claim is made by this
targeted Node/Jest receipt.
