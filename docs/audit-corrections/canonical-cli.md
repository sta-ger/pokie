# P9-04: canonical public artifact CLI

The public artifact workflow is `pokie build SOURCE --target TARGET`. The real
`registerCliCommands()` tree no longer registers `export`; its separate parser
has been removed. There is no compatibility alias, warning handler, or replacement
artifact command. Removed invocations use ordinary unknown-command handling
(exit 1, stderr diagnostic, empty stdout), including the dispatcher's ordinary
spelling suggestion. Nested `par export` remains public.

| Former artifact operation | Canonical operation |
| --- | --- |
| Outcome bundle | `pokie build SOURCE --target outcomeLibrary` |
| Stake adapter | `pokie build SOURCE --target stakeAdapter` |
| PAR workbook | `pokie build SOURCE --target parWorkbook` |

All six advertised targets remain: `blueprint`, `tsPackage`, `outcomeLibrary`,
`stakeAdapter`, `parWorkbook`, and `wasm`. Recognized projects retain the shared
registry, managed Outcome reuse, exact/seeded sampling policies, manifests,
PAR Blueprint/evidence companions, and ownership-aware publication lifecycle.
Studio and direct library contracts are unchanged.

Standalone Outcome descriptors retain `libraryPath` and streamed `outcomesPath`
with `libraryId`. Stake descriptors retain `libraryPath` and
`bundleDir`/`bundleModeName`, cost, generator metadata, and imported source
provenance. Their relative inputs resolve against the descriptor directory.
`BuildCommand` invokes the existing format adapters' prepared operations through
`ArtifactConversionPlanner`, without another CLI parser. Resolver failures
propagate before fallback; descriptor readers retain their detailed validation
and drift errors. Preview validates source and destination without publication.
SIGINT reaches the shared signal and its listener is removed on every terminal
path. Cancellation cannot report successful publication.

Canonical defaults remain target-named siblings: `outcomeLibrary`, `stakeAdapter`,
`parWorkbook.xlsx`, `tsPackage`, `blueprint.json`, and `game.wasm`. Historical
artifact-command defaults used `outcomelibrary`, `stakeengine`, and a source-named
`.par.xlsx`; maintained examples specify `--out` when those paths matter.

The maintained inventory boundary is [cli-coverage-map.json](cli-coverage-map.json),
with `currentInventory` expectations. The collector defaults to this map and
`npm run check:cli-inventory` writes to `docs/audit-corrections/current-cli-inventory`.
Recursive discovery and rejection of stale documentation remain active, including
correct classification of existing WASM file invocations. P7-01 coverage maps,
PC-05 capability/artifact records, completed campaign receipts, and historical
workbooks retain their original boundary. Current tests explicitly distinguish
those frozen route lists (which include `export`) from the current tree.
Source-backed historical producer checks follow their current canonical owner.

Focused verification uses the 22 permitted non-packaging test files from the
step preflight, through `npm run test:targeted -- <named paths>`, and root
`npm run typecheck` (which includes the Studio compiler). Coverage includes real
registration and fresh compiled binary rejection/help/publication/readback,
standalone descriptor streaming and imported Stake round trips, conflicts,
source/symlink safety, late caller-owned destination claims, drift, cancellation,
large managed builds, the complete build matrix, Studio lifecycle, WASM inspection
and runtime workflows, and current-versus-historical inventory contracts.
The binary helper compiles only production ESM and CLI TypeScript; the inventory
test compiles its isolated production ESM/CJS/CLI boundary. Neither runs packaging
or a release gate.

Verification result: all 22 named non-packaging suites have passing results, including
the stable-tree inventory/interoperability rerun. Root typecheck passed, including
the Studio client boundary.

Installed-binary regressions are added to
`tests/packaging/npmPackSmoke.test.ts`: removed-command rejection and help absence,
representative Outcome/Stake/PAR previews, publication and command readback,
alongside its existing WASM and startup checks. **Installed-package execution is
deferred to the controller's final packaging lifecycle**, as required by the
immutable brief and bounded implementation policy. No installed-package pass is
claimed by this implementation record.

## Independent review repair

Canonical descriptor builds now consume the prepared execution result. Outcome
and Stake writer errors retain their codes and messages; warnings and recovery
suggestions are printed. A missing manifest, validation errors, or a declined
PAR publication returns 1 and never prints a built-success message. The existing
cross-mode provenance fixture now exercises real publication as well as preview.
PAR rejection also exercises the real descriptor fallback for a non-project file
extension, rather than substituting a reader result.

Stake adapters forward the shared cancellation signal into both writers. The
streaming writer checks cancellation between outcomes, during compression
backpressure, and before atomic commit; it closes its streams and removes owned
staging. Both writers check cancellation at the final commit hook, preserving a
prior export and late caller-owned destinations. Two-argument direct exporter
calls remain supported. Descriptor generator metadata survives library-backed,
all-bundle, and mixed publication and importer readback, alongside cost and
imported source provenance. The internal Stake command also cleans its SIGINT
listener if descriptor preparation fails.

The current P805 executable help walk excludes top-level `export`, retains
`par export` and every other route, and reaches its WASM
create/build/inspect/validate/run workflow. Completed campaign evidence and
receipts are unchanged.

Repair verification uses the directly affected BuildCommand, BuildDescriptorCommand,
StakeEngineCommand, StakeEngineExporter, and StakeEngineBundleStreamingExporter
suites, plus bounded CanonicalArtifactCli and P805 executable cases, and root
`npm run typecheck`. The bounded executable selection excludes P805 packaging.
Controller-owned whole-file evidence and installed packaging remain at their
existing lifecycle boundary; this repair does not claim a new packaging pass.

Repair results: the five directly affected suites passed 147 tests. The bounded
CanonicalArtifactCli/P805 selection passed nine executable cases (four unrelated
cases skipped, including packaging). Root typecheck passed, including Studio.
