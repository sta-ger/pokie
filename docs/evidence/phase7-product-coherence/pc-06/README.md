# PC-06 bounded regression verification (report repair)

Current requested candidate: `9598ba216967d9391e211496474914d5babcfcd2`.

The only retained machine transcript is from the earlier candidate
`b46db341867a33c7e159b9fe910566f599c2c086`, not the requested candidate.
This report-only repair did not start a build, package/install command, test,
Studio, browser, server, or public workflow. Consequently, that transcript is
historical context only and is not evidence that the required suite passed on
the current requested SHA.

Earlier machine-run command (one whole-file Jest invocation):

```sh
npm run test:targeted -- tests/cli/BuildCommand.test.ts tests/cli/BuildProductMatrix.crossSurface.contract.test.ts tests/cli/StakeEngineExportRegistryWorkflow.integration.test.ts tests/cli/commands/ExportCommand.test.ts tests/cli/commands/GenerateCommand.test.ts tests/cli/commands/ImportCommand.test.ts tests/cli/commands/OutcomeLibraryCommand.test.ts tests/cli/commands/ParCommand.test.ts tests/cli/commands/StakeEngineCommand.test.ts tests/cli/studio-client/src/api/apiClient.test.ts tests/cli/studio-client/src/components/project/ProjectDashboardPage.exportDeploy.test.tsx tests/cli/studio-client/src/domain/interpret/ExportDeployTargets.test.ts tests/cli/studio-client/src/hooks/useDeploymentManager.test.tsx tests/cli/studio/StudioArtifactBuildService.integration.test.ts tests/cli/studio/StudioArtifactBuildService.test.ts tests/cli/studio/StudioServer.test.ts tests/cli/studio/artifacts/StudioArtifactConversionPlanningService.test.ts tests/cli/studio/blueprint/StudioBlueprintService.test.ts tests/cli/studio/deployment/StudioDeploymentService.test.ts tests/cli/studio/outcomeLibrary/StudioOutcomeLibraryGenerateService.test.ts tests/cli/studio/stakeengine/StudioStakeEngineExportService.test.ts tests/project/ArtifactBuilderRegistry.test.ts tests/project/ArtifactConversionPlanner.test.ts tests/project/BlueprintStakeOutcomeLibraryWorkflow.test.ts tests/project/BuildProductMatrix.contract.test.ts tests/project/ManagedOutcomeProjectService.test.ts tests/project/OutcomeLibraryArtifactBuilder.test.ts tests/project/ParWorkbookArtifactBuilder.test.ts tests/project/ProjectCapabilities.test.ts tests/project/ProjectMaterializing.test.ts tests/project/ProjectTargetResolver.test.ts tests/project/StakeAdapterArtifactBuilder.test.ts tests/project/TsPackageArtifactBuilder.test.ts
```

Recorded exit status: `0`

Recorded Jest result: `33 passed, 33 total` suites; `887 passed, 887 total`
tests; `0` snapshots.
Recorded elapsed time: `58.914 s`.

The earlier command omitted these two currently required whole files:

- `tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.parSheetImportExport.test.tsx`
- `tests/project/PC05ProductModel.contract.test.ts`

It also predates the requested candidate SHA. It therefore cannot establish
that every required file ran on the exact candidate, that no required file
failed there, or whether an act/lifecycle warning occurred there. No raw logs,
generated projects, browser artifacts, product-code changes, or test changes
are retained.
