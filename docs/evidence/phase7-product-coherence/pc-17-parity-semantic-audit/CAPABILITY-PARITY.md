# Capability parity ledger

The PC-05 matrix remains the authoritative row inventory. This ledger records
the equivalent result and boundary for each group of rows, including deliberate
surface differences. There is no unexplained CLI/Studio semantic mismatch.

| PC-05 user goal group | CLI result | Studio result | Shared boundary / intentional difference |
| --- | --- | --- | --- |
| Design, scaffold, edit, open and PAR exchange | A validated Blueprint, prepared package, recognized target, or workbook conversion | Guided design/project screens and the Design PAR panel | `GameBlueprint`, `ProjectTargetResolver`, `ParSheetExporter` and `ParSheetImporter`; Studio owns guided selection, not a second file contract. |
| Build/package, Outcome Library, Stake and artifact exports | A planner-validated artifact at a safe destination | Build/Export job with the same artifact result and destination safety | `BUILD_PRODUCT_MATRIX`, `ArtifactConversionPlanner`, `ArtifactBuilderRegistry` and `ProjectTargetResolver`. |
| Raw outcome generation and canonical bundle materialization | `generate --out` writes raw weighted-outcome JSON; a compatible descriptor later materializes a bundle | Generate produces and validates the canonical bundle as one guided workflow | This is intentionally not literal file-shape parity. Both preserve provenance/validation; raw JSON is never labelled runnable. |
| Inspect, sample, validate, report and diff | Target-specific read-only result or saved result record | Overview/target validation and result views | `ProjectCapabilities` and outcome-source contracts; a Stake export stays analyzable, not drawable. |
| Play, simulate and replay | Runtime execution or native pre-generated selection, with the documented replay guarantee | The same resolver/services behind Play, Simulation and Replay jobs | `createMaterializingRuntimePackageResolver`, `simulateOutcomeSourceProject` and `replayOutcomeSourceProject`; package execution is distinct from native selection. |
| Certification, fairness, deployment, reels and WASM | Evidence/proof/export result, reel update, or inspection result | Dedicated guided workflow or Build/Export card | Certification verification deliberately hands off to its one public CLI verifier; WASM remains inspection-only. |

## Route and alias result

`registerCliCommands()` remains the public grammar authority. Its public
routes (`build`, `certification`, `client`, `create`, `dev`, `diff`, `edit`,
`export`, `fairness`, `generate`, `import`, `init`, `inspect`, `par`, `reel`,
`replay`, `report`, `sample`, `serve`, `sim`, and `validate`) retain the
PC-05 matrix result. Legacy implementation namespaces and `__studio` remain
unadvertised delegation details. Studio hash-route migrations recover on the
retained user-goal tab instead of restoring duplicate capability pages.

## Conversion lifecycle closure

The conversion contract is systemic, rather than command-specific: planner validation happens before writing, conflicts preserve caller-owned output,
cancellation removes partial output, and the next resolver readback sees the
same artifact type from CLI or Studio. Focused cross-surface tests exercise
every supported `BUILD_PRODUCT_MATRIX` cell, conflict and cancellation path.
