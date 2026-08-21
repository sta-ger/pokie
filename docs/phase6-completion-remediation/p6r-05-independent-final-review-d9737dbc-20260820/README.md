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
literal criterion-to-evidence mappings below. It does not turn a historical
candidate result into current-release proof.

## P6R-01 through P6R-04 criterion traceability

The table has exactly twelve rows: P6R-01 AC1--AC3, P6R-02 AC1--AC3,
P6R-03 AC1--AC3, and P6R-04 AC1--AC3. Each row reproduces one literal
immutable acceptance criterion, rather than a step summary, a substitute
responsive row, or an additional count of another criterion.
The **machine-owned whole-file output** column identifies the retained runner
record when that record contains the relevant complete test file. It is
deliberately distinct from the current source and test path. Those records
belong to their original candidates and are not reclassified as a P6R-05
rerun.

| Criterion | Current source and boundary | Retained machine-owned whole-file output | Rendered evidence / not-applicable rationale |
| --- | --- | --- | --- |
| P6R-01 AC1 — task-oriented Build/Export cards expose supported and unavailable targets, including a target-specific next step, while technical detail stays on demand | `cli/studio-client/src/components/project/ExportDeployTab.tsx` and `domain/interpret/ExportDeployTargets.ts` keep cards in product language, show unavailable-target reasons and next steps, and reserve adapter, protocol, capabilities, limits, and compatibility for `AdvancedDisclosure`; `tests/cli/studio-client/src/components/project/ProjectDashboardPage.exportDeploy.test.tsx` and `tests/cli/studio-client/src/domain/interpret/ExportDeployTargets.test.ts` cover the card, fallback, remote-delivery, and disclosure boundaries. | `../../evidence/p6-14-capability-whole-file-evidence/machine-results.txt` records the complete export/deploy suite; `P6T-01-independent-audit.md` records the corrected eight-file complete-file rerun containing both named current test files. | `../p6r-04-independent-current-preflight-7018be26-20260820/browser-transcript.txt` and `build-export-complete-preflight.png` show the completed Outcome-library card, item/byte preflight, warning, and enabled post-build actions (SHA-256 `b5603e1c2693cd787a58f35890fd1d9620da19423672f172f4fb2f0fe73a7776`). |
| P6R-01 AC2 — compact Project-header identity with an on-demand path | `cli/studio-client/src/components/project/ProjectDashboardPage.tsx` renders name/id/version as header identity and places the path and Copy path action behind `AdvancedDisclosure`; `tests/cli/studio-client/src/components/project/ProjectDashboardPage.test.tsx` verifies the initially hidden path, keyboard opening, and copy control. | `P6T-01-independent-audit.md` records the corrected complete-file invocation containing `ProjectDashboardPage.test.tsx`; no unrelated server result is counted as a substitute UI assertion. | `../p6r-04-independent-rendered-verification-d66fb1a4-20260820/replay-disclosures.png` and its `browser-transcript.txt` retain the rendered Project location disclosure beside Replay Advanced data, rather than primary workspace chrome. |
| P6R-01 AC3 — complete-file component-test coverage shows the P6R-01 presentation changes do not weaken existing behaviour | `ProjectDashboardPage.exportDeploy.test.tsx`, `ProjectDashboardPage.test.tsx`, and `ExportDeployTargets.test.ts` exercise the changed Build/Export and Project-header boundaries, including availability, disclosure, and keyboard behaviour. | `../../evidence/p6-14-capability-whole-file-evidence/machine-results.txt` retains the complete export/deploy component suite; `P6T-01-independent-audit.md` records the corrected complete-file current invocation containing all three P6R-01 test files. | Not applicable: this is a no-behaviour-weakening machine-test criterion; rendered records for AC1 and AC2 cannot replace complete-file component coverage. |
| P6R-02 AC1 — visual per-reel controls are the primary Modeler workflow | `cli/studio-client/src/components/blueprintEditor/ReelStripGenerationEditor.tsx` and `BlueprintEditorPage.tsx` provide reel selection, generated/literal controls, presets, spacing, occurrence, stack rules, and stop-window preview; `BlueprintEditorPage.reelStripModeler.test.tsx` covers the visual controls and generated preview/apply boundary. | `../p6r-04-independent-verification-398e62df/targeted-results.txt` names the complete Modeler file in its passing serial eight-file invocation. | `../p6r-04-independent-rendered-verification-d66fb1a4-20260820/modeler-advanced.png` (SHA-256 `3511fefb5e8ede358ee6dcb97b62dee76d57df508cee3e4b2fd1534aee9c4b6b`) and its transcript show visual spacing, preset, stack controls, and a generated strip. |
| P6R-02 AC2 — Advanced JSON round-trip and malformed-input recovery preserve the visual draft | `ReelStripGenerationEditor.tsx` owns the constraints disclosure and parse/recovery behavior; `BlueprintEditorPage.reelStripModeler.test.tsx` round-trips a visual constraint, rejects malformed JSON without a request, and recovers the draft. | `../p6r-04-independent-verification-398e62df/targeted-results.txt` records the complete Modeler suite passing. | `../p6r-04-independent-rendered-verification-d66fb1a4-20260820/browser-transcript.txt` records opening constraints Advanced details after visual editing. The no-request and draft-preservation branches require the machine assertion; a screenshot cannot establish them. |
| P6R-02 AC3 — Preview, Done, shared Save, and remount retain the applied reel | `BlueprintEditorPage.tsx` connects Modeler output to the shared Game Model save; `BlueprintEditorPage.reelStripModeler.test.tsx` completes Preview → Apply/Done → Save and asserts the applied generated reel after remount. | `../p6r-04-independent-verification-398e62df/targeted-results.txt` records the complete Modeler suite passing. | `../p6r-04-independent-rendered-verification-d66fb1a4-20260820/browser-transcript.txt` records preview, stop-window inspection, Apply, and Save. The remount persistence assertion is machine-only because it is not visible in one image. |
| P6R-03 AC1 — public client labels are supported product labels, with precise no-write and compatibility language | `cli/client/clientPresentation.ts`, `cli/client/index.html`, `cli/client/main.ts`, and root `README.md` provide the labels; `tests/cli/client/clientPresentation.test.ts` rejects stale status words while permitting the precise no-write and compatibility terms. | The narrow `clientPresentation.test.ts` is the current machine-owned assertion. `../../phase6-final-polishing/p6-20-targeted-verification-20260820/README.md` is retained candidate-scoped runtime evidence, but does not stand in for this separate label test. | Not applicable: this static negative-label contract cannot be demonstrated more completely by a Studio screenshot than by its machine assertion. |
| P6R-03 AC2 — the final-evidence index classifies candidate proof, superseded boundaries, and immutable history without claiming completion | `docs/phase6-final-polishing/p6-20-final-verification.md` is the current evidence-index source and its links retain each boundary's classification. | `../../phase6-final-polishing/p6-20-targeted-verification-20260820/README.md` is the retained complete-file targeted-run record at its stated candidate SHA; the index classifies it rather than recasting it as current-release proof. | Not applicable: this is documentation-governance scope, not a rendered product surface. |
| P6R-03 AC3 — evidence preservation remains bounded and does not rewrite immutable history | `docs/phase6-final-polishing/p6-20-final-verification.md` retains P6-15–P6-19 and all tracked P6-20 records without a pruning or replacement claim. | `../../phase6-final-polishing/p6-20-targeted-verification-20260820/README.md` remains linked as its original candidate-scoped machine output; this map neither moves nor reclassifies it. | Not applicable: retention scope is established by the retained index and record, not a Studio screenshot. |
| P6R-04 AC1 — the complete cold-start workflow reaches Modeler, Play, Simulation, Replay, outcome generation, and Stake export, and separately inspects Projects and Build/Export at desktop and approximately 405px | `cli/studio/StudioServer.ts`, `cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.tsx`, workflow tabs, `components/home/ProjectsPanel.tsx`, `components/layout/AppShellLayout.tsx`, `global.css`, and `ExportDeployTab.tsx` supply the whole path and responsive surfaces; the eight named workflow/server test files, including `tests/cli/studio-client/src/integration/happyPath.test.tsx`, cover its machine boundary. | `../p6r-04-independent-verification-398e62df/targeted-results.txt` records the retained serial eight-file passing workflow/server invocation, and `P6T-01-independent-audit.md` records its corrected current equivalent; `../p6r-04-independent-rendered-verification-398e62df-20260820-final/targeted-results.txt` separately records `StudioServer.test.ts` at 279/279. | `../p6r-04-independent-rendered-verification-398e62df-20260820-final/browser-transcript.txt` records fresh-root create/open, Modeler, Play, 25-round Simulation, seeded Replay, 1,024 outcomes, and Stake export; its README checksums distinct `projects-desktop.png`, `projects-405px.png`, `build-export-desktop.png`, and `build-export-405px.png`. |
| P6R-04 AC2 — primary-UI negative audit removes the technical protocol wall, raw constraints JSON, unexplained full path, stale preview label, and unexplained disabled action/dead end, while truthful Advanced details remain reachable | `ExportDeployTab.tsx`, `ReelStripGenerationEditor.tsx`, `ProjectDashboardPage.tsx`, `AdvancedDisclosure.tsx`, and `cli/client/clientPresentation.ts` supply the affected primary and Advanced surfaces; the corrected complete-file selection includes the Modeler, Project, Build/Export, interpreter, client-presentation, and workflow suites that assert those boundaries. | `P6T-01-independent-audit.md` records the corrected complete-file run; retained `../../evidence/p6-14-capability-whole-file-evidence/machine-results.txt` and `../p6r-04-independent-verification-398e62df/targeted-results.txt` remain original complete-file records for their component/workflow subsets. | `../p6r-04-independent-rendered-verification-d66fb1a4-20260820/browser-transcript.txt` records visual Modeler constraints, Preview, reachable Project/Replay Advanced details, and a completed Build/Export action; `../p6r-04-independent-current-preflight-7018be26-20260820/browser-transcript.txt` records truthful preflight, warning, and enabled follow-up actions rather than a dead end. |
| P6R-04 AC3 — every confirmed P0/P1/material P2 is fixed, independently delta-reviewed, and its affected rendered workflow rerun, with whole-file targeted output and bounded transcript/screenshots | The independently recorded P6R-04 corrections remain in their original `p6r-04-independent-*` directories; `p6r-04-cold-start-hard-gate.md` names the final source/workflow closure without rewriting that history. | `../p6r-04-independent-verification-398e62df/targeted-results.txt` is the retained whole-file serial workflow output, while `P6T-01-independent-audit.md` records the corrected current selection; neither record erases or replaces original candidate provenance. | `../p6r-04-independent-rendered-verification-398e62df-20260820-final/README.md` and `browser-transcript.txt` retain the bounded four-screenshot responsive matrix and rerun transcript; `../p6r-04-independent-rendered-verification-d66fb1a4-20260820/README.md` retains the independently delta-reviewed rendered disclosure run. |

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
