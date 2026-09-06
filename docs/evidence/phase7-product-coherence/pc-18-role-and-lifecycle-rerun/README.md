# PC-18 independent host verification — driver inconclusive

Candidate product SHA: `6f9fa507792db28df6917b3b9f66436a1b9dcd8d`.

## Complete-file impact suite

The requested single serial command ran each required file once on this exact
candidate and passed **11 suites / 59 tests**:

```text
npm run test:targeted -- tests/cli/PC18RoleMissions.integration.test.ts tests/cli/PC18LifecycleParity.integration.test.ts tests/cli/studio-client/src/PC18ProductAcceptance.browser.test.tsx tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/PC17CliStudioParity.integration.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/cli/studio-client/src/PC16StudioContextLifecycle.browser.test.tsx tests/cli/studio-client/src/PC16StudioProductSweep.browser.test.tsx tests/cli/studio-client/src/PC17ProductSemanticAudit.browser.test.tsx tests/project/ArtifactConversionPlanner.test.ts tests/project/ManagedOutcomeProjectService.test.ts
```

## Public Studio rerun

After a successful candidate build, two fresh Studio launches used only
`node ./dist/cli/pokie.js --no-open`, each with isolated registry and Chromium
profile paths. The second rendered the public start screen with an enabled
**Create game** control and a valid ready-to-edit recommended starter game.

No product action was sent. The harness process consumed non-interactive stdin
and exited before the semantic UI actions could be issued; the earlier launch
had the same driver transition defect while collecting the rendered state. The
two-launch ceiling prevents a further public-workflow attempt. This is driver
inconclusive evidence, not a product failure and not proof of the role or
lifecycle criteria.

No generated project/output tree, browser profile, harness, raw log, or
screenshot is retained.
