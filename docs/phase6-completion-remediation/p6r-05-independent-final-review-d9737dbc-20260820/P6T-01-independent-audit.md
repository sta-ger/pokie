# P6T-01 independent traceability audit

Candidate checked: `ea20961d2357c3735c102d11eaf8989e5873bdf4` on
2026-08-21. The checkout HEAD was this exact commit before the test command;
the evidence commit follows it and does not change the tested source tree.

## Result: corrected selection reconciled

The prior saved selection used the absent
`tests/cli/studio/happyPath.test.tsx` path. The immutable P6R-04 hard gate and
its retained serial result name the tracked
`tests/cli/studio-client/src/integration/happyPath.test.tsx` path instead.
The corrected single serial invocation below completed with exit status 0,
covering every complete test file named by the P6R-01--P6R-04 map. Its bounded
machine record is `P6T-01-targeted-results.txt`: 8/8 suites and 368/368 tests
passed in 282.421 seconds. This is current machine verification of the selected
boundaries, not replacement or republication of historical P6R evidence.

```text
npm run test:targeted -- tests/cli/client/clientPresentation.test.ts tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.reelStripModeler.test.tsx tests/cli/studio-client/src/components/home/ProjectsPanel.test.tsx tests/cli/studio-client/src/components/project/ProjectDashboardPage.exportDeploy.test.tsx tests/cli/studio-client/src/components/project/ProjectDashboardPage.test.tsx tests/cli/studio-client/src/domain/interpret/ExportDeployTargets.test.ts tests/cli/studio-client/src/integration/happyPath.test.tsx tests/cli/studio/StudioServer.test.ts
```

The prior path is absent at this candidate; all eight requested paths are
present before this corrected run.
The retained P6R-04 serial record also names this tracked path and reports exit
status 0, but remains historical evidence with its original provenance.

## Twelve-row reconciliation

| Immutable criterion | Current source and assertion boundary checked | Cited machine/rendered record check | Audit |
| --- | --- | --- | --- |
| P6R-01 AC1 — task-led Build/Export cards expose supported and unavailable targets, including target-specific next steps, while technical detail is on demand | `ExportDeployTab.tsx`, `ExportDeployTargets.ts`, `ProjectDashboardPage.exportDeploy.test.tsx`, and `ExportDeployTargets.test.ts` are present; the complete files assert cards, unavailable reasons, and keyboard Advanced-details access. | The corrected invocation contains both test files; `docs/evidence/p6-14-capability-whole-file-evidence/machine-results.txt` retains export/deploy PASS; preflight image SHA-256 is `b5603e1c2693cd787a58f35890fd1d9620da19423672f172f4fb2f0fe73a7776`. | reconciled |
| P6R-01 AC2 — compact identity, on-demand path | `ProjectDashboardPage.tsx` has the `project location` disclosure and Copy path; its complete test file is in the corrected invocation. | The cited disclosure transcript/image remain present. | reconciled |
| P6R-01 AC3 — complete-file component-test/no-behaviour-weakening criterion | `ProjectDashboardPage.exportDeploy.test.tsx`, `ProjectDashboardPage.test.tsx`, and `ExportDeployTargets.test.ts` are present in the corrected complete-file invocation. | The retained export/deploy whole-file record and this corrected run cover the three component boundaries; no screenshot is substituted for this machine-test criterion. | reconciled |
| P6R-02 AC1 — visual per-reel Modeler | `ReelStripGenerationEditor.tsx`, `BlueprintEditorPage.tsx`, and the complete modeler test are present. | P6R-04 serial record names the modeler file; modeler image SHA-256 is `3511fefb5e8ede358ee6dcb97b62dee76d57df508cee3e4b2fd1534aee9c4b6b`. | reconciled |
| P6R-02 AC2 — JSON recovery preserves draft | The modeler test has malformed-JSON/no-request and recovery assertions. | The cited serial modeler record and transcript are present. | reconciled |
| P6R-02 AC3 — preview, Done, Save, remount | The modeler test explicitly asserts retained generated reel after remount. | The cited serial modeler record and transcript are present. | reconciled |
| P6R-03 AC1 — supported public labels | `clientPresentation.ts`, `index.html`, `main.ts`, README, and `clientPresentation.test.ts` are present; the test covers no-write and compatibility wording. | The retained P6-20 targeted record is present and remains classified as historical. | reconciled |
| P6R-03 AC2 — evidence index classifications | `docs/phase6-final-polishing/p6-20-final-verification.md` is present. | The P6-20 targeted record linked by the map is present. | reconciled |
| P6R-03 AC3 — bounded immutable evidence | The same P6-20 index and its cited retained record are present. | No history-rewrite or pruning claim appears in the reviewed map. | reconciled |
| P6R-04 AC1 — complete cold-start workflow plus separate desktop and approximately-405px Projects/Build inspection | `StudioServer.ts`, Modeler/workflow sources, `ProjectsPanel.tsx`, `AppShellLayout.tsx`, `global.css`, and the tracked integration happy-path file are present. | P6R-04 hard gate and retained result name `tests/cli/studio-client/src/integration/happyPath.test.tsx`, which is now in the corrected current invocation; cited desktop/405px artifacts remain present. | reconciled |
| P6R-04 AC2 — full primary-UI negative audit plus truthful reachable Advanced details | `ExportDeployTab.tsx`, `ReelStripGenerationEditor.tsx`, `ProjectDashboardPage.tsx`, `AdvancedDisclosure.tsx`, and `clientPresentation.ts` are present; the corrected selection covers Modeler, Project, Build/Export, interpreter, client-presentation, and workflow assertions. | The retained Modeler, replay-disclosure, and Build/Export transcripts demonstrate the reachable rendered controls and completed action, while the corrected whole-file run covers the negative machine boundaries. | reconciled |
| P6R-04 AC3 — every confirmed P0/P1/material P2 fixed, independently delta-reviewed, and affected rendered workflow rerun with whole-file output and bounded transcript/screenshots | The independently retained `p6r-04-independent-*` records and `p6r-04-cold-start-hard-gate.md` remain present and unmodified. | The retained serial whole-file result, bounded final transcript/four screenshots, and delta-review record remain present with their original candidate provenance. | reconciled |

The source, corrected complete-file selection, retained machine records, and
cited rendered artifacts reconcile for all twelve separately scoped rows. This
audit retains no generated output, browser data, raw log, or screenshot.
