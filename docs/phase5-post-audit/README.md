[← Back to docs index](../README.md)

# P5PA-01: Phase 5 completion baseline freeze and post-completion audit protocol

**Step:** `[P5PA-01]`. Frozen 2026-08-10 in the implementer sandbox this step actually ran in. This is the first
step of a new, distinct campaign (**P**hase **5** **P**ost-**A**udit) that begins only after Phase 5 itself is
already published and complete — it does **not** reopen, replan, or add scope to Phase 5. Per this step's own
instruction, it does three things and nothing else: (1) freezes exact orchestrator/product provenance, (2)
defines a reusable audit protocol and evidence convention for this new campaign, and (3) opens a source-backed
audit matrix for the exact five concerns this campaign's own next five steps carry — one entry each for
`P5PA-02` (Blueprint Game Model editor), `P5PA-03` (TypeScript package Game Model introspection), `P5PA-04`
(multi-mode Outcome Library selection/provenance), `P5PA-05` (Player custom scenario/Replay), and `P5PA-06`
(`pokie init` portability) — plus one bounded architectural sweep. Every entry below was freshly
re-verified against current `develop`, not copied from an older report. **No product source changed in this
step** (see "Boundary" at the end).

**Correction round (same day, this document's second freeze):** the round frozen at
`0494a779c0a011d302a352b18b273ebb27cb876d` audited five concerns (a stale barrel, a `build random`
regression, a Blueprint build-destination default, browser evidence, and spin atomicity) that turned out
not to be the five concerns `P5PA-02` through `P5PA-06` actually name — a reviewer correction. This round
replaces §3's matrix, its five subsections, and the "Boundary" close-out with fresh, freshly re-verified
entries for the correct five concerns, named above; §1, §2, and §4 (provenance, protocol, architectural
sweep) are unchanged and still hold. No product source changed in this round either.
`evidence/01-barrel-and-build-random.txt`, `02-blueprint-build-destination.txt`, `03-spin-atomicity.txt`,
`05-blueprint-build-destination-workflow.txt`, `06-f9-sandbox-reconfirmation.txt`, and
`07-f9-external-evidence-crosscheck.txt` are real transcripts from that superseded first-freeze matrix; they
are kept, unedited, as an honest record of what this round's own predecessor actually ran, but are no longer
linked from §3 below since the concerns they document are not `P5PA-02`–`P5PA-06`. `00-provenance.txt` and
`04-architectural-sweep.txt` remain current and linked from §1/§4 respectively.

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

## 3. Audit matrix — the five `P5PA-02`–`P5PA-06` concerns (fresh re-verification against current `develop`)

The five concerns audited this round are the exact five this campaign's own next five steps carry — not a
synthesis of Phase 5's own record (that was this document's first-freeze mistake, corrected here): `P5PA-02`
(Blueprint Game Model editor), `P5PA-03` (TypeScript package Game Model introspection), `P5PA-04` (multi-mode
Outcome Library selection/provenance), `P5PA-05` (Player custom scenario/Replay), and `P5PA-06` (`pokie init`
portability). Each was independently, freshly investigated this round: current source read end-to-end for the
concern's own surface, cross-checked against every prior doc that might already have an opinion on it, and,
wherever the concern is behavioral rather than purely structural, actually exercised with a real, unmocked
reproduction (never a hand-typed/imagined fixture) — full transcripts are in the numbered `evidence/` files
linked from each subsection below.

| # | Concern | Step | Classification |
| --- | --- | --- | --- |
| 1 | Blueprint Game Model editor | `P5PA-02` | **CONFIRMED P2** |
| 2 | TypeScript package Game Model introspection | `P5PA-03` | **INTENTIONAL SUPPORTED LIMITATION** |
| 3 | Multi-mode Outcome Library selection/provenance | `P5PA-04` | **INTENTIONAL SUPPORTED LIMITATION** |
| 4 | Player custom scenario/Replay | `P5PA-05` | **FALSE POSITIVE** (fixed) |
| 5 | `pokie init` portability | `P5PA-06` | **CONFIRMED P3** |

### #1 — Blueprint Game Model editor (`P5PA-02`): CONFIRMED P2

The Studio Blueprint editor's "JSON" mode (`BlueprintEditorPage.tsx` / `BlueprintJsonPanel.tsx`) renders its
`Textarea` **uncontrolled** (`defaultValue={jsonText}`, read only via a `ref` when "Apply JSON" is clicked,
`BlueprintJsonPanel.tsx:11`), while the Form/JSON mode toggle is a plain `SegmentedControl`
(`BlueprintEditorPage.tsx:966-974`) with no dirty-check or confirm on its `onChange`
(`BlueprintEditorPage.tsx:991` renders the two modes as mutually exclusive — switching away unmounts the JSON
panel outright). The editor's otherwise-thorough unsaved-work protections (`isDirty`, the navigation blocker,
the `beforeunload` guard) are all keyed off `editor.state.revision`, which only advances on a *committed*
mutation — a Form field edit, New, Load, or a successful "Apply JSON" (`BlueprintEditorPage.tsx:369`) — never
on raw, unapplied JSON-textarea keystrokes. The result: a user who types a replacement blueprint into the JSON
textarea and then switches back to Form mode (or navigates away) without clicking "Apply JSON" loses that work
completely, with **zero warning of any kind**.

This was reproduced for real, not just inferred from source: the actual production component tree
(`HomePage` → `BlueprintEditorPage`) was mounted via this project's own `renderRoutedApp` test harness (real
React + real Mantine + jsdom, unmocked — the same harness
`tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.validation.test.tsx` already uses).
A real `fireEvent.change` typed a fully-formed replacement blueprint (`"unsaved-work-in-progress"`) into the
JSON textarea; switching the mode toggle back to Form showed the Form's `Game id` field still empty, and
switching back to JSON showed the *original* starter JSON — the typed draft was gone, and at the moment of loss
neither `screen.queryByText(/unsaved/i)` nor `screen.queryByRole("dialog")` matched anything. Full script and
verbatim output: [`evidence/08-blueprint-game-model-editor.txt`](evidence/08-blueprint-game-model-editor.txt).

Kept at **P2**, not P0/P1: nothing already saved to disk is corrupted or clobbered, only in-progress,
never-applied browser-tab state; it requires a specific interaction (type in JSON mode, then switch away
without applying) that every other editing surface in this same editor (Form fields, `GameModelTab.tsx`'s
per-section editors) does not share, since those capture edits immediately. Not P3: it is real, non-cosmetic
loss of a user's hand-typed work with no warning at all, in a surface explicitly meant for raw Blueprint JSON
editing. No prior doc names this defect — it is a new finding, not a re-verification. Recorded here as the
still-open item for a future P5PA remediation step (e.g. make the `Textarea` controlled and gate the mode
switch/navigation on its own dirty state, the same way Form edits are already gated).

### #2 — TypeScript package Game Model introspection (`P5PA-03`): INTENTIONAL SUPPORTED LIMITATION

For a `tsPackage`-type project, POKIE's introspection stack (`GamePackageInspector`, `pokie inspect`, Studio's
`GET /api/project/gameModel`) deliberately never parses TypeScript source — only `package.json`'s own
name/version/description. `cli/studio/blueprint/buildProjectGameModel.ts`'s own doc comment states the design
explicitly: `"tsPackage", the default) exposes only package.json's own name/version/description, since
GamePackageInspector reads nothing deeper`; every other `GameModelProjection` section (`layout`, `symbols`,
`reels`, `paytable`, `betsAndModes`, `mechanics`, `limits`) is marked `"unavailable"` with a plain-language
reason string the UI shows verbatim, never a crash or silent omission. This is tested
(`tests/cli/studio/blueprint/buildProjectGameModel.test.ts:120-130`) and documented to end users
(`docs/cli.md:2060-2079`).

Verified with a real, unmocked reproduction: generated a real `tsPackage` from the checked-in fixture
`examples/blueprints/sample-slot.blueprint.json` via the real `GamePackageGenerator` (the same class
`pokie build --target tsPackage` uses — the generated `src/index.ts` genuinely embeds the full
paytable/reels/symbols), then called the real `GamePackageInspector.inspect(...)` and
`buildProjectGameModel(...)` against it: only `basics` (package.json fields) came back available; every other
section reported `"unavailable"` with the documented reason — even though the real paytable/reels/symbols data
was sitting right there in the generated source. The real `InspectCommand` CLI path was also run end-to-end
(exit 0, output matching `docs/cli.md`'s documented example). No TODO/FIXME/"unsupported" throw exists anywhere
in this path. Full transcript:
[`evidence/09-ts-package-game-model-introspection.txt`](evidence/09-ts-package-game-model-introspection.txt).
No prior doc claims a deeper-introspection gap; this is a fresh area for the campaign, not a re-verification.

### #3 — Multi-mode Outcome Library selection/provenance (`P5PA-04`): INTENTIONAL SUPPORTED LIMITATION

Mode selection throughout the outcome-library bundle stack (`OutcomeLibraryBundleReader.readModeIndex`,
`OutcomeLibraryBundleOutcomeSource.drawOutcome` — the class actually wired into `pokie serve`, Studio
Play/Simulation/Replay) is filename-exact (`index_${modeName}.json`, no fuzzy/case-folding/"closest mode"
fallback); write-time invariants (`OutcomeLibraryBundleWriter`) enforce that a mode's filename and its own
internal `modeName` field always agree and that every mode in one bundle shares the same game/version/
provenance identity; the deployment layer separately rejects a selector whose mode name disagrees with its
deployment row before ever loading it (`StudioDeploymentService.describeSelectorModeMismatch`). Provenance
(`OutcomeLibraryBundleManifestModeEntry.generator`) is copied verbatim from generation diagnostics, never
recomputed on a second path, and Studio's registry view evaluates each mode against *its own* source bundle's
manifest.

Verified with a real, unmocked reproduction: built the CLI from source, constructed a real two-mode bundle
(`base` + `buyFeature`, distinct provenance) via `pokie outcomelibrary build`, then sampled each mode via
`pokie outcomesource sample --mode <name>`: `base` drew exclusively from `demo-base-lib`'s own outcomes,
`buyFeature` drew exclusively from `demo-buyfeature-lib`'s own outcomes (no cross-mode contamination, correct
`library`/`hash` reported for each), and a nonexistent mode name failed hard (`ENOENT`) rather than silently
falling back. Full transcript:
[`evidence/10-outcome-library-multimode-selection-provenance.txt`](evidence/10-outcome-library-multimode-selection-provenance.txt).

One documented trust boundary, not classified as a defect: `OutcomeLibraryBundleReader`'s own class doc states
it "assumes an already-valid bundle" and points to the separate, opt-in `OutcomeLibraryBundleValidator` for a
bundle "from an untrusted source" — consistent with that, `pokie serve`/`StudioPlayService` do not
auto-validate a bundle's own internal mode-name/filename self-consistency before serving spins from it; only
`pokie outcomelibrary validate` and the certification path do. This can only diverge from a bundle POKIE's own
writer produced through external tampering/corruption, matching the documented "untrusted source" scope of the
validator rather than the reader — flagged in the evidence file as the one place a future reviewer might
reasonably want defense-in-depth, but not a defect. No prior doc makes any claim about this concern; it is a
fresh area, not a re-verification.

### #4 — Player custom scenario/Replay (`P5PA-05`): FALSE POSITIVE (fixed)

There is no dedicated "custom scenario"/forced-outcome API in this product (Studio's Play "Find any win"/"Find
symbol win" is a real, bounded spin-and-check search — `StudioPlayService.findAnyWin`/`spinUntilMatch`,
`maxFindScenarioSpins` default 2000, honest `{status: "error", ...}` on exhaustion — never a forced outcome).
Replay (`pokie replay` / Studio Replay) is explicitly, documentedly "best-effort": it never replays recorded
RNG values, only re-plays a fresh session forward from round 1 using the same seed
(`src/replay/ReplayRecorder.ts:11-13`, `cli/commands/ReplayCommand.ts:76`), and Studio's own comparison logic
only calls a reproduction "verified" when an original `debug.reelStops` trace exists to check against,
otherwise honestly labeling it `"bestEffort"` (`cli/studio-client/src/domain/interpret/Replay.ts:487`).

The determinism defect class this concern's own framing hypothesizes — a seed/scenario silently falling
through to unseeded RNG — **was** a real, confirmed bug for generated packages (reel-strip *content* shuffling
defaulted to unseeded `Math.random()` even when stop-position draws were correctly seeded), already found and
fixed under `[P5-POLISH-19]` `582f5323efdd1baaa6c95bb00f761def24b2c287` ("make generated-package rounds
seed-reproducible, prove four-surface parity", 2026-08-08; confirmed a real ancestor of this step's own product
HEAD). This round independently re-verified the fix holds at current HEAD, not on the old report's word: a
fresh package generated through the real `GamePackageGenerator` codegen path (the exact branch that commit
fixed) was replayed twice with the same seed+round and produced a bit-for-bit identical screen and `totalWin`
both times. Re-ran the real `ReplayRecorder`/`SeededRandomNumberGenerator`/`DefaultSymbolsSequence` test suites
(49 tests) at current HEAD — all pass. Full transcript, including a control case
(`tests/cli/fixtures/playable-game-with-free-games`, a hand-authored fixture whose own comment already
discloses non-full seeding) that confirms the *residual*, already-documented "best-effort" limitation is real
and distinct from the fixed defect:
[`evidence/11-player-custom-scenario-replay.txt`](evidence/11-player-custom-scenario-replay.txt). No outstanding
silent-fallthrough gap remains for the supported code-generation path.

### #5 — `pokie init` portability (`P5PA-06`): CONFIRMED P3

Every real filesystem call in the `init`/scaffold/prepare path uses `path.resolve`/`path.join` (verified by
grepping every `fs.*Sync` call across `cli/scaffold/*`, `cli/prepare/*`, `cli/commands/InitCommand.ts`); child
processes are spawned via `execFile`/`execFileAsync` with an argument array, never a shell
(`cli/prepare/PackageCommandRunner.ts` — no `shell: true` anywhere in the CLI); user-supplied values (game-id,
directory names) are embedded into generated source via `JSON.stringify`, not string interpolation. One
cosmetic exception found: `cli/scaffold/GamePackageMergeConflictError.ts:23` builds its error message with a
raw `` `${projectRoot}/package.json` `` (forward slash) for display only — never for an actual file operation,
which is computed separately via `path.join` — so on a real Windows OS this one message would render a
mixed-separator string. No functional or security consequence; genuinely untested and previously undocumented.

Verified with real, unmocked reproductions under `/tmp` against a freshly built CLI: a space-containing path,
a deeply nested relative path, `../../` traversal, a trailing slash, an existing non-empty directory (both
with and without `--yes`), a shell-metacharacter game-id (`foo; rm -rf / #` — scaffolded safely, no shell
execution), a backtick/template-literal game-id (command-injection probe — safely escaped), an empty game-id,
and a Unicode directory name — all behaved correctly. The real `InitCommand.test.ts` suite (27/27) and the real
`InitCommandWorkflow.integration.test.ts` were also run. Full transcripts:
[`evidence/12-pokie-init-portability.txt`](evidence/12-pokie-init-portability.txt).

The already-documented "`npm install` fails" behavior (`pokie-phase5-inventory.md` §3 and this repo's own prior
evidence) was independently re-confirmed this round, via a real integration test failing at the identical
point with the identical message, to be entirely this sandbox's own broken `npm` wrapper — not a `pokie init`
defect — and is therefore not entered as its own matrix item, consistent with how `pokie-phase5-inventory.md`
already scoped it. Kept at **P3**, not P2: the one genuine finding is purely cosmetic display text in a rare
conflict-resolution error path, with no functional, data-loss, or security consequence.

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
taxonomy and evidence conventions later P5PA steps reuse, and freshly classifies the five `P5PA-02`–`P5PA-06`
concerns plus one bounded sweep, entirely by reading current source/history, cross-checking prior docs, and
citing real, unmocked command/reproduction output — no product code, test, or existing Phase 5 document was
edited. This step **is not** a remediation step: concern #1 (`P5PA-02`, Blueprint Game Model editor JSON-mode
data loss, CONFIRMED P2) and concern #5 (`P5PA-06`, `pokie init` portability mixed-separator message, CONFIRMED
P3) — the two CONFIRMED-open items above — are named and evidenced here, but not fixed; fixing either is real
product-source work that belongs to the later, explicitly-scoped `P5PA-02`/`P5PA-06` steps themselves,
consistent with "no product behavior is changed in this baseline/evidence step."

## `P5PA-02` remediation: Mechanics is now a real Game Model section, Limits explains itself truthfully

This step's own instruction is narrower than the `08-blueprint-game-model-editor.txt` JSON-mode data-loss
finding above (still open, left for a future step): "repair only a confirmed supported-field completeness gap
through the one canonical section editor." Reading `GameModelTab.tsx`/`GameModelSections.tsx` (Studio's own
canonical, post-creation Game Model tab — Design Blueprint → open project → Game Model) end-to-end, cross-checked
against the guided Design Game editor (`SectionedFormEditor.tsx`) and the raw `GameBlueprint`/
`GameBlueprintValidator` schema (`src/generated/`), found exactly one such gap:

- **Mechanics** (`GameBlueprintMechanics.freeGames` — scatter symbol + match-count→award map) is real,
  persisted, validated `GameBlueprint` data (`GameBlueprintValidator`'s own `blueprint-mechanics-*` codes), yet
  had **zero** field editor anywhere in Studio — not in the guided Design Game editor (never had one), and not in
  the post-creation Game Model tab (`MechanicsSection` was read-only, no `action=` Edit button, no explanation).
  The *only* place it was reachable for an already-created project was the standalone `pokie edit <blueprint>`
  CLI wizard (`cli/wizard/GameBlueprintWizard.ts`'s `askMechanics`, via `cli/commands/EditCommand.ts`) — a real,
  separate, competing mutation path entirely outside Studio's own browser workflow.
- **Limits** (`GameModelLimits.minBet`/`maxBet`) is not itself a stored `GameBlueprint` field — it is purely
  derived from Bets & Modes' own `availableBets` (`buildGameModelProjection.ts`'s `deriveLimits`). Its read-only
  status was already correct; the only gap was that the UI never said so.

Fixed by extending `GameModelSections.tsx`'s own existing per-section Edit/Save/Cancel +
single-whole-blueprint-write architecture (the same one `PaytableEditor`/`BetsList` already use) to cover
Mechanics too, via a new `FreeGamesFieldset.tsx` (scatter-symbol select constrained to `blueprint.scatters`,
an award table, "Add/Remove free games") and matching `blueprintFormOps.ts` mutate functions
(`addFreeGames`/`removeFreeGames`/`setFreeGamesScatterSymbol`/`setFreeGamesAward`/`removeFreeGamesAward`,
`readFreeGames`) — this is Game Model itself becoming the sole full sectional editor for this field, never a
second, separate "Mechanics Editor" or its own apply/commit/publish backend the way the old, deleted
`MechanicsEditorTab` (removed in `P4-POLISH-03`) was. `LimitsSection` now shows a truthful, always-present note
("Derived from Bets & Modes' own Available bets above — edit there to change it.") instead of a bare, unexplained
absence of an Edit button.

Regression coverage: `tests/cli/studio-client/src/domain/blueprintFormOps.test.ts` (new `"mechanics (…)"`
`describe` block, 5 tests, pure mutate/read logic) and
`tests/cli/studio-client/src/components/project/ProjectDashboardPage.gameModelWorkflow.test.tsx` (updated to
assert Mechanics now offers Edit, plus a new end-to-end test: Edit → add free games → pick a real scatter symbol
from a real Mantine combobox → add an award → Save → asserts the real `POST /api/home/blueprints/save` body
carries the mutated `mechanics.freeGames` → View Mode, refetched from the server, shows the persisted truth). No
host browser (CDP) is reachable in this sandbox (reproduced fresh; see evidence) — per this campaign's own
protocol (§2 above), the fallback is the same real, unmocked `jest-environment-jsdom` capture of the actual
production component tree `evidence/08-blueprint-game-model-editor.txt` already used, exercising the real
`HomePage`/`ProjectDashboardPage`/`GameModelTab` component tree with real Mantine and only the network boundary
faked. Full transcript (source citations, before/after description, real test/typecheck/lint runs):
[`evidence/13-blueprint-game-model-editor-remediation.txt`](evidence/13-blueprint-game-model-editor-remediation.txt).

Out of scope for this step, left open for a future one: the JSON-mode data-loss defect
(`08-blueprint-game-model-editor.txt`, still CONFIRMED P2) is a different concern (unsaved-work loss, not field
completeness) and untouched here; `pokie edit`'s own CLI wizard mechanics support is a legitimate, separate,
documented CLI tool (not a Studio browser-workflow competitor) and was left as-is.
