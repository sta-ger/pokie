# PC-19 independent cold-start release review

This directory contains the protocol and validator for the final, current-candidate
release review. It intentionally contains no claimed pass: a historical PC-02 through
PC-18 result cannot stand in for this fresh review.

The reviewer creates one new directory below `runs/` outside a POKIE checkout, follows
[REVIEW-PROTOCOL.md](REVIEW-PROTOCOL.md), then validates it without consulting older
campaign records:

```sh
node scripts/pc-19-independent-cold-start-review.mjs \
  --review-dir /absolute/path/to/run \
  --expected-candidate <40-character-candidate-sha> \
  --expected-package-sha256 <retained-package-sha256> \
  --freeze-receipt /verifier-controlled/path/freeze-receipt.json \
  --expected-freeze-receipt-sha256 <receipt-sha256>
```

The validator checks the mechanical release boundary: candidate/package provenance,
timestamped installed-CLI streams, a new Studio profile and browser transcript,
artifact ledger, a verifier-anchored frozen blind finding list, post-freeze comparison,
coverage for all roles and sweeps, and the P0/P1/material-P2 gate. It does not claim to
prove what a human privately read; the clean-room attestation and controlled review
boundary make that limitation explicit.
