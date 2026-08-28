# PC-06 bounded regression verification

Candidate checked before the run: `b46db341867a33c7e159b9fe910566f599c2c086`.

Machine-run command (one whole-file Jest invocation):

```sh
npm run test:targeted -- tests/cli/BuildCommand.test.ts tests/cli/BuildProductMatrix.crossSurface.contract.test.ts tests/cli/StakeEngineExportRegistryWorkflow.integration.test.ts tests/cli/commands/ExportCommand.test.ts tests/cli/commands/GenerateCommand.test.ts tests/cli/commands/ImportCommand.test.ts tests/cli/commands/OutcomeLibraryCommand.test.ts tests/cli/commands/ParCommand.test.ts tests/cli/commands/StakeEngineCommand.test.ts tests/cli/studio-client/src/api/apiClient.test.ts tests/cli/studio-client/src/components/project/ProjectDashboardPage.exportDeploy.test.tsx tests/cli/studio-client/src/domain/interpret/ExportDeployTargets.test.ts tests/cli/studio-client/src/hooks/useDeploymentManager.test.tsx tests/cli/studio/StudioArtifactBuildService.integration.test.ts tests/cli/studio/StudioArtifactBuildService.test.ts tests/cli/studio/StudioServer.test.ts tests/cli/studio/artifacts/StudioArtifactConversionPlanningService.test.ts tests/cli/studio/blueprint/StudioBlueprintService.test.ts tests/cli/studio/deployment/StudioDeploymentService.test.ts tests/cli/studio/outcomeLibrary/StudioOutcomeLibraryGenerateService.test.ts tests/cli/studio/stakeengine/StudioStakeEngineExportService.test.ts tests/project/ArtifactBuilderRegistry.test.ts tests/project/ArtifactConversionPlanner.test.ts tests/project/BlueprintStakeOutcomeLibraryWorkflow.test.ts tests/project/BuildProductMatrix.contract.test.ts tests/project/ManagedOutcomeProjectService.test.ts tests/project/OutcomeLibraryArtifactBuilder.test.ts tests/project/ParWorkbookArtifactBuilder.test.ts tests/project/ProjectCapabilities.test.ts tests/project/ProjectMaterializing.test.ts tests/project/ProjectTargetResolver.test.ts tests/project/StakeAdapterArtifactBuilder.test.ts tests/project/TsPackageArtifactBuilder.test.ts
```

Exit status: `0`  
Jest result: `33 passed, 33 total` suites; `887 passed, 887 total` tests; `0` snapshots.  
Elapsed: `58.914 s`; runner reported that all 33 paths above were run in its three configured projects.

This single whole-file run covers the requested planner and destination branches, lifecycle and registry cleanup, provenance and reuse, CLI adapters, and CLI/Studio/project cross-surface contracts. No product code, tests, generated projects, raw logs, or browser artifacts are retained.
