[← Back to phase5-post-audit index](../../README.md)

# P5PA-03 evidence: real `pokie init` package, real basics mislabel, real fix

Gathered against product HEAD `3bd1a53...` (this step's own base — `merge task task/P5PA-02-20260810131718
(implementation 0495bf46d7f3)`), working tree clean before and after except this step's own product/test/doc
commits; scratch build/test artifacts confined to `/tmp` and deleted immediately after each transcript was
captured (`git status --short` was empty before and after every run below).

**Correction round:** this file originally documented a first fix that mapped `packageJson.name` into
`GameModelBasics.id` instead of `.name`. A reviewer correction (below) found that fix still wrong — it swapped
which identity field was mislabeled, but `packageJson.name` is not safely projectable as *either* `basics.id`
or `basics.name` for a `tsPackage` project. This file now documents the corrected fix (§"What this proves") and
supersedes its own earlier §"Real, unmocked reproduction" case A/B claims, which tested only same-valued
`--package-name`/`--game-id` runs and therefore never actually exercised the divergence the original bug
depended on.

## What this proves

`buildProjectGameModel.ts`'s `tsPackage` branch used to map `GamePackageInspector`'s `packageJson.name` into a
`GameModelBasics` identity field (first `.name`, then, after this step's first pass, `.id`). Neither mapping is
correct: `packageJson.name` is an npm package identifier. It only ever happens to equal the game's own id for
one specific provenance — a package produced by `pokie build --target tsPackage` — and `GamePackageInspector`'s
report carries no marker that lets a caller tell that provenance apart from any other `tsPackage` project on
disk (e.g. one produced by `pokie init`, or hand-authored).

- `src/generated/GamePackageGenerator.ts:63,84` (`pokie build --target tsPackage`): `packageJson.name` is
  always set to `blueprint.manifest.id` verbatim — the game's own display name (`manifest.name`) is never
  written into the built package at all (see the class's own doc comment: "Nothing under the built package
  tracks where it came from").
- `cli/scaffold/GamePackageMerger.ts` (`pokie init`): `packageJson.name` comes from `--package-name`/a
  pre-existing `package.json`'s own `name`/the directory basename (`resolveDefaultPackageName`); the game
  manifest's own `id` comes from a wholly independent `--game-id`/`deriveManifestDefaults(packageName)`
  (`GamePackageMerger.ts:52-58`) and is written only into `src/index.ts`/`README.md` — never into
  `package.json`. `docs/cli.md:1406` documents this explicitly: "`--game-id` never seeds or otherwise changes
  `package.json`'s `name`" — the same is true of `--game-name`. `pokie init --package-name storefront-widgets
  --game-id sunset-riches` is a real, valid, fully-supported invocation that puts a genuinely different value
  in each place.

So a real `pokie init` package with `--package-name`/`--game-id` set apart could not be told apart, by anything
`GamePackageInspector` reads, from a `pokie build` package whose `packageJson.name` really is the game id.
Projecting `packageJson.name` into `basics.id` (this step's first pass) or `basics.name` (the pre-existing bug)
is therefore never safe for a `tsPackage` project in general — only `version` (which `GamePackageMerger` always
keeps in lockstep with the manifest's own `version` — `firstNonBlank(versionOverride, existingPkg.version,
DEFAULT_VERSION)` feeds both) and `description` (passed through verbatim, never asserted as identity) are
safely introspectable here.

Fixed in `buildProjectGameModel.ts`'s `tsPackage` branch: `basics` now carries only `version`/`description`
from `packageJson`; `id` and `name` are both left unset. `packageJson.name` is still surfaced, but only inside
the plain-language `reason` string every other unavailable section already shows (`This project is a compiled
TypeScript package ("<packageJson.name>") -- ...`), never asserted as a `GameModelBasics` identity field a
caller could mistake for canonical.

## Real, unmocked reproduction

`npm` is broken in this sandbox (same dash case-pattern defect prior P5PA rounds already hit — every `npm`
invocation, including `npm run typecheck`/`npm test -- <file>`, fails with `Syntax error: word unexpected
(expecting ")")` at the wrapper's line 4 before it ever dispatches). Ran `node_modules/.bin/jest` directly
instead (bypassing the wrapper, not any project policy — the same fallback the `P5PA-01` round used for this
exact concern, see `evidence/09-ts-package-game-model-introspection.txt`), against the real, tracked
`jest.config.mjs`, `--selectProjects pokie`.

A throwaway `scratch-p5pa03-evidence.test.ts` (not committed — deleted immediately after each transcript was
captured) drove, each time against a real `fs.mkdtempSync` directory:

1. The real `InitCommand` (`cli/commands/InitCommand.ts`), unmocked, with `--no-prepare` (skips `npm
   install`/`npm run build`, which would themselves need working `npm`) — writing real files to disk.
2. The real `GamePackageInspector().inspect(dir)` against that real directory.
3. The real `buildProjectGameModel(dir, undefined, false, {inspectPackage: <real inspector>, ...})`.

**The divergent case the original bug (and this step's first, reviewer-corrected pass) depended on:**
`pokie init --package-name storefront-widgets --game-id sunset-riches --game-name "Sunset Riches"`. The real
`package.json` written to disk has `"name": "storefront-widgets"`; the real `src/index.ts` genuinely embeds
`"id": "sunset-riches"` / `"name": "Sunset Riches"` in its manifest literal — proving the real game id/name are
knowable, just not from `package.json`, which `GamePackageInspector`/`tsPackage` introspection never reads
past. The real `GamePackageInspector().inspect(dir)` returns `{packageJson: {name: "storefront-widgets",
version: "0.1.0"}}` — no trace of `"sunset-riches"` anywhere. The real `buildProjectGameModel(...)` (after this
fix) returns `basics: {status: "available", data: {version: "0.1.0"}}` — no `id`, no `name`, and critically
**not** `id: "storefront-widgets"`, which is exactly what this step's own first, reviewer-corrected pass would
have produced for this same input. Full transcript:
[`02-real-divergent-init-jest-transcript.txt`](02-real-divergent-init-jest-transcript.txt).

The original (superseded) `01-real-init-jest-transcript.txt` transcript is kept for its own honest record of
what the first pass actually ran — two cases (`--game-id`/`--package-name` explicitly set to the *same* value,
and no overrides at all, where both derive from the same directory basename) that, as the reviewer correction
above notes, never actually exercised a divergent id/name and so could not have caught that first pass's own
`.id` conflation. It is superseded by `02-real-divergent-init-jest-transcript.txt` and no longer describes
current behavior (it predates this file's own correction round) — retained only as a record of what ran, not
as a current claim.

## Regression coverage

`tests/cli/studio/blueprint/buildProjectGameModel.test.ts`'s `tsPackage` case was updated to assert
`basics.data` carries only `version`/`description` (no `id`, no `name`). A new case,
`"never projects packageJson.name as basics.id for a real pokie-init package whose --package-name and --game-id
diverge"`, was added, contract-faithful to the real divergent reproduction above (`GamePackageMerger`'s own
independent `--package-name`/`--game-id` overrides), asserting `basics.data.id`/`basics.data.name` are both
`undefined` even when `packageJson.name` ("storefront-widgets") is present. Ran the full `pokie` Jest project
(350 suites / 5558 tests, `--selectProjects pokie`, no path filter) — all passed, confirming this fix regresses
nothing else in that project.

## What could not be verified in the original pass

Same sandbox constraint as every prior P5PA round: no Chromium binary, no Playwright/Puppeteer, `npm` broken —
so no real Studio HTTP server + browser capture of `GameModelSections.tsx`'s rendered `Id:`/`Name:` lines. The
load-bearing logic (`buildProjectGameModel`, `GamePackageInspector`, `InitCommand`) was exercised directly and
unmocked instead; `BasicsSection` (`cli/studio-client/src/components/project/GameModelSections.tsx:613-626`)
is a thin, already-covered render of whatever `projection.basics.data` holds (`Id: {data.id ?? "(none)"}`,
`Name: {data.name ?? "(none)"}` — read directly, not re-derived), so the field-level fix above is what actually
determines what those two lines show — now `(none)` for both, on a real `tsPackage` project, regardless of
`--package-name`/`--game-id` divergence.

## Browser UI rerun (candidate `8d15989a178c7fd9fe56ef8dac39733167dbbc64`)

The previously unavailable browser check is now completed against a fresh local Studio build from this
candidate. The evidence is in [`browser-ui-rerun/`](browser-ui-rerun/):

- [`01-pokie-init-terminal.txt`](browser-ui-rerun/01-pokie-init-terminal.txt) records the real public
  `pokie init` invocation with `--package-name storefront-widgets --game-id sunset-riches --game-name
  "Sunset Riches" --no-prepare`. Its generated, committed package is
  [`divergent-init-package/`](browser-ui-rerun/divergent-init-package/), whose `package.json` holds the
  deliberately divergent npm name.
- [`02-studio-server-terminal.txt`](browser-ui-rerun/02-studio-server-terminal.txt) records the real
  `pokie studio <that package> --host 127.0.0.1 --port 4103 --no-open` server startup from the freshly
  built candidate.
- Fresh Chrome navigated to that public Studio URL and physically clicked the rendered `Game Model`
  control. The action record is [`03-browser-action-transcript.txt`](browser-ui-rerun/03-browser-action-transcript.txt),
  and the complete rendered result is captured in
  [`04-game-model-no-false-package-name-projection.png`](browser-ui-rerun/04-game-model-no-false-package-name-projection.png)
  and its searchable [`visible text`](browser-ui-rerun/04-game-model-no-false-package-name-projection-visible-text.txt).

The visible Game basics card says `Id: (none)` and `Name: (none)` while the unavailable-section reason
still identifies the package as `"storefront-widgets"`. The npm package name therefore remains explanatory
context and is not falsely projected into either canonical game identity field. The expected unbuilt-entry
warning is visible because `--no-prepare` deliberately skips the package install/build phases; Game Model's
package-metadata inspection remains live and rendered.
