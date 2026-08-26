# Bounded transcript — P7-19 repaired direct exports

Candidate: `c7daa219ee47ee0cfb0015ffba1a73eb90e01264`
Date: 2026-08-26 UTC
Context: newly created `/tmp/p7-19-pack.OLJdmx`. The candidate checkout was used only to
run `npm pack`; every `pokie` command below was the installed executable at
`consumer/node_modules/pokie/dist/cli/pokie.js`. After install, documentation read was
limited to the packaged `README.md` and `docs/cli.md`.

## Pack and install provenance

| Check or command | Exit | Result |
| --- | ---: | --- |
| `git rev-parse HEAD` before pack | 0 | `c7daa219ee47ee0cfb0015ffba1a73eb90e01264` |
| `npm pack --json --pack-destination <fresh>/packed` | 0 | Packed `pokie@1.3.0`; retained tarball checksum below. |
| `npm init -y && npm install --ignore-scripts <fresh>/packed/pokie-1.3.0.tgz` | 0 | Fresh consumer installation (99 packages). |
| `<installed-pokie> --version` | 0 | `1.3.0`. |
| Packaged-document check | 0 | `README.md` and `docs/cli.md` existed in the installed package. |
| Node environment | 0 | Node `v24.18.0`; `NODE_OPTIONS` was unset. No increased heap setting was supplied to either export. |

## Deterministic Blueprint and direct public exports

The installed CLI created the input; it was not copied from the checkout or edited afterwards.

| Installed-CLI command | Exit | Readback / result |
| --- | ---: | --- |
| `pokie create Valera --random --seed 190719 --preset default --out journey/valera.blueprint.json` | 0 | Created reproducible `Valera`; CLI reported generator `1.1.0` and strategy `default-line-pay`. The generated Blueprint has six deterministic generated strips of length 21 (85,766,121 raw stop combinations). |
| `pokie validate journey/valera.blueprint.json --format json` | 0 | `kind: blueprint`, `valid: true`, with no errors or warnings. |
| `pokie export journey/valera.blueprint.json --to outcomes --out journey/valera-outcomes` | 0 | Direct public Outcome export completed: `Artifact "outcomes" exported …`. |
| `pokie export journey/valera.blueprint.json --to adapter --out journey/valera-stake` | 0 | Direct public Stake-adapter export completed: `Artifact "adapter" exported …`. |

## Structural readback and validation

| Installed-CLI command/check | Exit | Result |
| --- | ---: | --- |
| `pokie inspect journey/valera-outcomes` | 0 | Identified the directory as an **Outcome Library**, but recommended `pokie outcomesource inspect …` for exact statistics. |
| `pokie validate journey/valera-outcomes --deep --format json` | 0 | `kind: outcome-library`, `deep: true`, `valid: true`, and `issues: []`. Files read back: `manifest.json`, `index_base.json`, `outcomes_base.jsonl`. |
| `pokie inspect journey/valera-stake` | 0 | Identified the directory as a **Stake Engine export**, but likewise recommended `pokie outcomesource inspect …`. |
| `pokie validate journey/valera-stake --format json` | 0 | `kind: stake-engine`, `valid: true`. Files read back: `pokie-manifest.json`, `index.json`, `lookup_base.csv`, `books_base.jsonl.zst`. |

The installed root help lists no `outcomesource` command. Following the exact recommendation
from a second fresh installation of the same packed tarball with `pokie outcomesource inspect
<outcome-library>` exited 1: `Unknown command "outcomesource". Run \`pokie --help\` to list
commands.` This is a public discoverability defect; it did not prevent the direct exports or
their validation because `inspect` and `validate` themselves are supported public commands.

The Stake validation emitted one documented `info` warning,
`stakeengine-import-library-hash-differs-from-manifest`: its message explains that a
reconstructed library cannot recover `roundId`, the real win breakdown, or
`provenance.pokieVersion` from the Stake export. It did not affect validity or either direct
export exit code.

No checkout source, source-module invocation, prior artifact, hidden state, or hand-edited
generated artifact was an input to the two export journeys. The fresh package, consumer
installation, Blueprint, exports, and transient command output were removed after checksum
recording; no generated artifact is retained in this repository.
