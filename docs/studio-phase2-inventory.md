# POKIE Studio Phase 2 UX/contract inventory (v3)

**Status:** baseline, frozen 2026-07-29 against implementation commit `30b1dd4` (route/tab baseline) plus the
executable fixtures added in `[P2-POLISH-01]`. Written *before* any Phase 2 redesign work touches Studio's
Advanced tabs, so a future redesign step can diff its own intended changes against this document instead of
guessing what "before" looked like.

**Update (`[P2-POLISH-04]`, v2):** every path field enumerated below (Design & Build/Raw Editor's Load/Save/
Output directory, Advanced Tools' three forms -- already on `PathInput` since before this baseline, Open
Project's own Project path, the PAR sheet import/export panel's two paths, and every project-scoped
Advanced-tab path field: Certification, Deployment, Outcome Libraries' three selector kinds, Stake Engine
Export, Provably Fair) now goes through the shared `PathInput` picker/resolver (Browse -- native OS dialog,
falling back to the server filesystem browser -- plus a live on-focus resolved-path hint), not a plain
`TextInput`. Project-scoped fields additionally resolve/display that hint against the *project's* root
(`PathInput`'s `relevantDirectory`, threaded through as a new optional `projectRoot` prop on each Advanced
tab), not wherever `pokie studio` happened to be started from -- `GET /api/home/fs/browse` gained an optional
`base` query param for exactly this (see `StudioFsBrowseService.browse`'s own doc comment). The hint itself
now reads "Resolves to: <path>" for a relative/dot value and "Auto resolved destination: <path>" for a blank/
optional one, rather than one wording for both. This is deliberately **not** a placeholder-text change: every
"misleading placeholder" flagged below is left exactly as pinned (existing fixtures still assert the same
strings) -- the live hint, not different placeholder copy, is what now keeps a user from mistaking gray
placeholder text for a real value. `StudioFsBrowseView`'s `error` variant also gained a `reason: "absent" |
"type" | "permission" | "other"` field alongside its existing message, for callers that want to key off a
stable value instead of the message text. None of the Stepper/gating/inferable-input findings below changed;
only the path fields' own control type and hint wording did -- **the raw-error-passthrough finding did later
change for scoped path actions specifically; see the v3 update immediately below.**

**Update (`[P2-POLISH-04]`, v3):** the "raw-error-passthrough" finding below is no longer accurate for every
*scoped path action* -- the action a user takes by submitting a path/bundle-dir/library-path field, as
opposed to a mount-time list/status fetch that carries no user-typed path. `domain/pathActionError.ts`'s
`describePathActionError(subject, message)` now classifies that raw fs/schema failure text (absent/
permission/wrong-type/schema-path, mirroring `StudioFsBrowseErrorReason`'s own naming) and renders
subject-specific inline status + remediation instead -- never the raw message. Wired into: Design & Build /
Raw Editor's Blueprint Load/Save (`BlueprintLoadSaveControls.tsx`) and the PAR sheet Import/Export panel
(`ParSheetImportExportPanel.tsx`); Open Project's `OpenProjectForm.tsx`; Certification's Validate/Build;
Deployment's `runError` (Configure and Deploy steps only -- **not** the mount-time `targetsError`, which
carries no user-typed path); every Outcome Libraries selector kind's select/deep-validate/compare error and
load-error states; Stake Engine Export's Validate/Export network-error/load-error states (**not** its
already-bespoke conflict messages); and Provably Fair's Configure/Generate/Verify `error`/`load-error` states
that stem from resolving `bundleDir` (**not** Configure's `invalid` domain-validation message, Generate's
`build-error` -- already a specific, actionable `FairnessRoundProofBuildError` code+message, not a raw fs
error -- or the pasted-proof/pasted-commitment JSON-parse errors, none of which are path actions). See
`tests/cli/studio-client/src/domain/pathActionError.test.ts` for the classifier's own reason-by-reason
coverage and the "Scoped path-action error remediation baseline" describe block in
`studioSurfaceInventory.baseline.test.tsx` for representative end-to-end fixtures.
**Update (`[P2-POLISH-04]`, v4):** Advanced Tools' three plain forms are no longer a raw-error-passthrough
exception either. `CreateProjectForm.tsx`, `InitProjectForm.tsx`, and `BuildFromBlueprintPanel.tsx` (Home's
version, not the Blueprint Editor's own panel of the same shared components) now each wrap their
`ScaffoldActionView`/`BuildPreviewView`/`BuildProjectView` `error`/`load-error`/`failed` messages through
`describePathActionError` before rendering, same policy as everywhere else in this document. Create's
combined destinationDir+name request has no server-side field-level distinction for its failures (an invalid/
conflicting name, a destination it can't write to all share one `{status:"error"}` DTO -- see
`StudioHomeService.createProject`), so every one of its failures is shown under one fixed subject, "The
destination directory" -- same single-fixed-subject convention `BlueprintBuildPanel` already uses for its own
outDir-only failures. Init's `directory` is its only field, so every failure is unambiguously "The project
directory". Build-from-blueprint's two path fields *are* cleanly separable server-side
(`StudioHomeService.loadAndValidateBlueprint` only ever touches `blueprintPath`; `GamePackageGenerator.generate`
only ever touches `outDir`), so its `load-error` status is described as "The blueprint file" and its own
domain `error`/`failed` status (build only -- preview never writes) as "The output directory", mirroring
`BlueprintBuildPanel`'s existing outDir subject exactly since it's the identical underlying service. See the
"Advanced Tools / Create Project", "Advanced Tools / Initialize", and "Advanced Tools / Build from Blueprint"
cases in the "Scoped path-action error remediation baseline" describe block in
`studioSurfaceInventory.baseline.test.tsx` for representative ENOENT/required-field fixtures, and each tool's
own dedicated test file for the destination-already-exists domain-conflict case (also now translated, not raw).
**Deliberately unchanged:** Runtime and Replay (neither has a path field at all -- see their own sections
below); `BlueprintValidationPanel`'s plain-`<Text>` accessibility gap; every hand-built (non-raw-fs) message
already documented as an exception -- Save's/the two exports' own conflict messages, Stake Engine Export's
non-overwritable-conflict message.

**Update (`[P2-POLISH-04]`, v5):** every "misleading placeholder" finding below (Certification's bundle
directory/Mode name/Seed; Provably Fair's Configure-step bundle directory/Server seed/Client seed/Mode name;
Outcome Libraries' Library JSON path/Bundle directory/Stake Engine export directory/Mode name; Stake Engine
Export's per-mode Mode name/Outcome library path) was individually re-audited against the actual CLI/server
codebase for a real, code-backed default a Studio field could legitimately prefill instead of illustrative
example text -- not just left "exactly as pinned" on the strength of the live resolver hint added in v2, which
tells a user where a value *would* resolve to but was never itself a substitute for a real initial value. That
audit found **no** such convention anywhere for any of them: `OutcomeLibraryBundleWriter`/`Reader`/`Validator`
(`src/weightedoutcome/bundle/`), `StudioOutcomeLibraryService.loadLibrary` (`cli/studio/outcomeLibrary/
StudioOutcomeLibraryService.ts`), and `loadWeightedOutcomeLibraryFromProjectFile` (used by Deployment's own
per-mode library path, same finding) all require an explicit, caller-supplied path/directory with no fallback;
`pokie outcomelibrary build`'s own real default (`OutcomeLibraryCommand.ts:99`,
`path.join(path.dirname(configPath), "outcomelibrary")`) depends on where a hand-authored build config lives,
not on a mode name or the project root, and produces a different (bundle) layout than these fields' own
flat-JSON/bundle/Stake-Engine-export selectors expect; `GameBlueprint`'s `BetMode` type
(`src/gamepackage/BetMode.ts`) carries no library-path field a mode name could look up. These are all
*source* locations -- pointing at pre-existing content the tool doesn't create -- so inventing a plausible-
looking default (e.g. resolving blank to the project root, the way Init Project's/Create Project's *destination*
fields already correctly do) would reproduce the exact "looks real, isn't" problem this step exists to remove,
not fix it. Per this audit, every one of these fields correctly **keeps** its existing placeholder --
`studioSurfaceInventory.baseline.test.tsx`'s existing "Advanced tab path-field & disabled-action baseline"
assertions for them are unchanged.

Two fields, by contrast, **were** found to be either already-inferable-but-still-carrying-dead-placeholder-
markup or newly-wired-up as inferable, and are now fixed:
- **Stake Engine Export's own Output directory** (`StakeEngineExportTab.tsx`) already rendered a real,
  non-blank initial value (`"stakeengine"`, this tab's own destination-directory convention, not a placeholder)
  -- but the field's JSX still also carried a `placeholder="./stakeengine"` prop that could never actually be
  seen (the field is never blank), a piece of dead/misleading markup left over from before it had a real
  default. Removed; the field now has no `placeholder` attribute at all, matching Certification's own
  equivalent Output directory field (which never carried one). See the updated "Stake Engine Export's Configure
  step" case in `studioSurfaceInventory.baseline.test.tsx`'s "Advanced tab path-field & disabled-action
  baseline" describe block.
- **The PAR Sheet Import/Export panel's own "Export to path"** (`ParSheetImportExportPanel.tsx`, part of
  Design & Build/Raw Editor -- omitted from this document's own path-field enumeration above, an oversight this
  update also corrects) is a genuine *destination* for the blueprint currently open in the editor, and
  `pokie par export`'s own CLI command (`ParCommand.ts`'s `defaultParSheetPath`) already has a real default for
  exactly this: same directory, same basename (extension stripped) as the blueprint's own source, `.par.xlsx`
  appended. `BlueprintEditorPage.tsx` already tracks that source path (`blueprintPath`, previously only threaded
  into `BlueprintBuildPanel` as `sourcePath`) whenever the current blueprint was reached via Load or a PAR
  import-then-Apply; it's now also threaded into this panel, which uses it to initialize Export to path to that
  same CLI-mirrored default the moment a source path is known -- a real submitted value, not a hint. A brand-new
  blueprint (New, or one only ever edited via JSON) has no known source path to derive from, so the field
  correctly stays blank with its existing `"./game.par.xlsx"` placeholder in that case -- genuinely
  un-inferable, same policy as every field in the previous paragraph. Import path itself (which file to read)
  remains a placeholder unconditionally, for the same "source location, not inferable" reasoning. See the new
  case in `tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.parSheetImportExport.test.tsx`.

**Scope:** every named global/project workflow (Design & Build, Raw Editor, Advanced Tools, Open Project,
Replay, Runtime, Certification, Provably Fair, Deployment, Outcome Libraries, Stake Engine Export) — for each,
what routes/tabs/Steppers exist, every path field and its placeholder, every disabled action and its gating
condition, every place an empty input is silently inferred rather than rejected, every placeholder that could
be mistaken for a real value, and every raw-error surface (a caught exception's message shown to the user with
no added remediation text). Each finding is backed either by an **executable fixture** (cited by file + test
name) or, where a fixture would be redundant with existing fine-grained coverage or not worth the interaction
cost to automate, by **evidence** (a `file:line` citation into the current implementation).

**Not in scope:** this is a documentation/regression-fixture baseline, not a redesign. No production UI
changes are described or implied here — every "finding" below is the *current, frozen* behavior, called out
so a later redesign step has to make an explicit, reviewable decision about it rather than silently keep or
lose it.

**Versioning:** increment the version marker above whenever a Phase 2 redesign step intentionally changes one
of the frozen facts recorded here — this document should never quietly drift out of sync with the fixtures it
describes. See `docs/studio-frontend.md` for the living implementation narrative (stack, IX architecture,
directory layout, testing setup) this document does not duplicate.

## How to read each workflow section

- **Route/tab evidence** — where the workflow lives and how it's reached.
- **Stepper** — the ordered step list and its gating, cross-referenced against the classification table in
  `docs/studio-frontend.md`'s "Stepper vs. other step/wizard UI" audit.
- **Path/text fields** — every field a user types a path or identifier into, with its placeholder (or lack of
  one) and default/empty-value behavior.
- **Disabled actions** — every button that can be disabled, and the exact condition.
- **Inferable empty inputs** — where a blank field is silently defaulted/omitted rather than rejected.
- **Misleading placeholders** — placeholder text realistic enough to be mistaken for a filled-in value.
- **Raw-error surfaces** — where a caught exception's `.message` (via `domain/errorMessage.ts`) is shown
  verbatim through the shared `common/ErrorState.tsx` (`role="alert"`, renders `{message}` with **no** added
  wrapping, retry copy, or remediation text — confirmed at the component level, so this is a single systemic
  pattern, not 7 independent ones).

---

## Design & Build (`/home/design`, guided `BlueprintEditorPage`)

**Route/tab evidence:** `/home/design` (default Home tab, ungrouped). `HomePage.tsx:20,79-81` mounts a
guided `<BlueprintEditorPage guided .../>` instance permanently (hidden via CSS when another Home tab is
active, never unmounted). Covered by the route-table/Home-tab-inventory fixtures above (executable).

**Stepper:** not a Mantine `Stepper` at all -- a read-only `StepProgressList` (`BlueprintEditorPage.tsx:317`,
`common/StepProgressList.tsx`), 3 items: Configure → Validate → Build (`describeGuidedProgress`,
`BlueprintEditorPage.tsx:48-57`). Purely derived from `validationView.status`, with no `onStepClick` at all
-- there is nothing to click ahead to (`StepProgressList.tsx`'s own doc comment), unlike every interactive
Advanced-tab Stepper elsewhere in this document. Fully exercised end to end (idle/invalid/ok transitions,
`aria-current`/`aria-disabled` semantics) by
`BlueprintEditorPage.guidedProgress.test.tsx`; not re-demonstrated here.

**Path/text fields (evidence only):** hidden behind a "Show advanced options (JSON mode, load/save by
path)" disclosure (`BlueprintEditorPage.tsx:322-328`, executable presence-only via the New-Blueprint-action
fixture above) -- "Load from path" / "Save to path" (`BlueprintLoadSaveControls.tsx:38,42`) and the Build
panel's "Output directory (optional)" (`BlueprintBuildPanel.tsx:100`). **None of the three carries a
placeholder** -- pinned executably below (path-field placeholder baseline). The same disclosure also hosts the
PAR Sheet Import/Export panel (`ParSheetImportExportPanel.tsx`, own section reference: this file is the Home-
surface part of Advanced Tools' "raw" Blueprint Editor path too, see the Raw Editor section below) --
previously omitted from this enumeration, an oversight `[P2-POLISH-04]`'s v5 update corrects: "PAR sheet path"
(Import step) and "Export to path" (Apply/Export step) both carry the placeholder `"./game.par.xlsx"`. Import
path stays a placeholder unconditionally (a source file to read, no inferable default); Export to path is now
initialized to a real value derived from the editor's own known blueprint source path (via `blueprintPath`,
mirroring `pokie par export`'s own `defaultParSheetPath` default) whenever one is known (Load, or a prior PAR
import applied), and only falls back to blank+placeholder for a brand-new/JSON-only blueprint -- see the v5
update above and `BlueprintEditorPage.parSheetImportExport.test.tsx`'s own new case.

**Disabled actions (executable):** "Build Package" is the **one and only** `disabled`-gated action across
this entire section (and the Raw Editor / Advanced Tools / Open Project sections below) --
`disabled={guidedBuildBlocked}`, where `guidedBuildBlocked = validationView.status !== "ok"`
(`BlueprintEditorPage.tsx:283,378`) blocks Build until the *current revision* has actually validated
cleanly (idle/loading/error/invalid all block it). New/Load/Save/Validate/"Build Preview" carry no
`disabled` prop anywhere in this section -- only a `loading` state. Fully exercised (including the
edit-after-validate re-block) by `BlueprintEditorPage.validation.test.tsx`.

**Inferable empty inputs (evidence only):** Build panel's Output directory: `outDir.trim() || undefined`
(`BlueprintBuildPanel.tsx:59,66`) -- blank/whitespace silently becomes "use the default output directory"
rather than being rejected, same coercion pattern as every Advanced tab's own optional-directory fields.
Load/Save's own path fields have **no** trim/default at all -- see Raw-error surfaces below, since they're
not `required` and a blank one just reaches the server.

**Misleading placeholders:** none in `BlueprintEditorPage.tsx`, `BlueprintLoadSaveControls.tsx`, or
`BlueprintBuildPanel.tsx` -- `grep`-confirmed zero `placeholder` occurrences; pinned executably below. PAR
Sheet Import/Export's own Import path placeholder (`"./game.par.xlsx"`, corrected into this enumeration by the
v5 update above) is a source-location placeholder with no code-backed default, same reasoning as every other
tab's own source-path fields -- correctly unchanged.

**Raw-error surfaces (evidence only, except Load/Save -- see below):** `loadView`
error/load-error → `ErrorState`, subject-specific status + remediation via `describePathActionError` since
`[P2-POLISH-04]`'s v3 update (`BlueprintLoadSaveControls.tsx:58`); `saveView` error/failed → `ErrorState`,
same treatment (63); `saveView` conflict → `RecoveryNotice` with an "Overwrite" action, the same partial
exception to raw passthrough Stake Engine Export's overwritable-conflict case is (61) -- its own message is
already hand-built, not run through the classifier; Build Preview/Build Result errors via
the shared `BuildPreviewDisplay`/`BuildResultDisplay` (`common/BuildPreviewDisplay.tsx`,
`common/BuildResultDisplay.tsx`). **Update (`[P2-POLISH-26]`):** `BlueprintValidationPanel`'s own "error"
status (the `/api/home/blueprints/validate` request itself failing outright -- a network exception, not a
domain validation result) used to render as a **plain `<Text>`**, not routed through `ErrorState`/`role="alert"`
at all -- the one raw-error case in this whole document that wasn't even wrapped in an `Alert`, let alone a
friendlier one, flagged as an accessibility gap (a screen reader relying on `role="alert"` announcements would
miss it entirely) and left open across every prior update to this document. **Fixed:** the same
`describePathActionError("This validation request", ...)` treatment `MechanicsEditorTab.tsx` already uses for
the identical endpoint's identical network-exception catch, now wired at `BlueprintValidationPanel.tsx`'s own
render call site (`ErrorState` for "error"; the pre-existing plain `<Text>` is left as-is for "invalid"/"ok",
which were never the accessibility gap). See the new "shows a subject-specific recovery message, never the raw
backend text, when the validation request itself fails outright..." case in
`BlueprintEditorPage.validation.test.tsx`.

---

## Raw Editor (Advanced Tools' non-guided `BlueprintEditorPage` instance)

**Route/tab evidence:** `/home/advanced` (`HomePage.tsx:22,95,145`). A second, independently-mounted
`<BlueprintEditorPage />` instance with `guided` omitted -- "exactly as it always has" per the component's
own doc comment (`BlueprintEditorPage.tsx:82-87`). Covered by the Home-tab-inventory and New-Blueprint-
action-surface fixtures above (executable).

**Stepper:** none -- no `StepProgressList`/`Stepper`/`NextStepCallout` renders at all when `guided` is
false (`BlueprintEditorPage.tsx:310-320` are gated on `guided &&`). Confirmed executable by the existing
"only the guided instance offers a 'Show advanced options' disclosure" fixture's sibling assertions.

**Path/text fields:** identical set to Design & Build's (Load from path / Save to path / Output directory,
plus PAR Sheet Import/Export's own Import path/Export to path -- see the v5 update in Design & Build's own
section above), but **always visible**, never behind a disclosure (no `advancedOptionsOpened` prop passed,
`BlueprintEditorPage.tsx` guided-vs-raw JSX). Same "no placeholder anywhere" finding for the first three,
pinned once for both sections by the path-field placeholder baseline below; Import/Export to path carry the
identical placeholder/real-default-when-known behavior described in Design & Build's own section (this is the
same `ParSheetImportExportPanel` instance's own logic, just always visible here instead of behind a
disclosure).

**Disabled actions (executable -- the material gap this baseline closes):** "Build Package" here is gated
by `validationView.status === "invalid"` only (`BlueprintEditorPage.tsx:378`) -- looser than the guided
instance's `!== "ok"`. Concretely: **Build Package is enabled before any validation has ever been
attempted**, and only becomes disabled once a validation actually comes back invalid. This asymmetry
between the guided and raw instances of the identical button/panel was previously only described in prose
(`BlueprintBuildPanel.tsx`'s own `blocked` doc comment); it is now pinned end to end by the "Design & Build
vs. Raw Editor: Build-gating baseline" fixture below -- idle-state not-disabled, then disabled after an
invalid Validate response.

**Inferable empty inputs:** same as Design & Build (Output directory trim-or-undefined).

**Misleading placeholders:** none for Load from path/Save to path/Output directory, pinned by the same
fixture as Design & Build. PAR Sheet Import/Export's own Import path placeholder is unchanged (same
"source location, no code-backed default" reasoning as every tab's own source-path fields); Export to path's
own placeholder is now unreachable whenever the editor knows the blueprint's own source path, per the v5
update in Design & Build's own section above.

**Raw-error surfaces (executable -- fixture below):** Load from path carries no `required` gating at
all (unlike every required `PathInput` elsewhere in this group) -- a blank path is sent straight to
`POST /api/home/blueprints/load`, and the server's own `validateLoadBlueprintRequest` rejection
(`'"path" is required.'`) comes back classified as `schema` and rendered as "The blueprint file is missing
or invalid. Provide a valid value and try again." (since `[P2-POLISH-04]`'s v3 update) rather than verbatim.
Demonstrated end to end (request body + rendered alert text, and that the raw string is absent) by
"Design & Build / Raw Editor: Load/Save raw-error-surface baseline" below. Save's identical gap is
evidence-only (same component, same `validateSaveBlueprintRequest` rejection shape, same fix).

**Contract cross-reference:** `StudioRequestContractBaseline.test.ts`'s new "Design & Build / Raw Editor
(Load / Save / Build) vs. Advanced Tools' Init/Build-from-blueprint" block pins that Save's own
request-validation layer (and the service that writes it) never validates the *blueprint's own shape* at
all -- only that it's present -- unlike Build, which always runs the full validator first. A structurally
invalid blueprint can be written to disk via Load/Save, sidestepping Build's own gate entirely.

---

## Advanced Tools (scaffold a hand-coded game / initialize in place / build from an existing blueprint file)

The Raw Editor above is physically part of this same `/home/advanced` tab (`HomePage.tsx:95-148`); it's
documented in its own section above since its Stepper/gating story is materially different from these
three plain-form tools. These three (`CreateProjectForm`, `InitProjectForm`, `BuildFromBlueprintPanel`)
share one shape: an uncontrolled Mantine `useForm`, a `PathInput` (or plain `TextInput`) per field, and a
submit button with no `validate` config on the form at all.

**Route/tab evidence:** `/home/advanced`, same as the Raw Editor. Covered by the Home-tab-inventory
fixture's own heading assertions ("Scaffold a hand-coded game" / "Initialize an existing directory" /
"Build from an existing blueprint file", executable).

**Stepper:** none -- three independent, non-sequenced forms with no shared progress indicator of any kind.

**Path/text fields (evidence only, deeply covered by each tool's own dedicated component test --
`CreateProjectForm.test.tsx` / `InitProjectForm.test.tsx` / `BuildFromBlueprintPanel.test.tsx`, including
`PathInput`'s own Browse/resolved-hint/Cancel behavior in depth):** Create Project's "Destination
directory" (`PathInput`, required, default `"."`, `CreateProjectForm.tsx:65-73`), "Package name" (required,
defaults to the concrete `"my-slot-game"` so Create works with zero typing -- `DEFAULT_PROJECT_NAME`,
`CreateProjectForm.tsx:17,36`), "Game id"/"Game name"/"Version" (all optional); Init Project's "Existing
project directory" (`PathInput`, required, default `"."`, `InitProjectForm.tsx:45-53`); Build-from-
blueprint's "Blueprint JSON path" (`PathInput`, required, `BuildFromBlueprintPanel.tsx:80-88`) and "Output
directory (optional)" (not required, 89-96). **None of these six fields carries a placeholder** -- pinned
executably below, alongside Design & Build/Raw Editor/Open Project's own fields.

**Disabled actions:** none in this section -- "Create"/"Initialize"/"Preview"/"Build" carry no `disabled`
prop at all (only `loading`); every required field instead relies purely on the underlying `<input
required>`'s **native HTML constraint validation** (no `validate` config passed to any of these 3 forms'
`useForm` calls) to block a blank submission. This is evidence-only for these three tools (their own
dedicated test files never exercise a blank-required-field submit either) -- see Open Project below, where
the identical pattern *is* pinned executably once for the whole group, since all four required fields in
this document (Project path, Destination directory, Existing project directory, Blueprint JSON path) share
the exact same un-tested mechanism.

**Inferable empty inputs (evidence only):** Create Project's `gameId`/`gameName`/`version` each collapse a
blank/whitespace value to `undefined` before sending (`values.gameId.trim() || undefined`, etc.,
`CreateProjectForm.tsx:47-49`) -- optional-override fields, so this is the intended "no override" behavior,
not a validation gap. Build-from-blueprint's `outDir` does the same (`BuildFromBlueprintPanel.tsx:42,50`).

**Misleading placeholders:** none, pinned by the same fixture as Design & Build/Raw Editor/Open Project.

**Raw-error surfaces (executable, new fixtures cited below -- no longer a passthrough since
`[P2-POLISH-04]`'s v4 update):** all three still funnel a failed create/init/preview/build into the shared
`ScaffoldResultDisplay`/`BuildPreviewDisplay`/`BuildResultDisplay` → `ErrorState`, but each tool now
pre-translates the `message` it hands that shared display through `describePathActionError` first -- Create
and Init under one fixed subject each ("The destination directory" / "The project directory"), Build-from-
blueprint under one of two, depending on which underlying service failed ("The blueprint file" for a
`load-error`, "The output directory" for Build's own domain `error`/`failed`). See the "Advanced Tools /
Create Project", "Advanced Tools / Initialize", and "Advanced Tools / Build from Blueprint" cases in
`studioSurfaceInventory.baseline.test.tsx`'s "Scoped path-action error remediation baseline" describe block
(ENOENT/required-field fixtures) and each tool's own dedicated test file (the destination-already-exists
domain-conflict case, evidence that even a non-fs hand-typed message is translated, not just raw fs/schema
text).

**Contract cross-reference:** `StudioRequestContractBaseline.test.ts`'s new contract block also pins Init
Project's request shape (directory-only, no name/gameId/gameName/version overrides Create Project accepts)
and confirms Build-from-blueprint shares its exact request shape (`blueprintPath` + optional `outDir`) with
the Blueprint Editor's own Build panel (`validateBuildRequest` is literally the same function both
`POST /api/home/projects/build/preview` and `POST /api/home/projects/build` use).

---

## Open Project (`/home/open`)

**Route/tab evidence:** `/home/open` (`HomePage.tsx:21,83-93`). Two independent ways to open a project:
`RecentProjectsPanel` (a fetched table) and `OpenProjectForm` (a manual path). Covered by the Home-tab-
inventory fixture (executable) and, for the dirty-Design-draft guard both paths share via `useOpenProject`,
exhaustively by `openProjectGuard.test.tsx` (Cancel/Confirm/failed-call/Back-Forward/tab-switch, all
executable) -- not re-demonstrated here.

**Stepper:** none.

**Path/text fields (executable, new fixture below):** `OpenProjectForm`'s "Project path"
(`OpenProjectForm.tsx:39`) is `required` and carries **no placeholder** -- confirmed by the path-field
placeholder baseline below.

**Disabled actions (executable, new fixture below):** "Open" carries no `disabled` prop at all (only
`loading`, `OpenProjectForm.tsx:40`) -- exactly the same native-`required`-only pattern as Advanced Tools'
three forms above. "Refresh" (`RecentProjectsPanel.tsx:40-42`) is never disabled either. **This is pinned
executably here** (not just described from source) since it's the cleanest, least-noisy place to
demonstrate it once for the whole group: clicking "Open" with a blank "Project path" makes **zero** API
calls and shows **zero** feedback of any kind (no alert, no loading state) -- the browser's own native
constraint-validation UI is the only signal, and it isn't visible to `@testing-library`'s DOM assertions at
all, only to a real user in a real browser. Advanced Tools' 3 forms and the Raw Editor's own required Load/
none-required-but-server-rejects-it Load field (see above) are evidence-only variants of this exact same
"required-but-not-disabled" convention, not repeated as separate fixtures.

**Inferable empty inputs:** none -- `OpenProjectForm`'s only field is the required path above; no default/
coercion behavior exists to observe.

**Misleading placeholders:** none, pinned by the shared fixture below.

**Raw-error surfaces (evidence only, exhaustively covered by `openProjectGuard.test.tsx`'s own failed-
open-project-call case and `RecentProjectsPanel.test.tsx`):** `OpenProjectForm`'s `state.status === "error"`
→ `ErrorState` (`OpenProjectForm.tsx:46`) -- since `[P2-POLISH-04]`'s v3 update, run through
`describePathActionError("The project directory", ...)` rather than shown verbatim (`openProjectGuard.test.tsx`'s
own failed-open-project-call case asserts the raw text is gone). `RecentProjectsPanel`'s own fetch-list error
and per-row open error, both → `ErrorState` (`RecentProjectsPanel.tsx:46`) -- left as raw passthrough: neither
is a user-typed path submission (the list fetch takes no path, and a "missing" row's own open failure is
about a *previously recorded* path, not one this control gates). One additional, previously-unrecorded UX note:
a "missing" recent-project entry (its `projectRoot` no longer resolves on disk) renders as plain dimmed
text with "(missing)" appended instead of a clickable link (`RecentProjectsPanel.tsx:62-64`) -- correctly
non-interactive (there's nothing to open), but with no explanatory tooltip/description beyond the bare
word, evidence-only.

---

## Replay (`project/ReplayTab.tsx`)

**Route/tab evidence:** `/project/replay`, `section: "Advanced"` (`ProjectDashboardPage.tsx:76`). Covered by
`Advanced tab Stepper inventory baseline` → *"Replay: Find, Load, Reproduce, Inspect, Export, in that order"*
(executable).

**Stepper** (`ReplayTab.tsx:221-237`) — Find → Load → Reproduce → Inspect → Export. Reproduce is
`disabled={findMethod === "spin"}` (227); Inspect/Export both `disabled={!inspectReachable}` /
`{!exportReachable}` (233, 236), where `inspectReachable = (findMethod === "spin" && selectedSpin !== undefined)
|| result !== undefined` (202). Matches the "Partially linear" classification in `docs/studio-frontend.md`'s
Stepper audit table. Order pinned by the fixture above; the fine-grained gating/aria-current/free-navigation
behavior is already exhaustively covered by
`ProjectDashboardPage.replayWorkflow.test.tsx` (not re-tested here).

**Path/text fields:** none. `ReplayTab.tsx` has no `PathInput`/`PathBrowseModal` usage and no `placeholder`
prop anywhere (grep-confirmed). Its only text-style inputs are a "Round" `NumberInput` (default 1) and a
"Seed (optional)" `TextInput` (default `""`), neither a path.

**Disabled actions:** Stepper steps as above; "Validate & continue" `disabled={artifactText.trim() === ""}`
(280); "Continue to Reproduce" (artifact flow) `disabled={artifactReproducibility?.status === "blocked"}`
(496).

**Inferable empty inputs (evidence only):**
- Seed field: `values.seed.trim() || undefined` (258) — blank/whitespace silently becomes "no seed" rather
  than being rejected; already exercised incidentally by `replayWorkflow.test.tsx`'s existing seed cases.
- Recent Simulation round picker: an empty/invalid value is silently coerced to `1` (441).

**Misleading placeholders:** none — no `placeholder` prop exists anywhere in this file.

**Raw-error surfaces (evidence only — not re-demonstrated as a fixture here, since
`replayWorkflow.test.tsx` already exercises these paths in depth):** `error` from `useReplayPoll` (537);
job `progress.error` fallback to `"Replay failed."` (536); artifact-validation `expected.message` (473);
`listError` (296, 768); `recentSpinsError` (336); `recentRunsError` (411). All pass straight into
`<ErrorState>` with no remediation text.

---

## Runtime (`project/RuntimeTab.tsx`)

**Route/tab evidence:** `/project/runtime`, `section: "Advanced"` (`ProjectDashboardPage.tsx:77`). Covered by
the Stepper-inventory fixture (Debug-never-gated assertion), the inferable-empty-input fixture (Start with a
blank Host/Port/seed), and the raw-error-surface fixture (a failed status fetch) — all executable.

**Stepper** (`RuntimeTab.tsx:425-445`) — Create or restore session → Play → Inspect round → Continue session →
Debug. Play/Continue session `disabled={!sessionReachable}` (431, 441); Inspect round
`disabled={!inspectReachable}` (435); Create/restore and **Debug** carry no `disabled` prop at all —
confirmed executable in this baseline (`Debug ... not.toBeDisabled()`), matching the audit table's own "Debug
is deliberately always reachable regardless of session state" note. Debug's own *content* (retry/debug
buttons) is separately gated — see Disabled actions below.

**Path/text fields:** none are filesystem paths; no `PathInput` usage anywhere in this file (grep-confirmed).
Plain fields: Host (`placeholder="127.0.0.1"`, optional), Port (no placeholder, optional), Default seed (no
placeholder, optional), per-session Seed/Session id/Request id override/Expected session version override (no
placeholders).

**Disabled actions:** Start `disabled={running}`; Stop `disabled={!running}`; "Retry last request (same
request id)" and "Debug this round in Replay & Debug" both
`disabled={!sessionReachable || lastSpin.requestId === undefined}` (641, 646) — this is the
requestId-idempotency-key gating surfaced in the UI. Load Session has **no** `disabled` guard for a blank id;
see below.

**Inferable empty inputs (executable — see `Advanced tab inferable-empty-input baseline`):** blank
Host/Port/Default seed on Start are omitted from the request body entirely (`readOptions()`,
`RuntimeTab.tsx:34-38`), not sent as empty strings and not rejected — pinned by asserting the captured
`fetch` body equals `{debug: false, repositoryMode: "memory"}` with no `host`/`port`/`seed` keys at all.
**Evidence only:** Load Session's id field is not disabled-gated at all — a blank/whitespace id just makes the
click handler no-op (`restoreSessionId.trim() && handleLoadSession(...)`, 494) with zero feedback, rather than
disabling the button or showing a validation message. This is a **fail-open UX gap** worth flagging for
redesign: the user gets no signal that clicking did nothing.

**Misleading placeholders:** Host's `"127.0.0.1"` placeholder (348) is flagged as a soft risk — it could read
as a pre-filled default on an otherwise-empty, "(optional)"-labeled field. Not demonstrated as a fixture
(cosmetic finding, no functional consequence — the field really is optional and really is empty).

**Raw-error surfaces:** the status-fetch failure is demonstrated as an executable fixture here. **Evidence
only** for the rest (already covered in depth by `runtimeWorkflow.test.tsx`'s own "network down" assertions,
per that file's line 753/787-789): round-outcome `session.message` (RuntimeTab.tsx:163-165, contrast with the
friendlier `RecoveryNotice` treatment just above/below it for "blocked"/"conflict" states — RuntimeTab is the
**one exception** among all 7 Advanced tabs that sometimes wraps an error in friendlier copy, not just raw
passthrough); recent-spins fetch error (508, 611).

---

## Certification (`project/CertificationTab.tsx`)

**Route/tab evidence:** `/project/certification`, `section: "Advanced"` (`ProjectDashboardPage.tsx:81`).
Covered by the Stepper-inventory, path-field/disabled-action, and raw-error-surface fixtures (all executable).

**Stepper** (`CertificationTab.tsx:284-309`) — Select/configure → Validate → Build bundle → Inspect → Export.
`validateReachable = bundleDir.trim().length > 0` (194); `buildReachable` requires a non-`"invalid"` Validate
outcome (196); `inspectReachable = buildResult !== undefined` (204); Export reuses `inspectReachable` (307) —
it has no independently-gated condition of its own. No backward lock on any step once reached, matching the
audit table's "Partially linear" classification.

**Path/text fields (executable):** "Source outcome-library bundle directory"
(`placeholder="./outcomes/bundle"`); per-mode "Mode name" (`placeholder="base"`) and "Seed"
(`placeholder="cert-2026-07-20-base"`); "Output directory" (Build step only, **no placeholder**, defaults to
the non-blank value `"certification"` rather than empty). One empty mode row exists by default
(`EMPTY_MODE`, `modes: [EMPTY_MODE]`, line 97).

**Disabled actions (executable):** "Continue to Validate" `disabled={!validateReachable}` (367); "Build
certification bundle" `disabled={toModeInputs(modes).length === 0 || hasIncompleteModeRow}` (252).

**Inferable empty inputs (evidence only):** an untouched ("empty") mode row is silently filtered out of the
submitted payload (`toModeInputs`, 67-69) with no warning — only a *touched-but-invalid* ("incomplete") row
blocks Build; Sample count's `onChange` coerces any non-numeric/cleared value to `0`
(`Number(value) || 0`, 351) rather than rejecting the keystroke.

**Misleading placeholders (executable, re-audited in `[P2-POLISH-04]`'s v5 update, confirmed unchanged):** the
Seed placeholder `"cert-2026-07-20-base"` embeds a real-looking date+mode-name pattern rather than an
obviously-fake token — pinned by the path-field fixture with an inline comment. The Source outcome-library
bundle directory placeholder is likewise unaltered: it's a *source* location with no code-backed default
anywhere in the CLI (see the v5 update above), so it correctly stays a placeholder rather than a fabricated
value.

**Raw-error surfaces (executable for Validate; evidence only for Build):** Validate's `network-error`/
`load-error` states (`ErrorState message={...}` / `.error`, 221-222) are demonstrated end to end by the
"Scoped path-action error remediation baseline" fixture (type a bundle dir → Continue → Validate → assert the
bundle-directory-specific status + remediation copy renders and the raw server text does not) -- since
`[P2-POLISH-04]`'s v3 update, both run through `describePathActionError("The certification bundle
directory", ...)`. Build's identical pattern (256-257) is evidence-only — same component, same fix, not
separately re-demonstrated.

**Contract cross-reference:** `StudioRequestContractBaseline.test.ts`'s new "Contract baseline: Certification"
block pins that `validateCertificationBuildRequest`'s mode-shape check is **type-only** — it accepts a
negative or non-integer `sampleCount` that the UI's own `isModeValid` (`sampleCount > 0 && Number.isInteger`)
would never let through as "valid." The gap is closed later by `CertificationEvidenceBundleBuilder`'s
domain-level pass, not at this request-validation layer — a **fail-open contract layer, fail-closed domain
layer** combination, deliberately unchanged here.

---

## Provably Fair (`project/ProvablyFairTab.tsx`)

**Route/tab evidence:** `/project/provablyFair`, `section: "Advanced"` (`ProjectDashboardPage.tsx:82`).
Covered by the Stepper-inventory and path-field/disabled-action fixtures (executable).

**Stepper** (`ProvablyFairTab.tsx:237-252`) — Configure → Generate/inspect proof → Verify → Review
diagnostics. `generateReachable = configureView.status === "ok"` (219) gates step 1 only; `Verify` (245) has
**no** `disabled` prop at all — confirmed executable (`steps[2] not.toBeDisabled()`), matching the audit
table's "Verify is always reachable regardless of prior state" note; `diagnosticsReachable = verifyResult !==
undefined` (227) gates step 3.

**Path/text fields (executable):** "Source outcome-library bundle directory"
(`placeholder="./outcomes/bundle"`, Configure step); a second, separate "Source outcome-library bundle
directory" field on the Verify step carries **no placeholder** and is auto-populated from the Configure
field's value only after a successful Configure (134) — not re-demonstrated as a fixture (evidence only, see
`ProvablyFairTab.tsx:428-436`); "Server seed" (`placeholder="operator-server-seed"`); "Client seed"
(`placeholder="player-client-seed"`); "Mode name" (`placeholder="base"`).

**Disabled actions (executable):** "Compute commitments" `disabled={!isConfigureValid(fields)}` (292) — all
four of bundleDir/modeName/serverSeed/clientSeed must be non-blank; nonce is never required, pinned by the
fixture leaving it at its default. **Evidence only, flagged as a gap:** the "Verify" button's own `disabled`
condition (438) does not include the Verify-step bundle-dir's own blank check that `runVerify` itself enforces
(197-199) — the button can be enabled while that field is blank, and clicking it then silently no-ops with
zero feedback, the same fail-open pattern as Runtime's Load Session.

**Inferable empty inputs (evidence only):** Nonce's `onChange` coerces any falsy/NaN input to `0`
(`Number(value) || 0`, 288); the Verify-step bundle-dir auto-fill from Configure noted above is a silent
(non-empty-triggered) auto-fill, not a rejection.

**Misleading placeholders (executable, re-audited in `[P2-POLISH-04]`'s v5 update, confirmed unchanged):**
Server/Client seed placeholders read like real seed labels rather than obviously-fake tokens; Mode name's
`"base"` placeholder is a real, valid mode name, indistinguishable from an actual selected value. Pinned by the
path-field fixture. The Configure-step bundle directory placeholder is likewise unaltered -- same "source
location, no code-backed default" reasoning as Certification's own bundle directory (see the v5 update above).

**Raw-error surfaces (executable for Configure; evidence only for Generate/Verify):** Configure's
`error`/`load-error` (296-297, both stemming from resolving `bundleDir`) are demonstrated by the "Scoped
path-action error remediation baseline" fixture -- since `[P2-POLISH-04]`'s v3 update, run through
`describePathActionError("The Provably Fair bundle directory", ...)` rather than shown verbatim. Configure's
own `invalid` state (298) is deliberately unchanged -- it's already a specific, actionable domain-validation
message (e.g. "nonce must be a non-negative safe integer"), not a raw fs/schema error. Generate's `error`/
`load-error` (350) get the identical bundle-directory fix, evidence-only here; Generate's `build-error`
(351, concatenating `code:` onto `FairnessRoundProofBuildError`'s own message) is also deliberately
unchanged -- that message is already specific and actionable, not a raw fs error, so classifying it would
only lose detail. Verify's `error`/`load-error` (443-444, same `bundleDir`-resolution failure) get the same
fix, evidence-only.

**Contract cross-reference:** `StudioRequestContractBaseline.test.ts`'s new "Contract baseline: Provably Fair"
block pins that `validateFairnessVerifyRequest` never checks `commitment` at all — not its shape, not even
its presence — while the UI's own `resolveVerifyInputs` requires both a proof *and* a commitment before
enabling "Verify." A request built outside this UI (or a future, more permissive UI) can ask the server to
verify a proof with no commitment; `FairnessRoundProofVerifier`'s own structural checks are the only thing
that actually catches that, not this request-validation layer.

---

## Deployment (`project/DeploymentTab.tsx`)

**Route/tab evidence:** `/project/deployment`, `section: "Advanced"` (`ProjectDashboardPage.tsx:78`). Covered
by the Stepper-inventory, path-field, and raw-error-surface fixtures (all executable).

**Stepper** (`DeploymentTab.tsx:283-304`) — Select target → Configure → Check compatibility → Preview
artifacts → Deploy → Review result. Unlike every other Advanced tab, **Configure itself is gated**
(`disabled={selectedTarget === undefined}`, 288) — confirmed executable (all 5 non-"Select target" steps
`toBeDisabled()` before a target is picked). `compatibilityChecked`/`previewReachable`/`canContinueToDeploy`/
`reviewReachable` (269-272) gate the remaining four. A `pendingAdvanceStepRef` stale-result guard
(213-221) only auto-advances on a genuinely new, non-stale `runResult`; losing `runResult` snaps `activeStep`
back to 1, and losing `selectedTarget` snaps it back to 0 (227-243) — backward-*correcting* guards, not
backward-*blocking* ones, matching the audit table.

**Target registry / preflight (evidence only):** the target list (`TargetsList`, 37-86) renders each target's
id/version/requirements/capabilities from `GET /api/project/deployment/targets`; "Check & Preview" runs
without writing (`publish: false`), "Deploy" additionally publishes (`publish: true`) —
distinguished purely by `runResult.publish`, never a separate client-side flag (276-281).

**Path/text fields (executable — the one tab where the finding *is* the absence):** "Mode name" and
"Outcome library path" (335-344) are plain `TextInput`s with **no placeholder at all** — confirmed by the
path-field fixture (`not.toHaveAttribute("placeholder")`), unlike every other tab's equivalent path fields.

**Disabled actions:** only the five gated Stepper steps carry a `disabled` prop; no plain `<Button>` in this
file does — "Check compatibility & preview" and "Deploy" stay clickable while a run is in flight (`loading`
only), with double-submission instead absorbed upstream by `DeploymentRunTracker` (already covered by
`deploymentRunTracker.test.ts`, not re-tested here).

**Inferable empty inputs:** none found — `handleDeploy` returns early on an undefined `selectedTarget` rather
than defaulting it; mode fields have no fallback/trim/default applied in this file.

**Misleading placeholders:** none — no `placeholder` prop exists anywhere in this file (the absence-of-
placeholder finding above is the relevant one for this tab).

**Raw-error surfaces (executable for the targets-fetch case and for `runError`; both now diverge):**
`targetsError` (314) is demonstrated end to end by the "Advanced tab raw-error surface baseline" fixture
(mount-time targets fetch failure → exact server text, no remediation) -- **deliberately left unchanged**:
fetching the targets registry takes no user-typed path, so it's outside `[P2-POLISH-04]`'s scoped-path-action
fix. `runError` under Configure (361) and under Deploy (456) share one state and both stem from resolving a
mode's outcome library path (`loadWeightedOutcomeLibraryFromProjectFile`) -- since the v3 update, both run
through `describePathActionError("The deployment's outcome library file", ...)` instead of showing the raw
`Could not read "..."` text verbatim, demonstrated end to end by the "Scoped path-action error remediation
baseline" fixture; `deploymentWorkflow.test.tsx`'s own error-path assertions (stage-level `runResult` issues,
a different surface entirely) are unaffected.

**Contract cross-reference:** the pre-existing "missing package-to-library" finding in
`StudioRequestContractBaseline.test.ts` (added before this baseline) already covers Deployment's own
`modeName`-never-checked-against-the-package gap in depth; not repeated here.

---

## Outcome Libraries (`project/OutcomeLibrariesTab.tsx`)

**Route/tab evidence:** `/project/outcomeLibraries`, `section: "Advanced"` (`ProjectDashboardPage.tsx:79`).
Covered by the Stepper-inventory and path-field/disabled-action fixtures (executable).

**Stepper** (`OutcomeLibrariesTab.tsx:345-365`) — Select/import → Validate & analyze → Inspect → Compare or
use. Step 1 `disabled={!analyzeReachable}` (350), where `analyzeReachable` is any *terminal* select status
(ok/invalid/error/load-error, 266) — not specifically success; steps 2/3 both
`disabled={!inspectReachable}` (356, 362), where `inspectReachable = selectResult !== undefined`, i.e.
`selectView.status === "ok"` only (267). `onStepClick={setActiveStep}` (345) has no backward-lock logic —
once a step is enabled it stays clickable both directions.

**Selector kinds (evidence only, structurally exercised by the path-field fixture's default-kind
assertion):** a `SegmentedControl` (json/bundle/stakeengine) drives which field group renders — json → one
"Library JSON path" field; bundle → "Bundle directory" + "Mode name"; stakeengine → "Stake Engine export
directory" + "Mode name". `buildSelector()` (40-52) requires the relevant field(s) non-blank per kind before
"Load library" enables.

**Path/text fields (executable for the default json kind):** "Library JSON path"
(`placeholder="./outcomes/base.json"`); evidence-only for the other two kinds: "Bundle directory"
(`placeholder="./outcomes/bundle"`), "Stake Engine export directory" (`placeholder="./stake-export"`), "Mode
name" (`placeholder="base"`, shared by both kinds).

**Disabled actions (executable for the json-kind case):** "Load library"
`disabled={buildSelector(fields) === undefined}` (371). Evidence-only: "Compare"
`disabled={buildSelector(rightFields) === undefined}` (496); "Run deep validation" is not `disabled`-gated in
JSX at all, only rendered when `fields.kind === "bundle"` and no-ops internally if busy (212, 300); "Use in
runtime" similarly no-ops internally (599-602) rather than being `disabled`.

**Inferable empty inputs:** none found — every selector field is trimmed, and if empty, `buildSelector`
returns `undefined`, which disables the relevant action rather than substituting a default.

**Misleading placeholders (executable for the json kind; evidence-only for bundle/stakeengine; re-audited in
`[P2-POLISH-04]`'s v5 update, confirmed unchanged):** all four selector-field placeholders read as plausible
real paths/mode names rather than obviously-illustrative text — mitigated in practice by "Load library" staying
disabled until real text replaces the placeholder, but the strings themselves are the same pattern flagged
elsewhere in this document. None of the three path fields (Library JSON path, Bundle directory, Stake Engine
export directory) has a code-backed default anywhere in the CLI either (same audit as Certification/Provably
Fair's own source fields, see the v5 update above) — genuinely un-inferable, correctly still placeholders.

**Raw-error surfaces (executable for `selectView`, via "Scoped path-action error remediation baseline";
evidence only for the rest):** `selectView` error/load-error (375-376) run through
`describePathActionError("The outcome library", ...)` since `[P2-POLISH-04]`'s v3 update. Evidence-only, same
fix: `deepValidateView` error/load-error (311-312) → `describePathActionError("The outcome library
bundle", ...)`; `compareView`'s own request-level `error` (501) → `describePathActionError("The comparison
request", ...)`; `compareResult.left`/`.right` load-error (513, 519) → `describePathActionError("The left
library"/"The right library", ...)`. Seven distinct call sites total, all previously the same `ErrorState`
passthrough, all now the same classify-and-remediate treatment — `outcomeLibrariesWorkflow.test.tsx`'s own
success/invalid/compare/stale/late-response cases don't assert on this text and are unaffected.

---

## Stake Engine Export (`project/StakeEngineExportTab.tsx`)

**Route/tab evidence:** `/project/stakeEngineExport`, `section: "Advanced"` (`ProjectDashboardPage.tsx:83`).
Covered by the Stepper-inventory and path-field/disabled-action fixtures (executable).

**Stepper** (`StakeEngineExportTab.tsx:343-365`) — Configure → Preview → Validate diagnostics → Export →
Review result. `configureValid` (202, ≥1 valid mode, no incomplete row, non-blank `outDir`) gates
Preview/Validate (203-204); `exportReachable` (206) additionally requires a non-`"invalid"` Validate outcome;
`reviewReachable` (213) requires an export result. **Not strictly forward-monotonic in practice:** because
these booleans are recomputed every render rather than cached once reached, editing a mode field after
reaching a later step can retroactively re-lock Preview/Validate/Export — a nuance the audit table's "no
backward lock" phrasing doesn't fully capture; flagged here for a future redesign to consider explicitly.

**Path/text fields (executable):** "Output directory" defaults to the non-blank `"stakeengine"` — a real
initial *value*, not a placeholder (see the v5 update above: its former `placeholder="./stakeengine"`, dead/
structurally unreachable since the field was never actually blank, was removed rather than left as misleading
markup); per-mode "Mode name" (`placeholder="base"`) and "Outcome library path"
(`placeholder="./outcomes/base.json"`). One empty mode row exists by default (`EMPTY_MODE`, line 97). No
overwrite checkbox exists as a form field — overwrite is a post-conflict `RecoveryNotice` action instead
(305-313), not a field.

**Disabled actions (executable):** "Continue to Preview" `disabled={!previewReachable}` (424); "Export to
Stake Engine" `disabled={toModeInputs(modes).length === 0 || hasIncompleteModeRow}` (298, evidence only).
"Run diagnostics" is never `disabled`-gated in JSX; it silently no-ops if there are no modes or the guard is
busy (146-148) — the same fail-open button-stays-clickable-but-inert pattern as Outcome Libraries' "Run deep
validation."

**Inferable empty inputs:** Cost's `onChange` coerces any unparsable/NaN input to `0`
(`Number(value) || 0`, 412) — same pattern as Certification's Sample count and Provably Fair's Nonce, a
cross-cutting `NumberInput` convention across all three tabs, not tab-specific.

**Misleading placeholders (executable; re-audited in `[P2-POLISH-04]`'s v5 update):** "Output directory" is no
longer in this list -- its inferable real value is now correctly presented as a value, not a placeholder (see
above). "Mode name"/"Outcome library path" remain unchanged: no code-backed default exists for either anywhere
in the CLI (`loadWeightedOutcomeLibraryFromProjectFile` always requires an explicit caller-supplied path; see
the v5 update above), so they correctly stay placeholders, same pattern as Certification/Outcome Libraries.

**Raw-error surfaces (executable via "Scoped path-action error remediation baseline" for Validate; evidence
only for Export):** `validateView` network-error/load-error (232-233) run through `describePathActionError(
"The Stake Engine export's outcome library", ...)` since `[P2-POLISH-04]`'s v3 update. `exportView`'s
identical network-error/load-error (303-304) get the same fix, evidence-only. `exportView`'s
non-overwritable-conflict (315) is **deliberately unchanged** — it's already a hand-built, specific message
(`"<outDir>" already exists and is not empty; refusing to overwrite it without confirmation.`), not a raw fs
error. The overwritable-conflict case (307-313) remains the **one partial exception** among all raw-error
surfaces in this document — it pairs that same hand-built message (used as a `RecoveryNotice` title) with an
actionable "Overwrite" button, unlike every purely-informational `ErrorState` elsewhere.

---

## Cross-cutting findings

**Raw-error passthrough was systemic, not per-tab — `[P2-POLISH-04]`'s v3 update fixed it for every *scoped
path action* specifically, not every `ErrorState` use.** `common/ErrorState.tsx` still renders `{message}`
verbatim inside an `Alert` with zero added text -- that component itself didn't change. What changed is what
gets passed as `message` at each scoped-path-action call site: `domain/pathActionError.ts`'s
`describePathActionError(subject, message)` now classifies the raw fs/schema string first and passes
subject-specific status + remediation copy instead (see each workflow section's own "Raw-error surfaces"
above for the call-site-by-call-site breakdown, and the v3 update note near the top of this document for the
full inclusion/exclusion list). **Left as raw passthrough, deliberately:** any surface with no user-typed
path at all (Runtime's status fetch, Replay's Recent Replays fetch, Deployment's `targetsError`,
`RecentProjectsPanel`'s list/per-row-open errors); Advanced Tools' three plain forms (Create/Init/
Build-from-blueprint), which this step's instruction didn't name; and every already-hand-built,
already-specific message (Save's/the two exports' conflict messages, Provably Fair's `invalid`/`build-error`
states). `RuntimeTab.tsx`'s own "blocked"/"conflict" `RecoveryNotice` wrapping and `StakeEngineExportTab.tsx`'s
overwritable-conflict case remain the two pre-existing exceptions to plain `ErrorState` passthrough, unrelated
to this fix. **A third exception, closed in `[P2-POLISH-26]`:** the guided/Raw Editor's `BlueprintValidationPanel`
used to render its "error" status as a plain `<Text>`, not through `ErrorState`/`role="alert"` at all — this
accessibility gap was unrelated to raw-text content and wasn't in scope for `[P2-POLISH-04]`'s own fix, but is
now fixed on its own terms; see the `[P2-POLISH-26]` update in Design & Build's own section above.

**Building on top of an un-validated Save is possible.** Save's own request-validation layer (and the
service that writes it) never checks the blueprint's shape, only that one was sent at all — see Design &
Build/Raw Editor's Contract cross-reference above. This is the Home-surface counterpart to Certification's
"fail-open contract layer, fail-closed domain layer" finding and Provably Fair's "unchecked commitment"
finding below — a third instance of the same general shape (a request-validation layer looser than either
the UI's own gating or another, stricter code path that touches the same data).

**"Build Package" is the only `disabled`-gated action anywhere in Design & Build, the Raw Editor, Advanced
Tools, or Open Project.** Every other action across all four sections (New/Load/Save/Validate/Build
Preview, Create/Initialize/Preview/Build-from-blueprint, Refresh/Open) relies on either no client-side
gating at all or on native HTML `required`-attribute constraint validation instead of a `disabled` prop —
see the next finding.

**The `Number(value) || 0` `NumberInput` coercion convention** appears identically in Certification's Sample
count, Provably Fair's Nonce, and Stake Engine Export's Cost — an unparsable/cleared numeric field silently
becomes `0` rather than rejecting the keystroke or leaving the field visibly invalid. Documented as evidence
in each tab's section above rather than triplicated as near-identical fixtures.

**Two fail-open "silent no-op" buttons** were found that are *not* `disabled`-gated for their actual
precondition, unlike the disabled-action convention used everywhere else in these tabs: Runtime's Load
Session (blank id → silent no-op) and Provably Fair's Verify button (blank Verify-step bundle dir → silent
no-op despite the button itself being enabled). Both are evidence-only findings, flagged here as UX gaps
worth an explicit decision in the Phase 2 redesign (either disable the action or surface the same validation
message `runVerify`/`handleLoadSession` already compute internally).

**Every required field on the Home surface is gated by native HTML `required` constraint validation, not an
app-level `disabled` button or message.** Project path (Open Project), Destination directory/Package name
(Create Project), Existing project directory (Init Project), and Blueprint JSON path (Build-from-blueprint)
are all `required` `TextInput`/`PathInput`s inside a plain `<form>` with no Mantine `validate` config — a
blank submission is silently blocked by the browser's own constraint-validation UI (a tooltip, invisible to
`@testing-library`'s DOM assertions) before the click handler ever runs, making **zero** API calls and
showing **zero** in-app feedback. Pinned executably once, for Open Project's "Open" button, by the
"Open Project: required-field baseline" fixture; the other three fields share the identical mechanism
(evidence-only, flagged in each section above). This is a different flavor of "fail-open, no feedback" than
Runtime's/Provably Fair's own silent no-ops just above — those are enabled buttons whose *handler* silently
does nothing; these are native-validation-blocked buttons whose handler never even runs, with no Studio-
authored message either way.

**Deployment's Configure step is the only Advanced-tab first content step gated behind a *previous* step's
selection** (`selectedTarget === undefined`) rather than being immediately reachable — every other tab's
first step (Select/configure, Configure, Select/import) is always enabled. Evidence, not a defect: Deployment
inherently has nothing to configure before a target is chosen.

## Contract findings summary

`tests/cli/studio/StudioRequestContractBaseline.test.ts` now covers, as executable request/response-contract
fixtures: New Blueprint (Create/Open/Apply), **Design & Build / Raw Editor / Advanced Tools** (Load/Save
shape, the new "unvalidated save" finding — Save's blueprint is never checked at this layer or by the
service that writes it, unlike Build's own always-validate-first path — the shared Build-from-blueprint-
file/Blueprint-Editor-Build-panel request shape, and Init Project's narrower shape vs. Create Project's),
Runtime retry/debug (requestId/expectedSessionVersion, debug/repositoryMode defaults), Deployment vs. Stake
Engine Export (targetId+publish vs. outDir+overwrite+cost, and the pre-existing "missing package-to-library"
finding — neither Deployment's nor Stake Engine Export's `modeName` is cross-checked against the project's
actual bet modes at the request layer), Outcome Libraries selector kinds, **Certification** (validate-source
vs. build shape, and the new "shape-only mode check" finding — `sampleCount` is only type-checked, not
range-checked, at this layer), and **Provably Fair** (configure/generate/verify shape, and the new
"unchecked commitment" finding — Verify never validates `commitment` at all, narrower than the UI's own
pre-Verify gating).

## Assumptions

- Every fixture in this baseline assumes the same fake-fetch seam (`createRoutedFakeFetch`) and routed-app
  harness (`renderRoutedApp`) already used by the rest of `tests/cli/studio-client/`; no new test
  infrastructure was introduced.
- Route response bodies used for new fixtures (e.g. the Deployment target shape
  `{id, version, requirements, capabilities}`) were taken from the exact shape already used by
  `ProjectDashboardPage.deploymentWorkflow.test.tsx`'s own `TARGET` fixture, not invented independently.
- "Executable fixture" in this document always means a test that renders through the real routed app (not a
  shallow/unit render) and asserts on real DOM roles/text/attributes, matching this repo's existing
  convention for these baseline files.

## Deferred unknowns / unresolved findings

These are **not** backed by an executable fixture in this baseline and are called out explicitly rather than
silently assumed covered:

1. Outcome Libraries' seven `describePathActionError`-routed call sites (select/deep-validate/compare, ×2 for
   load-error variants) — `select` is executable (the "Scoped path-action error remediation baseline"
   fixture), the remaining six are evidence-only for the fix itself, the largest single evidence-only surface
   in this document.
2. Provably Fair's Verify-step "blank bundle dir → silent no-op despite an enabled button" gap, and Runtime's
   analogous Load-Session gap — flagged as fail-open UX, not exercised by a fixture proving the no-op (only
   documented from source).
3. Stake Engine Export's non-monotonic Stepper gating (re-locking a later step by editing an earlier one after
   the fact) — documented from source reasoning about the recomputed-every-render booleans, not exercised by
   a fixture that actually reaches a later step, edits Configure, and asserts the re-lock.
4. Outcome Libraries' bundle/stakeengine selector kinds' path fields/placeholders — documented from source,
   only the default json kind is exercised end to end by a fixture.
5. Advanced Tools' own required-field-blocked-submission gap for Create Project/Init Project/Build-from-
   blueprint (Destination directory, Existing project directory, Blueprint JSON path) — the identical
   mechanism *is* exercised end to end once, for Open Project's "Project path" field, but not repeated for
   these three; evidence-only, same underlying native-`required` behavior.
6. ~~`BlueprintValidationPanel`'s own "error" status rendering as a plain `<Text>` instead of `ErrorState`~~ —
   **fixed in `[P2-POLISH-26]`**, now exercised end to end by `BlueprintEditorPage.validation.test.tsx`'s own
   validate-request-network-failure fixture (asserting both the translated text and a real `role="alert"`
   element); see the update in Design & Build's own section above.

A future extension of this baseline should prioritize (1) and (3) first, since they're the two remaining
findings this document states from source reading alone without any executable proof.

## Fail-closed expectations

Where "fail closed" means: an error, a missing precondition, or an ambiguous state should visibly block the
risky action rather than silently proceeding or silently doing nothing.

- **Correctly fail-closed:** every Stepper gating boolean documented above blocks forward navigation via a
  real `disabled` attribute (confirmed executable for every tab in this baseline) rather than a purely visual
  cue; Certification/Stake Engine Export's "incomplete" (touched-but-invalid) mode rows block Build/Export via
  `hasIncompleteModeRow` rather than being silently dropped like "empty" (never-touched) rows are.
- **Not fail-closed (fail-open, evidence-only, flagged for redesign):** Runtime's Load Session and Provably
  Fair's Verify silent no-ops (§ Cross-cutting findings); Certification's request-contract-layer `sampleCount`
  accepting non-positive/non-integer values (only caught later, at the domain layer, not rejected at the
  request boundary); Provably Fair's request-contract-layer `commitment` being entirely unchecked at Verify;
  Save's request-contract-layer (and service-layer) blueprint shape being entirely unchecked, unlike Build's
  always-validate-first path (§ Design & Build / Raw Editor); the Raw Editor's own "Build Package" being
  reachable before any validation has ever been attempted, unlike Design & Build's guided instance of the
  identical button (§ Raw Editor, executable).
- **Blocked, but not via `disabled` and with no in-app feedback either:** every required field on the Home
  surface (Open Project's Project path, Create/Init/Build-from-blueprint's own required path fields) relies
  on native HTML constraint validation alone — a real block, but an invisible one from Studio's own UI's
  perspective (§ Cross-cutting findings, executable for Open Project). Distinct from the fail-open bullet
  above: nothing proceeds, but nothing is communicated either.
  None of these are changed by this baseline — they are documented so a redesign step must make an explicit,
  reviewable choice about each rather than inheriting them by accident.
