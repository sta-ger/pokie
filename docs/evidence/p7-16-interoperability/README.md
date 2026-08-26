# P7-16 installed public-CLI interoperability rerun

Candidate `6d42c3bee6ee71dccfea0bcb868b701c468818d3` was built, packed, and installed into a fresh `/tmp` consumer. The retained [machine-generated transcript](transcript.txt) records the exact public commands, exit codes, installed executable, package checksum, input/output checksums, and no retained generated artifacts.

Results:

- Direct `par export`/`par import` and generic `export --to workbook`/uppercase-`.XLSX` `import` both succeeded. Physical JSON readback was deep-equal to the documented canonical Blueprint and the workbook ZIP test passed.
- A POKIE-produced Stake export reconstructed through direct and generic import. Republishing the direct reconstruction reproduced the `index.json`, CSV, and compressed-book SHA-256 values exactly.
- An independently supplied manifest-less foreign Stake directory succeeded with `stakeengine analyze` and `stakeengine diff`; generic reconstruction rejected it with the actionable filename and missing-manifest diagnostics. A truncated workbook similarly rejected cleanly without an output file.
- Finding: the documented public `pokie report <stakeDir> --format json` workflow succeeds for the POKIE-produced Stake directory but fails for the compatible manifest-less foreign directory with `Could not read simulation report ... EISDIR`. This contradicts `docs/cli.md`'s documented any-Stake-directory/report behavior and prevents the required foreign `analyze/report/diff` interoperability workflow.

Only this README and the 23,496-byte generated transcript are retained.
