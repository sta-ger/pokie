# Capability parity ledger

This is the row-level PC-17 disposition of the authoritative [PC-05 matrix](../pc-05-product-model/CAPABILITY-MATRIX.md).
`Same contract` means the surfaces call the named product boundary; `intentional
absence` means the other surface gives the stated next action rather than
inventing a duplicate workflow. No cache, registry, checkpoint, job id, Blob,
or intermediate filename is a user prerequisite.

| PC-05 operation | CLI result | Studio result or intentional absence | Shared contract / boundary | Prerequisite or diagnostic | Next user action |
| --- | --- | --- | --- | --- | --- |
| `Create an editable game design` | `create` writes a validated Blueprint | Home Design creates the same editable design | `GameBlueprint` | Invalid fields and occupied paths are actionable | Correct fields or choose a safe path |
| `Scaffold a ready-to-run project` | `init <directory>` prepares a package | Design/Build creates the same project goal | `GamePackagePreparer` | Empty safe destination and dependency lifecycle required | Fix the named phase and retry `init` |
| `Resume a failed prepared-package lifecycle` | `init` resumes its owned retry marker | Intentional absence: no Studio retry-marker control | `GamePackagePreparer` only | Marker is preparer-owned, never a project input | Fix the phase and rerun `init` |
| `Edit a design` | `edit` validates then saves Blueprint JSON | Design editor validates before Save | `GameBlueprint` | Editing invalidates dependent results | Save a valid design, then rebuild |
| `Recognize/open a project` | `inspect` and path-taking commands classify it | Projects register/open classifies it | `ProjectTargetResolver` | Type-specific diagnostic names the recognized type | Open the listed supported workflow |
| `Exchange a PAR workbook` | `par export`, `par import`, `export --to workbook` | Design Game PAR panel | `ParSheetExporter` / `ParSheetImporter` | Workbook is exchange-only | Import before run/build |
| `Attach Studio symbol artwork` | Intentional absence: caller artwork only | Design Symbols imports/saves declared PNG companion | `StudioBlueprintService` / `SymbolPresentation` | PNG, safe location, ≤5 MB; missing falls back to id | Re-import/save or remove stale artwork |
| `Reuse a managed compatible Outcome Library` | `build`/`export` reuses compatible managed output | Same managed lifecycle, not a registry screen | `ManagedOutcomeProjectService` | Provenance must match | Regenerate or adopt a verified bundle |
| `Discover Studio custom Outcome Library bundles across restart` | Intentional absence | Outcome Library Registry discovers safe custom destinations | Studio registry boundary | Unsafe/corrupt index fails open | Regenerate or repair/remove the bundle |
| `Persist and recover Studio Projects` | Intentional absence | Projects create/register/open/remove/relocate across restart | `FileStudioProjectRegistry` | Missing remains visible; corrupt registry starts empty | Relocate, remove, or reopen the project |
| `Persist a dev-server session across restart` | `serve` is process-local; embedding may use `FileSessionRepository` | Intentional absence | `FileSessionRepository` opt-in | Missing/corrupt record is unknown session | Recreate session or configure durable embedding storage |
| `Build a runnable package` | `build --target tsPackage` | Build/Export TypeScript Game Package | `BUILD_PRODUCT_MATRIX`, `ArtifactConversionPlanner`, `ArtifactBuilderRegistry`, `ProjectTargetResolver` | Blueprint and safe destination | Fix validation or choose another destination |
| `Generate raw weighted outcomes` | `generate --out` writes raw JSON | Intentional absence: Studio Generate materializes a bundle | `generateExactWeightedOutcomeLibrary` | Raw JSON/checkpoint is not runnable | Resume or use descriptor/bundle generation |
| `Materialize a canonical Outcome Library bundle` | `build --target outcomeLibrary`; `export --to outcomes` | Build/Export Outcome Library / Studio Generate | canonical bundle descriptor and registry | Compatible source/provenance and safe destination | Repair/repoint source, then build |
| `Inspect, sample or analyze precomputed outcomes` | `inspect`, `sample`, `report`, `diff` | Overview / outcome-source views | `OUTCOME_SOURCE_*` capabilities | Stake analyzes but does not draw | Use a native library to sample/play |
| `Export Stake files` | `build --target stakeAdapter`; `export --to adapter` | Build/Export Stake Engine export | Stake projection / selector boundary | CLI descriptor intentionally differs from Studio selector | Repair selection/provenance, then build |
| `Import Stake files` | `import` | Intentional absence: register/open only | `StakeEngineImporter` | POKIE manifest required; generic Stake is analysis-only | Re-import POKIE output or inspect it |
| `Validate artifacts` | `validate`; `certification verify` | Overview and target validation; CLI verifier handoff | Resolver and target validators | Validation is target-specific | Fix reported source or rebuild evidence |
| `Run/play a game` | `serve`, `client`, `dev` | Play | runtime resolver / native selection | Package execution differs from native selection | Build/open a runnable package or native library |
| `Simulate` | `sim --out` | Simulation job with HTTP report attachments | `simulateOutcomeSourceProject` | Completed retained job required for download | Cancel/rerun after restart, eviction, or failure |
| `Render simulation or outcome-source analysis` | `report --out` | Simulation results | report parser / outcome analyzer | Results are presentation, not sources | Rerun after source changes |
| `Compare reports or outcome sources` | `diff --out` | Simulation results | simulation/source differ | Inputs must be like-for-like | Select compatible reports/sources |
| `Replay a result` | `replay --out` | Replay with HTTP descriptor or selected-view Blob | `replayOutcomeSourceProject` | Exact native provenance; package replay is best effort | Reload/retry after stale, eviction, or restart |
| `Certify an Outcome Library` | `certification build`, `certification verify` | Certification build/inspect; explicit CLI verify handoff | certification descriptor/evidence bundle | Same live unchanged source is required | Rebuild then run displayed verifier |
| `Prove fairness` | `fairness seed-commit`, `commit`, `reveal`, `verify` | Provably Fair configure/generate/verify | commitment/proof validators | Private seed stays private | Supply matching commitment/source |
| `Deploy an external format` | `export` | Build/Export Remote delivery | deployment service / Studio selector | Target capability and selector provenance required | Configure target or choose valid source |
| `Generate/inspect reel strips` | `reel generate`, `inspect` | Reel tools / Design | reel generation and Blueprint validation | Seed/configuration diagnostics are actionable | Correct reel settings and regenerate |
| `Assess WASM compatibility` | `inspect` | register/open/inspect only | `WASM_PRODUCT_CONTRACT` | No build/runtime/sampling/logic-validation promise | Inspect metadata or use a supported source |

## Public CLI grammar disposition

Each advertised command is a row; nested verbs are separate so aliases cannot
hide a different diagnostic or result.

| Public route | CLI result | Studio result or intentional absence | Contract / diagnostic | Next action |
| --- | --- | --- | --- | --- |
| `build` | Matrix conversion artifact | Build/Export cards | `BUILD_PRODUCT_MATRIX`; conflict preserves output | Fix prerequisite or choose safe output |
| `certification build` | Evidence bundle | Certification build | certification descriptor | Build then verify unchanged source |
| `certification verify` | Verification report | Explicit displayed CLI handoff | verifier is CLI-owned | Run the displayed command |
| `client` | Runtime client | Play equivalent | runtime resolver | Open runnable source |
| `create` | Blueprint | Home Design | `GameBlueprint` | Correct design/path |
| `dev` | Runtime dev server | Play equivalent | runtime resolver | Build/open runnable source |
| `diff` | Comparison result | Simulation results where applicable | differ contracts | Select like-for-like inputs |
| `edit` | Validated Blueprint update | Design editor | `GameBlueprint` | Save then rebuild |
| `export` | Descriptor/matrix conversion | Build/Export | planner/registry | Repair descriptor/source |
| `fairness commit` | Commitment | Provably Fair | proof validator | Preserve private seed |
| `fairness reveal` | Reveal result | Provably Fair | proof validator | Supply matching commitment |
| `fairness seed-commit` | Seed commitment | Provably Fair | proof validator | Keep seed private |
| `fairness verify` | Verification result | Provably Fair | proof validator | Correct proof/source |
| `generate` | Raw weighted-outcome JSON | Intentional absence; Studio bundle workflow | raw is not a bundle | Materialize/resume as directed |
| `import` | Imported Outcome Library | register/open boundary | `StakeEngineImporter` | Import POKIE-produced export |
| `init` | Prepared package | Design/Build creation | preparer lifecycle | Fix named phase, retry |
| `inspect` | Recognized-type inspection | Overview | resolver | Follow type-specific action |
| `par export` | PAR workbook | Design PAR panel | PAR exporter | Import before run |
| `par import` | Blueprint | Design PAR panel | PAR importer | Validate/build Blueprint |
| `reel generate` | Reel update | Reel tools | reel generator | Correct generation settings |
| `replay` | Replay descriptor | Replay | replay service | Reload/rerun if stale |
| `report` | Rendered result | Simulation results | report parser | Treat as delivery artifact |
| `sample` | Native outcome sample | Outcome source view | sample capability | Open native library |
| `serve` | Runtime server | Play equivalent | runtime resolver | Build/open runnable source |
| `sim` | Simulation report/set | Simulation | simulation service | Rerun after lost job |
| `validate` | Target validation | Overview/target validation | validators | Fix named diagnostic |

## Conversion lifecycle evidence

Every supported `BUILD_PRODUCT_MATRIX` cell is executed by the public `build`
command and Studio's retained HTTP Build/Export job route in
`PC17CliStudioParity.integration.test.ts`; the test derives its 14 cells from
the exported matrix. It checks resolver readback, 409 conflict preservation,
and cancellation leaves neither output nor staging directory. The same route
is rendered by the Studio product tests; Studio-only controls remain bounded as
listed above rather than being falsely claimed as CLI prerequisites.
