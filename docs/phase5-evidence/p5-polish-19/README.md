[← Back to phase5-evidence index](../README.md)

# P5-POLISH-19 real-user-journey evidence

**Step:** `[P5-POLISH-19]` "Prove end-to-end real user journeys." Gathered 2026-08-08 against product `HEAD`
`c9a1c43921becbc1c5e5429e78d7f34073c969ad`, a fresh build from source (see "Method"). Companion
(`/pokie-examples`) confirmed synced: local `develop` `4a65860e3e770a441b0f88cf71ed4b952f3b3d9b` is `origin/develop`
(`af432206a435db5c1063ca5cd9dd81652b886a6e`, fetched fresh over HTTPS — SSH is unavailable in this sandbox, same
as every prior round) plus 5 already-committed local commits, confirmed via
`git merge-base --is-ancestor FETCH_HEAD HEAD`; no divergence. This round made **no new commits in
`/pokie-examples`** — its own adoption of `pokie/client/player` (landed by `9e242fa`/`4a65860`) is exercised
as-is, not modified.

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
  everywhere else, and `browser/README.md`'s own "What this is not" for the jsdom-vs-Chromium boundary this round
  still cannot close (tracked, unchanged, in "Owner steps" below).

## 1. Programmer persona: `init` / `npm start` / `npm build` / `sim` / `build`

| Artifact | What it proves |
| --- | --- |
| [`cli/init-real-attempt.txt`](cli/init-real-attempt.txt) | A real, unmodified `pokie init <dir> --package-name ... --game-id ...` (no workaround flags) scaffolds `package.json`/`tsconfig.json`/`README.md`/`src/index.ts` for real, then honestly fails at `npm install` with this sandbox's own broken-wrapper message, naming the exact retry command — the real first-contact failure mode, not glossed over. |
| [`cli/prog-npm-build.txt`](cli/prog-npm-build.txt) | `npm run build`'s real underlying command (`tsc`, per the scaffolded `package.json`'s own `scripts.build`) invoked directly against the linked package — a real `dist/index.js` compiled from the scaffolded `src/index.ts`. |
| [`cli/prog-npm-start.txt`](cli/prog-npm-start.txt), [`cli/prog-npm-start-server.log`](cli/prog-npm-start-server.log) | `npm start`'s real underlying command (`pokie dev .`, per `scripts.start`) actually started as a real child process, polled on its own real `/health` route, then driven through a real `POST /sessions` (seeded) and `POST /sessions/:id/spin` — a genuine win captured (`totalWin: 1`, a Q line) — before being cleanly killed. Also proves the served `/`-root client preview (`pokie client`'s own HTML shell) responds `200`. |
| [`cli/prog-sim.txt`](cli/prog-sim.txt), [`cli/prog-sim-report.json`](cli/prog-sim-report.json) | `pokie sim . --rounds 500 --seed demo-sim --out ...` — a real, seeded simulation report (RTP/hit-frequency/volatility) against the linked package. |
| [`cli/prog-replay-help.txt`](cli/prog-replay-help.txt), [`cli/prog-replay.txt`](cli/prog-replay.txt) | `pokie replay . --seed ... --round 1` — a real replay descriptor. **Real finding, see "Determinism" below**: two consecutive replays of the identical `(seed, round)` against this same package produced *different* screens — this package's own `createSession()` (the standard `pokie build`/`pokie init` codegen template) never threads `context.seed` into any RNG at all, so `--seed` here is inert for a stock generated package; this is documented, not silently discovered — `ReplayRecorder`'s own source comment already says reproducibility "depends entirely on the game package actually threading context.seed into a deterministic setup." |
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

The instruction's own four surfaces — examples, package `npm start`, Studio Play, Studio Replay — are not four
independent implementations to keep in sync by hand; `pokie-examples`' own `9e242fa`/`4a65860` (already landed,
confirmed synced in "Provenance" above) and this repo's own `CanonicalPlayerView.tsx` both already point this
out in their own doc comments: **all four import and call the exact same `cli/client/player` module** —
`cli/client/main.ts` (served by `pokie serve`/`pokie dev`/embedded in Studio Play's own `<iframe>`),
`CanonicalPlayerView.tsx` (Studio's own Play/Replay/Session-Spin panels), and `pokie-examples/src/ui/ui.ts`
(every example) all call `renderReelsGrid`/`applyPersistentHighlights`/`renderWinHighlightsList`/`renderPaytable`/
etc. from that one module, never a second, independently-maintained re-implementation. This round verified that
claim two ways rather than trusting the doc comments alone:

1. **Real regression suite, run live**: `node node_modules/.bin/jest --selectProjects pokie-examples` — see
   [`parity/pokie-examples-ui-tests.txt`](parity/pokie-examples-ui-tests.txt). **8/8 real tests pass**, each one
   asserting the shared module actually renders a real grid/win-highlight/paytable/bet-selection/mode-selection/
   error-retry correctly for a real example game — not mocked, not a stub renderer.
2. **A real captured round, rendered through the literal shared module in a real DOM**:
   [`parity/npm-start-spin.json`](parity/npm-start-spin.json) (the real winning spin §1's `npm start` evidence
   captured, `totalWin: 1`, a Q line win at positions `[[0,1],[1,1],[2,1]]`) was fed through
   `renderReelsGrid`/`applyPersistentHighlights`/`renderPaytable` — imported from `cli/client/player` by real
   relative path, unmodified — inside this project's own `jest-environment-jsdom` harness (the same one
   `phase5-evidence/browser/` used, `studio-client-components` project). The resulting real DOM
   ([`browser/player-parity-render.html`](browser/player-parity-render.html), capture script at
   [`browser/parity-render-capture-script.tsx.txt`](browser/parity-render-capture-script.tsx.txt)) shows: a 5×3
   grid with exactly the captured symbols, the three captured winning cells each carrying a real applied
   highlight color (every other cell left unhighlighted), and the paytable body containing the real Q payout row
   — asserted, not eyeballed, before the DOM was ever written out.

**Why not one seed threaded live across all four servers instead**: this round tried that first and hit a real,
verified fact rather than a broken test — see §1's "real finding" on `pokie replay`'s own seed determinism.
`context.seed` is not threaded into any RNG by the standard `pokie build`/`pokie init` codegen template (only a
hand-authored game that explicitly constructs its own `SeededRandomNumberGenerator`, like `pokie-examples`' own
`verifiable-spin`, gets seed-reproducible rounds — confirmed by reading that example's own `index.ts` and
comparing against the generated template's `createSession()`, which takes no parameters at all). Two consecutive
`pokie replay . --seed X --round 1` invocations against the same package produced different screens, proving
this empirically rather than assuming it from the source. Since the actual, real parity guarantee this codebase
provides is at the **rendering** layer (one shared module) rather than the **RNG** layer (no shared seed
contract across a generated package's independent server processes), that is the guarantee this round verified,
concretely, with a real captured round — not a jsdom-only claim standing in for it, since the round rendered was
real, captured live from a real running `pokie dev` server, not invented.

## Owner steps (unchanged from `pokie-phase5-inventory.md`)

- **True pixel/visual (Chromium-rendered) screenshot evidence** — still open. This sandbox still has no
  Chromium/Puppeteer/Playwright binary and no root access to install one (confirmed fresh this round, see
  "Method"); `phase5-evidence/browser/`'s own real-DOM-without-Chromium approach (extended here with one more
  real-captured-round render, see "Player parity") remains the closest available substitute until a
  browser-capable-host round closes this the same way `phase4-evidence/browser/` eventually did for Phase 4.
- **`pokie build`/`pokie init`-generated packages never thread `context.seed` into a deterministic RNG** — a
  real, verified fact (see "Player parity" above and `cli/prog-replay.txt`), not previously named in
  `pokie-phase5-inventory.md`. Not fixed here (out of this step's own scope, and `ReplayRecorder`'s existing
  "best-effort" framing suggests it may be intentional rather than an oversight) — flagged for whichever later
  step owns codegen/replay determinism to decide whether standard generated packages should gain an opt-in
  seeded-RNG mode the way `verifiable-spin` hand-wires one today.
- **This sandbox's own `npm` wrapper remains broken independent of anything in this repository** — reconfirmed
  fresh this round, same root cause `pokie-phase4-inventory.md`/`pokie-phase5-inventory.md` already named; still
  not a product gap.
