[← Back to docs index](../README.md)

# P5PA-01: Phase 5 completion baseline freeze and post-completion audit protocol

**Step:** `[P5PA-01]`. Frozen 2026-08-10 in the implementer sandbox this step actually ran in. This is the first
step of a new, distinct campaign (**P**hase **5** **P**ost-**A**udit) that begins only after Phase 5 itself is
already published and complete — it does **not** reopen, replan, or add scope to Phase 5. Per this step's own
instruction, it does three things and nothing else: (1) freezes exact orchestrator/product provenance, (2)
defines a reusable audit protocol and evidence convention for this new campaign, and (3) opens a source-backed
audit matrix for five concerns already *named* in Phase 5's own record plus one bounded architectural sweep —
every entry below was freshly re-verified against current `develop`, not copied from an older report. **No
product source changed in this step** (see "Boundary" at the end).

## 1. Provenance: product and companion, locked

**Product (this repo, POKIE).** This worktree's task branch (`task/P5PA-01-20260810121210`) points at
`33360978190b55ad6dbd46dba10070b26f3fdb83` — `merge task task/P5-POLISH-20-20260809031218 (implementation
bd1eef46153d)`, 2026-08-10T11:29:50+02:00 — which is exactly the product base SHA this step's own instruction
named. This is also the latest orchestrator-authored `merge task .../ (implementation ...)` commit in `git log`,
so "product HEAD" and "orchestrator HEAD" are the same commit, the same relationship every prior Phase 5 baseline
(`pokie-phase5-inventory.md` §1) recorded for its own freeze point. Working tree was clean (`git status --short`
empty) before this step's own doc-only commit and contains no product-source changes now. See
[`evidence/00-provenance.txt`](evidence/00-provenance.txt).

**Companion (`pokie-examples`, `/pokie-examples`).** On branch `develop`, `HEAD`
`0d068cafbf541a66b86ae5abe128e510291bacfa` (`[P5-POLISH-19] tie examples parity test to the real captured fixture
JSON, not literals`, 2026-08-08T22:46:58Z), working tree clean, 7 commits ahead of `origin/develop` — the same
already-known, already-reported not-yet-pushed state Phase 5's own record left it in (push/publish is an
orchestrator action, out of scope for an implementer step). Nothing in `/pokie-examples` needed a commit for this
step: no product behavior changed anywhere in this round, so there is no "required pokie-examples adoption" to
land here yet (see `cross_workspace_report_contract`) — a later P5PA step that actually fixes a confirmed defect
touching the companion is what would commit there.

**Everything Phase 5 already produced is preserved unchanged**: `docs/phase5-audit/`, `docs/phase5-evidence/`,
`docs/pokie-phase5-inventory.md`, `docs/v1.3-closeout-report.md`, `scripts/phase5-host-browser-audit.mjs`, and
every worktree/progress/publication artifact those reference. This step only adds a new, separate
`docs/phase5-post-audit/` tree; it does not edit, move, or delete any existing Phase 5 file.

## 2. Audit protocol

This section is the reusable part later P5PA steps should follow, so each round doesn't have to re-derive it.

**Classification taxonomy** — every audit-matrix entry gets exactly one of:

- **CONFIRMED P0/P1/P2/P3** — reproduced against current `develop` by reading the real code path (and, where the
  concern is behavioral rather than purely structural, exercising it) *this round*, severity per this project's
  existing convention (`docs/phase5-audit/README.md`'s "Findings": P0/P1 or material P2 blocks a gate, non-material
  P2/P3 is recorded honestly rather than silently dropped).
- **FALSE POSITIVE** — the code path the original finding described no longer exists, or current behavior
  demonstrably does not match the claimed defect, verified against current source/history — not assumed from the
  finding's age.
- **INTENTIONAL SUPPORTED LIMITATION** — current behavior matches the finding, but is a documented, deliberate
  design boundary (a class/module doc comment, a closeout report's own "deferred" list, or equivalent), not an
  oversight.

**No entry is classified from an older Phase 5 report or from an internal-only API alone.** Every entry below
cites either (a) a real command's output, (b) an exact current source excerpt plus its own doc comments, or (c)
`git log`/`git blame` evidence tying a fix to a real commit — never "the old report said X, so X is presumably
still true." Raw transcripts live under `evidence/` in this directory, numbered by the order they were gathered,
the same convention `docs/phase5-audit/evidence/` and `docs/pokie-phase5-inventory.md`'s own
`phase5-evidence/` already use.

**Evidence locations for future rounds:**

- CLI-workflow evidence → `docs/phase5-post-audit/evidence/<round>/<command-name>.txt`, raw captured stdout/stderr
  of the exact command run, same convention `phase5-evidence/cli/` uses.
- Studio/browser evidence → `docs/phase5-post-audit/evidence/<round>/host-browser/` for real external-host
  Chromium captures (screenshots + `ACTION-TRANSCRIPT.txt`, matching `phase5-audit/evidence/host-browser/`'s own
  layout) or `docs/phase5-post-audit/evidence/<round>/dom/` for `jest-environment-jsdom`-backed real-DOM capture
  when no browser host is available (matching `phase5-evidence/browser/`'s own convention) — the two are never
  conflated; a DOM capture is never relabeled as a pixel/browser one.
- Fixture inputs must be real, checked-in or freshly generated files (`pokie create --random --seed <n>`, a
  committed `examples/blueprints/*.blueprint.json`, etc.), never hand-typed JSON asserted never to have been run.
- An unsupported/blocked state (no browser binary, no root, broken `npm`) is recorded exactly the way
  `phase5-audit/README.md`'s "Correction round" and "Correction round 8" already model it: reproduce the blocker
  with a real command each time rather than citing a prior round's conclusion, then state plainly what could not
  be done and why — never a screenshot or transcript that implies success.

## 3. Audit matrix — five named concerns (fresh re-verification against current `develop`)

The five concerns audited this round are the ones Phase 5's own record names explicitly and had not yet closed
the loop on as of the freeze point above — three from `pokie-phase5-inventory.md`'s "Real finding" sections
(also called out by name in `docs/README.md`'s own Phase 5 summary), one from `docs/phase5-audit/README.md`'s
multi-round host-browser rerun chain, and one from `docs/v1.3-closeout-report.md`'s "Deferred to v2.0" list. This
step's own instruction did not re-enumerate them verbatim, so this selection is this round's own source-backed
synthesis of "named concerns" already on record, not a fabricated list — flagged here explicitly so a later
reviewer can redirect this matrix if a different five were intended.

| # | Concern | Source | Classification |
| --- | --- | --- | --- |
| 1 | Stale `src/index.ts` public API barrel (`supportsBetModeSelecting` missing) | `pokie-phase5-inventory.md` §2 | **FALSE POSITIVE** (fixed) |
| 2 | `pokie build random` smoke-simulation `Cannot find module 'pokie'` failure | `pokie-phase5-inventory.md` §3 | **FALSE POSITIVE** (obsolete) |
| 3 | Blueprint Design build destination defaults to Studio's own launch `cwd`, unguarded | `pokie-phase5-inventory.md` §4 | **CONFIRMED P2** (still present) |
| 4 | Pixel/visual (Chromium-rendered) Studio browser evidence | `pokie-phase5-inventory.md` §5 / `phase5-audit/README.md` | **FALSE POSITIVE** (the gap the finding described — no real external-host browser evidence for the F9 journey — no longer matches current reality) |
| 5 | Cross-store atomicity in `SpinCommandHandler` | `v1.3-closeout-report.md` "Deferred to v2.0" | **INTENTIONAL SUPPORTED LIMITATION** |

### #1 — Stale public barrel: FALSE POSITIVE (fixed)

Current `src/index.ts:475` reads `export * from "./session/videoslot/betmode/supportsBetModeSelecting.js";` — the
export the original finding said was missing is present. `git log -1 -S"supportsBetModeSelecting" -- src/index.ts`
shows the barrel was last touched by `8b05f8d` `[P5-POLISH-02] make pokie build a universal project-to-artifact
pipeline` (2026-08-07), the exact step `pokie-phase5-inventory.md`'s own "Owner steps" routed this finding to
(inferred there, confirmed here). No further action needed. See
[`evidence/01-barrel-and-build-random.txt`](evidence/01-barrel-and-build-random.txt).

### #2 — `pokie build random` smoke-sim regression: FALSE POSITIVE (obsolete)

`runSmokeSimulation` no longer exists anywhere in the tree (`grep -rn runSmokeSimulation` across every `.ts` file:
zero matches). `cli/commands/BuildCommand.ts`'s own comment states plainly: `"build" no longer has a "random"
verb -- first-class random generation lives on "pokie create --random" instead`. `cli/commands/CreateCommand.ts`'s
own comment on `--random` confirms it "writes straight to disk -- never builds or smoke-simulates a package
itself." The architecture changed since the original finding: random generation and building are now two fully
separate, explicit commands (`pokie create --random` then `pokie build <file> --target tsPackage`), so the
specific defect class the old finding described — an automatic post-generation smoke sim assuming an uninstalled
dependency — has no code path left to occupy. Same commit, `8b05f8d`, made this change (also the one
`pokie-phase5-inventory.md` explicitly routed this finding to). See
[`evidence/01-barrel-and-build-random.txt`](evidence/01-barrel-and-build-random.txt).

### #3 — Blueprint Design build destination default: CONFIRMED P2 (still present, real re-read of the current guard)

`cli/studio/previewBuildDestination.ts` (shared by both the preview endpoint and the real build) resolves the
default destination, when no `outDir` is supplied, as `path.join(cwd, manifestId)` — `cwd` is always
`process.cwd()`, i.e. wherever the `pokie studio` process happens to have been launched from, exactly as
`pokie-phase5-inventory.md` §4 found. This round went one step further than the original finding (which only
observed the preview response) and read `StudioBlueprintService.build()`'s own guard: `outsideStudioRootMessage`/
`isPathWithin(this.studioRoot, resolvedOutDir)` only runs `if (outDir !== undefined)` — an *explicit* `outDir`
landing inside Studio's own root is rejected, but the *default* destination (`outDir` omitted) is never checked
against `studioRoot` at all, even though it resolves through the exact same `cwd`. A Studio launched from inside
its own source checkout (an ordinary developer workflow, and the same scenario the original finding's own
`build-preview` response demonstrated: `"projectRoot": "/workspace/peppy-frisky-talisman"`) and then used via
Blueprint Design's "Build" action without an explicit destination would have its default target land inside that
checkout, unguarded by a check that exists and fires for the equivalent explicit path. This round went past
static source reading and actually exercised the workflow: a throwaway test constructed the real, unmodified
`StudioBlueprintService` (the exact class both Studio HTTP endpoints use), pointed `studioRoot` and `process.cwd()`
at the same fresh temp directory (reproducing "Studio launched from inside its own checkout"), loaded the real
checked-in fixture `examples/blueprints/sample-slot.blueprint.json`, and called `previewBuild()` then `build()`
with no `outDir` — exactly the guided editor's "Build" action with its destination left at the default it always
shows first. The real, unmodified `build()` returned `status: "ok"` and **actually wrote** `package.json`,
`package-lock.json`, `tsconfig.json`, `README.md`, `src/index.ts`, and `dist/index.js` to
`<studioRoot>/sample-slot`, confirmed both from `build()`'s own returned `createdFiles` and a real
`fs.readdirSync` of the resulting directory afterward — landing squarely inside `studioRoot`, with no
`isPathWithin` rejection at any point. The test file was created only to capture this evidence, run once, and
deleted immediately after; it was never committed to the test suite. Severity kept at **P2** (not P0/P1): it
requires (a) launching Studio from a source checkout, a non-default deployment shape, and (b) using Design's
"Build" without overriding the destination it always shows first — not remotely exploitable, and no data outside
the local filesystem is at risk. Recorded here as the still-open item for a future P5PA remediation step to fix
(e.g. extend the same `isPathWithin(studioRoot, ...)` guard to the default-`outDir` path too, the same way
`build()` already guards the explicit one). See
[`evidence/02-blueprint-build-destination.txt`](evidence/02-blueprint-build-destination.txt) (source excerpts) and
[`evidence/05-blueprint-build-destination-workflow.txt`](evidence/05-blueprint-build-destination-workflow.txt)
(this round's real, executed workflow reproduction).

### #4 — Pixel/visual browser evidence: FALSE POSITIVE (the described gap no longer matches current reality)

This concern is the claim (from `pokie-phase5-inventory.md` §5 / the pre-2026-08-10 rounds of
`phase5-audit/README.md`) that no real, external-host, Chromium-rendered evidence exists for the Studio F9
journey (Detect → Register a Blueprint → Open → Overview/Game Model). This round did not take that claim's
resolution on faith from an older report; it independently re-verified two things itself, this round, with real
commands:

1. **This implementer sandbox still cannot run a browser at all**, reconfirmed fresh (not assumed from a prior
   round): no chromium-family binary anywhere on a bounded filesystem scan, no `P5_*`/host-browser environment
   variable set, no Puppeteer/Playwright installed, `npx` and `npm` both disabled/broken the same way every prior
   Phase 5 round already documented, and no root to install one via `apt-get`. See
   [`evidence/06-f9-sandbox-reconfirmation.txt`](evidence/06-f9-sandbox-reconfirmation.txt). This means the
   journey cannot be *re-run* from inside this sandbox this round — the same structural constraint every prior
   round hit.
2. **The already-existing external-host evidence is real and current**, verified rather than narratively cited:
   `sha256sum -c` against `docs/phase5-audit/evidence/host-browser/f9-rerun-20260810/SHA256SUMS.txt` passes for
   every one of its 13 files (transcript, four PNG captures, four paired text extracts, and three terminal logs);
   that evidence's own `ENVIRONMENT.txt` names the exact commit its fresh Studio build ran from
   (`cc0785f5bc1b654bdf749e46e8d22fe4baaa8d55`), and `git merge-base --is-ancestor` confirms that commit is an
   ancestor of this step's own product HEAD (`33360978190b55ad6dbd46dba10070b26f3fdb83`) — so the evidence reflects
   current source, not a stale build; and the F9 fix commit it exercises (`02991fb`, the Blueprint row's Open
   action) is still present and unreverted in current `cli/studio-client/src/components/home/ProjectsPanel.tsx`.
   See [`evidence/07-f9-external-evidence-crosscheck.txt`](evidence/07-f9-external-evidence-crosscheck.txt).

Given both of those, the original finding's premise — "no real browser evidence exists for this journey" — is
demonstrably false against current source and current evidence: real, checksum-verified, current-commit-traceable
evidence does exist (`docs/phase5-audit/evidence/host-browser/f9-rerun-20260810/`), even though this particular
implementer sandbox cannot independently reproduce it. This step does not re-run the capture itself: doing so is
not achievable from inside this sandbox (per point 1), and re-attempting it would not change point 2's already
independently-verified result. No outstanding pixel-evidence gap remains for the journey Phase 5 itself scoped.

### #5 — `SpinCommandHandler` cross-store atomicity: INTENTIONAL SUPPORTED LIMITATION

`src/server/spin/SpinCommandHandler.ts`'s own class-level doc comment, re-read in full this round, still states
the handler performs "best-effort, process-local compensation, not a strict cross-store transaction guarantee,"
names the exact reconciliation/checkpoint mechanism that closes the dangerous case (`SpinOperationCheckpoint`/
`SpinReconciliationService`), and explicitly says "full atomicity is a v2 concern" — matching
`v1.3-closeout-report.md`'s own "Deferred to v2.0" entry for the same gap verbatim. Current source has not
drifted from that documented boundary: the reconciliation/checkpoint classes it names still exist and are still
wired into the same handler. Classified as an intentional, already-documented design limitation, not a defect —
no action needed unless a future step scopes true v2 cross-store atomicity. See
[`evidence/03-spin-atomicity.txt`](evidence/03-spin-atomicity.txt).

## 4. Architectural sweep

A bounded (not exhaustive) pass across every directory this step's own instruction named —
`src/project`, `cli`, `cli/studio`, `cli/studio-client`, and the companion `/pokie-examples` — for the cheapest,
highest-signal marker of unfinished/known-bad work: `TODO`/`FIXME`/`HACK`/`XXX` comments and explicit
"not implemented" stubs, excluding test files. Result: **zero hits** in every one of those directories, in both
repos. This is a real, current, freshly run result (not carried over from any prior round) — see
[`evidence/04-architectural-sweep.txt`](evidence/04-architectural-sweep.txt). This sweep is deliberately narrow
(a marker scan, not a full code-quality review); it does not claim the architecture has no gaps, only that it has
none of its own authors flagged inline with these specific markers as of this SHA. A deeper architectural review
(dependency-direction audit, dead-code sweep, etc.) is left to a later P5PA step if the reviewer wants one scoped.

## Boundary: what this step does and does not do

This step **is** a baseline freeze plus a protocol/matrix opener: it records exact provenance, defines the
taxonomy and evidence conventions later P5PA steps reuse, and freshly classifies five named concerns plus one
bounded sweep, entirely by reading current source/history and citing real command output — no product code,
test, or existing Phase 5 document was edited. This step **is not** a remediation step: concern #3 above (the
only CONFIRMED-open item) is named and evidenced here, but not fixed — fixing it is real product-source work
that belongs to a later, explicitly-scoped P5PA remediation step, consistent with "no product behavior is
changed in this baseline/evidence step."
