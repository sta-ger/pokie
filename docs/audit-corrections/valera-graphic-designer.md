# P9-10 — bounded rendered visual finish

Immutable brief: `e59a4a29489d4da81acfc7d10f2d7d9683566a8d2e045938fc11544fdc32fada`.
Finding ID: `P9-VALERA-GRAPHIC`. Candidate identity is the full commit containing
this handoff; the controller records that SHA alongside the assets actually
served. This document records implementation preparation, not a rendered visual
assessment or closeout.

## Independent assessment — pending controller collection

No P9-10 frozen observations, material product findings, screenshots, browser
profile, Studio URL or independent rendered results were supplied. Absence of
findings is not a clean visual verdict. Previous completed-step evidence remains
unchanged. Source inspection and the checks below cannot replace the independent
initial observation.

Before source, history, this document or scripted tests are exposed, give the
observer only the public product and this persona task:

> You are a graphic designer assessing POKIE Studio's visual quality. Explore
> Home, a saved project's model or build form, and a real operation's running
> and finished job cards. Use a compact desktop window and a smaller window.
> Record what looks unclear, crowded, inconsistent, clipped or unfinished,
> including the controls and messages you encounter.

Target 15 minutes, one initial assessment and affected clean retests only.
1100 × 800 and 390 × 844 are proposed regression dimensions, not observations.
Freeze questions and chronological observations before source-aware diagnosis.
The controller supplies the public production Studio entry point (`pokie
--no-open`, optionally host/port/project root), not a Vite/source fallback.
Home's current Start a game / Design Game flow and project Build/Export are
public surfaces; the retained non-guided BlueprintBuildPanel is not the primary
Home workflow.

Use an isolated browser profile and isolated server Documents, registry,
app-data/config, job store, cache and workspace. Recreate a representative saved
project through the product. Repeating affected surfaces requires new browser
and server state; browser storage clearing alone is insufficient.

| Evidence/chronology | State |
| --- | --- |
| Candidate SHA, production CLI identity, served index/JS/CSS hashes, CSS/theme/config input identity | Pending controller record |
| Browser executable/version, profile identity, isolation roots, exact dimensions, start/freeze times | Pending controller record |
| Home, one representative project/model/build form, actual running and terminal card | Pending independent observation |
| Hierarchy, type, spacing, alignment, proportions, density, labels, controls, status consistency, overflow and finish | Pending independent judgment |
| Styles loaded, document overflow/local scrolling, navigation and action reachability | Script prepared; rendered evidence pending |
| Frozen findings: severity, route, viewport, observed state and concrete evidence | Pending; no visual findings invented |
| At most four useful screenshots/contact sheets across initial and retests | Pending; zero added by implementation |
| Every material finding's shared cause, correction and focused regression | Pending frozen findings |
| Clean affected rendered retests and disposition | Pending independent retest; finding ID remains open |

After freezing, append links/hashes and actual observations here. For every
P0/P1/material P2 use a closure row with finding ID, route/state/dimensions,
evidence, shared cause and affected callers, fix commit, focused regression,
clean rendered retest and independent disposition. Do not resolve a visual
finding with only DOM/API/functional smoke or an unreached/blocked record.
Retain at most four images in total; only current-step evidence can be pruned.

## Prepared source-aware regression

`tests/cli/studio-client/src/P910ValeraGraphicDesigner.browser.test.tsx` is a
Node-environment test launching real Chromium against built production assets.
It reuses P909's native keyboard, DevTools transport and cooperative cleanup
pattern, without executing the historical collector or recovery journey.
The controller runs it after cold observations are frozen, with
`P910_FROZEN_OBSERVATIONS` pointing to the frozen record and optionally
`P910_CHROMIUM_BINARY` specifying the executable. Run the complete file:

```sh
npm run test:targeted -- tests/cli/studio-client/src/P910ValeraGraphicDesigner.browser.test.tsx
```

The script fails rather than skipping missing observations, candidate assets,
styles, Chromium, startup, real transitions or measured geometry. It checks
frontend inputs recursively (including CSS and theme), Vite/PostCSS configs,
HTML, package/lock inputs and installed Mantine styles against built index and
referenced JS/CSS timestamps. It compares actually served asset bytes with disk
and verifies computed application/Mantine styles. A small filesystem regression
asserts rejection of stale CSS/theme/build inputs and missing stylesheet assets;
that fixture does not simulate or prove visual quality.

At each proposed width the browser checks Home and reachable Create game plus
mobile navigation/focus return. It creates one real saved starter project and
visits Build/Export. Long occupied paths produce field-associated validation,
a disabled Build and preserved sentinel bytes; an alternate path restores
ready/keyboard-reachable Build and Browse. It repeats one bounded real simulation
workflow at each width (500,000 rounds each), measures a genuinely running common
JobProgressCard and the same job's completed JobResultCard, and reaches and
retrieves its report. If a job finishes before running presentation is measured,
that assertion fails; no synthetic progress or prolonging fake delay is used.
It does not run a build/publication workflow or packaging smoke.

Geometry checks document width, rendered controls/labels/detail/legend bounds,
text bounds and clipping ancestors. Native Tab/Enter exercise reachable controls
and viewport-visible focus. These assertions supplement visual judgment; they
do not assess professional finish or stand in for frozen designer findings.
The controller must reconcile this prepared path with the actual observations
and extend only the relevant assertions for confirmed fixes.

Actions, startup and the overall run have deadlines. Success, assertion failure
and timeout all cancel/drain owned jobs, close DevTools/browser, cooperatively
stop Studio/executors and remove only the script's owned temporary directory.
The script creates no screenshots or replacement observer transcript.

## Implementation checks and scope

No supplied material visual finding required a product correction in this
iteration. Existing shared styles, semantic controls, navigation, field blur
commits, Browse handlers, job ownership/focus and technical details are preserved.
No shared constructor, helper, hook or public CLI/library contract changed.
Source inspection covered the production style entry point, theme, shell,
Home, project Build/Export and shared PathInput/PageSection/job presentation.
Existing wrap/clip rules are diagnostic candidates for the cold reviewer, not
source-derived visual findings.

Permitted foreground checks passed:

```sh
npm run test:targeted -- tests/cli/studio-client/src/components/common/responsive.test.tsx tests/cli/studio-client/src/components/layout/AppShellLayout.mobileNav.test.tsx tests/cli/studio-client/src/components/home/HomePage.test.tsx tests/cli/studio-client/src/components/home/ProjectsPanel.test.tsx
npm run typecheck
```

Four suites / 77 tests passed. Root typecheck includes the Studio compiler; no
second Studio compiler run is necessary. These existing tests cover layout
contracts, Home and registry paths and mobile semantics, not real geometry.
The new Node browser file is linted by the required changed-file commit hook;
root typecheck excludes Studio test files, which are transpiled by their Jest
lane. Its complete runtime execution remains explicitly controller-owned.
An attempted test-name-filtered helper-only run was rejected by the bounded
command policy before Jest started; it is not a pass. No workaround was used.
No browser regression, production build, official gate, packaging smoke or
cold collection ran in this implementation worker. Those pending machine-owned
results do not constitute a product failure or close this roadmap step.
