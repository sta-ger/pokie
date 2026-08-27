# PC-01 clean-room evidence protocol

This directory is the empty, repeatable evidence harness for Phase 7 product
coherence. It contains neither product results nor a source-derived inventory,
historical evidence, or a scripted success path. A collector creates one new,
append-only `runs/<run-id>/` directory and follows
[COLLECTION-PROTOCOL.md](COLLECTION-PROTOCOL.md). The collector then appends
one record for every observed public surface to
[PUBLIC-SURFACE-CENSUS.md](PUBLIC-SURFACE-CENSUS.md).

The census is a discovery ledger, not an assertion that a surface works. A
surface that is not reached, or that needs product input, remains explicitly
`not-observed` or `input-required` and has an owner; it is never silently
counted as covered.

## Clean-room boundary

The collector may use only:

- a package-manager install command and the installed `pokie` executable;
- CLI help, CLI stdout/stderr, and exit statuses;
- rendered local Studio, browser-visible text, and visible errors;
- files created by a command the collector actually ran; and
- public package metadata and README links reached from the installed package.

The collector must not read repository source, tests, architectural documents,
previous campaign evidence, issue trackers, or a prepared workflow/success
script. This is discovery infrastructure, not a product walkthrough: help and
visible navigation determine the next observable surface.

## Canonical append-only run layout

Use a run id made of a UTC timestamp and installed package version, for example
`20260827T152200Z-pokie-1.3.0`. Create every path below before capture. These
names are canonical in all PC-01 records; do not rename, overwrite, or reuse a
file from another run.

```
runs/<run-id>/
  PROVENANCE.md
  commands.tsv
  bootstrap.stdout.txt
  bootstrap.stderr.txt
  cli/
    version.stdout.txt
    version.stderr.txt
    root-help.stdout.txt
    root-help.stderr.txt
    help-index.tsv
    help/
      <command-id>.stdout.txt
      <command-id>.stderr.txt
    errors/
      unknown-command.stdout.txt
      unknown-command.stderr.txt
  studio/
    launch.stdout.txt
    launch.stderr.txt
    launch-metadata.md
    browser-transcript.md
    screenshots/
      <transition-sequence>-<short-visible-claim>.png
  artifacts/
    ledger.tsv
```

`commands.tsv` is the command record for every terminal invocation, including
bootstrap, version, root help, recursive help, bounded errors, and Studio
launch. `cli/help-index.tsv` maps every recursive-help command to its exact
stream paths. `studio/browser-transcript.md` is the transition record, and
`artifacts/ledger.tsv` is the artifact-provenance record. A screenshot never
substitutes for a transcript entry or ledger row.

No file in a prior run directory may be edited or removed. Supersede a flawed
run with a new run directory and say why in that run's `PROVENANCE.md`.
