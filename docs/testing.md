# Running the test suite

This file is for people working on POKIE itself (contributors), not for consumers of the `pokie`
npm package — see [`docs/README.md`](README.md) for the library's own API reference.

## Lanes

| Command | What it runs | Coverage | When to use it |
|---|---|---|---|
| `npm test` / `npm run check:fast` | Unit + component tests only (`pokie` + `studio-client-components` Jest projects) | off | Everyday dev loop |
| `npm run check:full` | `check:fast` + a full `tsc --noEmit` typecheck + the integration/workflow/server/worker/filesystem lane (`pokie-integration`) | off | Before opening a PR |
| `npm run check:release` | lint + typecheck + every test **with coverage** + the real `npm pack`/install smoke test (`pokie-packaging`) | on | Pre-publish gate (`.github/workflows/publish.yml` runs this instead of `npm test`) |
| `npm run test:integration` | Just the `pokie-integration` lane | off | Iterating on integration/server/worker tests specifically |
| `npm run test:coverage` | `pokie` + `studio-client-components` + `pokie-integration`, with `--coverage` | on | Checking coverage without also paying for the packaging smoke test |
| `npm run test:packaging` | Just `tests/packaging/npmPackSmoke.test.ts` (real `npm pack` → install → spawn) | n/a | Verifying the published package boundary in isolation |
| `npm run test:report -- --lane <fast\|full\|release>` | Runs that lane through `jest --json` and prints the slowest suites + lane wall time | n/a | Diagnosing a performance regression |

`npm test` no longer collects coverage or runs the packaging smoke test by default — both still
exist, just behind their own commands (`test:coverage`, `test:packaging`, both folded into
`check:release`), so nothing that used to be verified stopped being verified.

### Why four Jest projects

- **`pokie`** — the default fast lane: unit/component tests for individual classes, transpile-only
  (`isolatedModules`, see below), no coverage instrumentation.
- **`studio-client-components`** — React/jsdom component tests for the Studio frontend, same
  transpile-only treatment.
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

## TypeScript in tests: transpile-only, checked once

Tests run through ts-jest with `tsconfig.test.json` (`isolatedModules: true`, plus a
`module: "commonjs"` override — `tsconfig.prod.json`'s `module: "node16"` isn't what ts-jest's
usual auto-CJS-override recognizes when `isolatedModules` bypasses that codepath, so it has to be
set explicitly here). This skips full type-checking per file; full type-checking across the whole
program (`src`, `tests`, `cli`, excluding the `cli/studio-client`/`tests/cli/studio-client` React
subtree, which needs its own JSX/bundler-resolution tsconfig and is unaffected either way — see
below) happens once via `npm run typecheck` (plain `tsc --noEmit -p tsconfig.json`), part of
`check:full`/`check:release`, never part of the fast per-file transform.

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

`test`/`test:integration`/`test:coverage` pin `--maxWorkers=2` instead of Jest's CPU-based default,
picked by measuring the fast lane's heaviest subset (the 4 `ProjectDashboardPage.*Workflow.test.tsx`
files, 76 tests, real-timer-driven) at 2/3/4 workers on this project's reference environment (4
CPUs, ~8GB RAM, swap already in active use at idle):

| `maxWorkers` | Wall time | Result |
|---|---|---|
| 2 | 133s | all pass |
| 3 | 130s | 1 failed (contention-induced `waitFor` timeout) |
| 4 | 148s | 1 failed (contention-induced `waitFor` timeout, and slower than 2) |

3 and 4 workers are not just no faster — they actively introduce flakiness (a real-timer-dependent
`waitFor` assertion misses its window under CPU contention) that 2 workers doesn't. The plain
TypeScript unit tests (`pokie` project alone) show closer to a wash across worker counts (~53-57s
either way on this box), so the jsdom/React lane is what actually justifies pinning at 2 rather
than leaving it to Jest's auto-scaling default — which is also what produced the baseline run's
spurious timeouts below.

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

## After: `npm test` (fast lane) today

`npm test` (`pokie` + `studio-client-components`, `--maxWorkers=2`, isolatedModules, no coverage,
no packaging): **509.6s** Jest time / **9m40s** wall, 311 suites, 3669 tests, 1 failure
(pre-existing/unrelated — see below). That's down from the 1253s/23m22s the *entire* old
undifferentiated run took, while also no longer paying for coverage instrumentation or the
packaging smoke test in that number at all.

Breaking that down by project shows where the remaining time actually goes:

| Project alone | Time |
|---|---|
| `pokie` (plain TS unit tests, ~275 suites) | **~53-57s** |
| `studio-client-components` (jsdom/React, ~36 suites) | **~450s** (the remainder) |

The `studio-client-components` project — not the TS unit tests — is now the dominant cost in the
fast lane. Its 4 large `ProjectDashboardPage.*Workflow.test.tsx` files alone (76 tests) take ~130s;
they mock fetch latency with real `setTimeout(100-300ms, ...)` combined with React Testing
Library's real-timer `waitFor`. Converting these to Jest fake timers was attempted-and-deferred for
this pass: the same files already show pre-existing `act()`-wrapping warnings from Mantine's
`Transition` component and real-timer-dependent flakiness under worker contention (see the
`maxWorkers` section above), which makes a fake-timer rewrite of this exact area meaningfully
riskier than the rest of this pass's changes for an uncertain payoff. Left as the top candidate for
a following, dedicated pass rather than rushed here — the lane split already isolates it from
`pokie-integration`/`pokie-packaging`, so it doesn't block the release gate either way.

One pre-existing, unrelated failure surfaced during verification:
`tests/cli/studio-client/src/domain/interpret/ProjectDashboard.test.ts`
(`describeValidationSummary › summarizes a fully valid report with no issues`) expects an object
without a `blocking` field, but `describeValidationSummary` now always includes one — a product/test
drift from the `3cda1b9` Studio React migration, untouched by anything in this pass. Out of scope
for a test-performance pass (it's a product-logic assertion, not a perf/lane issue); left as-is and
flagged here rather than silently fixed or hidden.

## After: the other lanes

- `npm run typecheck` (whole-program `tsc --noEmit`, `src`+`tests`+`cli` minus the React
  `studio-client` subtree): **23.6s**.
- `npm run test:integration` (`pokie-integration`, 20 suites): **25.9s** — 17 pass; 3 fail on
  known-flaky real-worker-thread tests (see below), unchanged from before this pass.
- `npm run test:coverage` (`pokie` + `studio-client-components` + `pokie-integration`, with
  `--coverage`): **637.7s** (~10m38s), 331 suites, 4054 tests — 93.68% statement coverage overall
  (unchanged scope: `collectCoverageFrom: ["./src/**/*.ts"]`, same as before this pass), 4 suites
  failed, all matching the known pre-existing issues documented below (`ProjectDashboard.test.ts`'s
  unrelated `blocking`-field drift, and the 3 known-flaky real-worker-thread suites) — no new or
  unexpected failures introduced by this pass's changes.
- `npm run test:packaging` — see the known issue immediately below; unrelated to this pass.

## Known issue: `npmPackSmoke.test.ts` and pre-existing lint warnings

Running `npm run test:packaging` today fails all 3 tests with
`SyntaxError: Unexpected token '/' ... is not valid JSON` while parsing `npm pack --json`'s output.
Root cause, confirmed independently of this pass's changes (reproduces on a plain
`npm pack --json --dry-run` with no test involved): `npm pack` runs `prepack` → `npm run build` →
`prebuild` → `npm run lint` first, and ESLint prints its warnings to **stdout**, not stderr. This
repo currently has ~40 pre-existing `@typescript-eslint/no-unused-vars` warnings (severity `"warn"`,
so they don't fail lint) — their text lands on the same stdout stream `npm pack --json` uses for
its own JSON array, corrupting it for anything that tries to `JSON.parse()` the captured output.
This is a real, pre-existing bug in the `npmPackSmoke.test.ts` ↔ `prepack`/lint interaction
(matches previously-documented sandbox flakiness for this test), not something this pass's lane
split or config changes caused — reproducible on an unmodified checkout with any pre-existing lint
warning present. Left unfixed here as out of scope for a test-performance pass (fixing it means
changing production build/lint script behavior, e.g. routing lint warnings to stderr or having
`prepack` suppress them, not test lanes); flagged here with its root cause for whoever picks it up
next.

## Known-flaky suites in `pokie-integration` (pre-existing, not introduced by this pass)

Real `worker_threads` tests (`SimCommand.realWorkers.test.ts`,
`StudioSimulationService.realWorkers.test.ts`, `simulationWorkerEntry.test.ts`) intermittently fail
in this sandbox with `Cannot find module 'pokie'` inside a spawned worker, or miss a progress-tick
poll — this reproduces identically on unmodified, verbatim-copied test bodies, so it's an
environment characteristic (matches previously-documented sandbox flakiness for this test class),
not a regression from the lane split or the cancellation-test rewrite in this pass.
