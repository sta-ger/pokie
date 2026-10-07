# P8-05 release-consumer verification — 220304f1

Independent host-side verification on 2026-10-06 examined the reviewed
checkout `220304f14d6f7525cfaba072b35521c33e551554`.  It was clean before
and after this probe.  No build, package, official release gate, publication,
push, or Drive action ran.

## Immutable campaign identity

The retained campaign at
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P8-05-5a04b43a03bb86be/campaign-207d0d2b4d83b329-recovery-1`
continues to identify its initial and retest candidate as
`207d0d2b4d83b329b60a062bfb4f9818ff1162d1`, with archive digest
`52a9a0ab45101f34bd440be2009721ae0eafbf49ea9b9a48ddf19ad9ae4d1a4b`.
The independently invoked public campaign validator accepted that exact pair:

```text
node scripts/p8-05-product-readiness-campaign.mjs --campaign-dir <campaign> --expected-candidate 207d0d2b4d83b329b60a062bfb4f9818ff1162d1 --expected-package-sha256 52a9a0ab45101f34bd440be2009721ae0eafbf49ea9b9a48ddf19ad9ae4d1a4b --freeze-anchor-sha256 4e1890458b71dcba6e2a3442e95e6f439b16ad38c8aa3d7e221baa2afb43b520 --closeout-anchor-sha256 4bfea2eef1cc8e992dba0edc9668b41185c322b6fcdcc4625ea6af8610b782ed
P805_PRODUCT_READINESS_PASS candidate=207d0d2b4d83b329b60a062bfb4f9818ff1162d1 personas=5
exit=0
```

The original bytes remain unchanged: `PROVENANCE.json`
`85812fe2c28133c9449e90f9c4c69e1b5eab4d9443c1f95489a06b280bf089e4`,
`manifest.json` `b65715af544474200971d44bb0403825d9635bf9fb6af6c3593d1b1eda0a11f1`,
`closeout-payload.json` `82237e3de5613216fa576b96d27e2f4cfa8f47e5e05cf6bc170783c92ea85a67`,
and `closeout.json` `96155d86c20d242787fc9ede7ef01f83ee2ed598fd5f0bc2f74846f04c77d0d2`.

## Actual consumer result

The public pre-gate consumer was invoked once with `--gate-only`; its
ephemeral configuration named reviewed candidate
`220304f14d6f7525cfaba072b35521c33e551554`, the retained campaign and its
trusted anchors.  It performs campaign authentication before PC-20's release
gate, and exited before any gate artifact or probe-output directory existed:

```text
node scripts/p8-05-release-completion.mjs --gate-only --config <ephemeral-220304f1-config>
P8-05 product-readiness evidence is invalid: retest audit mathematician is not bound to the exact candidate and package digest
exit=1
```

Thus the release consumer cannot accept the reviewed checkout from this
retained campaign: the current checkout is exactly `220304f1…`, while the
consumer's immutable retest records require `207d0d2b…`.  The PC-20 exact
checkout precondition cannot cure that mismatch because the P8-05 consumer
rejects the candidate binding first.  This is a release-consumer
incompatibility, not a relabelling of the original observations.
