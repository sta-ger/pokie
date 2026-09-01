# Material findings and owning regressions

| Finding | Shared owner fixed | Regression |
| --- | --- | --- |
| The implicit Studio entry rendered `Usage: studio ...`, exposing an unsupported public namespace even though users launch it as `pokie [projectRoot]`. | `StudioCommand` Commander display tree; inventory baseline | `StudioCommand.test.ts`, `PublicCliSweep.integration.test.ts`, and packed-binary `npmPackSmoke.test.ts` assert `Usage: pokie ...` and reject `Usage: studio`. |
| The inventory and installed help disagreed about the order of `import`/`init` and `sample`/`serve`. | `registerCliCommands.ts` command registration and `coverage-map.json` inventory | `PublicCliSweep.integration.test.ts`, `residualPublicSurface.contract.test.ts`, and `check-cli-inventory.test.mjs` compare the complete public tree with the canonical inventory. |

No artifact writer, resolver, runtime materializer, checkpoint, or Studio lifecycle implementation
changed for these findings.  Their existing owning whole-file lifecycle regressions remain part of the
current-run closure because their outputs are consumed by the same public contract.
