# POKIE Studio Phase 2 cross-cutting workflow audit matrix (v1)

**Status:** committed as of `[P2-POLISH-25]` (correction round, 2026-08-01), audited against the
implementation as it stood at commit `f5c10bc` ("surface stale Validate/Select results as Outdated across
Certification, Outcome Libraries and Stake Engine Export tabs") plus the further corrections this document's
own commit adds on top.

**Why this document exists, and how it relates to `docs/studio-phase2-inventory.md`:** that document is an
explicitly **frozen baseline**, pinned to commit `30b1dd4` plus the `[P2-POLISH-01]`/`[P2-POLISH-04]`
fixtures, and says so in its own header -- it predates ten-plus later redesign/feature steps
(`P2-POLISH-06` through `P2-POLISH-24`) that materially changed Replay, Runtime, Outcome Libraries, Stake
Engine Export, and added Export & Deploy/Mechanics Editor/Simulation & Reports entirely. Its Design & Build,
Raw Editor, Advanced Tools, and Open Project sections are still accurate (those surfaces haven't changed
since) and are **not** repeated here -- see that document directly for them. Every other workflow below is
audited fresh, against the *current* source, not that frozen snapshot.

**Scope:** every workflow reachable from the Studio nav -- Design & Build, Raw Editor, Advanced Tools, Open
Project (all four: see `studio-phase2-inventory.md`, unchanged), Replay, Runtime, Deployment, Export &
Deploy, Outcome Libraries, Stake Engine Export, Mechanics Editor, Certification, Provably Fair, Simulation &
Reports, Overview, and Validation. For each: its workflow **classification** (linear / partially linear /
cyclic / nonlinear) and whether a Mantine `Stepper` is retained; **disabled-action reasons**; **state
freshness** (does an upstream edit leave a now-stale result displayed with no indicator, or is it guarded);
**keyboard / `aria-current`** behavior; **persistence** across tab/project switch; **inferable/empty-input**
handling; and **raw-error surfaces** (a caught exception's message shown with no added remediation).

## Classification matrix

| Workflow | Classification | Stepper retained | Outdated-result indicator | `describePathActionError` used |
|---|---|---|---|---|
| Design & Build (guided) | linear (read-only `StepProgressList`, no `onStepClick`) | No (see below) | N/A (idle-on-edit, no stale flash) | Load/Save/Build (v3 update) |
| Raw Editor | nonlinear (no progress UI at all) | No | N/A | Load/Save (v3 update) |
| Advanced Tools (3 forms) | nonlinear (independent forms) | No | N/A | Yes (v4 update) |
| Open Project | nonlinear (2 independent paths) | No | N/A | Yes (v3 update, `OpenProjectForm`) |
| Replay | nonlinear (source-choice picker, not a wizard) | **No** -- replaced by a `SegmentedControl` source picker (`P2-POLISH-12`) | N/A -- staleness prevented structurally (state reset on source switch), not flagged after the fact | **No** (raw passthrough throughout) |
| Runtime | cyclic (persistent session workspace) | **No** -- replaced by an always-visible multi-section workspace (`P2-POLISH-16`) | N/A -- staleness prevented structurally (selection cleared on every invalidating action) | **Yes this step** -- own `describeRuntimeActionError` helper, not `describePathActionError` (Runtime failures are server/network, not a user-typed path); covers server start/restart/refresh, session create/load, and spin/retry -- "blocked"/"conflict" keep their existing hand-built `RecoveryNotice` copy |
| Deployment | partially linear | **Yes**, 6 steps, `onStepClick`, `aria-current` | **Yes** -- `preflightOutdated` `Alert` | **Yes** |
| Export & Deploy | nonlinear (stateless picker shell) | Never had one (`P2-POLISH-20`) | N/A -- no mutable result state | No (`targetsError` raw) |
| Outcome Libraries | partially linear | Yes, 5 steps | **Partial** -- Select (`selectOutdated`, since `f5c10bc`) **and now Compare** (`compareOutdated`, this step) covered; deep-validate has no separate flag but is fully covered by cascade from `selectOutdated` | Yes, 7 of 9 error call sites (2 `unsupported`/`generation-error` Generate states stay raw -- see below) |
| Stake Engine Export | partially linear | Yes, 5 steps | **Partial->complete this step** -- Validate (`validateOutdated`, since `f5c10bc`) **and now Export** (`exportOutdated`, this step) covered | Yes, except the hand-built conflict message (deliberate) |
| Mechanics Editor | nonlinear (no `disabled` on any Stepper step) | Yes, but purely a progress label -- every step always clickable | Validate: correctly self-invalidating. **Apply: now covered** (`applyOutdated`, this step) | **No** (raw passthrough) |
| Certification | partially linear | Yes, 5 steps | **Complete this step** -- Validate (`validateOutdated`, since `f5c10bc`) **and now Build** (`buildOutdated`, this step) covered | Yes (Validate/Build) |
| Provably Fair | partially linear (Verify deliberately always reachable) | Yes, 4 steps | **New this step** -- Configure (`configureOutdated`) | Yes (Configure/Generate/Verify, except the already-specific `invalid`/`build-error` domain messages) |
| Simulation & Reports | linear (4-step Stepper, forward-gated by data) | Yes | N/A -- `startRun` clears stale results outright rather than merely flagging them | No (raw, except the hand-authored `runAgainNotice`) |
| Overview | single-panel (no Stepper) | No | Correct -- `inspection` is explicitly refetched on project switch | Partial (provenance error is a curated server field, inspection error is raw) |
| Validation | single-panel (no Stepper) | No | See Deferred findings -- a structural gap exists but isn't reachable via any current in-app navigation | No (raw) |

## Certification and Provably Fair: direct vs. external verification (explicit audit)

Both of these workflows exist specifically to let *someone other than the person who built the game* confirm
its outputs are what pokie says they are -- the reviewer instruction called these out by name, so they get
dedicated treatment here rather than folding into the table above.

### Provably Fair -- both paths live in-app, in the same Verify step

`ProvablyFairTab.tsx`'s Verify step (`activeStep === 2`) has a `SegmentedControl` (`verifySource`,
`"generated" | "paste"`) that is the direct/external distinction made explicit in the UI itself:

- **Direct** ("Generated in this session"): the proof/commitment this same tab's own Configure/Generate
  steps just produced. `generateReachable`/`diagnosticsReachable` gate the *rest* of the guided flow, but
  Verify itself is never gated behind them (`Stepper.Step label="Verify"` carries no `disabled` prop at
  all) -- confirmed by the existing `steps[2] not.toBeDisabled()` fixture and the file's own doc comment:
  "Verify is deliberately reachable regardless of Configure/Generate."
- **External** ("Paste external proof/commitment"): a `Textarea` pair for a proof/commitment pasted from
  *outside this session* -- someone else's published round, the actual real-world Provably Fair use case per
  the file's own top-of-file doc comment. Reaching Verify this way makes zero Configure/Generate network
  calls, pinned end to end by `ProjectDashboardPage.provablyFairWorkflow.test.tsx`'s "verifies a pasted
  external proof/commitment directly, with no Configure/Generate for an unrelated round in this session".

**Finding (fixed this step):** both paths share one `verifyBundleDir` field and one "Verify" button, but the
button's `disabled` condition (`resolveVerifyInputs() === undefined`) never included the same blank-bundle-dir
check `runVerify()` itself enforces (`verifyBundleDir.trim().length === 0`) -- so with a valid proof/commitment
present (generated *or* pasted) but a blank bundle directory, the button looked clickable but silently no-op'd
on click, with zero feedback. This was already flagged, evidence-only, in `studio-phase2-inventory.md`'s own
"Deferred unknowns" list (#2) before this step. **Fixed:** `disabled={resolveVerifyInputs() === undefined ||
verifyBundleDir.trim().length === 0}` (`ProvablyFairTab.tsx`). Regression coverage: "disables Verify when the
Verify-step bundle directory is blank, for both a generated and a pasted external proof/commitment" and
"disables Verify for a pasted external proof/commitment when the bundle directory is blank, rather than
silently no-opping" in `ProjectDashboardPage.provablyFairWorkflow.test.tsx`.

**Finding (fixed this step, state freshness):** editing a Configure field (seed/mode) after a completed
Configure run silently invalidated Configure/Generate/Verify with no explanation on the Configure step
itself -- the same "silently reset, no indicator" gap `[P2-POLISH-25]` fixed for Certification's Validate and
Outcome Libraries' Select, just never extended to Provably Fair. **Fixed:** a `configureOutdated` flag,
identical lifecycle to `validateOutdated`/`selectOutdated` (set in `invalidateConfigure()`, cleared at the
start of `runConfigure()`), rendered as the same yellow `Alert` on the Configure step. Regression coverage:
"marks a completed Configure as Outdated once a seed/mode field changes, and clears it on a fresh Compute
commitments run".

### Certification -- direct verification only exists via the CLI, not in Studio; documented, not changed

Certification's Studio workflow is Select/configure -> Validate -> Build bundle -> Inspect -> Export. Unlike
Provably Fair, there is **no Verify step anywhere in `CertificationTab.tsx`** -- Validate runs
`CertificationEvidenceBundleValidator` against the *source* bundle before a build, and Build produces the
evidence bundle, but nothing in Studio ever runs `CertificationEvidenceBundleVerifier` (the class that
re-checks an *already-built* evidence bundle's manifest/samples against a live source bundle for drift --
`docs/certification-evidence-bundle.md`'s own "Verification" section, `verify(certDir, options)`). That
re-verification exists only as `pokie certification verify <certDir> --source <bundleDir>` on the CLI,
entirely external to Studio -- a certifier (or the game's own team, post-build) re-checking the exported
bundle has to leave the browser to do it.

This is a genuine asymmetry with Provably Fair (which offers both direct and external verification from the
same in-app step) worth naming explicitly, but it is **not** treated as a bug to silently fix here: adding a
full Verify step (a new server endpoint wired to `CertificationEvidenceBundleVerifier`, a new Stepper step, a
new set of diagnostics) is a feature addition, not a "verified in-scope correction" of the kind this
correction round is scoped to -- it would also duplicate exactly the kind of unreviewed, undecided change
`studio-phase2-inventory.md`'s own "Not in scope" clause disclaims. Documented here, left for an explicit
future redesign decision, same convention `studio-phase2-inventory.md` already uses for its own deferred
findings.

**State freshness, closed this step:** the one Certification gap that *is* a narrow, mechanical extension of
an already-decided pattern (not a new feature) was fixed: editing a mode row or the output directory after a
completed Build silently invalidated it with no explanation, since `validateOutdated` (added in `f5c10bc`)
only covers bundle-directory edits -- which cascade into Build too, but a modes/outDir-only edit never touches
Validate at all, so it never set `validateOutdated`. **Fixed:** a parallel `buildOutdated` flag (same
`invalidateBuild()`/`runBuild()` lifecycle), rendered on Select/configure right below the existing
`validateOutdated` `Alert`, mutually exclusive with it (`!validateOutdated && buildOutdated`) so a
bundle-directory edit -- which already invalidates both -- shows only the broader Validate-specific message,
not a duplicate. Regression coverage: "marks a completed Build (not Validate) as Outdated when only
modes/output directory change, and marks Validate Outdated instead when the bundle directory changes" in
`ProjectDashboardPage.certificationWorkflow.test.tsx`.

## Outcome Libraries and Stake Engine Export: closing the rest of `[P2-POLISH-25]`'s own gap

`f5c10bc` added an Outdated indicator for exactly one result per tab (Select for Outcome Libraries, Validate
for Stake Engine Export) but left a second, symmetric result in each tab uncovered:

- **Outcome Libraries' Compare result** (`compareView`): editing the right-side (comparison) selector after
  a completed Compare silently reset it with zero explanation -- `selectOutdated` only covers the *left*
  library changing (via `invalidateSelect()` cascading into `invalidateCompare()`), never a right-side-only
  edit. **Fixed:** `compareOutdated`, same lifecycle, rendered inside the "Compare with another library"
  section. Regression coverage: "marks a completed Compare as Outdated once the comparison selector changes,
  and clears it on a fresh Compare run".
- **Stake Engine Export's Export result** (`exportView`): editing the output directory (which lives on the
  Configure step, not the Export step itself) after a completed Export silently reset it -- `validateOutdated`
  only covers a *modes* edit (which also invalidates Export via cascade), never an outDir-only edit, since
  `handleOutDirChange` calls `invalidateExport()` directly, bypassing `invalidateValidate()` entirely.
  **Fixed:** `exportOutdated`, same lifecycle, rendered on Configure, mutually exclusive with
  `validateOutdated` the same way Certification's two flags are. Regression coverage: "marks a completed
  Export (not Validate) as Outdated when only the output directory changes, and marks Validate Outdated
  instead when a mode changes".

**Left deliberately unfixed, evidence-only (same reasoning as `studio-phase2-inventory.md`'s own deferred
list):** Outcome Libraries' Generate step has two raw (`unsupported`/`generation-error`) status branches that
bypass `describePathActionError` -- these are server-classified domain messages, not raw exceptions, so lower
severity than a true raw-exception leak; narrow enough (2 of 9 call sites in one tab) that fixing them wasn't
part of what this audit's own named-workflow scope (Certification/Provably Fair) required, and bundling an
unrelated tab's cosmetic error-copy change into this correction round risks exactly the kind of scope drift
the previous review flagged. Stake Engine Export's `conflict` status is likewise left raw -- it's already a
hand-crafted, specific message (`StakeEngineExportRequestView`'s own `conflict` variant), the same class of
"already actionable, don't reclassify" exception `studio-phase2-inventory.md` documents for every other tab's
conflict messages.

## Replay, Runtime, Export & Deploy (post-redesign, not in the frozen baseline)

**Replay** (`P2-POLISH-12` through `P2-POLISH-15`): the Stepper described in `studio-phase2-inventory.md` no
longer exists. `ReplayTab.tsx` is a `SegmentedControl` source-choice picker (Seed & Round / Replay Artifact /
Spin / Simulation), each with its own independent load control; nothing is gated behind a click, matching the
file's own doc comment disclaiming the old Stepper entirely. Staleness is prevented structurally --
`switchSource()` resets every per-source selection, and out-of-order responses are discarded via a
`loadedForMethod`/monotonic-id pattern -- rather than flagged after the fact. Disabled actions:
"Validate & load" (blank paste box), "Reproduce" (`describeReplayReproducibility` judged unreproducible for
the Replay Artifact source only), "Download JSON" fallback. Every error surface in this file is raw
(`ErrorState message={...}` with no `describePathActionError` translation) -- `listError`,
`expected.message`, `progress.error`, `recentSpinsError`, `recentRunsError`. One evidence-only gap worth a
closer look in a future step: `ReplayTab` is the one sibling of Runtime/Deployment/Outcome Libraries that is
**not** given `key={projectKey}` in `ProjectDashboardPage.tsx`, despite those three siblings' own explicit
doc comments naming that pattern as necessary for their own local state to survive a project switch
correctly; only the page-owned `expected` state (not Replay's own local `findMethod`/`selectedSpin`/etc.) has
direct project-switch fixture coverage (`replayWorkflow.test.tsx`'s "clears the 'expected artifact' state
when the project changes mid-load"). Not fixed here -- outside the audit's Certification/Provably Fair scope
and would need its own dedicated fixture to verify first.

**Runtime** (`P2-POLISH-16`, Load Session's blank-id guard added `[P2-POLISH-25]`): also no longer a
Stepper -- an always-visible, persistent multi-section workspace (Server / Current session / Inspect round /
Round history / Retry & Debug), explicitly documented in-source as cyclic ("every panel below is reachable at
any time... the same session can cycle through Play/Inspect/Debug indefinitely"). Three hard `disabled` props
exist in the whole file (Start/Stop, plus Load Session below); everything else is freshness-gated by clearing
`selectedRound` on every invalidating action (session change, Stop, Restart, Refresh, Create/Load session,
Spin, Retry) rather than a visual "Outdated" badge -- the same structural-reset philosophy Replay uses.
`aria-current` is used manually on the round-history list (not via a Stepper, since none exists). No
stale-*Stepper*-result finding applies (there's no Stepper), and the existing structural-reset pattern already
satisfies the same freshness goal the Outdated banners serve elsewhere. `[P2-POLISH-25]` closed the one
inferable/empty-input gap this tab had: "Restore existing"'s "Session id" `TextInput` now carries a `disabled`
Load Session button and a "Required to load an existing session" description whenever the field is blank or
whitespace-only, matching Provably Fair's Verify fix in the same step -- previously the button looked
clickable and silently no-op'd on a blank id.

**Raw-error passthrough, fixed this step (`P2-POLISH-25` correction):** every non-domain failure in this file
(`state.status === "error"`/`"failed"` for Start/Restart/Refresh, `session.status === "error"` for
Create/Load/Spin/Retry, and `recentSpinsError` for both the "Round history" panel and the "Restore existing"
recent-sessions picker) used to render the raw fetch exception or server `body.error` text directly via
`ErrorState message={...}`, with no added remediation -- exactly the finding this document's own audit
methodology exists to catch (the "blocked"/"conflict" `RuntimeSpinResultView` states were already hand-authored
`RecoveryNotice` copy, never raw, and are unchanged). Fixed with a new `domain/runtimeActionError.ts`,
`describeRuntimeActionError(subject, message)` -- same "classify a raw message into a stable reason, then
subject-specific status + remediation copy, never echo the raw text back" shape `describePathActionError`
already establishes, but classifying *network/server* failures (`Failed to fetch`/`ECONNREFUSED` ->
"couldn't reach the Studio server"; `EADDRINUSE` -> "the configured host/port is already in use"; a
schema/required-field rejection -> "was rejected as invalid"; anything else -> a generic "couldn't be
completed, check the Studio server logs" fallback) rather than `describePathActionError`'s own
absent/permission/wrong-type path reasons, since none of Runtime's failures come from a user-typed path. Every
call site above now routes through it with its own subject ("The runtime server", "This request", "The round
history", "The recent sessions list"). This also surfaced and closed a second, related gap: a failed Create
Session/Load Session whose server response is itself a *domain* error (not a thrown exception) resets
`sessionId` to `undefined` (see `useRuntimeManager`'s own `createSession()`/`loadSession()`), which made
`sessionReachable` false and left the session-workspace panel that renders `session.status === "error"`
unmounted -- so that failure was previously never shown at all, not merely shown raw. The "Restore
existing"/"New session" switcher panel now renders it directly. See
`ProjectDashboardPage.runtimeWorkflow.test.tsx`'s "shows a subject-specific recovery message, never the raw
backend text or a silent no-op, when Load Session fails outright" and "...instead of raw backend text when the
runtime server itself fails to start" regressions, plus `runtimeActionError.test.ts` for the classifier itself.

**Deployment**: unchanged since the frozen baseline in every respect that matters here -- still the one tab
across the whole app that both retains a classic Stepper *and* already has an explicit "Outdated" `Alert`
(`preflightOutdated`) *and* already routes every user-typed-path error through `describePathActionError`. No
findings, no changes.

**Export & Deploy** (`P2-POLISH-20`/`21`): a genuinely stateless picker shell in front of Deployment/Stake
Engine Export -- no `useState`/`useEffect` at all, confirmed via grep. `targetsError` is raw, but this is a
mount-time list fetch with no user-typed path, the same "outside scope" exception every other mount-time
list fetch in this document gets (Deployment's own `targetsError`, `RecentProjectsPanel`'s list error).

## Mechanics Editor (not in the frozen baseline)

Nonlinear -- the Stepper here carries no `disabled` prop on any step at all; every step (including Apply) is
always directly clickable regardless of workflow state, the loosest gating of any Stepper-bearing tab in
Studio. Validate correctly self-invalidates on every blueprint edit (a dedicated effect resets it to idle on
`editor.state.revision` change) -- no stale-result gap there.

**Finding, fixed this step (`P2-POLISH-25` correction):** a completed Apply's own success message ("Applied
-- the project's blueprint and generated game module are up to date.") used to be **never reset by a
subsequent edit** -- `applyView` was only ever set from `runApply()`/`handleDiscard()`, not from the same
revision-tracking effect that resets Validate. So: Apply succeeds -> user edits a field again (Validate
correctly resets, Apply's own button correctly re-disables) -> the old green "up to date" text stayed shown,
now factually stale, with no "Outdated" indicator at the Apply step itself.

Fixed with the same `xxxOutdated` convention CertificationTab's `validateOutdated`/`buildOutdated` and
ProvablyFairTab's `configureOutdated` already use: a dedicated `applyOutdated` flag, set whenever the
revision-tracking effect finds a non-idle `applyView` at the moment an edit bumps `editor.state.revision`
(resetting `applyView` to idle in the same pass), and cleared the instant a fresh Apply attempt starts or
Discard reverts to the last-applied blueprint. The Apply step now renders an explicit "Outdated -- this
project has been edited since the last Apply attempt" alert instead of leaving the stale success message (or
any other stale Apply result) on screen. See
`ProjectDashboardPage.mechanicsEditorWorkflow.test.tsx`'s "marks a completed Apply result Outdated once a
further edit is made, instead of continuing to claim the project is up to date" regression.

## Simulation & Reports, Overview (not in the frozen baseline)

**Simulation** is a linear, forward-gated 4-step Stepper (Configure -> Run -> Review -> Export) with full
`aria-current` and keyboard-navigation coverage (`simulationWorkflow.test.tsx`'s own "supports keyboard-only
navigation through the Stepper, skipping disabled steps" fixture). No Outdated-indicator gap exists here to
fix: `startRun` (shared by Configure-submit/Retry/"Run again") clears `reportDetail`/`compareDetail`/
`selectedReportId` outright the instant any new run starts, rather than leaving a stale Review panel up with
a badge -- a stronger guarantee than a visual indicator would provide, so no change is warranted.

**Overview** is a flat single-panel view with no Stepper/gating of any kind. Its one piece of stateful
freshness (`inspection`) is already correctly refetched on project switch by the shared `projectKey` effect
in `ProjectDashboardPage.tsx`. No findings requiring correction.

## Validation (not in the frozen baseline) -- a structural gap, documented but not fixed

`ProjectDashboardPage.tsx`'s own project-switch reset effect (keyed on `projectKey`) explicitly clears every
other piece of project-scoped view state it owns (`reportDetail`, `compareDetail`, `reportsView`,
`expectedReplay`, `recentSpinsView`, `replayListView`, plus `simulation`/`replay`/`runtime`/`deployment`'s own
`resetForProjectSwitch()`) and re-fetches `inspection` -- but never touches `validation`. Read in isolation,
this looks like exactly the class of bug this document exists to catch: a previous project's Validate
success/error could, in principle, keep rendering under a new project's Validate tab.

**Investigated in depth, left unfixed:** `RuntimeTab`/`DeploymentTab`/`OutcomeLibrariesTab`/etc.'s own
`key={projectKey ?? "no-project"}` doc comments (`ProjectDashboardPage.tsx`, e.g. immediately above
`<RuntimeTab .../>`) describe forcing "a full remount on a genuine project switch" specifically *because*
"the page is deliberately designed not to remount itself" -- i.e. those comments assert, unhedged, that
`ProjectDashboardPage` can stay mounted across a real project-to-project change. Tracing the actual trigger
for that, though: `useProjectContext()` (`hooks/useProjectContext.ts`) fetches `/api/project/context` exactly
once per mount (its poll loop only continues while the server reports `"loading"`, and permanently stops once
it resolves to `"loaded"`/`"error"`), nothing else in the codebase calls `getProjectContext` again after that
(confirmed via a full-codebase search), and "Close project" (the only in-app path that ends a project
session) always calls `navigate("/home/design")` -- a `/project/:tab` -> `/home/:tab` route-pattern change
that `routes.tsx`'s own comment confirms is a full top-level element swap (`ProjectDashboardPage` unmounts,
`HomePage` mounts), not the same-pattern `:tab`-only reuse that keeps a page mounted across in-app tab
switches. Combined, these two facts mean `projectKey` can only ever transition from `undefined` to one real
value within a single `ProjectDashboardPage` mount (the initial context-loading poll settling once) --
never from one real, already-loaded project to a *different* one -- so the specific scenario those sibling
comments describe could not be reproduced from the current source. A fix mirroring the sibling `key`
components' own treatment (resetting `validation` to idle inside the same `[projectKey]`-keyed effect) was
drafted and then reverted, for two reasons: it could not be confirmed as reachable despite the above trace,
and -- independent of reachability -- it could not be backed by an *honest* regression test, since the
"clears X when the project switches" convention used throughout every other workflow test file in this
codebase (`certificationWorkflow.test.tsx`, `outcomeLibrariesWorkflow.test.tsx`, etc.) unmounts the page and
renders a *fresh* one for "project B", which starts with `validation` already `{status: "idle"}` by
construction regardless of whether the fix exists -- so a test written that way would pass identically either
way and prove nothing. (This is a broader, pre-existing property of *every* "project switch" test in this
codebase, not specific to this fix -- worth a maintainer's attention separately, out of scope here.) Recorded
as a structural asymmetry -- `validation` is the one piece of state the reset effect omits that every sibling
gets -- worth closing for consistency with the pattern the rest of that effect already establishes, but not
shipped without either a confirmed live trigger or an honest way to prove it, per this correction round's own
"implement only verified in-scope corrections" instruction.

## Verified corrections implemented this step

| Tab | Fix | Regression test |
|---|---|---|
| `ProvablyFairTab.tsx` | Verify button's `disabled` condition now also requires a non-blank Verify-step bundle directory (previously a fail-open silent no-op) | `ProjectDashboardPage.provablyFairWorkflow.test.tsx`: "disables Verify when the Verify-step bundle directory is blank, for both a generated and a pasted external proof/commitment"; "disables Verify for a pasted external proof/commitment when the bundle directory is blank..." |
| `ProvablyFairTab.tsx` | New `configureOutdated` Outdated `Alert` on the Configure step | same file: "marks a completed Configure as Outdated once a seed/mode field changes..." |
| `CertificationTab.tsx` | New `buildOutdated` Outdated `Alert` on Select/configure, mutually exclusive with the existing `validateOutdated` one | `ProjectDashboardPage.certificationWorkflow.test.tsx`: "marks a completed Build (not Validate) as Outdated when only modes/output directory change..." |
| `OutcomeLibrariesTab.tsx` | New `compareOutdated` Outdated `Alert` on the Compare step | `ProjectDashboardPage.outcomeLibrariesWorkflow.test.tsx`: "marks a completed Compare as Outdated once the comparison selector changes..." |
| `StakeEngineExportTab.tsx` | New `exportOutdated` Outdated `Alert` on Configure, mutually exclusive with the existing `validateOutdated` one | `ProjectDashboardPage.stakeEngineExportWorkflow.test.tsx`: "marks a completed Export (not Validate) as Outdated when only the output directory changes..." |
| `RuntimeTab.tsx` | Load Session button's `disabled` condition now requires a non-blank (trimmed) "Session id" field, with a "Required to load an existing session" input description (previously a fail-open silent no-op, same shape as the Provably Fair Verify fix above) | `ProjectDashboardPage.runtimeWorkflow.test.tsx`: "disables Load Session for a blank (or whitespace-only) session id, with inline guidance, and restores normal behavior once a session id is supplied" |
| `RuntimeTab.tsx` | Every raw `ErrorState`/`session.message`/`recentSpinsError` site (Server start/restart/refresh, Create/Load Session, Spin/Retry, "Round history"/"Restore existing" recent-spins fetch) now routed through a new subject-specific `describeRuntimeActionError()` (mirrors `describePathActionError`'s "classify, never echo the raw text" shape, but for network/server failures); a failed Create/Load Session whose response is a domain error is also now actually rendered (it was previously invisible, since `sessionId` resets to `undefined` and unmounts the panel that used to render it) | `ProjectDashboardPage.runtimeWorkflow.test.tsx`: "shows a subject-specific recovery message, never the raw backend text or a silent no-op, when Load Session fails outright"; "...instead of raw backend text when the runtime server itself fails to start"; `runtimeActionError.test.ts` for the classifier |

Every `xxxOutdated` fix above (`configureOutdated`/`buildOutdated`/`compareOutdated`/`exportOutdated`) follows
the exact lifecycle `f5c10bc` already established (`validateOutdated`/`selectOutdated`): a boolean set inside
the existing `invalidate*()` function whenever the view being invalidated was not already idle, cleared at the
start of the corresponding `run*()`, rendered as one `<Alert color="yellow" variant="light"
icon={<IconAlertTriangle .../>}>` at the point where the invalidating field lives -- no new mechanism, each gap
a narrow, mechanical extension of a pattern already reviewed and accepted for its sibling result in the same
tab. The two Runtime fixes above are unrelated in shape (a `disabled`-guard fix and a raw-error-translation
fix, respectively) and are described in full in Runtime's own section above.

## Deferred findings (documented, not corrected this step)

Recorded so a future step doesn't have to rediscover them, same convention
`studio-phase2-inventory.md`'s own "Deferred unknowns" section uses:

1. **Certification has no in-app re-verification of an already-built evidence bundle** -- only
   `pokie certification verify --source` on the CLI. A real asymmetry with Provably Fair; a feature addition,
   not a correction, so left for an explicit future redesign decision.
2. Outcome Libraries' Generate step has two raw (non-`describePathActionError`) status branches
   (`unsupported`/`generation-error`); Stake Engine Export's `conflict` status is raw but already a
   deliberately hand-crafted message, same as every other tab's own conflict messages.
3. Replay is the one sibling of Runtime/Deployment/Outcome Libraries without a `key={projectKey}` remount
   guard; only its page-owned `expected` state has direct project-switch fixture coverage today.
4. Validation's project-switch reset gap exists in the code but is not reachable through any current
   navigation path -- see its own section above for the full investigation.
5. Runtime's Load Session (blank id) and Provably Fair's Verify were both previously-documented fail-open
   silent no-ops (`studio-phase2-inventory.md`'s own Cross-cutting findings) -- both are now fixed as of this
   step (Provably Fair first-pass, Runtime's Load Session in the correction round for `[P2-POLISH-25]`
   itself, once flagged as still in scope).
