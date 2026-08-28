# PC-05 — coherent product model and acceptance ownership

## Evidence considered

PC-05 freezes the model at `71f8bfa9`, after the independent records from
PC-02 (fresh installed CLI), PC-03 (blind Studio) and PC-04 (role missions).
Their result is deliberately not collapsed into screenshots: PC-02 contributes
four CLI handoffs, PC-03 contributes one frozen Studio replacement/recovery
finding, and PC-04 establishes that the PAR, package, Outcome Library and
Stake round trips are reachable.  The capability matrix owns every resulting
mismatch and duplicate path.

## Product promise

POKIE helps a game author achieve five user goals:

1. Design an editable game.
2. Make it runnable or make its finite outcome space inspectable.
3. Analyze, replay and audit the chosen result source.
4. Exchange or deploy a derived artifact without implying a lost source can be
   reconstructed.
5. Prove a particular outcome or certify a frozen outcome library.

The internal stages that implement those goals are not user goals: resolve a
path, validate a source, materialize a package, generate/register a compatible
Outcome Library, project records into an adapter format, write atomically, and
then report a result.  A UI and CLI must describe the goal first; they may show
the stage progress as supporting detail.  They must never expose a missing
internal filename as the primary explanation of a user-facing incompatibility.

The canonical source flow is:

```text
Blueprint ──build──> TypeScript package ──run──> session / RoundArtifact
    │                    │                         │
    ├──PAR export/import─┘                         └──best-effort replay
    │                    │
    └──generate──> raw WeightedOutcomeLibrary JSON ──build/materialize──> Outcome Library bundle
                                      │                                      │       │  └──> certification/fairness
                                      └──cancel/resume checkpoint             │       └──> external deployment target
                                                                             └──> Stake Engine export ──import──> Outcome Library
```

Studio's optional symbol artwork follows a separate companion path, rather
than the JSON arrows above:

```text
user PNG ──Studio import/stage──> temporary PNG ──Blueprint Save──> assets/symbols/*.png
                                               │                         │
                                               └──Blueprint.symbolArtwork reference──> Studio endpoint/adapter ──URL callback──> shared renderer
```

The Blueprint remains the editable game-model source and stores only the
project-relative `assets/symbols/...png` reference. `importSymbolArtwork()`
requires a regular PNG with the PNG signature and a size at or below 5 MB,
then stages it outside the Blueprint. `materializeSymbolArtwork()` runs on
both ordinary and managed saves, copying only safe `assets/symbols/` paths
inside the Blueprint's directory. On reopening, `/api/project/symbol-artwork`
first loads the Blueprint's declared map and serves only a declared, contained,
valid PNG. A missing staging file, moved/deleted/corrupt companion or unsafe
reference never becomes a filesystem browse: the endpoint returns no image or
404 and editor/player retain the symbol id. `CanonicalPlayerView` is the
Studio-only adapter that resolves the declared reference through that endpoint
and supplies a URL via `artworkUrlForSymbol`; `cli/client/player/renderPlayer`
only renders that optional caller-supplied URL and neither calls the endpoint
nor recognizes Blueprint artwork references. The author recovers by importing
a replacement and saving, or by removing the stale reference. This is a
durable, user-visible presentation companion with picker-path provenance; it
is not embedded Blueprint JSON and is not a prerequisite for game logic.

Two durable metadata companions make derived Outcome Library discovery survive
process boundaries without becoming source artifacts. For managed compatible
library reuse, `ManagedOutcomeProjectService` atomically writes the
source-adjacent `.pokie/managed-outcome-projects.json`. Its records carry a
canonical bundle path and exact identity tuple (game id/version, configuration
hash, POKIE version and generation kind). CLI and Studio read the same document
but never trust it alone: they reopen the recorded bundle, read its manifest,
resolve it as a project and require that exact tuple before reuse. A moved,
missing, corrupt or incompatible recorded bundle is ignored; a malformed
registry read surfaces for repair rather than authorizing fallback reuse, while
a non-array `projects` field is empty. Registration writes through a temporary
file and rolls the prior document back if later publication fails. Repair or
remove a malformed document and regenerate/register (or verified deterministic
legacy-adopt) the bundle to recover. The recorded root is canonicalized, but is
metadata rather than a containment proof, so manifest/resolver verification is
the security/compatibility boundary.

Studio additionally best-effort writes
`.pokie/outcome-library-registry.json` after a successful Generate bundle
write. It is a project-scoped array of project-relative directory names only;
it contains no outcomes and exists solely so a new Studio server can discover
custom output directories in addition to the conventional `outcomelibrary`.
The index path and each entry pass realpath-aware project containment and
directory checks before any manifest read. Missing, malformed, blank, absolute,
escaping, symlink-escaping or file entries fail open and leave default-directory
discovery intact; a safe indexed directory with a corrupt manifest reports its
own load error. An index write failure does not undo the completed bundle write.
Regenerate to record a directory again, or repair/remove the index and reopen
Studio; repair or rebuild an indexed corrupt bundle before it can be usable.

`pokie generate` is deliberately the first, raw stage: its `--out` value is a
single `WeightedOutcomeLibrary` JSON file, and a cancelled run can persist an
`ExactEnumerationCheckpoint` only when `--resume` was supplied.  Neither file
is a native Outcome Library bundle. `pokie outcomelibrary build` consumes
the canonical user-authored `outcomeLibraryBundleDescriptor` to materialize the
canonical directory bundle. Each descriptor mode names exactly one
`libraryPath` (a raw `WeightedOutcomeLibrary` JSON value) or `outcomesPath`
(canonical JSONL, with `libraryId` and optional `schemaVersion`). Its supported
public entry point is
`pokie export <config.json> --to outcomes --out <dir>`; public
`build --target outcomeLibrary` is separately a recognized-project-source
materialization route, not a way to pass a raw JSON file without a descriptor.
Studio Generate currently combines the raw generation and bundle write in one
request, which is a Studio convenience, not evidence that the CLI raw file is
already a bundle.

These source descriptors are durable prerequisite contracts, not incidental
CLI argument files. `ExportCommand` resolves a recognized project first, then
delegates an unrecognized `--to outcomes` source to
`OutcomeLibraryCommand.loadDescriptor()` and `--to adapter` to
`StakeEngineCommand.loadDescriptor()`. Both resolve relative source paths from
the descriptor directory with `path.resolve`; they do not claim that a
user-authored descriptor is contained inside a project root, and they only read
those inputs. Safe, create-only output publication is a separate writer and
destination contract. A malformed Outcome Library descriptor reports its path
and mode/source violation (including the exclusive `libraryPath`/`outcomesPath`
rule); stale, moved, corrupt, or cross-mode-incompatible sources must be
repaired or regenerated before materialization. The target-oriented export
surface then says that the outcomes source is incompatible and tells the author
to provide valid mode sources rather than leaking parser internals.

The parallel `stakeEngineExportDescriptor` is a distinct durable
user-authored prerequisite: every mode has a string name, numeric cost, and
exactly one `libraryPath` raw JSON source or `bundleDir` native Outcome Library
source; `bundleModeName` optionally selects a different bundle mode and
otherwise defaults to the descriptor mode name. It supports more than the
Stake-import convenience config: raw libraries and native bundles are both
valid source forms. `StakeEngineCommand.loadDescriptor()` reports unreadable or
malformed configs and invalid exclusive source selections with its Stake export
config hint; resolved modes then pass `StakeEngineExportValidator`. Rebuild or
restore stale named libraries/bundles, repair name/cost/source entries, and use
a new safe output directory when needed. The POKIE-created
`stakeImportReExportConfig` (`config.json` beside a reconstructed imported
Outcome Library) is deliberately separate: it is a bundleDir-only specialization
written by `StakeEngineImportWriter` to preserve imported mode/cost selectors
for convenient re-export. It is not the canonical generic descriptor and does
not erase user-authored `libraryPath` descriptors. If that companion is moved,
stale, malformed, or incompatible, normal Stake descriptor diagnostics apply;
repair a generic config or re-import the valid POKIE Stake directory to recreate
it.

The two branches have different guarantees.  A TypeScript package executes
game logic; native Outcome Library operations select pre-generated outcomes.
The latter can be exact only when the descriptor retains matching library hash,
mode, seed and round.  A Stake export remains analyzable but read-only until
converted back to a native library.  PAR is editable exchange input, not a
runnable project.  WASM is metadata inspection only.

The registry also separates durable artifacts from helper values that once
appeared as artifact-like relationship labels. A Stake import is an operation,
not a third output beside its reconstructed Outcome Library and its
`config.json`/optional `source-provenance.json` companions. A Studio replay
download is a delivery envelope for the canonical replay descriptor, and WASM
packaging preflight is advisory in-memory analysis, not a WASM build. A
multi-mode simulation is a distinct per-mode report set and never a blended
result. These classifications keep the inventory closed without inventing
formats POKIE does not persist.

Persisted public result outputs are also inventory entries, even though they
are not source projects or conversion prerequisites: `ValidateReport`, single
and per-mode simulation comparisons, outcome-source comparisons, standalone
Stake analysis and comparison reports, outcome-source analysis renderings, and
simulation renderings. Their `--out` paths preserve an observation of named
inputs, not a new runnable or importable source. They must be regenerated when
those inputs change; a result JSON must never be passed off as a Blueprint,
Outcome Library, Stake directory, simulation input, or replay descriptor.
The registry names the producer, allowed consumer, provenance, stale rule,
compatibility boundary and recovery path for each result class.

To keep this promise auditable as commands evolve,
`artifact-registry.json` has a `persisted_public_output_contracts` ledger. It
enumerates every public `--out` and cancellation-only `--resume` writer and
every default-destination writer, the command implementation that exposes it,
the artifact it produces and the condition under which it is persisted. This
includes `init`'s package, confirmed `edit`, conditional reel `--apply` and
`--materialize`, PAR and dispatched import defaults, target-specific build and
public export defaults, Stake import and certification, as well as source
artifacts such as Blueprints and bundles and terminal result records. A new
writer is not an undocumented convenience: it must enter that ledger and point
to an artifact with the applicable lifecycle contract. The contract test audits
the relevant source write/default branches directly, so a command can no longer
evade the ledger merely by exposing no `--out` flag.

## Loss, provenance, stale and compatibility rules

| Situation | Required product meaning | Required diagnostic / recovery |
| --- | --- | --- |
| A source is of the wrong artifact kind | Do not infer conversion from an internal missing file. | Name the supplied kind, supported kinds and a next action. |
| A conversion loses game-model information | Stake import reconstructs outcomes, not the original Blueprint; adapter output never promises model recovery. | State the loss before/after conversion and preserve source hash/provenance where available. |
| A result’s source changed | Derived package/library/report/replay/certification result is stale, not silently current. | Mark stale or clear it before a dependent action; offer revalidate/rebuild/replay with the current source. |
| Exact replay/proof/certification has incompatible provenance | Hash, mode, source and relevant commitment identity are contracts. | Fail closed; state which identity disagrees and require the matching source/descriptor. |
| A destination exists or is unsafe | No output may replace an unrelated artifact. | Refuse atomically and say whether a different `--out` or empty destination is needed. |
| A capability is absent by design | WASM has no POKIE producer/runtime; generic Stake has no native draw contract. | State the boundary and the supported alternative, never imply a hidden command. |

## Systemic defect taxonomy

| Taxon | Definition | Current instances | Acceptance owner |
| --- | --- | --- | --- |
| Capability contradiction | Two public surfaces assert incompatible prerequisites/availability. | PC-05-CLI-01; package vs Outcome Library run semantics. | PC-06 |
| Grammar/output divergence | Rendered help or generated follow-up command differs from parser/shell reality. | PC-05-CLI-03; PC-05-CLI-04 remains as immutable historical evidence but was remediated in PC-04 (`afb072d4523b65d04166b4ac53e1ff34f3dfd3bf`). | PC-15 |
| Artifact-kind diagnostic failure | Failure names an implementation shape instead of the user artifact and recovery. | PC-05-CLI-02. | PC-06 |
| Destructive/replacement recovery failure | An import/open action destroys or replaces editable context without an explained recovery. | PC-05-STUDIO-01. | PC-16 |
| Cross-surface capability asymmetry | One client offers a lifecycle subset without an explicit handoff/boundary. | PC-05-STUDIO-02: certification verify; deployment CLI absence. | PC-11 |
| Public pipeline handoff | A public operation writes a durable intermediate whose next canonical materialization stage is hidden or misnamed. | PC-05-HANDOFF-01: raw `generate` JSON/checkpoint versus bundle build; Studio combines the stages. | PC-09 |
| Descriptor-prerequisite omission | A durable user-authored descriptor is confused with one producer-specific generated companion, so valid source forms and recovery disappear from the product contract. | PC-05 inventory correction: Outcome Library bundle descriptor and generic Stake Engine export descriptor; Stake-import `config.json` remains a distinct bundleDir-only companion. No open product mismatch. | Closed by PC-05 model inventory |
| Duplicate conversion ownership | Product-domain, public CLI and Studio entry points must not independently define one conversion contract. | PC-05-DUP-01A Outcome Library; PC-05-DUP-01B Stake; PC-05-DUP-01C PAR; PC-05-DUP-01D public CLI aliases; PC-05-DUP-01E Studio controls. | PC-09 / PC-10 / PC-11 / PC-15 / PC-16 |
| Runtime-source semantic duplication | The same verb means runtime execution for one source and pre-generated selection for another. | PC-05-DUP-02: simulation/replay/serve. | PC-06 |
| Validation surface asymmetry | Clients expose different portions of a target-specific validation lifecycle. | PC-05-DUP-03A/B: Blueprint/library/Stake/certification validation. | PC-06 / PC-11 |
| Documentation/contract drift | Docs, defaults, presentation and shared resolver are maintained separately. | PC-05-DOC-01A: public CLI/help/generated-action prerequisite claims; PC-05-DOC-01B: WASM boundary. | PC-15 / PC-13 |
| Persisted companion lifecycle omission | A user-visible file or durable metadata beside a source document is omitted because its reference is stored elsewhere or it is treated as process-local state. | PC-05 inventory correction: Studio Symbol Artwork PNG is staged/materialized beside Blueprint; managed Outcome compatibility registry and Studio Outcome Library discovery index retain only verified/discovery metadata with explicit corruption, containment and recovery rules. No open product mismatch. | Closed by PC-05 model inventory |

## Acceptance ownership

PC-05 itself changes no product behavior.  It supplies the fixed registry,
matrix, taxonomy and closure ledger required before remediation.  Later work
must close an owned row rather than merely create a new observation:

| Step | Owns | Required proof |
| --- | --- | --- |
| PC-06 CLI capability, validation and provenance sweep | CLI-01, CLI-02, DUP-02 and DUP-03A; CLI-04 is already remediated in PC-04 | focused CLI contracts exercise accepted/default/rejected forms and source kind recovery |
| PC-09 Outcome Library sweep | raw-generation/bundle handoff (HANDOFF-01) and Outcome Library conversion contract (DUP-01A) | raw generation/checkpoint/resume, descriptor materialization, bundle validation and conversion diagnostics agree |
| PC-10 Stake export sweep | Stake conversion contract (DUP-01B) | export prerequisites, provenance and output safety agree |
| PC-11 PAR and Studio validation/certification sweep | PAR conversion contract (DUP-01C); Studio certification verification handoff and validation controls (STUDIO-02, DUP-03B) | PAR exchange preserves its explicit boundary; controls, disabled states and explicit CLI handoffs match the matrix |
| PC-15 public CLI/help/docs sweep | generated-command recovery (CLI-03), public CLI conversion aliases (DUP-01D) and public-documentation alignment (DOC-01A) | parser, help, generated actions and public docs agree on canonical routes, prerequisites and recovery |
| PC-13 WASM boundary sweep | DOC-01B WASM docs, resolver and Studio boundary | all surfaces agree on inspection-only support and exclusions |
| PC-16 Studio sweep | saved-design replacement/recovery (STUDIO-01) and Studio conversion controls (DUP-01E) | selection retains recoverable context; Studio exposes one discoverable control per goal or explicit delegation with matching states |

No row is closed by a screenshot alone.  It closes only when the affected
goal, persisted observable result, failure/disabled path and provenance rule
all agree across the entry points named in the matrix.
