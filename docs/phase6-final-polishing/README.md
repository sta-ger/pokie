# Phase 6 baseline: Project capabilities and public-language inventory

## Frozen provenance

This Phase 6 preparation record was made in the dedicated orchestrator branch
`task/P6-01-20260813094849`. At preparation time `git status --short` was
empty and `develop` and `HEAD` were the same exact product commit:

```text
33b0b0605c84dec2b2afd9670c8ab92acedda4ee
merge task task/P5PA-08-20260811055822 (implementation 20561e6fd9dd)
2026-08-11T08:58:14+02:00
```

`git remote -v` produced no rows in this isolated worktree. There was thus no
newer observable `origin/develop` to compare; this records the clean local
`develop` SHA, not a claim about an unobserved remote.

Phase 5 and `pokie-phase-5-post-audit-polishing` are completed immutable
history. Preserve their evidence and conclusions rather than regenerate or
amend them. Retained anchors are `edfc245` (`[P5-POLISH-01]` baseline), the
completed P5-polish sequence including `98353f5` and `b0bac11`, and post-audit
polishing from `39315a6` (`[P5PA-01] freeze Phase 5 completion baseline`)
through `4ad24ec` / `20561e6`, merged by the SHA above. This file is the only
Phase 6 artifact introduced by this step; it changes no product behavior.

## Source of truth and resolution

`src/project/ProjectType.ts` is the closed project-type vocabulary. It has six
types, not five: the requested Blueprint, TypeScript package, Outcome Library,
Stake adapter/artifact, and WASM types plus `parWorkbook`. Omitting PAR would
make the matrix non-exhaustive.

`ProjectTargetResolver` is the canonical format-recognition entry point. It
asks the fixed type adapters, rejects ambiguity, and stamps one result with
`PROJECT_TYPE_CAPABILITIES`. Only a `.wasm` with a compatible
`PokieWasmComponentManifest` sidecar resolves as `wasm`; a bare or incompatible
`.wasm` throws `ProjectTargetUnsupportedError`. Resolution is not evidence of a
WASM execution backend.

| Resolved type | Recognition | Granted capabilities | Canonical execution/read path |
| --- | --- | --- | --- |
| `blueprint` | GameBlueprint JSON file | `blueprint.build` | `ArtifactBuilderRegistry` → `TsPackageArtifactBuilder` / `GamePackageGenerator`; `EditCommand` edits canonical JSON |
| `tsPackage` | loadable `pokie.entry` package directory | `runtime.execute` | materialize runtime package → `loadPokieGame`; runtime sim/replay/validate/serve/client/dev/Studio |
| `outcomeLibrary` | canonical bundle directory | `outcomeLibrary.read`, `outcomeSource.read`, `outcomeSource.sample` | bundle reader/validator, `OutcomeLibraryBundleOutcomeSource`, `OutcomeSourceProjectAnalyzer`, pre-generated replay/server |
| `stakeAdapter` | recognized Stake Engine export directory | `stakeAdapter.exchange`, `outcomeSource.read` | Stake importer/exporter and `StakeEngineOutcomeSourceReader` / `StakeEngineStandaloneAnalyzer`; no draw contract |
| `wasm` | compatible component plus sidecar | `wasm.manifest.read` | `readWasmComponentManifest`; metadata only |
| `parWorkbook` | recognized PAR `.xlsx` workbook | `parWorkbook.exchange` | `ParSheetImporter` / `ParSheetExporter` / `ParWorkbookArtifactBuilder` |

The shared controls are `ProjectCapabilities.ts` (grants), `PokieOperation.ts`
(operation → one required capability), and
`describeUnsupportedProjectOperation()` (diagnostic plus alternatives). Later
CLI and Studio work must consume those controls rather than introduce separate
project-type switches or inaccurate fallbacks.

## Exhaustive Project-type × generic-operation matrix

The rows below enumerate every baseline entry in
`OPERATION_REQUIRED_CAPABILITY`. `✓` means the type grants the required
capability. `—` means unsupported: return the shared missing-capability
diagnostic and its alternatives; do not silently materialize, simulate, or call
it a preview. This is a capability matrix, not a promise that every operation
already has a public CLI spelling.

| Generic operation(s), grouped only where capability and semantics match | Capability | Blueprint | TS package | Outcome Library | Stake adapter | WASM | PAR workbook | Resolver/execution path |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `build`, `edit` | `blueprint.build` | ✓ | — | — | — | — | — | resolve → `ArtifactBuilderRegistry` (`tsPackage`) / `EditCommand` |
| `sim`, `replay`, `validate`, `inspect`, `serve`, `dev`, `client`, `studio`, `outcomeLibrary.generate` | `runtime.execute` | — | ✓ | — | — | — | — | materialize → `loadPokieGame`; `ParallelSimulationRunner`, `ReplayRecorder`, runtime server/services |
| `outcomeLibrary.build`, `outcomeLibrary.validate`, `certification.build`, `certification.verify` | `outcomeLibrary.read` | — | — | ✓ | — | — | — | native bundle reader/validator; certification consumes an existing bundle |
| `stakeEngine.export`, `stakeEngine.import`, `stakeEngine.analyze`, `stakeEngine.diff` | `stakeAdapter.exchange` | — | — | — | ✓ | — | — | Stake importer/exporter/standalone analyzer; older config/file CLI forms remain separate input workflows |
| `par.import`, `par.export` | `parWorkbook.exchange` | — | — | — | — | — | ✓ | `ParSheetImporter` / `ParSheetExporter`; `ParCommand` resolves recognized mismatch inputs first |
| `wasm.export` | `wasm.export` | — | — | — | — | — | — | truthfully unsupported: no type grants it and no WASM builder is registered |
| `wasm.inspect` | `wasm.manifest.read` | — | — | — | — | ✓ | — | compatible-sidecar resolution → `readWasmComponentManifest`; metadata only |
| `wasm.packagingPreflight` | `runtime.execute` | — | ✓ | — | — | — | — | `assessWasmPackagingPreflight` scans Node API usage/dependencies; advisory only |
| `outcomeSource.inspect`, `outcomeSource.analyze`, `outcomeSource.diff` | `outcomeSource.read` | — | — | ✓ | ✓ | — | — | `OutcomeSourceProjectAnalyzer` / `diffOutcomeSourceProjects`; no `loadPokieGame` |
| `outcomeSource.sample`, `outcomeSource.serve`, `outcomeSource.replay`, `outcomeSource.simulate` | `outcomeSource.sample` | — | — | ✓ | — | — | — | native selector/server/replayer/simulation accumulator; Stake export remains read-only |

Two boundaries must remain specific and honest:

- `stakeAdapter` can be read, analyzed, and diffed as a canonical outcome
  source, but cannot sample, simulate, replay, or serve individual outcomes.
  Its foreign book format has no POKIE `PreGeneratedOutcomeSourcing` contract.
- `wasm` can have its compatible manifest read, but cannot build, export, load,
  run, simulate, replay, or serve. A clean `tsPackage` preflight is not
  compilation support.

### Real verbs outside the Project capability map

`PokieOperation.ts` deliberately maps operations that act on a resolved
`PokieProject`; it does not pretend that every CLI noun is a Project operation.
The following real verbs are therefore deliberately outside the matrix above.
They must retain their own input contracts instead of being forced through an
unrelated Project capability.

| Verb family | Input and canonical path | Boundary for later CLI/Studio work |
| --- | --- | --- |
| `report` | reads a simulation-report JSON and renders Markdown/HTML via `SimulationReportRendering`; if it is not a report, `ReportCommand` may resolve an Outcome Library or Stake adapter and render `OutcomeSourceProjectAnalyzer` output | report JSON is not a project type; the fallback is read-only outcome-source analysis |
| `diff` | compares two simulation-report JSON documents through `SimulationReportDiffer` / `SimulationReportSetDiffer` | this is distinct from `outcomeSource.diff` and `stakeEngine.diff`, which compare resolved canonical outcome sources |
| `create`, `init`, `reel generate` | create/write a Blueprint, prepare a package directory, or generate/materialize declared Blueprint reel strips | these are authoring/setup workflows with direct Blueprint/package inputs; `reel` preview is genuinely no-write unless `--apply` or `--materialize` is selected |
| `fairness seed-commit`, `commit`, `reveal`, `verify` | fairness commitment/proof builders and a live native outcome-library reader | source bundle validation remains its own contract; it is not a runtime simulation capability |
| `name` | standalone deterministic `SlotGameNameGenerator` | no project input or resolver is involved |

This distinction also exposes present surface debt accurately: several older
package-only commands (`inspect`, `validate`, and their runtime peers) still
take package paths directly, while the central operation map specifies their
capability-level target. A removal/rename slice must either migrate the command
to the central resolver or explicitly preserve its narrower package-only
contract; it must not claim all six project types already reach that CLI verb.

### Artifact conversion submatrix

`ArtifactBuilderRegistry` is the build/export resolver for `pokie build` and
Studio Build artifact. Its descriptors are the authority for both target
eligibility and builder existence.

| Target | Backing operation | Accepted source types | Real builder/result |
| --- | --- | --- | --- |
| `tsPackage` | `build` | `blueprint` | `TsPackageArtifactBuilder`: only cross-type conversion, Blueprint → runnable package |
| `outcomeLibrary` | `outcomeLibrary.build` | `outcomeLibrary` | `OutcomeLibraryArtifactBuilder`: atomic same-type republish, never game-model recovery |
| `stakeAdapter` | `stakeEngine.export` | `stakeAdapter` | `StakeAdapterArtifactBuilder`: atomic same-type republish |
| `parWorkbook` | `par.export` | `parWorkbook` | `ParWorkbookArtifactBuilder`: same-type workbook republish |
| `wasm` | `wasm.export` | none | descriptor exists for honest discovery; no builder |

## Public-language audit

This is an occurrence audit, not a rename. “Preview” remains where it names a
real side-effect-free calculation or browser view. “Legacy” remains where it
names a compatibility contract. Later vertical slices may rename supported
surfaces, but must keep constraints concrete.

| Scope | Baseline occurrence and disposition |
| --- | --- |
| README/current docs | `README.md:68-72,197,202` and `docs/README.md:14,99-101,119,227-230` label `serve`, `client`, `dev`, and Studio experimental. `docs/cli.md:2116,2719,2778,2808` is canonical command documentation. These are supported local/dev surfaces; do not imply RGS/casino support when renaming. |
| CLI help/output | `ServeCommand`, `ClientCommand`, and `DevCommand` emit “Experimental”. Their “preview” wording identifies browser UI. `CreateCommand`, `BuildCommand`, and `ReelCommand` use preview truthfully for no-write output. |
| Studio | No public Studio product label calling Studio experimental was found in `cli/studio-client`. Its preview occurrences name no-write workflows (`build-preview`, deployment preview, generated-reel preview); retain unless behavior changes. |
| Compatibility APIs | `README.md:213`, `docs/game-session.md`, `docs/paytable-and-wins.md`, and `docs/serialization.md` use legacy for custom win-calculator/serialization fallbacks. This is real supported compatibility behavior, not stale marketing copy. |
| Historical records | Phase 2–5 inventories, closeout reports, and preserved evidence contain migration/preview/deprecated language as immutable history; do not rewrite them as current product copy. |
| Packages/examples | No `packages/` or `examples/` directory with matching public source was present at this baseline, and the scoped search found no occurrence there. |

The audit command excludes generated historical HTML when deciding current copy:

```text
rg -n -i '\\b(experimental|preview|prototype|legacy|deprecated|migration)\\b' \
  README.md docs cli cli/studio-client src packages examples
```

Classify each hit as product label, no-write operation, compatibility constraint,
or immutable history before changing it.

## Fixture and evidence policy

Phase 6 verification is bounded. Use small representative fixtures near the
relevant existing tests: `tests/cli/BuildWorkflow.integration.test.ts`,
`OutcomeLibraryGenerateWorkflow.integration.test.ts`,
`StakeEngineExportRegistryWorkflow.integration.test.ts`, and
`StudioFullWorkflow.integration.test.ts`, with one minimal valid Blueprint,
tsPackage, native outcome-library bundle, Stake export, compatible WASM
sidecar, and PAR workbook where needed.

Commit only concise summaries, one essential transcript per changed workflow,
and a minimal browser screenshot or checksum only when it proves a fact a
test/transcript cannot. Do not commit generated trees, repeated attempts, PID
files, server logs, broad forensic archives, or duplicate screenshots without a
specific review need. Phase 5 evidence remains its own preserved record; Phase
6 adds evidence only for new or changed behavior.

## Studio workspace scale boundary

The Blueprint Workspace presents its primary work in this order: Overview, Game
Model, Play, Simulation, Replay, and Build/Export. Replay and Build/Export are
normal workflows, not an "Advanced" category. Certification is shown only when
the opened project directly reads an outcome-library artifact; a Blueprint first
produces that artifact through Build/Export. Provably Fair is named explicitly
and is available only to a live runtime project.

The bounded large-project fixture used by the Studio component tests represents
six reels with 300 stops each, 48 symbols, 192 paytable rows, 12 modes, stack
metadata, long replay/report lists, and a large outcome-library mode set. The
Game Model's full-strip table renders at most 100 positions per reel and lets
the user page through every stop. This keeps the initial 1,800-stop inspection
within a bounded DOM budget while preserving the complete model for review;
the small primary game window remains immediate. Simulation and Replay remain
server-backed lists, so their initial response and browser memory must be
measured with the same fixture before introducing client-side virtualization.
No primary user error tells a producer to inspect a server log: each message
states the failed action, a reason where known, and the next recovery action.
