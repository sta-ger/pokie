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
`pokie` starts Studio; documentation claims must remain tagged and owned.

<!-- pokie-cli-capability: finding=version-help -->
<!-- pokie-cli-capability: finding=implicit-studio -->
<!-- pokie-cli-capability: finding=documentation-claims -->
<!-- pokie-cli-capability: target=tsPackage -->
<!-- pokie-cli-capability: target=outcomeLibrary -->
<!-- pokie-cli-capability: target=stakeAdapter -->
<!-- pokie-cli-capability: target=parWorkbook -->
<!-- pokie-cli-capability: target=wasm -->
<!-- pokie-cli-capability: source-type=blueprint -->
<!-- pokie-cli-capability: source-type=tsPackage -->
<!-- pokie-cli-capability: source-type=outcomeLibrary -->
<!-- pokie-cli-capability: source-type=stakeAdapter -->
<!-- pokie-cli-capability: source-type=parWorkbook -->
<!-- pokie-cli-capability: source-type=wasm -->
<!-- pokie-cli-capability: output-format=json -->
<!-- pokie-cli-capability: output-format=markdown -->
<!-- pokie-cli-capability: output-format=html -->
<!-- pokie-cli-capability: output-format=xlsx -->
<!-- pokie-cli-capability: output-format=jsonl -->
<!-- pokie-cli-capability: mode=base -->
<!-- pokie-cli-capability: mode=all -->

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

For every later public-surface change, update the coverage map and add the
appropriate `pokie-cli-capability` marker to the public docs in the same
change. The check rejects an unowned command, subcommand, option, short alias,
target, project/source type, output format, mode, or tagged documentation
claim.

## Journey protocol

Every Phase 7 end-to-end journey is driven through the clean-room wrapper:

```sh
node scripts/run-phase7-journey.mjs \
  --script /absolute/path/to/journey.mjs \
  --evidence-dir docs/evidence/p7-01-cli-inventory/current-journey \
  --input examples/blueprints/sample-slot.blueprint.json \
  --expect package.json
```

The journey script receives only `P7_INPUT_DIR` (copied input provenance) and
`P7_JOURNEY_DIR` (where it may create artifacts). The wrapper invokes it twice
in distinct new temporary directories, checks every named artifact, records
commands, exit codes, provenance, SHA-256 artifact checks, stdout/stderr, and
an independent rerun record in `journey-transcript.txt`. Evidence is accepted
only when produced by this wrapper; no hand-edited internal artifact is a
workflow result.
