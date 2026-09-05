# Product-semantic audit

| User moment | Shipped user-goal wording and recovery | Boundary protected by the audit |
| --- | --- | --- |
| A game cannot open or run | Explain that the game could not be opened/prepared, name the safe planner diagnostic when available, and offer reopen/rebuild/retry | No cache marker, materialization directory, resolver implementation name, or registry path is a user prerequisite. |
| Generate outcomes | CLI calls its result raw weighted-outcome JSON and explains descriptor materialization; Studio calls its result a canonical bundle | A raw JSON file, checkpoint and internal job record are not presented as runnable bundles. |
| A conversion cannot start | State the goal, actual invalid/conflict reason and next supported action; preserve an existing destination | `ArtifactConversionPlanner`/registry checks are shared, while Studio does not ask for their internal identifiers. |
| A job is cancelled, restarted, evicted, stale or project-switched | Explain whether it can be resumed or must be rerun, and retain only the documented user context | Process-local simulation/replay/artifact/play state and retained Outcome Library checkpoints have intentionally different lifetimes. |
| A result is downloaded | Offer the completed report/descriptor/manifest as a delivery artifact with a browser-selected save location | A download, report or Blob never becomes a project input, readiness prerequisite or server-side destination. |
| A legacy deep link is used | Move to the single retained tab and display where the goal now lives | Each migration notice does not recreate retired workflows or expose implementation-only routes. |
| A source is Stake or WASM | Explain analysis-only Stake and inspection-only WASM limits, including the next supported action | Similar names never imply runtime, sampling, build or logic-validation capability. |

The corresponding browser and service tests exercise disabled/recovery states,
project-context transitions, cancellation/download boundaries, and the
retired-route recovery path against real Studio HTTP. This audit therefore
classifies results by observable user goal rather than by a cache, registry,
checkpoint, browser Blob, generated-job id, or intermediate filename.
