# P9-08 targeted verification — finding

Candidate product identity: `696ca2165ba46d10433de7ce2e7451b5054ab2aa`.

The controller ran the required single complete-file command on 2026-10-09;
this verifier did not rerun tests, build, start Studio, or start a browser.
The machine receipt records the same clean SHA before and after execution and
an exit status of 1: **3 failed suites, 3 passed suites; 3 failed tests, 82
passed tests, 85 total**.

Command recorded by the receipt:

```
npm run test:targeted -- tests/cli/studio-client/src/P908ValeraProducer.browser.test.tsx tests/cli/studio-client/src/Pc14StudioUiInteroperability.test.tsx tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.parImportManagedSave.test.tsx tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.parSheetImportExport.test.tsx tests/cli/studio-client/src/components/home/HomePage.test.tsx tests/cli/studio-client/src/components/project/ProjectDashboardPage.exportDeploy.test.tsx
```

The exact machine-owned receipt and uncommitted raw logs are:

* `/home/stager/Work/sta-ger/agents/runtime/verifier-targeted-results/6efbdb88c73fff0d1dd625f9/result.json`
  — SHA-256 `79c74679d1780a0baa0c2d026dffd8d30271281696a4eaa6c2290261fe66d2e0`
* `/home/stager/Work/sta-ger/agents/runtime/verifier-targeted-results/6efbdb88c73fff0d1dd625f9/stdout.log`
  — SHA-256 `d09bb4e1436672d7a924f2131e59fd1416a797d25aa83c31b72c416f436adfd5`
* `/home/stager/Work/sta-ger/agents/runtime/verifier-targeted-results/6efbdb88c73fff0d1dd625f9/stderr.log`
  — SHA-256 `74dfb8699305b6103f3a6a321b2c5ddee3fa436fcc95a08b91c58f081044ba89`

Observed candidate-owned failures:

1. `BlueprintEditorPage.parImportManagedSave.test.tsx:62` selects the stale
   `Apply / Export — Commit or write out` step after import.  The actual
   import-only panel sets `allowExport` false and renders `Apply — Update the
   draft` (`ParSheetImportExportPanel.tsx:351`).  The guided import never
   reaches Apply or managed save.
2. `Pc14StudioUiInteroperability.test.tsx:273` requires an obsolete occupied-
   destination sentence.  The rendered owner now supplies `Destination
   unavailable. Choose a different destination; Build will not overwrite it.`
   (`ExportDeployTab.tsx:692`), so the journey stops before its new-workbook,
   Home import/preview, and aggregate-emission steps.  Its aggregate is only
   written at lines 555–600 after those later observations; therefore this
   receipt contains no completed aggregate proof.  It also contains no package
   archive/pack command.
3. `P908ValeraProducer.browser.test.tsx:204` resolves `packageScope` through
   `Array.from(document.querySelectorAll('div')).find(...)`.  The lookup is
   undefined in the rendered Build/Export view, and the generated selector
   synchronously calls `undefined.querySelectorAll`.  The receipt retains the
   deterministic terminal exception: `TypeError: Cannot read properties of
   undefined (reading 'querySelectorAll')`.  No Build request is dispatched.

Resource-closeout checks after the completed process found no candidate
`.p908-producer-*` root and no listening candidate Node/Studio process.  The
receipt likewise records `orphan_process_group_reaped: false` and
`detached_process_groups_reaped: 0`.  Unrelated pre-existing browser processes
were not attributed to this candidate.  No raw runtime payloads are committed.
