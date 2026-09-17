# P8-02 machine verification

Candidate: `fad86158f8c8fb8101ece5d8ee809ca2a7f6688f`.

2026-09-17 host-side execution completed the controller-required whole-file
targeted command once, in-band:

```
npm run test:targeted -- BlueprintBuildPanel.test.tsx \
  BlueprintEditorPage.parSheetImportExport.test.tsx HomePage.test.tsx \
  ProjectDashboardPage.certificationWorkflow.test.tsx \
  ProjectDashboardPage.playWorkflow.test.tsx StudioJobExecutorBridge.routes.test.ts
```

Result: 6 suites passed, 64 tests passed (71.849 s). The five test files
modified by the candidate were also checked as complete files (the two already
in the required command were not rerun): the remaining three suites passed,
48 tests passed (37.741 s).

Source review found the required Home-to-Design recovery regression coverage is
not present: `HomePage.test.tsx` tests only retained project opening, and the
two Blueprint test files contain no retained Design build, PAR export, or PAR
import card recovery flow. The candidate therefore has green execution but
does not satisfy the requested focused recovery coverage criterion.
