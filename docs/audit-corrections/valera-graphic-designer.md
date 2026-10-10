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
| Frozen initial record | `/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-10-6d4568a3c9593b96/frozen-initial/frozen-initial.json` (`c81a6d71ff48d4be90d1f53b638bafb1e5ac9dab621590f1c1d522a398b27863`) |
| Chronological transcript | `/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-10-6d4568a3c9593b96/frozen-initial/transcript.json` (`dbc716121e7392f4bf53baf474eedc86b3d56c0f5d7a4581d4905de86b3e9cd1`) |
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

## 2026-10-10 independent rerun — candidate audit-source finding

This section records the new candidate-bound cold collection and its
post-freeze dependent regression. It does not reclassify historical findings.

| Item | Actual record |
| --- | --- |
| Candidate / HEAD | `e6014f496ac833b34a2e98c262ce4e81e9d2343f` / `e6014f496ac833b34a2e98c262ce4e81e9d2343f` |
| Fresh interactive collection | `2026-10-10T02:51:24.054Z` to its frozen boundary; fresh app config/Documents and browser profile under the assigned P9-10 harness |
| Frozen initial record | Controller-authenticated retained record — SHA-256 `71c30329d173a999b17b16fb43314260864bd76ff2bed3aa04fb11145bb0d37b` |
| Chronological transcript | Controller-authenticated retained sibling — SHA-256 `4dfde7c64da45db2a689e99d87412e41db638936b79941fbf5d179445c975d46` |
| Initial coverage | Home/Design form at 1439×956, created-project Overview with completed `project-open-materialization` card, and Build/Export at 1439×956 and 800×700; three bounded runtime screenshots retained beside the records |

The independent visual assessment found no P0/P1/material-P2 defect: the
smaller Build/Export column reflowed text and controls without observed clipping
or overlap, and the operation card distinguished terminal status and duration.

After the freeze, the complete required file was invoked with
`P910_FROZEN_OBSERVATIONS` set to the frozen record:

```sh
npm run test:targeted -- tests/cli/studio-client/src/P910ValeraGraphicDesigner.browser.test.tsx
```

The rendered case failed deterministically before the public journey could
proceed. At 900×700 its candidate-owned focus helper rejected the enabled
`Create game` control with `Keyboard cannot reach focused control inside
viewport`; the captured rendered state had focus in the `Game id` input and
showed the enabled control. The failure is at
`P910ValeraGraphicDesigner.browser.test.tsx:327` while resolving the exact
button-text selector. This is a P1 audit-source defect, not a product visual
finding or a transient browser-driver timeout. No product code or test was
modified by this verifier. The correction lane must repair the candidate
runner's focus/reachability expectation and rerun the preserved frozen record.

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

## 2026-10-10 independent cold collection and supplementary retest

This is the current candidate-bound assessment for
`badbd783c5d76cc4956c8e4cebf4f33d976c9d18`; historical passages above are not
current failures. A fresh, isolated interactive collection was frozen before
the post-freeze hand-off was read. The initial record reached the Home/start
form at 1280×800 and 680×760, created the displayed valid starter once, reached
the project Game Model, and observed the terminal
`project-open-materialization · Completed` card. Three initial screenshots were
retained. The collector found no P0, P1, or material P2 visual issue.

The post-freeze clean retest at 900×700 used one additional screenshot. All six
validated editor tabs were visible and wrapped onto a second row rather than
clipping. Native arrow navigation reached Bets and returned to Game basics;
the displayed starter values were unchanged and validation returned to Valid.
This independently closes the earlier responsive-overflow disposition at the
rendered surface, but does not override the source-level regression below.

The required complete browser file was then executed once with
`P910_FROZEN_OBSERVATIONS` set to the frozen record. Jest ran all five cases:
four passed and the rendered-style case failed. Its terminal assertion required
the rendered Home style predicate to be `true` but received `false` at
`P910ValeraGraphicDesigner.browser.test.tsx:345`. The candidate-owned browser
audit's combined predicate covers stylesheet presence, the main/page minimum
widths, visible button structure/display/radius, and a non-empty
`--mantine-primary-color-filled` variable. The failure output only identifies
the combined predicate as false, not its individual false clause. This
non-diagnostic candidate-owned style-contract rejection is the current P1
finding, even though the manual 900×700 surface remained readable and
un-clipped.

| Evidence | SHA-256 |
| --- | --- |
| initial frozen record | `1c2efd1f3639d5937aaa8e66888f515fc9bd7dda80be7cf58c22f158f053420b` |
| initial transcript | `e8580a7bbe24d4a71a3f350ab784da737fa0000bb703a5fc892cbc34b1213644` |
| initial screenshots 1–3 | `9253f08b636ef4104e3c1768046b346ae89d41eb236783cc992f5fc8fb890689`, `1c675b6c5f875cf05eb96682100448ca73544c9d543137bf50d7fbb040a6798f`, `b2ba60f1168f50f59b82114ad19168ec4a54ac53ec8a767fd5be43272429dc13` |
| supplementary transcript and 900×700 screenshot | `651f0521ceac49d8e59178cd1762f41fcb91f20596163eccbb5f2b2e6b0596c0`, `6f84a96d663f43b82497dae40fa897891e4de3cb4584c94286c12b327aae871c` |

Runtime-only absolute records: initial
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-10-9c7a879181850068/run-2026-10-10T01-58-29-703Z/frozen-initial.json`, its sibling
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-10-9c7a879181850068/run-2026-10-10T01-58-29-703Z/transcript.json`, and the
supplementary transcript
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-10-9c7a879181850068/run-2026-10-10T02-03-14-435Z/transcript.json`.

## Rendered style-contract repair — independent execution pending

Finding `90cd84042a8cec88` was traced on clean HEAD
`4c1dfa6cd09dbc10ed4cbf105480172e82728393`. Read the three supplied runtime
records and verified their SHA-256 values against the preceding table. The
frozen observations, transcripts and four retained screenshots are unchanged;
this correction creates no additional visual evidence.

The failed predicate required the first visible Mantine Button's computed
`display` to equal `inline-block`. On Home that button is `Create game`:
`HomePage` → guided `BlueprintEditorPage` → `QuickActions` → Mantine `Group`.
It is a direct child of the Group, whose installed stylesheet declares
`display: flex`. Mantine declares the Button root `display: inline-block` and
its inner wrapper `display: flex`, but CSS blockifies the outer display of a
flex item to `block`. Thus this exact clause rejects the correct production
composition. This is a source trace of the saved failure, not a new browser
observation or a claim that the other clauses have been independently measured.
Changing the production layout to satisfy that erroneous expectation would
break the shared action-row contract.

Audited both consumers of the browser's `styles()` helper: Home at 1100×800,
900×700 and 390×844, and the project Simulation surface after its terminal
job at 1100×800 and 390×844. Project actions, including the header's Close
project button, simulation QuickActions and common job controls, also use
flex groups; ordinary standalone Mantine Buttons retain `inline-block`.
The same style check now accepts those two legitimate computed displays and
rejects `inline`, absent elements and unstyled inner wrappers. It returns all
seven named measurements and compares them together, so assertion output shows
the actual failing fields instead of only `false`. Minimum-width, stylesheet,
inner-flex, nonzero-radius and theme-color checks remain required. The
regression still reads computed styles from the real production browser;
its new pure assertion test verifies rejection and terminal diagnostics for
each individual clause, without pretending to measure a rendered component.

The section regression confirms the actual Home action is a direct Group child
with Mantine's inner wrapper. The shared QuickActions regression now renders
a real Mantine Button and checks that same structure and retained wrapping.
No production CSS, theme, control, hidden validation text or accessibility
behavior changed. Native tab traversal, six-section geometry, disabled/conflict
paths, persisted project creation, sentinel preservation, running/terminal
cards, report retrieval and cooperative cleanup remain in the complete browser
journey.

| Acceptance / accumulated finding | Final candidate evidence and remaining authority |
| --- | --- |
| Independent initial assessment before source/history; bounded evidence | Preserved frozen cold assessment and four screenshots. Actual reached matrix remains Home compact/smaller, project Game Model compact and terminal job compact; the complete browser and any outstanding affected visual coverage are controller-owned, not inferred from component tests. |
| `4a58ccd4ec9f8a24`: six-step row clips Bets at 900×700 | Shared wrapping correction retained. Eight section tests preserve all six tabs, drafts, validation/error badges, selected panels and save/open behavior. Saved independent supplementary retest already observed wrapped tabs and native traversal through Bets and back. |
| `285d0e8a87d8b14f`: hidden validation text defeats tab lookup | Scoped tablist/visible-label lookup retained for initial focus and both active-element assertions. Validated section traversal regression passes with accessible `valid` text retained. |
| `90cd84042a8cec88`: aggregate rendered-style rejection | Corrected CSS blockification expectation for both existing helper consumers; every style clause now has measured terminal diagnostics and focused rejection coverage. Complete production-browser confirmation remains pending on the correction SHA. |
| Material findings fixed at shared cause and clean affected rerender | Earlier layout cause and clean independent 900×700 retest preserved. This audit-contract repair does not declare final visual closure; the controller must build the exact committed candidate and execute the complete P910 file using the authenticated frozen receipt. |

Permitted foreground checks:

```sh
npm run test:targeted -- tests/cli/studio-client/src/P910ValeraGraphicDesigner.browser.test.tsx tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.sections.test.tsx tests/cli/studio-client/src/components/common/responsive.test.tsx
npm run typecheck
```

Three suites / 38 tests passed, with one explicit controller-owned rendered
skip because no freeze opt-in was supplied to this worker's test command.
Existing asynchronous Home updates emitted React `act(...)` warnings; there
were no assertion failures. Changed test files are consumed by their Jest
component/workflow lanes and the clone-installed changed-file ESLint commit
hook. Root typecheck includes the Studio compiler once. Production bundle,
packaging, full browser execution and official gates remain controller-owned;
none ran in this implementation worker. Final independent step approval remains
pending and is not replaced by this candidate handoff.

## Downstream browser workflow repair — controller execution pending

Reviewer finding `ccb894ddb9ea1e2d` was traced against clean HEAD
`6607f70aab4b789cecd292adafc2f35c5c28886a`. The scoped Build/Export lookup
required exact `Browse` text, while `PathInput` renders `Browse…`. The lookup
now matches that existing label and retains its visible/enabled filter and
artifact-card scope. No product label or Browse behavior changes.

`ProjectDashboardPage` retains simulation progress and report detail when
switching tabs. `SimulationTab` therefore remounts on Review after completion;
Rounds exists only on Configure. Each viewport iteration now uses the existing
native Tab/Enter activation helper on `simulation-configure` before editing
Rounds. Installed Mantine forwards that identity to the keyboard-accessible
Stepper button and invokes `onStepClick`; its full text includes the step icon,
label and description. Report retention remains unchanged. A new submission
clears the prior terminal receipt before the current job identity is observed.

Reviewed the remaining lookups against Home's creation/validation controls,
the section tablist and visible labels, shell navigation buttons and mobile
inert state, artifact-card identity and output labels, simulation submission
and lifecycle receipts, and common job region/status/Cancel/Download controls.
The production CLI/static asset path and style entry point remain unchanged.
Both viewport iterations, destination conflict/ready checks, sentinel reads,
real running/completed job assertions, report fetches, asset/style/geometry
checks and cooperative cleanup are preserved.

| Acceptance / accumulated finding | Correction evidence and remaining authority |
| --- | --- |
| Independent initial assessment and bounded evidence | Existing frozen observations, transcripts and screenshots remain unchanged; no new collection or gallery. |
| `4a58ccd4ec9f8a24`: clipped section row | Shared wrapping correction and saved independent 900×700 retest retained. |
| `285d0e8a87d8b14f`: validated tab lookup | Scoped visible-label lookup and native arrow navigation retained. |
| Rendered style-contract finding | Blockification correction and all seven diagnostic measurements retained. |
| `ccb894ddb9ea1e2d`: Browse and retained Review assumptions | Actual scoped `Browse…` lookup and explicit native Configure activation precede Rounds in both iterations. |
| Complete browser journey and independent material-finding disposition | Pending controller execution with authenticated frozen observations and current production assets; this handoff does not close P9-VALERA-GRAPHIC or P9-10. |

Permitted foreground check:

```sh
npm run test:targeted -- tests/cli/studio-client/src/P910ValeraGraphicDesigner.browser.test.tsx
```

Five helper checks passed; the single rendered case explicitly skipped without
a controller freeze opt-in. This is not browser execution evidence. Only the
browser test and this current-step document changed. The test is compiled by
its existing ts-jest lane and checked by the changed-file ESLint commit hook;
the production Studio compiler includes only `src`, so no production compiler
or bundle boundary changed. The controller retains the PathInput/simulation
workflow matrix, production build, complete browser run and independent visual
closure. No official gate, packaging, browser rerun or evidence cleanup ran here.

## 2026-10-10 post-freeze candidate execution — audit-source finding

The authenticated retained initial record and its chronological sibling remain
unchanged, byte-for-byte, in this assigned harness at
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-10-6d4568a3c9593b96/frozen-initial/frozen-initial.json`
(`c81a6d71ff48d4be90d1f53b638bafb1e5ac9dab621590f1c1d522a398b27863`) and
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-10-6d4568a3c9593b96/frozen-initial/transcript.json`
(`dbc716121e7392f4bf53baf474eedc86b3d56c0f5d7a4581d4905de86b3e9cd1`). No
screenshots or gallery entries were added.

On candidate `f4e3c948a1b9ec5d4127fc8d2b40b8f694e0164f`, `npm run build-cli`
completed before the one complete required command:

```sh
P910_FROZEN_OBSERVATIONS=<authenticated frozen record> npm run test:targeted -- tests/cli/studio-client/src/P910ValeraGraphicDesigner.browser.test.tsx
```

The real production CLI served the current assets at a fresh local Studio
origin; its fresh browser and isolated runtime reached Home at 1100×800. Five
test cases passed. The rendered case then failed at line 384 before project
creation, Build/Export, or either simulation iteration, so those remaining
workflow rows are not reached on this candidate.

### P9-VALERA-GRAPHIC-02 — P1 required browser-audit false rejection (open)

This is deterministic candidate-owned audit-source failure, not a driver or
product-layout timeout. The failure lists precisely all six valid Home section
tabs. `measure()` at lines 359–384 selects each visible tab button, calls
`Range.selectNodeContents`, and rejects its whole content rectangle when it
extends beyond the button. Each validated tab deliberately contains the
`StatusBadge` `VisuallyHidden` accessible text (`valid`); that nonvisual
accessibility sibling participates in the whole-content range, so the generic
visual-overflow predicate rejects every otherwise rendered tab. The regression
must measure visible label/badge boxes (or exclude visually hidden content)
while retaining the accessibility-name assertion. No product visual defect is
claimed from this source-level rejection.

The candidate-bound harness receipts are runtime-only:
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-10-6d4568a3c9593b96/post-freeze-run.json`
and `post-freeze-result.json` (exit `1`, no signal). The run used no additional
Studio launch and retained no generated project/output tree.

## Visible-content geometry repair — controller rendered confirmation pending

Finding `0f8d50097d40f6a7` was traced on clean HEAD
`5498766e7ca13cd4a3cbc785a233883a2277d671`. Read the supplied frozen initial
record, chronological transcript and both post-freeze receipts. The initial
record and transcript still match the hashes recorded above; the run receipt
hash is `331f3026ad632c029e274d51674a0345db9ad4121661cdf36bd26f8c1ef99a69`
and the failed result hash is
`c026fc59bca451ec7c49007ea0755486cb921504a0b2f859527ce6f521f74c1d`.
All prior observations, screenshots and completed-step evidence remain intact.

The current audit still selected each entire visible button with a Range.
Home → guided BlueprintEditorPage → SectionedFormEditor supplies StatusBadge
as each tab's right section. Its visible success icon is accompanied by a
Mantine VisuallyHidden sibling containing `valid`. The installed stylesheet
clips that absolutely positioned sibling to zero, but Range geometry includes
its text. This traces the saved six-tab rejection without launching another
browser or treating it as a product-layout finding.

`visibleContentGeometry.ts` now supplies the audit's self-contained geometry
function, serialized into the real DevTools evaluation. It excludes
VisuallyHidden and CSS-hidden subtrees, checks visible descendant boxes and
individual text-line rectangles against all four control bounds, and retains
decorative `aria-hidden` icons/counts in the measurement. Neither accessibility
text nor product presentation changes. The browser additionally waits for all
six tabs' accessible validation text; the component contract verifies their
actual accessible names before and after measurement.

Audited every `measure()` consumer: Home basics at 1100×800, 900×700 and
390×844; the selected Bets form at 900×700; Build/Export conflict and recovered
ready states; running and completed common job cards at both workflow widths.
Document overflow, owning-tablist containment, clipping ancestors, native
keyboard/focus assertions, persisted project creation, destination sentinel
preservation, retained-report recovery, report retrieval and cleanup remain
in the same production-browser journey.

| Whole-step requirement / accumulated finding | Correction evidence and remaining authority |
| --- | --- |
| Independent cold judgment of real Home, project/model/build and job states on compact/smaller viewports | Supplied frozen observations and chronology preserved. Source-aware checks do not replace this visual judgment. |
| `4a58ccd4ec9f8a24`: Bets overflow | Shared wrapping correction, exact six-section regression and recorded clean 900×700 supplementary visual retest retained. |
| `285d0e8a87d8b14f`: validated tab lookup | Scoped visible-label lookup and native traversal retained; complete eight-test section suite passes with accessible status text present. |
| Earlier rendered-style rejection | Both legitimate computed Button displays and seven diagnostic style clauses retained; complete audit helper checks pass. |
| `ccb894ddb9ea1e2d`: Browse and retained Simulation Review | Scoped `Browse…` and native `simulation-configure` activation remain before destination recovery and Rounds, including the second iteration. |
| `0f8d50097d40f6a7`: hidden status geometry | Shared audit measurement excludes nonvisual subtrees while checking visible labels/badges. Six new contract cases cover all six actual validated tabs, accessible names, overflowing decorative badges, glyph overflow for every measured content category, wrapped lines and all four bounds. |
| Clean production rerender and no unresolved material finding | Full post-freeze browser execution and independent disposition remain controller-owned and pending on this correction SHA. The saved failed run's unreached project/build/simulation rows are not claimed as passes. |
| Bounded immutable evidence | No screenshot, replacement transcript, gallery or evidence cleanup added. |

Permitted foreground checks passed:

```sh
npm run test:targeted -- tests/cli/studio-client/src/visibleContentGeometry.test.tsx tests/cli/studio-client/src/P910ValeraGraphicDesigner.browser.test.tsx tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.sections.test.tsx
npm run typecheck
```

Three suites / 19 tests passed, with one explicit rendered skip because no
controller freeze opt-in was supplied. Existing section-suite asynchronous Home
updates emitted React `act(...)` warnings. Two earlier runs exposed new jsdom
fixture errors (unavailable DOMRect constructor and recursively replaced Range
factory); both were corrected before the final green run. Supplied rectangles
test the selection/rejection contract, not actual rendered visual quality.
Root typecheck exited zero and invoked the Studio compiler once. Changed test
code is consumed by the existing ts-jest lanes and the changed-file ESLint
commit hook; no production source or bundle input changed. Production builds,
independent browser execution, packaging and official gates were not run here.

## Convergence correction — native focus observation, controller closure pending

Read the saved finding on HEAD `16a75f80927963a831b459064b5de40aff7c7c7d`
and the complete supplied frozen record and transcript. Their SHA-256 values
remain `71c30329d173a999b17b16fb43314260864bd76ff2bed3aa04fb11145bb0d37b`
and `4dfde7c64da45db2a689e99d87412e41db638936b79941fbf5d179445c975d46`.
The transcript records an enabled Create game at x=276, y=228.28125,
139×36px (rounded), followed by actual saved-project creation. It contradicts
classifying that control as intrinsically unreachable. The saved required run
instead exhausted the candidate helper's 100 attempts at 900×700, with focus
in Game id. No new browser observation or visual verdict is claimed here.

Tracing the exact current-HEAD path reaches the six-section arrow traversal,
its return to Game basics, then `focus(button("Create game"))`. The helper
immediately resolves every non-target observation without a rendering frame,
always sends forward Tab, and only waits for rendering when it happens to see
the target already focused. Create game precedes Game basics in DOM order.
This can exhaust its attempt count while searching through unrelated controls
without settled observations. Its clipped-target recovery also sends forward
and reverse Tab without observing the intervening render.

The same focus path now uses `nativeKeyboardFocus.ts`: every observation waits
for two rendering frames, resolves the current target anew, and reads focus and
bounds together. Native Shift+Tab seeks preceding controls; native Tab seeks
following controls. Resize recovery observes the intervening render before
re-entering the focused control. Positive dimensions, four viewport bounds
(the same 1px tolerance as the other geometry checks), the bounded failure,
`:focus-visible`, and native Enter activation remain required. There are no
DOM focus/scroll calls, pointer bypasses or disabled-control activations.

| Whole-step requirement / accumulated finding | Final source contract and closure authority |
| --- | --- |
| Cold Home, project/model/build and job assessment at compact/smaller widths | The original and latest authenticated freezes, chronology and bounded screenshots remain unchanged. The latest collector actually created the project and inspected Build/Export and a completed project-open card; these observations are not substituted for the required scripted running/completed simulations. |
| `4a58ccd4ec9f8a24`: clipped Bets at 900px | Existing shared wrapping fix and recorded affected clean visual retest retained. The browser requires exactly six contained tabs, multiple rows at 900px/phone width, native traversal to Bets and back, and measured visible content. |
| `285d0e8a87d8b14f`: validated tab selectors | The Game design sections tablist and each `.mantine-Tabs-tabLabel` identify the actual tab. All six accessible `valid` names remain asserted; the new native regression traverses each actual Mantine tab and returns to Create game without removing StatusBadge text. |
| Earlier computed-style rejection | All seven named asset/style clauses and both valid computed Button displays remain required. |
| `ccb894ddb9ea1e2d`: Browse and retained Review | Build scope is the actual `artifact-build-tsPackage` control's owning artifact-build form. PathInput renders `Browse…`; its label associates Output directory with the input through `htmlFor`. Simulation's stable `simulation-configure` is activated before Rounds in both iterations. On remount, SimulationTab derives Review from retained report state; native Configure restores the real form. |
| `0f8d50097d40f6a7`: nonvisual status geometry | The existing self-contained visible-content measurement still excludes VisuallyHidden subtrees while measuring visible boxes and individual text lines, including decorative badges. Document overflow, clipping ancestors, validation labels and tab containment checks remain. |
| `c73df4a0d712e3b9`: Create game focus rejection | One shared audit focus path observes every seek after rendering, chooses native direction from actual DOM order, and settles resize re-entry. Ten focused tests cover serialization through a separate VM context, delayed seeks, the exact six validated tabs, Create activation, resize re-entry, all four clipped bounds, zero dimensions and missing/disabled controls. Supplied rectangles test the helper contract, not visual quality. |
| Saved creation, occupied destination and recovery | Create remains the actual enabled native Button invoking managed save/open. The production journey still requires the Overview route, an existing project under its isolated Documents root, disabled Build with associated invalid input, unchanged sentinel bytes, and a new ready destination. Neither the focus correction nor tests manufacture these outcomes. |
| Both real simulations and report retrieval | Configure → labelled Rounds → Run Simulation remains native keyboard activation. `useSimulationPoll.run` clears the prior terminal receipt before attaching the new job. Each running identity must match the actual simulation region's accessible label; Cancel is scoped to that region. The same region must contain a completed JobResultCard before its actual Download anchor is focused and its nonempty report fetched. These selectors match JobCard, JobProgressCard, JobResultCard and StudioSimulationService; retained results are preserved. |
| Candidate/assets, cleanup and screenshot budget | Existing fresh-asset and served-byte checks, owned job cancellation/drain, cooperative browser/Studio cleanup and removal of only the owned temporary root remain. No screenshot, transcript, checkpoint, replacement freeze or evidence cleanup was added. |
| Complete P910 execution and independent material-finding disposition | Still mandatory and controller-owned on the committed correction. This worker did not run the post-freeze file, count skipped rendered cases as closure, rebuild production assets or claim unreached workflow rows passed. Final roadmap closeout remains pending that execution and independent visual disposition. |

Permitted foreground checks passed:

```sh
npm run test:targeted -- tests/cli/studio-client/src/nativeKeyboardFocus.test.tsx
npm run typecheck
```

The targeted suite passed all 10 cases without skips. Root typecheck passed,
including the Studio compiler once. Changed audit/helper files are consumed by
the controller's complete Node-environment P910 Jest run, the new component
contract suite, and the changed-file ESLint commit hook. No production source
or generated barrel changed; production builds, packaging, the saved full
verification matrix and official gates remain controller-owned.

## 2026-10-10 independent cold collection and post-freeze result — finding

This is the current candidate-bound record, not a restatement of the historical
sections above. The independent collector first froze its own rendered
observations, then read the post-freeze hand-off. The verified candidate and
HEAD were both `d89c3307be5eb97c2cf0763bc19551b55818c133`.

| Item | Current evidence |
| --- | --- |
| Frozen initial observation | `/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-10-db34e91dd96c06e0/frozen-initial.json` — SHA-256 `8b8e6f4ac928f885d982fdbf2b0ec644d61807e7ed972f3505d3418349d1f31e` |
| Chronological transcript | `/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-10-db34e91dd96c06e0/transcript.json` — SHA-256 `6bb362f677eb91e4e9518897c537c3ba11b5a8c807af22ae20f683cbb25c20d0` |
| Collection | Fresh interactive application and browser profiles, 2026-10-10T03:22:29.150Z–03:25:01.563Z; Home, saved project, completed `project-open-materialization` card, Build/Export, and Game Model at 1439×956 and 1024×700 |
| Screenshots (runtime only) | `1-observation.png` `eb1833d3d73ca8c1943e48263cb15db301b741ffc3b254aa93967ca1668389c4`; `2-observation.png` `7ff5f3ee1c4f4f4345eb29113c6945f2be5ccee78cc1548e65289f5361a5d839`; `3-observation.png` `6241d723284de72e704dd94c6be78c5800cc4c57bf61935a69e167ed5bd3dbf2` |

The frozen initial assessment found a P1 professional-finish concern in the
shared Build/Export information hierarchy: it is a 4062px continuous desktop
stack and grows to 4526px at 1024×700, repeating raw absolute paths,
prerequisite tokens, technical copy and visually indistinguishable actions.
No horizontal clipping was observed at 1024px. Home was otherwise readable and
the Game Model’s named sections were more scannable. The real creation flow was
correlated as ready validated form → disabled/loading `Create game` with saving
copy → saved Overview → completed `project-open-materialization` card.

Post-freeze, the required complete command was run with the frozen receipt:

```sh
P910_FROZEN_OBSERVATIONS=<frozen-initial.json> npm run test:targeted -- tests/cli/studio-client/src/P910ValeraGraphicDesigner.browser.test.tsx
```

It failed deterministically in the candidate-owned browser-audit at rendered
Home 390×844. The source test’s geometry assertion reported `overflow: true`
and four offending rendered controls, including `#blueprint-create-game`, a
default button, a validated tab and a primary button. Its rendered diagnostic
recorded the active `Create game` button and its `x=218.5`, `width=138.734375`
rectangle before rejection. This is a synchronous local terminal rejection of
the candidate audit selector/geometry contract, not a driver timeout or a
product-action lifecycle failure.

Finding: **P9-VALERA-GRAPHIC (P1)**. Root cause: the current P910 browser audit
classifies four visible Home controls as overflowed at its 390×844 measurement,
so the mandatory candidate-owned rendered regression cannot establish the
required smaller-viewport closure. Product code and tests were not modified by
this verifier. The correction lane must repair the shared responsive layout or
the candidate audit’s exact geometry contract, then rerun the affected rendered
surface from clean state.


## P9-10 convergence repair — build hierarchy and immediate responsive layout

This append records a product correction, not an independent visual disposition.
The saved freeze and transcript were read before editing. Their SHA-256 values
remain `8b8e6f4ac928f885d982fdbf2b0ec644d61807e7ed972f3505d3418349d1f31e`
and `6bb362f677eb91e4e9518897c537c3ba11b5a8c807af22ae20f683cbb25c20d0`.
No frozen observation, screenshot, transcript or completed-step artifact was
rewritten, pruned or replaced. The three-image collection remains unchanged.

Current-HEAD tracing reproduced the structural cause of the frozen Build/Export
finding: `GROUP_ORDER` placed advanced generation first, every `TargetCard`
rendered its full form, and each artifact preview repeated target, selected and
resolved paths, destination kind, status and conversion steps at the same level.
`ProjectDashboardPage` is the single public caller; legacy Deployment and Stake
routes resolve to that same surface. Target support and conversion planning
still come from `describeArtifactBuildTargetCards`, the server registry and its
preview/build endpoints. Disclosure does not create a second writer or resolver.

Build artifacts now come first. The first supported output opens initially;
other named outputs, remote delivery and optional advanced generation have
compact, keyboard-operated Configure controls with `aria-expanded` and a
mounted controlled region. Each choice shows availability/activity, and all
unavailable reasons remain visible. Expanding a choice reveals its actual form.
Collapsed forms retain destinations, generation choices and terminal receipts;
running/recovered work opens its owning form, and running forms cannot be hidden.
The original Build, Browse…, Cancel, resume, delivery and output actions retain
their handlers and safety conditions. Readiness, the real resolved destination,
conflicts, complexity warnings and conversion losses remain in the open form;
prerequisite tokens and detailed plans/provenance use technical disclosures.

Tracing the exact 390×844 failure also found a resize race: Mantine's installed
AppShell stylesheet transitions main padding for 200ms, while P910 resizes and
measures after two rendering frames. The recorded Create game x=218.5 lies
between the desktop column's x=276 and the phone column's x=16. This is consistent
with the old rail padding still being interpolated during measurement; this
source diagnosis is not a new rendered observation. The shared main column now
resizes immediately. Its phone top padding also retains the fixed header offset.
The shared PathInput field can shrink and its picker actions wrap, preserving
labels, field associations, blur/change behavior and native/server picker paths.
Callers include Home/Projects, Blueprint load/save/build/import/export and symbol
assets, Build/Export, Certification, Fairness and the filesystem browser. No
callback, resolver, request default or publication policy changed.

P910 retains the real visible-content, clipping-ancestor and document-overflow
assertions; no tolerance or accessibility exclusion was relaxed. It additionally
requires immediate main layout and phone header clearance, natively expands the
actual TypeScript output choice if necessary, and measures the full choice
surface before its existing occupied-destination journey. All remaining button,
section-tab, input-label, simulation-step, job-region and report selectors were
traced against their production controls. No observations were invented to run
this controller-owned file.

| Acceptance / accumulated finding | Candidate contract and remaining authoritative evidence |
| --- | --- |
| Cold assessment of Home, one project/model/build form and job state at compact/smaller sizes | Existing authenticated cold freeze and completed-operation observations preserved. Independent affected clean retest/disposition remains pending on the correction SHA. |
| `4a58ccd4ec9f8a24`: six-step row overflow | Shared wrapping remains; P910 still requires six named contained tabs, multiple rows at 900px/390px and native traversal to Bets and back. |
| `285d0e8a87d8b14f`: validated-tab selection | Label-scoped lookup and all six accessible `valid` status assertions remain. Section and geometry contract suites retain those checks. |
| `ccb894ddb9ea1e2d`: Browse and retained Simulation Review | Scoped Browse… remains; native `simulation-configure` activation precedes labelled Rounds in both iterations. Prior report state is retained. |
| `0f8d50097d40f6a7`: hidden accessible text geometry | Existing shared visible-content measurement excludes only nonvisual subtrees and still rejects visible glyph/badge overflow on all four bounds. |
| `c73df4a0d712e3b9`: enabled Create game focus | Settled native focus observations, direction from DOM order, resize re-entry, focus-visible and bounded rejection remain. No DOM focus/click bypass was added to P910. |
| `ac68b14a95dcdcd2`: Build/Export hierarchy | One initially open artifact form, explicit named output disclosures, activity summaries, primary build group first, and technical plan disclosure correct the shared source cause. Component regressions cover native disclosure activation, retained input identity/value and no implicit writes; existing tests exercise each artifact writer, conflict/cancel, generation/resume and remote compatibility/publication. Visual approval still requires independent affected rerender. |
| `ac68b14a95dcdcd2`: phone geometry rejection | Main padding interpolation removed, phone header clearance retained, path field/actions can reflow. Existing visible-content/overflow assertions remain and new immediate-layout assertions diagnose a stale or incorrect production stylesheet. Complete current-asset rendered execution remains mandatory. |
| Saved creation, occupied sentinel, recovery, both simulation iterations and report | The complete P910 path still creates/opens an on-disk managed project, checks disabled Build and associated invalid field, preserves sentinel bytes, restores a ready destination, measures each actual running/completed simulation identity and fetches its nonempty report. No source-aware test or unreached record is claimed as rendered closure. |
| Candidate/assets, native navigation and owned-process cleanup | Existing recursive freshness and served-byte checks, native Tab/Enter navigation, owned-job cancellation/drain and browser/Studio cooperative cleanup remain. No new screenshots or independent collector were started. |
| No unresolved P0/P1/material P2; bounded clean retest | Controller-owned complete post-freeze P910 execution and independent visual disposition remain pending. This implementation handoff does not close the roadmap step. |

Consuming boundaries are the Studio TypeScript compiler (included once by root
`npm run typecheck`), production Vite/CSS bundling via controller-owned
`npm run build-cli`, the component/workflow Jest lanes, complete Node-environment
P910 execution and the installed changed-TypeScript ESLint commit hook. No build,
packaging, official gate or independent browser rerun ran in this worker.


Permitted foreground verification for this correction:

```sh
npm run test:targeted -- tests/cli/studio-client/src/components/project/ProjectDashboardPage.exportDeploy.test.tsx tests/cli/studio-client/src/components/common/PathInput.test.tsx tests/cli/studio-client/src/components/common/responsive.test.tsx tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.sections.test.tsx tests/cli/studio-client/src/nativeKeyboardFocus.test.tsx tests/cli/studio-client/src/visibleContentGeometry.test.tsx
npm run typecheck
```

The final targeted run passed all six suites / 141 tests, with no skips.
Existing section-suite asynchronous Home updates still emit React `act(...)`
warnings. Initial runs failed six stale status-label assertions and then one new
fixture which selected a generator-backed target as an artifact; those test
contracts were corrected, and the complete focused set reran successfully.
No skipped rendered case is counted: the post-freeze P910 file was not run here.

Final root `npm run typecheck` exited zero and included the Studio compiler.

The first commit attempt was rejected by the installed ESLint hook for nested
ternaries/indentation in the new presentation logic. These were replaced with
explicit branches; the hook remains enabled for the retry.


## Disclosure migration review correction

Review fingerprint: `ae1a1cd6af46fe4a`; base candidate:
`be3c9b9326d9b02039992787a17b8782a3c5f510`.
The saved review was traced against this source before editing. A matching
boolean hid consecutive retained requests behind a manually collapsed form;
remote `runError` was absent from operation/summary classification. The
ordinary workflow consumers and maintained packed runner also accessed forms
before their new public Configure controls were activated.

| Accumulated requirement | Candidate correction / remaining verification |
| --- | --- |
| Frozen 900px editor overflow | Existing shared tab wrapping and responsive layout corrections retained. Independent affected visual disposition remains pending. |
| Validated Game basics / Bets lookup | Existing tablist-scoped visible-label selectors retained, including native keyboard assertions. Complete P910 execution pending. |
| Browse and retained Simulation Review | Existing scoped Browse… selector and explicit native Simulation Configure activation retained. Complete P910 execution pending. |
| Hidden status-text geometry and native Create game focus | Existing visible-text geometry and keyboard focus helpers retained. Complete P910 execution pending. |
| Repeated recovery and user-controlled collapse | Owning cards receive the immutable request identity; recovery and operation opening effects are separate. Artifact, generator and remote cases select two retained same-target jobs, collapse between requests, restore the selected fields/options and assert zero submissions. Unrelated destination updates leave the collapsed form closed. |
| Remote rejection and explicit retry | Transport errors contribute to Needs attention and operation handling. Both compatibility and publication rejection cases preserve a visible collapsed summary, then verify explicit recheck, duplicate-submit prevention, Running, Compatible and Published states. Recovery reconstruction uses stable deployment dependencies so ordinary run updates do not clear the result. |
| Ordinary workflow consumers | Library durability, PC18 generator/Stake and PC14 remote/Stake/PAR use public disclosure controls. PC14 scopes Stake to its existing lifecycle card. Original publication, conflict, remount and provenance assertions remain. Library teardown now unmounts before server shutdown; mounted pollers previously caused its cleanup hook to time out and contaminated the following case. |
| Packed generator / PAR preparation | One helper opens each named disclosure through the existing native keyboard activation boundary before preparation. Real Chromium fixture coverage verifies trusted activation and rejects missing, hidden, unreachable and unrevealed forms; already-open forms are retained. Existing preflight, form-field and visibility checks remain. |
| Immutable observation and full visual acceptance | Earlier document content, frozen observations, screenshots, transcripts and completed-step evidence are unchanged. No replacement collection, production build, packaging, broad P8 campaign or official gate ran. Full current-asset P910 execution and independent visual closure remain pending for the controller. |

Permitted focused checks (whole files):

```sh
npm run test:targeted -- tests/cli/studio-client/src/components/project/ProjectDashboardPage.exportDeploy.test.tsx tests/cli/studio-client/src/components/project/ProjectDashboardPage.libraryDurability.test.tsx tests/scripts/p8-05-valera-devtools-events.test.mjs
npm run test:targeted -- tests/cli/studio-client/src/components/project/ProjectDashboardPage.libraryDurability.test.tsx
npm run typecheck
```

Export/Deploy passed 59 tests and native runner helpers passed 17 tests in the
combined run. Library durability initially failed its mounted-poller cleanup;
after explicit cleanup, its complete file passed both substantive cases.
Initial new assertion failures were corrected to open Advanced generation
controls and expect classified transport copy. React asynchronous update
warnings remain visible in the output. The controller retains independent
execution of the complete reviewer matrix, including PC14 and PC18; this worker
does not claim those two suites or rendered visual acceptance passed.
The standalone Studio typecheck was rejected before execution by the bounded
command policy; the permitted root typecheck includes that compiler.

Root `npm run typecheck` exited zero, including the Studio compiler.

The first correction commit attempt was rejected by the required ESLint hook
for a promise brace style error and warned about the recovery dependency
expression. Explicit stable deployment aliases and multiline braces corrected
these. The final Export/Deploy whole-file rerun passed 59 tests and the final
root typecheck exited zero. The commit hook remains enabled.

## Retained PC14 / PC18 gate regression correction

The complete saved failing set was reproduced together on `3da941df` through
`npm run test:targeted`. PC14 published the recovered PAR workbook but then
waited for Home while the public Close project confirmation remained open.
PC18 timed out during server shutdown with its dashboard still mounted.

PC14 now waits for either the Home route or the visible confirmation, activates
the dialog's public Confirm control when required, and retains the final Home
route assertion before continuing PAR import. Both suites unmount their UI
before stopping Studio so mounted job observers cannot keep shutdown requests
alive. No timeout, visibility check, disclosure activation, publication,
conflict, remount or provenance assertion was removed or relaxed.

The final foreground run exited zero: two suites / three tests, no skips:

```sh
npm run test:targeted -- tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/studio-client/src/Pc14StudioUiInteroperability.test.tsx
```

React asynchronous-update and duplicate Certification evidence key warnings
remain visible. Only the saved failing files were executed; the controller
retains the complete reviewer matrix. Existing request-identity recovery,
remote Needs attention / retry handling, native generator/PAR runner preparation,
tab wrapping, visible-content geometry and native keyboard corrections remain
unchanged. Frozen observations, screenshots, transcripts and completed-step
evidence were preserved. Complete current-asset P910 execution and independent
visual disposition remain pending for the controller; no production build,
packaging, official gate, broad P8 campaign or replacement collection ran.

`npm run typecheck` also exited zero, including the Studio compiler once.
Changed tests consume the existing Jest workflow boundary and required
changed-TypeScript ESLint hook; no production bundling input changed.

## 2026-10-10 controller-owned P9-10 rendered verification — passed

This final bounded rerun is for product candidate
`589e30d024b528abc955cf54e4738259b08eca29`. The current evidence-only HEAD
is its clean descendant and changes only this document; the frozen collector
candidate `d89c3307be5eb97c2cf0763bc19551b55818c133` is an ancestor. The
independent cold record was preserved byte-for-byte in the assigned harness,
not replaced:

| Retained record | Absolute locator and SHA-256 |
| --- | --- |
| Frozen initial observations | `/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-10-db34e91dd96c06e0/frozen-initial.json` — `8b8e6f4ac928f885d982fdbf2b0ec644d61807e7ed972f3505d3418349d1f31e` |
| Chronological transcript | `/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-10-db34e91dd96c06e0/transcript.json` — `6bb362f677eb91e4e9518897c537c3ba11b5a8c807af22ae20f683cbb25c20d0` |

`npm run build-cli` prepared the candidate production assets once. The served
CLI entry SHA-256 was `ed89a858789e02acbfc66d0fb4a950f0a48678ac9ee530f399d43fc9f9103c83`;
its Studio index SHA-256 was
`d1a8386be7ebbf3673f7cad6d0e39a6a3979c25013a8f493d39b972afa3d6932`.
The candidate-bound harness then ran exactly the complete P910 file with the
authenticated frozen path from `2026-10-10T04:39:19.101Z` through
`2026-10-10T04:39:58.887Z`; its result was exit `0` and no signal:
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-10-db34e91dd96c06e0/post-freeze-run.json`
and sibling `post-freeze-result.json` (SHA-256
`b327724c72b06b6cf82194c391cc777ed1156f2809a94974dc846d4f2756fd9d` and
`36fc3464b2dd7b0a34131c313f3dbbc4bc3b67037ac2b73f534c1f5a941206f0`).

The complete rendered case therefore reached native validated-tab traversal
and resize checks on Home (1100×800, 900×700 and 390×844), saved-project
creation, Build/Export's occupied sentinel validation and ready-destination
recovery, both 500000-round Simulation Configure iterations, the action-local
Running and Completed cards, and nonempty report retrieval. It also checked
the compact and smaller Build forms/card surfaces for visible-control,
ancestor-clipping and document-width overflow. The test's `finally` block
cancelled/drained any owned live jobs, closed Chromium and Studio, and removed
its isolated fixture root; exit zero confirms that cleanup completed. No new
screenshots were retained, so the existing three-image bounded collection is
unchanged.

The pre-correction frozen P1 hierarchy/phone-layout concern is closed by this
fresh current-asset rerender: no P0, P1 or material P2 remained in the reached
Home, project/model/build or job-card presentation. This conclusion is limited
to the required P9-10 matrix and does not recast older historical findings as
current failures.

## 2026-10-10 evidence-locator cleanup

The retained frozen initial record and its sibling chronological transcript were
verified byte-for-byte by their SHA-256 values above. Their runtime payloads
remain preserved; this evidence-only cleanup removes superseded, non-authorized
Git-document locators rather than deleting or replacing those records.

The preceding reassessment remains incomplete: a repaired driver must still
reach the rendered `project-open-materialization` card, then collect the clean
Build/Export and 900px affected visual observations. No product error, visual
regression, screenshot, or new material disposition is claimed by this cleanup.

## 2026-10-10 independent affected visual reassessment — passed

Product identity remains `e0ca3eab465db602b48e210a1288f97aab46ffa5`; the
evidence commit is its clean descendant. The retained cold-start freeze was
read before this retest and remains byte-identical:

| Record | Absolute path | SHA-256 |
| --- | --- | --- |
| Frozen initial observations | `/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-10-50970d93eae15a30/run-2026-10-10T02-51-24-054Z/frozen-initial.json` | `71c30329d173a999b17b16fb43314260864bd76ff2bed3aa04fb11145bb0d37b` |
| Chronological initial transcript | `/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-10-50970d93eae15a30/run-2026-10-10T02-51-24-054Z/transcript.json` | `4dfde7c64da45db2a689e99d87412e41db638936b79941fbf5d179445c975d46` |
| Fresh affected retest transcript | `/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-10-614bfb8c7db80194/retest-2026-10-10T05-20-42-946Z/transcript.json` | `e0a1bf90ed4e501811e91a95a368aa08f883cb56b7f2cbbae275d7c1ac932c9b` |

The fresh run used separate Studio config and Documents roots and a separate
browser profile, then drove the candidate CLI with `node ./dist/cli/pokie.js
--no-open`. It assessed Home and the saved-project Build/Export surface at
1439×869 and 900×700; it created the project through the visible `Create game`
control and ran the visible Simulation flow once. The action-local simulation
state went from enabled `Run Simulation`, through its rendered queued/running
state, to `Simulation completed — 500000/500000 rounds`; its same operation
card then reported `simulation · Completed` in 6652ms.

The independent visual disposition is that the frozen Build/Export hierarchy
P1 is closed on this candidate. At both sizes, the page puts its ready status
and short purpose before the output choices; the initially open TypeScript
package form keeps destination, readiness and Build together, while secondary
targets remain compact disclosures. Borders and spacing separate the technical
groups without turning the page into a wall of equal-weight controls. Labels,
status wording and controls stayed readable and consistent. At 900px the
document client width was 885px with no horizontal overflow, and the retained
representative screenshot is
`build-export-900x700-affected-retest.png` (`24caced01d58379590b2870e4f72333c7e2882d092f0854234f140057ccf17d1`,
105376 bytes), beside that retest transcript.

The affected Home form also has no remaining responsive clipping: at 900px the
six visible steps ended with `Bets` at x=780.484375, right=853.5, within the
885px client width and 900px viewport. The compact Home retained clear left
navigation, explanatory copy, primary creation control, type hierarchy and
labeled fields. The previous harness expected two tab rows and stopped when
this now-contained one-row presentation was observed; that was a driver
assertion error, not a product failure. One new representative screenshot was
retained; no gallery or generated project/output payload was committed.

Conclusion: actual rendered observations cover hierarchy, density, typography,
spacing, controls and status consistency on Home, the project Build/Export
form and a terminal job card. No P0, P1 or material P2 remains in this affected
matrix. This is a visual disposition based on the recorded surfaces, not an
automated-execution-only approval.
