[← Back to phase5-post-audit index](../../README.md)

# P5PA-04 evidence: multi-mode Outcome Library selection was never real, now fixed

Gathered against product HEAD `09eae5003...` (`merge task task/P5PA-03-20260810143324 (implementation
f8d97d074a43)`, this step's own base), working tree clean before this step's own product/test/doc commits;
scratch build/server/bundle artifacts confined to `/tmp` and removed immediately after each transcript below
was captured.

## What P5PA-01 missed

`P5PA-01`'s own round classified this concern **INTENTIONAL SUPPORTED LIMITATION**
(`evidence/10-outcome-library-multimode-selection-provenance.txt`), based on `pokie outcomesource sample
--mode <name>` — the one route that already lets a caller name a real mode — behaving correctly. That
transcript's own source-read even quotes the exact three call sites that construct
`OutcomeLibraryBundleOutcomeSource` for Play/Simulation/Replay, but the round never checked what `modeName`
those three sites actually passed. They all passed the same thing: `manifest.modes[0].modeName`, unconditionally.

- `StudioPlayService.newOutcomeSourceSession` (`cli/studio/runtime/StudioPlayService.ts:424`, pre-fix)
- `StudioSimulationService.runOutcomeSourceSampling` (`cli/studio/simulation/StudioSimulationService.ts:342`, pre-fix)
- `StudioReplayExecutionService.runOutcomeSourceReplay` (`cli/studio/replay/StudioReplayExecutionService.ts:382`, pre-fix)

None of the three took a `modeName` parameter at all, and neither did their HTTP request bodies
(`POST /api/project/play/session`, `POST /api/project/simulations`, `POST /api/project/replays`) or their
frontend tabs (`PlayTab.tsx`, `SimulationTab.tsx`, `ReplayTab.tsx` — none had a mode picker; only
`OutcomeSourceOverview.tsx`'s Exact Analysis table did, one "Draw an outcome" button per real row). For any
outcome library with more than one mode, Play/Simulation/Replay could only ever reach the manifest's own
first mode — never a frontend-only or free-text substitution, but not a real selection either: there was
nothing to select from. This matches this step's own acceptance criteria exactly ("sampling/replay always
silently uses the first mode") and is classified **material P2**: it silently narrows every multi-mode game's
Play/Simulation/Replay coverage to one mode, with no error, no warning, and no way for a user to notice short
of reading source.

Separately, the shared round-history recorder (`StudioRoundRecorder`/`StudioRuntimeSessionView`) had no
`modeName`/`studioModeName` field at all — even the one surface that *did* let a caller pick a real mode
(Overview's "Draw an outcome") never recorded which mode a round came from into the shared history Replay's
"Session Spin" list reads. Round provenance did not preserve the selected mode anywhere in Studio.

## The fix

- New shared helper `src/project/resolveOutcomeLibraryModeName.ts`: resolves an optional requested mode name
  against a bundle manifest's own real `modes` list — `undefined` still defaults to the first mode (preserving
  every existing single-mode caller's behavior unchanged), a real requested mode name resolves to itself, and
  an unreal one throws immediately, naming every real mode, rather than ever falling back silently or leaking a
  raw `ENOENT`.
- `StudioPlayService.newSession`/`newOutcomeSourceSession`, `StudioSimulationService.start`/
  `runOutcomeSourceSampling`, and `StudioReplayExecutionService.start`/`runOutcomeSourceReplay` all now accept
  an optional `modeName`, resolve it through the shared helper, and use the *resolved* mode — never
  `modes[0]` unconditionally.
- `validatePlaySessionRequest`/`validateSimulationRequest`/`validateReplayRequest` accept and validate an
  optional `modeName` field on their respective POST bodies, mirroring the non-empty-string validation
  `validateOutcomeSourceSampleRequest` already used for the one route that had this right.
- `StudioSimulationJobRecord`/`StudioReplayJobRecord` (and their `...JobView`/`...ListEntry`/`...ReportListEntry`
  DTOs) gain a `modeName` field, stamped with the *actually-resolved* mode once the manifest is read — so a job
  created without an explicit mode still reports which real mode it ran against, not just what was requested.
- `StudioRoundProvenance`/`StudioRuntimeSessionView` gain `modeName`/`studioModeName`, stamped by every
  outcome-library-backed producer (Play's own spin, Overview's one-shot sample, Replay's "Recent Simulation"
  reproduction) — round provenance and the shared recorder now preserve the selected mode end to end.
- Frontend: `PlayTab`/`SimulationTab`/`ReplayTab` each gained a mode `<Select>` (Mantine, closed list, not
  free text) bound to `availableModes` — the exact same `report.modes` list `OutcomeSourceOverview.tsx`'s Exact
  Analysis table already reads (`ProjectDashboardPage`'s own `outcomeLibraryModes`), never a separately-
  invented list. `ReplayTab`'s "Recent Simulation" source reuses whichever mode the picked simulation entry
  itself already sampled (its own recorded provenance) rather than offering a second, independent picker that
  could disagree with it.

## Real, unmocked reproduction

`npm` is broken in this sandbox (same pre-existing wrapper defect every prior P5PA round has hit) — built with
`node generate-barrels.js && node_modules/.bin/tsc --project tsconfig.prod.json && node_modules/.bin/tsc
--project tsconfig.cli.json` (all exit 0; the CLI project alone type-checks every file touched by this fix,
including `StudioServer.ts`/`StudioPlayService.ts`/`StudioSimulationService.ts`/`StudioReplayExecutionService.ts`).
`cli/studio-client` was type-checked separately (`node_modules/.bin/tsc -p cli/studio-client/tsconfig.json`,
`noEmit`, exit 0).

A real, two-mode (`base` + `buyFeature`, distinct `libraryId`s so a draw's own `roundId` reveals which mode it
actually came from) outcome-library bundle was built on disk using the real, built `pokie` package's own
`OutcomeLibraryBundleWriter`/`buildRoundArtifact` (the same primitives the unit tests' own
`OutcomeLibraryBundleTestFixtures.ts` uses, just driven from compiled `dist/esm` rather than `ts-jest` so a real
`pokie studio` process could open it) — [`build-multimode-bundle.mjs`](build-multimode-bundle.mjs) — then
validated with the real CLI (`pokie outcomelibrary validate --deep`: `"valid outcome library bundle (deep
check)"`).

A real `pokie studio <bundle> --host 127.0.0.1 --port 4301 --no-open` process was started
([`03-studio-server-multimode.log`](03-studio-server-multimode.log)), and
[`exercise-studio-api.mjs`](exercise-studio-api.mjs) drove its real HTTP API with plain `fetch` — the exact
same endpoints/request bodies `cli/studio-client/src/api/apiClient.ts` calls, never a unit-test double —
across every surface this step's acceptance criteria names:

- **Overview / Exact Analysis** (`GET /api/project/context`): the real dashboard resolves to `outcomeLibrary`,
  `report.modes` lists exactly the two real modes (`base`, `buyFeature`), and `outcomeSource.sample` is granted.
- **Exact Analysis draw** (`POST /api/project/outcome-source/sample`): `base`/`buyFeature` each drew
  exclusively from their own real library (`roundId` prefix `base-lib-`/`buy-lib-`); an unreal mode name never
  silently substituted another mode's data.
- **Play** (`POST /api/project/play/session` + spin): a session created with no `modeName` played the
  manifest's own first mode (`base`) — pre-existing behavior preserved; a session created with
  `modeName: "buyFeature"` genuinely played `buyFeature` (`roundId` prefix `buy-lib-`), and the recorded
  round's own `studioModeName` was `"buyFeature"`; an unreal mode name failed honestly
  (`"bonus" is not a mode of this outcome library. Available modes: base, buyFeature.`) rather than falling
  back to `base`.
- **Simulation/Sampling** (`POST /api/project/simulations`): a job started with `modeName: "buyFeature"`
  completed with `job.modeName === "buyFeature"`, not silently `"base"`.
- **Replay** (`POST /api/project/replays`, "Recreate from seed" shape): a job started with
  `modeName: "buyFeature"` completed with `job.modeName === "buyFeature"` and its reproduced round's own
  artifact came from `buy-lib`; an unreal mode name failed honestly, naming both real modes.
- **Round provenance** (`GET /api/project/rounds`): every one of the rounds recorded above — the two Exact
  Analysis samples and the two Play spins — carries the correct real `studioModeName`, proving the shared
  `StudioRoundRecorder` now preserves mode across every producer, not just the one that already worked.
- **Build/Export** (`GET /api/project/gameModel`): confirmed a resolved `outcomeLibrary` project still
  honestly reports every Game Model section `"unavailable"` with a truthful reason (`"a pre-generated outcome
  source, not a Blueprint"`) — unrelated to mode selection, but part of this step's acceptance criteria's own
  Build/Export surface, and unaffected by this fix.

Full transcript: [`01-multimode-http-transcript.txt`](01-multimode-http-transcript.txt) (every assertion in
`exercise-studio-api.mjs` labeled `OK:`; the script exits non-zero on any failure — it did not).

## Stake adapter capability honesty (re-verified, not just re-asserted)

A real Stake Engine export directory was built the same way (`StakeEngineExporter`, real `buildRoundArtifact`
outcomes) — [`build-stake-export.mjs`](build-stake-export.mjs) — and a second real `pokie studio` process
opened it ([`04-studio-server-stakeadapter.log`](04-studio-server-stakeadapter.log)).
[`exercise-stake-honesty.mjs`](exercise-stake-honesty.mjs) confirmed, against that real running server: the
resolved `stakeAdapter` project's own capabilities never include `outcomeSource.sample` (only
`outcomeSource.read`, so Overview/Exact Analysis stays reachable); `POST /api/project/outcome-source/sample`,
`POST /api/project/play/session`, `POST /api/project/simulations`, and `POST /api/project/replays` each refuse
honestly with the same structured `outcomeSource.sample` capability diagnostic — never a fake success, never a
silent no-op. This confirms `PROJECT_TYPE_CAPABILITIES` (`src/project/ProjectCapabilities.ts:36-43`, unchanged
by this fix) and the tab-level gating in `ProjectDashboardPage.tsx`
(`OUTCOME_SOURCE_SAMPLE_CAPABLE_CAPABILITIES`, also unchanged) were already correct — this step found no defect
in Stake adapter honesty, only re-verified it end to end against the same real server this step already
proved the mode-selection fix against. Full transcript:
[`02-stakeadapter-honesty-transcript.txt`](02-stakeadapter-honesty-transcript.txt).

## Regression coverage

New tests, all real (no `OutcomeLibraryBundleOutcomeSource`/reader mocking — real bundles on disk, real
`ProjectTargetResolver` resolution, real service `start()`/`newSession()` calls):

- `tests/project/resolveOutcomeLibraryModeName.test.ts` — default/explicit/unknown-mode cases for the shared
  helper.
- `tests/cli/studio/runtime/StudioPlayService.test.ts` — new `"a multi-mode outcome-library project"` describe
  block: default-mode preservation, explicit non-first-mode selection, unknown-mode honest failure, and
  `StudioRoundRecorder` provenance stamping.
- `tests/cli/studio/simulation/StudioSimulationService.test.ts` — new `"StudioSimulationService with a
  resolved, multi-mode native outcome-library project"` describe block: same three cases, asserted via
  `job.modeName`.
- `tests/cli/studio/replay/StudioReplayExecutionService.test.ts` — new `"StudioReplayExecutionService with a
  resolved, multi-mode native outcome-library project"` describe block: same three cases, asserted via
  `job.modeName` and the reproduced round's own `roundId`.
- `tests/cli/studio/StudioServer.test.ts` — two new HTTP-level tests in the existing "Project Dashboard: Play
  with a resolved Outcome Source project" describe block: an explicit non-first-mode Play session end to end
  through the real HTTP route (including the round-history assertion), and the honest-failure case for an
  unreal mode name.

Ran the full `pokie` Jest project (`--selectProjects pokie`, no path filter — this project's own jest config
does not narrow by a positional file argument, so every invocation below ran the complete, authoritative
suite): 351 suites / 5571 tests, all passed (up from the pre-existing 350 suites / 5562 tests baseline this
step started from — the +1 suite is `resolveOutcomeLibraryModeName.test.ts`, the +9 tests are this step's own
new cases). Also ran `studio-client-components` (29 suites / 230 tests, all passed) and
`studio-client-workflows` (the `ProjectDashboardPage`/`usePlaySession`/`useSimulationPoll`/`useReplayPoll`
integration suites) separately, since `PlayTab.tsx`/`ReplayTab.tsx`/`SimulationTab.tsx`/`ProjectDashboardPage.tsx`
were all touched by this fix's own frontend plumbing.

## What could not be verified

No Chromium/Chrome binary exists anywhere on this filesystem, this sandbox is not root, `apt-get`/`dpkg
--configure` cannot install the missing shared libraries (`libglib-2.0.so.0` and others), and no
`P5_STUDIO_URL`/`P5_DEVTOOLS_URL` host-browser bridge was wired into this environment for this step (the same
three independent blockers `docs/phase5-audit/evidence/environment-verification/` and
`docs/phase5-audit/evidence/host-browser/f9-rerun-attempt-20260810/00-environment-recheck.txt` already
documented for this exact sandbox) — re-confirmed fresh at the start of this step, not assumed from an older
round. A real Chrome session driving the rendered Studio UI (the browser evidence `P5PA-02`/`P5PA-03`'s own
`browser-ui-rerun/` directories captured) was therefore not possible here.

In its place: (1) the real, running Studio HTTP server was driven end to end with the exact request/response
contract the frontend's own `apiClient.ts` uses (above) — this proves the *backend* half of every surface
named in this step's acceptance criteria, including round provenance and Stake adapter honesty, against real
process/network boundaries, not mocks; (2) the *frontend* half — that `PlayTab`/`SimulationTab`/`ReplayTab`'s
mode pickers are genuinely closed `<Select>` controls bound to the server's own real `report.modes` list, never
a free-text field or a client-invented list — was confirmed by reading the actual rendered-control source
(`availableModes={outcomeLibraryModes}` threaded from `ProjectDashboardPage.tsx`'s own
`header.report.modes.map((mode) => mode.modeName)`, the identical list `OutcomeSourceOverview.tsx`'s own Exact
Analysis table already renders) and exercised behaviorally through
`studio-client-components`/`studio-client-workflows`' own React Testing Library suites (a real DOM via jsdom,
real user-event clicks/selects against the real component tree, real `fetch` mocks at the HTTP boundary only —
not a mock of the component's own selection logic). Pixel-level screenshot evidence specifically remains the
one thing this sandbox cannot produce, exactly as every prior P5PA round without a host-browser bridge has
honestly recorded.
