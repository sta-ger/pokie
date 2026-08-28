# PC-06 exact-candidate bounded regression verification

Candidate: `9598ba216967d9391e211496474914d5babcfcd2`.

The checkout used for this evidence is an evidence-only descendant of that
candidate. Before the run, `git diff --name-status
9598ba216967d9391e211496474914d5babcfcd2..HEAD` reported only this README;
therefore the complete product and test source under test was exactly the
candidate source.

Executed once, as whole files in one serial Jest invocation:

```sh
npm run test:targeted -- \
  tests/cli/BuildCommand.test.ts \
  tests/cli/BuildProductMatrix.crossSurface.contract.test.ts \
  tests/cli/StakeEngineExportRegistryWorkflow.integration.test.ts \
  tests/cli/commands/ExportCommand.test.ts \
  tests/cli/commands/GenerateCommand.test.ts \
  tests/cli/commands/ImportCommand.test.ts \
  tests/cli/commands/OutcomeLibraryCommand.test.ts \
  tests/cli/commands/ParCommand.test.ts \
  tests/cli/commands/StakeEngineCommand.test.ts \
  tests/cli/studio-client/src/api/apiClient.test.ts \
  tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.parSheetImportExport.test.tsx \
  tests/cli/studio-client/src/components/project/ProjectDashboardPage.exportDeploy.test.tsx \
  tests/cli/studio-client/src/domain/interpret/ExportDeployTargets.test.ts \
  tests/cli/studio-client/src/hooks/useDeploymentManager.test.tsx \
  tests/cli/studio/StudioArtifactBuildService.integration.test.ts \
  tests/cli/studio/StudioArtifactBuildService.test.ts \
  tests/cli/studio/StudioServer.test.ts \
  tests/cli/studio/artifacts/StudioArtifactConversionPlanningService.test.ts \
  tests/cli/studio/blueprint/StudioBlueprintService.test.ts \
  tests/cli/studio/deployment/StudioDeploymentService.test.ts \
  tests/cli/studio/outcomeLibrary/StudioOutcomeLibraryGenerateService.test.ts \
  tests/cli/studio/stakeengine/StudioStakeEngineExportService.test.ts \
  tests/project/ArtifactBuilderRegistry.test.ts \
  tests/project/ArtifactConversionPlanner.test.ts \
  tests/project/BlueprintStakeOutcomeLibraryWorkflow.test.ts \
  tests/project/BuildProductMatrix.contract.test.ts \
  tests/project/ManagedOutcomeProjectService.test.ts \
  tests/project/OutcomeLibraryArtifactBuilder.test.ts \
  tests/project/PC05ProductModel.contract.test.ts \
  tests/project/ParWorkbookArtifactBuilder.test.ts \
  tests/project/ProjectCapabilities.test.ts \
  tests/project/ProjectMaterializing.test.ts \
  tests/project/ProjectTargetResolver.test.ts \
  tests/project/StakeAdapterArtifactBuilder.test.ts \
  tests/project/TsPackageArtifactBuilder.test.ts
```

Result: exit `0`; `35 passed, 35 total` suites; `918 passed, 918 total`
tests; `0` snapshots; `82.717 s`. Jest confirmed it ran precisely these 35
paths across four projects. This covers planner/adapter equivalence, stale
provenance, lifecycle cleanup, destination-alias safety, and Studio rendering
surfaces represented by the requested files; no test path failed.

React warning report: the run emitted three `console.error` messages saying an
update to `@mantine/core/Transition` was not wrapped in `act(...)`. All three
originated while running
`tests/cli/studio-client/src/components/blueprintEditor/BlueprintEditorPage.parSheetImportExport.test.tsx`.
They were warnings only; that suite passed. No lifecycle test failure was
reported.
