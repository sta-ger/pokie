[← Back to phase5-post-audit](../../README.md)

# `P5PA-05` evidence: Studio Play's canonical "Find free games" scenario control

This step's own instruction: trace actual user-visible Player workflows (never an internal Strategy API)
across every supported product surface -- `pokie-examples`, a generated/package `npm start`, Studio Play,
and `pokie dev`/`pokie client` -- for Spin, Find any win, Find symbol win, and custom scenario, and restore
any missing supported custom scenario only through the canonical shared scenario/player abstraction.

## What was audited, and what it found

- **`pokie-examples`** (the companion repo, real checkout at `/pokie-examples`, `develop` @ `0d068ca`):
  every one of its nine example games' `src/ui/ui.ts`/`src/data.ts` genuinely supports a "custom scenario"
  dropdown (`initializeUi(div, customScenarios)` / `getCustomScenarioData`), driven by the real, public
  `Simulation`/`SimulationConfig`/`PlayStrategy` machinery this repo's own `src/simulation/` ships --
  never a client-computed/forced outcome. `src/games/slot-with-free-games/index.ts`'s own "fg"/"fgBank"/
  "fgNoBank" scenarios are built from `new PlayFreeGamesStrategy()` (`src/simulation/playstrategy/
  PlayFreeGamesStrategy.ts`), a public, generic, mechanic-agnostic strategy this library exports for any
  `VideoSlotWithFreeGamesSessionHandling`-shaped session -- not a `slot-with-free-games`-only helper.
- **A generated/package `npm start`** (`pokie init`/`pokie build --target tsPackage`, `npm start` running
  `pokie dev .`): `cli/client/main.ts` -- the one player this route serves -- only ever offers Spin. It
  never claimed Find any win/Find symbol win/custom scenario (confirmed by reading its full source and by
  `git log -S` across its history: neither string was ever present). This is a real, narrower, honestly-
  scoped preview surface, not a regression -- no fix needed here.
- **Studio Play**: `PlayTab.tsx`/`StudioPlayService.ts` offered Spin, Find any win
  (`PlayUntilAnyWinStrategy`), and Find symbol win (`PlayUntilSymbolWinStrategy`) -- both added in
  `[P5-POLISH-11] 5a6efa6`, right after `[P5-POLISH-10] 25006b0` replaced Play's old embedded-iframe
  canonical-player workflow with an in-process session. Neither the pre-`P5-POLISH-10` iframe (which
  pointed at the same minimal `cli/client` player described above -- confirmed by `git log -S` the same
  way) nor current Play ever offered a "Find free games" control, even though `PlayFreeGamesStrategy` is a
  real, public, generic class in this same repo's own `src/simulation/playstrategy/` -- exactly the
  "canonical shared scenario/player abstraction" `pokie-examples`' own "Free games" scenario already uses.
  This is the one genuine parity gap this step found: a real, generic, already-shipped scenario strategy,
  reachable from a real user workflow in the companion repo, with no equivalent surface in Studio Play at
  all.
- **`pokie dev`/`pokie client`**: both serve the same `cli/client` player audited above -- same finding,
  same "no fix needed, honestly scoped" conclusion.

## The fix

Studio Play gained a fourth scenario control, **Find free games**, built exclusively through the same
canonical primitives Find any win/Find symbol win already use -- no parallel player, no iframe/server
runtime, no client-side game calculation:

- `cli/studio/runtime/StudioPlayService.ts`: `findFreeGames(sessionId)`, built on the exact same
  `spinUntilMatch()` real-spin-search loop `findAnyWin()`/`findSymbolWin()` already share. For a "runtime"
  session it hands the engine's own `new PlayFreeGamesStrategy()` the live session, the same way
  `findAnyWin()` hands it `PlayUntilAnyWinStrategy`; for an "outcomeSource" session (a resolved outcome-
  library draw, no live `GameSessionHandling`) it reads the already-computed `"freeGamesTriggered"`
  feature event straight off that round's own real `RoundArtifact.featureEvents` -- the exact same event
  `buildRoundArtifactFromSession` derives from a live session's `getWonFreeGamesNumber()` -- never a second
  free-games determination. A game whose session doesn't report free-games state at all is told so
  honestly (`"This game doesn't support free games, so Find free games isn't available for it."`) before
  ever burning a spin, the same feature-detection convention `findSymbolWin()` already uses.
- `cli/studio/StudioServer.ts`: `POST /api/project/play/sessions/:id/find-free-games`, routed and handled
  exactly like `find-any-win`/`find-symbol-win`.
- `cli/studio-client/src/api/apiClient.ts` / `hooks/usePlaySession.ts` /
  `components/project/PlayTab.tsx`/`ProjectDashboardPage.tsx`: a `findFreeGames()` call and a "Find free
  games" button, wired the same way as the two existing scenario controls -- always visible, honestly
  erroring per-game when unsupported, never a client-side prediction.
- `cli/studio/runtime/StudioRoundRecorder.ts` / `StudioRuntimeSessionView.ts` /
  `cli/studio-client/src/api/types.ts` / `domain/interpret/Replay.ts`: `"find-free-games"` added as a real
  `StudioRoundOperation`, recorded through the exact same `StudioRoundRecorder` every other Play action
  already funnels through (no new call site), and labeled `"Find free games"` (never demoted to a bare
  `"Spin"`) by Replay's own `describeStudioRoundOperation`.

No new player, no new runtime, no game-side calculation: every round Find free games produces is a real,
settled spin through the exact same `SpinCommandHandler`/`OutcomeLibraryBundleOutcomeSource` path Spin/Find
any win/Find symbol win already use, captured as a real, hashable `RoundArtifact` by the same "full capture"
machinery, and recorded into the one shared `StudioRoundRecorder` history Replay's "Session Spin" already
reads from.

## Real, unmocked reproduction

No Chromium/Chrome binary exists anywhere on this filesystem, this sandbox is not root, and no host-browser
bridge (`P5_STUDIO_URL`/`P5_DEVTOOLS_URL`) is wired into this environment -- reproduced fresh this round
(`command -v` for every known Chrome/Chromium binary name: none found; both env vars unset; `id -u` = 1000,
not root), the same constraint `docs/phase5-audit/evidence/environment-verification/` and this campaign's
own `P5PA-04` round already documented for this exact sandbox. Per this campaign's own protocol (§2 of the
top-level README), the fallback is a real, unmocked `jest-environment-jsdom` capture of the actual
production component tree, plus a real, unmocked Node.js HTTP server driving the real backend end to end --
never a hand-typed/imagined fixture, and never conflated with a real pixel/browser capture.

1. **[`01-studioplayservice-findfreegames.txt`](01-studioplayservice-findfreegames.txt)** -- the real
   `StudioPlayService.findFreeGames()` exercised directly: a controllable live session that only triggers
   free games on its 4th real spin (proves the search repeats genuine settled spins, not a single check);
   a real two-mode-free bundle-backed "outcomeSource" session whose already-drawn `RoundArtifact` carries a
   real `"freeGamesTriggered"` feature event (proves the no-live-session branch reads the same real,
   already-computed signal, never a live strategy object); a non-free-games game reporting the honest error
   without ever spinning; and the bundle-exhausted honest-error path. 14 passed / 0 failed.
2. **[`02-studioserver-findfreegames-http.txt`](02-studioserver-findfreegames-http.txt)** -- a real Node.js
   HTTP server (`StudioServer`, no mocks) driven with real `POST`/`GET` requests: `find-free-games` runs
   real spins server-side until the 3rd genuinely triggers free games (settled credits prove 3 real spins,
   not a shortcut); the honest per-game error and 404 paths; Home-mode 409 for all three scenario routes;
   and -- the acceptance criteria's own "immediately appears in Replay through the one shared Round
   Recorder" requirement -- a dedicated test that plays `find-free-games` against a real server (built with
   no `playService` override, so it shares the server's own real `StudioRoundRecorder` the same way a real
   `pokie studio` process does) and then reads `GET /api/project/rounds` -- the exact route Replay's
   "Session Spin" list reads -- confirming all 3 real rounds are immediately present there, every one
   tagged `studioOperation: "find-free-games"` (never a bare `"spin"`), the winning one's own `debug.artifact`
   carrying the real `"freeGamesTriggered"` feature event. 10 passed / 0 failed.
3. **[`03-playworkflow-dom-findfreegames.txt`](03-playworkflow-dom-findfreegames.txt)** -- a real,
   unmocked `jest-environment-jsdom` capture of the actual production component tree (`HomePage` ->
   `ProjectDashboardPage` -> `PlayTab` -> `RoundSummary` -> `RoundArtifactInspector` -> `FeatureStateView`),
   the same harness this campaign's own `P5PA-02` remediation evidence used as its documented fallback:
   "New session" then a real click on the real "Find free games" button reaches
   `POST /api/project/play/sessions/sess-1/find-free-games`, and the round it returns renders through the
   real `RoundArtifactInspector` -- the real `"freeGamesTriggered"` feature event genuinely appears in the
   rendered DOM (`screen.getAllByText("freeGamesTriggered")`), not asserted from the raw response alone.
   Also re-confirms Find any win/Find symbol win still pass unmodified. 4 passed / 0 failed (network
   boundary faked via the project's own `createRoutedFakeFetch` seam; everything else -- Mantine, React,
   the real component tree -- is real and unmocked).

## Regression coverage

New tests, all listed in `files_changed`:

- `tests/cli/studio/runtime/StudioPlayService.test.ts` -- `findFreeGames` unit coverage (live session,
  outcome-library session, unsupported-game honesty, search-exhausted honesty).
- `tests/cli/studio/StudioServer.test.ts` -- HTTP routing/response-shape coverage plus the shared-recorder
  propagation test described above.
- `tests/cli/studio-client/src/components/project/PlayTab.test.tsx` -- updated for the new required prop.
- `tests/cli/studio-client/src/components/project/ProjectDashboardPage.playWorkflow.test.tsx` -- the DOM
  capture described above.
- `tests/cli/studio-client/src/domain/interpret/Replay.test.ts` -- `describeStudioRoundOperation("find-free-games")`.

Full targeted runs (verbatim, see the three transcripts above): 14 + 10 + 4 = 28 passing assertions across
the new `findFreeGames`-related cases plus every pre-existing Find any win/Find symbol win case each filtered
run's own `-t` pattern also matched (none regressed). A broader run of the `pokie` project (351 suites / 5576
tests, up from a 351/5570 baseline -- 6 new tests in that project's own files) and the full
`StudioServer.test.ts` file (271 tests, up from 267 -- 4 new) were also re-run at this step's own HEAD: all
pass except two pre-existing failures in `StudioServer.test.ts`'s own "Home Open Project ... offline" suite,
reproduced as pre-existing (not caused by this step) by stashing every change in this diff and re-running the
identical file, which fails identically (`/usr/local/bin/npm: 4: Syntax error: word unexpected` -- this
sandbox's own already-documented broken `npm` wrapper, the same constraint `pokie-phase5-inventory.md`/earlier
`P5PA` rounds already recorded for this exact sandbox).

## What did not need a fix

- **`pokie-examples`**: already correct, real, and unmocked -- no companion-repo change was needed or made.
  `git status`/`git log` in `/pokie-examples` are unchanged by this step.
- **Generated-package `npm start` and `pokie dev`/`pokie client`**: `cli/client`'s minimal, Spin-only
  player is a real, narrower, honestly-scoped preview surface (confirmed never to have claimed otherwise,
  by source read and full `git log -S` history) -- not a parity gap, so left untouched.
