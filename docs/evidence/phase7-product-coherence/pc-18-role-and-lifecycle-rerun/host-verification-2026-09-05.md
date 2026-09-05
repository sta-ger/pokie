# Independent host verification — 2026-09-05

Candidate: `fa1ff1ea02ce5673a787801504c26e7dcc2b78ac` (`[PC-18] bind managed Blueprint source identity`).

## Required impact suite

One serialized command ran every reviewer-required file as complete Jest paths:

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts
```

Result: **11 suites passed, 59 tests passed, 0 snapshots**, in 55.018 seconds.

## Public Studio rerun

Studio was launched from this checkout with `node ./dist/cli/pokie.js --no-open`; the candidate server reported `http://127.0.0.1:3200`. The repaired browser driver reached the visible start screen. It rendered the ready-to-edit starter with all six design sections valid and a visible **Create game** control.

The independent cold-start role/lifecycle mission is not complete. The first driver attempt stopped before rendered interaction (driver setup only). The sole rendered rerun used a fresh Chromium profile but its visible **Projects** screen contained 5,643 inherited project-registry rows, including stale paths from other test runs. The generic rendered-control path did not accept the creation transition, so no candidate project was created and the Play, Simulation, Replay, Outcome, Stake, six-role, cancellation, or recovery branches were reached. No rendered product error or reproducible product defect was observed.

This is retained as a readiness/driver-inconclusive host result, not a product finding. No generated project, browser profile, runtime log, or automation script is retained in the evidence tree.
