# POKIE Studio Phase 2 cross-cutting workflow audit matrix (v1)

**Status:** committed as of `[P2-POLISH-26]` (2026-08-01, commit `6f9e837`), which closes the one raw-error
surface this document's own `[P2-POLISH-25]` sweep did not reach -- `BlueprintValidationPanel`'s "error"
status, shared by Design & Build (`/home/design`) and Raw Editor (`/home/advanced`'s non-guided
`BlueprintEditorPage` instance). See "P2-POLISH-26: closing the `BlueprintValidationPanel` raw-error/
non-alert gap" below for the full route/state/action walkthrough and evidence, and
`docs/studio-phase2-final-verification-report.md` for the final Phase 2 verification report (required
evidence inventory, critical-scenario rechecks, resolved-findings/backlog summary, and repository status).
No raw-error-passthrough finding remains open anywhere in this document's scope as of `[P2-POLISH-26]`.

**Status (history):** committed as of `[P2-POLISH-25]` (second correction round, 2026-08-01), audited against the
implementation as it stood at commit `f5c10bc` ("surface stale Validate/Select results as Outdated across
Certification, Outcome Libraries and Stake Engine Export tabs") plus the further corrections this document's
own commit adds on top. The first correction round closed the two raw-error-passthrough findings the original
step left explicitly, deliberately open (Outcome Libraries' Generate/Estimate `unsupported`/`generation-error`
states, Mechanics Editor's Load/Validate/Apply raw exception text) -- see their own sections below, and the
classification matrix's `describePathActionError` column, for what changed. This second round closes every
remaining raw-error-passthrough finding the first round left open: Simulation & Reports' own `error`/
`reviewedDetail.message`/`compareDetail.message`/`recentRunsError`, Overview's `inspection.message`,
Validation's `view.message`, and Export & Deploy/Deployment's shared `targetsError` -- all previously deferred
on the reasoning that they're owned by `ProjectDashboardPage.tsx`/`useDeploymentManager.ts` rather than a
single self-contained tab component, a shared-state blast-radius argument review correctly rejected as not a
valid reason to leave a cross-cutting audit's own findings open. See their own sections below (Simulation &
Reports, Overview, Validation, and "Export & Deploy, Deployment: closing the targets-list raw-error
passthrough") for what changed. No raw-error-passthrough finding remains open anywhere in this document's
scope.

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

## Evidence conventions

Every finding and fix in this document (this section and every one before it) is backed by a **route/state/
action walkthrough**, cited the same way throughout: the React Router path the workflow lives on (`/home/:tab`
or `/project/:tab`, per `routes.tsx`), the workflow's state immediately before the action (idle / loading /
a specific result status such as `ok`/`error`/`blocked`/`conflict`), the user action taken (a button click, a
field edit, a paste), and the resulting DOM state -- which role/text/attribute appears, and which raw text
does not. That walkthrough is executed for real, not merely described: every citation of the shape "see
`Foo.test.tsx`'s '...' fixture" is a React Testing Library test that mounts the actual routed app
(`renderRoutedApp`, a real `MemoryRouter` at the cited path) over a mocked `fetch` seam and asserts on the
real rendered DOM (`getByRole`, `toHaveTextContent`, `queryByText(...).not.toBeInTheDocument()`), not a
shallow render or a hand-inspected source excerpt. This is this project's own established convention for
"runtime evidence" -- `docs/studio-phase2-inventory.md`'s own "Assumptions" section states it explicitly
("'Executable fixture' in this document always means a test that renders through the real routed app ..., not
a shallow/unit render") -- and this document has followed the same rule from its own first version.

**On screenshots specifically:** P2-26 now adds a real local-browser capture pass in
[`phase2-browser-evidence/`](phase2-browser-evidence/README.md). The images are Chrome captures of the built
Studio task clone serving a deterministic generated game; they cover Home and every Project Dashboard route at a
settled initial state. The manifest identifies each route, visible state, and SHA-256 checksum. They complement,
rather than replace, the executable RTL route/state/action fixtures above: a screenshot proves the rendered
browser surface, while the fixture is the repeatable proof of clicks, accessibility roles, stale state and error
remediation.

**On roles:** Studio (`cli/studio-client`) is a single-operator local tool -- there is no authentication,
session, or permission/role system anywhere in `cli/studio-client/src` (confirmed by grepping for
`userRole`/`permission`/`isAdmin`-shaped code; none exists). Every workflow below is reachable by the one
implicit "Studio operator" role; "required roles" for this document's audit purposes means "every route and
control reachable in the app," which the Scope paragraph above already enumerates in full, not a matrix of
distinct user roles that don't exist in this codebase.

## Classification matrix

| Workflow | Classification | Stepper retained | Outdated-result indicator | `describePathActionError` used |
|---|---|---|---|---|
| Design & Build (guided) | linear (read-only `StepProgressList`, no `onStepClick`) | No (see below) | N/A (idle-on-edit, no stale flash) | Load/Save/Build/**Validate** (`[P2-POLISH-26]` update) |
| Raw Editor | nonlinear (no progress UI at all) | No | N/A | Load/Save/**Validate** (`[P2-POLISH-26]` update) |
| Advanced Tools (3 forms) | nonlinear (independent forms) | No | N/A | Yes (v4 update) |
| Open Project | nonlinear (2 independent paths) | No | N/A | Yes (v3 update, `OpenProjectForm`) |
| Replay | nonlinear (source-choice picker, not a wizard) | **No** -- replaced by a `SegmentedControl` source picker (`P2-POLISH-12`) | N/A -- staleness prevented structurally (state reset on source switch), not flagged after the fact | **Yes this step** -- own `describeReplayActionError` helper (list/spin-list/simulation-list fetches and a failed run/cancel request); a replay job that fails mid-run keeps its hand-authored explanation primary with the raw server message behind `AdvancedDisclosure`, same convention as Runtime's `[P2-POLISH-25]` correction; the two already-specific client-authored `expected` messages ("That's not valid JSON.", "That replay has no stored result to compare against.") are left as-is, matching the "don't reclassify an already-specific domain message" exception this document applies elsewhere |
| Runtime | cyclic (persistent session workspace) | **No** -- replaced by an always-visible multi-section workspace (`P2-POLISH-16`) | N/A -- staleness prevented structurally (selection cleared on every invalidating action) | **Yes this step** -- own `describeRuntimeActionError` helper, not `describePathActionError` (Runtime failures are server/network, not a user-typed path); covers server start/restart/refresh, session create/load, and spin/retry; "blocked"/"conflict" get their own hand-authored `RecoveryNotice` copy, with the raw server message moved behind `AdvancedDisclosure` (`[P2-POLISH-25]` correction round, see below) |
| Deployment | partially linear | **Yes**, 6 steps, `onStepClick`, `aria-current` | **Yes** -- `preflightOutdated` `Alert` | **Yes** |
| Export & Deploy | nonlinear (stateless picker shell) | Never had one (`P2-POLISH-20`) | N/A -- no mutable result state | **Yes this correction round** -- `targetsError` (shared with Deployment's own identical state, see `useDeploymentManager.ts`) now routes through a new `domain/projectActionError.ts`'s `describeProjectActionError` |
| Outcome Libraries | partially linear | Yes, 5 steps | **Partial** -- Select (`selectOutdated`, since `f5c10bc`) **and now Compare** (`compareOutdated`, this step) covered; deep-validate has no separate flag but is fully covered by cascade from `selectOutdated` | **Yes, every error call site** -- the Generate/Estimate steps' own `unsupported`/`generation-error` statuses, previously raw, are now a hand-authored explanation (a new `domain/outcomeLibraryGenerateError.ts`) with the server's own message kept behind `AdvancedDisclosure`, fixed this correction round (see below) |
| Stake Engine Export | partially linear | Yes, 5 steps | **Partial->complete this step** -- Validate (`validateOutdated`, since `f5c10bc`) **and now Export** (`exportOutdated`, this step) covered | Yes, except the hand-built conflict message (deliberate) |
| Mechanics Editor | nonlinear (no `disabled` on any Stepper step) | Yes, but purely a progress label -- every step always clickable | Validate: correctly self-invalidating. **Apply: now covered** (`applyOutdated`, this step) | **Yes this correction round** -- Load/Validate/Apply's own raw `ErrorState` sites now route through `describePathActionError` (see below); previously raw fs/JSON exception text (`loadBlueprint`'s `load-error`, a network-exception catch around `validateBlueprint`, `applyProjectBlueprint`'s own fs/commit failures) |
| Certification | partially linear | Yes, 5 steps | **Complete this step** -- Validate (`validateOutdated`, since `f5c10bc`) **and now Build** (`buildOutdated`, this step) covered | Yes (Validate/Build) |
| Provably Fair | partially linear (Verify deliberately always reachable) | Yes, 4 steps | **New this step** -- Configure (`configureOutdated`) | Yes (Configure/Generate/Verify, except the already-specific `invalid`/`build-error` domain messages) |
| Simulation & Reports | linear (4-step Stepper, forward-gated by data) | Yes | N/A -- `startRun` clears stale results outright rather than merely flagging them | **Yes this correction round** -- `error`/`reviewedDetail.message`/`compareDetail.message`/`recentRunsError` now route through `describeProjectActionError` (`runAgainNotice` was already hand-authored, untouched) |
| Overview | single-panel (no Stepper) | No | Correct -- `inspection` is explicitly refetched on project switch | **Yes this correction round** -- `inspection.message` now routes through `describeProjectActionError`; the sibling `provenance` error stays as-is (a curated server field, not a raw exception) |
| Validation | single-panel (no Stepper) | No | See Deferred findings -- a structural gap exists but isn't reachable via any current in-app navigation | **Yes this correction round** -- `view.message` now routes through `describeProjectActionError` |

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

**Outcome Libraries' Generate/Estimate raw-error passthrough, fixed this correction round:** the previous
round left the Generate step's `unsupported`/`generation-error` statuses (and the identical `unsupported`
status on the Estimate panel just above it) rendering the server's raw `WeightedOutcomeLibraryGenerationError`
text directly via `ErrorState message={...}`, on the reasoning that these are server-classified domain
messages rather than a raw exception, so lower severity than a true raw-exception leak -- approving the step
without closing that gap was flagged on review as still a "raw backend text with no added remediation"
surface regardless of severity, the same bar this document's own methodology applies to every other tab.
Fixed via a new `domain/outcomeLibraryGenerateError.ts`: `"unsupported"` (the loaded game doesn't implement
`createExactEnumerationSession()` at all -- see `WeightedOutcomeLibraryGenerationError`'s own doc comment --
so there is no bounded/sampled fallback to offer) gets one fixed, hand-authored explanation pointing at
Simulation & Reports as the alternative; `"generation-error"` is keyed on its own `code` (space-exceeded ->
raise the max/enable bounded coverage; weight-not-representable/session-not-playable -> a mechanic/config
issue in the game itself, not something retrying fixes) with a generic fallback for any other code. Both keep
the server's own message available via `AdvancedDisclosure` rather than dropping it outright -- same
"hand-authored primary explanation, raw detail behind disclosure" convention Runtime's blocked/conflict and
Replay's mid-run job failure already established -- since the exact thrown message (e.g. the actual
outcome-space/max numbers) is genuinely useful to someone chasing why a specific game hit this. See
`ProjectDashboardPage.outcomeLibrariesWorkflow.test.tsx`'s "shows a subject-specific explanation, never the
raw server text, when this game's mechanic can't be exactly generated" and "...when generation fails with a
space-exceeded error" regressions. Stake Engine Export's `conflict` status is still left raw -- it's already a
hand-crafted, specific message (`StakeEngineExportRequestView`'s own `conflict` variant), the same class of
"already actionable, don't reclassify" exception `studio-phase2-inventory.md` documents for every other tab's
conflict messages, not the same finding as Generate's `unsupported`/`generation-error` above.

## Replay, Runtime, Export & Deploy (post-redesign, not in the frozen baseline)

**Replay** (`P2-POLISH-12` through `P2-POLISH-15`, raw-error passthrough fixed `[P2-POLISH-25]` correction
round): the Stepper described in `studio-phase2-inventory.md` no longer exists. `ReplayTab.tsx` is a
`SegmentedControl` source-choice picker (Seed & Round / Replay Artifact / Spin / Simulation), each with its
own independent load control; nothing is gated behind a click, matching the file's own doc comment disclaiming
the old Stepper entirely. Staleness is prevented structurally -- `switchSource()` resets every per-source
selection, and out-of-order responses are discarded via a `loadedForMethod`/monotonic-id pattern -- rather
than flagged after the fact. Disabled actions: "Validate & load" (blank paste box), "Reproduce"
(`describeReplayReproducibility` judged unreproducible for the Replay Artifact source only), "Download JSON"
fallback. One evidence-only gap worth a closer look in a future step: `ReplayTab` is the one sibling of
Runtime/Deployment/Outcome Libraries that is **not** given `key={projectKey}` in `ProjectDashboardPage.tsx`,
despite those three siblings' own explicit doc comments naming that pattern as necessary for their own local
state to survive a project switch correctly; only the page-owned `expected` state (not Replay's own local
`findMethod`/`selectedSpin`/etc.) has direct project-switch fixture coverage (`replayWorkflow.test.tsx`'s
"clears the 'expected artifact' state when the project changes mid-load"). Not fixed here -- outside the
audit's Certification/Provably Fair scope and would need its own dedicated fixture to verify first.

**Replay raw-error passthrough, fixed this step (`P2-POLISH-25` correction):** this document previously
recorded every error surface in `ReplayTab.tsx` as raw (`ErrorState message={...}` with no translation) --
`listError`, `expected.message`, `progress.error`, `recentSpinsError`, `recentRunsError` -- and approving the
step without closing that gap was flagged on review as premature (the "subject-specific explanation/
remediation for every error" requirement covers every Studio surface touched by this document's own audit
methodology, not only Runtime). Fixed via a new `domain/replayActionError.ts`,
`describeReplayActionError(subject, message)` -- same "classify a raw message into a stable reason
(network/schema/not-found/other), then subject-specific status + remediation copy, never echo the raw text
back" shape `describePathActionError`/`describeRuntimeActionError` already establish. `listError` (both its
"Or pick from recent replays" and bottom "Recent replays" renderings), `recentSpinsError`, `recentRunsError`,
and the top-level run/cancel `error` are now routed through it at render time in `ReplayTab.tsx`, each with
its own subject ("The replay list", "The spin list", "The simulation list", "This replay request") -- the same
per-tab-render-time wrapping convention `RuntimeTab.tsx` already uses for its own copy of `recentSpinsError`,
so the two tabs' independent subject-specific wrappings of the *same* underlying state never conflict.
`progress.error` (a replay job's own execution failure, e.g. a bug in the game's logic hit mid-replay -- see
`StudioReplayExecutionService.fail()`) gets the same treatment Runtime's blocked/conflict fix uses: a
hand-authored primary explanation, with the raw server message moved behind the same `AdvancedDisclosure`
convention rather than dropped, since a developer chasing the exact thrown error still needs it.
`expected.message` (the Replay Artifact source's Validate & load / Reproduce-and-compare failures) is
deliberately **not** wrapped in `ReplayTab.tsx` itself -- two of its three possible values
("That's not valid JSON.", "That replay has no stored result to compare against.") are already
hand-authored, client-specific copy set directly by `ProjectDashboardPage.tsx` (never a raw exception), the
same "already-specific domain message, don't reclassify" exception this document applies to Provably Fair's
`invalid`/`build-error` states and Stake Engine Export's hand-built conflict message. Only the third,
genuinely-raw case -- an `errorMessage(error)` catch around `getReplay`/`inspectReplayArtifact` -- is
translated, and it's translated at its source in `ProjectDashboardPage.tsx`'s `onCompareStored`/
`onLoadExpectedFromPaste` catch blocks (subjects "The stored replay"/"The pasted artifact") rather than at
render time, since `ExpectedReplayState` has no separate status to distinguish it from the two hand-authored
cases the way Provably Fair's `FairnessGenerateRequestView` does. See
`ProjectDashboardPage.replayWorkflow.test.tsx`'s "shows a subject-specific recovery message..." (spin list,
simulation list, run failure) and "shows a hand-authored explanation for a replay job that fails mid-run..."
regressions, plus the updated "blocks reproducing a pasted artifact..." and "stays put and shows an error..."
tests (now asserting the translated text, and that the raw server text is no longer the primary message).

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
methodology exists to catch. The "blocked"/"conflict" `RuntimeSpinResultView` states already had a
hand-authored `RecoveryNotice` *title* ("Can't play this round" / "Session changed elsewhere") and action --
but their `message` body was still the raw `body.error` text passed straight from
`StudioRuntimeManager.translateSpinResult()`, itself the underlying game server's own 400/409 response (e.g.
`Session "sess-1" cannot play the next round (canPlayNextGame() returned false).` or `Session "sess-1" version
mismatch: expected version 1, but the current version is 2.`) -- internal method-name/session-version detail,
not something a player-facing UI should lead with. This was missed on this document's first pass through this
step (it wrongly read the existing title+action as proof the whole notice was already hand-authored) and
caught only on review: fixed in the same correction round by replacing that raw `message` with hand-authored,
subject-specific copy for each of the two states, with the original raw text preserved behind the same
`AdvancedDisclosure` convention `RoundSummary`'s own raw JSON already uses in this file (detail: "server
message") rather than dropped -- so a developer chasing a specific `canPlayNextGame()`/version-mismatch detail
can still get at it, just never as the primary text. See `ProjectDashboardPage.runtimeWorkflow.test.tsx`'s
"shows a clear 'insufficient funds' state..." and "shows a clear 'session changed elsewhere' conflict
state..." (both updated this round to assert the raw text is present-but-`not.toBeVisible()` until the
disclosure is opened, not absent).

Fixed the remaining (non-`blocked`/`conflict`) call sites with a new `domain/runtimeActionError.ts`,
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

**Deployment**: still the one tab across the whole app that both retains a classic Stepper *and* already has
an explicit "Outdated" `Alert` (`preflightOutdated`) *and* already routes every user-typed-path error through
`describePathActionError`. Unchanged since the frozen baseline in every other respect -- except its own
`targetsError`, fixed this correction round together with Export & Deploy's identical state; see the two
tabs' shared section below ("Export & Deploy, Deployment: closing the targets-list raw-error passthrough").

**Export & Deploy** (`P2-POLISH-20`/`21`): a genuinely stateless picker shell in front of Deployment/Stake
Engine Export -- no `useState`/`useEffect` at all, confirmed via grep. `targetsError` was raw, a mount-time
list fetch with no user-typed path -- see the shared section below for why this correction round fixed it
anyway, and why `RecentProjectsPanel`'s own list error (the one other mount-time list fetch of this shape in
the app) is still left alone.

## Export & Deploy, Deployment: closing the targets-list raw-error passthrough

`ExportDeployTab.tsx`'s and `DeploymentTab.tsx`'s own `targetsError` renders are two independent render call
sites over the exact same `useDeploymentManager.ts` state (`refreshTargets()`'s own catch, `setTargetsError`)
-- both were previously raw, on the reasoning that a mount-time list fetch with no user-typed path is an
"outside scope" exception the same way `RecentProjectsPanel`'s own list error is treated. Review correctly
rejected extending that exception here: `RecentProjectsPanel`'s list error sits on the Studio home screen,
outside this document's own "every workflow reachable from the Studio nav" scope entirely, while
`targetsError` sits squarely inside two of the workflows this document *does* audit (Export & Deploy,
Deployment) -- being a list fetch doesn't exempt it from the same "subject-specific explanation for every
error" bar this document already applies to every other in-scope raw-error surface. **Fixed:** a new
`domain/projectActionError.ts` (`describeProjectActionError(subject, message)`, same "classify a raw message
into a stable reason -- network/schema/other -- then subject-specific status + remediation copy, never echo
the raw text back" shape `describePathActionError`/`describeReplayActionError`/`describeRuntimeActionError`
already establish) -- both tabs' own `targetsError` render call sites now route through it with the subject
"The deployment targets list", so a genuine backend/network failure loading the registered targets reads the
same translated way regardless of which of the two tabs it's showing on. See
`ProjectDashboardPage.exportDeploy.test.tsx` and `ProjectDashboardPage.deploymentWorkflow.test.tsx`'s own
"shows a subject-specific recovery message, never the raw backend text, when the deployment targets list
fails to load" regressions, plus `projectActionError.test.ts` for the classifier itself.

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

**Raw-error passthrough, fixed this correction round:** every one of this tab's own `ErrorState` sites
(the initial project-blueprint Load, the Validate step's own request failure, and Apply's `"error"` status)
rendered the raw backend/fs/JSON exception text directly, with no added remediation -- exactly the finding
this document's own audit methodology exists to catch, and the reason this tab's own classification-matrix
column read a bare "No (raw passthrough)" while every sibling Stepper-bearing tab (Certification, Deployment,
Provably Fair) already routed through `describePathActionError`. All three now do too: Load's own
`loadBlueprint()` `"load-error"` (a path that doesn't exist/isn't readable -- see
`StudioBlueprintLoadView`'s own doc comment) and its mount-effect's network-exception catch both go through
`describePathActionError("The project's source blueprint", ...)`; Validate's own catch (there is no
server-side `"error"` status for `/api/home/blueprints/validate` at all -- see `StudioBlueprintValidationView`
-- so this is always a client-side network exception) goes through
`describePathActionError("This validation request", ...)`; Apply's `"error"` status (always one of
`applyGameBlueprintToProject`'s own fs-read/JSON-parse/commit failures, or the same kind of network-exception
catch) goes through `describePathActionError("The project's blueprint file", ...)`. Apply's `"conflict"`
status is left exactly as it already was -- its message is already a hand-authored, specific string set
directly by this tab (`runApply()`'s own conflict branch), not a raw exception, matching the same
"already-specific domain message, don't reclassify" exception this document applies everywhere else. Unlike
Runtime/Replay/Outcome Libraries' own raw-error fixes, none of these three needed an `AdvancedDisclosure` --
`describePathActionError`'s own convention (already used as-is by Certification/Deployment/Provably Fair for
the identical class of fs/network failure) drops the raw text rather than tucking it behind a disclosure, on
the same reasoning those tabs already establish: an absent/permission/wrong-type/schema/other fs or network
failure is an everyday, expected outcome of driving a real filesystem/server, not internal state a developer
needs the exact wording of. See `ProjectDashboardPage.mechanicsEditorWorkflow.test.tsx`'s "shows a
subject-specific recovery message, never the raw backend text, when loading the project's source blueprint
fails", "...when the validation request itself fails (not a domain validation result)", and the renamed
"...on a failed Apply..." regressions (the latter two updated from asserting the raw `"Disk full."` text to
asserting it's gone and the translated copy is what's shown).

## Simulation & Reports, Overview (not in the frozen baseline)

**Simulation** is a linear, forward-gated 4-step Stepper (Configure -> Run -> Review -> Export) with full
`aria-current` and keyboard-navigation coverage (`simulationWorkflow.test.tsx`'s own "supports keyboard-only
navigation through the Stepper, skipping disabled steps" fixture). No Outdated-indicator gap exists here to
fix: `startRun` (shared by Configure-submit/Retry/"Run again") clears `reportDetail`/`compareDetail`/
`selectedReportId` outright the instant any new run starts, rather than leaving a stale Review panel up with
a badge -- a stronger guarantee than a visual indicator would provide, so no change is warranted.
**Raw-error passthrough, fixed this correction round:** `SimulationTab`'s own `error`, `reviewedDetail.message`,
`compareDetail.message`, and `recentRunsError` used to be raw exception text rendered via bare `ErrorState`,
exactly like Mechanics Editor's own finding in the previous round -- but unlike that tab, none of these four
are local state: every one is owned and set by `ProjectDashboardPage.tsx` itself (its own `run()`/`selectReport`/
`onCompare`/`refreshReports` catch blocks, reached via `useSimulationPoll`'s own `error` for the first),
the same shared-state-owner shape Runtime's `useRuntimeManager` has, just without that hook's own translation
layer. The previous round left this open specifically because fixing it touches `ProjectDashboardPage.tsx`
itself rather than a single self-contained tab component -- a materially larger blast radius than Mechanics
Editor/Outcome Libraries' own fixes -- but review correctly rejected that as a reason to leave a finding this
document's own audit already flagged sitting open. **Fixed:** a new `domain/projectActionError.ts`
(`describeProjectActionError(subject, message)`, same "classify a raw message into a stable reason --
network/schema/other -- then subject-specific status + remediation copy, never echo the raw text back" shape
`describePathActionError`/`describeReplayActionError`/`describeRuntimeActionError` already establish, but for
the page-owned failures that don't belong to any one of those three tabs). All four now route through it at
`SimulationTab.tsx`'s own render call sites, each with its own subject ("This simulation request", "This
report", "The comparison report", "The recent runs list") -- the same per-tab-render-time wrapping convention
`RuntimeTab.tsx`/`ReplayTab.tsx` already use. See `ProjectDashboardPage.simulationWorkflow.test.tsx`'s "shows a
subject-specific recovery message, never the raw backend text, when the simulation request itself fails
outright"/"...when opening a historic report fails"/"...when loading a comparison report fails" regressions,
plus the updated "clears a stale Recent Runs error once a refresh succeeds" fixture (now asserting the
translated text, not the raw server message).

**Overview** is a flat single-panel view with no Stepper/gating of any kind. Its one piece of stateful
freshness (`inspection`) is already correctly refetched on project switch by the shared `projectKey` effect
in `ProjectDashboardPage.tsx`. No Outdated/freshness finding here. **Raw-error passthrough, fixed this
correction round:** `inspection.status === "error"` used to render `inspection.message` (a raw
network-exception catch around `inspectProject()`, set by `ProjectDashboardPage.tsx`) via bare `ErrorState`,
unremediated. **Fixed:** the same `describeProjectActionError("The project inspection", ...)` call, wrapped
at `OverviewTab.tsx`'s own render call site. (Its sibling `provenance.status === "error"` panel is
deliberately untouched -- `provenance`'s error is a curated server field describing a specific build-info
problem, not a caught exception, so it's already the kind of "already actionable" domain message this document
leaves alone elsewhere.) See `ProjectDashboardPage.overviewWorkflow.test.tsx`'s "shows a subject-specific
recovery message, never the raw backend text, when the project inspection fails" and "...still shows a curated
provenance error verbatim" regressions.

## Validation (not in the frozen baseline) -- a structural gap, documented but not fixed

`ProjectDashboardPage.tsx`'s own project-switch reset effect (keyed on `projectKey`) explicitly clears every
other piece of project-scoped view state it owns (`reportDetail`, `compareDetail`, `reportsView`,
`expectedReplay`, `recentSpinsView`, `replayListView`, plus `simulation`/`replay`/`runtime`/`deployment`'s own
`resetForProjectSwitch()`) and re-fetches `inspection` -- but never touches `validation`. Read in isolation,
this looks like exactly the class of bug this document exists to catch: a previous project's Validate
success/error could, in principle, keep rendering under a new project's Validate tab.

**Separately, a raw-error passthrough finding, fixed this correction round:** `ValidationTab`'s own
`view.status === "error" && <ErrorState message={view.message} />` used to be the same raw
network-exception-catch shape as Simulation/Overview above (`validation.message` is set by
`ProjectDashboardPage.tsx`'s own catch around `validateProject()`, not a curated domain field) -- a distinct
finding from the project-switch gap investigated below. **Fixed:** the same
`describeProjectActionError("This validation request", ...)` call, wrapped at `ValidationTab.tsx`'s own render
call site. See `ProjectDashboardPage.validationWorkflow.test.tsx`'s "shows a subject-specific recovery message,
never the raw backend text, when the validation request fails" and "...classifies a network failure distinctly
from an unrecognized backend rejection" regressions, plus the updated
`ProjectDashboardPage.test.tsx`'s "a failed re-validation clears the stale successful result..." fixture (now
asserting the translated text, not the raw server message).

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

## P2-POLISH-26: closing the `BlueprintValidationPanel` raw-error/non-alert gap

**Route:** `/home/design` (Design & Build, guided `BlueprintEditorPage` instance) and `/home/advanced` (Raw
Editor, the non-guided `BlueprintEditorPage` instance reached from Advanced Tools -- both share the exact same
`BlueprintValidationPanel` component, mounted at `BlueprintEditorPage.tsx:539`, so the fix and its evidence
apply identically to both routes).

**Prior state, and the finding:** `docs/studio-phase2-inventory.md`'s "Deferred unknowns" #6 documented, from
source alone, that `BlueprintValidationPanel`'s `"error"` status (the `POST /api/home/blueprints/validate`
request itself failing outright -- a network exception, not a domain validation result) rendered as a plain
Mantine `<Text>`, not through `ErrorState`/`role="alert"` at all -- the one raw-error surface in the whole
Studio audit (this document and `studio-phase2-inventory.md` combined) that wasn't even wrapped in an
`Alert`, let alone translated. That gap was carried forward, undecided, through every `[P2-POLISH-25]` round
of this document without being closed, since this document's own `[P2-POLISH-25]` sweep audited every *tab*
component's raw-error surfaces but `BlueprintValidationPanel` sits under Design & Build/Raw Editor, which
(per this document's own header) are out of this document's frozen-baseline scope and were never re-audited
here.

**Action and resulting state (evidence):** clicking "Validate" while the validate request rejects (a network
exception, e.g. `fetch` itself throwing) now renders `<ErrorState message={describePathActionError("This
validation request", view.message)} />` -- the same `describePathActionError` treatment
`MechanicsEditorTab.tsx` already uses for the identical endpoint's identical network-exception catch (see
this document's own Mechanics Editor section above) -- instead of the raw exception text in a plain,
non-alert `<Text>`. Verified end to end by
`tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.validation.test.tsx`'s "shows a
subject-specific recovery message, never the raw backend text, when the validation request itself fails
outright (not a domain validation result)": it renders the real routed app at `/home/design`, rejects the
validate `fetch` call with `new Error("Failed to fetch")`, clicks "Validate", then asserts (a)
`screen.findByRole("alert")` resolves (proving a real `role="alert"` element now exists, closing the
accessibility gap), (b) that alert's text is the translated copy ("This validation request could not be
completed. Try again, and check the Studio server logs if the problem persists."), and (c) the raw
`"Failed to fetch"` text is absent from the document (`queryByText(...).not.toBeInTheDocument()`) -- so the
fix is proven both for what now appears and for what no longer does. The `"invalid"`/`"ok"` statuses (the
plain-`<Text>` summary line for a completed validation result, not the request-failure case) are unchanged --
they were never the accessibility gap, since a domain validation result showing warnings/errors via the
adjacent `IssueList` component was never raw exception text.

**Classification-matrix impact:** Design & Build and Raw Editor's `describePathActionError used` column
(above) now reads "Load/Save/Build/Validate" and "Load/Save/Validate" respectively -- both tabs are fully
routed through the same classifier for every one of their raw-error surfaces, closing the last exception
`docs/studio-phase2-inventory.md` itself called out ("the one raw-error case in this whole document that
isn't even wrapped in an `Alert`"). No other finding was opened or closed in this pass: this correction round
is scoped narrowly to the one verified Phase 2/release-blocking gap named above, per its own "implement only
verified in-scope corrections" instruction -- no unrelated Design & Build/Raw Editor behavior was touched.

## Verified corrections implemented in P2-POLISH-26

| Tab | Fix | Regression test |
|---|---|---|
| `BlueprintValidationPanel.tsx` (shared by Design & Build `/home/design` and Raw Editor `/home/advanced`) | The Validate request's `"error"` status now renders through `ErrorState`/`describePathActionError("This validation request", ...)` instead of a plain, non-`role="alert"` `<Text>` with raw exception text -- closes `docs/studio-phase2-inventory.md`'s "Deferred unknowns" #6 | `tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.validation.test.tsx`: "shows a subject-specific recovery message, never the raw backend text, when the validation request itself fails outright (not a domain validation result)" |

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
| `RuntimeTab.tsx` | `SpinOutcome`'s "blocked"/"conflict" `RecoveryNotice` no longer renders the raw `body.error` text (game-server internals like `canPlayNextGame()`/session version numbers) as its primary message -- replaced with hand-authored, subject-specific copy for each state, with the raw text preserved (not dropped) behind a new per-state `AdvancedDisclosure` (review-round correction: the first pass through this step incorrectly treated the pre-existing title+action as proof the whole notice was already hand-authored, missing that the message body underneath it was still raw passthrough) | `ProjectDashboardPage.runtimeWorkflow.test.tsx`: "shows a clear 'insufficient funds' state with a shortcut to create a new session"; "shows a clear 'session changed elsewhere' conflict state, and Reload session recovers it"; "Retry immediately drops a round selected from history..." (all three updated to assert the raw text is present-but-hidden, not gone) |
| `OutcomeLibrariesTab.tsx` | Generate/Estimate's `unsupported`/`generation-error` statuses no longer render the raw `WeightedOutcomeLibraryGenerationError` message as primary text -- a new `domain/outcomeLibraryGenerateError.ts` gives `unsupported` one fixed explanation and `generation-error` a `code`-keyed one (with a generic fallback), raw server message kept behind a new `AdvancedDisclosure` (this correction round, closing the finding the previous round explicitly left unfixed) | `ProjectDashboardPage.outcomeLibrariesWorkflow.test.tsx`: "shows a subject-specific explanation, never the raw server text, when this game's mechanic can't be exactly generated"; "...when generation fails with a space-exceeded error" |
| `MechanicsEditorTab.tsx` | Load/Validate/Apply's own raw `ErrorState` sites (previously the one Stepper-bearing tab with a bare "No (raw passthrough)" in the classification matrix) now route through `describePathActionError`, same convention Certification/Deployment/Provably Fair already use; Apply's already-hand-authored `"conflict"` message is untouched (this correction round) | `ProjectDashboardPage.mechanicsEditorWorkflow.test.tsx`: "shows a subject-specific recovery message, never the raw backend text, when loading the project's source blueprint fails"; "...when the validation request itself fails (not a domain validation result)"; the two renamed "...on a failed Apply..." tests (updated from asserting raw `"Disk full."` text to asserting it's gone) |
| `SimulationTab.tsx` | `error`/`reviewedDetail.message`/`compareDetail.message`/`recentRunsError` now route through a new subject-specific `describeProjectActionError()` (second correction round -- these are page-owned states, previously deferred on a shared-state blast-radius argument review rejected) | `ProjectDashboardPage.simulationWorkflow.test.tsx`: "shows a subject-specific recovery message, never the raw backend text, when the simulation request itself fails outright"/"...when opening a historic report fails"/"...when loading a comparison report fails"; the updated "clears a stale Recent Runs error once a refresh succeeds" fixture |
| `OverviewTab.tsx` | `inspection.message` now routes through `describeProjectActionError()` (second correction round); the sibling curated `provenance.message` field is untouched | `ProjectDashboardPage.overviewWorkflow.test.tsx`: "shows a subject-specific recovery message, never the raw backend text, when the project inspection fails"; "...classifies a network failure distinctly..."; "...still shows a curated provenance error verbatim..." |
| `ValidationTab.tsx` | `view.message` now routes through `describeProjectActionError()` (second correction round) | `ProjectDashboardPage.validationWorkflow.test.tsx`: "shows a subject-specific recovery message, never the raw backend text, when the validation request fails"; "...classifies a network failure distinctly..."; the updated `ProjectDashboardPage.test.tsx` "a failed re-validation clears the stale successful result..." fixture |
| `ExportDeployTab.tsx`, `DeploymentTab.tsx` | Both tabs' own `targetsError` render call sites (shared `useDeploymentManager.ts` state) now route through `describeProjectActionError()` (second correction round -- previously deferred as a mount-time-list-fetch exception review rejected, since both tabs sit inside this document's own in-scope nav surface) | `ProjectDashboardPage.exportDeploy.test.tsx` and `ProjectDashboardPage.deploymentWorkflow.test.tsx`: "shows a subject-specific recovery message, never the raw backend text, when the deployment targets list fails to load"; `projectActionError.test.ts` for the classifier |
| `studioSurfaceInventory.baseline.test.tsx` | Its own "Advanced tab raw-error surface baseline" describe block pinned the *pre-fix* raw-passthrough behavior for Deployment/Runtime/Replay as the expected baseline -- now stale for Deployment (this round) and already stale for Runtime/Replay (fixed in the first `[P2-POLISH-25]` round but never updated here); renamed to "...subject-specific recovery copy baseline" and all three assertions updated to pin the corrected, translated text instead | same file, all three `it` blocks |

Every `xxxOutdated` fix above (`configureOutdated`/`buildOutdated`/`compareOutdated`/`exportOutdated`) follows
the exact lifecycle `f5c10bc` already established (`validateOutdated`/`selectOutdated`): a boolean set inside
the existing `invalidate*()` function whenever the view being invalidated was not already idle, cleared at the
start of the corresponding `run*()`, rendered as one `<Alert color="yellow" variant="light"
icon={<IconAlertTriangle .../>}>` at the point where the invalidating field lives -- no new mechanism, each gap
a narrow, mechanical extension of a pattern already reviewed and accepted for its sibling result in the same
tab. The three Runtime fixes above are unrelated in shape (a `disabled`-guard fix and two raw-error-translation
fixes) and are described in full in Runtime's own section above.

## Deferred findings (documented, not corrected this step)

Recorded so a future step doesn't have to rediscover them, same convention
`studio-phase2-inventory.md`'s own "Deferred unknowns" section uses:

1. **Certification has no in-app re-verification of an already-built evidence bundle** -- only
   `pokie certification verify --source` on the CLI. A real asymmetry with Provably Fair; a feature addition,
   not a correction, so left for an explicit future redesign decision.
2. Stake Engine Export's `conflict` status is raw but already a deliberately hand-crafted message, same as
   every other tab's own conflict messages -- not the same finding as Outcome Libraries' Generate step, which
   this correction round fixed (see its own section above).
3. Replay is the one sibling of Runtime/Deployment/Outcome Libraries without a `key={projectKey}` remount
   guard; only its page-owned `expected` state has direct project-switch fixture coverage today.
4. Validation's project-switch reset gap exists in the code but is not reachable through any current
   navigation path -- see its own section above for the full investigation.
5. Runtime's Load Session (blank id) and Provably Fair's Verify were both previously-documented fail-open
   silent no-ops (`studio-phase2-inventory.md`'s own Cross-cutting findings) -- both are now fixed as of this
   step (Provably Fair first-pass, Runtime's Load Session in the correction round for `[P2-POLISH-25]`
   itself, once flagged as still in scope).
6. **Simulation & Reports, Overview, Validation, and Export & Deploy/Deployment's raw-error-passthrough
   findings, all fixed this second `[P2-POLISH-25]` correction round:** the first round left these open on the
   reasoning that the raw text is *owned by `ProjectDashboardPage.tsx`/`useDeploymentManager.ts`* -- shared
   state every other tab's own state also lives in -- so touching it has a materially larger blast radius than
   a single self-contained tab file (the shape Mechanics Editor/Outcome Libraries' own fixes had). Review
   correctly rejected that blast-radius argument as not a valid reason to leave findings this document's own
   audit had already identified sitting open within this step's cross-cutting scope. All four are now fixed --
   see "Simulation & Reports, Overview" and "Validation"'s own sections above for `SimulationTab`/`OverviewTab`/
   `ValidationTab`, and "Export & Deploy, Deployment: closing the targets-list raw-error passthrough" for the
   shared `targetsError` state -- via a new `domain/projectActionError.ts`, the fourth `describe*ActionError`
   helper alongside `describePathActionError`/`describeReplayActionError`/`describeRuntimeActionError`. No
   raw-error-passthrough finding remains open anywhere in this document's audited scope.
7. **`BlueprintValidationPanel`'s raw-error/non-alert Validate-request finding, fixed `[P2-POLISH-26]`:** see
   its own section above ("P2-POLISH-26: closing the `BlueprintValidationPanel` raw-error/non-alert gap").
   Closes `docs/studio-phase2-inventory.md`'s "Deferred unknowns" #6 as well.

Two findings remain genuinely open as non-blocking backlog, both documented (not exercised by an executable
fixture) in `docs/studio-phase2-inventory.md` rather than this document, and untouched by `[P2-POLISH-26]`
since neither was named as a verified Phase 2/release blocker for this step: its own "Deferred unknowns" #1
(Outcome Libraries' six evidence-only `describePathActionError` call sites) and #3 (Stake Engine Export's
non-monotonic Stepper re-locking gap) -- see `docs/studio-phase2-final-verification-report.md`'s "Non-blocking
backlog" section for the consolidated list across both documents.
