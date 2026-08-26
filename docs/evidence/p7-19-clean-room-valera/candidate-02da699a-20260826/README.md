# P7-19 clean-room Valera rerun — candidate `02da699a`

Status: finding.  This is a fresh temporary-directory verification of the packed
`pokie@1.3.0` package built from candidate
`02da699a5f6c62699765a89611a2b06783f63813`.  It did not use the checkout's
CLI, source documentation, or pre-existing audit artifacts after packing.

The public package installed successfully and its installed README's ten
`docs/` Markdown links all resolved.  Its `docs/` directory contained 36
Markdown files, including `docs/certification-evidence-bundle.md`; public
`pokie certification --help` also described the documented build/verify
workflow.

The documented deterministic `create --random` command created and validated
the Valera Blueprint.  Its public direct export commands then each terminated
with Node's default-heap out-of-memory fatal error before writing an outcome
library or Stake adapter.  Therefore readable Stake-export readback and
`pokie validate` of that export were not reachable.

See [TRANSCRIPT.md](TRANSCRIPT.md) for the bounded commands, exit codes,
artifact readback, provenance, and failure excerpts.
