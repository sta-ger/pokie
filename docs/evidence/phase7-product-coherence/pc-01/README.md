# PC-01 clean-room evidence protocol

This directory is the empty, repeatable evidence harness for Phase 7 product
coherence.  It deliberately contains no product result, source-derived
inventory, historical evidence, or scripted success path.  A verifier fills a
new `runs/<run-id>/` directory by following the public-only protocol in
[COLLECTION-PROTOCOL.md](COLLECTION-PROTOCOL.md).

The baseline census in [PUBLIC-SURFACE-CENSUS.md](PUBLIC-SURFACE-CENSUS.md)
defines what each later evidence run must enumerate and who owns its follow-up.
It is a coverage ledger, not a claim that a surface works.

## Clean-room boundary

The collector may use only:

- the package-manager install command and the installed `pokie` executable;
- CLI help, CLI stdout/stderr and exit statuses;
- the rendered local Studio, its browser-visible text, and its visible errors;
- files created by a command the collector actually ran; and
- public package metadata and README links reached from the installed package.

The collector must not read repository source, tests, architectural documents,
previous campaign evidence, issue trackers, or a prepared workflow/success
script.  Do not turn this protocol into a product walkthrough: it starts from
help and visible navigation, records what is encountered, and stops at the
defined boundary.

## Run layout

Create only the following paths beneath a new run directory.  The run id is a
UTC timestamp plus the installed package version, for example
`20260827T152200Z-pokie-1.3.0`.

```
runs/<run-id>/
  PROVENANCE.md
  commands.tsv
  cli/
    root-help.txt
    <verb>-help.txt
    <verb>-help.stderr.txt
    errors/
  studio/
    launch.txt
    browser-transcript.md
    screenshots/
  artifacts/
    ledger.tsv
```

`commands.tsv`, `browser-transcript.md`, and `artifacts/ledger.tsv` are the
authoritative machine/human boundary.  A screenshot never substitutes for a
transcript entry or an artifact-ledger row.

No files in prior run directories may be edited or removed.  A flawed run is
superseded by a new run directory with a note in its provenance.

