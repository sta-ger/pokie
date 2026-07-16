# POKIE Studio frontend

This documents the **implementation** of POKIE Studio's frontend (`cli/studio-client/`) — the stack, layout,
dev workflow, build, and tests. For what Studio actually *does* (Home screens, the Blueprint Editor and its
Reel Strip Modeler, the Project Dashboard's seven tabs, and the full `/api/...` reference it talks to), see
[`cli.md`](cli.md#pokie--pokie-studio-experimental) — this migration to React + Mantine changed none of that
behavior or API surface, only how the frontend is built and rendered.

## Stack

- **React 19** + **Mantine 9** (`@mantine/core`, `@mantine/hooks`, `@mantine/form`, `@mantine/notifications`,
  `@mantine/modals`) for UI components, forms, notifications, and confirm dialogs.
- **Vite** for the dev server and production build (replacing the old bare-`tsc` compile).
- **`react-router-dom`**, hash routing (`createHashRouter`-equivalent via `<HashRouter>`), exactly two routes:
  `/` (Home) and `/project` (Project Dashboard). Tab selection *within* a route is local component state, not
  a nested route — switching Home/Project tabs never changes the URL, matching the app's original behavior.
- All of the above are **devDependencies** of the `pokie` package, not runtime dependencies — the published
  npm package still ships only a static, framework-free JS/CSS bundle at `dist/cli/studio-client/`, built at
  publish time. Nothing about `npm install pokie` changes for consumers.

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
                           # errorMessage.ts, formatTimestamp.ts, asStringList.ts, interpret/*.ts --
                           # all pure, framework-agnostic TypeScript, unit-tested independently of React
    context/StudioApiProvider.tsx   # supplies the FetchLike apiClient functions expect
    hooks/                # useOpenProject, useConfirm, useBlueprintEditor, useProjectContext,
                           # useSimulationPoll, useReplayPoll, useRuntimeManager, useDeploymentManager
    components/
      layout/             # AppShellLayout, NavTabs (the shared foundation)
      common/             # LoadingState/EmptyState/ErrorState/SuccessResult, IssueList/FileList,
                           # RowActions/QuickActions/PageSection, BufferedTextInput/BufferedNumberInput,
                           # SimulationReportDisplay, ScreenTable, BuildPreviewDisplay/BuildResultDisplay
      home/               # Recent/Create/Init/Build/Open panels
      blueprintEditor/    # Metadata/Symbols/Bets/Paylines/Paytable editors, the Reel Strip Modeler
                           # (ReelStripGenerationEditor.tsx), Load/Save/Validate/Build panels
      project/            # ProjectDashboardPage + the 7 tab components
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
# terminal 1: a real Studio backend to develop against
npx pokie studio <path-to-a-project> --port 3200

# terminal 2: Vite dev server with HMR, proxying /api to the server above
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
  `tests/cli/studio-client/src/testUtils/`).

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
