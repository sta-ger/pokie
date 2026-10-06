# P8-05 corrected retained-campaign closeout — b0a9b66c

On 2026-10-06, independent host verification used source commit
`b0a9b66c8b1a1f4fa618c96b6f259fd505579094` against the retained authenticated
campaign at:

```text
/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P8-05-5a04b43a03bb86be/campaign-207d0d2b4d83b329-recovery-1
```

The corrected public command appended the sole permitted `closeout.json`:

```text
node scripts/p8-05-product-readiness-controller.mjs closeout --config <campaign>/phase-config-closeout.json
closeout.json sha256 96155d86c20d242787fc9ede7ef01f83ee2ed598fd5f0bc2f74846f04c77d0d2
```

The independently invoked public validator then completed successfully:

```text
node scripts/p8-05-product-readiness-campaign.mjs \\
  --campaign-dir <campaign> \\
  --expected-candidate 207d0d2b4d83b329b60a062bfb4f9818ff1162d1 \\
  --expected-package-sha256 52a9a0ab45101f34bd440be2009721ae0eafbf49ea9b9a48ddf19ad9ae4d1a4b \\
  --freeze-anchor-sha256 4e1890458b71dcba6e2a3442e95e6f439b16ad38c8aa3d7e221baa2afb43b520 \\
  --closeout-anchor-sha256 4bfea2eef1cc8e992dba0edc9668b41185c322b6fcdcc4625ea6af8610b782ed
P805_PRODUCT_READINESS_PASS candidate=207d0d2b4d83b329b60a062bfb4f9818ff1162d1 personas=5
```

The original exercised product candidate remains
`207d0d2b4d83b329b60a062bfb4f9818ff1162d1`; it is not relabelled as the
reviewed controller commit.  Its package archive digest remains
`52a9a0ab45101f34bd440be2009721ae0eafbf49ea9b9a48ddf19ad9ae4d1a4b`, and
the separately issued candidate executable receipt remains
`ff8f64cb717158c24f9c7dad56974e55c84045ef77a78cdfcfa1e57a452c0c78`.
Those candidate/package values are the exact pair authenticated by the
campaign validator and required by the P8-05 release interlock, so they form
the truthful release-consumer handoff.  The immutable manifest remains
`b65715af544474200971d44bb0403825d9635bf9fb6af6c3593d1b1eda0a11f1`; the
pre-existing closeout payload remains
`82237e3de5613216fa576b96d27e2f4cfa8f47e5e05cf6bc170783c92ea85a67`.
All pre-closeout campaign-record digests match the values recorded before the
append.

No P8-05 release gate, PC-20 release gate, package/build action, integration
push, publication, or Drive action was invoked.  The release consumer remains
pending explicit approval; this record certifies only its accepted candidate
and package precondition.
