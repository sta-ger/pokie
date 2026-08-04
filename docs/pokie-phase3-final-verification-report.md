[← Back to docs index](README.md)

# POKIE Phase 3 final verification report

**Step:** `[P3-POLISH-24]`. **Reviewed implementation base:** commit `ac44a5044699e1100353d4d5d4680f02d0d49e89`
(merge of `task/P3-POLISH-23`, "poll for project-context settlement instead of a fixed tick in StudioServer
error test"). **Date:** 2026-08-04.

This report is the closing artifact for the Phase 3 CLI/Studio migration sequence (`P3-POLISH-01` through
`P3-POLISH-23`): it checks the outstanding acceptance criteria from this step's own instruction against the
current tree, records how each was verified, and closes out `docs/pokie-phase3-inventory.md`'s "Owner steps"
list the same way `docs/studio-phase2-final-verification-report.md` closed out Phase 2's own inventory. It does
not repeat that document's per-surface detail — it cites it.

## Method

Every claim below is backed by either a re-run executable fixture (cited by file) or a direct read of the
current source (cited by `file:line`) — never restated from `pokie-phase3-inventory.md`'s own prose without
re-checking it against the tree first, since that document is an explicitly frozen baseline and several of its
own sections carry "superseded by a later step" notes.

Test evidence in this report is limited to the fast `pokie` Jest project (`jest.config.mjs`'s default lane,
excluding the files it names for the `pokie-integration`/`studio-client-workflows`/`pokie-packaging` lanes) —
this implementation step's own sandbox has no compiled `dist/` and its `npm` is policy-restricted to
`npm test -- <file>` / `npm run typecheck` (`test:integration`, `test:workflows`, `test:coverage`,
`test:packaging`, and any `--selectProjects` invocation are rejected outright), so the integration lane (which
needs a real `npm run build-test-runtime` compile step) cannot run here by design — confirmed directly: invoking
it failed with `Command failed: npm run build-test-runtime` from `tests/testUtils/ensureCompiledTestOutput.ts`,
not a test assertion failure. `check:fast`/`check:full`/`check:release` remain orchestrator-owned per this
step's own rules and are not run here.

## Acceptance criteria

### 1. "New output never creates `src/generated`, build-info, old create/build semantics or parallel Studio workflows"

Already true of the current tree, not a change this step makes:

- `GamePackageGenerator.generate()` writes exactly `BUILT_PACKAGE_FILES` — `package.json`, `package-lock.json`,
  `tsconfig.json`, `README.md`, `src/index.ts`, `dist/index.js` (`src/generated/buildGameBuildInfo.ts:12`) —
  no `src/generated/` nesting and no `build-info.json` in anything a current build produces. The generator's own
  doc comment states this explicitly: "Nothing under the built package tracks where it came from (no embedded
  blueprint copy, no build-info file, no `src/generated` nesting)" (`src/generated/GamePackageGenerator.ts:47`).
  `GameBuildInfo`'s own doc comment confirms the type is now purely an in-memory/console-summary computation,
  "still recognized when reading an *older* package a pre-migration `pokie build` run produced... New builds no
  longer write anything this could be read back from" (`src/generated/GameBuildInfo.ts:10-12`).
- **Executable:** `tests/generated/GamePackageGenerator.test.ts` pins `BUILT_PACKAGE_FILES` and asserts "No
  blueprint/build-info/creation-seed metadata of any kind is left in a newly built package" — this file lives in
  the `pokie-integration` lane (real filesystem, real atomic rename) and was not re-run in this sandbox (see
  "Method" above); its assertions were read directly instead and match the production code cited above.
- **Parallel Studio workflows:** Build/Export (`ExportDeployTab`) is the sole Studio build/export surface —
  `047418a`/`079312f` (`P3-POLISH-20`) retired the separate Deployment/Stake Engine Export/Outcome Libraries
  Stepper-driven workflows in favor of one descriptor-driven card list (`ExportDeployTargets.ts`). Re-confirmed
  directly against the current tree: `visibleProjectTabs()` filters `deployment`/`stakeEngineExport`/
  `outcomeLibraries` out of Studio's own nav (`cli/studio-client/src/components/project/ProjectDashboardPage.tsx:161-165`),
  and none of the three still mounts its own workflow component — see criterion 2 below for what a deep link to
  one of them does instead. No second/duplicate build pipeline exists anywhere in `cli/studio`.

### 2. "`export` is removed from canonical help/docs; if public compatibility requires it, it is a hidden deprecated forwarding alias with migration text and expiry version"

POKIE has never had a top-level `pokie export` command — confirmed by `grep` across `cli/`, `docs/cli.md`, and
`tests/cli/fixtures/cliCommandInventory.ts`: "export" only ever appears as a verb nested under `pokie
stakeengine export`/`pokie par export`, both of which remain canonical, documented commands (`docs/cli.md:811`,
`docs/cli.md:620`). There is nothing named `export` to remove from canonical help, and no public compatibility
surface that ever pointed at a bare `pokie export` for a forwarding alias to preserve.

The closest real analogue — Studio's own former "Stake Engine Export" nav tab — already follows exactly the
"hidden deprecated forwarding alias with migration text" shape the criterion describes, established in
`P3-POLISH-20`: `/project/stakeEngineExport` (and `/project/deployment`, `/project/outcomeLibraries`) remain in
`ALL_PROJECT_TABS` so an existing deep link keeps resolving, are excluded from the visible nav list (criterion 1
above), and render `LEGACY_TAB_MIGRATION_COPY` guidance instead of their old workflow — e.g. `stakeEngineExport`:
"Stake Engine Export is no longer its own workspace -- its static-export builder is now one of Build/Export's
own cards, run right there against this project's own current build."
(`cli/studio-client/src/components/project/ProjectDashboardPage.tsx:174-187`). This is a hidden route + migration
text, matching the criterion's own description.

**Expiry version:** POKIE has no versioned-deprecation convention anywhere in the codebase to attach an expiry
to — confirmed by `grep -ril deprecat` across `src/`, `cli/`, `tests/`, `docs/`: every hit is unrelated to a
public API deprecation (an internal jackpot state-machine comment in
`src/session/videoslot/jackpot/VideoSlotWithJackpotSessionState.ts`, an example warning string in a UI test
fixture, and a ts-jest config comment in `docs/testing.md`). Since there is no `pokie export` alias in the first
place and no existing expiry-version mechanism this step would be extending, inventing one here would add a
new, unprecedented convention not asked for by any other command's deprecation (including the three legacy
Studio routes above, which carry migration text but no version-expiry field either). Treated as
satisfied/not-applicable rather than silently skipped.

### 3. "Full Project Target, materialization, package, Studio, reels, artifact and outcome acceptance matrix passes with explicit legacy migration diagnostics"

**Fast-lane run (this step, this sandbox):**

```
Test Suites: 341 passed, 341 total
Tests:       5312 passed, 5312 total
```

This includes, among the 341 suites: every `tests/project/*` suite (`ProjectTargetResolver.test.ts`,
`ArtifactBuilder.test.ts`, `ArtifactBuilderRegistry.test.ts`, `ProjectMaterializing.test.ts`), the non-integration
materialization suite (`tests/cli/materialize/BlueprintProjectMaterializer.test.ts`), every `tests/reels/*` suite,
the outcome-library/Stake Engine suites (`tests/weightedoutcome/**`, `tests/stakeengine/**`), the Studio build-
preview suites (`tests/cli/studio/previewBuildDestination.test.ts`,
`tests/cli/studio/blueprint/StudioBlueprintService.test.ts`), and every CLI contract/fixture suite
(`tests/cli/cliCommandInventory.contract.test.ts`, `tests/cli/packageOnlyCommandInputs.contract.test.ts`) — the
executable sources of truth `pokie-phase3-inventory.md` §1 cites. None of these are in the excluded
integration/workflow/packaging lists (`jest.config.mjs`), so this run is a genuine, complete pass of the fast
lane's own slice of the acceptance matrix, not a partial sample.

Not re-run here (sandboxed out, see "Method"): `tests/generated/GamePackageGenerator.test.ts`,
`tests/cli/studio/StudioServer.test.ts`, `tests/cli/materialize/BlueprintProjectMaterializer.integration.test.ts`,
and the rest of the `pokie-integration`/`studio-client-workflows` lanes, plus `check:full`/`check:release` —
all orchestrator-owned; their assertions were read directly instead (criterion 1 above) and are unchanged by
this step.

**Explicit legacy migration diagnostics:**

- **Package seam:** `previewBuildDestination()` recognizes an existing destination that carries an *older*
  pre-migration `src/generated/build-info.json` (via `readPriorBuildInfo`, matched on `generatedBy === "pokie
  build"`) and surfaces it as `priorBuild` — read-only, this function only ever reads that legacy file, it is
  never written by a current build (`cli/studio/previewBuildDestination.ts:22-25,47-61`). Wired end to end into
  Studio's own Build panel (`StudioBuildPreviewView.ts` → `cli/studio-client/src/components/common/BuildPreviewDisplay.tsx:48-56`,
  which surfaces the version-change/version-unchanged diagnostic against the prior build) and covered by
  `tests/cli/studio/previewBuildDestination.test.ts` / `tests/cli/studio/blueprint/StudioBlueprintService.test.ts`
  (both fast-lane, both passed in this step's run above).
- **Studio nav seam:** `LEGACY_TAB_MIGRATION_COPY` (criterion 2 above) is the equivalent diagnostic for the three
  retired Advanced-tab workflows — an explicit, hand-authored explanation of where each one's functionality
  moved, rendered whenever a legacy deep link is followed, rather than a blank or 404'd section.

No gap was found in either seam that this step needed to close.

## Repository status

This report is `[P3-POLISH-24]`'s only change — a documentation-only closing pass, since every specific
acceptance criterion above was already satisfied by `P3-POLISH-01`–`P3-POLISH-23` and re-verified rather than
re-implemented. No production source under `src/`, `cli/`, or `tests/` was modified by this step. Official
`check:fast`/`check:full`/`check:release` gates remain orchestrator-owned and are not run by this report.
