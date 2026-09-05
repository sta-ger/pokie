# PC-15 remaining targeted closure

Independent verifier run on 2026-09-05 against source SHA
`8990684612b9ac6fc771d0342edc6ba8f1fd480e` (Node `v24.18.0`, npm
`11.16.0`). The supplied worktree HEAD contained later source changes, so the
run used a clean detached checkout at the requested SHA, with only the existing
dependency directory linked in. No source, test, or PC-14 evidence file was
modified.

One complete sequential command was launched; no other Jest command ran while
it was alive:

```sh
npm run test:targeted -- \
  tests/cli/BuildProductMatrix.crossSurface.contract.test.ts \
  tests/cli/InitCommandWorkflow.integration.test.ts \
  tests/cli/OutcomeLibraryGenerateWorkflow.integration.test.ts \
  tests/cli/cliCommandInventory.contract.test.ts \
  tests/cli/commands/DevCommand.test.ts \
  tests/cli/commands/ExportCommand.test.ts \
  tests/cli/commands/GenerateCommand.test.ts \
  tests/cli/commands/InitCommand.test.ts \
  tests/cli/materialize/BlueprintProjectMaterializer.test.ts \
  tests/cli/materialize/RunnableArtifactMaterializer.test.ts \
  tests/cli/prepare/GamePackagePreparer.test.ts \
  tests/cli/residualPublicSurface.contract.test.ts \
  tests/cli/studio/StudioCapabilityConvergence.integration.test.ts \
  tests/cli/studio/StudioServer.test.ts \
  tests/cli/studio/outcomeLibrary/StudioOutcomeLibraryGenerateJobService.test.ts
```

The run failed in
`tests/cli/BuildProductMatrix.crossSurface.contract.test.ts`: its
`tsPackage -> outcomeLibrary` and `tsPackage -> stakeAdapter` registry/CLI/
Studio/readback cells exceeded the configured 60-second test timeout. The
remaining listed files completed green. This prevents confirmation of both
requested closure criteria on the exact candidate.
