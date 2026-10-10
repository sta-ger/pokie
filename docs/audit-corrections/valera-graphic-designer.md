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

Before the controller supplies `P910_FROZEN_OBSERVATIONS`, only the rendered
retest is explicitly skipped. The asset-provenance, Node-environment and freeze
prerequisite regressions still run in the pre-review changed-tests gate. Once
the variable is supplied, the rendered retest fails on unreadable/empty records,
missing candidate assets, styles, Chromium, startup, real transitions or measured
geometry. No fallback observations or build/source UI are supplied. It checks
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

## Pre-review gate correction

The saved changed-tests failure was reproduced with the complete permitted
file: two checks passed and the rendered test failed before any process started
because the controller had not yet supplied `P910_FROZEN_OBSERVATIONS`. The
pre-review gate precedes the independent freeze; requiring that later receipt
at this earlier gate prevented the candidate from reaching cold collection.

Only rendered-test registration now depends on the explicit freeze receipt.
Absent receipt means an observable Jest skip, not visual approval. Supplied
receipts always enable the full existing production-browser journey, including
all geometry, asset identity, keyboard, disabled/conflict, running and terminal
assertions. Missing files and empty records still fail before browser startup.
Focused tests cover both registration branches and actual filesystem validation;
their temporary record is a fixture, never an independent observation.
Registration depends only on the explicit controller variable, with no
`npm_lifecycle_*`, `npm_package_*`, `INIT_CWD` or `TMPDIR` prerequisite.

| Acceptance/closure requirement | Correction evidence and remaining authority |
| --- | --- |
| Pre-review changed-tests can run before the freeze | Complete named file passes with four checks and one explicit rendered skip when the receipt is absent. Controller reruns its own gate. |
| Post-freeze rendered checks retain strict failures | Registration and filesystem regressions reject invalid opt-ins; the entire existing rendered body remains required when the receipt is supplied. Production build and complete browser execution remain controller-owned. |
| Independent graphic-designer assessment and bounded screenshots | Still pending cold collection; zero screenshots or observations fabricated. |
| Shared-cause correction and clean rendered retest of every material visual finding | Still pending frozen findings; this gate correction does not assert product visual approval or close P9-10. |

Correction verification uses only:

```sh
npm run test:targeted -- tests/cli/studio-client/src/P910ValeraGraphicDesigner.browser.test.tsx
```

The corrected run exits zero: four passed, one skipped. The changed TypeScript
is consumed by this Jest lane and the changed-file ESLint pre-commit hook; no
production source/compiler boundary changed. No production build, independent
browser rerun, parent-review matrix or official gate ran in this worker.

## 2026-10-10 independent cold collection — finding

This section is the actual independent assessment; it supersedes the earlier
pending status above without rewriting it. The collector had no product source,
history, prior findings, or reviewer hand-off until after the initial record was
frozen.

| Item | Actual record |
| --- | --- |
| Candidate / checkout | `422b48844da6f5b059fee0b63307fe5a54fae8dc` / this assigned worktree |
| Initial collection | Interactive, fresh application config and Documents roots; 2026-10-10T01:40:11.864Z to 2026-10-10T01:42:43.189Z |
| Frozen initial record | `/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-10-0e99011eed131b75/run-2026-10-10T01-40-11-863Z/frozen-initial.json` (`c81a6d71ff48d4be90d1f53b638bafb1e5ac9dab621590f1c1d522a398b27863`) |
| Chronological transcript | `/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-10-0e99011eed131b75/run-2026-10-10T01-40-11-863Z/transcript.json` (`dbc716121e7392f4bf53baf474eedc86b3d56c0f5d7a4581d4905de86b3e9cd1`) |
| Viewports | 1439×956 compact desktop; 900×700 smaller desktop |

Reached public surfaces: Home and its ready-to-edit starter form at both
viewports; a project created through the visible `Create game` action; persisted
Game Model; Build/Export; and `project-open-materialization` both Running
(`1 / 3 opening stages`) and Completed (`198ms`). The local action sequence
showed saving/opening before that matching job state; no fixed wait was treated
as a failure.

The compact surface has legible hierarchy, aligned two-column basics, clear
primary action, coherent validation labels, and quiet bordered sections. The
project Game Model and the visible Build/Export cards retained their reading
order and control alignment at 900px. No P0 or P1 was observed.

### P9-VALERA-GRAPHIC-01 — P2 material responsive overflow (open)

At 900×700, the fixed 260px navigation rail leaves a 593px main column, but
the six-item start-form step row remains on one line. The `Bets` tab starts at
x=890 and continues past the 900px viewport, clipping a required editor step.
This is a material professional-finish and navigation defect. The issue was not
observed in the persisted Game Model’s smaller-view controls. Product code and
tests were intentionally not changed by this independent verifier; a
shared-cause responsive correction and clean affected rendered retest remain
required before this finding can close.

Three bounded screenshots were retained in the isolated runtime harness (not
committed): compact starter form `1-observation.png`
(`eb1833d3d73ca8c1943e48263cb15db301b741ffc3b254aa93967ca1668389c4`),
smaller overflowing starter step row `2-observation.png`
(`9e39fb40be09d8fca35e1a4a204c2932983c5fa055c771e73f40c4727b1ce1be`),
and smaller Build/Export `3-observation.png`
(`d2bce1d4ed3106ab21732d49d1dd9c223721257985c6054ebf0c7f08b617ea0e`).
They are siblings of the frozen record above. No full viewport/status gallery
was collected.

## P9-VALERA-GRAPHIC-01 — implementation correction, rendered closure pending

Read both saved JSON records and verified their SHA-256 values against the
independent collection table above. Their observations and all three screenshots
remain unchanged. Current pre-correction HEAD `464bbd8b` differs from the observed
candidate only by the appended independent assessment, so the observed product
defect is still present in its source.

The exact saved geometry is `Bets` x=890.484375, width=95.015625: its right edge
is 985.5px in the 900×700 viewport. Source tracing reaches Home's guided
`BlueprintEditorPage` → `SectionedFormEditor`. That shared editor explicitly
overrides Mantine's wrapping tablist with `flexWrap: "nowrap"` inside a
`ScrollArea`; the installed ScrollArea content uses `display: table` and
`min-width: 100%`. The six tabs therefore retain their intrinsic single-row
width instead of fitting the 593px main column beside the 260px rail. The
persisted project's `GameModelSections` uses a separate presentation, consistent
with the frozen observation that this defect did not repeat there.

The correction removes that intrinsic-width scroll wrapper and explicitly wraps
the same semantic tablist in its available editor column. All six labels,
validation badges, real panels, lazy mounting, retained drafts, and native
roving keyboard navigation remain in place. No capabilities or technical
information are removed, and no global clipping or shell redesign is added.

| Whole-step acceptance / accumulated finding | Current closure evidence |
| --- | --- |
| Independent cold visual judgment before source/history | Preserved frozen initial record and chronological transcript above; the collector reached Home, a created project's Game Model and Build/Export, and Running/Completed project-open cards at 1439×956 and 900×700. No P0/P1 or other material visual finding was recorded. |
| P9-VALERA-GRAPHIC-01: Bets clipped at 900×700 | Shared-cause wrapping correction in `SectionedFormEditor`; focused section tests check exactly all six enabled tabs, absence of the intrinsic-width ScrollArea ancestor, navigation through Bets and back, visible controlled panels, retained edits, validation badges and save/open behavior. Product correction committed in the commit containing this section; independent disposition remains open. |
| Failure/disabled path and preserved creation semantics | Complete `BlueprintEditorPage.guidedProgress.test.tsx` covers disabled Create during loading/invalid designs, recovery after edits, and saving/opening through the real native control. |
| Clean affected production rerender | Controller-owned `P910ValeraGraphicDesigner.browser.test.tsx` now includes the exact 900×700 Home case alongside its existing compact/phone Home checks. It requires all six labels, wrapping, tab bounds inside their owning list and multiple rows at 900px/phone width; native arrow keys reach Bets, measure that active form and return to basics at 900px. Existing production asset/style identity, Build/Export conflict/recovery and actual running/terminal job checks remain. Execution and independent visual disposition are pending the controller's fresh build and isolated clean-state retest; no browser run is claimed here. |
| Bounded immutable evidence | Existing three screenshots and frozen history retained; implementation adds zero screenshots. At most one supplementary affected retest screenshot/contact sheet can be retained within the four-image limit. No full-gallery collection or prior-step cleanup. |

Permitted implementation checks:

```sh
npm run test:targeted -- tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.sections.test.tsx tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.guidedProgress.test.tsx tests/cli/studio-client/src/components/common/responsive.test.tsx
npm run typecheck
```

The focused run passed three suites / 40 tests (19.201s). Its section workflow
suite also emitted React `act(...)` warnings for asynchronous Home updates;
there were no assertion failures. `npm run typecheck` exited zero, covering the
production Studio compiler once. The section regression is consumed by the workflow Jest lane,
the automatic-validation/responsive files by the component lane, and changed
TypeScript by the clone-installed ESLint commit hook. The changed production
component is also consumed by Vite's Studio bundle through `build-studio-client`
and `build-cli`; these build boundaries and the complete browser regression
remain controller-owned under the bounded implementer policy. No production
build, packaging, independent browser rerun or official gate ran in this worker.
This correction handoff does not claim the roadmap's final visual closeout.

## Validated section-tab lookup repair — rendered closure pending

Reviewer finding `285d0e8a87d8b14f` was traced on `9f246625`: the browser
regression's exact whole-button text comparison cannot match `Game basics` or
`Bets` after validation. Production `StatusBadge` adds the hidden accessible
text `valid` beside the visible label. The preceding compact-width `Create
game` readiness wait makes this validated state relevant to the 900×700 case.
The production accessibility behavior remains unchanged.

The 900×700 regression now locates only role=tab controls within the `Game
design sections` tablist, matching `.mantine-Tabs-tabLabel` text. Initial native
Tab focus and both active-element assertions use this lookup. Native arrow
keys, selected-state assertions, six-label/wrapping/contained-geometry checks,
Bets form measurement, and downstream creation, Build/Export and real job
workflows remain in the same rendered journey.

The existing section workflow regression now waits for successful validation
before keyboard traversal. It confirms both production tab accessible names
include `valid`, their visible labels remain separately identifiable, and their
whole-button text differs from those labels. It retains navigation through Bets
and back, visible controlled panels, validation-error badges, retained edits,
and save/open coverage across the complete eight-test suite.

| Acceptance / accumulated finding | Repair evidence and remaining authority |
| --- | --- |
| Validated Game basics and Bets lookup | Scoped role=tab / visible-label lookup used for initial focus and both native-navigation assertions; complete section workflow suite passes with production hidden validation text present. |
| P9-VALERA-GRAPHIC-01 responsive overflow | Existing shared `SectionedFormEditor` wrapping correction and all browser geometry assertions retained. Independent clean rendered disposition remains open. |
| Whole-step independent assessment and evidence budget | Frozen initial assessment, chronology and three screenshots above remain unchanged. No new screenshot, observation or replacement evidence was created. |
| Clean affected production rerender | Complete P910 browser execution remains controller-owned after freeze authentication and production asset build, with fresh browser/server state. Neither focused component checks nor this selector repair close visual acceptance. |

Permitted foreground verification:

```sh
npm run test:targeted -- tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.sections.test.tsx
```

One suite / eight tests passed (9.428s); existing asynchronous Home updates
emitted React `act(...)` warnings, with no assertion failures. Only test files
and this append-only current-step note changed. Their execution boundary is the
Jest component/workflow configuration and clone-installed changed-file ESLint
commit hook; no production compiler, bundle, shared callback or public entry
point changed. Home's guided editor remains the only `SectionedFormEditor`
consumer through `BlueprintEditorPage`; persisted project editing uses the
separate `GameModelSections` presentation. No production build, browser rerun,
official gate, packaging check or independent collection ran in this worker.
