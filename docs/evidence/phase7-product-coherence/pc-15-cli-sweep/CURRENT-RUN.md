# Current-run contract

Run the bounded whole-file closure from the repository root:

```sh
npm run test:targeted -- \
  tests/cli/PublicCliSweep.integration.test.ts \
  tests/cli/cliCommandInventory.contract.test.ts \
  tests/cli/publicCommandTree.test.ts \
  tests/cli/residualPublicSurface.contract.test.ts \
  tests/scripts/check-cli-inventory.test.mjs \
  tests/cli/ArtifactInteroperabilityTorture.integration.test.ts \
  tests/cli/BuildProductMatrix.crossSurface.contract.test.ts \
  tests/cli/OutcomeLibraryGenerateWorkflow.integration.test.ts \
  tests/cli/StudioCapabilityConvergence.integration.test.ts \
  tests/cli/studio/StudioCapabilityConvergence.integration.test.ts \
  tests/cli/commands/DevCommand.test.ts \
  tests/cli/commands/ExportCommand.test.ts \
  tests/cli/commands/GenerateCommand.test.ts \
  tests/cli/commands/StudioCommand.test.ts \
  tests/cli/materialize/BlueprintProjectMaterializer.test.ts \
  tests/cli/materialize/RunnableArtifactMaterializer.test.ts \
  tests/cli/prepare/GamePackagePreparer.test.ts \
  tests/cli/studio/StudioServer.test.ts \
  tests/cli/studio/outcomeLibrary/StudioOutcomeLibraryGenerateJobService.test.ts \
  tests/packaging/npmPackSmoke.test.ts
```

The test set is a closure, not a list of substitutes: `PublicCliSweep` verifies the complete public
tree and maintained-documentation/inventory agreement; `npmPackSmoke` performs the clean-directory
packed installation and consumes its produced artifacts; interoperability/product-matrix tests exercise
artifact provenance and safe destination behavior; command/materializer/preparer tests own diagnostics,
interruption, cleanup and recovery; and the Studio suites verify the same shared behavior through the
HTTP/API owner.

`tests/cli/StudioCapabilityConvergence.integration.test.ts` covers the public CLI-to-Studio build
boundary; `tests/cli/studio/StudioCapabilityConvergence.integration.test.ts` owns the broader Studio
service matrix.  Both run because each has a distinct caller boundary.
