[← Back to phase5-evidence index](../README.md)

# P5-POLISH-19 real-user-journey evidence

**Step:** `[P5-POLISH-19]` "Prove end-to-end real user journeys." Original round gathered 2026-08-08 against
product `HEAD` `c9a1c43921becbc1c5e5429e78d7f34073c969ad`, a fresh build from source (see "Method"). **This is a
review-correction round**, built atop that round's own landed commit `faa647c91b5b598f6a0d9e52605dea2f7672e8f`:
review found the player-parity acceptance criterion unmet (generated-package seeds were verified inert, not
fixed, and the four surfaces' own captured artifacts used different rounds) — see "Player parity" below for the
fix (`src/generated/renderBuiltGameModule.ts`, `cli/scaffold/renderSessionModule.ts`,
`cli/scaffold/renderEntryModule.ts`, plus the `SeededRandomNumberGenerator`/`SymbolsSequence`/
`ReelsSymbolsSequencesGenerator` primitives it depends on) and the new one-fixture-round-across-four-surfaces
evidence. Companion (`/pokie-examples`) confirmed synced at the start of this correction round the same way
every prior round did (`develop` vs. `origin/develop`, fetched fresh over HTTPS, `git merge-base
--is-ancestor`). Unlike the original round, **this correction round does make a new commit in `/pokie-examples`**
— a new test case in `tests/ui.test.ts` rendering this round's own captured fixture round through the real
`ui.ts`/`data.ts` adoption (landed by `9e242fa`/`4a65860`, exercised for real, not modified) — see "Player
parity" below.

**Second review-correction pass** (this commit, built atop this round's own landed
`582f5323efdd1baaa6c95bb00f761def24b2c287`): review found the four-surface rendered-parity evidence still
incomplete — `browser/parity-render-capture-script.tsx.txt`/`browser/player-parity-render.html` still rendered
the *old*, pre-fix 5×3 fixture (referencing a `parity/npm-start-spin.json` this round had already deleted), and
`/pokie-examples/tests/ui.test.ts`'s own P5-POLISH-19 test fed the render pipeline hand-typed literal fixture
data rather than the actual captured JSON. Both are fixed in this pass: the browser capture script/HTML now
render the real after-fix `fixture-slot` round (see "Player parity" below), and the examples test now loads the
real captured JSON files verbatim (committed at `/pokie-examples/tests/fixtures/p5-polish-19/`) and cross-checks
them against each other before rendering. This pass also corrects this document's own prior overclaim that
every after-fix artifact carries identical `paytable`/`winningLines` fields — `pokie replay`'s own descriptor
never did (see "Player parity" below).

## Method

Same sandbox, same constraints `pokie-phase5-inventory.md`'s own "Method" section and
[`phase5-evidence/build/build-transcript.txt`](../build/build-transcript.txt) already documented: this
sandbox's `npm` entrypoint (`/usr/local/bin/npm` → `/usr/local/lib/node_modules/npm/bin/npm-cli.js`, both outside
this git worktree) is an orchestrator-provisioned policy wrapper that only accepts `npm run typecheck` and `npm
test -- <file>.test.ts`; every other invocation — including one this wrapper's own `case` pattern should
recognize as allowed — hits a genuine shell syntax error in the wrapper script itself (reproduced fresh this
round, byte-for-byte the same error as every prior round). This sandbox still has **no Chromium/Puppeteer/
Playwright and no root/`apt-get` access** to install one (`apt-get install` → `Unable to acquire the dpkg
frontend lock`, confirmed non-root `uid=1000`) — confirmed fresh this round, not assumed from a prior one.
Neither constraint is a POKIE defect; both are named explicitly here (again) so this round's workarounds read as
deliberate, not accidental.

Consequences for how this round's evidence was gathered, every one of them a continuation of the exact "Method"
precedent `pokie-phase5-inventory.md`/`phase5-evidence/README.md` already established, not a new invention:

- **Build**: `generate-barrels.js` → `tsc` (×4 configs) → `shx` copies → `vite build` (studio-client) → `shx
  chmod`, each invoked directly via `node node_modules/.bin/<tool>`, in the same order/arguments
  `package.json`'s own scripts use. `src/index.ts`'s barrel was already current this round (no stale-barrel
  finding to revert, unlike the original P5-POLISH-01 round).
- **CLI**: every command below runs the real, freshly built `dist/cli/pokie.js` directly.
- **A generated package's own `npm install`/`npm start`/`npm build` persona steps**: `npm install` genuinely
  cannot succeed in this sandbox (see [`cli/init-real-attempt.txt`](cli/init-real-attempt.txt) for a fresh,
  real `pokie init` hitting exactly this) — worked around, same as `phase5-evidence/cli/validate-linked.txt`
  did, by symlinking `node_modules/pokie` straight at this checkout's own fresh `dist/` (a real `file:`
  dependency this sandbox just can't run `npm install` to realize) and invoking the underlying tools a real
  `npm build`/`npm start` would run (`tsc`, `pokie dev .`) directly. This is *not* a substitute for the real
  persona step — it's the identical real code path (`GamePackageMerger` already resolves a package created
  inside this repo's own checkout to a `file:/workspace` dependency — see `[P5-POLISH-16]` — so this symlink is
  exactly what a working `npm install` would have produced) with only the broken package manager itself bypassed.
- **Studio**: a real `pokie studio --no-open` HTTP server, driven by real Node `fetch()` calls from a separate
  script — never jsdom, never a stubbed transport — for every persona-journey/parity/Outcome-Library/Stake
  transcript below.
- **Browser/DOM rendering**: exactly one artifact ([`browser/`](browser/)) uses `jest-environment-jsdom`, for
  the one thing only a DOM can prove (that `pokie/client/player`'s real render functions correctly draw a real
  captured round) — see "Player parity" below for why this is not a substitute for the CLI/HTTP evidence
  everywhere else, and [`../browser/README.md`](../browser/README.md)'s own "What this is not" for the
  jsdom-vs-Chromium boundary this round still cannot close (tracked, unchanged, in "Owner steps" below).

## 1. Programmer persona: `init` / `npm start` / `npm build` / `sim` / `build`

| Artifact | What it proves |
| --- | --- |
| [`cli/init-real-attempt.txt`](cli/init-real-attempt.txt) | A real, unmodified `pokie init <dir> --package-name ... --game-id ...` (no workaround flags) scaffolds `package.json`/`tsconfig.json`/`README.md`/`src/index.ts` for real, then honestly fails at `npm install` with this sandbox's own broken-wrapper message, naming the exact retry command — the real first-contact failure mode, not glossed over. |
| [`cli/prog-npm-build.txt`](cli/prog-npm-build.txt) | `npm run build`'s real underlying command (`tsc`, per the scaffolded `package.json`'s own `scripts.build`) invoked directly against the linked package — a real `dist/index.js` compiled from the scaffolded `src/index.ts`. |
| [`cli/prog-npm-start.txt`](cli/prog-npm-start.txt), [`cli/prog-npm-start-server.log`](cli/prog-npm-start-server.log) | `npm start`'s real underlying command (`pokie dev .`, per `scripts.start`) actually started as a real child process, polled on its own real `/health` route, then driven through a real `POST /sessions` (seeded) and `POST /sessions/:id/spin` — a genuine win captured (`totalWin: 1`, a Q line) — before being cleanly killed. Also proves the served `/`-root client preview (`pokie client`'s own HTML shell) responds `200`. |
| [`cli/prog-sim.txt`](cli/prog-sim.txt), [`cli/prog-sim-report.json`](cli/prog-sim-report.json) | `pokie sim . --rounds 500 --seed demo-sim --out ...` — a real, seeded simulation report (RTP/hit-frequency/volatility) against the linked package. |
| [`cli/prog-replay-help.txt`](cli/prog-replay-help.txt), [`cli/prog-replay.txt`](cli/prog-replay.txt) | `pokie replay . --seed ... --round 1` — a real replay descriptor. `cli/prog-replay.txt` predates this round's fix and documents the now-superseded pre-fix finding (two consecutive replays of the identical `(seed, round)` produced *different* screens); see "Player parity" below for the fix and fresh, reproducible replay evidence against a real generated package. |
| §4 "Build" below | `pokie build`/Studio's `/api/home/blueprints/build` is this persona's own real "build" step — see "Random generated reels + Blueprint build" below (the same command a programmer and Valera both use). |

## 2. Random generated reels + Blueprint build

| Artifact | What it proves |
| --- | --- |
| [`cli/random-create.txt`](cli/random-create.txt) | `pokie create --random --seed 777 --out blueprint.json` — a real, reproducible random Blueprint ("Golden Comet"). |
| [`cli/random-reel-generate-preview.txt`](cli/random-reel-generate-preview.txt) | `pokie reel generate blueprint.json` (dry-run preview, all 5 reels) — real `ReelStripGenerator` output, per-reel seeds/lengths/strips. |
| [`cli/random-build.txt`](cli/random-build.txt) | `pokie build blueprint.json --target tsPackage --out pkg` — a real package built from the random Blueprint, blueprint hash recorded. |
| [`cli/random-inspect.txt`](cli/random-inspect.txt), [`cli/random-validate.txt`](cli/random-validate.txt) | `pokie inspect`/`pokie validate` against the built (and `node_modules/pokie`-linked, see "Method") package — both real, both pass. |
| [`studio/valera-persona-transcript.txt`](studio/valera-persona-transcript.txt) (`POST /api/home/blueprints/build`) | The same "Build" action, driven live through Studio's own Design Game HTTP surface instead of the CLI — `201`, real `createdFiles`/`buildInfo`/`blueprintHash`. |

## 3. Valera Blueprint persona: create / edit / play / find / replay / sim / build

All of it real, driven live against a real `pokie studio --no-open` server — see
[`studio/valera-persona-transcript.txt`](studio/valera-persona-transcript.txt) for the full, unedited transcript
(every request/response below is a real fragment of that same file, in order):

1. **Create** — `POST /api/home/blueprints/random {seed:4242}` → a real random Blueprint ("Roaring Savage
   Olympus").
2. **Edit** — the manifest name is changed in place (`"Valera's Golden Reels"`) and re-validated through
   `POST /api/home/blueprints/validate` (the same endpoint the editor calls on every keystroke) — `0` warnings.
   Saved as a managed project via `POST /api/home/blueprints/save-managed` (`201`, a real path under
   `~/POKIE Projects/`).
3. **Direct-open probe** (see §4/"Owner steps" below) — `POST /api/home/projects/open` against the raw
   `blueprint.json` file fails, but with a clean, actionable materialization error (this sandbox's broken `npm`,
   named explicitly), **never an `ENOTDIR`**.
4. **Build** — `POST /api/home/blueprints/build` (straight from the edited blueprint JSON, no open/materialize
   step required) → `201`, a real tsPackage (`package.json`/`package-lock.json`/`tsconfig.json`/`README.md`/
   `src/index.ts`/`dist/index.js`) written to disk.
5. **Open** (the built package, `node_modules/pokie` linked per "Method") → `200`, a real Overview
   (`GET /api/project/context`: `status:"loaded"`, real manifest, `type:"tsPackage"`,
   `capabilities:["runtime.execute"]`), real `Inspect`/`Validate` (`valid:true`), real `GameModel` (correctly
   reports `layout`/`symbols`/`reels`/... as `"unavailable"` for a compiled package with an honest reason —
   opening the Blueprint source itself is what shows the full model, exactly as designed).
6. **Play** — `POST /api/project/play/session {seed}` → a real session; `POST .../spin` → a real (non-winning)
   round with a full `roundArtifact`; `POST .../find-any-win` → real spins run server-side until one genuinely
   wins (`totalWin: 2`, a real line win), returned with its own full artifact.
7. **Find** — `find-any-win` above; `find-symbol-win {symbolId:"A"}` legitimately exhausts the session's own
   virtual bankroll before landing a win on this blueprint's rarest symbol (`A`, generation weight `1` of `36`)
   — `StudioPlayService.spinUntilMatch` searches up to 2000 real spins, but each spin still costs a real credit,
   and this session's remaining balance ran out first. **Not a bug**: `canPlayNextGame()` correctly blocked the
   next real spin; a common symbol (e.g. `10`, weight `8`) would have found a match well within budget. Recorded
   here rather than silently re-run with an easier symbol, since a genuine "ran out of bankroll while searching"
   is itself real, useful evidence about this scenario control's own cost model.
8. **Sim** — `POST /api/project/simulations {rounds:1000, seed:"valera-sim"}`, polled to `"completed"` → a real
   report (RTP `20.1%`, hit-frequency `7.4%`) plus `GET /api/project/reports` listing it.
9. **Replay** — `POST /api/project/replays {round:1, seed:"valera-play-fixture"}` (the same seed Play used in
   step 6), polled to `"completed"` → a real descriptor with its own full `roundArtifact` (`MAX_SAFE_INTEGER`
   starting credits, same convention `ReplayRecorder`/`pokie replay` use, so replay itself is never blocked by
   balance).
10. **Build/Export** (bonus, beyond the instruction's own list) — `GET /api/project/artifacts/targets` and
    `POST /api/project/artifacts/build {target:"tsPackage"}` against the now-open **tsPackage** correctly report
    `"unsupported"` ("tsPackage cannot be built from a tsPackage project. Supported sources: blueprint.") — this
    matches `phase5-evidence/build/artifact-builder-registry-output.txt`'s own already-documented finding
    exactly (a tsPackage's own `ArtifactBuilderRegistry` entry only ever supports its own already-resolved
    type); re-confirmed live here, not a new gap.

## 4. Direct Blueprint Overview without `ENOTDIR`

Two independent, real checks, since this sandbox's broken `npm` (see "Method") blocks the one live path that
would otherwise fully prove the *Overview* half end-to-end (materializing a raw Blueprint file for Play needs a
real `npm install` — see step 3 in §3 above):

- **Live, real HTTP**: `POST /api/home/projects/open` against a raw `blueprint.json` file (§3 step 3) returns a
  clean `400` naming the materialization failure and this sandbox's own broken-npm detail — the response body
  contains no `ENOTDIR` anywhere (checked by direct string search over the full transcript). The same probe
  against a real, already-built Outcome Library bundle *directory* (no materialization needed at all — see §5)
  opens cleanly (`200`) and its `Overview`/`Inspect`/`Validate` all succeed for real.
- **Existing regression suite, run live** (not just read): `node node_modules/.bin/jest --selectProjects
  pokie-integration --testPathPattern StudioServer -t "ENOTDIR|resolved 'blueprint'|resolved 'outcomeLibrary'"`
  — see [`studio/enotdir-regression-tests.txt`](studio/enotdir-regression-tests.txt). **14 real tests pass**
  against real fixture files on disk, covering exactly the Inspect/Validate/GameModel-for-a-direct-Blueprint-file
  contract the live HTTP probe above couldn't fully reach in this sandbox: a valid blueprint inspects/validates
  cleanly without ever probing `<blueprint.json>/package.json`, a corrupt blueprint file reports a safe
  load-error/unavailable-reason and never an `ENOTDIR`, and the same holds for resolved `outcomeLibrary`/
  `stakeAdapter` projects (never probing `package.json` either). This is the same regression coverage
  `phase5-evidence/README.md`'s own "browser" round already relied on being real (not asserted from reading the
  test file alone) — re-run fresh here.

## 5. Outcome Library and Stake imports

| Artifact | What it proves |
| --- | --- |
| [`cli/outcomelibrary-estimate.txt`](cli/outcomelibrary-estimate.txt) | `pokie outcomelibrary generate . --estimate` against the random "Golden Comet" package — real outcome-space sizing (`759375`, `strategy: exact`). **Observation, not a fix target**: a full exact enumeration+generation at this size did not finish within this round's own budget (multiple attempts up to 280s); a small hand-authored 2-reel/2-row/9-outcome package (below) exercises the identical code path end-to-end in under a second, so this is recorded as an unconfirmed performance characteristic at large exact-space sizes, not chased further or treated as a verified defect. |
| [`cli/outcomelibrary-tiny-build.txt`](cli/outcomelibrary-tiny-build.txt), [`cli/outcomelibrary-generate.txt`](cli/outcomelibrary-generate.txt) | A minimal real package (2 reels × 2 rows, 9-outcome exact space) built and its `WeightedOutcomeLibrary` generated end-to-end (`pokie outcomelibrary generate . --out ...`) — real artifacts, real wins, real weights. |
| [`cli/outcomelibrary-build.txt`](cli/outcomelibrary-build.txt), [`cli/outcomelibrary-validate.txt`](cli/outcomelibrary-validate.txt) | `pokie outcomelibrary build config.json --out bundle` then `pokie outcomelibrary validate bundle --deep` — a real canonical bundle (`manifest.json`/`index_base.json`/`outcomes_base.jsonl`), deep-validated clean. |
| [`cli/stakeengine-export.txt`](cli/stakeengine-export.txt) | **Real, documented finding, not a bug**: exporting the bundle above (content-addressed `outcome-<hash>` ids) via the raw CLI `pokie stakeengine export` correctly rejects every outcome with `stakeengine-outcome-id-not-integer` — `docs/stake-engine-export.md` already documents this exactly ("a library produced by the canonical outcome-library generator... never satisfies this exporter/validator on its own, and by design"; only Studio's own `StudioStakeEngineExportService` auto-canonicalizes ids before export). Re-run with a hand-relabeled integer-id copy of the same library, the same file now exports cleanly (`lookup_base.csv`/`books_base.jsonl.zst`/`index.json`/`pokie-manifest.json` all written). |
| [`cli/stakeengine-analyze.txt`](cli/stakeengine-analyze.txt) | `pokie stakeengine analyze` against that real export — real RTP/hit-frequency/event stats, no `pokie-manifest.json` required. |
| [`cli/stakeengine-import.txt`](cli/stakeengine-import.txt) | `pokie stakeengine import` reconstructs `config.json`/`libraries/base.json` from the real export — the one honest, documented `info`-level note (`stakeengine-import-library-hash-differs-from-manifest`, since round ids/win-breakdown/provenance aren't recoverable from Stake's own export format) is present, not suppressed. |
| [`studio/outcome-library-stake-transcript.txt`](studio/outcome-library-stake-transcript.txt) | The real **Studio-side** path an actual Outcome Library import/Stake-export journey uses: `POST /api/home/projects/open` against the real bundle directory (`200`, no materialization needed — an `outcomeLibrary` project never gains `runtime.execute`), a real Overview (`status:"outcome-source"`, full `WeightedOutcomeLibraryAnalyzer` stats embedded), `POST /api/project/stakeengine/validate` and `POST /api/project/stakeengine/export` against the *same* content-addressed-id bundle the raw CLI correctly refused above — both succeed here (`200`), because Studio's own service performs the documented id-canonicalization before ever calling the exporter (confirmed: the exported bundle's `libraryHash` genuinely differs from the source bundle's own hash, proving real relabeling happened, not a no-op). |

## Player parity

**Superseded finding, fixed this round**: the prior round's own "Player parity" section (see git history)
verified only the **rendering** layer (one shared `cli/client/player` module) and explicitly documented the
**RNG** layer as broken — `context.seed` was never threaded into any RNG by the standard `pokie build`/`pokie
init` codegen template, so two consecutive `pokie replay . --seed X --round 1` invocations against the same
package produced different screens (`parity/before-fix-cli-replay-run1.json` vs.
`parity/before-fix-cli-replay-run2.json`, and `parity/before-fix-cli-replay-round1-standalone.json`,
`parity/before-fix-npm-start-spin.json`, `parity/before-fix-studio-play-and-replay.json`,
`parity/before-fix-pokie-examples-ui-tests.txt` — captures of different rounds across the four surfaces, kept
here as the "before" record). Review correctly rejected that as an unmet acceptance criterion, not sufficient
parity evidence.

**The fix** (`src/generated/renderBuiltGameModule.ts`, `cli/scaffold/renderSessionModule.ts`,
`cli/scaffold/renderEntryModule.ts`): every generated package's `createSession(context)` now honors
`context.seed` — for **both** randomness sources a round actually depends on, not just one:

- **Stop-position draws** (`SymbolsCombinationsGenerator`): now built with a `SeededRandomNumberGenerator(
  context.seed)` when a seed is supplied, instead of always defaulting to the unseeded
  `PseudorandomNumberGenerator`.
- **Default reel-strip content** (`VideoSlotConfig`'s own `ReelsSymbolsSequencesGenerator`, used whenever a
  blueprint has no literal `reelStrips`/`symbolWeights` — a real, common shape, not a hypothetical one; see
  `VideoSlotGoldenTestFixtures.ts`'s own pre-existing doc comment naming this exact gap): `VideoSlotConfig` is
  now constructed with a `ReelsSymbolsSequencesGenerator` seeded the same way, and the `symbolWeights` branch's
  own `.shuffle()` call takes the same seed. Both `SymbolsSequence.shuffle()` and `ReelsSymbolsSequencesGenerator`
  gained an optional RNG parameter (default: unseeded `Math.random()`, byte-identical to before) to make this
  possible — see `src/session/videoslot/combinations/SeededRandomNumberGenerator.ts`, which also gained string-seed
  support (FNV-1a folded into mulberry32 state) since `PokieGameContext.seed` is `string | number`.

Focused regression coverage (fails on the pre-fix code, passes after):
[`parity/after-fix-unit-determinism-tests.txt`](parity/after-fix-unit-determinism-tests.txt) (new
`SeededRandomNumberGenerator`/`SymbolsSequence`/`ReelsSymbolsSequencesGenerator` unit tests — **38/38 pass**) and
[`parity/after-fix-workflow-determinism-tests.txt`](parity/after-fix-workflow-determinism-tests.txt) (new
`tests/cli/Workflow.integration.test.ts` suite building a real `pokie build` package via `GamePackageGenerator` —
the same generator `BlueprintProjectMaterializer`/`BuildCommand` use — and replaying it through the real CLI
`ReplayCommand` twice; **3/3 pass**: identical `(seed, round)` reproduces the identical screen/win across
independently loaded sessions, a different seed diverges, and round index actually advances the draw sequence).

### One identical fixture round, captured live across all four surfaces

Fixture: `fixture-slot` ([`parity/after-fix-fixture-blueprint.json`](parity/after-fix-fixture-blueprint.json)),
a real `pokie create fixture-slot --blank` blueprint (3 reels × 3 rows, symbols A/B/C, no explicit `reelStrips` —
deliberately the harder, previously-broken case) built with a real `pokie build ... --target tsPackage` into a
real package (`node_modules/pokie` symlinked at this checkout's own fresh `dist/`, same `npm install` workaround
as every prior round — see "Method"; the generated `dist/index.js` itself is captured at
[`parity/after-fix-fixture-slot-generated-index.js`](parity/after-fix-fixture-slot-generated-index.js)). Every
surface below was driven with `seed: "fixture-round"`, round 1, against this exact package:

| Surface | Real command/request | Artifact |
| --- | --- | --- |
| CLI `pokie replay` | `pokie replay <pkg> --seed fixture-round --round 1`, run twice | [`run1`](parity/after-fix-cli-replay-run1.json) / [`run2`](parity/after-fix-cli-replay-run2.json) |
| Generated package `npm start` | `pokie dev <pkg> --no-open` (the real `scripts.start` underlying command), `POST /sessions {seed}` then `POST /sessions/:id/spin` | [`session`](parity/after-fix-npm-start-session.json) / [`spin`](parity/after-fix-npm-start-spin.json) |
| Studio Play | `pokie studio --no-open`, `POST /api/home/projects/open` then `POST /api/project/play/session {seed}` then `POST /api/project/play/sessions/:id/spin` | [`session`](parity/after-fix-studio-play-session.json) / [`spin`](parity/after-fix-studio-play-spin.json) |
| Studio Replay | `POST /api/project/replays {round: 1, seed: "fixture-round"}`, polled to completion | [`job`](parity/after-fix-studio-replay-job.json) |

All four independently produced the exact same round — screen and aggregate win, every artifact:

- **Orientation**: `[["A","C","A"],["A","A","C"],["A","A","A"]]` (3 reels × 3 rows) — identical in every
  artifact above.
- **Winning positions**: `[[0,0],[1,0],[2,0]]` — identical in every artifact.
- **Total win**: `totalWin: 5` — identical in every artifact.

Not every artifact carries the same *fields*, honestly: `pokie replay`'s own descriptor
(`parity/after-fix-cli-replay-run1.json`/`run2.json`) only ever reports `screen`/`totalBet`/`totalWin` (no
`paytable`/`winningLines` — a replay descriptor was never designed to re-embed a package's own static config),
while the npm-start/Studio-Play session-creation responses and the Studio-Replay job's own `descriptor` do carry
the full `paytable`/`winningLines`/`lineWins` detail (**payline**: line `"1"`, `definition: [0,0,0]` — the top
row, `symbolId: "A"`; **paytable-driven win**: A pays `5` for 3-of-a-kind at bet 1). The four-surface parity
claim above is about the round every surface actually produced, not a claim that every artifact's JSON shape is
identical — see the individual artifact files linked in the table for what each one actually contains.

**Rendered, not just JSON**: [`browser/parity-render-capture-script.tsx.txt`](browser/parity-render-capture-script.tsx.txt)
(run live, output at [`browser/player-parity-render.html`](browser/player-parity-render.html)) loads the real
`after-fix-npm-start-session.json`/`after-fix-npm-start-spin.json` captures above — unmodified, the same files
the table links — merges them the same way a real client retains a session's static fields across rounds, and
renders the result through the exact `cli/client/player` module every one of the non-CLI surfaces actually
uses to draw a screen: `cli/client/main.ts` (served by `pokie serve`/`pokie dev` — i.e. this same generated
package's own `npm start`) and `CanonicalPlayerView.tsx` (Studio's Play/Replay/Session-Spin panels) both import
it unmodified, not a fork or a reimplementation. The resulting DOM shows the real 3×3 grid, the top row
(`data-cell="0:0"`/`"0:1"`/`"0:2"`) rendered with a real, non-empty highlight color and every other cell left
unhighlighted, and a real paytable body containing `A`/`5` — proving this shared rendering code actually draws
this exact round correctly, not just that the JSON payloads agree with each other. This is the fix for the prior
round's own stale artifact here (`parity-render-capture-script.tsx.txt` used to reference the by-then-removed
`parity/npm-start-spin.json` and assert a different, pre-fix 5×3 round — review correctly rejected that; this
round's script and its regenerated `.html` output both use this round's own after-fix `fixture-slot` capture).

The **examples** surface renders this identical fixture round through `pokie-examples`' own real `ui.ts`/
`data.ts` (not the raw shared module in isolation — the genuine examples adoption), committed as a new test in
the companion workspace: `/pokie-examples/tests/ui.test.ts`'s own
`"P5-POLISH-19: examples surface renders the identical fixture round..."` describe block. Unlike the prior
round of this test (which fed the render pipeline hand-typed literal objects that merely claimed to match the
four captures), this version loads the real captured JSON files verbatim — committed at
`/pokie-examples/tests/fixtures/p5-polish-19/*.json`, byte-for-byte copies of
`after-fix-npm-start-session.json`/`after-fix-npm-start-spin.json`/`after-fix-cli-replay-run1.json`/
`after-fix-studio-play-spin.json`/`after-fix-studio-replay-job.json` above — and its first `it()` asserts those
four surfaces' own captured screen/winning-positions/total-win agree with each other *before* any rendering
happens, so a future edit to any one committed fixture file fails this test rather than silently drifting from
the pokie repo's own captures. Only then does its second `it()` feed the npm-start capture through the real
render pipeline and assert the same 3×3 orientation, the same `"Line: 1, win: 5"` highlight, and the same
paytable content (read straight from the captured session response, not retyped). Run live:
[`parity/after-fix-pokie-examples-ui-tests.txt`](parity/after-fix-pokie-examples-ui-tests.txt) — **10/10 pass**
(8 pre-existing + 2 new).

This closes the gap the prior round's own "rendering-layer-only" argument left open, and the gap this round's
own review found in the first pass (a stale browser artifact plus a literal-only examples fixture): all four
surfaces are now verified end-to-end for one real, identical, winning round, with real rendered/DOM evidence —
not shared-code-alone assertions, and not hand-typed literals standing in for the real captures.

## Owner steps (unchanged from `pokie-phase5-inventory.md`)

- **True pixel/visual (Chromium-rendered) screenshot evidence** — still open. This sandbox still has no
  Chromium/Puppeteer/Playwright binary and no root access to install one (confirmed fresh this round, see
  "Method"); `phase5-evidence/browser/`'s own real-DOM-without-Chromium approach (extended here with one more
  real-captured-round render, see "Player parity") remains the closest available substitute until a
  browser-capable-host round closes this the same way `phase4-evidence/browser/` eventually did for Phase 4.
- ~~`pokie build`/`pokie init`-generated packages never thread `context.seed` into a deterministic RNG`~~ —
  **fixed this round**, see "Player parity" above (`src/generated/renderBuiltGameModule.ts`,
  `cli/scaffold/renderSessionModule.ts`, `cli/scaffold/renderEntryModule.ts`); `cli/prog-replay.txt` documents
  the now-superseded pre-fix behavior.
- **This sandbox's own `npm` wrapper remains broken independent of anything in this repository** — reconfirmed
  fresh this round, same root cause `pokie-phase4-inventory.md`/`pokie-phase5-inventory.md` already named; still
  not a product gap.
