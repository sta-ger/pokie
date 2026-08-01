[← Back to docs index](README.md)

# POKIE Phase 3 current-state contract (v1)

**Status:** baseline, frozen 2026-08-01 against `HEAD` at the start of the `P3-POLISH-*` step series. Written
*before* any Phase 3 migration work touches CLI targets, the generated-package seam, Studio's home/project
routes, or the External Adapter SDK / Stake Engine adapter boundary, so a future migration step can diff its
own intended changes against this document instead of re-deriving "what did this look like before" from
scratch — the same purpose [`studio-phase2-inventory.md`](studio-phase2-inventory.md) served for Phase 2's
Studio redesign work, one level up: this document is the cross-cutting index over CLI + generated-package +
Studio + adapter surfaces, not a replacement for that file's own Studio-UI-level detail.

**Not in scope:** this is a documentation/regression-fixture baseline, not a migration plan or a redesign. No
production behavior changes are described or implied here — every fact below is the *current, frozen* state,
so a later migration step has to make an explicit, reviewable decision about each one rather than silently
keep or lose it. Nothing here schedules *when* any removal/change happens; see "Owner steps" at the end.

**Versioning:** increment the version marker above whenever a Phase 3 step intentionally changes one of the
frozen facts recorded here — this document should never quietly drift out of sync with the fixtures it cites.

**How to read each section:** every claim is backed either by an **executable fixture** (cited by file + test
name — this is what "frozen" means: a regression breaks loudly, not silently) or, where a fixture would only
restate an already-exhaustive one, by **evidence** (a `file:line`/module citation into the current
implementation). Nothing below is asserted from memory or from this document's own prose.

---

## 1. CLI targets: package-only command inputs

Every public `pokie` command's own positionals/options/defaults/error text is already frozen, exhaustively,
by `tests/cli/fixtures/cliCommandInventory.ts` (`CLI_COMMAND_DESCRIPTORS`/`CLI_CONTRACT_CASES`) and replayed
through the real dispatcher by `tests/cli/cliCommandInventory.contract.test.ts` — that pair is the executable
source of truth for the CLI's *whole* surface and is not re-derived here.

What that fixture does **not** already express as a first-class fact is the axis this migration-prep step
actually cares about: which commands' *entire* required input is an already-loadable game package (a
directory satisfying the `PokieGame`/`pokie.entry` contract `loadPokieGame`/`findPokieProjectRoot` read —
produced by any of `pokie build`, `pokie create`, or `pokie init`, not "built" in any narrower sense), as
opposed to a source blueprint/config, a previously-produced bundle/export/report artifact, a plain file, a
project directory to write into, or nothing at all. A migration step that wants to relax the "package-only"
requirement (e.g. letting `pokie sim` run straight off a blueprint with no build step first) needs exactly
this classification as its starting inventory.

**Executable:** `tests/cli/fixtures/packageOnlyCommandInputs.ts` (`PACKAGE_ONLY_COMMAND_INPUTS`) classifies
every `(command, verb)` pair; `tests/cli/packageOnlyCommandInputs.contract.test.ts` proves it covers every pair
`CLI_COMMAND_DESCRIPTORS` declares (plus `init`, which has none of its own — see that fixture's comment) and
cross-checks every `requiresLoadablePackage: true` entry against that verb's own frozen `positionals[0]`
literally being `"packageRoot"`.

**Package-only today (8):** `client`, `dev`, `inspect`, `outcomelibrary generate`, `replay`, `serve`, `sim`,
`validate` — each takes a `packageRoot` as its one required positional and does nothing at all without one
already on disk.

**Not package-only:**
- **Writes a package, never reads one:** `build` (from a blueprint/config, or `random`), `create`, `init`.
- **Reads a previously-produced bundle/export/report/proof, never a package:** `certification build`/`verify`,
  `fairness seed-commit`/`commit`/`reveal`/`verify`, `outcomelibrary build`/`validate`, `stakeengine
  export`/`import`/`analyze`/`diff`, `diff`, `report`, `par import`/`export`.
- **No required input at all:** `name`, `build random`.
- **Optional package, not required:** `studio [projectRoot]` — resolves the identical loadable-package
  contract as the 8 package-only commands when a `projectRoot` is given, but runs perfectly well with none
  (opens Home). Deliberately excluded from the strict package-only set for that reason; see the fixture's own
  comment on this entry.

## 2. Build/create/init semantics

Three CLI targets can turn "no package" into "a loadable package," each with a materially different contract
— already frozen, per-tool, by their own dedicated tests; not re-derived here beyond this summary table:

| Command | Input | Output | Contract |
|---|---|---|---|
| `pokie create <name>` | a new directory name (+ optional `--random`) | a brand-new project dir: `package.json`, `tsconfig.json`, `src/index.ts`, `src/<ClassName>Game.ts`, `src/<ClassName>Session.ts` | fails outright if the target directory already exists (`GamePackageCreator.ts:32-33`); every one of the 5 files is always written, no partial/skip case. **Executable:** `tests/cli/scaffold/GamePackageCreator.test.ts` |
| `pokie init` | none (operates on `process.cwd()`) | patches the existing `package.json` in place, writes `tsconfig.json`/`src/index.ts` **only if absent** | requires an existing `package.json` in cwd (`GamePackageScaffolder.ts:21-22`, "run `npm init -y` first"); `createdFiles`/`skippedFiles` distinguish a fresh scaffold from a re-run. **Executable:** `tests/cli/scaffold/GamePackageScaffolder.test.ts` |
| `pokie build <config.json>` | a `GameBlueprint` JSON (or `random`) | `package.json`, `README.md`, `src/generated/index.js`, `src/generated/build-info.json` (`GENERATED_PACKAGE_FILES`, see §3) | the one tool with atomic-publish/rebuild semantics: first publish requires an empty/absent target dir, a rebuild recognizes and preserves any content it doesn't itself own, and every publish is a single atomic directory rename (never a partially-written package observable mid-write). **Executable:** `tests/generated/GamePackageGenerator.test.ts` |

`create`/`init` write a **hand-editable** package (a real, if minimal, `Game`/`Session` pair a developer owns
and extends); `build` writes a **wholly generated, always-overwritable-by-rebuild** one (`src/generated/`) —
this is the one substantive difference a migration step touching "how a package comes to exist" has to
preserve or explicitly change, not an incidental implementation detail.

## 3. Generated-package files (the `build` seam)

`GENERATED_PACKAGE_FILES` (`src/generated/buildGameBuildInfo.ts:9`) is the single canonical list —
`["package.json", "README.md", "src/generated/index.js", "src/generated/build-info.json"]` — and is already
the one place every consumer of "what does a `pokie build` package contain" reads from, not a duplicated
literal: `GamePackageGenerator` itself (write/rebuild/conflict-detection), `previewBuildDestination.ts` (Studio's
Build-preview seam), and `applyGameBlueprintToProject.ts` (Studio's guided-editor apply-to-project seam) all
import the same constant.

**Executable:** `tests/generated/GamePackageGenerator.test.ts` pins the exact file list, atomic first-publish/
rebuild semantics, symlink/non-file rejection, and unmanaged-sibling-content preservation, end to end against
a real filesystem (this is why it lives in the slower `pokie-integration` project, not `pokie` — see
`jest.config.mjs`'s own `integrationTestMatch`). This is the seam most likely to move under a Phase 3
migration that changes what "a generated package" means (e.g. dropping the npm-package wrapper entirely in
favor of an in-memory/blueprint-only runtime) — any such change must update `GENERATED_PACKAGE_FILES` and
every one of the three consumers above in the same step, not just the generator.

## 4. Studio home/project routes

Already frozen exhaustively by [`studio-phase2-inventory.md`](studio-phase2-inventory.md) and its own
executable fixtures (`tests/cli/studio-client/src/studioSurfaceInventory.baseline.test.tsx`,
`tests/cli/studio/StudioRequestContractBaseline.test.ts`) — every Home tab (Design & Build, Raw Editor,
Advanced Tools, Open Project) and every Advanced project tab (Replay, Runtime, Certification, Provably Fair,
Deployment, Outcome Libraries, Stake Engine Export), their Stepper gating, path fields, disabled-action
conditions, inferable-empty-input behavior, and raw-error surfaces, are all documented there with fixture
citations. Not re-derived here.

**Route table (evidence, `cli/studio-client/src/routes.tsx:18-26`):** `/` → `StudioLanding` (asks the server
which mode it started in); `/home/:tab` → `HomePage`; `/project` → redirect to `/project/overview`;
`/project/:tab` → `ProjectDashboardPage`; any other path → redirect to `/home/design`. This is the one fact
`studio-phase2-inventory.md` itself doesn't state as a standalone route table (it documents each tab's own
route individually) — recorded here since Phase 3's own "Studio routes" scope is exactly this table plus
that document's per-tab detail, taken together.

## 5. PAR sheet, outcome-library, and Stake Engine surfaces

All three already have a dedicated reference doc and executable round-trip/workflow coverage — not
re-derived here, only indexed for this baseline's own cross-cutting purpose:

- **PAR sheet** — [`cli.md#workbook-format`](cli.md#workbook-format) (`pokie par import`/`export`, the full
  symbols/reel-strips/paytable/paylines/bets/win-model/mechanics/bet-modes round-trip).
  **Executable:** `tests/cli/ParSheetRoundTrip.integration.test.ts`.
- **Outcome libraries** — [`weighted-outcome-library.md`](weighted-outcome-library.md) (the
  `WeightedOutcomeLibrary` model itself) and [`outcome-library-bundle.md`](outcome-library-bundle.md) (its
  on-disk persistence format, `pokie outcomelibrary build`/`validate`).
  **Executable:** `tests/cli/OutcomeLibraryGenerateWorkflow.integration.test.ts`.
- **Stake Engine** — [`stake-engine-export.md`](stake-engine-export.md) / [`stake-engine-import.md`](stake-engine-import.md)
  / [`stake-engine-standalone.md`](stake-engine-standalone.md) (`pokie stakeengine export`/`import`/`analyze`/`diff`).
  **Executable:** `tests/cli/StakeEngineExportRegistryWorkflow.integration.test.ts`.

Studio's own surfaces for these three (PAR Sheet Import/Export panel, Outcome Libraries tab, Stake Engine
Export tab) are covered by §4's Studio baseline, not repeated here.

## 6. Adapter boundaries: External Adapter SDK vs. Stake Engine

`src/externaladapter/` (`ExternalDeploymentService`, `ExternalDeploymentTarget`, ...) and `src/stakeengine/`
(`StakeEngineExporter`, ...) are a **deliberate, explicit architectural fork, not two implementations of the
same thing** — already decided and documented, not an open question this baseline reopens:
[`v1.3-closeout-report.md`](v1.3-closeout-report.md) item 7 records the decision (commit `6e3381c`); the
rationale itself lives in
[`external-adapter-sdk.md`'s "Why Stake Engine Export isn't an `ExternalDeploymentTarget`"](external-adapter-sdk.md#why-stake-engine-export-isnt-an-externaldeploymenttarget)
and is mirrored in [`stake-engine-export.md`](stake-engine-export.md)'s own opening paragraph: Stake Engine's
export format is static/batch, not a live `ExternalDeploymentTarget` session, and a mode's own `cost` (needed
for unit conversion) has no channel through the SDK's generic projector contract. Recorded here only so a
Phase 3 migration step touching either boundary starts from "this fork is intentional" rather than
re-litigating it as an accidental gap.

**Executable:** the External Adapter SDK's own contract/registry/service tests live under
`tests/externaladapter/`; Stake Engine's own export/import/standalone tests live under `tests/stakeengine/`
and `tests/cli/commands/StakeEngineCommand.test.ts` — both suites already exhaustively pin their respective
surfaces independently and are not duplicated here.

---

## Owner steps

Every surface above is frozen as **current state only** — this baseline (`P3-POLISH-01`) names no redesign
and performs no product migration or removal itself. Owners below are assigned by *which future step's own
migration responsibility actually reaches that surface*, not by proximity to this step's own number; bump the
version marker above in the same commit as whichever step changes one of these facts:

- **CLI package-only inputs (§1)** is three distinct future concerns, not one: the **resolver** that would
  relax which commands require an already-loadable `packageRoot` → `P3-POLISH-03`; the **materialization**
  path a relaxed command falls back to once it no longer requires one on disk (in-memory or implicit-build)
  → `P3-POLISH-08`; and the resulting **capability**/CLI surface/help-text/dispatcher change once the resolver
  and materialization land → `P3-POLISH-09`.
- **Build/create/init semantics and the generated-package file seam (§2–§3)** is three distinct tools, not
  one: shared target-directory **preparation** semantics across `create`/`init`/`build` → `P3-POLISH-05`;
  the **creator** (`pokie create` / `GamePackageCreator`) → `P3-POLISH-06`; and **create-init**
  (`pokie init` / `GamePackageScaffolder`, plus the `GENERATED_PACKAGE_FILES` seam it shares with `build`) →
  `P3-POLISH-07`.
- **Studio routes (§4)** — the Home vs. project-workspace split (`/` + `/home/:tab` vs. `/project` +
  `/project/:tab`) is its own multi-step migration, not a single step: Studio Home migration and workspace
  migration together → `P3-POLISH-10`–`P3-POLISH-19`.
- **PAR sheet (§5)** → `P3-POLISH-22`.
- **Outcome libraries and Stake Engine (§5)** → `P3-POLISH-21`.
- **Adapter boundary (§6)** → `P3-POLISH-20`, the Build-Export step family that §5's Outcome-library/Stake-
  Engine owner step (`P3-POLISH-21`) also belongs to; already resolved by explicit decision (v1.3 item 7), so
  this owner step is only ever a documentation update, not a behavior change, unless it explicitly reopens the
  decision itself.

Naming these owners here reserves *which* later step in the `P3-POLISH-*` series is accountable for each
surface so a removal never lands without an explicit, reviewable decision against this baseline; it does not
itself schedule *when* that step runs, and none of `P3-POLISH-02`–`P3-POLISH-24` make any change, migration,
or removal as part of this step — that work, if any, belongs entirely to the numbered step once it runs.
