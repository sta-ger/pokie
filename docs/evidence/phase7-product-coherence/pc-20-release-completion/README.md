# PC-20 release-completion protocol

This directory deliberately contains no completion claim.  PC-20 can complete
only when the authorized release controller writes its candidate-specific,
append-only `pc-20-<sha>-release-gate.json` and `pc-20-<sha>-completion.json`
records here.

The controller requires all of the following before it creates the completion
record:

- a verifier-supplied PC-19 candidate SHA, package archive digest, and trusted
  freeze receipt outside this mutable evidence tree;
- one successful `npm run check:release` process group on clean `develop` at
  that exact SHA;
- an externally anchored lifecycle receipt proving the same SHA was merged,
  pushed, published with the same package digest, and uploaded to/read back
  from Drive.  That receipt must refer to the retained gate-record digest.

The authorized operator first invokes the controller to create the gate record;
it stops before completion until the external lifecycle receipt exists.  After
the authorized merge/push/publication/Drive round trip records that gate digest,
a second invocation reuses the immutable green gate rather than running the
composite a second time and writes the completion record.

No repository-local assertion, checklist, or older campaign record can stand
in for those credentials and receipts.  The controller uses exclusive file
creation and never edits prior campaign evidence.
