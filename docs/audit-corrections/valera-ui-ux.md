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

## Independent verifier revision — 2026-10-09 (candidate `c576bce`)

This verifier-owned revision is a new record. It preserves all earlier
handoffs and observations, and does not backdate or reinterpret them. The
product candidate was `c576bcebaa50d61b2681e151e7ebe97b3a591326`; `HEAD` was
that SHA with an empty worktree before collection. Studio was built from that
checkout once by the neutral candidate-bound launcher (receipt output digest
`f4b4833c8d1fba9e0a50ed51ff3f86b49b8862926770309f961962c80b709b6f`, 8,162
files), then both owned Studio and Chromium children exited before this record
was authored.

### Persona, blind freeze, and retained chronology

The fresh-profile persona was a first-time producer creating the supplied
starter game, then using its public Play and Simulation pages. Before reading
this document, the reviewer hand-off, test source, or prior recovery history,
the collector froze its actual questions, decisions, interpretations, and
coverage:

- Initial freeze:
  `/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-09-7914868593b69db3/run-2026-10-09T23-10-47-552Z/frozen-initial.json`
  (`sha256:75c3c93cd9dc96edae5bce4be4ea11a66c90d68f08a34e8ffb6b1a74184dae6a`).
- Initial transcript:
  `/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-09-7914868593b69db3/run-2026-10-09T23-10-47-552Z/transcript.json`
  (`sha256:33233992ec2388b0339d19781757afff902dc9b41c91114cd9238d0bfe7ec3a3`).
- Post-freeze supplementary transcript:
  `/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-09-7914868593b69db3/run-2026-10-09T23-15-03-201Z/transcript.json`
  (`sha256:ce29394d9364b14343c870b49d894719e4b9bd191ace37b67fd1dcea046778f5`).
- The initial session alone contains the three permitted representative
  screenshots: `1-observation.png`
  (`sha256:2b0cd6627ab6032b09ffc433ec9598a960210bac04cbcbcfde1378387bd27f28`),
  `2-observation.png`
  (`sha256:c9202e8ce78d218c1a8e44b480296d30cee26dc329f3ea87e0bb8110cbd1698c`),
  and `3-observation.png`
  (`sha256:b2fec893210473f4392e684c1806bb88d3326fe6eb4bbbd931047dcb39baa61b`).

### Observations and disposition

The producer observed validation enable Create game, created the starter,
and saw the retained `project-open-materialization` completion. One real Play
round showed its local `Spinning…` state and a terminal no-win result with the
updated 999-credit balance. A single 50,000-round Simulation rendered its
local queued state (`0/50000`) and Cancel affordance, then a completed report
and retained simulation operation in 0.8 seconds. Its late cancellation
confirmation arrived after completion, so no second job was submitted.

After `Ctrl+R`, the first rendered Simulations view was briefly unhydrated and
showed no runs. A later observation in that same reloaded client, and a
close/reopen through Projects, restored the exact completed report and
operation. This is a readiness/recovery observation, not a product finding.
The original project closed and reopened successfully. At 1439x1099 and then
900x760, the public route remained readable; native Tab was accepted, though
the neutral text transport does not expose the focused element.

The existing project location was resolved and checked through the public
Add-a-game form. Its rendered `Add to projects` confirmation could not be
activated: the neutral rendered-target helper repeatedly returned `No unique
enabled rendered hit target` for that visible control and subsequently for the
visible Game id field. The permitted keyboard attempt did not establish an
activation. Post-freeze, the same limitation prevented a distinct second
project and alternate output-publication branch. A separate visible Unsaved
changes confirmation was reached after leaving a modified design; Stay did not
produce a local acceptance state, while one Escape dismissed it. Focus return
is therefore not proven. These are driver/evidence limitations, not product
defects.

No P0, P1, or material P2 product defect was observed. The review hand-off was
read only after the initial freeze and matched candidate
`c576bcebaa50d61b2681e151e7ebe97b3a591326`, step `P9-09`, and finding
`P9-VALERA-UI-UX`.

### Verification receipt, package aggregate, and closeout

The controller-owned complete-file receipt is
`/home/stager/Work/sta-ger/agents/runtime/verifier-targeted-results/dc9dab12c857bb635d84f4c7/result.json`,
with sibling `stdout.log` (`sha256:3db23e37d87b40000a84d305b874659b373d9015245e4f74c99a2887b8091fb2`)
and `stderr.log` (`sha256:85e195d5b88a84e3327d010a265261cb80ba7d07dfb25df036dc28f93a8acd12`).
It ran against the clean requested candidate before and after, but exited 1
solely because `P909_FROZEN_OBSERVATIONS` was absent. That is a deferred
post-freeze prerequisite, not candidate-owned product-failure evidence; this
verifier did not rerun the test.

`npm pack --dry-run --json --ignore-scripts` returned `pokie@1.3.0`, 9,028
entries, packed size 3,477,013 bytes, and shasum
`6f8c61c67e79f9a15179e403fe3539e66caf8d1f`; it retained no tarball. No
generated project/output, profile, browser data, raw logs, or screenshots is
committed.

Closeout disposition: **inconclusive — evidence/driver-limited, not approved**.
The frozen initial evidence is authentic and the reachable real-job,
reload/reattach, terminal-result, close/reopen, keyboard, and smaller-viewport
observations are retained. The unresolved required proof is a completed
occupied-destination recovery with directory bytes before/after and alternate
publication, a distinct-project isolation check, proven dialog-focus return,
and the controller-owned post-freeze whole-file regression. A later verifier
must repair the neutral selector transport in this same persistent harness and
complete those actions without rewriting this initial history.

## Independent recovery supplement — 2026-10-09 (evidence descendant `802eb2d3`)

This update preserves the immutable initial record and is a supplementary
continuation only. Product identity remains
`c576bcebaa50d61b2681e151e7ebe97b3a591326`; the inspected worktree HEAD was
`802eb2d373e970a800d4755bdc202fce0bf42ebb`, an authenticated clean
evidence-only descendant whose only candidate-relative change was this audit
document. No product source or test changed.

The original frozen chronology remains unchanged:

- `/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-09-7914868593b69db3/run-2026-10-09T23-10-47-552Z/frozen-initial.json`
  (`sha256:75c3c93cd9dc96edae5bce4be4ea11a66c90d68f08a34e8ffb6b1a74184dae6a`)
- its sibling `/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-09-7914868593b69db3/run-2026-10-09T23-10-47-552Z/transcript.json`
  (`sha256:33233992ec2388b0339d19781757afff902dc9b41c91114cd9238d0bfe7ec3a3`)

No screenshots were added: the initial run's three representative screenshots
remain the complete retained set. The post-freeze recovery transcripts are
`run-2026-10-09T23-32-04-095Z/transcript.json`
(`sha256:d6b2ba3619251e67d60a1282fd7a7aac4137da076f9cb8b6b9225d032291b992`)
and `run-2026-10-09T23-33-56-722Z/transcript.json`
(`sha256:63e61c4d6b291c5771c668e0ac71d272815827b5860d0d2ff4b26fe8e6afb3da`).

The neutral transport was repaired once for true hit-testable duplicate labels.
Through the retained profile it then created **Second Slot** and observed only
its own `project-open-materialization` operation: no Starter Slot simulation
or report leaked into that workspace. Returning through Projects and reopening
**Starter Slot** restored the prior completed simulation and downloadable
report. These observations satisfy the distinct-project isolation and retained
original-result portions of the reviewer request.

The retained earlier supplementary run remains the only confirmation evidence:
it reached the rendered Unsaved changes dialog and declined it by Escape after
an unconfirmed one-time Stay activation. This continuation could not target
the repeated Game basics Edit control through the neutral section resolver, so
it did not fabricate a second activation; visible focus return remains
unproven. At Build/Export, a one-file occupied destination sentinel was
created under this runtime run before UI activation and measured as 74 bytes,
`sha256:878cd443954985a4e412a6534fd75683bfc41b6bc64a76273ff3bc06f00ab8b7`.
The exact TypeScript Game Package Browse control was activated once, then
rendered disabled without opening a native picker (Studio remained the active
window). No path was typed into an absent dialog and the action was not
repeated. The sentinel remained unchanged, but alternate publication never
became reachable.

Both owned Studio/Chromium launches were closed and their children drained.
No P0/P1/material-P2 product defect was observed, and the deferred controller
browser test was neither inspected nor run. This is still **inconclusive,
driver-limited and not approved**: exact dialog-focus return, keyboard visible
focus/geometry at both widths, occupied-destination terminal preservation plus
alternate publication, and the controller-owned post-freeze regression remain
required before a passed disposition.

## Independent recovery continuation — 2026-10-09 (evidence descendant `54178004`)

This bounded continuation retained the same candidate identity
`c576bcebaa50d61b2681e151e7ebe97b3a591326` and the same authenticated profile.
The initial freeze and its sibling transcript are unchanged:

- `/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-09-7914868593b69db3/run-2026-10-09T23-10-47-552Z/frozen-initial.json`
  (`sha256:75c3c93cd9dc96edae5bce4be4ea11a66c90d68f08a34e8ffb6b1a74184dae6a`)
- `/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-09-7914868593b69db3/run-2026-10-09T23-10-47-552Z/transcript.json`
  (`sha256:33233992ec2388b0339d19781757afff902dc9b41c91114cd9238d0bfe7ec3a3`)

The supplementary continuation is
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-09-7914868593b69db3/run-2026-10-09T23-48-38-036Z/transcript.json`
(`sha256:270647d7f503d77937b111a834f5c0525c83dd8c6a4e4daf8c51e33f853db049`).
It reused the candidate-bound build receipt (8,162 files; output digest
`f4b4833c8d1fba9e0a50ed51ff3f86b49b8862926770309f961962c80b709b6f`) and
added no screenshots.

The preserved public Projects list rendered both saved projects. Selecting the
distinct **Second Slot** made both local `Open` controls disabled. Fresh
rendered observations contained no pending state, accepted operation, local
success, or action-local error. The selection was not resent and no unrelated
`Open Opened project` control was substituted. This does not prove a product
defect under the action-correlation contract; it leaves the remaining recovery
actions driver-limited. Studio and Chromium drained after close. No product
code, test, generated output, browser profile, or screenshot was committed.

## Independent recovery continuation — 2026-10-10 (evidence descendant `f147c67f`)

This supplementary continuation preserved the same authenticated candidate
`c576bcebaa50d61b2681e151e7ebe97b3a591326`, frozen profile, and immutable
initial chronology. The initial freeze and sibling transcript remain
hash-matched:

- `/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-09-7914868593b69db3/run-2026-10-09T23-10-47-552Z/frozen-initial.json`
  (`sha256:75c3c93cd9dc96edae5bce4be4ea11a66c90d68f08a34e8ffb6b1a74184dae6a`)
- `/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-09-7914868593b69db3/run-2026-10-09T23-10-47-552Z/transcript.json`
  (`sha256:33233992ec2388b0339d19781757afff902dc9b41c91114cd9238d0bfe7ec3a3`)

The continuation transcript is
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-09-7914868593b69db3/run-2026-10-09T23-57-36-889Z/transcript.json`
(`sha256:e4b0a50a625b685a1aba9004b73fe439bf1b3fcd5f3b94836a2124597c0012e9`).
No screenshot was added beyond the initial three.

Using the distinct rows' own rendered `Open` controls (rather than selecting
a row), the verifier opened **Second Slot**, which showed only its own project
opening operations and no Starter Slot simulation/result. It then reopened
**Starter Slot** and observed the retained completed simulation and its
downloadable report. This completes the previously driver-limited
distinct-project/reopen observation without replaying creation, play,
simulation, or generation.

For the outstanding destination branch, the TypeScript Game Package default
destination was initially absent. One public Build completed there; its
six-file manifest had SHA-256
`e9a42bfc6abedabdeba40a0f3df90a31175de55b34e287eb696030e7ce87a890`.
One subsequent Build rendered the card-local message that the directory already
exists and is not empty and instructed the user to choose another `--out` path;
the same six-file manifest hash and count remained afterward. Thus the occupied
output was measured before and after the rendered recovery failure. The two
enabled `Output directory (optional)` inputs on this page have indistinguishable
rendered labels. The neutral transport rejected the requested TypeScript field
as non-unique, so it did not type into either, did not submit an alternate
publication, and did not fabricate that result.

The retained job was already terminal, so the required active-work confirmation
decline/focus-return branch was not replayed. The text transport also does not
expose visible focus; no unsupported focus/geometry claim is made. Studio and
Chromium drained on close. No P0/P1/material-P2 product defect was observed,
and the deferred controller browser test was neither inspected nor run. This is
still **inconclusive, driver-limited and not approved** pending alternate
publication plus active-work confirmation/focus and visible-focus viewport
proof.

## Independent recovery continuation — 2026-10-10 (evidence descendant `bea21e02`)

This bounded supplementary continuation kept candidate
`c576bcebaa50d61b2681e151e7ebe97b3a591326`, the frozen profile, and the
immutable initial chronology. The initial frozen observation and its sibling
transcript remain hash-matched:

- `/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-09-7914868593b69db3/run-2026-10-09T23-10-47-552Z/frozen-initial.json`
  (`sha256:75c3c93cd9dc96edae5bce4be4ea11a66c90d68f08a34e8ffb6b1a74184dae6a`).
- `/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-09-7914868593b69db3/run-2026-10-09T23-10-47-552Z/transcript.json`
  (`sha256:33233992ec2388b0339d19781757afff902dc9b41c91114cd9238d0bfe7ec3a3`).

The new supplementary transcript is
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-09-7914868593b69db3/run-2026-10-10T00-06-30-719Z/transcript.json`
(`sha256:86fe768cf410d63cbfbb615608c73a477363e9f0c4d66ebe289f8c2dac9ca1e4`).
No screenshot was added, so the initial three-screenshot bound is unchanged.

The retained original **Starter Slot** reopened with its completed simulation
and downloadable report; the preserved earlier supplement remains the evidence
that **Second Slot** has no leaked original-project simulation/result. The
TypeScript Game Package card retained its local occupied-destination recovery
state. Its scoped `Output directory (optional)` accepted
`/tmp/p9-valera-alternate-20261010`, rendered `Ready to build`, and one Build
then rendered `Built to /tmp/p9-valera-alternate-20261010.` with an
`artifact-build · Completed` terminal record. The existing occupied `tsPackage`
and the alternate output each contained six files and 17,534 bytes at the final
inspection. This adds the missing alternate-publication observation without
replaying simulation, generation, or project creation.

The retained simulation was terminal before this continuation, so no active-work
confirmation decline/focus-return branch could be reached without replaying the
already evidenced operation. The rendered transport measured a focused
`Output directory (optional)` input with `focusVisible=true` at 1439 × 956, but
does not establish keyboard confirmation focus return or smaller-viewport focus
geometry. Studio and Chromium drained after close. No product P0/P1/material-P2
was observed; the deferred controller browser test was not inspected or run.
The overall browser criterion remains **not reached**, pending only the
unreached active-work-confirmation and keyboard/focus-at-smaller-width proof.

## Independent recovery completion — 2026-10-10 (evidence descendant `3126bfdd`)

This final supplementary collection retained the authenticated candidate
`c576bcebaa50d61b2681e151e7ebe97b3a591326` and clean evidence-only descendant
`3126bfdd14df9ffd1480e279b5ec101f6799eb18`. The immutable initial record and
its sibling transcript remain present and hash-matched:

- `/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-09-7914868593b69db3/run-2026-10-09T23-10-47-552Z/frozen-initial.json`
  (`sha256:75c3c93cd9dc96edae5bce4be4ea11a66c90d68f08a34e8ffb6b1a74184dae6a`);
- `/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-09-7914868593b69db3/run-2026-10-09T23-10-47-552Z/transcript.json`
  (`sha256:33233992ec2388b0339d19781757afff902dc9b41c91114cd9238d0bfe7ec3a3`).

The completion supplement is
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/P9-09-7914868593b69db3/run-2026-10-10T00-25-12-858Z/transcript.json`
(`sha256:80edf78ad73d0b562daa8d9ba7bbfc3c2439dae5fb18a9a9aed94f0da539d21c`).
No screenshot was added, preserving the initial three-screenshot bound.

Because retained simulations were terminal, one minimum public **Repeat
simulation** was submitted exactly once. It rendered its accepted running
state at `2000/50000`, then completed truthfully at `50000/50000` in 821 ms.
The specified immediate rendered **Close project** follow-up produced the
active-operations confirmation. Its **Cancel** response kept the project and
completed report available and returned measured focus to **Close project**.
Native `Tab` then produced visible focus on **Configure** at 1439 × 956
(124.625 × 36 px, 2 px solid outline) and on **Run** at 900 × 700
(140.984 × 36 px, 2 px solid outline). Thus this continuation closes the
previously missing active-work confirmation, focus-return, and smaller-viewport
keyboard evidence without redoing the already retained project-isolation or
occupied-destination observations. Owned Studio and browser children drained;
no P0/P1/material-P2 product defect was observed. The deferred whole-file
browser regression remains controller-owned and was not inspected or run here.

## Post-review changed-tests correction — 2026-10-10

The saved gate failure at `854efe0642d6208676763eccdd0b21427d9a0eba`
was reproduced through the permitted complete-file regression. Its managed
project timeout left the browser on the valid starter design without a save
request or error: the DevTools Enter event lacked the carriage-return text
needed for native button activation. The regression now sends that text with
Enter, retaining native Tab/Enter interaction throughout.

Once activation worked, the same real path exposed timing assumptions in the
test. Geometry now waits for the mobile drawer to finish entering the viewport;
the simulation terminal check identifies the accepted job's own workflow
projection instead of matching an earlier retained-history update. The
workflow's Configure control is reached by native Tab after confirmed
cancellation, whose removed trigger can release focus during dialog teardown;
the exact focus-return assertions for both declined dialogs remain unchanged.
The active fixture uses 500,000 real rounds, with unchanged 30-second terminal and
180-second journey deadlines, so reload/reconnect and the cancellation dialogs
can finish before a roughly 1.5-second 100,000-round run would complete. It adds
no artificial progress or additional operation combinations. The separate
completed-report fixture remains 20 rounds. Publication follow-up is reached
by native Tab at 390 × 844 and again at 1100 × 800, with native Tab/Shift+Tab
after resizing to bring the retained focused control into the new layout.
Bounded failure diagnostics report the rendered page, focus geometry, and
owned server output before normal child/job cleanup.

The only permitted test command was run in the foreground:

```sh
P909_FROZEN_OBSERVATIONS="$PWD/docs/audit-corrections/valera-ui-ux.md" npm run test:targeted -- tests/cli/studio-client/src/P909ValeraRecovery.browser.test.tsx
```

It passed both tests (one suite, exit 0, 12.859 seconds). The complete path
checks real progress, retained identity after reload, visible reconnect and
reattachment without duplicate submission, declined transition/cancellation
focus return while active, terminal cleanup, a downloadable 20-round report,
project isolation and reopening, occupied-destination errors/disabled Build,
unchanged sentinel bytes, actual alternate package publication, and keyboard
focus/geometry at both widths. Only this test and this appended note changed;
the production assets and all earlier independent evidence remain intact.

No controller freeze environment variable was supplied in this clone. For
the local correction run, the prerequisite points to this committed document's
retained independent observations; this is not a new blind collection or
authentication of its externally referenced original record. The controller's
rerun with the original frozen record and preserved official gate matrix
remains pending. No build, packaging, parent-review suite, or official gate
was launched by this worker.
