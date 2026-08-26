# P7-19 clean-room Valera CLI rerun

Independent host-side verification at candidate `3e9c3339c0d5afd4fb87423fe1f89eef5b5b14c1`.

The workflow used a newly packed `pokie@1.3.0` tarball, installed into a fresh
temporary prefix.  After installation, all product-facing guidance came from
that installed package's `README.md` and `docs/cli.md`; all workflow commands
used its installed `pokie` binary.  The temporary Blueprint, Outcome Library,
Stake export, reports, diff, package tarball, installer tree, and raw command
logs were intentionally discarded.  No artifact was hand edited.

`TRANSCRIPT.md` records the commands, results, public guidance, and structural
readback. `CHECKSUMS.sha256` records the generated-file hashes observed before
cleanup; it is an audit record, not a retained artifact payload.
