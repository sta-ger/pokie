[← Back to docs index](../README.md)

# P5-POLISH-20: independent new-user audit and mandatory remediation

**Step:** `[P5-POLISH-20]`. Gathered 2026-08-09 in the implementer sandbox this step actually ran in, against
product base `af1e427af6351b8d14b74e2e2c6e59037d90efb6` (`merge task task/P5-POLISH-19-20260808230150
(implementation b6d98c56ca42)`), a fresh `tsc`/`vite` build from source (same "Method" every prior Phase 5 round
used — see [`phase5-evidence/README.md`](../phase5-evidence/README.md)).

**Why this round is different from `phase5-evidence/p5-polish-19/`**: that round's own personas ("Valera" the
Blueprint designer, and "the programmer") were drawn from this project's existing acceptance-criteria language —
useful, but not independent: the same person who already knows the shape of the acceptance list wrote both the
journeys and the evidence. This step's own instruction requires a **distinct, independent reviewer** who starts
as a genuinely new user — nothing in this round's own journeys below re-runs an existing acceptance-list script;
every command was typed from `--help` output and the CLI's own error messages, the way a first-time user
actually would, deliberately trying to break input at each step rather than only proving the happy path.

## Method

Same sandbox, same constraints every prior Phase 5 round already documented in detail (no working system `npm`
— `/usr/local/bin/npm` fails with a `dash` syntax error unrelated to POKIE; no Chromium/Puppeteer/Playwright and
no root access to install one). Every command below runs the real, freshly built `dist/cli/pokie.js` directly
(`node node_modules/.bin/tsc --project tsconfig.prod.json` then `--project tsconfig.cli.json`, the same two
steps `npm run build-esm`/`build-cli` invoke); Studio journeys drive a real `pokie studio --no-open` HTTP server
via real Node `fetch()` calls from a separate script, never jsdom, never a stubbed transport. Raw transcripts for
every command/request below are under [`evidence/`](evidence/), organized one directory per persona plus a
`fixes/` directory holding before/after test-suite evidence.

## Starting state: mid-flight work already in this worktree

This worktree did not start clean. Three real product fixes were already present, uncommitted, when this round
began — evidently an interrupted prior attempt at this same step, not something this round invented:

1. `pokie reel generate --materialize` (`cli/commands/ReelCommand.ts`) — collapses a `reelStripGeneration`
   blueprint into plain `reelStrips`, the documented fix for `pokie par export`'s
   `parsheet-unsupported-reel-source` error (a blueprint fresh out of `pokie create --random`/`--blank` could
   never be PAR-exported before this).
2. `ParSheetImporter.importFromFile` (`src/parsheet/ParSheetImporter.ts`) wraps a corrupt/non-`.xlsx` file's raw
   ExcelJS/`jszip` error (a jszip documentation URL with nothing to do with POKIE) in a clean, POKIE-authored
   `Could not read "<path>" as a PAR sheet XLSX workbook: ...` message, matching every other file-loading entry
   point's own convention (`loadGameBlueprint`, `readPokiePackageConfig`).
3. A heap-usage safety net for `generateExactWeightedOutcomeLibrary`/`accumulateUniqueGridWeights`
   (`src/weightedoutcome/generate/`) — a wide/many-reel grid's distinct-grid count can approach the raw
   outcome-space size instead of staying small, so an exact sweep could exhaust process memory and crash with an
   uncatchable V8 OOM abort instead of failing closed with an actionable
   `weighted-outcome-library-generation-memory-exceeded` error.

This round verified all three hold up under a fresh, real CLI rebuild and real invocation (not just their own
unit tests) — see "Verifying the pre-existing fixes" below — and found the first thing this round's own
independent QA pass turned up: **that work had silently broken the CI-gating contract test suite.**

## Verifying the pre-existing fixes, and the regression that surfaced first

Running the full `pokie` jest project (`node node_modules/.bin/jest --selectProjects pokie`, the same lane
`npm test`/`check:fast` runs) against this worktree's starting state failed **19 of 5545 tests**, all in
[`tests/cli/cliCommandInventory.contract.test.ts`](../../tests/cli/cliCommandInventory.contract.test.ts) — see
[`evidence/fixes/cliCommandInventory-contract-BEFORE-fix-failures.txt`](evidence/fixes/cliCommandInventory-contract-BEFORE-fix-failures.txt).
The `--materialize` fix above correctly changed `ReelCommand`'s own `getDescription()`/`USAGE` text (now
`[--apply | --materialize]` instead of `[--apply]`), but
[`tests/cli/fixtures/cliCommandInventory.ts`](../../tests/cli/fixtures/cliCommandInventory.ts) — the frozen,
hand-maintained fixture this contract suite diffs the real CLI against — was never updated to match, so every
case asserting `reel generate`'s exact description/usage/error text failed. This is exactly the "commit real
work, but leave the safety net broken" failure mode a hard-gate audit exists to catch: **fixed** in this round
by updating the fixture's description/usage strings (`tests/cli/fixtures/cliCommandInventory.ts`) to the real,
current text — see
[`evidence/fixes/cliCommandInventory-contract-AFTER-fix-pass.txt`](evidence/fixes/cliCommandInventory-contract-AFTER-fix-pass.txt)
for the same suite passing clean afterward (5545/5545 originally, 5550/5550 after this round's own new tests —
see below).

With that fixed, this round rebuilt the full library (`dist/esm`, not just `dist/cli` — the CLI imports `"pokie"`
as a package, so a CLI-only rebuild silently keeps running against a stale library) and re-ran all three fixes
live through the real, freshly built `pokie` binary:

- [`evidence/mathematician/07-materialize.txt`](evidence/mathematician/07-materialize.txt) /
  [`08-par-export.txt`](evidence/mathematician/08-par-export.txt) — `--materialize` then `par export` succeeds.
- [`evidence/mathematician/11-par-import-corrupt.txt`](evidence/mathematician/11-par-import-corrupt.txt) — **run
  before the full-library rebuild**, still showed the raw jszip error (proving the CLI really was running a
  stale library, not that the fix was wrong) —
  [`11b-par-import-corrupt-after-full-build.txt`](evidence/mathematician/11b-par-import-corrupt-after-full-build.txt)
  shows the same command clean after the full rebuild.
- The heap-usage safety net's own unit/integration coverage (`accumulateUniqueGridWeights.test.ts`,
  `generateExactWeightedOutcomeLibrary.test.ts`) passed as part of the full suite; a live multi-minute wide-grid
  CLI run to force a real OOM was not attempted in this sandbox's own time budget (the same "recorded, not
  chased further" call `phase5-evidence/p5-polish-19/README.md` §5 already made for large exact-space
  performance) — the fake-heap-pressure unit tests already exercise the real guard's exact boundary condition,
  which is what a runtime safety net's own regression coverage needs to prove.

## Personas and journeys

Five personas, each starting from `--help` output rather than from any existing script, each deliberately
breaking input somewhere in its own journey:

| Persona | Journey | Evidence |
| --- | --- | --- |
| **Slot mathematician/designer** | `create --random`/`--blank` (incl. a path-like/invalid name and a non-integer `--seed`), `validate`, `reel generate` preview/`--materialize`, `par export` (both the fixed and still-unmaterialized case), `par import` (a corrupt file, a missing file, a directory given by mistake), hand-editing a blueprint to an empty reel strip and re-exporting | [`evidence/mathematician/`](evidence/mathematician/) |
| **Backend developer** | `init` (incl. an empty `--game-id`), the sandbox's own broken-`npm` failure surfaced honestly, `node_modules/pokie` symlink workaround (same convention prior rounds used) + `tsc` build, `sim` (incl. a non-numeric and a negative `--rounds`), a real seeded `sim`, `replay` at a round index the session never actually played | [`evidence/backend/`](evidence/backend/) |
| **Game programmer** | The companion `pokie-examples` workspace's own real adoption tests (`ui.ts`/`data.ts` rendering through the shared `pokie/client/player` module) run live, not just read | [`evidence/programmer/`](evidence/programmer/) |
| **QA/debugger** | A real `pokie studio --no-open` HTTP server driven by real `fetch()`: malformed/empty/garbage-JSON project-open bodies, an object where a `seed` integer is expected, a garbage blueprint through `/validate`, a real play session, and out-of-range/negative/huge values on the one field a hand-typed request could plausibly get wrong | [`evidence/qa/`](evidence/qa/) |
| **Integration engineer** | `stakeengine export`/`outcomelibrary generate` against nonexistent paths, `par import` given a directory instead of a file, `diff` given nonexistent report paths | [`evidence/integration/`](evidence/integration/) |

## Findings

Every finding below was reproduced against a real, freshly built `pokie` binary — not inferred from reading
source. Severity follows this step's own instruction: P0/P1 or *material* P2 requires a fix in this same
hard-gate step before the campaign can proceed; a P2 judged non-material is recorded honestly as such, not
silently dropped.

### F1 — P1 (fixed this round): `pokie par export`/`import` silently dropped its own actionable fix suggestion

- **Where**: `cli/commands/ParCommand.ts`.
- **Repro**: `pokie par export <blueprint-with-reelStripGeneration.json>` (see
  [`evidence/mathematician/09-par-export-unmaterialized.txt`](evidence/mathematician/09-par-export-unmaterialized.txt)).
- **Expected**: `ParSheetExporter`'s own `parsheet-unsupported-reel-source`/`parsheet-missing-reel-strips` issues
  each carry a `suggestion` field with the exact fix (`'run "pokie reel generate <blueprint.json>
  --materialize" ... then export that.'` — literally naming the very flag this same worktree's own pre-existing
  fix just added). `ValidateCommand` already has an established convention of printing a `suggestions` section
  for exactly this reason.
- **Actual**: `ParCommand`'s `executeExport`/`printImportSummary` printed only `issue.code`/`issue.message`,
  never `issue.suggestion` — for both errors and warnings, on both `import` and `export`.
- **UX confusion**: a real new user hits `parsheet-unsupported-reel-source` (the single most likely error for
  anyone exporting a `create --random`/`--blank` blueprint straight to PAR, since neither ever has literal
  `reelStrips`), reads a message that correctly says *what's* wrong, and is never told *what to do about it* —
  despite the exporter already having written down the exact answer. They'd have to find `docs/cli.md` or read
  source to discover `--materialize` even exists.
- **Fix**: `cli/commands/ParCommand.ts` now prints `  suggestion: <text>` beneath any issue that has one, on
  both the export (errors and warnings) and import (errors and warnings) paths. Regression tests added in
  `tests/cli/commands/ParCommand.test.ts` (four new cases). Re-verified live —
  [`evidence/mathematician/10-par-export-suggestion-after-fix.txt`](evidence/mathematician/10-par-export-suggestion-after-fix.txt)
  shows the same unmaterialized-blueprint export now printing the suggestion.

### F2 — P2, material (fixed this round): `pokie stakeengine export` leaked a raw Node error for its single most likely real mistake

- **Where**: `cli/commands/StakeEngineCommand.ts`.
- **Repro**: `pokie stakeengine export <path-to-missing-or-unreadable-config.json> --out <dir>` (see
  [`evidence/integration/01-export-missing-lib.txt`](evidence/integration/01-export-missing-lib.txt)).
- **Expected**: every sibling malformed-config check in the same `loadDescriptor` method (no `modes` array, a
  malformed mode entry, both/neither of `libraryPath`/`bundleDir`) already produces a clean, POKIE-authored
  message plus `CONFIG_HINT` — matching the codebase-wide convention `loadGameBlueprint`/`DiffCommand`/
  `ParSheetImporter` (see F3 below) all already follow: wrap the raw `fs`/`JSON.parse` error in `Could not read
  "<path>": ...`.
  ​
- **Actual**: `loadJson`'s default implementation (`JSON.parse(fs.readFileSync(filePath, "utf-8"))`) was called
  completely unwrapped at both of its two call sites (`loadDescriptor`'s own `configPath`, and each mode's
  resolved `libraryPath`), so a missing/corrupt file raised a bare `ENOENT: no such file or directory, open
  '...'` — no "Could not read" framing, no `CONFIG_HINT`, no indication this is even a POKIE error rather than a
  crash.
- **UX confusion**: pointing `stakeengine export` at the wrong path, or a config that hasn't been written yet,
  is the single most likely mistake a new integration engineer makes on first contact with this command — and
  it was the one case in the whole command that produced the worst error message, an inconsistency with every
  other command in this same codebase.
- **Fix**: added `StakeEngineCommand.loadJsonChecked(filePath, description)`, wrapping `this.loadJson(...)` at
  both call sites with a contextual `Could not read <description> at "<path>": ...` message (`"Stake Engine
  export config"` for the top-level config, `mode "<name>"'s outcome library` for a per-mode `libraryPath`).
  Regression tests added in `tests/cli/commands/StakeEngineCommand.test.ts` (two new cases). Re-verified live —
  [`evidence/integration/01b-export-missing-config-after-fix.txt`](evidence/integration/01b-export-missing-config-after-fix.txt).

### F3–F5 — already fixed in this worktree before this round began (verified live this round, see "Starting state" above)

- **F3 (P1)**: `pokie par export` had no supported path at all from a `reelStripGeneration` blueprint to a PAR
  workbook. Fixed by `pokie reel generate --materialize`.
- **F4 (P2)**: `pokie par import` leaked a raw third-party (`jszip`) error, complete with an unrelated
  documentation URL, for any corrupt/non-`.xlsx` input. Fixed by wrapping `ParSheetImporter.importFromFile`.
- **F5 (P1)**: `generateExactWeightedOutcomeLibrary` could exhaust process memory and crash the whole Node
  process with an uncatchable V8 OOM abort on a wide/many-reel grid, instead of failing closed with an
  actionable error. Fixed by the heap-usage safety net in `accumulateUniqueGridWeights`.

### F6 — process gap (fixed this round, not a product defect): the CI-gating contract suite was left broken

Covered in full under "Verifying the pre-existing fixes" above. Recorded as its own finding because a hard gate
that only checks product behavior and not whether its own regression suite still passes would let exactly this
kind of gap through — `npm test`/`check:fast` (the gate every later step in this campaign depends on) was
genuinely red at the start of this round.

### Explicitly not findings

- The sandbox's own broken `/usr/local/bin/npm` and missing Chromium — reconfirmed present, unrelated to
  POKIE, already tracked in every prior Phase 5 round's "Owner steps".
- Every malformed-input probe against Studio's HTTP API (`evidence/qa/02-api-break-input.json`,
  `03-play-session-break-input.json`) returned a clean `400` with a specific message, or was silently ignored
  because the field genuinely isn't part of that endpoint's contract (e.g. `spin`'s own request body has no
  `bet` field at all — bet is fixed per-session, not per-spin — so a `bet` value in that body doing nothing is
  correct, not a validation gap).
- `pokie replay . --seed X --round <huge number>` — replay derives a round deterministically from
  `(seed, round)` alone and was never designed to require the round having been "played" first; a huge round
  index succeeding is the documented contract, not a bug.
- `pokie par import` given a directory (`/tmp`) instead of a file now produces the same clean, wrapped message
  as a corrupt file (`EISDIR: ...` wrapped by the same F4 fix) — confirms the fix generalizes correctly to
  every `fs.readFileSync` failure mode, not just the corrupt-zip case it was written against.

## Rerun of affected journeys after remediation

- Full `pokie` jest project: **5550/5550 pass** (5545 baseline + 5 new regression tests across F1/F2) —
  [`evidence/fixes/full-suite-after-all-fixes.txt`](evidence/fixes/full-suite-after-all-fixes.txt).
- `eslint . --ext .ts,.tsx`: clean —
  [`evidence/fixes/lint-after-all-fixes.txt`](evidence/fixes/lint-after-all-fixes.txt) (empty output = no
  findings).
- `tsc --noEmit -p tsconfig.typecheck.json`: clean —
  [`evidence/fixes/typecheck-after-all-fixes.txt`](evidence/fixes/typecheck-after-all-fixes.txt).
- The mathematician journey's `par export`/`par import` steps and the integration engineer journey's
  `stakeengine export` step were both re-run live against a freshly rebuilt `dist/` after every fix landed (not
  just re-asserted via unit tests) — see the `-after-fix` files linked in F1/F2 above.

## Campaign-completion gate

No P0/P1 finding and no finding judged a material P2 remains open as of this commit: F1–F6 are all fixed, with
regression coverage and a live rerun proving each fix, and the full test/lint/typecheck gates this campaign
depends on are all green. `pokie-examples` needed no adoption change this round — the game-programmer journey's
own real adoption tests already passed unmodified (see `evidence/programmer/`); no companion commit was made.
