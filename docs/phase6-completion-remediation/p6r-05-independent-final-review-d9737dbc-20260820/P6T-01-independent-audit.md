# P6T-01 independent traceability audit

Candidate checked: `0b3f05697bc368b012630d9c3cf79086471a695c` on 2026-08-21.

## Result: finding

The required single serial invocation was started at this candidate with all
eight supplied paths. Its supplied final path,
`tests/cli/studio/happyPath.test.tsx`, does not exist. The only tracked
happy-path file is
`tests/cli/studio-client/src/integration/happyPath.test.tsx`. Consequently the
required selection cannot produce the requested all-file passing result. This
is a traceability/verification-selection defect, not a rendered product
failure. No replacement Jest invocation was run.

```text
npm run test:targeted -- tests/cli/client/clientPresentation.test.ts tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.reelStripModeler.test.tsx tests/cli/studio-client/src/components/home/ProjectsPanel.test.tsx tests/cli/studio-client/src/components/project/ProjectDashboardPage.exportDeploy.test.tsx tests/cli/studio-client/src/components/project/ProjectDashboardPage.test.tsx tests/cli/studio-client/src/domain/interpret/ExportDeployTargets.test.ts tests/cli/studio/StudioServer.test.ts tests/cli/studio/happyPath.test.tsx
```

The immutable P6R-04 hard gate and its retained serial result instead name
`tests/cli/studio-client/src/integration/happyPath.test.tsx`. The latter record
reports exit status 0. It is historical evidence, not a substitute for this
failed candidate-bound selection.

## Twelve-row reconciliation

| Immutable criterion | Current source and assertion boundary checked | Cited machine/rendered record check | Audit |
| --- | --- | --- | --- |
| P6R-01 AC1 — task-led Build/Export cards | `ExportDeployTab.tsx`, `ExportDeployTargets.ts`, and `ProjectDashboardPage.exportDeploy.test.tsx` are present; the test contains card and keyboard Advanced-details assertions. | `docs/evidence/p6-14-capability-whole-file-evidence/machine-results.txt` names the export/deploy file as PASS; preflight image SHA-256 is `b5603e1c2693cd787a58f35890fd1d9620da19423672f172f4fb2f0fe73a7776`. | reconciled |
| P6R-01 AC2 — compact identity, on-demand path | `ProjectDashboardPage.tsx` has the `project location` disclosure and Copy path; `ProjectDashboardPage.test.tsx` asserts both. | The cited disclosure transcript/image remain present. | reconciled |
| P6R-01 AC3 — explicit unavailable next step | `ExportDeployTargets.ts` holds target-specific unavailable reasons; interpreter and Build/Export tests assert them. | Capability record names export/deploy PASS; current interpreter file is selected by this run. | reconciled |
| P6R-02 AC1 — visual per-reel Modeler | `ReelStripGenerationEditor.tsx`, `BlueprintEditorPage.tsx`, and the complete modeler test are present. | P6R-04 serial record names the modeler file; modeler image SHA-256 is `3511fefb5e8ede358ee6dcb97b62dee76d57df508cee3e4b2fd1534aee9c4b6b`. | reconciled |
| P6R-02 AC2 — JSON recovery preserves draft | The modeler test has malformed-JSON/no-request and recovery assertions. | The cited serial modeler record and transcript are present. | reconciled |
| P6R-02 AC3 — preview, Done, Save, remount | The modeler test explicitly asserts retained generated reel after remount. | The cited serial modeler record and transcript are present. | reconciled |
| P6R-03 AC1 — supported public labels | `clientPresentation.ts`, `index.html`, `main.ts`, README, and `clientPresentation.test.ts` are present; the test covers no-write and compatibility wording. | The retained P6-20 targeted record is present and remains classified as historical. | reconciled |
| P6R-03 AC2 — evidence index classifications | `docs/phase6-final-polishing/p6-20-final-verification.md` is present. | The P6-20 targeted record linked by the map is present. | reconciled |
| P6R-03 AC3 — bounded immutable evidence | The same P6-20 index and its cited retained record are present. | No history-rewrite or pruning claim appears in the reviewed map. | reconciled |
| P6R-04 AC1 — cold-start workflow | `StudioServer.ts`, Modeler, Projects, and the actual integration happy-path file are present. | P6R-04 hard gate and retained result name `tests/cli/studio-client/src/integration/happyPath.test.tsx`; the supplied current path is absent. | **finding: stale required path** |
| P6R-04 AC2 — inspectable desktop/405px surfaces | `AppShellLayout.tsx`, `global.css`, `ProjectsPanel.tsx`, and its test are present. | P6R-04 serial result names ProjectsPanel; cited desktop/405px artifacts remain present. | reconciled |
| P6R-04 AC3 — technical detail on demand | `ProjectDashboardPage.tsx`, `AdvancedDisclosure.tsx`, and Build/Export disclosure source/tests are present. | Cited export/deploy record and replay disclosure evidence remain present; replay image SHA-256 is `7ba54234cbb315da3622e4f618d53972c56a83a040feb9b90ab0ac69a67e3e1e`. | reconciled |

The source, retained machine records, and cited rendered artifacts reconcile
for eleven rows. P6R-04 AC1 cannot receive current complete-file passing
evidence until the required path is corrected to the tracked integration test.
This audit retains no generated output, browser data, raw log, or screenshot.
