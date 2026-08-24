# P7-01 executable CLI inventory

This directory freezes Phase 7's public CLI baseline. The source of truth is not
this prose or a TypeScript command registry: `check-cli-inventory.mjs` invokes a
freshly built or unpacked `dist/cli/pokie.js`, recursively asks every public help
path, and fails if the resulting command, nested verb, option, or nonstandard
alias lacks an explicit owner in `coverage-map.json`.

The initial executable inventory is 20 root commands and seven nested verbs.
POKIE Studio is intentionally absent: it is the implicit `pokie` entry, not a
`pokie studio` public alias. `-h` is the one uniformly owned built-in alias.
The recorded version/help finding is that `--help` is public whereas bare
`pokie` starts Studio. The collector reads every configured public document —
the repository README and maintained top-level `docs/*.md` pages, with
immutable phase/evidence archives explicitly excluded in the coverage map — as
ordinary text, not author-added markers. Its initial owned vocabulary is:
targets: `tsPackage`, `outcomeLibrary`, `stakeAdapter`, `parWorkbook`, and
`wasm`; source types: `blueprint`, `tsPackage`, `outcomeLibrary`,
`stakeAdapter`, `parWorkbook`, and `wasm`; output formats: `json`, `markdown`,
`html`, `xlsx`, and `jsonl`; and modes: `base` and `all`.

## Collector protocol

For a source checkout, run `npm run check:cli-inventory`; it builds the CLI
immediately before collecting. For an unpacked package tarball, run the
collector directly against that package's executable:

```sh
node scripts/check-cli-inventory.mjs \
  --cli /absolute/path/to/dist/cli/pokie.js \
  --evidence-dir docs/evidence/p7-01-cli-inventory/current-run
```

The collector creates a new OS temporary directory for each of its two help
walks, records every command and exit code, stores both independently-derived
inventory JSON documents, verifies their hashes match, and writes a bounded
text transcript. `inventory.json`, `inventory-rerun.json`, and
`collector-transcript.txt` are generated evidence only; do not edit them.

For every later public-surface change, update the coverage map and its
configured public documentation in the same change. The check rejects an
unowned command, subcommand, option, root or command short alias, target,
project/source type, output format, mode, or ordinary documentation claim.

## Journey protocol

Every Phase 7 end-to-end journey is driven through the clean-room wrapper:

```sh
node scripts/run-phase7-journey.mjs \
  --script /absolute/path/to/journey.mjs \
  --evidence-dir docs/evidence/p7-01-cli-inventory/current-journey \
  --input examples/blueprints/sample-slot.blueprint.json \
  --expect package.json
```

The journey script receives `P7_INPUT_DIR` (copied input provenance),
`P7_JOURNEY_DIR` (where public CLI output is written), and `P7_PUBLIC_CLI`, an
executable wrapper around the supplied built `pokie` CLI. It must invoke that
wrapper for every public command; it cannot create command records itself. The
wrapper records each command and exit code, and hashes only expected artifacts
whose bytes changed during that CLI invocation. Every `--expect` artifact must
therefore have a wrapper-observed SHA-256 record — a direct write before or
after a command, or a forged JSONL record, is rejected. The wrapper invokes the
driver twice in distinct new temporary directories and retains the public
commands, exit codes, provenance, checks, stdout/stderr, and an independent
rerun record in `journey-transcript.txt`.
