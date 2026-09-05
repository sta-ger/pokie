# PC-18 independent host verification — candidate `a1ee26008bfc04fc0819a635ce16d03bcf69fef2`

2026-09-05 UTC. This record replaces the superseded `f44f3dd…` evidence and
retains no generated project/output tree, profile, raw log, or harness.

## Required impact suite

The following one serial, whole-file command completed on this exact checkout:

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts
```

Result: **11 suites passed, 59 tests passed**. `npm run build` also completed
before Studio was launched.

## Fresh Studio rerun — driver/readiness inconclusive

Two isolated Studio launches used the candidate command exactly:

```text
node ./dist/cli/pokie.js --no-open
```

The first rendered the public `Start a game` surface. On the second, the visible
recommended Starter Slot form validated as `Valid — no issues found`; `Save game`
then rendered `Your game was saved. Opening its workspace…`, and the project
subsequently opened as `Starter Slot` with the visible Play, Simulation, Replay,
and Build/Export navigation.

The repaired harness had a transition-comparison defect: it compared control
objects to control labels, so it advanced immediately instead of waiting for
each newly selected tab to render. Its later clicks therefore did not reach the
required Play round, Simulation run, Replay, Outcome Library, or Stake export.
There was no rendered product error. The two allowed launches were exhausted,
so this is driver/readiness-inconclusive evidence, not a product finding.

## Retained proof

`01-fresh-studio-managed-blueprint-saved.png` shows the visible managed
Blueprint save and validation result.

```text
fba249602e8fe8fcf33f8f82fc590d235c1f2e377b19eb74140b5e3a173ff793  01-fresh-studio-managed-blueprint-saved.png
```
