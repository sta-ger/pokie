# PC-15 repaired cross-surface matrix — independent verification

Candidate: `cfa48881be8a91a623e29be67a64db451d0dbddb` (`[PC-15] avoid hashing linked package runtime`).
Run date: 2026-09-05. The checkout was clean and at that exact SHA before the run.

One sequential, in-band command ran all required files; no concurrent or duplicate Jest command was started:

```sh
npm run test:targeted -- tests/cli/ArtifactInteroperabilityTorture.integration.test.ts tests/cli/BuildProductMatrix.crossSurface.contract.test.ts tests/cli/prepare/PackageCommandRunner.test.ts tests/cli/studio/StudioArtifactInteroperabilityTorture.integration.test.ts tests/packaging/npmPackSmoke.test.ts tests/project/ArtifactConversionPlanner.test.ts tests/project/ArtifactInteroperabilityRemediation.contract.test.ts tests/scripts/check-cli-inventory.test.mjs
```

Jest exited 0: **8/8 suites passed, 112/112 tests passed, 0 snapshots, 479.81 s total**. This includes the complete `tests/cli/BuildProductMatrix.crossSurface.contract.test.ts` file.

Its data-driven `SUPPORTED_CELLS` test exercised every supported conversion through registry validation, the public `BuildCommand` CLI path, resolver readback, and `StudioBuildService`; the `tsPackage → outcomeLibrary` and `tsPackage → stakeAdapter` cells are explicitly present. The candidate's top-level Jest `testTimeout` is 60,000 ms, and the whole file passed with no timeout, proving both cells completed within their configured per-test budget.
