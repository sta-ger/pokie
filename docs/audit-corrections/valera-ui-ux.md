# P9-09 — bounded progress and recovery UX

Immutable brief: `355aa50fe127a2d93a65c4a7251cf52f10d1a0b5104f1c9281104fa4bfe106f2`.
Candidate identity is the commit containing this document; the controller must
record its full SHA and the identities of the served production assets with
collection. This is an implementation handoff, **not a completed UX audit**.

## Independent collection — pending

The controller/verifier owns the fresh-profile, source-blind initial observation,
its frozen questions, transcript, up to three screenshots, and clean affected
retests. No P9-09 browser observations, user reactions, screenshots, or clean
browser passes are claimed here. Prior-step evidence is unchanged and cannot
substitute for this journey. No saved P9-09 verifier findings were supplied to
this implementation iteration.

Give the observer only this neutral task, before source review or any scripted
regression:

> Create or open a small game. Run a short real operation long enough to observe
> its progress. Reload or reconnect, decide whether to cancel or let it finish,
> and find its result. Visit another small project, close and reopen the first,
> and recover from a build destination that already contains files. Use the
> keyboard as well as your ordinary controls, and repeat the affected parts at
> a smaller window size. Say whenever you wonder what is happening or whether
> your work has disappeared.

Target initial exploration: 20 minutes. Use a fresh browser profile, Documents
managed-project directory, registry/config/data roots, job store, runtime cache,
and fixture workspace. Use actual execution with one worker, a bounded job
rather than artificial progress or a million-round workload. Record exact
compact and smaller viewport dimensions; proposed regression dimensions are
1100 × 800 and 390 × 844, not yet observed dimensions.

Freeze the chronological observations and every question/reaction before source
inspection. Record candidate SHA, actual submitted request and durable job ID,
reload/reattach identity, terminal status, report/output access, project identities,
confirmation acceptance/decline, and occupied-destination sentinel bytes. For
actual findings, record severity, reaction, reproduction, affected surface,
correction, and clean affected retest. Every P0/P1/material P2 remains open until
its corrected public action reaches the truthful terminal result independently.
The absence of observations is pending evidence, not a clean finding list.

| Required evidence | Current state |
| --- | --- |
| Candidate and served-asset identity | Controller records at collection |
| Frozen initial questions and observations | Pending controller collection |
| One chronological transcript | Pending; link and hash to be added after collection |
| At most three representative screenshots | Pending; links and hashes to be added after collection |
| Real progress, reload/reattach, terminal and retained result | Browser evidence pending |
| Project switch/close/reopen and declined transition | Browser evidence pending |
| Occupied bytes preserved and alternate publication | Browser evidence pending |
| Keyboard, confirmation focus and geometry at two widths | Browser evidence pending |
| Findings and clean affected retests | Pending initial observation; no audit closeout claim |

## Source-informed corrections and focused closure

These are implementation findings, not the observer's frozen reactions.

| Risk in the supplied preflight | Correction and focused evidence |
| --- | --- |
| Discovery errors erased known records; a failed poll stopped observation | Project and Home adapters share `useDurableJobs`, retaining known records, showing connection loss, retrying observation, and exposing explicit reattachment without submitting work. Hook regressions cover initial discovery failure, later list/detail failures, incomplete lists, recovery, and unmount cleanup. Requests have a 10-second abort boundary. |
| A mounted dashboard did not discover operations started later | Discovery continues while mounted, including when no active IDs were initially known. Tab navigation explicitly refreshes discovery. The dashboard regression starts a new simulation after mount and finds its same-ID common history and report outside Simulation. |
| Common cancel/recover errors were silent and cancellation could be activated twice | Control failures remain visible independently of connection recovery. Per-job pending guards prevent duplicate activation and invalidate older observations. Cards distinguish sending intent from accepted cancellation and explain cleanup. Hook tests cover rejection, successful retry, delayed running responses, and terminal retention. |
| Source/project changes could receive delayed old responses | Scope ownership invalidates list, detail, cancel and recover responses. Project alias support remains server-scoped. Home tests include a delayed old-source failure and cancel response after changing source. Cleanup aborts owned requests and timers. |
| Monotonic terminal handling could obscure checkpoint resume | A resumed execution may reuse its ID with a later creation time. Discovery accepts that new incarnation and rejects the older one; same-status snapshots can refine recovery metadata. Both hook suites cover this boundary. |
| Simulation polling stopped after a transport error | Poll errors now preserve job identity, display a connection diagnostic in every Simulation step, and retry observation; successful reattachment clears only the obsolete connection diagnostic. Poll deadlines and request/timer cleanup are owned by the hook. No POST is made by reattachment. |
| A run finishing during reload or reopening was not restored as a readable workflow result | The latest retained simulation, including terminals, is restored from common discovery. Completed reports are fetched through the existing report API and remain linked from common history. Cancelled/failed/recovery-required statuses keep their existing distinct service contracts. |
| Completion/context refresh could change the selected task or strand focus | Report preparation no longer navigates away from a different selected tab. Dashboard refresh preserves focus on live controls. Simulation replacement and common active-to-terminal cards retain a keyboard reading position only when the previously focused control disappears. Focus regressions cover cancellation, common-card replacement, and completion while another dashboard control is focused. |
| Build conflicts lacked field association | Design Build Package and project Build/Export expose destination conflicts through their own PathInput error associations. Editing a Design destination clears obsolete preview/failure messages. Existing current-preview and execution-time occupancy checks stay in their original publication paths. Corresponding component and real HTTP destination tests cover the disabled/conflict and alternate-publication paths, including sentinel preservation and the preview/build race. |

The shared hook's consumers are Home retained source work and project common
history. Their list/detail/cancel/recover endpoints remain distinct. Simulation
has one feature-owned submission and cancellation projection; common simulation
Cancel uses that same feature hook when attached. Build/Export's separate
Outcome Library feature presentation remains separate from common retained
history. No server constructor, execution default, publication helper, CLI sim
or build contract, generated barrel, or library export was changed. Existing
service/HTTP tests supply the real executor, durable storage, cancellation
cleanup and destination-protection boundary; no second lifecycle framework was
introduced.

Existing mobile navigation retains native activation, expanded state, inert
hidden navigation, Escape dismissal and focus return. Existing local wrapping
and scroll boundaries remain in place. Their focused tests are regression
coverage, not proof of rendered browser geometry. Technical operation names,
units, disabled explanations, draft-versus-saved state, and error clarity must
still be assessed by the independent observer.

## Controller-owned browser regression — pending execution

`tests/cli/studio-client/src/P909ValeraRecovery.browser.test.tsx` is prepared for
the controller to run **after** initial observations are frozen. Supply
`P909_FROZEN_OBSERVATIONS` with the frozen observation file and optionally
`P909_CHROMIUM_BINARY` with Chromium's executable. Consume the controller-built
current `dist/cli/pokie.js` and Studio assets. Missing observations, missing
Chromium/assets, or stale production assets fail explicitly; there is no skip,
source UI fallback, mocked page, self-dependency copy, build or packaging action.

The scripted recovery path is source-informed and must be reconciled with the
frozen observed path before it is used as an affected retest. It does not replace
unscripted collection or attribute project Build/Export proof to Design Build
Package. It uses native keyboard input for public controls, one bounded
100,000-round single-worker simulation with actual progress/reload, cancellation
or truthful completion, a 20-round report completion, a second small project,
reopening, and one occupied TypeScript-package destination with alternate
publication. A run that is too fast to observe actual progress/reload fails the
active-job assertion; it is not prolonged with fake delays. It checks accessible
field errors, focus, inert navigation and page geometry at the two dimensions.
Actions/transports, jobs and the overall run have deadlines. Failure and success
both drain owned work, cooperatively stop owned Studio/browser processes, and
remove only the regression's own temporary directory. It creates no audit
screenshots or replacement observation transcript.

## Permitted validation boundary

Run the supplied focused component/hook/service/HTTP files through
`npm run test:targeted -- <named files>` and the permitted root
`npm run typecheck` (which also invokes the Studio compiler once). Production
asset building/resolution, browser collection and the P909 browser rerun remain
controller work. The worker's smaller `typecheck-studio-client` entry was denied
by the installed command policy; the permitted root typecheck succeeds. No
check:fast/full/release, packaging, coverage or workflow campaign is authorized
here. The strict work report carries exact passing commands and outcomes from
the final candidate. A done implementation report hands off a committed
candidate; it does not close P9-09 or discharge future material findings.

## Changed-test gate correction

The saved dashboard gate failures were reproduced with
`npm run test:targeted -- tests/cli/studio-client/src/components/project/ProjectDashboardPage.test.tsx`:
three error-path assertions saw an additional connection alert because the
fixture had no `/api/project/jobs` route. The shared dashboard fixture now
answers project and Home discovery with the API's empty `{jobs: []}` response.
The planner diagnostic, stale-validation removal, failed-close recovery and
successful retry assertions remain intact. No production recovery behavior or
browser assertions were changed. The same whole-file targeted run passes all
13 tests. The preserved reviewer matrix, independent observation freeze and
browser retests remain controller-owned and pending.

## Response-ownership review correction

The saved review of `3caa5226b1bee6983a4a4dac8e68826dc24e09e5` identified
two additional source-informed defects. Before changing production code, the
new regressions reproduced discovery superseding a pending simulation and
delayed control acknowledgments replacing already observed results through
both durable-job adapters. The rejected-Run path was traced from its cleared
job ID to the dashboard's unconditional restoration effect.

| Accumulated finding | Correction and focused closure |
| --- | --- |
| P909-RESTORE: retained history replaced an explicit pending or rejected submission | Simulation now distinguishes initial attachment, restored work and explicit submission. Only initial attachment permits discovery restoration; an explicit request retains ownership after rejection. Starting a Run clears the previous job projection immediately, and a rejection returns to Configure with the attempted values and actionable error visible. The dashboard workflow tests restore a completed report on mount and reopening, reject a new Run while retaining its attempted configuration, and discover older history during a pending Run without superseding the accepting job ID. The hook regression also preserves Retry's request parameters and operation receipt through pending discovery and a rejected start, then verifies restoration after a project reset. |
| P909-CONTROL-ORDER: delayed Cancel/Resume acknowledgments regressed newer terminal observations | Controls reconcile with the latest state inside the state updater. A terminal from the same execution retains its full result and outputs, including when an older acknowledgment has the same terminal status but lacks output metadata. A later creation time still identifies a genuinely new same-ID checkpoint execution. Both Home and project suites cover list/detail terminal observation while Cancel/Resume is pending, explicit resume responses, old-execution discovery, and delayed old-execution control responses. |
| Independent progress/recovery and keyboard/two-viewport observations | Still pending controller collection and freeze, followed by clean affected browser retests. These component/hook results do not close either immutable browser acceptance criterion. No prior-step evidence or frozen observations were changed. |

The existing dashboard focus regression now waits for the rendered
`Overview ready` receipt before assigning focus, rather than the earlier router
location update. Its selected-task, retained-report, single-submission and
focus-preservation assertions remain intact.

Permitted final-tree checks completed successfully:

```text
npm run test:targeted -- tests/cli/studio-client/src/hooks/useProjectJobs.test.tsx tests/cli/studio-client/src/hooks/useHomeSourceJobs.test.tsx tests/cli/studio-client/src/hooks/useSimulationPoll.test.tsx tests/cli/studio-client/src/components/project/ProjectDashboardPage.simulationWorkflow.test.tsx tests/cli/studio-client/src/components/project/ProjectDashboardPage.jobs.test.tsx
5 suites passed; 88 tests passed; exit 0.
npm run typecheck
Root and Studio client compilers passed; exit 0.
```

The workflow suite emits React `act` diagnostics for asynchronous transitions
and observation updates; all assertions pass. Production builds, independent
observation collection, the post-freeze P909 browser execution, the preserved
broader reviewer matrix and official gates remain controller-owned and pending.
This is a committed implementation handoff, not a P9-09 audit closeout.

## Independent verifier addendum — 2026-10-09

This addendum records new verifier-owned evidence; it does not rewrite the
implementation handoff or its earlier pending statements. Product identity was
`f2904a7c4f41e02c38b0e466c1a01a8c69c0c3ab`, with an empty worktree at
collection start and after cleanup.

### Persona, freeze, and chronology

A fresh local producer opened the ready-to-edit Starter Slot, waited for its
visible validation, and created it through the rendered UI. The fresh profile
used isolated registry/config and Documents roots. The independent initial
collection was frozen before this document, reviewer hand-off, test source, or
other history was read:

- Initial freeze: `/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-09-2e4ace422a16773c/run-2026-10-09T22-53-05-174Z/frozen-initial.json`
  (`sha256:a9cfe7611cf17c49aca9635612882f1ac5682a7e4070765dca91c7484ef9a0d8`).
- Initial transcript: `/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-09-2e4ace422a16773c/run-2026-10-09T22-53-05-174Z/transcript.json`
  (`sha256:22d245d01f6cf49435b519a57d85d0037e0e1d0d940fd288d01df468b9b385ba`).
- Supplementary post-freeze transcript: `/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-09-2e4ace422a16773c/run-2026-10-09T22-55-57-877Z/transcript.json`
  (`sha256:72cda36b4dce4f34cac30052c55f62f50c87b00dbd6d96c864565d87b2c6d104`).
- Representative initial screenshots only (three): `1-observation.png`
  (`sha256:e8c3ca9be1b21960843fe8e36a74944f264a18cf911c2c9e198e17b01f308e99`),
  `2-observation.png` (`sha256:c12f9a2a4fa71b939ca245279e3a670050513955eca47740059c8db75004d420`), and
  `3-observation.png` (`sha256:207de9592bb0043af55edd3f2fe6ad8a4084987545c351b32e0a4d59e2dcc96c`),
  all beneath the initial run directory above.

### Observed public workflow and disposition

The producer entered `100000` in the labelled Rounds control, observed the
same simulation queued and then running at `2000/100000`, and used native
`Ctrl+R`. On reload, the same screen showed `100000/100000`, a readable report,
and a completed simulation operation (1.4 s): a truthful terminal branch, not
lost work. The project was visited through Projects, reopened, closed, and
reopened again with the retained simulation visible.

The first TypeScript package build completed to its displayed default. A second
activation after that terminal state gave an action-local occupied-directory
failure, explained that no files would be overwritten, and exposed both a
different-destination instruction and Rebuild. In supplementary verification,
the visible TypeScript-package field accepted the new `/tmp/p9alt` destination,
its preflight became Ready to build, and the resulting build rendered `Built to
/tmp/p9alt.` The generated 17,634-byte `/tmp/p9alt` tree was then moved to the
trash; both Studio/browser child sets exited. No generated output, profile,
screenshots, or runtime transcript is committed here.

Keyboard input was exercised for the labelled Rounds field and native
`Tab`/`Return` navigation from Overview to Play. The rendered path was checked
at 1439 × 1099 and 900 × 700. No P0, P1, or material P2 was observed in this
actual journey. The intentional occupied-destination failure is a recovery
case, not a product finding.

Limitations remain explicit: the initial bounded job finished during reload, so
the cancellation branch was not reached; no confirmation dialog was rendered
on this path, so confirmation-focus evidence is not reached; and a before/after
byte checksum of the already-occupied default directory was not captured,
although the action-local UI stated it would not overwrite it. These are
evidence gaps, not retroactive product defects or a clean closeout.

### Independent checks and closeout state

The controller-provided complete-file Jest receipt is retained at
`/home/stager/Work/sta-ger/agents/runtime/verifier-targeted-results/46f2c0ab135f1b903906eb19/result.json`,
with its `stdout.log` and `stderr.log`. It exited 1 solely because
`P909_FROZEN_OBSERVATIONS` was absent before this independent freeze; it is a
deferred controller prerequisite, not candidate-owned product-failure proof.
The verifier did not rerun it. `npm pack --dry-run --json --ignore-scripts`
returned the `pokie@1.3.0` aggregate (3,477,013-byte packed size; 9,028 entries;
shasum `6f8c61c67e79f9a15179e403fe3539e66caf8d1f`) without retaining a tarball.

Closeout is therefore **evidence-incomplete, not approved**: the controller
must authenticate the frozen record, run its deferred whole-file regression
with that record, and obtain the missing confirmation-focus and independently
measured occupied-byte-preservation evidence before a passed campaign verdict.

## Implementation repair revalidation — 2026-10-09

This continuation inspected the current worktree at
`75ed83d5bfb0af448e39119b48f7e9fdec55f609`. The requested production fixes and
regressions are already committed in
`f2904a7c4f41e02c38b0e466c1a01a8c69c0c3ab`; no additional production edit was
needed. This update changes only the current-step handoff and preserves the
verifier addendum and all prior evidence.

| Repair acceptance criterion | Current implementation and focused evidence |
| --- | --- |
| Rejected Run preserves its error and attempted configuration despite retained completed history | The dashboard workflow regression restores a completed report on mount and reopen, then submits different rounds, seed and workers. It asserts the actionable rejection, retained inputs, enabled Run, absent old report and unchanged old-job polling count. |
| Pending explicit submission keeps its accepting identity and operation receipt | The dashboard discovers older completed history while acceptance is pending and asserts it never attaches that history. Its terminal receipt belongs to the accepting job. The StrictMode simulation hook regression also checks rejected-start ownership, unchanged Retry parameters and the Retry receipt, then checks restoration after project reset. |
| Delayed Cancel/Resume cannot replace a newer terminal or remove its outputs | Both adapter suites cover list and detail completion while each control is pending, including a delayed same-status acknowledgment without output metadata. They assert the full terminal record and outputs remain unchanged after the acknowledgment and the pending control clears. |
| Same-ID checkpoint resume remains discoverable without accepting old-execution responses | Both adapters test a newer creation time accepted through discovery and explicit Resume, reject subsequent old-execution discovery, and retain a discovered new execution against a delayed previous-execution control acknowledgment. |
| Bounded checks and controller ownership | The five directly affected whole-file suites pass: 88 tests, exit 0. Root typecheck, including the Studio compiler once, passes with exit 0. React `act` diagnostics remain in the workflow suite; its assertions pass. No broader reviewer matrix, official gate, production build or browser execution was run by this worker. |

The exact targeted command is the five-file command in the response-ownership
correction above. The verifier addendum supplies partial observation provenance;
it does not establish the missing cancellation, confirmation-focus or measured
occupied-byte-preservation proof. Authentication of the freeze, independent
affected retests and the post-freeze production-browser regression remain
controller-owned. This committed repair handoff does not close the immutable
P9-09 browser acceptance criteria.
