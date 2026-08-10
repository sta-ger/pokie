[← Back to phase5-post-audit index](../../README.md)

# P5PA-03 evidence: real `pokie init` package, real basics mislabel, real fix

Gathered against product HEAD `3bd1a53...` (this step's own base — `merge task task/P5PA-02-20260810131718
(implementation 0495bf46d7f3)`), working tree clean before and after except this step's own product/test/doc
commits; scratch build artifacts confined to `/tmp`.

## What this proves

`buildProjectGameModel.ts`'s `tsPackage` branch mapped `GamePackageInspector`'s `packageJson.name` into
`GameModelBasics.name` — the field Studio's Game Model → Game basics section renders as `Name: ...`. That
mapping was never correct: `packageJson.name` is the npm package identifier, not the game's own display name.

- `src/generated/GamePackageGenerator.ts:63,84` (`pokie build --target tsPackage`): `packageJson.name` is
  always set to `blueprint.manifest.id` verbatim — the game's own display name (`manifest.name`) is never
  written into the built package at all (see the class's own doc comment: "Nothing under the built package
  tracks where it came from").
- `cli/scaffold/GamePackageMerger.ts` (`pokie init`): `packageJson.name` comes from `--package-name`/the
  directory basename; the game manifest's own `name` comes from a separate `--game-name` (or
  `deriveManifestDefaults`) and is written only into `src/index.ts`/`README.md` — never into `package.json`.
  `docs/cli.md:1406` documents this explicitly: "`--game-id` never seeds or otherwise changes `package.json`'s
  `name`" — the same is true of `--game-name`.

So before this fix, a real `pokie init --package-name sample-init-slot --game-name "Sample Init Slot"` package
would render in Studio's Game Model tab as `Id: (none)` / `Name: sample-init-slot` — both wrong: the id *is*
known (`sample-init-slot`) and mislabeled as missing, while `sample-init-slot` is displayed as the game's
*name* when the real name (`"Sample Init Slot"`, only ever readable from `src/index.ts`'s own hand-written
manifest literal) is nothing like it.

## Real, unmocked reproduction

`npm` is broken in this sandbox (same dash case-pattern defect prior P5PA rounds already hit — every `npm`
invocation, including `npm run typecheck`/`npm test -- <file>`, fails with `Syntax error: word unexpected
(expecting ")")` at the wrapper's line 4 before it ever dispatches). Ran `node_modules/.bin/jest` directly
instead (bypassing the wrapper, not any project policy — the same fallback the P5PA-01 round used for this
exact concern, see `evidence/09-ts-package-game-model-introspection.txt`), against the real, tracked
`jest.config.mjs`, `--selectProjects pokie`.

A throwaway `scratch-p5pa03-evidence.test.ts` (not committed — deleted immediately after this transcript was
captured; `git status --short` was empty before and after) drove:

1. The real `InitCommand` (`cli/commands/InitCommand.ts`), unmocked, with `--no-prepare` (skips `npm
   install`/`npm run build`, which would themselves need working `npm`) — writing real files to a real
   `fs.mkdtempSync` directory.
2. **Case A** — explicit `--package-name sample-init-slot --game-id sample-init-slot --game-name "Sample Init
   Slot"`: confirms the real `package.json` written to disk has `"name": "sample-init-slot"` and contains no
   trace of `"Sample Init Slot"` anywhere, while the real `src/index.ts` genuinely embeds `"name": "Sample Init
   Slot"` in its manifest literal — proving the display name is real, present, and only recoverable from
   TypeScript source Studio's `tsPackage` introspection deliberately never reads.
3. **Case B** — no overrides (directory-derived default): shows the ordinary case, where id/name still differ
   (`"cosmic-riches-vtakka"` vs. `"Cosmic Riches Vtakka"`) purely from slug-vs-title-case formatting, not just
   the deliberately-adversarial Case A.
4. The real `GamePackageInspector().inspect(dir)` against each real directory.
5. The real `buildProjectGameModel(dir, undefined, false, {inspectPackage: <real inspector>, ...})` (**after**
   this step's fix) — confirms `basics` is now `{status: "available", data: {id: "sample-init-slot", version:
   "0.1.0"}}` (Case A) / `{id: "cosmic-riches-vtakka", version: "0.1.0"}` (Case B): `id` populated truthfully,
   `name` correctly left unset rather than holding a wrong value.

Full transcript: [`01-real-init-jest-transcript.txt`](01-real-init-jest-transcript.txt).

**Before** this fix (see the diff in the `[P5PA-03]` commit itself), the exact same real inputs would have
produced `basics.data = {name: "sample-init-slot", version: "0.1.0"}` — computed deterministically by the prior
`manifest: {name: inspected.packageJson.name, ...}` line this step replaced; not re-run separately since it is
mechanically implied by the diff, not a separate claim needing its own reproduction.

## Regression coverage

`tests/cli/studio/blueprint/buildProjectGameModel.test.ts`'s existing `tsPackage` case was updated (not
added fresh — it already existed and already asserted the wrong mapping) to assert `basics.data.id` instead of
`basics.data.name`. Ran the full `pokie` Jest project (350 suites / 5557 tests, `--selectProjects pokie`, no
path filter) — all passed, confirming this fix regresses nothing else in that project.

## What could not be verified

Same sandbox constraint as every prior P5PA round: no Chromium binary, no Playwright/Puppeteer, `npm` broken —
so no real Studio HTTP server + browser capture of `GameModelSections.tsx`'s rendered `Id:`/`Name:` lines. The
load-bearing logic (`buildProjectGameModel`, `GamePackageInspector`, `InitCommand`) was exercised directly and
unmocked instead; `BasicsSection` (`cli/studio-client/src/components/project/GameModelSections.tsx:613-626`)
is a thin, already-covered render of whatever `projection.basics.data` holds (`Id: {data.id ?? "(none)"}`,
`Name: {data.name ?? "(none)"}` — read directly, not re-derived), so the field-level fix above is what actually
determines what those two lines show.
