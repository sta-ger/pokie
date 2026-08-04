[← Back to docs index](README.md)

# POKIE Phase 4 current-state contract (v1)

**Step:** `[P4-POLISH-01]`. **Status:** baseline, frozen 2026-08-04 against `HEAD` at
`0f330b4698275e5fa5bebf095fbd76438dbc02ce` (merge of `task/P3-POLISH-24`, the Phase 3 CLI/Studio migration's own
closing report). Written *before* any Phase 4 behavior change, the same role
[`pokie-phase3-inventory.md`](pokie-phase3-inventory.md) served ahead of Phase 3: a future migration step diffs
its own intended change against this document instead of re-deriving "what did this look like before" from
scratch. This document does not re-derive anything `pokie-phase3-inventory.md`/
[`pokie-phase3-final-verification-report.md`](pokie-phase3-final-verification-report.md) already froze and
closed — see §5 below for exactly what carries forward untouched.

**Scope, per this step's own instruction:** re-audit the final Phase 3 tree and lock the remaining CLI,
materialization, Replay, player, and browser acceptance gaps *before* any Phase 4 behavior change — not a
migration plan, not a redesign, no production behavior changes here or implied.

**How to read each section:** every claim is backed either by an **executable fixture** (cited by file + test
name) or, where a fixture would only restate an already-exhaustive one, by **evidence** (a `file:line`/module
citation into the current implementation). Nothing below is asserted from memory or from this document's own
prose.

## Method

Test evidence in this document was gathered by invoking the fast `pokie` Jest project directly
(`node node_modules/jest/bin/jest.js --selectProjects pokie studio-client-components --maxWorkers=2 <file>`),
not through `npm test`: this sandbox's `npm` wrapper raises a shell syntax error
(`/usr/local/bin/npm: 4: Syntax error: word unexpected (expecting ")")`) on every invocation, independent of
anything in this repository — an environment defect outside this worktree, not a fact about POKIE's own source,
flagged here only so a reader isn't confused about why citations below name a direct Jest invocation instead of
`npm test -- <file>`. The direct invocation runs the identical project/worker configuration `npm test -- <file>`
would have, scoped to the same named file(s); no project-wide gate (`check:fast`/`check:full`/`check:release`,
`--selectProjects` beyond the two `npm test` itself already selects) was run. Lint (`node node_modules/.bin/eslint
<file>`) and typecheck (`node node_modules/typescript/bin/tsc --noEmit -p tsconfig.typecheck.json`) were run the
same way, for the same reason. As in `pokie-phase3-final-verification-report.md`'s own "Method" section, this
sandbox has no compiled `dist/` and cannot run the integration/workflow/packaging lanes or `build-cli` — where a
claim below depends on one of those, it says so explicitly rather than presenting it as re-verified here.

## 1. CLI robustness: paths with spaces, non-TTY invocation

**Already covered before this step:** `pokie prepare`'s package-install lifecycle (`GamePackagePreparer`) —
`tests/cli/prepare/GamePackagePreparer.test.ts` asserts a space-containing `projectRoot` passes through
`npm install`/`npm run build`'s args/cwd unmangled (fake runner), and
`GamePackagePreparer.integration.test.ts` repeats it against a real spawned `npm install`/`npm run build` in
`os.tmpdir()/"pokie prepare real "` (`pokie-integration` project, not re-run in this sandbox — see "Method").

**Structural evidence (this step, re-confirmed by direct read, not merely a prior grep):** every external-process
boundary in `cli/` invokes `execFile`/`execFileSync` with an argv array, never a shell string — `cli/prepare/
PackageCommandRunner.ts`, `cli/openInFileManager.ts`, `cli/studio/home/StudioNativePickerService.ts` (whose own
comment states "every OS command is run via execFile"), `cli/paths/PlatformDirectoryEnvironment.ts`. No
`child_process.exec(...)`/`{shell: true}` usage and no path-splitting-on-whitespace exists anywhere in `cli/` or
`src/`, so there is no shell-quoting hazard by construction for any path this CLI accepts, spaces included.
Likewise, no `isTTY`/`isatty` usage exists anywhere in `cli/` or `src/` (including `cli/studio/`,
`cli/studio-client/`), and neither `package.json` carries a spinner/interactive-prompt dependency (`ora`,
`inquirer`, `chalk`, `listr`, `cli-progress`) — the CLI's own output does not branch on terminal-ness at all.
These were previously true but unverified by any executable fixture; this step adds one.

**New this step (fast lane, real filesystem, no `npm install`/build needed):**

- `tests/cli/dispatch.test.ts`, `it.each` case `"prints identical usage output and exit code when %s"` — runs the
  real top-level dispatcher (`dispatch()`) under three `process.stdout.isTTY`/`process.stdin.isTTY` states (both
  `true`, both `false`, both `undefined` — the last is what a spawned child process with no controlling terminal
  actually has) and asserts byte-identical `--help` output and exit code across all three. Turns the "no `isTTY`
  usage exists" grep fact above into a pinned regression.
- `tests/cli/materialize/BlueprintProjectMaterializer.test.ts`, `"materializes identically when the source
  blueprint directory, cache root, and blueprint file name all contain spaces"` — a real `BlueprintProjectMaterializer`
  (fake `npm`/validator, real filesystem/cache-key/atomic-rename logic, same rationale as every other case in that
  file) materializing a blueprint whose source directory, blueprint file name, and cache root all contain a
  space, asserting the resulting runtime path/cwd carry the space through unmangled.
- `tests/cli/commands/ReplayCommand.test.ts`, `"loads a real game package and writes a replay artifact when both
  the package root and --out path contain spaces"` — `ReplayCommand` against a real, `loadPokieGame`-loaded fixture
  package copied into a space-containing directory, writing its `--out` artifact to a second space-containing
  path, asserting the same descriptor shape/content the existing non-spaced case already pins.

All three pass under direct Jest invocation (see "Method"); lint and typecheck are clean for the three files.

**Remaining gap, not closed by this step:** the space-path property above is now pinned for `dispatch()`,
materialization, and `pokie replay` specifically — it is *not yet* pinned by an executable fixture for `sim`,
`validate`, `serve`, `dev`, `inspect`, `client`, or any Studio server-side project-open route
(`loadProjectDashboardContext` and friends), nor for the `pokie-integration` lane's own real-`npm install` path
beyond `GamePackagePreparer`'s existing coverage (e.g. `BlueprintProjectMaterializer.integration.test.ts` has no
space-path case). Left to a future, not-yet-scheduled step — named here so it isn't silently dropped.

## 2. Materialization

`createMaterializingRuntimePackageResolver` (`cli/materialize/materializeRuntimePackage.ts:48-74`) resolves a
`packageRoot` via `ProjectTargetResolver`; an unrecognized path passes through untouched, a resolved `"tsPackage"`
passes through with its own `rootPath`, a resolved `"blueprint"` is materialized via `BlueprintProjectMaterializer`,
and any other resolved type the requested `operation` can't perform throws `UnsupportedProjectOperationError`
(`describeUnsupportedProjectOperation`) rather than reaching `loadPokieGame` with a path it could only fail
against confusingly.

`BlueprintProjectMaterializer.materialize()` (`cli/materialize/BlueprintProjectMaterializer.ts`) computes a
`cacheKey` from the blueprint (`~142`), checks `<cacheRoot>/<cacheKey>` for an existing `.pokie-materialized.json`
marker (`isReady`), and otherwise runs `materializeUnderLock`: `generate` (real `GamePackageGenerator`, pure/fast)
→ `dependencies` (`npm install`) → `verify` (`PokieGamePackageValidating`) → an atomic directory rename into the
final cache path, then `markReady`. A per-`cacheKey` file lock (`LOCK_HOLDER_FILE`, pid-liveness-based abandoned-
lock reclamation) coordinates concurrent `materialize()` calls racing the same blueprint; a marker-less leftover
cache directory (e.g. from a prior crash) is never trusted, always evicted and rebuilt.

**Executable:** `tests/cli/materialize/BlueprintProjectMaterializer.test.ts` (fast lane — fake `npm`/validator,
real filesystem/cache/lock logic; covers fresh materialize, cache reuse, blueprint-edit/version-change cache-key
changes, concurrent-lock races, abandoned-lock reclamation, failure/retry — plus this step's own space-path case,
§1) and `BlueprintProjectMaterializer.integration.test.ts` (`pokie-integration` project — real `npm install` +
real dynamic-`require` verify producing a genuinely loadable `dist/index.js`; not re-run in this sandbox, see
"Method"). `createMaterializingRuntimePackageResolver`'s own boundary tests live in the same file
(`describe("createMaterializingRuntimePackageResolver", ...)`).

No gap beyond §1's own space-path note was found in this surface's existing coverage.

## 3. Replay

`ReplayCommand` (`cli/commands/ReplayCommand.ts`) crosses the same materialization boundary as every other
runtime operation (§2) before ever calling `loadPokieGame`, then either replays a loaded game directly or, for a
resolved native-outcome-library/Stake Engine project, routes through the outcome-source replay selector instead
(never loading a game at all in that case). Underlying replay/fairness types live in `src/replay/`
(`ReplayDescriptor`, `ReplayRecorder`, `ReplayRecording`, `ReplayRecordingOptions`) and
`src/fairness/FairnessRoundProofVerifier.ts`.

**Executable:** `tests/cli/commands/ReplayCommand.test.ts` (option/error validation; a real `loadPokieGame` +
fixture-package integration describe block, including this step's own space-path case, §1; the materialization-
boundary describe block; the outcome-source-routing describe block, both stubbed and against a real outcome-
library bundle), `tests/replay/ReplayRecorder.test.ts`, `tests/pregenerated/PreGeneratedRoundReplayer.test.ts`,
`tests/project/replayOutcomeSourceProject.test.ts`. Studio's own replay surface:
`tests/cli/studio/replay/{StudioReplayExecutionService,InMemoryStudioReplayRepository,buildReplayDownload,
validateReplayRequest}.test.ts`, `tests/cli/studio-client/src/hooks/useReplayPoll.test.tsx`,
`.../domain/interpret/Replay.test.ts`, `.../components/project/ProjectDashboardPage.replayWorkflow.test.tsx`.

No gap beyond §1's own space-path note was found in this surface's existing coverage.

## 4. Player / browser acceptance

Studio's Play/runtime surface is `cli/studio-client/src/components/project/RuntimeTab.tsx` (client) backed by
`cli/studio/runtime/{StudioRuntimeManager,StudioRuntimeSessionView,StudioRuntimeStateView,RuntimeSessionClient,
validateRuntimeSpinRequest,validateRuntimeSessionRequest}.ts` (server). Coverage today is component/unit level
only — `tests/cli/studio-client/src/components/project/ProjectDashboardPage.runtimeWorkflow.test.tsx` and
`.runtimeSpin.test.tsx`, both React Testing Library against `jsdom`, never a real browser. Neither `package.json`
carries a `playwright`/`puppeteer` dependency, and no such import exists anywhere in the repo — there is no
browser-automation tooling in this codebase at all, only the manual-screenshot convention below.

The only established "real browser" evidence convention is [`phase2-browser-evidence/README.md`](phase2-browser-evidence/README.md):
a one-time manual pass (Chrome 138.0.7204.183, captured 2026-08-01) against a built `pokie studio` server, one
PNG + SHA-256 per route, explicitly scoped to *read-state* rendering only ("does not claim to have performed a
write action... those route/state/action transitions remain covered by the linked React Testing Library
fixtures"). This convention has **not been repeated since Phase 2** — no equivalent pass exists for anything
Phase 3 changed (most notably `P3-POLISH-20`'s Build/Export nav consolidation and the three legacy-route
migration-copy deep links it introduced, `pokie-phase3-inventory.md` §4).

**This step's own decision:** does not attempt a new browser-evidence pass itself. Producing one needs a real
built `pokie studio` server (`build-cli`, which needs `build-esm`/`build-cjs` first) and a real browser session —
neither is available in this sandbox (no compiled `dist/`, see "Method"), and reproducing Phase 2's pass with a
stale/hand-simulated substitute would misrepresent what was actually captured. Recorded here as a named, explicit
gap — not silently dropped — so a future step with real build/browser access closes it deliberately, the same way
`pokie-phase3-inventory.md`'s own "Owner steps" section named (rather than silently absorbed) every surface it
didn't itself change.

## 5. What Phase 3 implementation is retained

Every acceptance criterion `pokie-phase3-final-verification-report.md` closed is retained here as necessary
stabilization, unchanged and not reopened by this step:

- **CLI package-only/capability resolver + materialization boundary** (`pokie-phase3-inventory.md` §1,
  `P3-POLISH-03`/`08`/`09`) — `ProjectTargetResolver`/`describeUnsupportedProjectOperation` and
  `createMaterializingRuntimePackageResolver` (§2 above) remain the one crossing point every runtime CLI
  operation and Studio's Play runtime go through before `loadPokieGame`.
- **Generated-package file seam** (`pokie-phase3-inventory.md` §2-§3) — `GENERATED_PACKAGE_FILES` remains the
  single canonical list every consumer (`GamePackageGenerator`, `previewBuildDestination.ts`,
  `applyGameBlueprintToProject.ts`) reads from; no `src/generated/` nesting, build-info, or parallel Studio build
  workflow exists in current output (`pokie-phase3-final-verification-report.md` criterion 1).
- **Studio Build/Export nav consolidation** (`P3-POLISH-20`) — `ExportDeployTab`/`ExportDeployTargets.ts` remains
  the sole surface outcome-library generation, Stake Engine Export, and every registered
  `ExternalDeploymentTarget` are listed and reached from; `LEGACY_TAB_MIGRATION_COPY` remains the hidden-route-
  plus-migration-text handling for the three retired deep links (`deployment`, `stakeEngineExport`,
  `outcomeLibraries`) — this document's own §4 gap note above is about *screenshotting* this state, not about
  reopening it.
- **PAR sheet / outcome-library / Stake Engine surfaces** (`pokie-phase3-inventory.md` §5,
  `P3-POLISH-21`/`22`) — round-trip and workflow coverage cited there is unchanged; not re-derived here.
- **External Adapter SDK vs. Stake Engine architectural fork** (`pokie-phase3-inventory.md` §6, `v1.3-closeout-report.md`
  item 7) — remains a deliberate, intentional two-pipeline split, not reopened by `P3-POLISH-20`'s nav-only change
  and not reopened here.

No already-verified Phase 3 acceptance criterion is silently discarded, narrowed, or superseded by anything in
this document; every fact in this section is a pointer to where it's already frozen, not a re-derivation.

## 6. `pokie-examples` inventory: reusable vs. example-specific units

`pokie-examples` (`github.com/sta-ger/pokie-examples`, linked from this repo's own `README.md`/`docs/README.md`)
is a separate, external repository — there is no local checkout in this worktree or its parent directory (`../
pokie-examples` does not exist anywhere on this sandbox's filesystem), so this inventory was built from the
public repository's own file tree (`GET /repos/sta-ger/pokie-examples/git/trees/main?recursive=1`) and a handful
of representative files fetched over `raw.githubusercontent.com`: `src/ui/ui.ts`, `src/ui/utils.ts`, `src/data.ts`,
one bootstrap file (`src/simple-slot.ts`), one plain config (`src/games/simple-slot/index.ts`), and one bespoke
session (`src/games/slot-with-free-games/SwfgSession.ts`). This is a **file/export-level** inventory, not a
line-by-line audit — a future step that actually needs to modify `pokie-examples`' own shared code needs a real
local checkout first, not just this document.

**Repository shape:** nine example games under `src/games/<name>/`, each with a `<name>.html` entry point and a
`src/<name>.ts` bootstrap file at the repo root; three shared modules (`src/ui/ui.ts`, `src/ui/utils.ts`,
`src/data.ts`) every bootstrap file composes over its own game.

**Reusable (shared across all nine games, in `src/ui/`/`src/data.ts`):**

- `src/ui/ui.ts`'s `initializeUi()` — screen/grid table construction and styling, payline hover-highlight
  rendering, paytable table construction from a game's own paytable data, bet/play control wiring, free-games
  counter display, the one shared responsive breakpoint (a `≤480px` media query shrinking symbol font size, plus
  a Bootstrap max-width container), and the custom-scenario dropdown shell.
- `src/ui/utils.ts` — `drawReelsSymbols` (uniform *and* jagged/variable reel heights — i.e. already generic over
  growing-grid/megaways-style shapes, not simple-slot-only), `drawWinningLinesList`/`drawOutcome` (generic
  line/scatter/cluster/value/ways highlight rendering, not tied to any one win style), `setCountersValues`,
  `play`/`getAnyWin`/`getSymbolWin`/`getCustomScenario` (round-fetch-then-render orchestration).
- `src/data.ts` — the `AnyVideoSlotSession` union plus `initializeData`/`getInitialData`/`getRoundData`/
  `getSymbolWinData`/`getAnyWinData`/`getCustomScenarioData`: a generic "simulate until a condition holds" round-
  fetch layer, decoupled from any one game's mechanics.
- Each `src/<game>.ts` bootstrap file — thin composition (`initializeData(...)` + `initializeUi(...)`) wiring the
  shared layer to one game's own config; a reusable *pattern* instantiated once per game, not shared code itself.

**Example-specific (per game, under `src/games/<name>/`):**

- `*Config.ts` — each game's actual `VideoSlotConfig` built directly from this repo's own public exports
  (`VideoSlotConfig`, `LinesDefinitionsFor...`, `Paytable`, line-pattern presets, `SymbolsSequence`) — reel
  count/rows, symbol set, paylines, paytable, available bets, all authored per game.
- `*Session.ts`/`*WinCalculator.ts`/`*CombinationsGenerator.ts` — present only for the games needing bespoke
  mechanics beyond the framework defaults (`slot-with-free-games`, `slot-with-sticky-respin`,
  `cascading-cluster`), and even these are thin decorations, not parallel reimplementations: `SwfgSession`
  `extends VideoSlotWithFreeGamesSession` (imported from `"pokie"`, i.e. this repo's own already-reusable class
  documented in [`free-games.md`](free-games.md)) and overrides only `play()`, toggling free-games mode once the
  awarded-vs-used free-game count diverges.
- `index.ts` — composes a game's `Config` + POKIE session/serializer + any custom scenario definitions into the
  shape each bootstrap file expects.
- `<name>.html` — per-game HTML shell (one per README demo link).

**Classification against the requested axes:**

| Axis | Reusable | Example-specific |
|---|---|---|
| Screen/grid | `drawReelsSymbols`/table construction (`ui.ts`/`utils.ts`) — already generic over uniform and jagged/growing grids | reel/row counts, symbol set (`*Config.ts`) |
| Paylines | hover-highlight rendering (`ui.ts`) | which `LinesDefinitions`/pattern a game picks (`*Config.ts`, itself built from this repo's [paylines-and-patterns.md](paylines-and-patterns.md) primitives) |
| Highlights | `drawWinningLinesList`/`drawOutcome` generic line/scatter/cluster/value/ways rendering (`utils.ts`) | which win types actually populate, driven by each game's own paytable/evaluator choice |
| Paytable | table construction (`ui.ts`) | paytable data itself (`*Config.ts`) |
| Bets/modes | counters/controls wiring (`ui.ts`/`utils.ts`) | bet values/modes (`*Config.ts`, this repo's own `availableBets`/`BetMode` contract) |
| Feature/session flow | generic session union + round-fetch loop (`data.ts`) | bespoke session subclasses for the 3 feature games, each a thin decorator over this repo's own already-reusable session classes ([free-games.md](free-games.md), [resizable-grid.md](resizable-grid.md)) |
| Responsive | the one shared breakpoint (`ui.ts`) | none — not per-game |

## Owner steps

Named here as explicit, not-yet-scheduled gaps this step's own audit surfaced — none are closed by this step,
and none should be silently absorbed into a later step without being checked against this list first:

- **CLI paths-with-spaces/non-TTY coverage** beyond `dispatch()`/materialize/replay (§1) — `sim`, `validate`,
  `serve`, `dev`, `inspect`, `client`, and Studio's server-side project-open routes still have no dedicated
  space-path regression, and no lane here has non-TTY coverage beyond `dispatch()` itself.
- **Integration-lane (real `npm install`) space-path coverage** for materialization
  (`BlueprintProjectMaterializer.integration.test.ts`) and package preparation beyond
  `GamePackagePreparer.integration.test.ts`'s own existing case.
- **Player/browser acceptance evidence** (§4) — a fresh `docs/phase2-browser-evidence`-style manual pass covering
  every Studio route Phase 3 changed, requires a real `build-cli` + browser session this sandbox cannot produce.
- **`pokie-examples` deeper coupling audit** (§6) — this inventory is file/export-level; a real local checkout and
  a line-level read of `src/ui/`'s own contract with each game's `*Config.ts` is needed before any step attempts
  to change `pokie-examples`' shared code itself.

Naming these here reserves them as a future step's own responsibility rather than letting a later step either
silently re-derive them from scratch or, worse, quietly skip them because nothing on record named them as open.
