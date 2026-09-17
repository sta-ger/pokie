# Studio durable jobs

Studio owns the lifecycle of work that can outlive a browser request. The common API is project-scoped: `GET /api/project/jobs`, `GET /api/project/jobs/:id`, `POST /api/project/jobs/:id/cancel`, and `POST /api/project/jobs/:id/recover`.

A job has an immutable project identity, operation, request summary and conflict key. Its progress is a named `stage`, semantic `unit`, `current`, and `total`, rather than a percentage. Terminal records retain timestamps, duration, safe result/provenance/output references and an explicit recovery instruction. IDs cannot be read or cancelled from another project.

The file repository writes each JSON record through a temporary file and rename. On restart, queued/running/cancelling work is marked `recovery-required`: normal work must be retried from scratch because Studio never publishes a partial result. An executor may instead provide the validated `resume` recovery instruction only when it owns an exact immutable checkpoint (currently Outcome Library exact enumeration).

Cancellation is deliberately two-stage. `cancel` records `cancelling` and aborts the executor; it is `cancelled` only after that executor has completed its staging cleanup. A terminal cancellation is idempotent. A conflicting request with the same conflict key and a different immutable request receives a typed conflict with its active job id and retry guidance; an exact retry reattaches to the active record.

## Checked Studio API operation inventory

This is the complete Studio API inventory, not a list of only the routes that happened to
need a job first. `StudioLongRunningOperationInventory.contract.test.ts` extracts every
literal method/path guard from `StudioServer` and requires it to appear below. Parameterised
routes and the extension route are listed explicitly as well. When a route is added, its
classification and its concrete reason must be added in the same change. The contract test also
parses the table below: each route family must have exactly one lifecycle classification and a
non-empty, concrete reason, so a route cannot be "covered" only by nearby prose.

`Common job` means the route creates, observes, cancels, or recovers the durable server-owned
lifecycle described above. Compatibility routes retain their established response DTOs, but first
acquire the durable common job; an exact retry reattaches and a conflict never invokes the domain
executor.

| Studio API action | Classification | Concrete bounded-work reason or lifecycle boundary |
| --- | --- | --- |
| GET `/api/health`, GET `/api/context`, GET `/api/studio/diagnostics` | Synchronous control read | Returns process/context fields already held in memory; it neither resolves a project nor evaluates a game. |
| GET `/api/home/recent-projects`, GET `/api/home/projects/registry` | Synchronous metadata read | Reads Studio's small registry records only; it does not load a selected project, materialize a runtime, or inspect an artifact. |
| GET `/api/home/jobs`, GET `/api/home/jobs/:id`, POST `/api/home/jobs/:id/cancel`, POST `/api/home/jobs/:id/recover` | Common job: Home project opening | Lists or controls Home-owned project materialization by canonical source identity; records remain visible across Home navigation until terminal recovery or cleanup. |
| POST `/api/home/projects/registry/preview`, POST `/api/home/projects/registry/register`, POST `/api/home/projects/registry/remove`, POST `/api/home/projects/registry/relocate` | Synchronous registry edit | Validates and changes one registry entry. Project loading/building is intentionally a separate action. |
| POST `/api/home/projects/open` | Common job: project opening/runtime materialization | Canonical requested project path is the source identity. Resolution can materialize a runtime and is retained under that source identity. |
| GET `/api/home/fs/browse`, GET `/api/home/fs/default-location`, GET `/api/home/fs/native-browse/availability` | Synchronous picker metadata | One location lookup/listing or an availability flag, with no recursive scan, project evaluation, or generated output. |
| POST `/api/home/fs/native-browse`, POST `/api/home/fs/open-folder`, POST `/api/home/fs/reveal-path` | Synchronous host interaction | Opens one OS picker/folder after request/path checks; Studio has no server-side artifact computation to track. |
| POST `/api/home/blueprints/validate`, POST `/api/home/blueprints/load`, POST `/api/home/blueprints/check-source`, POST `/api/home/blueprints/random`, POST `/api/home/blueprints/save`, POST `/api/home/blueprints/save-managed` | Synchronous Design edit | Validates or reads/writes one Blueprint document. These operations do not build a package, enumerate outcomes, or generate reels. |
| POST `/api/home/blueprints/symbol-artwork/import`, GET `/api/project/symbol-artwork` | Synchronous single-file artwork action | Copies or reads one image reference/file; no image batch, build, or runtime preparation is performed. |
| POST `/api/home/blueprints/build-preview`, POST `/api/home/blueprints/game-model-preview`, POST `/api/home/blueprints/reel-strip-generation-preview` | Synchronous bounded preview | Returns validation/planning data and a bounded preview sample only. It never publishes a package, workbook, or generated reel strip. |
| POST `/api/home/blueprints/par-import` | Common job: PAR import | A workbook is an external source whose parse/validation can scale with its sheets; canonical workbook path is the source identity. |
| POST `/api/home/blueprints/par-export` | Common job: PAR export | A workbook publication is atomic but can write an arbitrarily sized workbook; canonical Blueprint source and destination path own the conflict key. |
| POST `/api/home/blueprints/build` | Common job: Design package build/reel-strip materialization | Package build may generate reels and publish a destination tree. The canonical Blueprint source and requested destination identify the job. |
| POST `/api/projects/close` | Synchronous lifecycle control | Checks the already-persisted active-job list and asks for confirmation; it does not itself execute project work. |
| GET `/api/project/context`, GET `/api/project/inspect`, GET `/api/project/validate`, GET `/api/project/gameModel` | Synchronous project read | Returns an existing dashboard snapshot or a single inspection/validation response; any materialization belongs to project opening. |
| GET `/api/project/jobs`, GET `/api/project/jobs/:id`, POST `/api/project/jobs/:id/cancel`, POST `/api/project/jobs/:id/recover` | Common job | Lists or controls the sole durable lifecycle owner. IDs are project-scoped, and recovery never claims a partial publication succeeded. |
| POST `/api/project/simulations`, GET `/api/project/simulations/:id`, DELETE `/api/project/simulations/:id`, GET `/api/project/reports`, GET `/api/project/reports/:id`, GET `/api/project/reports/:id/download` | Common job: simulation | Simulation configuration and project root form the conflict identity; progress is rounds and restart recovery is retry. Existing simulation URLs project the common record. |
| POST `/api/project/replays`, GET `/api/project/replays`, POST `/api/project/replays/inspect-artifact`, GET `/api/project/replays/:id`, DELETE `/api/project/replays/:id`, GET `/api/project/replays/:id/download` | Common job: replay | Replay descriptor and project root form the conflict identity; progress is rounds and restart recovery is retry. Existing replay URLs remain compatibility projections. |
| GET `/api/project/rounds`, POST `/api/project/play/session`, POST `/api/project/play/sessions/:id/spin` | Synchronous Play action | Lists retained rounds, creates/resets one session, or settles exactly one spin/draw. No search loop runs on these routes. |
| POST `/api/project/play/sessions/:id/find-any-win`, POST `/api/project/play/sessions/:id/find-symbol-win`, POST `/api/project/play/sessions/:id/find-free-games` | Common job: Play scenario search | These routes can perform up to the configured scenario-search spin bound; session id plus immutable search request identify the job, and only a settled round may be retained. |
| GET `/api/project/deployment/targets`, GET `/api/project/deployment/build-modes` | Synchronous deployment metadata | Enumerates registered targets/build modes without publishing or executing a deployment pipeline. |
| POST `/api/project/deployment/runs` | Common job: deployment check/publish | Target, delivery request, and project root form the conflict identity; the executor reports pipeline stages and published artifact references. |
| POST `/api/project/outcome-libraries/generate/estimate`, GET `/api/project/outcome-libraries/registry`, POST `/api/project/outcome-source/sample` | Synchronous bounded outcome-source action | Estimate/registry operations read metadata; sample settles one draw. Exact enumeration is deliberately not hidden behind any of these routes. |
| POST `/api/project/outcome-libraries/generate`, POST `/api/project/outcome-libraries/generate/jobs`, GET `/api/project/outcome-libraries/generate/jobs`, GET `/api/project/outcome-libraries/generate/jobs/:id`, POST `/api/project/outcome-libraries/generate/jobs/:id/cancel`, POST `/api/project/outcome-libraries/generate/jobs/:id/resume` | Common job: Outcome Library generation | Bound source, configuration, and destination are immutable request identity. Progress is raw combinations/emitted outcomes; only an exact validated checkpoint may resume. Legacy generate URLs remain projections. |
| POST `/api/project/certification/validate-source` | Common job: certification deep validation | A source bundle can contain an unbounded set of evidence files/modes; source identity and validation request are retained with progress. |
| POST `/api/project/certification/build` | Common job: certification evidence build | Evidence destination, modes, and project root form the conflict identity; file/sample/mode progress and atomic publication belong to the job. |
| POST `/api/project/fairness/configure`, POST `/api/project/fairness/generate`, POST `/api/project/fairness/verify` | Synchronous constant-size fairness action | Each action creates, hashes, or verifies one fixed-size commit-reveal proof; it does not iterate a game space or publish an artifact tree. |
| POST `/api/project/stakeengine/validate`, POST `/api/project/stakeengine/export` | Synchronous migration response | Both routes only validate their request then return a 410 migration DTO; no Stake conversion is executed. The replacement is the artifact job below. |
| GET `/api/project/artifacts/targets`, POST `/api/project/artifacts/preview` | Synchronous artifact metadata/preview | Target listing and preflight do not invoke an `ArtifactBuilderRegistry` writer or allocate the destination. |
| POST `/api/project/artifacts/build`, GET `/api/project/artifacts/build/:id`, POST `/api/project/artifacts/build/:id/cancel` | Common job: every `ArtifactBuilderRegistry` target | Resolved source and destination are canonical identity/conflict keys; builder-reported units are progress. This includes Blueprint, tsPackage, Outcome Library, Stake projection, PAR workbook, and WASM targets. Compatibility URLs expose the common record. |
| `/api/tools/:toolId/...` | Extension contract | No concrete tool handler is installed. A future handler must declare this same classification before dispatch; potentially noticeable handler work must create a common job and must not run request-owned. |

Potentially noticeable rows above are all common-job operations; they are not excused merely because the current implementation awaits I/O. Their existing endpoints remain compatibility
projections while their domain services remain executors.

When leaving a project, Studio asks the server for the complete active job set. The browser names those operations and must confirm the transition; the server rejects an unconfirmed close, Home navigation, or opening/switching to another project with the affected operation names. A new project generation invalidates stale list/start/poll/cancel responses so no response from project A is rendered in project B.
