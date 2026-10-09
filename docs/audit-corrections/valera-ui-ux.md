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
