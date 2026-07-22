# Running the test suite

This file is for people working on POKIE itself (contributors), not for consumers of the `pokie`
npm package — see [`docs/README.md`](README.md) for the library's own API reference.

## Lanes

| Command | What it runs | Coverage | When to use it |
|---|---|---|---|
| `npm test` / `npm run check:fast` | Unit + component tests only (`pokie` + `studio-client-components` Jest projects) | off | Everyday dev loop |
| `npm run check:full` | `check:fast` + a full `tsc --noEmit` typecheck + `pokie-integration` + `studio-client-workflows` | off | Before opening a PR |
| `npm run check:release` | lint + typecheck + every test **with coverage** + the real `npm pack`/install smoke test (`pokie-packaging`) | on | Pre-publish gate (`.github/workflows/publish.yml` runs this instead of `npm test`) |
| `npm run test:integration` | Just the `pokie-integration` lane | off | Iterating on integration/server/worker tests specifically |
| `npm run test:workflows` | Just the `studio-client-workflows` lane | off | Iterating on the heavy Studio workflow/navigation-guard/poll-hook tests specifically |
| `npm run test:coverage` | `pokie` + `studio-client-components` + `pokie-integration` + `studio-client-workflows`, with `--coverage` | on | Checking coverage without also paying for the packaging smoke test |
| `npm run test:packaging` | Just `tests/packaging/npmPackSmoke.test.ts` (real `npm pack` → install → spawn) | n/a | Verifying the published package boundary in isolation |
| `npm run test:report -- --lane <fast\|full\|release>` | Runs that lane through `jest --json` and prints the slowest suites + lane wall time | n/a | Diagnosing a performance regression |

`npm test` no longer collects coverage or runs the packaging smoke test by default — both still
exist, just behind their own commands (`test:coverage`, `test:packaging`, both folded into
`check:release`), so nothing that used to be verified stopped being verified. As of this pass,
`check:fast`/`check:full`/`check:release` are all genuinely green — nothing is documented here as a
known-red gate; see "Fixed in this pass" below for what previously was.

### Why five Jest projects

- **`pokie`** — the default fast lane: unit/component tests for individual classes, transpile-only
  (`isolatedModules`, see below), no coverage instrumentation.
- **`studio-client-components`** — React/jsdom component tests for the Studio frontend that measured
  fast (roughly under ~11s each) — same transpile-only treatment.
- **`studio-client-workflows`** — the React/jsdom tests that measured heavy (roughly 15s+ each via
  `npm run test:report`): Studio workflow pages (simulation/replay/runtime/mechanics-editor), the
  navigation-guard/confirm-modal tests, the Reel Strip Modeler/PAR-sheet-import validation tests, and
  the two poll-hook tests that directly exercise production `useSimulationPoll`/`useReplayPoll`'s
  real 500ms recursive `setTimeout` loop. That real-timer behavior is deliberate (these tests
  specifically verify real cleanup/cancellation semantics — a timer actually cancelled on unmount, a
  stale response actually discarded — which `jest.useFakeTimers()` can't verify the same way, since
  it executes callbacks synchronously instead of racing real async work), so these were moved to
  their own lane rather than rewritten. Runs with `--maxWorkers=2` like everything else — `--runInBand`
  was tried first and rejected: serializing all 22 files pushed the run past 20+ minutes for no
  correctness benefit; `--maxWorkers=2` finished in ~445s across three consecutive runs, all green.
- **`pokie-integration`** — anything that spins up a real HTTP server (`PokieDevServer`,
  `PokieClientServer`, `StudioServer`), real `worker_threads` (`simulationWorkerEntry`, and the
  extracted `*.realWorkers.test.ts` files below), or does heavy real filesystem I/O
  (`GamePackageGenerator`, 45 real generated-package writes). These files were picked by measuring
  what they actually do, not by size or directory name — several genuinely large files
  (`SpinCommandHandler*.test.ts`, `SpinReconciliationService.test.ts`, `SimulationReportBuilder.test.ts`)
  are pure in-memory logic tests and stayed in the fast `pokie` lane.
- **`pokie-packaging`** — `tests/packaging/npmPackSmoke.test.ts` alone. It runs a real
  `npm pack` (which triggers the full `prepack` → `npm run build` lifecycle), installs the tarball
  into a temp directory, and spawns the installed CLI as a real child process. 5-minute budget by
  design — this is the one test that's intentionally kept real, end-to-end, and slow, because it's
  the only thing that actually proves the published dual CJS/ESM package + CLI works. It never runs
  as part of `check:fast`/`check:full`.

Every heavy-file lane assignment above was decided from real measurement (`npm run test:report`),
not guessed from file size or naming — see "Fixed in this pass" for the specific numbers that drove
the `studio-client-workflows` split.

### Extracted `*.realWorkers.test.ts` files

`StudioSimulationService.test.ts` and `SimCommand.test.ts` each used to mix fast, in-process tests
with a `describe` block that spins up real `worker_threads`. Those blocks were extracted verbatim
into `StudioSimulationService.realWorkers.test.ts` / `SimCommand.realWorkers.test.ts` so the
file-level lane split (`pokie` vs. `pokie-integration`) doesn't require running the whole original
file in the slow lane just because one `describe` block in it is heavy.

While extracting `StudioSimulationService.realWorkers.test.ts`'s cancellation test, its
`rounds: 5_000_000` + blind `setTimeout(resolve, 50)` before cancelling was replaced with the same
event-driven "wait for the first progress tick" poll the test right above it already used, at
`rounds: 200_000`. The 5M round count only existed to make "still running after a guessed 50ms
delay" a safe bet; polling for real progress removes the guess (and the flakiness risk that comes
with guessing wrong under load) while still genuinely exercising real-worker-thread cancellation —
nothing about what the test verifies got weaker.

These tests (plus `simulationWorkerEntry.test.ts`) also needed a fixture-resolution fix — see
"Fixed in this pass" below.

## TypeScript in tests: transpile-only, checked once

Tests run through ts-jest with `tsconfig.test.json` (`isolatedModules: true`, plus a
`module: "commonjs"` override — `tsconfig.prod.json`'s `module: "node16"` isn't what ts-jest's
usual auto-CJS-override recognizes when `isolatedModules` bypasses that codepath, so it has to be
set explicitly here). This skips full type-checking per file; full type-checking across the whole
program (`src`, `tests`, `cli`, excluding the `cli/studio-client`/`tests/cli/studio-client` React
subtree, which needs its own JSX/bundler-resolution tsconfig and is unaffected either way — see
below) happens once via `npm run typecheck` (plain `tsc --noEmit -p tsconfig.typecheck.json`), part
of `check:full`/`check:release`, never part of the fast per-file transform.

The `cli/studio-client` exclusion doesn't drop any verification that existed before this pass:
`studio-client-components`'s ts-jest project already had `isolatedModules: true` set in its own
`cli/studio-client/tsconfig.json` prior to this change (nothing here turned type-checking off for
it — it was already transpile-only), and `typecheck-studio-client` (pre-existing, unchanged) covers
the frontend *source* under its own tsconfig. Running the root `tsconfig.json` whole-program check
over that subtree fails outright (wrong `jsx`/`moduleResolution` for it), which is a pre-existing
gap in how thoroughly the `.tsx` test files themselves get type-checked, not something this pass
introduced or is in scope to fix.

`isolatedModules` itself is set in `tsconfig.test.json`'s `compilerOptions`, not as a ts-jest
transform option — the latter is the deprecated form that prints the ts-jest "isolatedModules
should be enabled via tsconfig" advisory once ts-jest notices it configured that way (this is what
used to surface as noisy warnings before this change).

## Import convention: direct imports for new unit tests

`src/index.ts` is an auto-generated barrel (`generate-barrels.js`) re-exporting everything under
`src/` (600+ exports). A unit test importing a single class `from "pokie"` forces ts-jest to
resolve/load the entire barrel graph just to get that one class — measured directly on one file
(`DefaultVideoSlotSessionWinCalculator.test.ts`, 36 tests): barrel import cost roughly **6x** the
wall time of a direct import, independent of and additive to the isolatedModules/no-coverage
savings above.

**Convention for new unit tests:** import directly from the class's own source file
(`import {Foo} from "../../../src/some/path/Foo.js"`), not `from "pokie"`. The one deliberate
exception is `tests/packaging/npmPackSmoke.test.ts`, which imports `from "pokie"` on purpose — it's
verifying the installed package's own barrel/dual-build boundary, not a single class.

This is not (yet) enforced by an ESLint rule — retrofitting `no-restricted-imports` now would need
an exceptions list for the ~200 existing test files that still import via the barrel and haven't
been migrated (not worth the churn). New tests should follow the convention above; existing files
get migrated opportunistically, prioritizing whichever files show up as slow in
`npm run test:report`.

## `maxWorkers`

`test`/`test:integration`/`test:workflows`/`test:coverage` pin `--maxWorkers=2` instead of Jest's
CPU-based default, picked by measuring the heaviest jsdom subset at 2/3/4 workers on this project's
reference environment (4 CPUs, ~8GB RAM, swap already in active use at idle):

| `maxWorkers` | Wall time | Result |
|---|---|---|
| 2 | 133s | all pass |
| 3 | 130s | 1 failed (contention-induced `waitFor` timeout) |
| 4 | 148s | 1 failed (contention-induced `waitFor` timeout, and slower than 2) |

3 and 4 workers are not just no faster — they actively introduce flakiness (a real-timer-dependent
`waitFor` assertion misses its window under CPU contention) that 2 workers doesn't. The plain
TypeScript unit tests (`pokie` project alone) show closer to a wash across worker counts (~53-57s
either way on this box), so the jsdom/React lanes are what actually justify pinning at 2 rather
than leaving it to Jest's auto-scaling default — which is also what produced the baseline run's
spurious timeouts below. `test:workflows` specifically was also tried with `--runInBand` (fully
serial, no worker contention at all) — rejected because it pushed the full 22-file lane past 20+
minutes; `--maxWorkers=2` finished in ~445s across three consecutive green runs instead.

## Baseline (before this stabilization pass)

Measured on `develop` before any of the above changes, full `npm test` (single undifferentiated
Jest run: full per-file type-checking, coverage always on, `npmPackSmoke` mixed into the same run):

- Cold (`rm -rf node_modules/.cache && npm test`): **1253s** Jest-reported time (**~23m22s** wall
  clock including `/usr/bin/time`'s own overhead), 330 test suites, 4057 tests.
- Peak RSS: **~1.92GB**; CPU utilization ~229% (Jest's own default worker-count heuristic on a
  4-CPU box).
- 11 suites / 35 tests failed on real timeouts (45s/15s budgets exceeded) purely from CPU
  contention under that default worker count — not genuine regressions, and a direct motivation for
  pinning `maxWorkers` instead of leaving it to auto-scale.
- Single representative file benchmark (`DefaultVideoSlotSessionWinCalculator.test.ts`, 36 tests,
  barrel import, full type-check, coverage on): **71s**.

## What each optimization contributed (same file, isolated)

Measured by re-running `DefaultVideoSlotSessionWinCalculator.test.ts` alone after each change:

| Configuration | Time |
|---|---|
| Baseline (barrel import, full type-check, coverage on) | 71s |
| + `isolatedModules`, coverage off (still barrel import) | 44s |
| + direct imports (isolatedModules, coverage off) | **7s** test time / 14.6s wall |

Removing the barrel import was the single largest contributor once coverage/full-type-checking
were already off — about 6x on its own, ~90% total reduction from the original baseline for this
file.

## After: final numbers, all lanes green

- `npm test` / `check:fast` (`pokie` + `studio-client-components`): **~72-75s** Jest time /
  **~2m15-21s** wall, 289 suites, 3471 tests, **0 failures**, consistent across repeated runs. Down
  from 509.6s/9m40s after the first pass, and 1253s/23m22s from the original undifferentiated
  baseline.
- `npm run typecheck`: **23.6s**, clean.
- `npm run test:integration` (`pokie-integration`, 20 suites, 385 tests): **~28-36s**, **all green**
  across 5 consecutive runs (see "Fixed in this pass").
- `npm run test:workflows` (`studio-client-workflows`, 22 suites, 198 tests): **~443-446s**, **all
  green** across 3 consecutive runs.
- `npm run test:packaging` (real build → pack → install → spawn): **~167-222s**, **all 3 tests
  green** across repeated runs (see "Fixed in this pass").
- `npm run check:release` (lint + typecheck + full coverage run + packaging): **all green**
  end-to-end. Lint: 0 errors / 40 pre-existing warnings. Typecheck: clean. `test:coverage`: 331
  suites / 4054 tests, **0 failures**, 93.67% statement coverage. `test:packaging`: 3/3 tests green
  (190.5s, real build → pack → install → spawn).

### Why `npm test` dropped from 509.6s to ~74s, not just from moving 7 files

The first attempt moved only the 4 `ProjectDashboardPage.*Workflow.test.tsx` files + 2 poll-hook
tests + `happyPath.test.tsx` (the ones a static/grep-based read suggested were heaviest) and barely
moved the needle (509.6s → 490s) — real per-file profiling via `npm run test:report` showed the
actual heaviest files were mostly *different* ones the initial read missed entirely:
`BlueprintEditorPage.reelStripModeler.test.tsx` (93.9s), `openProjectGuard.test.tsx` (86.0s),
`designNavigationGuard.test.tsx` (85.0s), `BlueprintEditorPage.validation.test.tsx` (80.1s),
`navigationGuardModal.test.tsx` (67.7s), `HomePage.test.tsx` (62.8s), and several more
`*Workflow.test.tsx`/`BlueprintEditorPage.*` files at 30-51s each — none of these were flagged by
grepping for `setTimeout`/`waitFor` patterns, because their cost comes from real RTL interaction
sequences (confirm-modal flows, stale-response guards), not an isolated delay constant. Moving all
15 of these (measured ≥~15s) into `studio-client-workflows` alongside the original 7 (22 files
total) is what actually got `npm test` down to ~74s. Lesson: for this class of problem, measure
real per-file runtime before deciding what to move — grep-based heuristics on delay values
substantially under-identified the actual cost.

## Fixed in this pass (previously documented here as known-red gates)

**`ProjectDashboard.test.ts`'s stale `blocking` expectation.** `describeValidationSummary` has
always correctly returned a `blocking: boolean` field since commit `d61db4e`; one test predating
that commit never got updated. Fixed by adding `blocking: false` to its expected object — no
production behavior changed.

**`npmPackSmoke.test.ts`'s `JSON.parse` failure.** Root cause: `npm pack` runs `prepack` → `npm run
build` → `prebuild` → `npm run lint` first, and ESLint prints its (pre-existing, `warn`-level)
output to stdout — the same stream `npm pack --json`'s own JSON array uses, corrupting the parse.
Fixed entirely inside the test's `beforeAll`: run `npm run build` explicitly first, then
`npm pack --json --ignore-scripts` (skips `prepack`/`postpack`, harmless since the build is already
fresh) so the captured stdout is only npm's JSON. No production `lint`/`build`/`prepack` script
changed. This also surfaced a second, previously-hidden pre-existing bug once the JSON parsing
stopped masking it: the test's first case asserted fixed `/main.js`/`/style.css` asset paths, which
predate the Studio frontend's migration to a real Vite build with content-hashed filenames. Fixed by
parsing the actual served `index.html` for its real `<script src>`/`<link href>` paths instead of
hardcoding them.

**Real-worker `Cannot find module 'pokie'`.** This was 100% deterministic, not flaky: the fixture
game packages under `tests/cli/fixtures/*/` each do a bare `require("pokie")` (deliberately, to
simulate a real external game package), but nothing in a fresh checkout provides a resolvable
`node_modules/pokie` for that specifier inside a real `worker_thread` (a fresh Node realm that never
goes through ts-jest's `moduleNameMapper`) — Node's self-reference resolution only fires when the
*nearest ancestor* `package.json` is itself named `"pokie"`, and each fixture's own `package.json`
is named after the fixture, not `"pokie"`. Fixed by `tests/cli/fixtures/ensureFixturesCanRequirePokie.ts`,
which creates a real `tests/cli/fixtures/node_modules/pokie` directory symlink to the repo root
(building `dist/cjs` on demand first if missing) — called from `testWorkerEntryUrl.ts` (covering the
3 real-worker unit test files) and from `npmPackSmoke.test.ts`'s `beforeAll` (covering its
installed-package worker test, a separate code path). The fixtures' own `require("pokie")` and
`SimulationWorkerCoordinator.ts`/`simulationWorkerEntry.ts` (already using fully-resolved absolute
paths) were untouched. Verified deterministic: `pokie-integration` passed 5/5 consecutive runs,
`npmPackSmoke` passed on 2 consecutive full builds.
