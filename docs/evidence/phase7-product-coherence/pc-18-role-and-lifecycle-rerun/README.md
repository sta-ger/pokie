# PC-18 independent host verification — inconclusive

Candidate SHA: `365419351b56ab75abe3c3931612086972073563`.  Verified on
2026-09-06 UTC.

## Complete-file impact suite

One serial invocation ran every required file exactly once:

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts
```

Result: **11 suites passed; 59 tests passed** (56.939 s).

## Fresh public Studio preflight

Two isolated, visible Studio attempts used the candidate build exactly as
`node ./dist/cli/pokie.js --no-open`, with new Studio registries and Chromium
profiles.  In each, the rendered recommended design accepted **Create game**
and opened the saved project workspace.  The rendered **Close project** control
then remained on the workspace without a product error or a confirmed navigation
to the project list.  A repaired second attempt waited for the registry row, but
observed the same still-rendered workspace control set.  Consequently the
driver could not safely continue to reopen, Play, Simulation, Replay, Outcome
Library generation, or Stake export within the two-launch limit.

This is a browser-driver/navigation-confirmation result, not a product defect:
there was no rendered product error and no later observation proving the action
succeeded.  No screenshot, profile, registry, generated project/output tree,
raw log, or harness script is retained.
