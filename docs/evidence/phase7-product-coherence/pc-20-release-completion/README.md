# PC-20 release-completion protocol

This directory deliberately contains no completion claim.  PC-20 can complete
only when the authorized release controller writes its candidate-specific,
append-only `pc-20-<sha>-release-gate.json` and `pc-20-<sha>-completion.json`
records here.

The controller requires all of the following before it creates the completion
record:

- a verifier-supplied PC-19 candidate SHA, package archive digest, and trusted
  freeze receipt outside this mutable evidence tree;
- one successful `npm run check:release` process group on a clean immutable
  candidate checkout at that exact SHA, before `develop` is advanced. The gate
  retains the exact `.tgz`, its SHA-256, captured output, and the complete
  real npm-pack/install receipt for installed CLI, Studio/API assets, direct
  library-worker smoke results, and cleanup. Its authenticated ownership
  preload records gate-created child processes and workers at acquisition, so
  detached descendants are drained and non-PID provider/container handles
  require an explicit release record before the post-drain audit can pass;
- an externally anchored lifecycle receipt proving the same SHA was merged,
  pushed, published with the same package digest, and uploaded to/read back
  from Drive.  That receipt must refer to the retained gate-record digest.

The authorized operator first invokes the controller to create the gate record;
it stops before completion until the external lifecycle receipt exists.  After
the authorized merge/push/publication/Drive round trip records that gate digest,
a second invocation reuses the immutable green gate rather than running the
composite a second time and writes the completion record.

The workflow runs only on the protected `pokie-release-runner` label. It checks
out an immutable candidate SHA, validates release authority, runs `--gate-only`,
then uses `scripts/pc-20-authorized-release-runner.mjs` to fast-forward clean
protected `develop` to that already-gated candidate. It pushes, resolves
`origin/develop` again immediately before archive publication, and rejects any
remote drift before the registry digest check and authenticated Drive
upload/read-back. The protected lifecycle is serialized; missing authority or
any ref/package/archive/receipt drift leaves this directory without a
completion record.

No repository-local assertion, checklist, or older campaign record can stand
in for those credentials and receipts.  The controller uses exclusive file
creation and never edits prior campaign evidence.
