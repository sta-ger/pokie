[← Back to docs index](../README.md)

# P5-POLISH-01 sandbox-evidence artifacts

Raw transcripts backing the "Method" and findings sections of
[`pokie-phase5-inventory.md`](../pokie-phase5-inventory.md). Gathered 2026-08-07 in the implementer sandbox this
step actually ran in — this sandbox has no browser binary, no Puppeteer/Playwright, and no root/`apt-get` access
to install one (reproduced below), so this round's process/HTTP evidence (CLI transcripts, a real Studio HTTP
server driven by real `fetch()` calls, a real fresh build) is real and non-mocked but was not, on its own,
browser/DOM-rendering evidence. A same-day correction round closed that specific gap without a Chromium binary
ever becoming available — see [`browser/README.md`](browser/README.md) for how and what it captured. This
mirrors `pokie-phase4-inventory.md`'s own original P4-POLISH-01 round, which hit the identical sandbox
constraint and left visual/DOM capture to a later round (see that document's §4).

## Build (`build/`)

| Artifact | What it proves |
| --- | --- |
| `build-transcript.txt` | This sandbox's `npm` (`/usr/local/bin/npm`) rejects every invocation with a `dash` syntax error (full wrapper source included) — the same defect class `phase4-evidence/npm-wrapper-repro.txt` recorded, reproduced fresh this round. The full `build-esm`/`build-cjs`/`build-cli` pipeline (`generate-barrels` → `tsc` ×4 → `shx` copies → `vite build` → `shx chmod`) was instead run by invoking each `node_modules/.bin/*` tool directly, in the same order and with the same arguments `package.json`'s own scripts use — a real, complete, fresh build from HEAD `085c6041625db5c9a93cb7e921dc72b2c78e79f0`, not a partial one. |
| `dist-tree.txt` | The resulting `dist/` directory tree (5395 files across `esm/`, `cjs/`, `cli/`, including `cli/studio-client/`'s Vite bundle) and confirmation no `dist/` existed before this build (`dist/` is `.gitignore`d, never committed) — this build's output is entirely fresh source compilation, not stale/inherited compiled output. |
| `artifact-builder-registry-output.txt` | `ArtifactBuilderRegistry` (`src/project/ArtifactBuilderRegistry.ts`) actually instantiated and queried (`listTargets()`/`describe()` for all 5 targets) against the fresh build's own `dist/esm/index.js` — not read from source/comments alone. Confirms `outcomeLibrary`/`stakeAdapter`/`parWorkbook`'s single-source-type `supportedSources` (each only "supported" from its own already-resolved type) matches `UNSUPPORTED_NOTES`' documented semantics exactly (these operations package/export already-computed data, never derive it from a blueprint/tsPackage) — verified correct, not a gap. |
| `stale-barrel-diff.txt` | **Real finding, see inventory §2.** Running `generate-barrels.js` (the literal first step of `build-esm`/`build-cjs`) against the committed HEAD tree changes `src/index.ts`, adding a previously-missing `export * from "./session/videoslot/betmode/supportsBetModeSelecting.js"`. The committed barrel has been stale since the introducing commit (`6b99671`, `[P4-POLISH-09]`); this file was reverted (`git checkout -- src/index.ts`) immediately after capture — this step changes no product source. |

## CLI (`cli/`)

| Artifact | What it proves |
| --- | --- |
| `pokie-help.txt` | Real `pokie --help` output from the fresh build (top-level command list). |
| `subcommand-help.txt` | Real `--help` output for every one of the 22 top-level commands (`build`, `create`, `init`, `reel`, `studio`, `serve`, `dev`, `client`, `sim`, `replay`, `validate`, `inspect`, `certification`, `fairness`, `outcomelibrary`, `outcomesource`, `par`, `stakeengine`, `name`, `diff`, `report`), cross-checked against `docs/cli.md`'s own `## \`pokie ...\`` section headings — every command documented there is present here and vice versa. |
| `nested-subcommand-help.txt` | Real `--help` output for every second-level subcommand with its own help (`build random`, `par import`/`export`, `reel generate`, `stakeengine export`/`import`/`analyze`/`diff`, `outcomelibrary generate`/`build`/`validate`, `outcomesource inspect`/`sample`/`diff`, `certification build`/`verify`, `fairness seed-commit`/`commit`/`reveal`/`verify`) — 19 real `Usage:` blocks, zero errors. |
| `create-blank.txt`, `create-blank-2.txt` | `pokie create <path> --blank` genuinely rejects any argument containing `/` or a space as a "name" (`GamePackageCreator`'s own `isValidProjectName`) — the CLI's own `--help` already says `name` is a preset name, not a path (confirmed by re-reading `create --help`, not assumed); this is correct behavior, not a space-path gap, once the actual `--out <file>` contract is used instead (see `create-blank-3.txt`). |
| `create-blank-3.txt` | `pokie create --blank --out "<space-containing dir>/My Blueprint.blueprint.json"` succeeds cleanly — the real space-path contract for `create`. |
| `create-random.txt` | `pokie create --random --seed 7 --out <path>` — a real, reproducible random blueprint with `reelStripGeneration` entries, used as input to `reel generate` and `build` below. |
| `build-blank-dryrun.txt` | `pokie build <blank blueprint> --dry-run` — real dry-run summary, no files written. |
| `reel-generate.txt` | `pokie reel generate` against a blueprint with no `reelStripGeneration` — the real, correctly-worded rejection. |
| `reel-generate-2.txt` | `pokie reel generate` (preview, all reels) and `--reel 0 --format json` (single-reel JSON with full diagnostics/analysis) against the real random blueprint — both real, non-mocked `ReelStripGenerator` runs. |
| `build-random.txt`, `build-random-repro.txt` | **Real finding, see inventory §3.** `pokie build random --seed 42 --target <dir>` exits 1 on every fresh invocation: package generation succeeds, but the bundled post-build smoke simulation fails because the freshly generated package's own `"pokie"` npm dependency was never installed (`node_modules/pokie` does not exist yet). Re-run with the same seed reproduces byte-identical generated files (`diff -rq`, `DIFF-EXIT:0`) — the *generation* is correctly deterministic; only the smoke-sim step is broken by construction. |
| `build-real-pkg.txt` | `pokie build <random blueprint> --target <dir>` (non-`random` path) — no smoke simulation runs at all for an explicit-blueprint build, confirming the failure above is specific to `build random`/`--random`. |
| `inspect-validate-sim.txt` | `pokie inspect`/`pokie validate` against the just-built package before any dependency is installed — `inspect` succeeds (reads `package.json` only), `validate` fails with the same honest `Cannot find module 'pokie'` diagnostic, pointing at `npm install`. |
| `validate-linked.txt` | The same package with `node_modules/pokie` manually symlinked to this build's own source (working around the sandbox's broken `npm`, not a POKIE fix) — `validate`, `sim` (2000 rounds, real RTP/hit-frequency output), and `replay` (a real single-round replay) all succeed. Proves the failures above are the sandbox's broken `npm` plus `build random`'s own missing-install-step gap, not a deeper package/runtime defect. |
| `init.txt` | `pokie init "<space dir>"` — package scaffolding succeeds, then `npm install` fails with this sandbox's own broken-`npm` message, surfaced by `pokie init` as an honest, actionable error naming the exact command and directory to retry. |

## Studio (`studio/`)

Real Studio server (`pokie studio <pkg> --port 4173 --no-open`, no jsdom/mocked transport) driven by real
`fetch()` calls from a separate Node process, then shut down at the end of the round (confirmed: a following
health check against port 4173 fails with `fetch failed`).

| Artifact | What it proves |
| --- | --- |
| `api-transcript-1.txt` | `/api/health`, `/api/project/context` (loaded `tsPackage`), `/api/project/inspect`, `/api/project/validate`, `/api/project/runtime/start` (real runtime session server + player URL). |
| `api-transcript-2.txt` | `/api/project/runtime/sessions` (real session creation, full `VideoSlotConfig`-shaped session payload), `/api/project/runtime` (status), and the real player HTML served at the runtime's own `playerUrl` (`<title>POKIE client preview</title>`, real markup, not a stub page). |
| `api-transcript-3.txt` | Two real spins (`POST .../sessions/<id>/spins`, different bet amounts), `GET .../sessions/<id>` (session-by-id), `/api/project/runtime/spins` (recent-spins log with full debug payload), `/api/project/reports` (empty before any simulation), `/api/project/deployment/targets`/`build-modes`. |
| `api-transcript-4.txt` | A real simulation (`POST /api/project/simulations`, 1000 rounds) through to its completed report (`GET /api/project/reports`, real RTP/hit-frequency), a real replay run (`POST`/`GET /api/project/replays`), and `/api/project/deployment/runs`' real request validation (`"modes" must be a non-empty array`). |
| `api-transcript-5.txt` | **Real finding, see inventory §4.** `/api/project/deployment/runs` validation continues correctly (`modes[0].modeName must be a non-empty string`) — Build/Export's request validation is real and layered, not stubbed. The **Blueprint Design Game** surface (`/api/home/blueprints/random`, `/validate`, `/build-preview`, `/reel-strip-generation-preview`) all responded for real (a fresh random blueprint, its validation, its build preview, and its reel-strip analysis) — but `build-preview`'s own `projectRoot` defaulted to `/workspace/peppy-frisky-talisman`, i.e. this Studio process's own launch-time `cwd`, not any project-scoped location. The actual `/api/home/blueprints/build` endpoint was deliberately never called (it would write files), so nothing was written to `/workspace` by this evidence pass — confirmed clean by `git status --short` immediately after. |

## Browser/DOM-rendering (`browser/`)

**Added in the correction round** (see [`browser/README.md`](browser/README.md) for the full "How"). Real
production Studio-client React components, mounted in this project's own `jest-environment-jsdom` harness
(`renderRoutedApp`, already used by `tests/cli/studio-client/src/**/*.test.tsx`), wired to a real
`pokie studio <pkg> --port 4590 --no-open` HTTP server via a real `node:http` client — not the fake `fetchImpl`
every existing test in this repo uses. This sandbox still has no Chromium binary, so there is no pixel
screenshot; these are real, executed-application DOM snapshots instead (`document.documentElement.outerHTML`),
covering the dashboard/overview, Play (both idle and, after a real `userEvent.click`, running with a real
embedded-player `<iframe>`), Runtime, Replay, Build/Export, and the Blueprint Design Game — see
`browser/README.md`'s own artifact table.

## `pokie-examples` sync and real-test evidence

Not re-captured as a separate transcript file (both commands were run directly, output already quoted in the
inventory): `git fetch https://github.com/sta-ger/pokie-examples.git develop` (SSH egress is unavailable in this
sandbox — `cannot run ssh: No such file or directory` — HTTPS works) resolved `origin/develop` to
`af432206a435db5c1063ca5cd9dd81652b886a6e`, confirmed a strict ancestor of the companion worktree's own clean
`HEAD` (`cce80629df0bcf2be56c48077a12a64db8dd6541`, 2 commits ahead — the already-committed
`P4-POLISH-09` migration). `node node_modules/jest/bin/jest.js --selectProjects pokie-examples` (direct
invocation, same "Method" as `phase4-evidence`) passed all 8 real tests in `../pokie-examples/tests/ui.test.ts`
against this round's own fresh build. `node node_modules/.bin/vite build` inside `/pokie-examples` (its own
local `vite`, not the broken system `npm`) built all nine example games cleanly from source.
