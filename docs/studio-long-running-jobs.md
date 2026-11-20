# Studio durable jobs

Studio owns the status of work that can outlive a browser request. The common API is project-scoped: `GET /api/project/jobs`, `GET /api/project/jobs/:id`, `POST /api/project/jobs/:id/cancel`, and `POST /api/project/jobs/:id/recover`.

A job has an immutable project identity, operation, request summary and conflict key. Its progress is a named `stage`, semantic `unit`, `current`, and `total`, rather than a percentage. Terminal records retain timestamps, duration, safe result/origin/output references and an explicit recovery instruction. IDs cannot be read or cancelled from another project.

Before the first progress sample, a running job shows **Running** with indeterminate
progress. Throughput and ETA require two advancing samples of the same execution,
stage, unit and known total. They reset when the execution changes or cancellation is
requested; a work ETA does not estimate how long cancellation cleanup will take.

Home's completed project-opening card opens the project in Studio, including
Blueprint files. Reveal opens its containing folder on the server's machine
when local host access is available. Completion records an earlier operation;
it does not guarantee that a project remains at the saved path. A missing
project keeps its completion and provenance visible, with Open/Reveal withheld
and a **Find saved project in Projects** action. Use the missing registry
entry's **Relocate** control to select its current location, then **Open** that
entry. If it is no longer registered, add the game through Projects. Studio
does not guess replacement paths or copy, restore or delete project files.

The file repository writes each JSON record through a temporary file and rename. On restart, queued/running/cancelling work is marked `recovery-required`: normal work must be retried from scratch because Studio never publishes a partial result. An executor may instead provide the validated `resume` recovery instruction only when it owns an exact immutable checkpoint (currently Outcome Library exact enumeration).

Cancellation is deliberately two-stage. `cancel` records `cancelling` and aborts the executor; it is `cancelled` only after that executor has completed its staging cleanup. A terminal cancellation is idempotent. A conflicting request with the same conflict key and a different immutable request receives a typed conflict with its active job id and retry guidance; an exact retry reattaches to the active record.

## Studio API operation inventory

This is the complete Studio API inventory, not a list of only the routes that happen to need a job
first. Parameterised routes and the extension route are listed explicitly as well.

`Common job` means the route creates, observes, cancels, or recovers the durable server-owned
status described above. Compatibility routes retain their established response DTOs, but first
acquire the durable common job; an exact retry reattaches and a conflict never invokes the domain
executor.

| Studio API action | Classification | Concrete bounded-work reason or status boundary |
| --- | --- | --- |
| GET `/api/health`, GET `/api/context`, GET `/api/studio/diagnostics` | Synchronous control read | Returns process/context fields already held in memory; it neither resolves a project nor evaluates a game. |
| GET `/api/home/recent-projects`, GET `/api/home/projects/registry` | Synchronous metadata read | Reads Studio's small registry records only; it does not load a selected project, create a runtime, or inspect an output. |
| GET `/api/home/jobs`, GET `/api/home/jobs/:id`, POST `/api/home/jobs/:id/cancel`, POST `/api/home/jobs/:id/recover` | Common job: Home project opening | Lists or controls Home-owned project preparation by source identity; records remain visible across Home navigation until terminal recovery or cleanup. |
| POST `/api/home/projects/registry/preview`, POST `/api/home/projects/registry/register`, POST `/api/home/projects/registry/remove`, POST `/api/home/projects/registry/relocate` | Synchronous registry edit | Validates and changes one registry entry. Project loading/building is intentionally a separate action. |
| POST `/api/home/projects/open` | Common job: project opening/runtime preparation | requested project path is the source identity. Resolution can create a runtime and is saved under that source identity. |
| GET `/api/home/fs/browse`, GET `/api/home/fs/default-location`, GET `/api/home/fs/native-browse/availability` | Synchronous picker metadata | One location lookup/listing or an availability flag, with no recursive scan, project evaluation, or generated output. |
| POST `/api/home/fs/native-browse`, POST `/api/home/fs/open-folder`, POST `/api/home/fs/reveal-path` | Synchronous host interaction | Opens one OS picker/folder after request/path checks; Studio has no server-side build computation to track. |
| POST `/api/home/blueprints/validate`, POST `/api/home/blueprints/load`, POST `/api/home/blueprints/check-source`, POST `/api/home/blueprints/random`, POST `/api/home/blueprints/save`, POST `/api/home/blueprints/save-managed` | Synchronous Design edit | Validates or reads/writes one Blueprint document. These operations do not build a package, enumerate outcomes, or generate reels. |
| POST `/api/home/blueprints/symbol-artwork/import`, GET `/api/project/symbol-artwork` | Synchronous single-file artwork action | Copies or reads one image reference/file; no image batch, build, or runtime preparation is performed. |
| POST `/api/home/blueprints/build-preview`, POST `/api/home/blueprints/game-model-preview`, POST `/api/home/blueprints/reel-strip-generation-preview` | Synchronous limited preview | Returns validation/planning data and a limited preview sample only. It never publishes a package, workbook, or generated reel strip. |
| POST `/api/home/blueprints/par-import` | Common job: PAR import | A workbook is an external source whose parse/validation can scale with its sheets; workbook path is the source identity. |
| POST `/api/home/blueprints/par-export` | Common job: PAR export | A workbook publication is atomic but can write an arbitrarily sized workbook; Blueprint source and destination path own the conflict key. |
| POST `/api/home/blueprints/build` | Common job: Design package build/reel-strip preparation | Package build may generate reels and publish a destination tree. The Blueprint source and requested destination identify the job. |
| POST `/api/projects/close` | Synchronous status control | Checks the already-persisted active-job list and asks for confirmation; it does not itself execute project work. |
| GET `/api/project/context`, GET `/api/project/inspect`, GET `/api/project/validate`, GET `/api/project/gameModel` | Synchronous project read | Returns an existing dashboard snapshot or a single inspection/validation response; any preparation belongs to project opening. |
| GET `/api/project/jobs`, GET `/api/project/jobs/:id`, POST `/api/project/jobs/:id/cancel`, POST `/api/project/jobs/:id/recover` | Common job | Lists or controls the sole durable status owner. IDs are project-scoped, and recovery never claims a partial publication succeeded. |
| POST `/api/project/simulations`, GET `/api/project/simulations/:id`, DELETE `/api/project/simulations/:id`, GET `/api/project/reports`, GET `/api/project/reports/:id`, GET `/api/project/reports/:id/download` | Common job: simulation | Simulation configuration and project root form the conflict identity; progress is rounds and restart recovery is retry. Existing simulation URLs project the common record. |
| POST `/api/project/replays`, GET `/api/project/replays`, POST `/api/project/replays/inspect-artifact`, GET `/api/project/replays/:id`, DELETE `/api/project/replays/:id`, GET `/api/project/replays/:id/download` | Common job: replay | Replay descriptor and project root form the conflict identity; progress is rounds and restart recovery is retry. Existing replay URLs remain compatibility views. |
| GET `/api/project/rounds`, POST `/api/project/play/session`, POST `/api/project/play/sessions/:id/spin` | Synchronous Play action | Lists saved rounds, creates/resets one session, or settles exactly one spin/draw. No search loop runs on these routes. |
| POST `/api/project/play/sessions/:id/find-any-win`, POST `/api/project/play/sessions/:id/find-symbol-win`, POST `/api/project/play/sessions/:id/find-free-games` | Common job: Play scenario search | These routes can perform up to the configured scenario-search spin bound; session id plus immutable search request identify the job, and only a settled round may be saved. |
| GET `/api/project/deployment/targets`, GET `/api/project/deployment/build-modes` | Synchronous deployment metadata | Enumerates registered targets/build modes without publishing or executing a deployment pipeline. |
| POST `/api/project/deployment/runs` | Common job: deployment check/publish | Target, delivery request, and project root form the conflict identity; the executor reports pipeline stages and published output references. |
| POST `/api/project/outcome-libraries/generate/estimate`, GET `/api/project/outcome-libraries/registry`, POST `/api/project/outcome-source/sample` | Synchronous limited outcome-source action | Estimate/registry operations read metadata; sample settles one draw. Exact enumeration is deliberately not hidden behind any of these routes. |
| POST `/api/project/outcome-libraries/generate`, POST `/api/project/outcome-libraries/generate/jobs`, GET `/api/project/outcome-libraries/generate/jobs`, GET `/api/project/outcome-libraries/generate/jobs/:id`, POST `/api/project/outcome-libraries/generate/jobs/:id/cancel`, POST `/api/project/outcome-libraries/generate/jobs/:id/resume` | Common job: Outcome Library generation | Bound source, configuration, and destination are immutable request identity. Progress is raw combinations/emitted outcomes; only an exact validated checkpoint may resume. Legacy generate URLs remain views. |
| POST `/api/project/certification/validate-source` | Common job: certification deep validation | A source folder can contain any number of audit files and modes; source identity and validation request are saved with progress. |
| POST `/api/project/certification/build` | Common job: certification pack build | Certification pack destination, modes, and project root form the conflict identity; file/sample/mode progress and atomic publication belong to the job. |
| POST `/api/project/fairness/configure`, POST `/api/project/fairness/generate`, POST `/api/project/fairness/verify` | Synchronous constant-size fairness action | Each action creates, hashes, or verifies one fixed-size commit-reveal proof; it does not iterate a game space or publish an output tree. |
| POST `/api/project/stakeengine/validate`, POST `/api/project/stakeengine/export` | Synchronous migration response | Both routes only validate their request then return a 410 migration DTO; no Stake conversion is executed. The replacement is the build job below. |
| GET `/api/project/artifacts/targets`, POST `/api/project/artifacts/preview` | Synchronous build metadata/preview | Target listing and check do not invoke an `ArtifactBuilderRegistry` writer or allocate the destination. |
| POST `/api/project/artifacts/build`, GET `/api/project/artifacts/build/:id`, POST `/api/project/artifacts/build/:id/cancel` | Common job: every `ArtifactBuilderRegistry` target | Resolved source and destination are identity/conflict keys; builder-reported units are progress. This includes Blueprint, tsPackage, Outcome Library, Stake view, PAR workbook, and WASM targets. Compatibility URLs expose the common record. |
| POST `/api/math-definition-diff/preview` | Synchronous cancellable comparison | Compares the two selected definitions without publication; request disconnect, project change and shutdown drain its tracked preview promise. It does not create a durable operation or resume work. |
| GET `/api/project/certification/download` | Synchronous saved-output delivery | Requires a matching completed certification job and revalidates its input/content identity before reading the requested certification pack member. Disconnect, project change and shutdown abort and drain the tracked download; no new certification pack is built. |
| `/api/tools/:toolId/...` | Extension interface | No concrete tool handler is installed. A future handler must declare this same classification before dispatch; potentially noticeable handler work must create a common job and must not run request-owned. |

Potentially noticeable rows above are all common-job operations; they are not excused merely because the current implementation awaits I/O. Their existing endpoints remain compatibility
views while their domain services remain executors.

The **Your projects** breadcrumb and Studio brand visit Home without closing the
current project. Home shows that project's durable operations on both sections,
including progress, Cancel, checkpoint Resume and saved terminal records.
**Return to project** opens its scoped dashboard for result review and explicit
Retry configuration. Dirty Game Model and Home Design edits still require a
Leave/Stay choice. Browser-owned work retains its documented tab/Worker lifetime.

Explicit **Close project** and opening a different project remain cleanup
transitions. Studio asks the server for the complete active job set, names those
operations and requires confirmation before cancelling them. A new project
generation invalidates stale list/start/poll/cancel responses so no response from
project A is rendered in project B.

Logical composite delivery commits each subround through the existing runtime
boundary. Cancellation stops subsequent subrounds and publication, and preserves
a committed prefix or uncertain external settlement owner. Play scenario searches
continue an active logical round with its returned cursor. Project changes drain
accepted Play work before releasing its runtime; saved history remains
inspectable and late responses cannot repopulate the active project view.

## Feature chains with limits

See [cascades, respins and collections](feature-chains.md) for the declarative
interfaces, supported compositions, authoring/build/extraction/PAR workflow,
logical-round accounting, continuation and durability boundaries.

Reports persist the analytics envelope, raw counts and denominators in the
existing job detail store. Reopened reports and JSON/Markdown/HTML downloads retain
the same analytics. Cancelled/failed observed prefixes remain diagnostic and are
not listed as completed reports; publication follows runtime/worker cleanup.
Worker feature trajectories and accumulating jackpot pools are independent.
Worker seed derivation and the executable model identity remain in each mode's
saved report; see [simulation analytics](simulation.md#feature-analytics-aggregates).

Simulation exposes real preparation, simulation, finalization/cleanup and terminal phases through both durable jobs and compatibility polling. Counts are accepted plays; all-mode totals cover each independent mode. A 100% counter can still be finalizing. Cancellation stays pending until worker/session/runtime release settles; a release error is failed and actionable, including when cancellation was requested. Staged mode results are unavailable to report/history/download consumers until the entire job succeeds and cleanup completes.

Reload/remount reattaches to the same active job and retains its identity through transient sample errors. A server restart cannot resume an interrupted simulation executor: it becomes recovery-required with captured retry settings. Completed saved reports survive repository reconstruction. The saved report's metrics take precedence over supplementary statistics.

Simulation job-card Retry and Recent runs “Run again” open Configure with the captured settings. Review or change those settings, then choose Run Simulation to create a new operation. Selecting either control again restores the captured settings without submitting work. Explicit Run or selecting a saved report consumes that configuration handoff, so later tab navigation preserves the newer result.

The simulation API accepts an optional coherent `convergence` object (`minRounds`, `rtpTolerance` in RTP units, `checkIntervalRounds`, optional `stableChecks`). It is validated, forwarded to package workers and saved with the durable request and retry identity. Different adaptive settings conflict with an active request. Native outcome-library and WASM samplers explicitly reject adaptive settings; their budgets are fixed. The Configure form defaults to fixed budgets. A captured adaptive recovery request shows its saved settings and offers an explicit switch back to a fixed limit; Retry and Recent runs “Run again” preserve adaptive parameters. All-mode retries retain the per-mode limit rather than multiplying the displayed total again.


WASM browser jobs use the same durable service. A browser tab owns each production Worker and reports scoped progress and a drained terminal; Studio owns admission, report/replay downloads and recorded rounds. A job captures its file identity and Project generation. Publication revalidates the current bytes/sidecar pair. Cancellation terminates the browser Worker before the cancellation terminal is submitted; only the observed accepted prefix is saved. Pagehide disposes Workers and sends a cancellation receipt. If that receipt is lost, the ten-second owner lease becomes recovery-required and offers an explicit retry. Reload and duplicate tabs discover saved jobs and never automatically submit a replacement. A disconnected owner cannot claim successful cleanup, and a shutdown with unconfirmed drainage cannot record a graceful stop. Idle Play sessions are tab-owned and discarded on pagehide, build change or connection loss.

Optimization jobs rediscover the same server execution after browser reload, using project identity even when the routed path is an alias. Editing the policy requires a new support
check; an incompatible active request conflicts instead of launching a second search. Cancellation
is terminal only after owned game, loader, worker and scratch cleanup. Cleanup failures remain
failed/recovery-required. Close, project switching and shutdown drain optimization work and release
saved candidate workspaces; separately published outputs remain independent.

There is no resumable optimization checkpoint. After a server restart, interrupted search requires
fresh retry, and saved terminal evidence does not restore process-local candidate save/apply
permission. The generic recovery action must not claim optimization resumed. Use Optimize math's
support check followed by Run optimization to start a fresh limited search. Authored apply refreshes
the active project runtime and consumes its preview; both save and apply require the current policy
at the server boundary, including locks and constraints.

Output format, preview and package Game Model requests retain their executor
promise after an HTTP disconnect until owned runtime/worker cleanup completes.
Project close/switch and Studio shutdown cancel and await these preflights;
a closed response alone does not establish that their resources drained.
