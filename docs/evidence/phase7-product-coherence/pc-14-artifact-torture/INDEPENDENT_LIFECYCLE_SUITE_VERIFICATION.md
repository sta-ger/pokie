# Independent PC-14 lifecycle suite verification

- Candidate source commit: `e9373b7f7aafeaa4595917db8e45a268767fc3f7`
- Executed: 2026-09-01 UTC
- Invocation: one `npm run test:targeted --` command with all 17 paths below,
  using Jest `--runTestsByPath`; no test-name filter was supplied.
- Result: **17 suites passed, 475 tests passed, 0 snapshots; 583.087 s.**
- Ephemeral terminal log SHA-256 (not retained):
  `ef5ee06def3462dd13e34a3b0ebfb0c743c74f86cf64c8349d89f4ed5168f33b`

```text
tests/cli/ArtifactInteroperabilityTorture.integration.test.ts
tests/cli/BuildProductMatrix.crossSurface.contract.test.ts
tests/cli/CertificationFairnessLifecycle.integration.test.ts
tests/cli/ParSheetRoundTrip.integration.test.ts
tests/cli/StakeEngineExportRegistryWorkflow.integration.test.ts
tests/cli/studio-client/src/Pc14StudioUiInteroperability.test.tsx
tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts
tests/cli/studio/StudioCapabilityConvergence.integration.test.ts
tests/cli/studio/StudioServer.test.ts
tests/cli/studio/runtime/StudioPlayService.test.ts
tests/fairness/FairnessRoundProofVerifier.test.ts
tests/project/ArtifactBuilderRegistry.test.ts
tests/project/ArtifactInteroperabilityRemediation.contract.test.ts
tests/project/BlueprintStakeOutcomeLibraryWorkflow.test.ts
tests/project/BuildProductMatrix.contract.test.ts
tests/project/replayOutcomeSourceProject.test.ts
tests/weightedoutcome/bundle/OutcomeLibraryBundleWriter.test.ts
```

The terminal summary named the same 17 paths and reported no failures.  The
full log was intentionally discarded; this transcript is the sole new,
reviewable evidence file and does not replace the completed artifact evidence.
