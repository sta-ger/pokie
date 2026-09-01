# PC-14 targeted whole-file regression verification

- Candidate: `76d26d96328c420a0a02447d7cf78fef3a63631e`
- Executed: 2026-09-01 (UTC)
- Invocation: one `npm run test:targeted --` command using Jest's
  `--runTestsByPath` mode; no test-name filters or saved gate output were used.
- Result: **29 suites passed; 804 tests passed; 0 snapshots; 592.269 s.**

The command named these complete test files:

```text
tests/cli/ArtifactInteroperabilityTorture.integration.test.ts
tests/cli/BuildProductMatrix.crossSurface.contract.test.ts
tests/cli/CertificationFairnessLifecycle.integration.test.ts
tests/cli/ParSheetRoundTrip.integration.test.ts
tests/cli/StakeEngineExportRegistryWorkflow.integration.test.ts
tests/cli/commands/OutcomeLibraryCommand.test.ts
tests/cli/commands/StakeEngineCommand.test.ts
tests/cli/studio-client/src/Pc14StudioUiInteroperability.test.tsx
tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts
tests/cli/studio/StudioCapabilityConvergence.integration.test.ts
tests/cli/studio/StudioServer.test.ts
tests/cli/studio/replay/StudioReplayExecutionService.test.ts
tests/cli/studio/runtime/StudioPlayService.test.ts
tests/cli/studio/simulation/StudioSimulationService.test.ts
tests/fairness/FairnessRoundProofVerifier.test.ts
tests/parsheet/ParSheetImporter.test.ts
tests/parsheet/mapping/ProvenanceSheetMapper.test.ts
tests/project/ArtifactBuilderRegistry.test.ts
tests/project/ArtifactConversionPlanner.test.ts
tests/project/ArtifactInteroperabilityRemediation.contract.test.ts
tests/project/BlueprintStakeOutcomeLibraryWorkflow.test.ts
tests/project/BuildProductMatrix.contract.test.ts
tests/project/ProjectTargetResolver.test.ts
tests/project/describeUnsupportedProjectOperation.test.ts
tests/project/replayOutcomeSourceProject.test.ts
tests/stakeengine/StakeEngineImportValidator.test.ts
tests/stakeengine/StakeEngineImporter.test.ts
tests/support/ArtifactInteroperabilityRun.test.ts
tests/weightedoutcome/bundle/OutcomeLibraryBundleWriter.test.ts
```

This set includes the reviewer-named shared planner/registry, PAR and Stake
round-trip, provenance, outcome-bundle/fairness, replay, Studio Server, and
Studio Play coverage. The final Jest report enumerated the same 29 paths.
