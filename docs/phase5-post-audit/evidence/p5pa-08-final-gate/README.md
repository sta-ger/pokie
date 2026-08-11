[← Back to phase5-post-audit index](../../README.md)

# `P5PA-08` evidence: independent final post-audit hard gate

This step is a fresh, independent re-check of everything `P5PA-01`–`P5PA-07` audited/fixed, plus the one
gate condition none of those seven steps was itself allowed to declare: whether any material P0/P1/P2
finding remains open across the whole campaign. It reproduces evidence directly against current `develop`
(base SHA `7c2a007ab42b50aa0a852f2e1d6d7ce96a475882`) rather than accepting any prior round's report at
face value.

## 1. Independent re-check of all five original concerns + the architecture sweep

Re-read current source for each of the five `P5PA-02`–`P5PA-06` concerns and the `P5PA-07` sweep, cross-
checked against `docs/phase5-post-audit/README.md`'s own claims:

| # | Concern | Step | README classification | Independently re-verified against current source |
| --- | --- | --- | --- | --- |
| 1 | Blueprint Game Model editor (Mechanics field gap) | `P5PA-02` | fixed | `GameModelSections.tsx`/`FreeGamesFieldset.tsx` still present, unchanged since `P5PA-02` |
| 1b | Blueprint Game Model editor (JSON-mode data loss) | `P5PA-01` §3 #1 | **left CONFIRMED P2, still open** as of this step's base SHA | Reproduced below in §2 -- still open, now fixed by this step |
| 2 | TypeScript package Game Model introspection | `P5PA-03` | INTENTIONAL SUPPORTED LIMITATION (basics.name/id conflation fixed) | `buildProjectGameModel.ts`'s `tsPackage` branch still projects only `version`/`description`, confirmed by reading the current file |
| 3 | Multi-mode Outcome Library selection/provenance | `P5PA-04` | fixed | `resolveOutcomeLibraryModeName.ts` still wired into `StudioPlayService`/`StudioSimulationService`/`StudioReplayExecutionService`, confirmed by reading current call sites |
| 4 | Player custom scenario/Replay | `P5PA-05` | fixed | `StudioPlayService.findFreeGames` and its route/frontend wiring still present, confirmed by reading current source |
| 5 | `pokie init` portability (mixed separator) | `P5PA-01`/`P5PA-06` §3 #5 | CONFIRMED P3, then fixed by `P5PA-07` | `GamePackageMergeConflictError.ts:25` now reads `` path.join(projectRoot, "package.json") `` -- confirmed present at this step's base SHA (see `git show 15afe75`) |
| sweep | Bounded architecture sweep (`TODO`/`FIXME`/`HACK`/`XXX`) | `P5PA-01`/`P5PA-07` | zero hits | Re-run fresh this round, see §3 below -- zero hits again |

Command used to confirm #5:

```
$ grep -n "package.json\|path.join" cli/scaffold/GamePackageMergeConflictError.ts
25:            `"${path.join(projectRoot, "package.json")}" already has POKIE-required field(s) set to a conflicting value:\n${details}\n` +
```

**Finding:** every one of `P5PA-02` through `P5PA-07`'s own claimed fixes is genuinely present at this
step's base SHA -- no regression, no since-reverted fix. But `docs/phase5-post-audit/README.md` itself
names one item, three separate times (§3 #1, the `P5PA-02` remediation's own "Out of scope" note, and the
`P5PA-07` sweep's own "Out of scope" note), as **still `CONFIRMED P2`, deliberately left open for "a future
step"**: the Blueprint Game Model editor's JSON-mode unsaved-work data loss
(`evidence/08-blueprint-game-model-editor.txt`). Per this step's own acceptance criteria ("the campaign may
complete only with no remaining material P2/P1/P0 finding"), that open item blocks completion -- it is
fixed by this step, below.

## 2. Reproducing the still-open finding against current source (before this step's own fix)

Read `cli/studio-client/src/components/blueprintEditor/BlueprintJsonPanel.tsx` and
`BlueprintEditorPage.tsx` at this step's base SHA. Confirmed unchanged since the original `08-blueprint-
game-model-editor.txt` finding:

- `BlueprintJsonPanel`'s `Textarea` was uncontrolled (`defaultValue={jsonText}`, read only via a `ref` on
  "Apply JSON" click) -- every keystroke lived only in the DOM, invisible to React state.
- The Form/JSON `SegmentedControl` (`BlueprintEditorPage.tsx`, then lines 966-975) called `setMode`
  directly, with no dirty-check of any kind.
- `mode === "form" ? formModeContent : <BlueprintJsonPanel .../>` renders the two modes as mutually
  exclusive siblings -- switching away unmounts `BlueprintJsonPanel` outright, discarding its uncontrolled
  DOM-only state completely.
- The editor's `isDirty`/navigation-blocker/`beforeunload` protections are all keyed off
  `editor.state.revision`, which only advances on a *committed* mutation (a Form edit, New, Load, or a
  successful "Apply JSON") -- never on raw, unapplied JSON-textarea keystrokes.

Net effect, unchanged from the original finding: a user who types a replacement blueprint into the JSON
textarea and switches back to Form mode (or navigates away) without clicking "Apply JSON" loses that work
completely, with zero warning. Confirmed real, not just source-inferred: `git stash`-ed both product-source
changes (§4 below) back to their pre-fix state and re-ran
`BlueprintEditorPage.jsonModeUnsavedWork.test.tsx` (§5) against it --

```
FAIL studio-client-components tests/.../BlueprintEditorPage.jsonModeUnsavedWork.test.tsx
    ✕ warns before discarding an unapplied JSON edit when switching to Form mode, and Cancel keeps it
    ✕ discards the unapplied JSON edit and switches to Form mode on confirm
    ✓ never gates the mode toggle when the JSON textarea has no unapplied edit
    ✓ a successful Apply JSON clears the draft-dirty flag, so switching away afterwards needs no confirm
Tests: 2 failed, 2 passed, 4 total
```

-- both mode-switch-while-dirty cases fail outright (`screen.findByRole("dialog")` times out: switching
away from JSON mode with an unapplied edit is instant and silent, exactly the original defect), while the
two cases that don't depend on the new confirm gate at all (no dirty edit; dirty edit already applied) pass
unchanged either way, as expected. `git stash pop` restored the fix immediately afterward and the full
suite was re-run clean (§5's own "PASS ... 52 tests" run below is that same re-run, not a stale result from
before the stash).

## 3. Fresh architecture sweep re-run

```
$ grep -rniE "TODO|FIXME|HACK|XXX" src/project cli cli/studio cli/studio-client --include=*.ts --include=*.tsx \
    | grep -v "/tests/\|\.test\." | grep -viE "not.?implemented"
(no output, grep exit 1)

$ grep -rniE "TODO|FIXME|HACK|XXX" /pokie-examples/src | grep -v "/tests/\|\.test\."
(no output, grep exit 1)
```

Zero hits in either repo, consistent with every prior round.

## 4. The fix

`cli/studio-client/src/components/blueprintEditor/BlueprintJsonPanel.tsx`: the `Textarea` is now
controlled (`value`/`onChange` local state, initialized from `jsonText` at mount -- safe because the panel
is remounted via `key={json-${editor.formGeneration}}` on every wholesale replace, per
`useBlueprintEditor.ts`'s own doc comment). A `dirty` flag (`value !== jsonText`, i.e. "does the live
textarea disagree with the last value this editor actually committed or echoed back") is derived every
render and reported to the parent via a new `onDraftDirtyChange` callback prop.

`cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.tsx`: a new `jsonDraftDirty` state,
fed by that callback, is (a) folded into the existing `isDirty` computation (`editor.state.revision !==
cleanRevisionRef.current || jsonDraftDirty`) -- the same `isDirty` that already gates the New Blueprint
dialog's Save/Discard/Cancel step and (via `onDirtyChange`) `useDesignNavigationGuard`'s SPA-navigation
blocker and `beforeunload` guard in `HomePage.tsx` -- and (b) checked directly in the Form/JSON
`SegmentedControl`'s own `onChange`: switching away from JSON mode while `jsonDraftDirty` now opens the
same `useConfirm()` modal `ReelStripGenerationEditor.tsx`'s own dirty-reel `selectReel()` already uses
("Switch away from JSON mode? The unapplied JSON edit will be discarded."), proceeding only on confirm.
Reset to `false` on every wholesale replace (`editor.formGeneration` bump: New/Load/a successful Apply),
matching the point `BlueprintJsonPanel` itself remounts clean.

This reuses two abstractions the editor already had -- `isDirty` and `useConfirm()` -- for a third source
of "unapplied work," rather than inventing a parallel dirty-tracking or confirmation mechanism; it does not
touch Form-mode editing, `applyJsonText`'s parse/validate logic, or any other section editor.

## 5. Regression coverage

New file `tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.jsonModeUnsavedWork.test.tsx`
(4 tests): warns and blocks the switch on Cancel (typed draft survives, still in JSON mode); discards and
switches on Confirm (switching back to JSON afterwards shows the real, unmutated blueprint, not the
discarded draft); never gates the toggle when there's no unapplied edit; a successful "Apply JSON" clears
the draft-dirty flag so a subsequent mode switch needs no confirm.

New case in `tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.newBlueprintFlow.test.tsx`:
an unapplied JSON-textarea edit alone (no Form field touched at all) still gates "New Blueprint" behind the
Save/Discard/Cancel dirty-confirm -- proving `jsonDraftDirty` genuinely reaches the shared `isDirty`, not
just the mode-toggle's own local check.

Two pre-existing tests' comments (`BlueprintEditorPage.validation.test.tsx`,
`BlueprintEditorPage.reelStripModeler.test.tsx`, `BlueprintEditorPage.newBlueprintFlow.test.tsx`) describing
the textarea as "uncontrolled"/read "via a ref" were corrected for accuracy; no test assertions in those
files needed to change -- `fireEvent.change` on a controlled `Textarea` and `.value` reads on the resulting
`HTMLTextAreaElement` both still behave identically from the test's point of view.

Full run (both projects the touched test files span):

```
$ node_modules/.bin/jest --selectProjects studio-client-components studio-client-workflows \
    --testPathPattern "BlueprintEditorPage\.(jsonModeUnsavedWork|newBlueprintFlow|validation|reelStripModeler)\.test" \
    --maxWorkers=2
PASS studio-client-workflows tests/.../BlueprintEditorPage.validation.test.tsx
PASS studio-client-components tests/.../BlueprintEditorPage.newBlueprintFlow.test.tsx
PASS studio-client-workflows tests/.../BlueprintEditorPage.reelStripModeler.test.tsx
PASS studio-client-components tests/.../BlueprintEditorPage.jsonModeUnsavedWork.test.tsx
Test Suites: 4 passed, 4 total
Tests:       52 passed, 52 total
```

(The `<h2>`/`<h4>` DOM-nesting and "not wrapped in act()" console warnings in this output are pre-existing
Mantine `Modal`/`Title`/`Transition` noise unrelated to this change -- the same warnings appear on
`main`/`develop` before this step's diff, reproduced by running the same command against `HEAD~0` with this
step's two product-source files stashed.)

`node_modules/.bin/eslint` on both touched product files and all four touched/added test files: clean, no
errors or warnings. `node_modules/.bin/tsc --noEmit -p tsconfig.typecheck.json`: clean, zero diagnostics.

## 6. `npm`/`check:release`/packaging

Reproduced fresh, not assumed from a prior round's report:

```
$ npm --version
/usr/local/bin/npm: 4: Syntax error: word unexpected (expecting ")")
(exit 2)
```

Reading `/usr/local/bin/npm` directly shows a real shell syntax error in its own `case` pattern (a stray
`|*'` token before its `check:release`/`check:full`/etc. arm), which aborts `sh` before any argument
dispatch runs -- every `npm` invocation in this sandbox fails at that same parse step, not only the
project-wide-gate ones the wrapper's surviving logic is otherwise clearly trying to restrict to the
orchestrator. This is the same blocker every `P5PA-01`–`P5PA-07` round already reproduced and documented
(most recently `P5PA-06`'s own evidence); this implementer step reproduces it once more rather than citing
that history on its own word, and -- consistent with this implementer's own scope (project-wide gates,
`check:release`, and packaging are the orchestrator's own responsibility, not an implementer step's) -- does
not attempt to work around it. `node_modules/.bin/tsc`/`node_modules/.bin/jest`/`node_modules/.bin/eslint`
invoked directly (§5 above) are unaffected by this wrapper and are what this step's own verification relies
on, the same fallback every prior P5PA round used.

## 7. Companion (`/pokie-examples`)

No product behavior touched by this step's fix lives in, or is exercised differently by, `pokie-examples` --
the JSON-mode textarea is a Studio-only browser editing surface with no `pokie-examples` counterpart.
`/pokie-examples` remains on `develop` `0d068cafbf541a66b86ae5abe128e510291bacfa`, working tree clean, no
commit required here (re-confirmed fresh, matching `P5PA-01`'s own note that a companion commit is only
required when a step's fix actually touches shared/generated behavior).

## 8. Final classification (this campaign's own taxonomy, `README.md` §2)

| # | Concern | Classification after this step |
| --- | --- | --- |
| `P5PA-02` (Mechanics field gap) | fixed, re-confirmed present |
| `P5PA-02`/`P5PA-01` §3 #1 (JSON-mode data loss) | **was CONFIRMED P2, now fixed by this step** |
| `P5PA-03` (tsPackage introspection) | INTENTIONAL SUPPORTED LIMITATION, unchanged |
| `P5PA-04` (multi-mode selection/provenance) | fixed, re-confirmed present |
| `P5PA-05` (Player custom scenario/Replay) | fixed, re-confirmed present |
| `P5PA-06`/`P5PA-01` §3 #5 (mixed separator) | was CONFIRMED P3, fixed by `P5PA-07`, re-confirmed present |
| Architecture sweep | zero `TODO`/`FIXME`/`HACK`/`XXX` markers, both repos |

**No remaining material P0/P1/P2 finding.** This campaign (`P5PA-01`–`P5PA-08`) may complete.
