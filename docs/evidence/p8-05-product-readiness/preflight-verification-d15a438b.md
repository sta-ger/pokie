# P8-05 retained handoff preflight verification — d15a438b

Independent host-side verification examined the exact reviewed candidate
`d15a438bf427deca9eea8a189400eb4995f69e45`.  The checkout was clean at that
SHA before the public commands and was still clean at the same SHA afterwards.
No test, build, package, official gate, publication, push, or Drive action was
started by this verification.

## Read-only public preflight

The verifier invoked the public read-only command once using an absolute,
runtime-owned configuration and the retained canonical archive:

```text
node scripts/p8-05-release-completion.mjs --preflight --config <absolute positive config>
exit=0
```

It accepted reviewed candidate `d15a438bf427deca9eea8a189400eb4995f69e45`,
audited candidate `207d0d2b4d83b329b60a062bfb4f9818ff1162d1`, and archive
digest `52a9a0ab45101f34bd440be2009721ae0eafbf49ea9b9a48ddf19ad9ae4d1a4b`.
The result authenticated campaign manifest
`b65715af544474200971d44bb0403825d9635bf9fb6af6c3593d1b1eda0a11f1`,
closeout payload digest
`82237e3de5613216fa576b96d27e2f4cfa8f47e5e05cf6bc170783c92ea85a67`, both
trusted anchors, the original executable receipt
`ff8f64cb717158c24f9c7dad56974e55c84045ef77a78cdfcfa1e57a452c0c78`, the
canonical archive executable projection, and Git product/build equivalence.
Its deterministic handoff digest was
`cc98a702af0ab92f30ec9f6d5c41c3e654f5a881fb52c94f57f62df4c878b930`.

The complete bounded runtime receipt is
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P8-05-8e2bcd194fac7a78/preflight-receipt.json`,
SHA-256 `d937b97b47cb77688df96dc162d391a7e80b2002ba9bb5ed218332874d44b80f`.
It holds the two command exit records and their stdout/stderr checksums without
copying raw logs or generated artifacts into this checkout.

## Checkout-rejection and preservation proof

One separate preflight configuration named compatible-but-not-current commit
`b0a9b66c8b1a1f4fa618c96b6f259fd505579094`; it exited `1` at the local
exact-checkout guard:

```text
PC-20 release completion is invalid: before the candidate-only release gate
must run from a clean checkout of the accepted candidate SHA
```

The retained campaign files were SHA-256-identical before and after both
preflights: `PROVENANCE.json`
`85812fe2c28133c9449e90f9c4c69e1b5eab4d9443c1f95489a06b280bf089e4`,
`manifest.json` `b65715af544474200971d44bb0403825d9635bf9fb6af6c3593d1b1eda0a11f1`,
`closeout-payload.json`
`82237e3de5613216fa576b96d27e2f4cfa8f47e5e05cf6bc170783c92ea85a67`,
`closeout.json` `96155d86c20d242787fc9ede7ef01f83ee2ed598fd5f0bc2f74846f04c77d0d2`,
and `frozen-findings.json`
`b4d9235acba363e2873b98f3716b5aab401cc0bb78a539adf1c24bbf0976670a`.
The preflight output directory was not created and no PC-20 release artifact
was written.

## Controller-owned whole-file verification

The controller’s authenticated result at
`/home/stager/Work/sta-ger/agents/runtime/verifier-targeted-results/bc15987d5160022655d06f73/result.json`
records exactly the required twenty whole-file paths, candidate SHA
`d15a438bf427deca9eea8a189400eb4995f69e45`, clean before and after, exit
`0`, and no timeout.  Its complete stdout/stderr log SHA-256 values were
rechecked as respectively
`d100d409e5c6cdef2d66ed5ad85f8f4aa09b4750e3279bccb83df71a3cdc7f53` and
`6aa271ba808f24e164e0643cccfd6465df2d3fccf1243bb926ca76ac797ff4b9`.
The terminal Jest summary is 20 passed suites and 1203 passed tests in five
projects; no targeted test was rerun here.
