# P8-05 targeted verification — 0a6113dc542e323495824bb4d6d86872b202077a

Verifier-owned result recorded 2026-10-02 from a clean checkout at the exact
candidate SHA. No release, publication, Drive, or official release-gate
workflow was run.

## Whole-file command

One sequential command was run, without name filtering or duplicate Jest
processes:

```text
npm run test:targeted -- tests/cli/studio-client/src/P805ValeraPersonas.browser.test.tsx tests/cli/studio-client/src/components/project/ProjectDashboardPage.exportDeploy.test.tsx tests/cli/studio-client/src/components/project/ProjectDashboardPage.jobs.test.tsx tests/cli/studio-client/src/components/project/ProjectDashboardPage.replayWorkflow.test.tsx tests/cli/studio/StudioJobRoutes.integration.test.ts tests/cli/studio/jobs/StudioJobService.test.ts tests/cli/studio/replay/StudioReplayExecutionService.test.ts tests/cli/studio/simulation/StudioSimulationService.realWorkers.test.ts tests/cli/studio/simulation/StudioSimulationService.test.ts tests/scripts/p8-05-product-readiness-campaign.test.mjs tests/scripts/p8-05-product-readiness-controller.test.mjs tests/scripts/p8-05-valera-devtools-events.test.mjs tests/scripts/p8-05-valera-ownership.test.mjs
```

Terminal Jest summary: **1 failed, 12 passed, 13 total** suites; **1 failed,
304 passed, 305 total** tests; elapsed `2265.263 s`.

## Failure receipt

The only failed suite was the complete
`P805ValeraPersonas.browser.test.tsx` suite. Its real packed narrow tuple
reached the bounded reel-editor imported-project Open action after preserving
eight accepted tuple receipts, then the candidate audit rejected its own
native-pointer receipt:

```text
P8-05 Valera browser audit is invalid: packed mathematician/
reels-paytable-modes-mechanics/narrow workflow worker failed after preserving
8 accepted tuple receipts: rendered control lost native focus or its captured
hit target at pointer dispatch
```

The deterministic candidate-source stack terminates at
`scripts/p8-05-valera-browser-audit.mjs:742` in
`clickP805CapturedControl`, invoked through `activateFocusedControl` and
`openImportedProject` at line 2184. The immediately preceding rendered state
was an enabled imported-project Open control selected by
`[data-pokie-project-location=<bounded reel editor fixture>]`, focused by the
audit itself. No action-local pending/job record was rendered before this
source-level pointer-receipt rejection, so no product action was retried.

The other twelve required whole-file suites passed, including campaign,
controller, cleanup/ownership, job, replay, export, and simulation coverage.
