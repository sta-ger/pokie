# P8-05 real campaign closeout verification — 6ae640f1

Independent host-side verification ran the repaired public controller from
reviewed commit `6ae640f1dd946b65b31fec3780998c2f249942fe` against the
retained checks-only campaign:

```text
/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P8-05-5a04b43a03bb86be/campaign-207d0d2b4d83b329-recovery-1
```

The campaign's immutable product identity remains
`207d0d2b4d83b329b60a062bfb4f9818ff1162d1`, with package digest
`52a9a0ab45101f34bd440be2009721ae0eafbf49ea9b9a48ddf19ad9ae4d1a4b`.
It was not relabelled as the review commit.  The review commit changes only
the P8-05 closeout implementation and tests.

## Public-command transcript

`node scripts/p8-05-product-readiness-controller.mjs prepare-closeout --config <retained phase config>` passed and appended these campaign records:

```text
manifest.json sha256 b65715af544474200971d44bb0403825d9635bf9fb6af6c3593d1b1eda0a11f1
closeout-payload.json sha256 82237e3de5613216fa576b96d27e2f4cfa8f47e5e05cf6bc170783c92ea85a67
P805_PRODUCT_READINESS_PREPARE_CLOSEOUT_PASS
```

The independent closeout anchor is outside the campaign, at
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P8-05-5a04b43a03bb86be/closeout-anchor-207d0d2b4d83b329b60a062bfb4f9818ff1162d1-recovery-1.json`,
with sha256 `4bfea2eef1cc8e992dba0edc9668b41185c322b6fcdcc4625ea6af8610b782ed`.
It binds the manifest and payload digests above and is later than the payload's
`closedAt` timestamp.

`node scripts/p8-05-product-readiness-controller.mjs closeout --config <retained closeout config>` failed before it could append `closeout.json`:

```text
P8-05 product-readiness evidence is invalid: finding freeze lacks the verifier-supplied immutable anchor
```

The retained `frozen-findings.json` does contain the external freeze-anchor
path and digest `4e1890458b71dcba6e2a3442e95e6f439b16ad38c8aa3d7e221baa2afb43b520`.
The referenced anchor contains `anchoredAt`; the immutable historical
`externalAnchor` reference does not.  The current validator additionally
requires `frozen.externalAnchor.anchoredAt`, so it rejects this otherwise
digest-authenticated record.  It cannot be repaired by rewriting the frozen
record without breaking the campaign's immutable evidence contract.

The public campaign validator was also invoked with the original candidate,
package, freeze-anchor and closeout-anchor digests.  As expected after the
rejected closeout, it reported `missing required campaign record closeout.json`.
No Studio/browser, build, package, release, publication, or Drive action ran.

Official release actions remain pending approval.
