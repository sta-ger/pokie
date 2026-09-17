# Studio durable jobs

Studio owns the lifecycle of work that can outlive a browser request. The common API is project-scoped: `GET /api/project/jobs`, `GET /api/project/jobs/:id`, `POST /api/project/jobs/:id/cancel`, and `POST /api/project/jobs/:id/recover`.

A job has an immutable project identity, operation, request summary and conflict key. Its progress is a named `stage`, semantic `unit`, `current`, and `total`, rather than a percentage. Terminal records retain timestamps, duration, safe result/provenance/output references and an explicit recovery instruction. IDs cannot be read or cancelled from another project.

The file repository writes each JSON record through a temporary file and rename. On restart, queued/running/cancelling work is marked `recovery-required`: normal work must be retried from scratch because Studio never publishes a partial result. An executor may instead provide the validated `resume` recovery instruction only when it owns an exact immutable checkpoint (currently Outcome Library exact enumeration).

Cancellation is deliberately two-stage. `cancel` records `cancelling` and aborts the executor; it is `cancelled` only after that executor has completed its staging cleanup. A terminal cancellation is idempotent. A conflicting request with the same conflict key and a different immutable request receives a typed conflict with its active job id and retry guidance; an exact retry reattaches to the active record.

## Operation inventory

The following Studio operations are audited as potentially noticeable and use the shared lifecycle contract as their migration boundary. Compatibility URLs remain available while their operation-specific services stay the authoritative executors.

| Operation family | Canonical conflict resource | Progress unit | Restart policy |
| --- | --- | --- | --- |
| Simulation | project and simulation configuration | rounds | retry |
| Replay | project and replay descriptor | rounds | retry |
| Outcome Library generation | bound source/configuration/destination | raw combinations / emitted outcomes | resume only with exact validated checkpoint |
| ArtifactBuilderRegistry targets, including Stake projection | resolved destination | builder-reported units | rebuild |
| Certification deep validation and evidence build | evidence destination | modes, samples, files | rebuild |
| Deployment check/publish | deployment target and delivery request | pipeline stages / artifacts | retry at declared safe boundary |
| Play find-any-win, find-symbol-win, find-free-games | session and search request | attempted spins | new session; retain last settled round |
| Design package build and runtime materialization | canonical source/destination | builder-reported units | rebuild |
| PAR import/export and reel-strip generation | canonical source/destination | files / generated strips | rebuild |

The following remain synchronous because their work has a concrete bounded cost: request validation, metadata/registry reads, single Play spins and draws, constant-size fairness configure/generate/verify, artifact previews, and bounded Blueprint/PAR validation previews. They must not become jobs solely because their implementation happens to use an async filesystem API.

When leaving a project, Studio asks the server for the complete active job set. The browser names those operations and must confirm the transition; the server rejects an unconfirmed close. A new project generation invalidates stale list/start/poll/cancel responses so no response from project A is rendered in project B.
