[← Back to docs index](README.md)

# POKIE Phase 5 current-state baseline (v1)

**Step:** `[P5-POLISH-01]`. **Status:** baseline, frozen 2026-08-07 against product `HEAD`
`085c6041625db5c9a93cb7e921dc72b2c78e79f0` (identical to local `develop`; itself an orchestrator merge commit,
`merge task task/P4-POLISH-12-20260806201937 (implementation 9ee6d2a1c9aa)`). This document is a discovery/
evidence slice, not a cleanup slice: it changes no product behavior, closes no gap it names, and does **not**
declare Phase 4 "accepted" — it freezes what the tree actually does today, the same role
[`pokie-phase4-inventory.md`](pokie-phase4-inventory.md) served ahead of Phase 4 and
[`pokie-phase3-inventory.md`](pokie-phase3-inventory.md) served ahead of Phase 3.

**Correction round (same day):** the round frozen at `edfc2457b893ac6b8bd72d3569a0fbf7a2325598` recorded no
browser/DOM-rendering evidence (§5 named the gap rather than closing it) and, since it received no roadmap step
numbers of its own, did not map its findings to any later step. Both are addressed below without touching
product source: §5 now documents real browser/DOM evidence gathered via this project's own `jest-environment-
jsdom` harness (see [`phase5-evidence/browser/README.md`](phase5-evidence/browser/README.md)), and "Owner steps"
now maps every finding to the later Phase 5 step that owns it, using the step IDs this correction's own
instruction supplied.

**Scope, per this step's own instruction:** synchronize both `develop` branches (this repo and the companion
`pokie-examples` repo), lock exact SHAs, and record an executable, browser-backed inventory before any Phase 5
product change — exercising `BuildCommand`, `ArtifactBuilderRegistry`, the project dashboard/overview/play/
runtime/replay/build-export surfaces, the Blueprint Design Game, `reel generate`, `create`/`init`, exhaustive
Commander help, `pokie-examples`, and docs as real, driven surfaces rather than trusting existing tests/
comments — then map every gap this pass surfaces to a later step, without inventing roadmap step numbers this
step's own instruction never supplied (see "Owner steps" below).

## Method

This sandbox's `npm` (`/usr/local/bin/npm`, provisioned outside this worktree/repo) rejects every invocation
with a `dash` syntax error, the same defect class `pokie-phase4-inventory.md`'s own "Method" section
documented (see [`phase5-evidence/build/build-transcript.txt`](phase5-evidence/build/build-transcript.txt) for
the reproduction and wrapper source). Every build/test/CLI/HTTP action below was instead run by invoking the
underlying tool directly (`node node_modules/.bin/tsc`, `.../vite`, `.../jest`, `.../shx`, and the built
`dist/cli/pokie.js` itself) — the same "Method" precedent `pokie-phase4-inventory.md` established, extended
here to a full fresh build rather than only test/lint/typecheck invocation.

This sandbox also has **no browser binary, no Puppeteer/Playwright package, and no root/`apt-get` access** to
install one (`apt-get install` fails with `Unable to acquire the dpkg frontend lock`, confirmed non-root
`uid=1000`) — the same constraint the original P4-POLISH-01 implementer round hit before a later
browser-capable-host round added `phase4-evidence/browser/` screenshots. This round's evidence is therefore
real, non-mocked **process** and **HTTP** evidence — a genuinely fresh build, real CLI invocations against real
generated files, and a real `pokie studio` HTTP server driven by real `fetch()` calls (not jsdom, not a stubbed
transport) — not screenshots. That gap is named explicitly in "Owner steps" below rather than silently
represented as closed. Network egress over HTTPS works (verified: `fetch('https://github.com')` → 200); SSH
does not (`cannot run ssh: No such file or directory`), which is why §1's `pokie-examples` sync below uses an
HTTPS fetch URL rather than the repo's own configured SSH remote.

Raw transcripts backing every claim below are saved under
[`phase5-evidence/`](phase5-evidence/README.md), organized the same way `phase4-evidence/` was.

## 1. Provenance: both `develop` branches, locked

**Product (this repo, POKIE):** this worktree's task branch (`task/P5-POLISH-01-20260807124442`) and local
`develop` both point at the identical commit `085c6041625db5c9a93cb7e921dc72b2c78e79f0`
(`merge task task/P4-POLISH-12-20260806201937 (implementation 9ee6d2a1c9aa)`, 2026-08-06T23:11:28+02:00) —
`git merge-base --is-ancestor develop HEAD` confirms `develop` is not ahead. Working tree was clean
(`git status --short` empty) at the start of this step and remains clean at the end (see §2 for the one
transient, reverted exception this step's own build tooling produced). This commit is itself the most recent
**orchestrator** integration point visible in this repo's own history — every `merge task .../ (implementation
...)` commit in `git log` is an orchestrator-authored merge, and `085c604` is the latest one, so "product HEAD"
and "orchestrator HEAD" are, as of this freeze, the same commit; there is no separate orchestrator-only ref this
worktree can see beyond that merge lineage.

**Companion (`pokie-examples`, `/pokie-examples`):** on branch `develop`, `HEAD`
`cce80629df0bcf2be56c48077a12a64db8dd6541`, working tree clean. The repo's own configured remote
(`git@github.com:sta-ger/pokie-examples.git`) is unreachable in this sandbox (no `ssh` binary); fetching the
same branch over HTTPS instead (`git fetch https://github.com/sta-ger/pokie-examples.git develop`) resolves
`origin/develop` to `af432206a435db5c1063ca5cd9dd81652b886a6e` — `git merge-base --is-ancestor` confirms it is a
strict ancestor of the companion worktree's own `HEAD`, i.e. the local `develop` is exactly `origin/develop`
plus the already-committed, already-reported `[P4-POLISH-09]` migration commits (`8048ace` "run
pokie-examples' own tests through this repo's jest, proving real adoption" and `cce8062` "fix round-error panel
visibility and assert it in tests" — see `pokie-phase4-inventory.md`'s own owner-step note on this migration).
Both branches are therefore synchronized and exact: no divergence, no unpushed-and-forgotten state, no stale
local ref masquerading as current.

## 2. Build: fresh source vs. stale compiled output

No `dist/` directory existed anywhere in this worktree before this step ran (`.gitignore:3` excludes it; it was
never committed) — there is no "stale compiled output" to distinguish from *within this worktree*; anything
under `dist/` after this step is entirely this step's own fresh compilation of `085c604`'s own `src/`/`cli/`.
`build-esm`, `build-cjs`, and `build-cli` (including `build-client`/`build-studio-client`) were all run to
completion, in the same order and with the same arguments as `package.json`'s own scripts, by invoking each
underlying tool directly (see "Method"); the result is a real, working `dist/cli/pokie.js` (5395 files across
`esm/`/`cjs/`/`cli/`, `cli/studio-client/`'s real Vite production bundle included) — see
[`phase5-evidence/build/build-transcript.txt`](phase5-evidence/build/build-transcript.txt) and
[`dist-tree.txt`](phase5-evidence/build/dist-tree.txt).

**Real finding — the committed `src/index.ts` barrel is itself stale, independent of any `dist/` question.**
`generate-barrels.js` (the literal first step of both `build-esm` and `build-cjs`) regenerates `src/index.ts`
from the actual `src/` file tree; running it against the committed `085c604` tree changes the file, adding
`export * from "./session/videoslot/betmode/supportsBetModeSelecting.js";` — a real, committed, actively-used
helper (`src/session/videoslot/betmode/supportsBetModeSelecting.ts`, consumed internally today by
`SpinCommandHandler.ts` and `VideoSlotSessionSerializer.ts` via relative imports) that has been silently absent
from the package's own **public** API (`import {supportsBetModeSelecting} from "pokie"`) since the commit that
introduced it, `6b99671` `[P4-POLISH-09] wire runtime bet-mode selection end to end and expose it in the
player` — an irony given that commit's own subject line. This went undetected because (a) every internal
consumer imports it by relative path, never through the public barrel, and (b) no test imports it from
`"pokie"` either (confirmed by grep across `tests/`) — `jest.config.mjs` maps `"^pokie$"` straight to
`<rootDir>/src/index.ts` (the raw, currently-stale file), so even the test suite's own module resolution
wouldn't have caught this without a test specifically exercising this one symbol's public-surface import. A
real, published `pokie build` (`npm run build`/`prepack`, which always runs `generate-barrels` first) would
*not* ship this gap — it only lives in the committed source snapshot. The diff was captured
([`phase5-evidence/build/stale-barrel-diff.txt`](phase5-evidence/build/stale-barrel-diff.txt)) and the working
tree was reverted (`git checkout -- src/index.ts`) immediately after — this step changes no product source; see
"Owner steps" for where fixing it belongs.

`ArtifactBuilderRegistry` (`src/project/ArtifactBuilderRegistry.ts`) was exercised directly (not just read)
against this fresh build — instantiated and queried for all five `ArtifactTargetType`s — confirming
`outcomeLibrary`/`stakeAdapter`/`parWorkbook` each report `supportedSources` containing only their own already-
resolved type. Read in isolation this looks circular; cross-checked against `UNSUPPORTED_NOTES`' own prose and
`docs/cli.md`'s description of `pokie outcomelibrary build`/`stakeengine export`/`par export` (each *packages
already-computed data*, never derives it from a blueprint or `tsPackage`), it is correct, intentional behavior,
not a gap — recorded here so a later reader doesn't have to re-derive the same "is this a bug" question from
the raw registry output alone. See
[`phase5-evidence/build/artifact-builder-registry-output.txt`](phase5-evidence/build/artifact-builder-registry-output.txt).

## 3. CLI surfaces: `create`/`init`, `build`, `reel generate`, exhaustive Commander help

Exhaustive Commander help was captured for real: all 22 top-level commands
([`subcommand-help.txt`](phase5-evidence/cli/subcommand-help.txt)) plus every second-level subcommand that
carries its own help — `build random`, `par import`/`export`, `reel generate`, `stakeengine
export`/`import`/`analyze`/`diff`, `outcomelibrary generate`/`build`/`validate`, `outcomesource
inspect`/`sample`/`diff`, `certification build`/`verify`, `fairness seed-commit`/`commit`/`reveal`/`verify`
([`nested-subcommand-help.txt`](phase5-evidence/cli/nested-subcommand-help.txt), 19 real `Usage:` blocks, zero
errors). Cross-checked against `docs/cli.md`'s own `## \`pokie ...\`` headings: every documented command is
present in the real `--help` output and vice versa — the docs are not stale relative to the actual CLI surface.

**`pokie create`** (`--blank`/`--random`/`--out`) was driven for real, including space-containing output paths
(`create-blank-3.txt`) and a reproducible `--random --seed 7` blueprint with real `reelStripGeneration` entries
(`create-random.txt`) used as input to the rest of this section. `create <path>` correctly rejects a path
containing `/` or a space as its `name` positional — re-reading the command's own `--help` (not assumed)
confirms `name` is documented as "optional preset name", not a path; the actual space-path contract is
`--out <file>`, which was exercised and works cleanly.

**`pokie reel generate`** was run against both a blueprint with no `reelStripGeneration` (the documented,
correctly-worded rejection) and the real random blueprint above — both dry-run preview and `--reel 0 --format
json` (full per-reel diagnostics/analysis: symbol counts, frequencies, circular distances) produced real,
non-fabricated output.

**Real finding — `pokie build random`/`--random` cannot succeed on a truly fresh invocation.**
`pokie build random --seed 42 --target <dir>` generates the package correctly (files created, deterministic —
re-running the identical command produces a byte-identical tree, `diff -rq` confirms), but then always exits 1:
its own post-build smoke simulation (`runSmokeSimulation` → a real, in-process `ParallelSimulationRunner`
against the just-generated `dist/index.js`) fails with `Cannot find module 'pokie'`, because the freshly
generated package's own `package.json` declares `"pokie": "^1.3.0"` as a real dependency that `pokie build`
never installs — the smoke-sim step runs before the "Next: cd ... && npm install" guidance the non-random
build path would otherwise reach. A non-`random` `pokie build <config.json>` (no smoke sim at all) is
unaffected. Manually linking `node_modules/pokie` to this build's own source (working around only this
sandbox's broken `npm`, not any POKIE defect) makes `validate`/`sim`/`replay` all succeed cleanly against the
same generated package — confirming the gap is specifically "the smoke-sim step assumes a dependency that was
never installed", not a deeper package/runtime problem. `tests/cli/commands/BuildCommand.test.ts` always injects
a fake `runSmoke` function (`createCommand(..., runSmoke)`); no existing fixture exercises the real
`runSmokeSimulation` implementation end-to-end, which is why this has gone unnoticed. See
[`build-random.txt`](phase5-evidence/cli/build-random.txt),
[`build-random-repro.txt`](phase5-evidence/cli/build-random-repro.txt), and
[`validate-linked.txt`](phase5-evidence/cli/validate-linked.txt).

**`pokie init`** was exercised against a space-containing directory: scaffolding (`package.json`, `tsconfig.json`,
`README.md`, `src/index.ts`) succeeds, then the real `npm install` step fails with this sandbox's own broken-`npm`
message — surfaced by `pokie init` as an honest, actionable error (exact command + directory to retry), not a
silent failure or a stack trace. This is this sandbox's own environment defect (same as the build wrapper
above), not a `pokie init` defect.

## 4. Studio surfaces: dashboard/overview/play/runtime/replay/build-export, Blueprint Design Game

A real `pokie studio <pkg> --port 4173 --no-open` server was started and driven by real `fetch()` calls from a
separate Node process — real `http.createServer`, not jsdom, not a stubbed transport — then shut down at the
end of this pass (a following `/api/health` check against the same port fails with `fetch failed`, confirming
it did not leak). Full transcripts: [`phase5-evidence/`](phase5-evidence/README.md) (see its Studio table for the
file-by-file breakdown). Exercised for real: `/api/health`,
`/api/project/context` (Overview/dashboard load), `/api/project/inspect`, `/api/project/validate`,
`/api/project/runtime/start` + `/sessions` + `/sessions/:id/spins` (two real spins at different bet amounts) +
`/sessions/:id` + `/spins` (Play/Runtime), the real player HTML served at the runtime's own `playerUrl`
(genuine markup, not a stub), `/api/project/simulations` → `/api/project/reports` (a real 1000-round simulation
run to completion), `/api/project/replays` (a real replay run), and `/api/project/deployment/targets`/
`build-modes`/`runs` (Build/Export, including its own layered request validation:
`"modes" must be a non-empty array` → `modes[0].modeName must be a non-empty string`).

**Blueprint Design Game** (`/api/home/blueprints/random`, `/validate`, `/build-preview`,
`/reel-strip-generation-preview`) was exercised for real too — a fresh random blueprint, its validation, its
build preview, and its full reel-strip analysis all returned real, non-fabricated responses.

**Real finding — Blueprint Design's build-preview defaults to the Studio process's own launch directory.**
`/api/home/blueprints/build-preview`'s response included `"projectRoot": "/workspace/peppy-frisky-talisman"` —
i.e. this exact source checkout's own root, because that's where the `pokie studio` process happened to be
launched from (`cwd`), not any project-scoped or user-chosen location. The actual `/api/home/blueprints/build`
endpoint (which would write files) was deliberately never called in this pass to avoid mutating this worktree;
`git status --short` immediately after confirms nothing was written to `/workspace`. This is worth a later
step's attention: launching `pokie studio` from a source checkout (a very ordinary thing to do while developing
POKIE itself) and then using the Design Game's default "build" destination could write generated package files
straight into that checkout root unless a user explicitly overrides the destination — not confirmed here as
exploitable beyond the preview response (the real `build` endpoint's own destination-resolution logic was not
read or executed further), but real enough, from a real response, to name rather than omit.

## 5. Browser/DOM-rendering evidence

This sandbox still has no Chrome/Chromium binary anywhere searched (`find` across `/usr /opt /root /home`,
empty), no Puppeteer/Playwright package in `node_modules`, and no root access to install one (`apt-get install`
→ `Unable to acquire the dpkg frontend lock ... are you root?`, confirmed `uid=1000`) — the same constraint
`pokie-phase4-inventory.md`'s own original P4-POLISH-01 round hit, closed only by a later browser-capable-host
correction round (that document's §4, `phase4-evidence/browser/`). A true pixel/visual screenshot of this
project's Studio UI therefore still does not exist for Phase 5; see "Owner steps" (`P5-POLISH-19`) for where
that specific gap is now routed.

What this round *did* add: real browser/DOM-rendering evidence, without a Chromium binary, using a mechanism
this repository already relies on for its own correctness — `jest-environment-jsdom`, the same real-DOM harness
every one of this project's own Studio-client component tests (`tests/cli/studio-client/src/**/*.test.tsx`)
already executes against. This round mounted the real production React components (`HomePage`,
`ProjectDashboardPage`, and everything they render) via `renderRoutedApp` — the project's own existing test
utility, unmodified — but wired `StudioApiProvider`'s `fetchImpl` to a real, already-running `pokie studio <pkg>
--port 4590 --no-open` server via a real `node:http` client, instead of the fake `fetchImpl` every existing test
in this repo uses. The result is real application code, actually executed, actually talking to a real backend
over real loopback HTTP, producing a real resulting DOM (`document.documentElement.outerHTML`) — not mocked
data, not hand-authored markup, and not a re-statement of the §4 HTTP transcripts (those prove the API
responses; this proves the UI that consumes them actually renders that data correctly).

Captured for real: the Blueprint Design Game (`#/home/design`), Project Overview (`#/project/overview`, real
project name/id/version/capabilities/validation state loaded from a live request), Play both idle
(`project-play-idle.html`) and, after a real `userEvent.click(screen.getByRole("button", {name: "Start
playing"}))`, running (`project-play-running.html` — a real runtime start + session create against the live
server, embedding a real `<iframe src="http://127.0.0.1:<ephemeral-port>?session=<real-uuid>">` for the actual
canonical player), Runtime (`#/project/runtime`, showing the real runtime the Play interaction above started),
Replay (`#/project/replay`), and Build/Export (`#/project/exportDeploy`). Full artifact table, the exact
reproducible capture script, and the precise "what this is/isn't" boundary (no CSS layout or paint, so no pixel
image — a real executed-DOM snapshot instead) are in
[`phase5-evidence/browser/README.md`](phase5-evidence/browser/README.md).

## 6. `pokie-examples` and docs

§1 already locks the exact companion SHA and its clean ancestry to `origin/develop`. Beyond sync, this round
re-verified real adoption rather than trusting the prior Phase 4 record: `node node_modules/jest/bin/jest.js
--selectProjects pokie-examples --maxWorkers=2` (direct invocation, same "Method" as above) passed all 8 real
tests in `../pokie-examples/tests/ui.test.ts` against this round's own fresh build — the companion's own UI
adoption of `pokie/client/player` (§6 of `pokie-phase4-inventory.md`) still holds against current `HEAD`. `node
node_modules/.bin/vite build` inside `/pokie-examples` (its own local `vite`, sidestepping the broken system
`npm`) built all nine example games (`simple-slot`, `growing-grid`, `megaways-style`, `mixed-evaluators`,
`value-pay-multiplier`, `verifiable-spin`, `slot-with-free-games`, `slot-with-sticky-respin`,
`cascading-cluster`) cleanly from source — no stale/cached output, this checkout has no prior `dist/`.

`docs/cli.md` was cross-checked against the real, fresh `--help` output in §3 and found current — every
top-level command documented there exists in the real CLI and vice versa; no drift found in this pass.

## Owner steps

Unlike the round frozen at `edfc2457b893ac6b8bd72d3569a0fbf7a2325598`, this correction's own instruction
supplied concrete later-Phase-5 step IDs to route findings to. Every gap this pass found is mapped below —
directly, where the instruction named the mapping explicitly, or by explicit inference (flagged as such) where
it didn't:

- **`pokie build random`/`--random` cannot succeed on a fresh invocation** (§3) → **`P5-POLISH-02`** (explicit,
  per this correction's own instruction). The smoke-simulation step needs either an `npm install` before it
  runs, a `--skip-smoke`-style opt-out, or to not treat a missing dependency as a hard failure the way a real
  broken build would be.
- **No executable fixture exercises the real `runSmokeSimulation` implementation** (§3) → **`P5-POLISH-02`**
  (inferred: same root cause and same `build random` code path as the finding above, not a separately-supplied
  ID). Every existing test injects a fake `runSmoke`; the gap above went undetected because of this. Whichever
  change fixes the smoke-sim gap itself should also add a fixture using the real implementation, not just
  re-stub it more thoroughly.
- **Stale `src/index.ts` barrel** (§2) → **`P5-POLISH-02`** (inferred: `generate-barrels.js` is the literal
  first step of the same `build-esm`/`build-cjs`/`prepack` pipeline `P5-POLISH-02` already owns, not a
  separately-supplied ID — if `P5-POLISH-02`'s actual scope turns out narrower than "the build pipeline", this
  is the one mapping in this list most likely to need re-routing). `supportsBetModeSelecting` has been missing
  from the public `pokie` API surface since `6b99671`; the fix is mechanical (run `generate-barrels.js`, commit
  the result) but is a product-source change, out of scope for this evidence-only step.
- **Blueprint Design's build-preview `projectRoot` defaults to the Studio process's own `cwd`** (§4) →
  **`P5-POLISH-03`** (explicit, per this correction's own instruction — "Studio build destination"). This
  document only confirms the preview response, not whether the real `build` endpoint's own resolution differs
  or is already guarded elsewhere.
- **True pixel/visual (Chromium-rendered) screenshot evidence** (§5) → **`P5-POLISH-19`** (explicit, per this
  correction's own instruction — "browser evidence"). This correction round closed the *DOM-rendering* half of
  the original gap without a Chromium binary (see §5, `phase5-evidence/browser/`); the pixel/visual half — this
  sandbox still has no Chrome/Chromium binary and no root access to install one — is what remains open and
  routed here, the same "later browser-capable-host round" pattern `pokie-phase4-inventory.md`'s own §4 already
  used.
- **This sandbox's own `npm` wrapper remains broken independent of anything in this repository**
  (`phase5-evidence/build/build-transcript.txt`) — not a product gap, so it needs no roadmap step; flagged only
  so a future round isn't stuck re-diagnosing the same root cause `pokie-phase4-inventory.md`'s own npm-wrapper
  note already named.

This document does not declare Phase 4 accepted, closed, or superseded — it is a fresh, independently-verified
snapshot of the current tree ahead of Phase 5 product work, and every fact in it is either a freshly executed
transcript (`phase5-evidence/`) or an explicit pointer to where `pokie-phase4-inventory.md` (there is no
separate Phase 4 closing-verification report analogous to `pokie-phase3-final-verification-report.md` — Phase 4's
own record lives entirely in `pokie-phase4-inventory.md` itself) already settled a question this step didn't
need to re-derive.
