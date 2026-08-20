# P6R-05 independent final review

Candidate baseline: `d9737dbcbfa694338b444bf59aa8ef63387c0463`.

## Result

The current P6R-05 correction's bounded materializer recovery contract passed
in the required single serial complete-file command (two suites and 37 tests):

```text
npm run test:targeted -- tests/cli/materialize/BlueprintProjectMaterializer.offline.integration.test.ts tests/cli/materialize/BlueprintProjectMaterializer.test.ts
```

The offline production-resolver case exhausts both dependency-install attempts,
observes a `BlueprintMaterializationError`, confirms the cache root is empty,
then builds through a fresh staging directory and borrows that ready cache entry
without another install. The unit file independently exhausts two dependency
attempts, checks cleanup and typed failure, then verifies that the successful
retry is borrowed without a second install.

The exercised production path is
`createMaterializingRuntimePackageResolver()` through
`BlueprintProjectMaterializer.runDependenciesPhase()` and its staging-directory
cleanup in `materializeUnderLock()`: the resolver propagates the typed failure
without yielding a runtime path, while the next caller creates and then reuses
the verified cache entry.

The retry-exhaustion boundary retains the final failed command result while it
performs the bounded attempts, then constructs `BlueprintMaterializationError`
outside that attempt's `catch`. This prevents an arbitrary runner rejection
from escaping after cleanup, while the enclosing staging cleanup removes the
unpublished directory before the per-key lock is released. The two materializer
test files exercise that exact public resolver/materializer boundary, the empty
cache observation, a fresh succeeding call, and its subsequent cache borrow.

No official release or packaging gate was run.  This index records the current
source, machine-owned coverage, and retained P6R-04 rendered evidence; it does
not substitute for the post-approval lifecycle gate.

The retained P6R-01--P6R-04 independent review found no unresolved P0, P1, or
material P2 in those inspected surfaces. This correction reopens only the
materializer recovery contract documented above.

## P6R-01 through P6R-04 criterion traceability

Each row below is one immutable acceptance criterion, not a step summary.  The
**machine-owned whole-file output** column names the retained runner record,
including its exact complete-file invocation; it is deliberately distinct from
the current source/test path.  Those records belong to their original
candidate and are not reclassified as a P6R-05 rerun.

| Criterion | Current source and boundary | Retained machine-owned whole-file output | Rendered evidence / not-applicable rationale |
| --- | --- | --- | --- |
| P6R-01 — product-led, task-oriented Build/Export cards and unsupported-target guidance | `cli/studio-client/src/components/project/ExportDeployTab.tsx` and `domain/interpret/ExportDeployTargets.ts` keep primary cards task-led, place implementation details in `AdvancedDisclosure`, and show an unavailable reason. `tests/cli/studio-client/src/components/project/ProjectDashboardPage.exportDeploy.test.tsx` exercises the card, keyboard disclosure, unavailable target, remote delivery, and preflight paths. | `../../evidence/p6-14-capability-whole-file-evidence/machine-results.txt`: retained `npm run test:targeted` output lists this complete `ProjectDashboardPage.exportDeploy.test.tsx` file and reports 11 suites / 1,409 tests passed. | `../p6r-04-independent-current-preflight-7018be26-20260820/browser-transcript.txt` and `build-export-complete-preflight.png` record the completed Outcome-library card, item/byte preflight, warning, and enabled post-build actions (SHA-256 `b5603e1c2693cd787a58f35890fd1d9620da19423672f172f4fb2f0fe73a7776`). |
| P6R-01 — compact Project-header identity with explicit, on-demand path disclosure | `cli/studio-client/src/components/project/ProjectDashboardPage.tsx` renders name/id/version as header identity and places the path and Copy path action behind `AdvancedDisclosure`. `tests/cli/studio-client/src/components/project/ProjectDashboardPage.test.tsx` verifies the hidden initial path, keyboard opening, and copy control. | `../p6r-04-independent-rendered-verification-398e62df-20260820-final/targeted-results.txt`: retained complete `tests/cli/studio/StudioServer.test.ts` output, 279/279 passing, covering the public Studio server boundary that supplies the resolved project header. | `../p6r-04-independent-rendered-verification-d66fb1a4-20260820/replay-disclosures.png` and its `browser-transcript.txt` retain the separate rendered Project location disclosure alongside Replay advanced data; the header path is therefore not primary workspace chrome. |
| P6R-02 — visual per-reel controls are the primary Modeler workflow | `cli/studio-client/src/components/blueprintEditor/ReelStripGenerationEditor.tsx` and `BlueprintEditorPage.tsx` provide reel selection, generated/literal controls, presets, spacing, occurrence, stack rules, and stop-window preview. `tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.reelStripModeler.test.tsx` covers those visual controls and the generated preview/apply boundary. | `../p6r-04-independent-verification-398e62df/targeted-results.txt`: retained serial complete-file output names `BlueprintEditorPage.reelStripModeler.test.tsx` among the eight full files and records exit status 0. | `../p6r-04-independent-rendered-verification-d66fb1a4-20260820/modeler-advanced.png` (SHA-256 `3511fefb5e8ede358ee6dcb97b62dee76d57df508cee3e4b2fd1534aee9c4b6b`) and its transcript record visual spacing/preset/stack controls and a successful generated strip. |
| P6R-02 — Advanced JSON round-trip and malformed-input recovery do not corrupt the visual draft | `ReelStripGenerationEditor.tsx` owns the constraints disclosure and parse/recovery behavior; `BlueprintEditorPage.reelStripModeler.test.tsx` specifically edits a visual constraint, round-trips it through Advanced JSON, rejects malformed JSON without a request, and recovers the visual draft. | `../p6r-04-independent-verification-398e62df/targeted-results.txt`: retained serial complete-file output for the same full `BlueprintEditorPage.reelStripModeler.test.tsx` file, exit status 0. | `../p6r-04-independent-rendered-verification-d66fb1a4-20260820/browser-transcript.txt` records opening constraints Advanced details after visual editing. The malformed-input recovery is intentionally machine-asserted rather than screenshot-derived: a static image cannot establish that no request was sent or that the draft remained intact. |
| P6R-02 — Preview, Done, shared Save, and remount retain the applied reel | `BlueprintEditorPage.tsx` connects the Modeler result to the shared Game Model save; `BlueprintEditorPage.reelStripModeler.test.tsx` completes Preview → Apply/Done → Save and asserts the applied generated reel after remount. | `../p6r-04-independent-verification-398e62df/targeted-results.txt`: retained serial complete-file output for the full Modeler suite, exit status 0. | `../p6r-04-independent-rendered-verification-d66fb1a4-20260820/browser-transcript.txt` records successful preview, stop-window inspection, Apply, and Save. The persisted remount assertion is not visually inferable, so its applicable evidence is the retained machine-owned complete-file result. |
| P6R-03 — public client labels are supported product labels, while genuine no-write/compatibility language remains precise | `cli/client/clientPresentation.ts`, `cli/client/index.html`, `cli/client/main.ts`, and root `README.md` provide the public labels. `tests/cli/client/clientPresentation.test.ts` rejects stale status words and separately permits the no-write preview and compatibility terms. | `../../phase6-final-polishing/p6-20-targeted-verification-20260820/README.md`: retained machine-owned complete-file `npm run test:targeted` record at its evidence SHA, used as the preserved client/runtime regression output boundary; the current criterion's precise static assertions remain in `clientPresentation.test.ts`. | Not applicable: this is a static public-presentation contract. The visible browser evidence needed for a Studio workflow cannot demonstrate the negative stale-label scan more completely than the machine assertion. |
| P6R-03 — final-evidence index classifies candidate-scoped proof, superseded boundaries, and immutable history without claiming completion | `docs/phase6-final-polishing/p6-20-final-verification.md` is the current evidence-index source; its linked candidate records are deliberately classified rather than collapsed into a release claim. | `../../phase6-final-polishing/p6-20-targeted-verification-20260820/README.md`: retained machine-owned complete-file targeted-run record at its stated candidate SHA; it is the candidate-scoped output the index classifies, not a fabricated current-release result. | Not applicable: evidence classification is a documentation-governance criterion, not a rendered product surface. |
| P6R-03 — evidence preservation remains bounded and does not rewrite immutable history | `docs/phase6-final-polishing/p6-20-final-verification.md` explicitly retains P6-15–P6-19 and all tracked P6-20 records as immutable history; it makes no pruning or replacement claim. | `../../phase6-final-polishing/p6-20-targeted-verification-20260820/README.md`: retained complete-file machine output remains linked as candidate evidence, demonstrating the bounded index has not replaced its underlying record. | Not applicable: preservation scope is an audit-trail constraint. The retained source/index and output record are the observable evidence; no Studio screenshot can prove non-deletion of history. |
| P6R-04 — cold-start complete workflow reaches Modeler, Play, Simulation, Replay, outcome generation, and Stake export | `cli/studio/StudioServer.ts`, `cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.tsx`, and Project Dashboard workflow tabs are exercised by `StudioServer.test.ts`, `BlueprintEditorPage.reelStripModeler.test.tsx`, play/simulation/replay/export workflow suites, `ProjectsPanel.test.tsx`, and `happyPath.test.tsx`. | `../p6r-04-independent-verification-398e62df/targeted-results.txt`: retained serial complete-file output names all eight workflow/server files and records exit status 0; `../p6r-04-independent-rendered-verification-398e62df-20260820-final/targeted-results.txt` independently retains the final complete `StudioServer.test.ts` result (279/279). | `../p6r-04-independent-rendered-verification-398e62df-20260820-final/browser-transcript.txt` records fresh-root create/open, Modeler, Play spin, 25-round Simulation, seeded Replay, 1,024 outcomes, and Stake export with no rendered product error. |
| P6R-04 — desktop and approximately-405px Projects and Build/Export surfaces remain inspectable | `cli/studio-client/src/components/layout/AppShellLayout.tsx`, `global.css`, `components/home/ProjectsPanel.tsx`, and `ExportDeployTab.tsx` provide the responsive surfaces; `ProjectsPanel.test.tsx` covers labelled narrow-card actions. | `../p6r-04-independent-verification-398e62df/targeted-results.txt`: retained complete-file workflow invocation includes the full `ProjectsPanel.test.tsx` file and records exit status 0. | `../p6r-04-independent-rendered-verification-398e62df-20260820-final/README.md` checksums `projects-desktop.png`, `projects-405px.png`, `build-export-desktop.png`, and `build-export-405px.png`; the transcript records their capture after the completed workflow. |
| P6R-04 — primary-UI audit keeps project location, Replay raw data, and technical target details out of primary controls | `ProjectDashboardPage.tsx`, `components/common/AdvancedDisclosure.tsx`, and `ExportDeployTab.tsx` own the disclosures; `ProjectDashboardPage.test.tsx`, replay workflow tests, and `ProjectDashboardPage.exportDeploy.test.tsx` exercise their separated labels and keyboard reachability. | `../p6r-04-independent-verification-398e62df/targeted-results.txt`: retained complete-file workflow/server output, exit status 0; `../../evidence/p6-14-capability-whole-file-evidence/machine-results.txt` additionally retains the complete export/deploy suite as a named passing path. | `../p6r-04-independent-rendered-verification-d66fb1a4-20260820/replay-disclosures.png` and transcript show Project location and Replay Advanced details together, while `modeler-advanced.png` records the same disclosure pattern on the Modeler surface. |
| P6R-04 — material findings were preserved, fixed, and rerun to closure | Current sources are the repaired boundaries in `cli/studio-client/src/hooks/useOpenProject.ts`, `ProjectDashboardPage.tsx`, `AppShellLayout.tsx`, `global.css`, `cli/studio/StudioServer.ts`, and `ExportDeployTab.tsx`; their regression coverage is the same complete workflow/server set above. | `../p6r-04-independent-rendered-verification-398e62df-20260820-final/targeted-results.txt`: retained final whole-file `StudioServer.test.ts` output, 279/279 passing. The earlier `../p6r-04-independent-verification-3a0ef737/README.md` remains the preserved P2 finding record rather than being overwritten. | The final `398e62df-20260820-final` transcript and four checksummed desktop/405px screenshots are the closure rerun; they supersede neither the preserved finding record nor any prior-step evidence. |

### Separate P6R-05 recovery boundary

The P6R-05 materializer recovery correction remains the materializer-only
boundary described in the Result section above: `BlueprintProjectMaterializer`
and its two 37-passing test files are not evidence for any P6R-04 criterion.
The index records no unresolved P0, P1, or material P2 in the P6R-01–P6R-04
surfaces. Historical P2 finding records remain retained as closed findings,
not unresolved defects.

The cited rendered evidence was captured on P6R-04 candidate predecessors that
are ancestors of this candidate; this P6R-05 targeted verification did not
start Studio or a browser. No generated output, profiles, raw logs, or copied
screenshots are retained here.
