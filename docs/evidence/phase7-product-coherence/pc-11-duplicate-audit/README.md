# PC-11 Studio duplicate-capability audit

This is the retained-owner inventory for Studio. It deliberately distinguishes operations that share a source
from operations that happen to produce a related artifact: a link may delegate to the named owner, but it must
not recreate its defaults, validation, destination, cancellation, or recovery policy.

## Retained owners and contracts

| User operation | One retained Studio owner and domain path | Purpose, prerequisite, default/destination, and recovery |
| --- | --- | --- |
| Create, register, open, relocate, or remove a project | Home **Projects**; `StudioProjectRegistrationService` and `FileStudioProjectRegistry` | Register persists an already-recognized source; save-managed creates a managed Blueprint instead. Paths are canonicalized and re-resolved. A missing project stays visible for relocate/remove; opening a failed path returns to Projects without closing another active project. |
| Edit, validate, save, and save-managed a Blueprint | Home **Design Game**; `StudioBlueprintService` | The guided editor owns the current Blueprint and `GameBlueprintValidator` result. Save-managed creates the managed workspace; errors block dependent build while warnings are non-blocking where the server permits. Changed inputs invalidate prior ready/build state. |
| Exchange a PAR workbook | Design Game **PAR Sheet Import/Export**; `StudioBlueprintService`, `ParSheetImporter`, `ParSheetExporter` | Current-Blueprint exchange that preserves imported-workbook provenance. Its default is the Blueprint-adjacent workbook path. Invalid workbook recovery is explicit; it is not artifact republishing. |
| Materialize or republish a product artifact | Dashboard **Build/Export**; `StudioArtifactBuildService` | The artifact planner alone owns target availability, output defaults, source conversion, and destination. Unsupported pairs show the planner diagnostic rather than a client-only substitute. |
| Generate an Outcome Library | Dashboard **Build/Export** Outcome Library card; `StudioOutcomeLibraryGenerateJobService` | A cancellable job with its canonical output directory and resumable checkpoint policy. It is distinct from generic artifact building, raw CLI generation, and Outcome-source inspection. Cancellation removes staging output and retry/resume uses the same job contract. |
| Inspect, sample, analyze, or compare an existing Outcome source | Dashboard **Overview** / `OutcomeSourceOverview`; canonical Outcome-source reader services | Read/analysis work for an opened native library or Stake source, not a Build/Export generation action. Unsupported draw/runtime paths remain unavailable with a capability explanation. |
| Export Stake Engine files | Dashboard **Build/Export** Stake card; `StudioStakeEngineExportService` | Uses the shared project-contained `librarySelector`, named-mode matching, and overwrite/publication contract. A stale, escaping, or mismatched selector is rejected with regeneration/selection recovery. |
| Preview or publish remote deployment | Dashboard **Build/Export** Remote delivery card; `StudioDeploymentService` | Uses the same submit-path selector validation, but `publish: false` preflight and `publish: true` delivery are distinct. Target, mode, cost, and publication prerequisites are not inherited from Stake export. |
| Validate a loaded project | Dashboard **Overview** diagnostics; `POST /api/project/validate` | The server report drives displayed ready/blocked state. Revalidation replaces stale success. Export, PAR, Stake, deployment, and certification retain target-specific server validation. |
| Play, simulate, inspect reports, and replay | Dashboard **Play**, **Simulation**, and **Replay**; `StudioPlayService`, `StudioSimulationService`, `StudioReplayExecutionService` | Runtime projects and native sources have separate capability boundaries. Active jobs are process-local; only completed reports/descriptors download. Cancel then rerun is recovery; stale IDs are rejected after project switch, close, or shutdown. |
| Build and inspect certification evidence | Dashboard **Certification**; `StudioCertificationService` | Requires a native Outcome Library, validated source bundle, and evidence output directory. Source/mode/output changes invalidate prior state. Browser manifest download is delivery only, never verification. |
| Verify existing certification evidence | Certification CLI handoff: `pokie certification verify <certDir> --source <bundleDir>` | Studio displays the canonical verifier after a successful build. Run it from the project directory with the same live unchanged source; if source/evidence changed, rebuild before verification. |
| Prove fairness | Dashboard **Provably Fair**; fairness service/verifier | Runtime integration with private-seed and matching commitment/source prerequisites; it is neither project validation nor certification. Mismatch fails closed without revealing the seed. |

## Public route and launcher policy

`pokie`, `pokie <projectRoot>`, and internal `pokie __studio [projectRoot] [--host] [--port] [--no-open]`
enter the same Studio server/context flow. `pokie studio` is intentionally not a public duplicate command.
Supported routes are `#/`, `#/home/design`, `#/home/projects`, and scoped `#/project/:projectRoot/:tab`.
Legacy `#/project/:tab` first resolves the current project and replaces its history entry with a scoped URL.

| Retired route, in legacy and scoped form | Destination | Observable recovery |
| --- | --- | --- |
| `deployment` | Build/Export | Explains that Remote delivery owns target preflight/publish. |
| `stakeEngineExport` | Build/Export | Explains that the Stake Engine artifact card owns export. |
| `outcomeLibraries` | Overview | Explains that its retired select-existing/inspect/compare task has no Build/Export equivalent; inspect the opened outcome source in Overview or use CLI outcome-source comparison commands. |
| `validate`, `validation`, obsolete Validate routes | Overview | Explains that validation is now Overview diagnostics and offers revalidation after a change. |
| unknown removed tab | Overview | Does not guess an equivalent operation; the route is replaced with the safe scoped Overview URL. |

No retired component mounts. In particular, Outcome Libraries does **not** redirect to Build/Export: that
would falsely present generation as equivalent to the retired inspect/compare task.

## Convergence evidence

The bounded PC-11 targeted tests cover retained-entrypoint outputs, shared readiness, selector containment,
cancellation/staging cleanup, retry/resume, project-switch/shutdown invalidation, and legacy-route migration.
Those service and browser checks are evidence; screenshots are not a substitute for actual job results.
