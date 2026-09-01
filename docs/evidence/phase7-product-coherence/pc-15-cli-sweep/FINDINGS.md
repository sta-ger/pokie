# Material findings and owning regressions

| Finding | Shared owner fixed | Regression |
| --- | --- | --- |
| The implicit Studio entry rendered `Usage: studio ...`, exposing an unsupported public namespace even though users launch it as `pokie [projectRoot]`. | `StudioCommand` Commander display tree; inventory baseline | `StudioCommand.test.ts`, `PublicCliSweep.integration.test.ts`, and packed-binary `npmPackSmoke.test.ts` assert `Usage: pokie ...` and reject `Usage: studio`. |
| The inventory listed `import` before `init` and `sample` before `serve`, while executable registration/help used the opposite order. | `coverage-map.json` inventory | `PublicCliSweep.integration.test.ts` compares the complete registered order with the inventory; `check-cli-inventory.test.mjs` validates the executable inventory mechanism. |

No artifact writer, resolver, runtime materializer, checkpoint, or Studio lifecycle implementation
changed for these findings.  Their existing owning whole-file lifecycle regressions remain part of the
current-run closure because their outputs are consumed by the same public contract.
