# POKIE Studio frontend

This documents the **implementation** of POKIE Studio's frontend (`cli/studio-client/`) — the stack, layout,
UX/navigation, dev workflow, build, and tests. For the full `/api/...` reference and what each screen talks to
server-side, see [`cli.md`](cli.md#pokie--pokie-studio-experimental) — none of that behavior or API surface has
changed; only how the frontend is built, rendered, and organized has.

## Stack

- **React 19** + **Mantine 9** (`@mantine/core`, `@mantine/hooks`, `@mantine/form`, `@mantine/notifications`,
  `@mantine/modals`) for UI components, forms, notifications, and confirm dialogs.
- **Vite** for the dev server and production build (replacing the old bare-`tsc` compile).
- **`react-router-dom`**, hash routing via the **data router** API (`createHashRouter` + `RouterProvider`,
  not the declarative `<HashRouter><Routes>`) — required for `useBlocker` (see the dirty-navigation guard
  below), which only works under a data router. Every section has a stable URL: `/home/:tab` (Design Game /
  Projects) and `/project/:tab` (the 8 Project Dashboard tabs) — `/` and
  `/project` redirect to their default tab. A single `:tab` param route per page is enough to make
  refresh/back-forward/direct-link land on the right section, since react-router keeps the same
  `HomePage`/`ProjectDashboardPage` element instance mounted across param-only changes.
- All of the above are **devDependencies** of the `pokie` package, not runtime dependencies — the published
  npm package still ships only a static, framework-free JS/CSS bundle at `dist/cli/studio-client/`, built at
  publish time. Nothing about `npm install pokie` changes for consumers.

## UX / Information architecture

Navigation is organized around the user's task sequence — open/create → configure the game model →
validate → build → simulate → view a report — not around internal module names.

**Home (`/home/:tab`)** — 2 tabs, both permanently mounted (hidden via CSS, never unmounted, so switching
tabs never loses in-progress work):

- **Design Game** (`/home/design`, the default) — the guided happy path: a New Blueprint dialog (Blank/Random/
  from an existing file) starts a draft, then the same editor configures, validates, and builds it. Renders
  `BlueprintEditorPage` in
  `guided` mode: a `StepProgressList` (Configure → Validate → Build, a read-only status list — not a
  `Stepper`, since there's nothing to click ahead to; see "Stepper vs. other step UI" below) and a
  `NextStepCallout` next-step hint, both driven by the panel's own existing local validation state. JSON
  mode and Load/Save-by-path are tucked
  behind a "Show advanced options" disclosure — Build works directly off the in-memory blueprint, so neither
  is required for the guided flow. A successful build's "Open in Studio" button (unchanged) is the bridge
  into the Project Dashboard.

  The "Configure" step's own fields are grouped into 6 named sections — Game basics, Layout, Symbols,
  Reels, Paytable, Bets — via `components/blueprintEditor/SectionedFormEditor.tsx`, a Mantine `Tabs`
  (`keepMounted keepMountedMode="display-none"`, so switching sections never loses an in-progress edit,
  and gives arrow-key navigation between sections for free) wrapping the *same* field components the
  editor always used (`MetadataFieldset`, `SymbolsTable`, `PaytableEditor`, ...) — this only reorganizes
  existing UI, it doesn't touch `GameBlueprint`, the validate/build API calls, or the server-side
  `GameBlueprintValidator`. `domain/interpret/BlueprintSections.ts` classifies the single flat
  `ValidationIssue[]` the existing `/api/home/blueprints/validate` call already returns by `code` prefix
  (a *display* categorization over an already-computed result, not a new validation layer — issue codes
  carry no structured field/path, so this is section-granularity, not per-field) into a per-section
  `StatusBadge` (error count / warning count / a green check once validated clean) shown on each tab, plus
  a filtered `IssueList` inline in that section's own panel. `BlueprintValidationPanel` at the bottom is
  unchanged and still the one full, unfiltered summary. Reels/rows moved out of `MetadataFieldset` into a
  new `LayoutFieldset` (Game basics keeps only the manifest fields).

  The blueprint is dirty-tracked (`BlueprintEditorPage`'s `onDirtyChange`,
  cleared on a fresh New/Load or a successful Save/Build) and guarded by one centralized mechanism,
  `hooks/useDesignNavigationGuard.ts`, used once in `HomePage`, which handles two distinct kinds of exit:
  - Transitions the router already knows about *before* they commit — browser Back/Forward and any in-app
    `navigate()` call are both just "history transitions" to a data router, blocked uniformly by a
    `useBlocker` predicate. A blocked transition shows a Mantine confirm modal; confirming calls
    `blocker.proceed()` (resumes the exact blocked transition — never a duplicate navigation), cancelling
    calls `blocker.reset()` (leaves the URL, draft, and focus untouched, since nothing in Home ever
    unmounts while blocked). A manually edited hash (typed into the address bar) is a variant of this case
    handled by a `hashchange` fallback: such an edit creates a browser history entry with no
    `history.state.idx` marker, which `useBlocker` can't compute a safe revert-delta for and silently lets
    through — the fallback reverts the hash and shows the same modal.
  - `useOpenProject`'s own side effect (call the API, then navigate to `/project`) — blocking only the
    `navigate()` call would be too late, since the API call already ran. `useDesignNavigationGuard` also
    returns a `GuardedAction` (threaded to `useOpenProject` via `context/DesignNavigationGuardContext.tsx`,
    provided once by `HomePage`) that shows the same confirm modal *before* running the side effect at
    all: Cancel never calls the API; Confirm runs the API call and lets the one `navigate()` call it makes
    through unblocked (via a one-shot bypass flag the `useBlocker` predicate consults, reset immediately if
    the API call fails) — so there is exactly one confirmation, never two, and a failed call leaves Home's
    URL, draft, and the guard itself exactly as they were.

  All three call sites share one `CONFIRM_MODAL` settings object, which disables `withCloseButton`,
  `closeOnEscape`, and `closeOnClickOutside` — Escape/click-outside/a close button would otherwise dismiss
  the modal without running either `onConfirm` or `onCancel`, leaving `blocker.state` stuck "blocked"
  forever (router case) or `guardedAction`'s Promise permanently pending (side-effect case, which in turn
  leaves an awaiting caller like `OpenProjectForm`'s loading state and double-submit guard stuck too). The
  only way to dismiss it is an explicit Leave/Stay choice.

  Reload/tab-close is guarded separately by a native `beforeunload` listener, attached only while dirty.
  Switching between Home's own 2 tabs is never blocked by any of the above.
- **Projects** (`/home/projects`) — every already-known project: managed (created/opened this Studio session,
  in-memory only, reset on restart) and registered (persisted across restarts via
  `StudioProjectRegistrationService`), plus **Import Project**, which previews/validates a target path before
  ever registering it. A detected PAR sheet can be registered and opened into its own Build/Export dashboard
  to republish the workbook; it also retains a separate Design Game route for the guided PAR Sheet
  Import/Export workflow. There is no
  scaffolding/init/build-from-an-existing-blueprint-file surface in Studio any more — those flows now live only
  in the CLI (`pokie init [directory]`, `pokie create [name]`); Home doesn't duplicate them, only imports what
  they produce. The old, separate, always-mounted "raw" (non-`guided`) Blueprint Editor instance that used to
  back that surface is gone too — Design Game's own JSON mode and Load/Save-by-path (behind its "Show advanced
  options" disclosure) already cover the same ground.

**Project Dashboard (`/project/:tab`)** — grouped instead of flat: **Overview, Game Model, Play,
Simulation** (the primary flow, in that order), then a visually separated **Advanced** group — Replay,
Build/Export, Certification, Fairness (`NavTabItem`'s optional `section` field drives the grouping in
`NavTabs`; see `ALL_PROJECT_TABS` in `ProjectDashboardPage.tsx` for the exact, current tab list). There is
no standalone "Validate" tab any more (validation is now automatic diagnostics folded into Overview), and
the old standalone Deployment/Outcome Libraries/Stake Engine Export tabs have been removed outright.
Build/Export is the sole Studio build surface for artifact materialization, Stake export, and Remote delivery
(see `ExportDeployTab.tsx`). Outcome Libraries' retired select-existing/inspect/compare task is intentionally
not represented as generation: the retained Outcome source Overview owns inspection, and comparison remains
an explicit CLI outcome-source workflow.

Legacy `#/project/:tab` links are first converted to their project-scoped equivalent; the same policy applies
to direct `#/project/:projectRoot/:tab` links. `deployment` and `stakeEngineExport` go to Build/Export with
migration text; `validate` and `validation` go to Overview diagnostics; `outcomeLibraries` goes to Overview
with an explicit unavailable/deprecated explanation because it has no equivalent Build/Export task. Unknown
removed routes also go to Overview rather than guessing an operation. No retired route mounts a duplicate tab.

- **Validate** runs `POST /api/project/validate` through an explicit `idle|loading|error|success` state
  (`ProjectValidationView`) rather than a bare result + a separate loading flag — a failed re-validation
  replaces the whole state, so it can never leave a stale successful result on screen with no error shown.
- **Overview** is the landing/state page: a `NextStepCallout` at the top summarizes the project's current
  pipeline state and recommends exactly one next action — `describeNextAction`
  (`domain/interpret/ProjectDashboard.ts`) is a pure function over state the page already fetches
  (`ProjectValidationView`, current simulation job), following the same `describe*` view-model pattern as
  everything else here. It cycles Validate → fix issues → Simulate → view the report as each stage
  completes — **warnings never block this progression**, only errors or an outright invalid report do
  (`ValidationSummaryView.blocking`, kept distinct from `hasIssues`); `BlueprintBuildPanel`'s "Build
  Package" mirrors this at the blueprint level, disabled only when the blueprint is known-invalid, never
  for warnings-only.

**Breadcrumbs, page titles & focus** — `AppShellLayout`'s optional `breadcrumbs` prop renders a Mantine
`Breadcrumbs` trail in the header (Home passes none, showing just the "POKIE Studio" home link; the Project
Dashboard passes `[projectName, activeTabLabel]`). Every page sets `document.title` via `@mantine/hooks`'
`useDocumentTitle`. Both pages also move focus into the newly active section's content on every navigation
(a `tabIndex={-1}` wrapper + a `useEffect` keyed on the URL-derived active tab), so keyboard/screen-reader
users don't lose their place after a tab switch or a cross-page navigation.

This redesign consolidated rather than merely relabeled: Home's old standalone scaffolding/init/build-from-file
surface ("Advanced Tools") was removed outright — those flows now live only in the CLI. The Project Dashboard's
old Deployment and Stake Engine Export tabs moved to Build/Export cards; its old Outcome Libraries
select-existing/inspect/compare task has no equivalent builder, so it recovers on Overview with explicit
unavailable/CLI-comparison guidance. Everything else from before the redesign is still reachable, just
re-labeled and de-emphasized relative to the primary flow.

Certification has one deliberate handoff. Studio owns source validation, evidence build, inspection, and
manifest download; after a successful build it displays `pokie certification verify <certDir> --source
<bundleDir>` for independent verification. Run it from the project directory with the same live, unchanged
outcome-library source; if source or evidence changed, rebuild before verification. A downloaded manifest is
not an evidence bundle and is never a substitute for that verifier.

## Directory layout

```
cli/studio-client/
  index.html          # Vite entry
  vite.config.ts       # build.outDir -> ../../dist/cli/studio-client; dev-mode /api proxy
  tsconfig.json         # app tsconfig (jsx: react-jsx, DOM libs)
  src/
    main.tsx            # createRoot + MantineProvider + theme
    App.tsx              # StudioApiProvider + ModalsProvider + Notifications + routes
    theme.ts
    routes.tsx
    api/                 # apiClient.ts, types.ts -- ported ~verbatim from the pre-React app
    domain/               # blueprintEditorState.ts, blueprintFormOps.ts, deploymentRunTracker.ts,
                           # errorMessage.ts, formatTimestamp.ts, asStringList.ts, interpret/*.ts
                           # (including BlueprintSections.ts, the Design Game section classifier) --
                           # all pure, framework-agnostic TypeScript, unit-tested independently of React
    context/StudioApiProvider.tsx   # supplies the FetchLike apiClient functions expect
    context/DesignNavigationGuardContext.tsx   # threads useDesignNavigationGuard's GuardedAction to
                                                # useOpenProject (see UX/Information architecture above)
    hooks/                # useOpenProject, useDesignNavigationGuard (centralized dirty-navigation guard,
                           # see UX/Information architecture above), useConfirm, useBlueprintEditor,
                           # useProjectContext, useSimulationPoll, useReplayPoll, usePlaySession,
                           # useDeploymentManager
    components/
      layout/             # AppShellLayout (shell + optional breadcrumbs), NavTabs (supports an optional
                           # `section` grouping label per item)
      common/             # LoadingState/EmptyState/ErrorState/SuccessResult, NextStepCallout (the shared
                           # "here's what to do next" affordance), IssueList/FileList, StatusBadge (the
                           # per-section error/warning/success indicator on Design Game's tabs),
                           # RowActions/QuickActions/PageSection, BufferedTextInput/BufferedNumberInput,
                           # SimulationReportDisplay, ScreenTable, BuildPreviewDisplay/BuildResultDisplay,
                           # PathInput/PathBrowseModal (a filesystem-path TextInput plus a "Browse" action
                           # -- GET /api/home/fs/browse -- and a resolved-path hint shown on focus, used by
                           # every project-creation path input so a bare "." always has a concrete location
                           # shown alongside it)
      home/               # HomePage (Design Game / Projects), ProjectsPanel (managed + registered
                           # projects, Import Project)
      blueprintEditor/    # BlueprintEditorPage (plain, or `guided` for Home's Design Game tab),
                           # SectionedFormEditor (guided mode's 6-section layout, see UX/Information
                           # architecture above), Metadata/Layout/Symbols/Bets/Paylines/Paytable editors,
                           # the Reel Strip Modeler (ReelStripGenerationEditor.tsx), Load/Save/Validate/
                           # Build panels
      project/            # ProjectDashboardPage (Overview/Play/Simulation primary,
                           # Replay/Build-Export/Certification/Fairness grouped as "Advanced")
                           # + the tab components
```

`tests/cli/studio-client/src/` mirrors this tree 1:1 (repo convention — `tests/` always mirrors `src`/`cli`
layout). The pure `domain/` and `api/` modules keep their original unit tests, moved but otherwise unchanged;
new `.test.tsx` component/integration tests were added alongside each screen.

### Why the domain layer looks untouched

The pre-React app already separated pure state/API logic (`apiClient.ts`, `interpretX.ts`,
`blueprintEditorState.ts`, `blueprintFormOps.ts`, `deploymentRunTracker.ts`) from DOM rendering (`dom.ts`) and
orchestration (`main.ts`). Only the latter two needed a real rewrite; the pure layer was moved into
`src/api`/`src/domain` with import-path fixups only, keeping its existing test coverage and exact behavior —
including load-bearing details like the Blueprint Editor's monotonic `revision` counter (the stale-response
guard behind the Reel Strip Modeler's "Resolve reels"), and `DeploymentRunTracker`'s double-submit refusal and
out-of-order-response rejection.

One React-specific note: **the Blueprint Editor's Form view never remounts on a routine field edit.** Editing
one field must not tear down or interrupt a different in-flight request elsewhere in the form (e.g. a pending
"Resolve reels" call) — so only a wholesale blueprint replace (New / Load / a successful JSON Apply) remounts
the Form subtree (`useBlueprintEditor`'s `formGeneration` counter), never a single mutate(). Individual dynamic
list rows (symbols, bets, paylines, paytable, reel strips) use small buffered controlled inputs
(`BufferedTextInput`/`BufferedNumberInput` — commit on blur, like the old app's `change`-event semantics) so
they stay visually correct after a Duplicate/Remove/Move action shifts other rows to new array positions.

Similarly, **every Project Dashboard tab's data-loading/polling hook lives at the page level**
(`ProjectDashboardPage.tsx`), not inside the conditionally-rendered tab component — a running Simulation or
Replay poll, or an in-flight Deployment request, must survive the user switching to a different tab, exactly
as it did when the old app kept every tab's markup in the DOM simultaneously (just hidden via CSS).

## Development

```sh
# Builds the local CLI, starts its Studio backend, waits for it to be ready,
# then starts the Vite dev server with HMR.
npm run dev-studio-client
```

`vite.config.ts` proxies `/api/*` to `http://127.0.0.1:3200` in dev mode. In production, `StudioServer` serves
the built frontend and the JSON API from the same origin (see `cli/studio/StudioServer.ts`), so no proxy is
needed there.

## Build

```sh
npm run build-studio-client   # vite build -> dist/cli/studio-client
npm run build                 # full package build, includes the above
```

`StudioServer`'s static file serving (`resolveStaticFilePath`/`CONTENT_TYPES`) already handles arbitrary
nested asset paths generically, so Vite's hashed `assets/*.js`/`assets/*.css` output needs no server changes.

## Testing

Two Jest projects (`jest.config.mjs`):

- **`pokie`** (`testEnvironment: "node"`) — everything under `src/`, `cli/`, `tests/`, *except* `.test.tsx`
  files. This includes the studio-client `domain`/`api` pure-module tests.
- **`studio-client-components`** (`testEnvironment: "jsdom"`) — `tests/cli/studio-client/src/**/*.test.tsx`,
  using React Testing Library. Components are tested through `StudioApiProvider`'s `fetchImpl` injection point
  (the same fake-fetch seam `apiClient.test.ts` already used, not a new mocking layer — see
  `tests/cli/studio-client/src/testUtils/`). `testUtils/renderRoutedApp.tsx` mounts a real **data router**
  (`createMemoryRouter` + `RouterProvider`, mirroring production `routes.tsx` exactly, `useBlocker` included)
  and returns the created `router` instance alongside the render result, so a test can drive real
  navigation directly (`router.navigate(-1)`/`(1)` for back/forward, or a path string for a direct/in-app
  navigation) as well as exercise an actual cross-page navigation through the UI, used by
  `tests/cli/studio-client/src/integration/happyPath.test.tsx` — the full guided scenario end to end
  (configure the game model → validate → build → land in the Project Dashboard → simulate → open the
  report). `tests/cli/studio-client/src/routing.test.tsx` covers refresh/direct-link (render with a specific
  `initialEntries` path) and real browser back/forward. `tests/cli/studio-client/src/designNavigationGuard.test.tsx`
  covers the router-level half of the guard: blocking Back and a direct `/project/*` navigation while
  dirty (including the untracked-hash-edit fallback), Cancel preserving the URL/draft, Confirm navigating
  exactly once, Home's own tab switches never blocking, and the `beforeunload` listener being attached only
  while dirty. `tests/cli/studio-client/src/openProjectGuard.test.tsx` covers the `GuardedAction` half
  specifically: Cancel never calls the open-project API, Confirm calls it exactly once and navigates
  exactly once, a failed call keeps Home's URL/draft and doesn't leave the router-level bypass stuck "on"
  for a later, unrelated navigation, and Back/Forward/direct-route/tab-switching behavior is unaffected.
  `tests/cli/studio-client/src/navigationGuardModal.test.tsx` covers the confirm modal's own dismissal
  behavior, shared by all three call sites: Escape and clicking outside don't close it, there's no close
  button (exactly the Leave/Stay pair), Stay releases a `guardedAction` caller's loading state and
  double-submit guard, and a subsequent attempt after Stay completes normally.
  `tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.sections.test.tsx` covers
  Design Game's sectioned layout: editing across sections (Game basics/Symbols/Bets) through to a
  successful Validate → Build → Project Dashboard, an in-progress edit in one section surviving a switch
  to another and back, a validation error surfacing as both a section's own badge/inline `IssueList` and
  in the unchanged bottom summary, and arrow-key navigation between section tabs. The domain-level section
  classifier itself is unit-tested independently in
  `tests/cli/studio-client/src/domain/interpret/BlueprintSections.test.ts`.
  `tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.guidedProgress.test.tsx`
  covers the read-only progress list (see the Stepper audit above): no clickable step buttons, and the
  idle/invalid/ok transitions each land on the right `completed`/`current`/`blocked`/`failed`
  `aria-current`/status combination.
  `tests/cli/studio-client/src/components/common/StepProgressList.test.tsx` unit-tests the shared component
  itself across its full `completed|current|available|blocked|skipped|failed` state vocabulary --
  `aria-current`/`aria-disabled` placement and that each status is exposed as real, non-color-only text. The
  data router builds
  Fetch API `Request` objects internally on every navigation even with zero loaders/actions defined, which
  jsdom doesn't provide — `tests/cli/studio-client/src/jestPolyfills.ts` polyfills `Request`/`Response`/
  `Headers`/`fetch` via `undici` (a devDependency; this is what Node's own built-in `fetch` is built on).

```sh
npm test                                          # both projects
npx jest --selectProjects studio-client-components  # just the React component tests
```

## Accessibility & responsiveness

- Every Home/Project tab and the Blueprint Editor's Form/JSON toggle preserve `aria-current="page"` on the
  active tab (Mantine `NavLink`/`SegmentedControl`).
- Dynamic-list row actions (Duplicate/Remove/Move) keep their original `aria-label` text (e.g. "Move symbol 2
  up"); nav tabs render as real `<button>`s (not an `href`-less `<a>`, which isn't keyboard-focusable).
- `AppShell`'s navbar collapses behind a `Burger` below Mantine's `sm` breakpoint; wide tables (Paytable,
  simulation breakdown) scroll within their own container rather than the page.
- Every `Stepper.Step` across Studio (all 5 remaining interactive Steppers, see the audit below) carries an explicit
  `aria-current={activeStep === N ? "step" : undefined}` -- Mantine's own `Stepper` has no built-in
  current-step ARIA semantics (only a `data-progress` styling hook), so without this a screen reader had no
  way to tell which step is active beyond visual styling.

### Stepper vs. other step/wizard UI (cross-cutting audit)

Studio has no in-house Stepper component -- every multi-stage tab/panel imports Mantine's `Stepper`
directly. This audits every such usage (plus every other step-like/wizard-like pattern in the codebase) and
classifies it as **linear** (strict, one-way order, no revisiting), **partially linear** (reachability is
order-dependent -- a step's prerequisite is a prior step's own output -- but revisiting an already-reached
step is a first-class, intentional path), or **nonlinear** (no inherent order at all; any section can be
visited in any order). "Keep Stepper only for real sequential transitions" is read as: Stepper's own
free-jump-to-any-non-disabled-step model (Mantine's default `allowNextStepsSelect={true}` -- no Studio
Stepper overrides it) is the right fit for **partially linear** flows, since it's exactly "resume where you
left off, revisit an earlier stage on demand, can't skip ahead of what's ready yet." It is the *wrong* fit
for a flow with no order dependency at all (that belongs in tabs) or for a flow with no navigation at all
(that belongs in a plain progress/status display, not a control that looks clickable but isn't).

The standalone Deployment (`project/DeploymentTab.tsx`), Stake Engine Export (`project/StakeEngineExportTab.tsx`),
and Outcome Libraries (`project/OutcomeLibrariesTab.tsx`) Steppers this audit originally covered have since been
removed outright, not just replaced. Deployment and Stake builders are Build/Export cards (see
`ExportDeployTargets.ts`); Outcome Libraries' select-existing/inspect/compare task has no equivalent card and
now reaches Overview with an explicit unavailable recovery. Their legacy routes never mount an alternate
workflow. They're kept out of the table below rather than left in with a stale "Kept as Stepper" disposition.

| Workflow | File | Classification | Disposition |
|---|---|---|---|
| Replay | `project/ReplayTab.tsx` | Nonlinear | **Changed.** The prior `Stepper` forced every source (fresh seed/round, pasted artifact, live spin, simulation round) through the same Find → Load → Reproduce → Inspect → Export sequence, even though the sources don't share one order at all (Session Spin has nothing to reproduce; Replay Artifact adds a validate-then-optionally-reproduce gate the others don't have). Replaced with a source choice (`SegmentedControl`) plus, once loaded, an inline loaded card/action bar/result view -- no page to click "continue" to. Switching source resets every per-source selection and any loaded/reproduced state (see `ReplayTab.tsx`'s own doc comment and `ProjectDashboardPage.replayWorkflow.test.tsx`'s source-switch coverage). |
| Certification | `project/CertificationTab.tsx` | Partially linear | Kept as `Stepper`. Forward-gated (`validateReachable`/`buildReachable`/`inspectReachable`) with no backward lock. |
| Provably Fair | `project/ProvablyFairTab.tsx` | Partially linear | Kept as `Stepper`. "Verify" is always reachable regardless of prior state -- gating only applies to the two steps that need a prior result to show. |
| Simulation | `project/SimulationTab.tsx` | Partially linear | Kept as `Stepper`. Auto-advances when a running job goes terminal; the pattern Replay's own auto-advance explicitly mirrors. |
| PAR Sheet Import/Export | `blueprintEditor/ParSheetImportExportPanel.tsx` | Partially linear | Kept as `Stepper`. Forward-gated; final step never disabled. |
| Reel Strip Generation | `blueprintEditor/ReelStripGenerationEditor.tsx` | Partially linear | Kept as `Stepper`. Forward-gated; a reel-selection change resets the stepper back to an earlier step. |
| Guided Design Game | `blueprintEditor/BlueprintEditorPage.tsx` (`guided`) | Linear, non-interactive | **Changed.** `active` was a pure function of validation status with no `onStepClick` at all -- Mantine's `Stepper` still rendered every step as a real, focusable `<button>` that silently did nothing when clicked (a false affordance for keyboard/screen-reader users, and the reason nearby tests had to disambiguate "Validate" button matches). Replaced with `common/StepProgressList.tsx`, a read-only `<ol>`/`<li>` list (no buttons, `role="list"`) supporting the full `completed \| current \| available \| blocked \| skipped \| failed` state vocabulary, with `aria-current="step"` on the active stage and each stage's status mirrored as real (non-color-only) text via `VisuallyHidden`, the same icon+text split `StatusBadge.tsx` already uses. |
| Guided Design Game sections | `blueprintEditor/SectionedFormEditor.tsx` | Nonlinear | Already correct -- Mantine `Tabs` (ARIA tablist, roving tabindex), no order dependency between Game basics/Layout/Symbols/Bets/Paylines/Paytable/Reels. No change. |
| Home/Project top-level navigation | `layout/NavTabs.tsx` | Nonlinear | Already correct -- a plain `<nav>` of buttons with `aria-current="page"`, one level above any per-tab Stepper; switching never implies sequencing. No change. |

No workflow here is **strictly linear with a backward lock** -- every gated flow lets the user revisit an
earlier, already-reached step (there is no code path anywhere that blocks *revisiting*), so none needed a
one-way "wizard" treatment. The one flow that had no navigation at all (guided Design Game's top-level
stage indicator) is the only one that was actually misusing `Stepper`, and is the only one converted.
