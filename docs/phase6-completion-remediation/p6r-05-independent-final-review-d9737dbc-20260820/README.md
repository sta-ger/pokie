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

This follow-up is a documentation-only correction to the traceability map. It
makes no release, lifecycle, or defect-severity conclusion beyond the twelve
criterion-to-evidence mappings below.

## P6R-01 through P6R-04 criterion traceability

The table has exactly twelve rows: P6R-01 AC1--AC3, P6R-02 AC1--AC3,
P6R-03 AC1--AC3, and P6R-04 AC1--AC3. Each row is one immutable acceptance
criterion, rather than a step summary or substitute for another criterion.
The **machine-owned whole-file output** column identifies the retained runner
record when that record contains the relevant complete test file. It is
deliberately distinct from the current source and test path. Those records
belong to their original candidates and are not reclassified as a P6R-05
rerun.

| Criterion | Current source and boundary | Retained machine-owned whole-file output | Rendered evidence / not-applicable rationale |
| --- | --- | --- | --- |
| P6R-01 AC1 — product-led, task-oriented Build/Export cards | `cli/studio-client/src/components/project/ExportDeployTab.tsx` and `domain/interpret/ExportDeployTargets.ts` present output and delivery work in product language and reserve adapter, protocol, capabilities, limits, and compatibility for `AdvancedDisclosure`; `tests/cli/studio-client/src/components/project/ProjectDashboardPage.exportDeploy.test.tsx` exercises cards, keyboard disclosure, remote delivery, and preflight. | `../../evidence/p6-14-capability-whole-file-evidence/machine-results.txt` records the complete `ProjectDashboardPage.exportDeploy.test.tsx` suite in a passing 11-suite / 1,409-test invocation. | `../p6r-04-independent-current-preflight-7018be26-20260820/browser-transcript.txt` and `build-export-complete-preflight.png` show the completed Outcome-library card, item/byte preflight, warning, and enabled post-build actions (SHA-256 `b5603e1c2693cd787a58f35890fd1d9620da19423672f172f4fb2f0fe73a7776`). |
| P6R-01 AC2 — compact Project-header identity with an on-demand path | `cli/studio-client/src/components/project/ProjectDashboardPage.tsx` renders name/id/version as header identity and places the path and Copy path action behind `AdvancedDisclosure`; `tests/cli/studio-client/src/components/project/ProjectDashboardPage.test.tsx` verifies the initially hidden path, keyboard opening, and copy control. | No retained P6R whole-file output names this narrow header suite. The independently rerun current `ProjectDashboardPage.test.tsx` is the machine-owned boundary for this criterion; the final `StudioServer.test.ts` record is not treated as a substitute UI assertion. | `../p6r-04-independent-rendered-verification-d66fb1a4-20260820/replay-disclosures.png` and its `browser-transcript.txt` retain the rendered Project location disclosure beside Replay Advanced data, rather than primary workspace chrome. |
| P6R-01 AC3 — unsupported targets give an explicit next step | `ExportDeployTargets.ts` supplies target-specific unavailable reasons and `ExportDeployTab.tsx` renders them before advanced technical detail; `tests/cli/studio-client/src/domain/interpret/ExportDeployTargets.test.ts` and `ProjectDashboardPage.exportDeploy.test.tsx` cover fallback reasons and their visible card boundary. | `../../evidence/p6-14-capability-whole-file-evidence/machine-results.txt` records the complete export/deploy suite passing; the narrow interpreter test is independently rerun as the current direct machine assertion for target-specific fallback prose. | `../p6r-04-independent-current-preflight-7018be26-20260820/browser-transcript.txt` records the rendered Build/Export card and preflight path. A screenshot cannot establish every target-specific fallback branch, so those branches are machine-asserted. |
| P6R-02 AC1 — visual per-reel controls are the primary Modeler workflow | `cli/studio-client/src/components/blueprintEditor/ReelStripGenerationEditor.tsx` and `BlueprintEditorPage.tsx` provide reel selection, generated/literal controls, presets, spacing, occurrence, stack rules, and stop-window preview; `BlueprintEditorPage.reelStripModeler.test.tsx` covers the visual controls and generated preview/apply boundary. | `../p6r-04-independent-verification-398e62df/targeted-results.txt` names the complete Modeler file in its passing serial eight-file invocation. | `../p6r-04-independent-rendered-verification-d66fb1a4-20260820/modeler-advanced.png` (SHA-256 `3511fefb5e8ede358ee6dcb97b62dee76d57df508cee3e4b2fd1534aee9c4b6b`) and its transcript show visual spacing, preset, stack controls, and a generated strip. |
| P6R-02 AC2 — Advanced JSON round-trip and malformed-input recovery preserve the visual draft | `ReelStripGenerationEditor.tsx` owns the constraints disclosure and parse/recovery behavior; `BlueprintEditorPage.reelStripModeler.test.tsx` round-trips a visual constraint, rejects malformed JSON without a request, and recovers the draft. | `../p6r-04-independent-verification-398e62df/targeted-results.txt` records the complete Modeler suite passing. | `../p6r-04-independent-rendered-verification-d66fb1a4-20260820/browser-transcript.txt` records opening constraints Advanced details after visual editing. The no-request and draft-preservation branches require the machine assertion; a screenshot cannot establish them. |
| P6R-02 AC3 — Preview, Done, shared Save, and remount retain the applied reel | `BlueprintEditorPage.tsx` connects Modeler output to the shared Game Model save; `BlueprintEditorPage.reelStripModeler.test.tsx` completes Preview → Apply/Done → Save and asserts the applied generated reel after remount. | `../p6r-04-independent-verification-398e62df/targeted-results.txt` records the complete Modeler suite passing. | `../p6r-04-independent-rendered-verification-d66fb1a4-20260820/browser-transcript.txt` records preview, stop-window inspection, Apply, and Save. The remount persistence assertion is machine-only because it is not visible in one image. |
| P6R-03 AC1 — public client labels are supported product labels, with precise no-write and compatibility language | `cli/client/clientPresentation.ts`, `cli/client/index.html`, `cli/client/main.ts`, and root `README.md` provide the labels; `tests/cli/client/clientPresentation.test.ts` rejects stale status words while permitting the precise no-write and compatibility terms. | The narrow `clientPresentation.test.ts` is the current machine-owned assertion. `../../phase6-final-polishing/p6-20-targeted-verification-20260820/README.md` is retained candidate-scoped runtime evidence, but does not stand in for this separate label test. | Not applicable: this static negative-label contract cannot be demonstrated more completely by a Studio screenshot than by its machine assertion. |
| P6R-03 AC2 — the final-evidence index classifies candidate proof, superseded boundaries, and immutable history without claiming completion | `docs/phase6-final-polishing/p6-20-final-verification.md` is the current evidence-index source and its links retain each boundary's classification. | `../../phase6-final-polishing/p6-20-targeted-verification-20260820/README.md` is the retained complete-file targeted-run record at its stated candidate SHA; the index classifies it rather than recasting it as current-release proof. | Not applicable: this is documentation-governance scope, not a rendered product surface. |
| P6R-03 AC3 — evidence preservation remains bounded and does not rewrite immutable history | `docs/phase6-final-polishing/p6-20-final-verification.md` retains P6-15–P6-19 and all tracked P6-20 records without a pruning or replacement claim. | `../../phase6-final-polishing/p6-20-targeted-verification-20260820/README.md` remains linked as its original candidate-scoped machine output; this map neither moves nor reclassifies it. | Not applicable: retention scope is established by the retained index and record, not a Studio screenshot. |
| P6R-04 AC1 — a cold-start workflow reaches Modeler, Play, Simulation, Replay, outcome generation, and Stake export | `cli/studio/StudioServer.ts`, `cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.tsx`, and Project Dashboard workflow tabs are exercised by `StudioServer.test.ts`, `BlueprintEditorPage.reelStripModeler.test.tsx`, play/simulation/replay/export suites, `ProjectsPanel.test.tsx`, and `happyPath.test.tsx`. | `../p6r-04-independent-verification-398e62df/targeted-results.txt` records the complete serial eight-file workflow/server invocation passing; `../p6r-04-independent-rendered-verification-398e62df-20260820-final/targeted-results.txt` independently records `StudioServer.test.ts` at 279/279. | `../p6r-04-independent-rendered-verification-398e62df-20260820-final/browser-transcript.txt` records fresh-root create/open, Modeler, Play spin, 25-round Simulation, seeded Replay, 1,024 outcomes, and Stake export with no rendered product error. |
| P6R-04 AC2 — desktop and approximately-405px Projects and Build/Export surfaces remain inspectable | `cli/studio-client/src/components/layout/AppShellLayout.tsx`, `global.css`, `components/home/ProjectsPanel.tsx`, and `ExportDeployTab.tsx` provide the responsive surfaces; `ProjectsPanel.test.tsx` covers labelled narrow-card actions. | `../p6r-04-independent-verification-398e62df/targeted-results.txt` includes the complete `ProjectsPanel.test.tsx` suite in its passing invocation. | `../p6r-04-independent-rendered-verification-398e62df-20260820-final/README.md` checksums `projects-desktop.png`, `projects-405px.png`, `build-export-desktop.png`, and `build-export-405px.png`; its transcript records their capture after the completed workflow. |
| P6R-04 AC3 — primary controls keep project location, Replay raw data, and technical target detail on demand | `ProjectDashboardPage.tsx`, `components/common/AdvancedDisclosure.tsx`, and `ExportDeployTab.tsx` own the disclosures; `ProjectDashboardPage.test.tsx`, replay workflow tests, and `ProjectDashboardPage.exportDeploy.test.tsx` cover separated labels and keyboard reachability. | `../../evidence/p6-14-capability-whole-file-evidence/machine-results.txt` records the complete export/deploy suite passing; the replay suite is included in the passing `../p6r-04-independent-verification-398e62df/targeted-results.txt` invocation. | `../p6r-04-independent-rendered-verification-d66fb1a4-20260820/replay-disclosures.png` and transcript show Project location and Replay Advanced details together; `modeler-advanced.png` records the same on-demand disclosure pattern. |

### Separate P6R-05 recovery boundary

The P6R-05 materializer recovery correction remains the materializer-only
boundary described in the Result section above: `BlueprintProjectMaterializer`
and its two 37-passing test files are not evidence for any P6R-04 criterion.
This map does not reclassify historical findings or make a claim about their
severity or lifecycle state.

The cited rendered evidence was captured on P6R-04 candidate predecessors that
are ancestors of this candidate; this P6R-05 targeted verification did not
start Studio or a browser. No generated output, profiles, raw logs, or copied
screenshots are retained here.
