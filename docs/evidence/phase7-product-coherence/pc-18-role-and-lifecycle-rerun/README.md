# PC-18 independent host verification — candidate `1077df75047471f863e7b11cc35df9583b26a63d`

2026-09-05 UTC. This directory supersedes all retained proof for a different
candidate SHA. No generated project/output tree, browser profile, raw log, or
screenshot is retained.

## Machine evidence

The required whole-file command was run once sequentially on this checkout:

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts
```

Result: **11 suites / 59 tests passed** in 56.123 seconds. `npm run build-cli`
also completed on the candidate before Studio was launched.

## Public-workflow transcript

Two fresh isolated Studio processes used the candidate checkout exactly as
`node ./dist/cli/pokie.js --no-open`, each with a new registry and Chromium
profile. The first rendered `Design Your Game`, accepted `Create game`, and
reported that the managed recommended Blueprint was saved. Its browser driver
then selected the editor's descriptive `Play` text before the workspace control
appeared; this was corrected in the controller-owned harness.

The second fresh process rendered the managed `Starter Slot` workspace and the
actual `Play` tab. The visible product then rendered `Start Play`, `New Play
session`, and its explanation that no additional setup was required. The
harness had been waiting for the later `Spin` state rather than invoking this
intermediate rendered action, so it stopped without a product error. The two
allowed public launches were thereby exhausted. This is a bounded
selector/readiness inconclusive result, not evidence of a product defect; no
outcome cancellation/retry, Stake export, or six-role cold-start claim is made.
