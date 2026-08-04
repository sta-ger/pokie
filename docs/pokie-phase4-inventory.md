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
not through `npm test`: this sandbox's `npm` (`/usr/local/bin/npm`, provisioned outside this worktree/repo) is a
`dash` script that raises a syntax error on every invocation, independent of anything in this repository — an
environment/tooling defect outside this worktree, not a fact about POKIE's own source, flagged here only so a
reader isn't confused about why citations below name a direct Jest invocation instead of `npm test -- <file>`.
The exact failing line number and wrapper contents are sandbox-provisioning-specific and have been observed to
differ between rounds (a malformed generated `case` pattern on the wrapper's own line 9 was the specific cause
reproduced for this round — see [`phase4-evidence/npm-wrapper-repro.txt`](phase4-evidence/README.md) for the full
transcript and wrapper source); the underlying fact this section relies on — direct Jest invocation is necessary
because `npm test -- <file>` itself cannot run — has held across every round that has hit it. The direct
invocation runs the identical project/worker configuration `npm test -- <file>`
would have, scoped to the same named file(s); no project-wide gate (`check:fast`/`check:full`/`check:release`,
`--selectProjects` beyond the two `npm test` itself already selects) was run. Lint (`node node_modules/.bin/eslint
<file>`) and typecheck (`node node_modules/typescript/bin/tsc --noEmit -p tsconfig.typecheck.json`) were run the
same way, for the same reason. As in `pokie-phase3-final-verification-report.md`'s own "Method" section, this
sandbox has no compiled `dist/` and cannot run the integration/workflow/packaging lanes or `build-cli` — where a
claim below depends on one of those, it says so explicitly rather than presenting it as re-verified here.

Raw transcripts backing this section and §4/§6 below — including a reproduction of the `npm` wrapper's own
syntax error, a from-source verification that no browser binary or automation tooling exists anywhere in this
sandbox, and the targeted-fixture run itself — are saved under
[`phase4-evidence/`](phase4-evidence/README.md), the same reproducible-artifact convention
`phase2-browser-evidence/` established for its own (visual) evidence pass.

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
validateRuntimeSpinRequest,validateRuntimeSessionRequest}.ts` (server). This section separates two evidence
layers the prior baseline of this document conflated: real, non-mocked **Studio-server** (HTTP API) evidence,
which already exists and is substantial, and real **browser** (visual/DOM-rendering) evidence. The original
implementer sandbox could not provide the latter; this recovery completes it on the browser-capable host and
records the exact built artifact and captures below.

**Studio-server evidence (real, not mocked, exists today):** `tests/cli/studio/StudioServer.test.ts` (4522
lines, `pokie-integration` project, `jest.config.mjs:12`) instantiates a real `http.createServer`-backed
`StudioServer` and drives it with real `fetch()` calls (`get`/`post`/`del` helpers at the top of the file) against
its actual listening port — not RTL/`jsdom`, not a stubbed transport. It covers Home/Open Project,
Blueprint/Design, Simulation, Replay, Runtime, Export/Deploy, and every other Studio HTTP route this document's
other sections reference. The prior baseline's claim that "coverage today is component/unit level only" was
inaccurate for the server layer specifically — corrected here by direct read of the file (confirmed present,
confirmed real-HTTP by its own `get`/`post`/`del` helpers and `http`/`fetch` imports), not by executing it: it
lives in the `pokie-integration` project alongside real-`npm install` fixtures, the same orchestrator-owned
integration lane `pokie-phase3-final-verification-report.md`'s own "Method" section already established this
sandbox doesn't run (see this document's own "Method" above). It has **no dedicated space-path or non-TTY
case** (verified: no match for `with space`/`isTTY`/`isatty` in the file) — already named as a gap in "Owner
steps" below, unchanged by this step.

**Browser (visual/DOM-rendering) evidence — real host pass, 2026-08-05:** the component-level (jsdom, never a
real browser) coverage remains
`tests/cli/studio-client/src/components/project/ProjectDashboardPage.runtimeWorkflow.test.tsx` and
`.runtimeSpin.test.tsx`. The host has Google Chrome `138.0.7204.183`; from this preserved task clone it built
`build-esm`, `build-cjs`, and `build-cli`, started the resulting `dist/cli/pokie.js studio` server, waited for
the real HTTP project-context response, and captured 1440×1100 headless Chrome PNGs after five seconds of
virtual time. The screenshots and SHA-256 values are in
[`phase4-evidence/browser/`](phase4-evidence/README.md); they are not jsdom or mocked transport evidence.

The capture uses two real inputs. First, a random Blueprint located at
`/tmp/p4 studio evidence.hGuacz/Blueprint With Spaces.blueprint.json` confirms that Studio accepts a source path
with spaces and honestly remains in `Loading project…` while the current Blueprint materialization path is
pending. Second, a loadable package fixture at
`/tmp/p4 studio evidence.hGuacz/Studio Package With Spaces` (with the current built POKIE made available through
its local runtime dependency) returns `{status:"loaded", type:"tsPackage", capabilities:["runtime.execute"]}`
from the actual Studio HTTP API. Its Overview screenshot shows the space-containing location and valid package
metadata; Replay visibly exposes the current Recreate from seed / Replay Artifact / Session Spin / Recent
Simulation split and its best-effort reproduction copy; Runtime visibly exposes the current technical server,
session, inspect and debug panel. This is baseline evidence of the current product, not a claim that any of
those Stage 4 behaviours are already acceptable.

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
is a separate, external repository. The initial audit read a real clone rather than representative remote files;
this correction round re-clones `develop` directly from this worktree (this sandbox has network egress to
`github.com`) and verifies it is clean and exactly at `origin/develop`, commit
`af432206a435db5c1063ca5cd9dd81652b886a6e` (2026-07-09), before treating its source as the canonical baseline —
also catching and fixing a prior-round inconsistency where the checkout transcript actually recorded the
*default* (`main`) branch at a different commit while this prose already claimed `develop`. Both branches'
`src/` trees are byte-identical, so no classification below changed; the transcript, complete `src/**/*.ts` file
tree, and five source spot-checks re-confirming this section's claims are retained at
[`phase4-evidence/pokie-examples-checkout.txt`](phase4-evidence/README.md). Later player work must resync the
checkout again before changing it.

**Repository shape:** nine example games under `src/games/<name>/` — `simple-slot`, `growing-grid`,
`megaways-style`, `mixed-evaluators`, `value-pay-multiplier`, `verifiable-spin`, `slot-with-free-games`,
`slot-with-sticky-respin`, `cascading-cluster` — each with a `<name>.html` entry point and a `src/<name>.ts`
bootstrap file (10-11 lines each, confirmed by direct read of `src/simple-slot.ts` and siblings) at the repo
root; three shared modules (`src/ui/ui.ts` 282 lines, `src/ui/utils.ts` 305 lines, `src/data.ts` 90 lines) every
bootstrap file composes over its own game. A tenth file, `src/index-illustrations.ts` (233 lines), draws
procedural SVG grid-shape icons for the `index.html` landing page only — not part of any individual game.

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
  fetch layer, decoupled from any one game's mechanics. Reading the actual checkout (rather than a representative
  sample) surfaced a shared extension point the prior remote-sampled version of this section missed entirely: an
  `onAfterRoundPlayed` hook (`data.ts:24`, set via `initializeData`'s 4th argument, invoked from `getRoundData`/
  `getSymbolWinData`/`getAnyWinData`/`getCustomScenarioData` after every round) that "lets a game's own `index.ts`
  render round state the generic serializer doesn't know about... without every game forking `data.ts`/`ui.ts`"
  (the source's own comment, `data.ts:22-23`). Three of nine games use it — `growing-grid` (current grid height),
  `cascading-cluster` (per-cascade-step accordion breakdown), `verifiable-spin` (seed/audit-trail panel) — each
  via an `afterRoundPlayed` export from its own `index.ts`, none forking the shared UI/data layer to do it.
- Each `src/<game>.ts` bootstrap file — thin composition (`initializeData(...)` + `initializeUi(...)`) wiring the
  shared layer to one game's own config; a reusable *pattern* instantiated once per game, not shared code itself.

**Example-specific (per game, under `src/games/<name>/`):**

- `*Config.ts` — every game's actual `VideoSlotConfig`/`VideoSlotWithFreeGamesConfig` built directly from this
  repo's own public exports (`VideoSlotConfig`, `LinesDefinitionsFor...`, `Paytable`, line-pattern presets,
  `SymbolsSequence`) — reel count/rows, symbol set, paylines, paytable, available bets, all authored per game.
- `index.ts` — composes a game's `Config` + a combinations generator + a win calculator + POKIE session/
  serializer + any custom scenario definitions into the shape each bootstrap file expects, plus (for 3 games)
  the `afterRoundPlayed` hook above. Read from source, the nine games split into two genuinely different tiers,
  which the prior remote-sampled version of this section did not distinguish (it examined only `simple-slot` and
  named-checked the rest generically):
  - **Six games are pure composition of built-in `pokie` primitives — no custom class at all.** `simple-slot`
    (`VideoSlotSession` + default `VideoSlotWinCalculator`), `growing-grid`
    (`ResizableSymbolsCombinationsGenerator` + `VideoSlotWithResizableGridSession` wired to a
    `GridResizeHandling` callback), `megaways-style` (`VariableHeightSymbolsCombinationsGenerator` +
    `WaysWinCalculator` + `SelectedEvaluatorGroupWinAggregationPolicy`), `mixed-evaluators` (lines + ways +
    clusters on the same grid via `HighestWinOnlyAggregationPolicy`), `value-pay-multiplier` (`ValueWinCalculator`
    + `MultiplierResolver` via `SumAllEnabledWinAggregationPolicy`), `verifiable-spin`
    (`SeededRandomNumberGenerator` wrapped by a local call-counting decorator, for reproducible-replay proof, not
    a `pokie`-exported class).
  - **Three games add bespoke classes beyond configuration — and these differ in scope from each other,
    correcting the prior version's blanket "thin decorations, not parallel reimplementations" characterization**:
    - `slot-with-free-games`: `SwfgSession extends VideoSlotWithFreeGamesSession` (imported from `"pokie"`,
      documented in [`free-games.md`](free-games.md)) overriding only `play()` to toggle free-games mode — this
      one genuinely is a thin decorator, as the prior version described. It's paired with
      `SwfgSessionWinCalculator extends VideoSlotWinCalculator`, which the prior version's own file sample
      (`SwfgSession.ts` only) did not cover — it doubles winning-line/scatter amounts while free-games mode is
      active by wrapping `getWinningLines()`/`getWinningScatters()`.
    - `slot-with-sticky-respin`: three bespoke classes, not one — `SwsrSession extends
      VideoSlotWithFreeGamesSession` (re-spin/sticky-symbol/credit bookkeeping), `SwsrCombinationsGenerator
      extends SymbolsCombinationsGenerator` (overlays sticky symbol positions onto each new combination), and
      `SwsrWinCalculator extends VideoSlotWinCalculator` (exposes winning-symbol grid positions the base class
      doesn't). All three still build only on public `pokie` base classes/exports.
    - `cascading-cluster`: `CascadingClusterWinCalculator implements VideoSlotWinCalculating` **directly rather
      than extending `VideoSlotWinCalculator`** — the largest departure from a thin decorator in the whole repo.
      It wraps `pokie`'s own `CascadingSpinResolver`/`ClusterWinEvaluator`/`WinEvaluationPipeline` to run
      "evaluate → remove winning cluster → collapse/refill → repeat" and layers a game-specific escalating
      per-cascade-step multiplier (`x1, x2, x3...`) on top, entirely in ~100 lines against `pokie`'s own public
      exports — still not a parallel reimplementation of framework internals, but materially more than the
      `SwfgSession`-style one-method override the prior version of this section generalized to all three bespoke
      games.
- `<name>.html` — per-game HTML shell (one per README demo link).

**Classification against the requested axes:**

| Axis | Reusable | Example-specific |
|---|---|---|
| Screen/grid | `drawReelsSymbols`/table construction (`ui.ts`/`utils.ts`) — already generic over uniform and jagged/growing grids | reel/row counts, symbol set (`*Config.ts`) |
| Paylines | hover-highlight rendering (`ui.ts`) | which `LinesDefinitions`/pattern a game picks (`*Config.ts`, itself built from this repo's [paylines-and-patterns.md](paylines-and-patterns.md) primitives) |
| Highlights | `drawWinningLinesList`/`drawOutcome` generic line/scatter/cluster/value/ways rendering (`utils.ts`) | which win types actually populate, driven by each game's own paytable/evaluator/aggregation-policy choice (`index.ts`) |
| Paytable | table construction (`ui.ts`) | paytable data itself (`*Config.ts`) |
| Bets/modes | counters/controls wiring (`ui.ts`/`utils.ts`) | bet values/modes (`*Config.ts`, this repo's own `availableBets`/`BetMode` contract) |
| Feature/session flow | generic session union, round-fetch loop, and the `onAfterRoundPlayed` extension hook (`data.ts`) | for 6 of 9 games, pure config/primitive composition, no custom class; for the other 3, bespoke classes of varying scope (`SwfgSession`'s one-method override up through `CascadingClusterWinCalculator`'s from-scratch pipeline), all still built only on this repo's own public exports ([free-games.md](free-games.md), [resizable-grid.md](resizable-grid.md)) |
| Responsive | the one shared breakpoint (`ui.ts`); confirmed by grep no per-game `.html`/`.ts` file defines its own `@media`/`viewport` rule | none — not per-game |

## Owner steps

Named here as explicit, not-yet-scheduled gaps this step's own audit surfaced — none are closed by this step,
and none should be silently absorbed into a later step without being checked against this list first:

- **CLI paths-with-spaces/non-TTY coverage** beyond `dispatch()`/materialize/replay (§1) — `sim`, `validate`,
  `serve`, `dev`, `inspect`, `client`, and Studio's server-side project-open routes still have no dedicated
  space-path regression, and no lane here has non-TTY coverage beyond `dispatch()` itself.
- **Integration-lane (real `npm install`) space-path coverage** for materialization
  (`BlueprintProjectMaterializer.integration.test.ts`) and package preparation beyond
  `GamePackagePreparer.integration.test.ts`'s own existing case.
- **Final player/browser acceptance matrix** — §4 now contains a real host-side baseline capture for the
  Blueprint/materialization, Overview, Replay and Runtime decision surfaces, including space-containing paths.
  P4-POLISH-13 must expand that into the final post-implementation matrix (Play, player interactions, features,
  reconnect/error, responsive/narrow screen and every changed route). The historical implementer sandbox's
  browser/build constraint remains recorded in [`phase4-evidence/`](phase4-evidence/README.md), but it is no
  longer a blocker for this baseline step. Real Studio-server HTTP coverage remains in
  `tests/cli/studio/StudioServer.test.ts` (§4).
- **This sandbox's own `npm` wrapper is broken independent of anything in this repository** (§4,
  [`phase4-evidence/npm-wrapper-repro.txt`](phase4-evidence/README.md)): a malformed generated `case` pattern
  makes `dash` reject the wrapper script itself before any of its own policy logic runs, for every invocation.
  Not this document's or this repo's own defect to fix (the wrapper lives outside this worktree, provisioned by
  the orchestrator), but worth flagging to whoever owns that provisioning so a future correction round isn't
  stuck re-discovering the same root cause.
- **CLI/Studio-server paths-with-spaces/non-TTY coverage on the Studio HTTP surface itself** — confirmed absent
  by direct read of `tests/cli/studio/StudioServer.test.ts` (§4): no space-path or `isTTY`/`isatty` case exists
  there, even though §1 now covers `dispatch()`/materialize/replay at the CLI-argument layer.
- **`pokie-examples` deeper coupling audit beyond this step's own re-audit** (§6) — this step replaced the prior
  file/export-level, remote-sampled inventory with one read from a real synced `develop` checkout (pinned at
  commit `af432206a435db5c1063ca5cd9dd81652b886a6e`), but a line-level read of `src/ui/`'s own contract with each
  game's
  `*Config.ts` (e.g. exactly which `VideoSlotConfig` fields `initializeUi`/`drawReelsSymbols` silently assume
  exist) is still needed before any step attempts to *change* `pokie-examples`' shared code itself, and that
  checkout should be re-cloned at its own current `HEAD` rather than assumed still current.

Naming these here reserves them as a future step's own responsibility rather than letting a later step either
silently re-derive them from scratch or, worse, quietly skip them because nothing on record named them as open.
