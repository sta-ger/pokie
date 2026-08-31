# PC-14 independent host verification — finding

Candidate: `fb5dde46957ceb50143703dd0d465c2cb27b65ec`.

On 2026-08-31, independent inspection derived the non-internal PC-05 matrix
from `artifact-registry.json`: **315** unique
`artifact_kind/registry_operation/owner` tuples.  The committed PC-14 merger
ledger contained **7** exact owner-operation tuples: **308 missing**, **0
extra**.

The three retained systemic audits each have an empty
`executed_operation_tuples` inventory despite retaining operation/lifecycle
rows (and the conversion audit retains 30 planner cells):

| audit | executed tuples | operation rows | lifecycle outcomes | planner cells |
| --- | ---: | ---: | ---: | ---: |
| shared conversion diagnostic parity | 0 | 40 | 4 | 30 |
| provenance and freshness binding | 0 | 22 | 18 | 0 |
| durable publication ownership | 0 | 8 | 16 | 0 |

The mandated 17-file targeted command was launched once, serialized with
`npm run test:targeted -- <all required_test_files>`.  Its terminal process
completed; this finding is based on the committed inputs above, which are
independent of test-output capture.

Input checksums:

```
bd59886d1c1168d2529d51d6b7843a7efe2af51fff0d82b31c2b4e1fc17954a0  artifact-registry.json
f31a610f4cd4b00ade151c7832c1ceebcef86b7bcd0778e52b19a4e83a0a0a92  interoperability-result.json
```

Sources: `docs/evidence/phase7-product-coherence/pc-05-product-model/artifact-registry.json` and `docs/evidence/phase7-product-coherence/pc-14-artifact-torture/interoperability-result.json`.
