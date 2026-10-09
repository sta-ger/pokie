# P9-07 — Valera mathematician

Immutable brief: `a80b3554d7f660bf6826f3b0ebeaae5a0bb7e847e436322ff40fb08b992b23d5`.
Preparation base: `c86ac680`. This record contains implementer preparation and
automated regression evidence. It does **not** establish cold-user success.

## Independent collection status

No P9-07 frozen cold observations, collector identity, elapsed exploration
times, screenshots, or independent `browser_ui_rerun` receipt with finding ID
`P9-VALERA-MATHEMATICIAN` were supplied or collected in this task clone.
Consequently severity classification, finding-driven product corrections, and
fresh-profile affected browser retests remain unverified. No claim of “no
findings” or completed independent verification is made. Previous steps' evidence
is untouched. Screenshot count for this step: **0**.

Independent collection and production asset preparation belong to the controller
under the implementer command policy. Use candidate-consistent assets, one new
browser profile and an isolated Studio/application profile and workspace. Copy
the two fixture inputs there; do not let the collector read this evidence record,
source, tests, scope preflight, roadmap, prior reports, or the maintainer notes
below until observations are frozen. Record actual actions, terminology,
confusion, defaults, failures and wall-clock elapsed times in one initial pass
targeting 20 minutes. Freeze before source investigation. Classify every actual
finding; fix P0/P1/material P2 with named regressions, then rerun only affected
tasks using another fresh browser/application profile and clean fixture copies.
Follow dialogs/recovery to terminal results; a reachable control is not closed by
an “unreached” label. Keep at most three screenshots and append the independent
collector identity, candidate, timings and machine-owned receipt here.

## Collector handoff text (only this text and neutral copied locations)

> You are a slot mathematician using POKIE for the first time. You know slot math
> but have no prior knowledge of POKIE's architecture or workflows. Use the normal
> public Studio product and its ordinary help. Start from the supplied small model
> or create an equivalent small model. Inspect and edit symbols, reels and paytable;
> validate, save, reopen and play it. Run eight rounds with one worker, one
> supported mode and the explicit seed `math-session`. Explain the RTP and
> volatility you observe, what the defaults meant, and whether this short run proves
> anything about the model. Export/import a PAR workbook, inspect the preview,
> apply it, save and reopen it; explain its provenance. Inspect and publish a tiny
> exact Outcome Library, open its output, inspect its analysis/report, draw or play
> an outcome, inspect the recorded round and replay it. Try bounded invalid edits
> and cancellation/recovery where available. As a second short task, inspect the
> supplied `source-2` data and explain its displayed statistics and available
> operations. Record what you actually do and any confusion, rather than assuming
> what the product intended. Spend roughly 20 minutes on this initial exploration.
>
> Inputs: `<isolated-workspace>/model.blueprint.json` and
> `<isolated-workspace>/source-2/`. Outputs belong in that isolated workspace.

## Fixture and regression provenance (maintainer only)

- Neutral inputs are under `tests/cli/fixtures/p907/`. The Blueprint has two
  literal reels of two stops, one row, one payline and stake 1. No random/recommended
  preset or large generation is needed. The regression renames B to C, reverses
  the first reel and changes C's payout to 2; the four paid outcomes are 0, 0, 2, 2.
  Exact RTP is 1, hit frequency 0.5, variance 1 and standard deviation 1. Those
  reference answers must not be given to the cold collector.
- `source-2` retains the existing `StakeProbabilityTestFixtures` data byte for
  byte: UInt64-maximum loss weight, unit win weight, safe IDs/payouts and repeated
  bonus events. Its extra `pokie-manifest.json` is an explicitly disclosed,
  fixture-side Studio recognition marker, **not** a real export/conversion
  receipt. Its `fixturePreparation` field records this. Standalone reading is
  separately tested without that marker; arbitrary manifest-less Studio import
  is not claimed. The regression verifies the supplied compressed books with
  the current Node zstd reader before any timed browser collection.
- The existing relative-error helper checks positive finite hit/max-win probability
  `2^-64`, RTP `2p`, variance `4p(1-p)` and deviation `2^-31`. Exact integer total
  is `18446744073709551616`. Numeric moments are floating-point values;
  large-total displayed fractions have a 40-fractional-digit boundary. These
  UInt64 weights are not pushed through native safe-integer library conversion.
- `P907ValeraMathematician.integration.test.ts` composes real Studio HTTP/services,
  ExcelJS workbook publication/import, managed Blueprint and registry persistence,
  generated Node game logic, seeded Play/CLI/Studio simulation, persisted report
  downloads/reopening, four-combination exact generation, source report, recorded
  draw and replay. Only runtime package preparation/loading is adapted to bind
  generated `require("pokie")` to candidate source under Jest without npm/compiler
  subprocesses. This does not verify compiled browser delivery or replace an
  independent browser session. Replay comparison excludes clocks while retaining
  source hash, mode, seed, round, selection algorithm, payout, screen and artifact.

## Acceptance and closure ledger

| Obligation | Implementer evidence / remaining independent obligation |
| --- | --- |
| Cold task, isolation, frozen confusion/defaults/terminology, real timings and independent identity | Handoff and tiny inputs prepared; initial independent observation **pending**. No severity or correction inferred from source inspection. |
| Symbols/reels/paytable edit, validation, save/reopen, saved runtime | New composed integration plus `ProjectDashboardPage.gameModelWorkflow` (“Save runs validateBlueprint first — an invalid draft is never written”) and Blueprint reel-modeler/Play workflows. Actual discoverability and user understanding require the cold receipt. |
| Draft/saved state, cancellation/navigation/late preview, runtime invalidation | Existing Game Model, reel-modeler, PAR panel and Play component workflows are retained; independent interaction **pending**. No constructor defaults or shared dependencies changed. |
| PAR preview/Apply/managed Save/reopen, preservation and truthful provenance | Composed test saves server-prepared evidence across restart, verifies untouched lossless eligibility, rejects the edited import's lossless claim and preserves workbook bytes. Existing PAR round-trip/importer/exporter, Blueprint service and managed-save/panel tests cover malformed/missing Meta, stale preparation, hash/byte binding and occupied destinations. |
| Simulation defaults, seed, requested/completed rounds, worker/mode, short-run interpretation | Existing simulation workflow tests retain 10000-round defaults, one worker/no explicit seed, warnings, retry and live/reopened equivalence. Composed eight-round seeded test compares real Play, CLI and Studio totals/RTP/volatility and checks warnings/CI/reproducibility/downloads. Human understanding **pending**. |
| Exact generation, supported publication, output/report/draw/record/replay | Composed test requires exact preflight/work 4, coverage 1, actual native analysis and persisted source-specific replay. Existing generation, export/deploy and outcome-source route tests retain conflict/capability guards. Independent terminal browser path **pending**. |
| Failure/cancellation and cleanup; switching, shutdown, polling and durable recovery | Existing simulation/replay services include failed/cancelled no-report/no-descriptor and real PAR preparation cleanup; Blueprint service preserves occupied outputs. Existing client workflows cover stale/project-switch responses, retries and download gating; durable repository tests cover restart. Composed test stops every server/runtime, restores reports after restart and removes only its own temporary workspace. |
| Rare positive metrics, BigInt boundary, format/entry parity, truthful restrictions | Composed supplied-fixture/manifest-less reader/recognized Studio/persisted report test plus existing standalone, CLI analyze/diff/outcome-source/report, project analyzer, source-label and online-weighted-analysis tests. Source remains inspection-only; no fabricated native sample. Independent second task **pending**. |
| Node/WASM seeded constructor/first result/continuation/restore/compact state | Existing production golden/API, CLI WASM and Studio WASM cases in the supplied bounded test set; no RNG/math implementation or public export/bin contract changed. Candidate compiled artifact/browser verification remains controller-owned. |
| All actual P0/P1/material P2 fixed with named regressions; clean affected retest | No independent observations supplied yet. This row stays **open** until frozen findings and affected-task receipts exist; automation cannot close it. |

## Permitted check results

Initial composed regression: 2/2 tests passed, 2.181 s Jest wall time; actual
workflow bodies 838 ms (tiny math) and 23 ms (Stake). These are automation timings,
not cold-user timings.

- `npm run test:targeted -- <all 34 explicit scope_preflight.targeted_tests paths>`
  exited **0**: 34 suites, **837 tests**, 446.044 s, across four Jest projects.
  The implementer JSON report retains every required path as machine-readable
  passing evidence. Existing React/Mantine transition `act(...)` warnings and
  expected negative-case CLI diagnostics occurred; no assertions failed.
- After removing an unnecessary `async` from the test-only preparation adapter,
  `npm run test:targeted -- tests/cli/P907ValeraMathematician.integration.test.ts`
  exited **0** again: 2 tests, 2.207 s; workflow bodies 829 ms and 23 ms.
- Final `npm run typecheck` exited **0**, including `typecheck-studio-client`.
  It consumes the changed TypeScript test; no production TypeScript, export,
  package contract or browser asset was changed, so no production build boundary
  was introduced. Candidate browser delivery remains independently unverified.

No packaging, coverage, project-wide or official gate, browser/CLI collector,
or background work was launched. The complete campaign remains unproven until
the controller-owned cold receipt, severity/correction ledger and clean affected
retest close the open acceptance rows above.
